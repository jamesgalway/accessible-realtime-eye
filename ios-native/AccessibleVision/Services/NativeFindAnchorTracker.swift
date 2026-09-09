import ARKit
import simd

// Stationary target: LiDAR supplies its world coordinate; ARKit visual/inertial
// tracking follows the moving phone, even when the target leaves the image.
// All state is accessed on NativeCameraService's frame queue.
final class NativeFindTracker {
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
    private var seedFrameId = 0
    private var targetWorld: SIMD3<Float>?
    private weak var trackingSession: ARSession?
    private var targetAnchor: ARAnchor?
    private var armed = false
    private var lastTime: TimeInterval = 0

    func stop() {
        if let anchor = targetAnchor { trackingSession?.remove(anchor: anchor) }
        targetAnchor = nil
        token = ""; targetWorld = nil; armed = false; history.removeAll()
    }

    func command(_ body: [String: Any], session: ARSession) {
        trackingSession = session
        if body["type"] as? String == "stop" { stop(); return }
        guard let newToken = body["token"] as? String, !newToken.isEmpty else { return }
        if body["type"] as? String == "begin" { stop(); armed = true; token = newToken; return }
        guard armed, token == newToken, body["type"] as? String == "seed",
              let id = body["frameId"] as? Int, let box = body["box"] as? [Double], box.count == 4,
              box.allSatisfy({ $0.isFinite && $0 >= 0 && $0 <= 1 }),
              box[2] > 0, box[3] > 0, box[0] + box[2] <= 1, box[1] + box[3] <= 1 else { return }
        seedFrameId = id
        guard let frame = history.first(where: { $0.id == id }),
              ProcessInfo.processInfo.systemUptime - frame.time < 12 else { emitInvalid("seed_expired", lost: true); return }
        let point = CGPoint(x: box[0] + box[2]/2, y: box[1] + box[3]/2)
        guard let meters = Self.sample(frame, point: point) else { emitInvalid("seed_depth_unavailable", lost: true); return }
        let p = point.applying(frame.imageTransform)
        let k = frame.intrinsics
        let x = (Float(p.x * frame.imageSize.width) - k.columns.2.x) * meters / k.columns.0.x
        let y = -(Float(p.y * frame.imageSize.height) - k.columns.2.y) * meters / k.columns.1.y
        let world = frame.transform * SIMD4<Float>(x, y, -meters, 1)
        targetWorld = SIMD3(world.x, world.y, world.z)
        // ARKit keeps this landmark aligned when it refines its world map.
        var transform = matrix_identity_float4x4
        transform.columns.3 = world
        let anchor = ARAnchor(name: "native-find-target", transform: transform)
        targetAnchor = anchor
        session.add(anchor: anchor)
    }

    func process(_ frame: ARFrame, packet: NativeVisionFramePacket?) {
        guard armed else { return }
        let now = ProcessInfo.processInfo.systemUptime
        if let packet {
            history.append(FrameGeometry(id: packet.frameId, time: frame.timestamp,
                transform: frame.camera.transform, intrinsics: frame.camera.intrinsics,
                imageSize: frame.camera.imageResolution,
                imageTransform: frame.displayTransform(for: .portrait,
                    viewportSize: CGSize(width: packet.width, height: packet.height)).inverted(),
                grid: packet.depthGrid, columns: packet.depthGridWidth, rows: packet.depthGridHeight))
            history.removeAll { now - $0.time > 12 }
            if history.count > 40 { history.removeFirst(history.count-40) }
        }
        if let id = targetAnchor?.identifier,
           let updated = frame.anchors.first(where: { $0.identifier == id }) {
            let point = updated.transform.columns.3
            targetWorld = SIMD3(point.x, point.y, point.z)
        }
        guard let target = targetWorld, now - lastTime >= 0.10 else { return }
        lastTime = now
        guard now - frame.timestamp < 0.5 else { emitInvalid("stale_camera_frame"); return }
        guard case .normal = frame.camera.trackingState else {
            // Preserve the target through interruption; pause guidance until ARKit recovers.
            emitInvalid("camera_tracking_limited"); return
        }
        let cameraPoint = simd_inverse(frame.camera.transform) * SIMD4(target.x,target.y,target.z,1)
        let meters = simd_length(SIMD3(cameraPoint.x,cameraPoint.y,cameraPoint.z))
        guard meters.isFinite, meters > 0.10, meters < 12 else { emitInvalid("anchor_invalid"); return }
        let viewport = CGSize(width:512,height:910)
        let projected = frame.camera.projectPoint(target, orientation:.portrait, viewportSize:viewport)
        // projectPoint uses portrait screen axes, whereas raw AR camera x/y are sensor axes.
        // For targets behind the camera derive the shortest turn in portrait display space.
        let view = frame.camera.viewMatrix(for: .portrait) * SIMD4(target.x,target.y,target.z,1)
        let yaw = atan2(view.x, -view.z)
        let inFront = view.z < -0.05
        let x = inFront ? projected.x/viewport.width : (yaw >= 0 ? 1.2 : -0.2)
        let y = inFront ? projected.y/viewport.height : 0.5
        let onScreen = inFront && x >= 0 && x <= 1 && y >= 0 && y <= 1
        let captureAt = Date().timeIntervalSince1970 * 1000 - (now-frame.timestamp)*1000
        onUpdate?(["token":token,"seedFrameId":seedFrameId,"valid":true,
            "x":x,"y":y,"meters":meters,"onScreen":onScreen,
            "source":"lidar_world_anchor","at":captureAt])
    }

    private func emitInvalid(_ reason: String, lost: Bool = false) {
        guard !token.isEmpty else { return }
        onUpdate?(["token":token,"seedFrameId":seedFrameId,"valid":false,
            "lost":lost,"reason":reason,"at":Date().timeIntervalSince1970*1000])
    }

    private static func sample(_ frame: FrameGeometry, point: CGPoint) -> Float? {
        guard frame.columns > 0, frame.rows > 0, frame.grid.count == frame.columns*frame.rows else { return nil }
        let x = min(frame.columns-1, Int(point.x*CGFloat(frame.columns)))
        let y = min(frame.rows-1, Int(point.y*CGFloat(frame.rows)))
        var values: [Float] = []
        for dy in -1...1 { for dx in -1...1 {
            let px=x+dx,py=y+dy
            if px>=0 && px<frame.columns && py>=0 && py<frame.rows,
               let depth=frame.grid[py*frame.columns+px], depth.isFinite, depth>0.15,depth<8 { values.append(depth) }
        } }
        values.sort()
        guard values.count>=3 else { return nil }
        let median=values[values.count/2]
        guard values.last!-values.first! < max(0.15,median*0.2) else { return nil }
        return median
    }
}
