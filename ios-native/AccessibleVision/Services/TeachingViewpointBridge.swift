import WebKit

final class TeachingViewpointBridge {
    private let origin: URL
    private let camera: NativeCameraService
    private weak var webView: WKWebView?
    private var token = ""
    private var sessionId = ""
    private var taskBatchId = ""
    private var viewpointPlanId = ""

    init(origin: URL, camera: NativeCameraService) {
        self.origin = origin
        self.camera = camera
    }

    func attach(_ webView: WKWebView) {
        self.webView = webView
        camera.setTeachingViewpointObserver { [weak self] payload in
            DispatchQueue.main.async {
                guard let self,
                      payload["token"] as? String == self.token,
                      payload["sessionId"] as? String == self.sessionId,
                      payload["taskBatchId"] as? String == self.taskBatchId,
                      payload["viewpointPlanId"] as? String == self.viewpointPlanId,
                      let data = try? JSONSerialization.data(withJSONObject: payload),
                      let json = String(data: data, encoding: .utf8) else {
                    return
                }
                self.webView?.evaluateJavaScript("window.__teachingViewpointObservation?.(\(json));")
            }
        }
    }

    func stop() {
        token = ""
        sessionId = ""
        taskBatchId = ""
        viewpointPlanId = ""
        camera.teachingViewpointCommand(["type": "stop"])
    }

    func receive(_ message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame,
              message.frameInfo.securityOrigin.protocol == origin.scheme,
              message.frameInfo.securityOrigin.host == origin.host,
              (message.frameInfo.securityOrigin.port == 0 ? 443 : message.frameInfo.securityOrigin.port)
                == (origin.port ?? 443),
              let body = message.body as? [String: Any],
              let type = body["type"] as? String else {
            return
        }
        if type == "stop" {
            stop()
            return
        }
        if type == "begin",
           let newToken = body["token"] as? String, !newToken.isEmpty,
           let newSessionId = body["sessionId"] as? String, !newSessionId.isEmpty,
           let newTaskBatchId = body["taskBatchId"] as? String, !newTaskBatchId.isEmpty,
           let newViewpointPlanId = body["viewpointPlanId"] as? String, !newViewpointPlanId.isEmpty {
            stop()
            token = newToken
            sessionId = newSessionId
            taskBatchId = newTaskBatchId
            viewpointPlanId = newViewpointPlanId
            camera.teachingViewpointCommand(body)
            return
        }
        guard !token.isEmpty,
              body["token"] as? String == token,
              body["sessionId"] as? String == sessionId,
              body["taskBatchId"] as? String == taskBatchId,
              body["viewpointPlanId"] as? String == viewpointPlanId else {
            return
        }
        if type == "seed" {
            camera.teachingViewpointCommand(body)
        }
    }

    static var script: String {
        guard let url = Bundle.main.url(forResource: "TeachingViewpointRuntime", withExtension: "js") else {
            return ""
        }
        return (try? String(contentsOf: url, encoding: .utf8)) ?? ""
    }
}
