import AVFoundation
import WebKit

final class NativeFindBridge {
    private let origin: URL
    private let camera: NativeCameraService
    private let speech = AVSpeechSynthesizer()
    private weak var webView: WKWebView?
    private var token = ""
    private var lastSpeechAt = Date.distantPast
    private static let phrases = [
        "left": "往左一点。", "right": "往右一点。", "forward": "慢慢往前。",
        "aligned": "对准了。", "stop": "停一下。", "lost": "停一下，重新对准。",
        "aim_up": "手机抬高一点。", "aim_down": "手机放低一点。",
        "hand_left": "手往左一点。", "hand_right": "手往右一点。",
        "hand_up": "手往手机顶部方向一点。", "hand_down": "手往手机底部方向一点。",
        "hand_forward": "手慢慢向目标靠近。", "hold": "停手，正在确认。",
        "hand_missing": "请把手移到镜头里。"
    ]

    init(origin: URL, camera: NativeCameraService) {
        self.origin = origin; self.camera = camera
        // Use the existing application audio session; never reconfigure microphone routing.
        speech.usesApplicationAudioSession = true
    }

    func attach(_ webView: WKWebView) {
        self.webView = webView
        camera.setFindObserver { [weak self] payload in
            DispatchQueue.main.async {
                guard let self, payload["token"] as? String == self.token,
                      let data = try? JSONSerialization.data(withJSONObject: payload),
                      let json = String(data: data, encoding: .utf8) else { return }
                self.webView?.evaluateJavaScript("window.__nativeFindObservation?.(\(json));")
            }
        }
    }

    func stop() {
        token = ""; speech.stopSpeaking(at: .immediate)
        camera.findCommand(["type": "stop"])
    }

    func receive(_ message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame,
              message.frameInfo.securityOrigin.protocol == origin.scheme,
              message.frameInfo.securityOrigin.host == origin.host,
              (message.frameInfo.securityOrigin.port == 0 ? 443 : message.frameInfo.securityOrigin.port) == (origin.port ?? 443),
              let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        if type == "stop" { stop(); return }
        if type == "begin", let value = body["token"] as? String {
            stop(); token = value; camera.findCommand(body); return
        }
        guard !token.isEmpty, body["token"] as? String == token else { return }
        if type == "mute" { speech.stopSpeaking(at: .immediate); return }
        if type == "speak", let code = body["code"] as? String,
           let phrase = Self.phrases[code] {
            let urgent = ["stop", "lost", "hold"].contains(code)
            guard urgent || Date().timeIntervalSince(lastSpeechAt) >= 0.8 else { return }
            speech.stopSpeaking(at: .immediate)
            let utterance = AVSpeechUtterance(string: phrase)
            utterance.voice = AVSpeechSynthesisVoice(language: "zh-CN")
            utterance.rate = 0.55
            lastSpeechAt = Date(); speech.speak(utterance)
            return
        }
        if type == "seed" || type == "hand" { camera.findCommand(body) }
    }

    static var script: String {
        let sources = ["NativeFindPolicy", "NativeFindAnchorRuntime"].compactMap { name -> String? in
            guard let url = Bundle.main.url(forResource: name, withExtension: "js") else { return nil }
            return try? String(contentsOf: url, encoding: .utf8)
        }
        return sources.count == 2 ? sources.joined(separator: "\n") : ""
    }
}
