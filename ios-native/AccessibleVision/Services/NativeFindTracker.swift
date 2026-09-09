import ARKit
import CoreImage
import Vision

// All tracking state belongs to NativeCameraService's serial frame queue.
final class NativeFindTracker {
    var onUpdate: (([String: Any]) -> Void)?
    private let context = CIContext(options: [.cacheIntermediates: false])
    private var history: [(id: Int, image: CGImage, time: TimeInterval)] = []
    private var request: VNTrackObjectRequest?
    private var sequence = VNSequenceRequestHandler()
    private let hands = VNDetectHumanHandPoseRequest()
    private var token = ""
    private var handPhase = false
    private var lastTime: TimeInterval = 0
    private var lastDepth: Float?
    private var validCount = 0
    private var lastBox: CGRect?
    private var armed = false
    private var seedFrameId = 0

    init() { hands.maximumHandCount = 1 }

    func stop() {
        token = ""; request = nil; history.removeAll(); lastDepth = nil; armed = false
        lastBox = nil; validCount = 0; handPhase = false
        sequence = VNSequenceRequestHandler()
    }

    func command(_ body: [String: Any]) {
        if body["type"] as? String == "stop" { stop(); return }
        guard let newToken = body["token"] as? String, !newToken.isEmpty else { return }
        if body["type"] as? String == "begin" {
            stop(); armed = true; token = newToken; return
        }
        guard armed, token == newToken else { return }
        if body["type"] as? String == "hand" {
            if newToken == token { handPhase = true }
            return
        }
        guard body["type"] as? String == "seed",
              let id = body["frameId"] as? Int,
              let box = body["box"] as? [Double], box.count == 4,
              box.allSatisfy({ $0.isFinite && $0 >= 0 && $0 <= 1 }),
              box[2] > 0.012, box[3] > 0.012,
              box[0] + box[2] <= 1, box[1] + box[3] <= 1 else { return }
        token = newToken; request = nil; validCount = 0; lastDepth = nil; lastBox = nil
        seedFrameId = id
        handPhase = body["handPhase"] as? Bool ?? false
        guard let index = history.firstIndex(where: { $0.id == id }),
              ProcessInfo.processInfo.systemUptime - history[index].time < 7 else {
            emitLoss("seed_expired"); return
        }
        sequence = VNSequenceRequestHandler()
        let observation = VNDetectedObjectObservation(boundingBox: CGRect(
            x: box[0], y: 1 - box[1] - box[3], width: box[2], height: box[3]))
        let tracker = VNTrackObjectRequest(detectedObjectObservation: observation)
        tracker.trackingLevel = .accurate
        do {
            // Replay the exact submitted frame and subsequent retained frames, never
            // apply coordinates from an old model image directly to a new camera image.
            for item in history[index...] {
                try sequence.perform([tracker], on: item.image)
                guard let result = tracker.results?.first as? VNDetectedObjectObservation,
                      result.confidence >= 0.65 else { emitLoss("seed_replay_failed"); return }
                tracker.inputObservation = result
            }
            request = tracker
        } catch { emitLoss("seed_failed") }
    }

    func process(_ frame: ARFrame, packetId: Int?) {
        guard armed else { return }
        let now = ProcessInfo.processInfo.systemUptime
        guard packetId != nil || (request != nil && now - lastTime >= 0.10) else { return }
        lastTime = now
        guard let image = portraitImage(frame) else { emitLoss("image_unavailable"); return }
        if let id = packetId {
            history.append((id, image, now))
            history.removeAll { now - $0.time > 7 }
            if history.count > 24 { history.removeFirst(history.count - 24) }
        }
        guard let tracker = request, !token.isEmpty else { return }
        guard case .normal = frame.camera.trackingState else { emitLoss("camera_tracking_limited"); return }
        do {
            try sequence.perform([tracker], on: image)
            guard let result = tracker.results?.first as? VNDetectedObjectObservation,
                  result.confidence >= 0.65 else { emitLoss("target_lost"); return }
            let box = result.boundingBox
            guard box.minX >= 0.005, box.minY >= 0.005, box.maxX <= 0.995, box.maxY <= 0.995,
                  box.width > 0.012, box.height > 0.012 else { emitLoss("target_out_of_view"); return }
            if let old = lastBox {
                let displacement = hypot(box.midX - old.midX, box.midY - old.midY)
                let ratio = box.width * box.height / max(0.0001, old.width * old.height)
                guard displacement < 0.18, ratio > 0.45, ratio < 2.2 else {
                    emitLoss("target_jump"); return
                }
            }
            tracker.inputObservation = result; lastBox = box
            let center = CGPoint(x: box.midX, y: 1 - box.midY)
            guard let meters = depth(frame, point: center) else { emitLoss("depth_unreliable"); return }
            if let previous = lastDepth, abs(previous - meters) > max(0.20, previous * 0.25) {
                emitLoss("depth_jump"); return
            }
            lastDepth = meters; validCount += 1
            var payload: [String: Any] = [
                "token": token, "valid": validCount >= 3,
                "seedFrameId": seedFrameId,
                "x": center.x, "y": center.y, "meters": meters,
                "box": [box.minX, 1 - box.maxY, box.width, box.height],
                "confidence": result.confidence,
                "at": Date().timeIntervalSince1970 * 1000
            ]
            if handPhase || meters < 1.15 {
                try VNImageRequestHandler(cgImage: image).perform([hands])
                if let hand = hands.results?.first {
                    let points = try hand.recognizedPoints(.all)
                    let tips = [VNHumanHandPoseObservation.JointName.indexTip, .middleTip, .thumbTip]
                        .compactMap { points[$0] }.filter { $0.confidence >= 0.65 }
                    if let tip = tips.min(by: {
                        hypot($0.location.x - box.midX, $0.location.y - box.midY)
                            < hypot($1.location.x - box.midX, $1.location.y - box.midY)
                    }) {
                        let point = CGPoint(x: tip.location.x, y: 1 - tip.location.y)
                        payload["handX"] = point.x; payload["handY"] = point.y
                        if let handMeters = depth(frame, point: point) { payload["handMeters"] = handMeters }
                    }
                }
            }
            onUpdate?(payload)
        } catch { emitLoss("vision_error") }
    }

    private func emitLoss(_ reason: String) {
        request = nil; validCount = 0; lastDepth = nil; lastBox = nil
        guard !token.isEmpty else { return }
        onUpdate?(["token": token, "valid": false, "lost": true, "reason": reason,
                   "seedFrameId": seedFrameId,
                   "at": Date().timeIntervalSince1970 * 1000])
    }

    private func portraitImage(_ frame: ARFrame) -> CGImage? {
        let portrait = CIImage(cvPixelBuffer: frame.capturedImage).oriented(.right)
        let width = min(portrait.extent.width, portrait.extent.height * 9 / 16)
        let rect = CGRect(x: portrait.extent.midX - width / 2, y: portrait.extent.minY,
                          width: width, height: portrait.extent.height).integral
        let resized = portrait.cropped(to: rect)
            .transformed(by: CGAffineTransform(translationX: -rect.minX, y: -rect.minY))
            .transformed(by: CGAffineTransform(scaleX: 512 / rect.width, y: 512 / rect.width))
        return context.createCGImage(resized, from: resized.extent)
    }

    private func depth(_ frame: ARFrame, point: CGPoint) -> Float? {
        guard let data = frame.sceneDepth ?? frame.smoothedSceneDepth,
              let confidence = data.confidenceMap else { return nil }
        let p = point.applying(frame.displayTransform(for: .portrait,
                            viewportSize: CGSize(width: 512, height: 910)).inverted())
        guard p.x > 0, p.x < 1, p.y > 0, p.y < 1 else { return nil }
        let map = data.depthMap
        CVPixelBufferLockBaseAddress(map, .readOnly)
        CVPixelBufferLockBaseAddress(confidence, .readOnly)
        defer {
            CVPixelBufferUnlockBaseAddress(map, .readOnly)
            CVPixelBufferUnlockBaseAddress(confidence, .readOnly)
        }
        guard let base = CVPixelBufferGetBaseAddress(map),
              let confidenceBase = CVPixelBufferGetBaseAddress(confidence) else { return nil }
        let width = CVPixelBufferGetWidth(map), height = CVPixelBufferGetHeight(map)
        let stride = CVPixelBufferGetBytesPerRow(map) / MemoryLayout<Float>.stride
        let confidenceStride = CVPixelBufferGetBytesPerRow(confidence)
        let values = base.assumingMemoryBound(to: Float.self)
        let reliability = confidenceBase.assumingMemoryBound(to: UInt8.self)
        let x = Int(p.x * CGFloat(width - 1)), y = Int(p.y * CGFloat(height - 1))
        var samples: [Float] = []
        for dy in -1...1 { for dx in -1...1 {
            let px = x + dx, py = y + dy
            if px >= 0 && px < width && py >= 0 && py < height && reliability[py * confidenceStride + px] >= 1 {
                let value = values[py * stride + px]
                if value.isFinite && value > 0.15 && value < 6 { samples.append(value) }
            }
        } }
        samples.sort()
        guard samples.count >= 5 else { return nil }
        let median = samples[samples.count / 2]
        guard samples.last! - samples.first! < max(0.10, median * 0.15) else { return nil }
        return median
    }
}
