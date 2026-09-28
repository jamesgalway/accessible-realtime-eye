import ARKit
import simd

// Teaching-only copy of the proven find-object world-anchor geometry.
// This tracker has its own class, ARAnchor name and lifecycle bindings. It is
// connected through a separate teaching bridge and remains dormant until a
// teaching task explicitly arms it. It reports geometry only; it does not
// create a reminder contract or infer whether a real object moved.
final class TeachingViewpointAnchorTracker {
    var onUpdate: (([String: Any]) -> Void)?

    private struct FrameGeometry {
        let id: Int
        let time: TimeInterval
        let transform: simd_float4x4
        let intrinsics: simd_float3x3
        let imageSize: CGSize
        let imageTransform: CGAffineTransform
        let grid: [Float?]
        let columns: Int
        let rows: Int
    }

    private var history: [FrameGeometry] = []
    private var token = ""
    private var sessionId = ""
    private var taskBatchId = ""
    private var viewpointPlanId = ""
    private var seedFrameId = 0
    private var referenceWorld: SIMD3<Float>?
    private weak var trackingSession: ARSession?
    private var referenceAnchor: ARAnchor?
    private var armed = false
    private var lastTime: TimeInterval = 0
    private var viewportSize = CGSize(width: 3, height: 4)

    func stop() {
        if let anchor = referenceAnchor {
            trackingSession?.remove(anchor: anchor)
        }
        referenceAnchor = nil
        token = ""
        sessionId = ""
        taskBatchId = ""
        viewpointPlanId = ""
        seedFrameId = 0
        referenceWorld = nil
        armed = false
        lastTime = 0
        history.removeAll()
    }

    func command(_ body: [String: Any], session: ARSession) {
        trackingSession = session
        if body["type"] as? String == "stop" {
            stop()
            return
        }
        guard let newToken = body["token"] as? String, !newToken.isEmpty else {
            return
        }
        if body["type"] as? String == "begin" {
            guard let newSessionId = body["sessionId"] as? String, !newSessionId.isEmpty,
                  let newTaskBatchId = body["taskBatchId"] as? String, !newTaskBatchId.isEmpty,
                  let newViewpointPlanId = body["viewpointPlanId"] as? String, !newViewpointPlanId.isEmpty else {
                return
            }
            stop()
            armed = true
            token = newToken
            sessionId = newSessionId
            taskBatchId = newTaskBatchId
            viewpointPlanId = newViewpointPlanId
            return
        }
        guard armed,
              token == newToken,
              body["sessionId"] as? String == sessionId,
              body["taskBatchId"] as? String == taskBatchId,
              body["viewpointPlanId"] as? String == viewpointPlanId,
              body["type"] as? String == "seed",
              let id = body["frameId"] as? Int,
              let box = body["box"] as? [Double],
              box.count == 4,
              box.allSatisfy({ $0.isFinite && $0 >= 0 && $0 <= 1 }),
              box[2] > 0,
              box[3] > 0,
              box[0] + box[2] <= 1,
              box[1] + box[3] <= 1 else {
            return
        }
        guard referenceAnchor == nil else { return }
        seedFrameId = id
        guard let frame = history.first(where: { $0.id == id }),
              ProcessInfo.processInfo.systemUptime - frame.time < 90 else {
            emitInvalid("seed_expired", lost: true)
            return
        }
        let point = CGPoint(x: box[0] + box[2] / 2, y: box[1] + box[3] / 2)
        guard let meters = Self.sample(frame, point: point) else {
            emitInvalid("seed_depth_unavailable", lost: true)
            return
        }
        let imagePoint = point.applying(frame.imageTransform)
        let intrinsics = frame.intrinsics
        let x = (Float(imagePoint.x * frame.imageSize.width) - intrinsics.columns.2.x)
            * meters / intrinsics.columns.0.x
        let y = -(Float(imagePoint.y * frame.imageSize.height) - intrinsics.columns.2.y)
            * meters / intrinsics.columns.1.y
        let world = frame.transform * SIMD4<Float>(x, y, -meters, 1)
        referenceWorld = SIMD3(world.x, world.y, world.z)

        var transform = matrix_identity_float4x4
        transform.columns.3 = world
        let anchor = ARAnchor(name: "teaching-viewpoint-reference", transform: transform)
        referenceAnchor = anchor
        session.add(anchor: anchor)
        let cameraTransform = frame.transform
        let seedCapturedAt = Date().timeIntervalSince1970 * 1000
            - (ProcessInfo.processInfo.systemUptime - frame.time) * 1000
        emit([
            "valid": false,
            "anchorReady": true,
            "reason": "anchor_created",
            "lost": false,
            "seedCameraWorld": [
                cameraTransform.columns.3.x,
                cameraTransform.columns.3.y,
                cameraTransform.columns.3.z
            ],
            "seedCameraForward": [
                -cameraTransform.columns.2.x,
                -cameraTransform.columns.2.y,
                -cameraTransform.columns.2.z
            ],
            "seedCameraUp": [
                cameraTransform.columns.1.x,
                cameraTransform.columns.1.y,
                cameraTransform.columns.1.z
            ],
            "seedMeters": meters,
            "seedProjectionX": point.x,
            "seedProjectionY": point.y,
            "seedCapturedAt": seedCapturedAt
        ])
    }

    func process(_ frame: ARFrame, packet: NativeVisionFramePacket?) {
        guard armed else { return }
        let now = ProcessInfo.processInfo.systemUptime
        if let packet {
            let packetViewport = CGSize(width: packet.width, height: packet.height)
            viewportSize = packetViewport
            history.append(FrameGeometry(
                id: packet.frameId,
                time: frame.timestamp,
                transform: frame.camera.transform,
                intrinsics: frame.camera.intrinsics,
                imageSize: frame.camera.imageResolution,
                imageTransform: NativePortraitGeometry.imageToPortraitTransform(
                    imageSize: frame.camera.imageResolution,
                    viewportSize: packetViewport
                ).inverted(),
                grid: packet.depthGrid,
                columns: packet.depthGridWidth,
                rows: packet.depthGridHeight
            ))
            history.removeAll { now - $0.time > 90 }
            if history.count > 320 {
                history.removeFirst(history.count - 320)
            }
        }
        if let id = referenceAnchor?.identifier,
           let updated = frame.anchors.first(where: { $0.identifier == id }) {
            let point = updated.transform.columns.3
            referenceWorld = SIMD3(point.x, point.y, point.z)
        }
        guard let reference = referenceWorld, now - lastTime >= 0.10 else {
            return
        }
        lastTime = now
        guard now - frame.timestamp < 0.5 else {
            emitInvalid("stale_camera_frame")
            return
        }
        guard case .normal = frame.camera.trackingState else {
            emitInvalid("camera_tracking_limited")
            return
        }

        let cameraPoint = simd_inverse(frame.camera.transform)
            * SIMD4<Float>(reference.x, reference.y, reference.z, 1)
        let meters = simd_length(SIMD3(cameraPoint.x, cameraPoint.y, cameraPoint.z))
        guard meters.isFinite, meters > 0.10, meters < 12 else {
            emitInvalid("anchor_invalid")
            return
        }
        let view = frame.camera.viewMatrix(for: .portrait)
            * SIMD4<Float>(reference.x, reference.y, reference.z, 1)
        let yaw = atan2(view.x, -view.z)
        let inFront = cameraPoint.z < -0.05
        let depth = -cameraPoint.z
        let imageSize = frame.camera.imageResolution
        let intrinsics = frame.camera.intrinsics
        let rawPoint = CGPoint(
            x: CGFloat((intrinsics.columns.0.x * cameraPoint.x / depth + intrinsics.columns.2.x)
                / Float(imageSize.width)),
            y: CGFloat((intrinsics.columns.2.y - intrinsics.columns.1.y * cameraPoint.y / depth)
                / Float(imageSize.height))
        )
        let portraitPoint = rawPoint.applying(NativePortraitGeometry.imageToPortraitTransform(
            imageSize: imageSize,
            viewportSize: viewportSize
        ))
        let projectedX = inFront ? portraitPoint.x : (yaw >= 0 ? 1.2 : -0.2)
        let projectedY = inFront ? portraitPoint.y : 0.5
        let onScreen = inFront
            && projectedX >= 0 && projectedX <= 1
            && projectedY >= 0 && projectedY <= 1
        let capturedAt = Date().timeIntervalSince1970 * 1000
            - (now - frame.timestamp) * 1000
        let cameraTransform = frame.camera.transform
        let cameraForward = [
            -cameraTransform.columns.2.x,
            -cameraTransform.columns.2.y,
            -cameraTransform.columns.2.z
        ]
        let cameraUp = [
            cameraTransform.columns.1.x,
            cameraTransform.columns.1.y,
            cameraTransform.columns.1.z
        ]
        emit([
            "valid": true,
            "x": projectedX,
            "y": projectedY,
            "meters": meters,
            "onScreen": onScreen,
            "inFront": inFront,
            "referenceWorld": [reference.x, reference.y, reference.z],
            "cameraWorld": [
                cameraTransform.columns.3.x,
                cameraTransform.columns.3.y,
                cameraTransform.columns.3.z
            ],
            "cameraForward": cameraForward,
            "cameraUp": cameraUp,
            "source": "teaching_viewpoint_world_anchor",
            "at": capturedAt
        ])
    }

    private func emitInvalid(_ reason: String, lost: Bool = false) {
        guard !token.isEmpty else { return }
        emit([
            "valid": false,
            "lost": lost,
            "reason": reason,
            "at": Date().timeIntervalSince1970 * 1000
        ])
    }

    private func emit(_ data: [String: Any]) {
        guard !token.isEmpty else { return }
        var event = data
        event["token"] = token
        event["sessionId"] = sessionId
        event["taskBatchId"] = taskBatchId
        event["viewpointPlanId"] = viewpointPlanId
        event["seedFrameId"] = seedFrameId
        onUpdate?(event)
    }

    private static func sample(_ frame: FrameGeometry, point: CGPoint) -> Float? {
        guard frame.columns > 0,
              frame.rows > 0,
              frame.grid.count == frame.columns * frame.rows else {
            return nil
        }
        let x = min(frame.columns - 1, Int(point.x * CGFloat(frame.columns)))
        let y = min(frame.rows - 1, Int(point.y * CGFloat(frame.rows)))
        var values: [Float] = []
        for deltaY in -1...1 {
            for deltaX in -1...1 {
                let sampleX = x + deltaX
                let sampleY = y + deltaY
                if sampleX >= 0,
                   sampleX < frame.columns,
                   sampleY >= 0,
                   sampleY < frame.rows,
                   let depth = frame.grid[sampleY * frame.columns + sampleX],
                   depth.isFinite,
                   depth > 0.15,
                   depth < 8 {
                    values.append(depth)
                }
            }
        }
        values.sort()
        guard values.count >= 3 else { return nil }
        let median = values[values.count / 2]
        guard values.last! - values.first! < max(0.15, median * 0.2) else {
            return nil
        }
        return median
    }
}
