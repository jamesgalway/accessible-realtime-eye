import ReplayKit
import CoreImage
import ImageIO
import Network

final class SampleHandler: RPBroadcastSampleHandler {
    private let queue = DispatchQueue(label: "huiyan.screen.broadcast")
    private var reader: ScreenBroadcastReader?
    private var connected = false
    private var sending = false
    private var lastFrame: TimeInterval = 0
    private var heartbeat: DispatchSourceTimer?
    private let context = CIContext(options: [.cacheIntermediates: false])

    override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
        let connection = NWConnection(host: "127.0.0.1", port: ScreenBroadcastWire.port, using: .tcp)
        let reader = ScreenBroadcastReader(connection)
        self.reader = reader
        reader.onPacket = { [weak self] type, data in
            guard let self else { return }
            if type == 0, let challenge = String(data: data, encoding: .utf8), let proof = ScreenBroadcastWire.proof(challenge) {
                connection.send(content: ScreenBroadcastWire.packet(1, Data(proof.utf8)), completion: .contentProcessed { _ in })
            } else if type == 1 { self.connected = true }
        }
        reader.onEnd = { [weak self] in self?.fail("请回到慧眼，重新准备屏幕共享。") }
        connection.stateUpdateHandler = { [weak self] state in
            if case .ready = state { self?.reader?.read() }
            if case .failed = state { self?.fail("请先在慧眼里准备屏幕共享，再开始广播。") }
        }
        connection.start(queue: queue)
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now() + 2, repeating: 2)
        timer.setEventHandler { [weak self] in
            guard let self, self.connected else { return }
            connection.send(content: ScreenBroadcastWire.packet(6), completion: .contentProcessed { _ in })
        }
        timer.resume(); heartbeat = timer
    }
    override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
        // App audio stays in the foreground app. The main app owns its microphone
        // and mixed AI playback; never feed video sound back as a user instruction.
        guard sampleBufferType == .video, let pixel = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        let now = ProcessInfo.processInfo.systemUptime
        queue.sync {
            guard connected, !sending, now - lastFrame >= 1 else { return }
            lastFrame = now; sending = true
            autoreleasepool {
                var image = CIImage(cvPixelBuffer: pixel)
                if let value = CMGetAttachment(sampleBuffer, key: RPVideoSampleOrientationKey as CFString, attachmentModeOut: nil) as? NSNumber,
                   let orientation = CGImagePropertyOrientation(rawValue: value.uint32Value) {
                    image = image.oriented(orientation)
                }
                let scale = min(1, 1024 / max(image.extent.width, image.extent.height))
                image = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
                guard let data = context.jpegRepresentation(of: image, colorSpace: CGColorSpaceCreateDeviceRGB(), options: [CIImageRepresentationOption(rawValue: kCGImageDestinationLossyCompressionQuality as String): 0.65]),
                      data.count < ScreenBroadcastWire.maximumPacket - 1 else { sending = false; return }
                reader?.connection.send(content: ScreenBroadcastWire.packet(2, data), completion: .contentProcessed { [weak self] error in
                    self?.sending = false
                    if error != nil { self?.fail("屏幕共享传输已中断。") }
                })
            }
        }
    }
    override func broadcastPaused() { queue.async { [weak self] in self?.sendStatus(3) } }
    override func broadcastResumed() { queue.async { [weak self] in self?.sendStatus(4) } }
    override func broadcastFinished() {
        queue.async { [weak self] in
            self?.heartbeat?.cancel(); self?.heartbeat = nil
            self?.reader?.onEnd = nil; self?.sendStatus(5)
            self?.reader?.connection.cancel(); self?.reader = nil; self?.connected = false
        }
    }
    private func sendStatus(_ type: UInt8) {
        reader?.connection.send(content: ScreenBroadcastWire.packet(type), completion: .contentProcessed { _ in })
    }
    private func fail(_ message: String) {
        connected = false; heartbeat?.cancel(); heartbeat = nil
        reader?.onEnd = nil; reader?.connection.cancel(); reader = nil
        finishBroadcastWithError(NSError(domain: "HuiyanScreenShare", code: 1, userInfo: [NSLocalizedDescriptionKey: message]))
    }
}
