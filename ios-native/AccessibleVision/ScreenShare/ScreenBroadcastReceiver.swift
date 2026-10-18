import Foundation
import Network
import UIKit

final class ScreenBroadcastReceiver {
    private var listener: NWListener?
    private var reader: ScreenBroadcastReader?
    private var challenge = ""
    private var authenticated = false
    private var timer: Timer?
    private var lastPacket = Date()
    private(set) var image: UIImage?
    private(set) var frameCount = 0
    private var lastFrame: Date?
    var frameAge: Double? { lastFrame.map { Date().timeIntervalSince($0) } }
    var onFrame: (() -> Void)?
    var onEnd: ((String) -> Void)?
    var onState: ((String, NWError?) -> Void)?

    func start() throws {
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: ScreenBroadcastWire.port)
        let listener = try NWListener(using: parameters)
        self.listener = listener
        listener.newConnectionHandler = { [weak self] connection in self?.accept(connection) }
        listener.stateUpdateHandler = { [weak self] state in
            switch state {
            case .ready: self?.onState?("listener_ready", nil)
            case .waiting(let error): self?.onState?("listener_waiting", error)
            case .failed(let error): self?.onState?("listener_failed", error)
            default: break
            }
            if case .failed = state { self?.onEnd?("屏幕共享连接未能启动，请结束后重试。") }
        }
        listener.start(queue: .main)
    }
    private func accept(_ connection: NWConnection) {
        guard reader == nil else { connection.cancel(); return }
        onState?("broadcast_connected", nil)
        challenge = UUID().uuidString + UUID().uuidString
        authenticated = false; lastPacket = Date()
        let reader = ScreenBroadcastReader(connection)
        self.reader = reader
        reader.onPacket = { [weak self, weak reader] type, payload in
            guard let self, let reader, self.reader === reader else { return }
            if !self.authenticated {
                guard type == 1, ScreenBroadcastWire.matches(payload, challenge: self.challenge) else {
                    self.onState?("broadcast_authorization_failed", nil); reader.finish(); return
                }
                self.authenticated = true; self.lastPacket = Date()
                self.onState?("broadcast_authorized", nil)
                connection.send(content: ScreenBroadcastWire.packet(1), completion: .contentProcessed { _ in })
                return
            }
            self.lastPacket = Date()
            if type == 2, let image = UIImage(data: payload) {
                self.image = image; self.frameCount += 1; self.lastFrame = Date(); self.onFrame?()
            } else if type == 3 || type == 5 {
                self.onEnd?(type == 3 ? "系统已暂停屏幕共享，请重新开始。" : "屏幕共享已结束。")
            }
        }
        reader.onEnd = { [weak self, weak reader] in
            guard let self, let reader, self.reader === reader else { return }
            let wasActive = self.authenticated
            self.onState?("broadcast_transport_closed", nil)
            self.reader = nil; self.image = nil; self.authenticated = false
            self.timer?.invalidate(); self.timer = nil
            if wasActive { self.onEnd?("屏幕共享连接已结束。") }
        }
        connection.start(queue: .main)
        connection.send(content: ScreenBroadcastWire.packet(0, Data(challenge.utf8)), completion: .contentProcessed { _ in })
        reader.read()
        timer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in
            guard let self else { return }
            if Date().timeIntervalSince(self.lastPacket) > (self.authenticated ? 15 : 5) { self.reader?.finish() }
        }
    }
    func capture(width: Double, quality: Double) -> String {
        guard let image else { return "" }
        let scale = min(1, max(1, width) / image.size.width)
        let size = CGSize(width: max(1, image.size.width * scale), height: max(1, image.size.height * scale))
        let format = UIGraphicsImageRendererFormat(); format.scale = 1; format.opaque = true
        let resized = UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        guard let data = resized.jpegData(compressionQuality: min(0.92, max(0.35, quality))) else { return "" }
        return "data:image/jpeg;base64," + data.base64EncodedString()
    }
    func stop() {
        onEnd = nil; onFrame = nil; onState = nil
        timer?.invalidate(); timer = nil
        let old = reader; reader = nil; old?.finish()
        listener?.cancel(); listener = nil; image = nil; authenticated = false
        frameCount = 0; lastFrame = nil
    }
    deinit { stop() }
}
