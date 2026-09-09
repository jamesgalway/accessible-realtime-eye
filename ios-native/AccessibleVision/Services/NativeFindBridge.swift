import WebKit

final class NativeFindBridge {
    private let origin: URL
    private let camera: NativeCameraService
    private weak var webView: WKWebView?
    private var token = ""

    init(origin: URL, camera: NativeCameraService) {
        self.origin = origin; self.camera = camera
        // Geometry only: the original model voice owns all audio playback.
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
        token = ""
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
        if type == "seed" { camera.findCommand(body) }
    }

    static var script: String {
        let sources = ["NativeFindPolicy", "NativeFindAnchorRuntime"].compactMap { name -> String? in
            guard let url = Bundle.main.url(forResource: name, withExtension: "js") else { return nil }
            return try? String(contentsOf: url, encoding: .utf8)
        }
        return sources.count == 2 ? sources.joined(separator: "\n") : ""
    }
}
