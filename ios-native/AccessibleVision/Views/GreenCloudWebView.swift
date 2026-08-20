import AVFoundation
import SwiftUI
import WebKit

struct GreenCloudWebView: UIViewRepresentable {
    let url: URL
    let backend: AssistantBackend
    let camera: NativeCameraService
    let onMediaCaptureRequested: () -> Void
    let onMediaCaptureReleased: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(
            camera: camera,
            onMediaCaptureRequested: onMediaCaptureRequested,
            onMediaCaptureReleased: onMediaCaptureReleased
        )
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.websiteDataStore = .default()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.userContentController.addUserScript(WKUserScript(
            source: "window.__ACCESSIBLE_VISION_BACKEND__ = '\(backend.rawValue)';",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))
        configuration.userContentController.addUserScript(WKUserScript(
            source: NativeVisionBridgeScript.source,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))
        configuration.userContentController.add(context.coordinator, name: "nativeVision")

        let webView = WKWebView(frame: .zero, configuration: configuration)
        context.coordinator.attach(to: webView)
        webView.uiDelegate = context.coordinator
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.load(URLRequest(url: url, cachePolicy: .reloadRevalidatingCacheData))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.attach(to: webView)
    }

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        coordinator.releaseMediaResources(in: webView)
        coordinator.detach()
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "nativeVision")
    }

    final class Coordinator: NSObject, WKUIDelegate, WKNavigationDelegate, WKScriptMessageHandler {
        private let camera: NativeCameraService
        private let onMediaCaptureRequested: () -> Void
        private let onMediaCaptureReleased: () -> Void
        private weak var webView: WKWebView?
        private var webReady = false
        private var latestPacket: NativeVisionFramePacket?

        init(
            camera: NativeCameraService,
            onMediaCaptureRequested: @escaping () -> Void,
            onMediaCaptureReleased: @escaping () -> Void
        ) {
            self.camera = camera
            self.onMediaCaptureRequested = onMediaCaptureRequested
            self.onMediaCaptureReleased = onMediaCaptureReleased
        }

        func attach(to webView: WKWebView) {
            self.webView = webView
            camera.onFramePacket = { [weak self] packet in
                DispatchQueue.main.async {
                    self?.receive(packet)
                }
            }
        }

        func detach() {
            camera.onFramePacket = nil
            webView = nil
            webReady = false
            latestPacket = nil
        }

        func releaseMediaResources(in webView: WKWebView) {
            onMediaCaptureReleased()
            webView.pauseAllMediaPlayback {}
            webView.evaluateJavaScript("""
                window.__accessibleVisionReleaseMedia?.();
                document.querySelectorAll('video, audio').forEach((element) => {
                  element.srcObject?.getTracks?.().forEach((track) => track.stop());
                  element.srcObject = null;
                  element.pause?.();
                });
                """) { _, _ in
                webView.stopLoading()
                webView.loadHTMLString("", baseURL: nil)
            }
        }

        func webView(
            _ webView: WKWebView,
            requestMediaCapturePermissionFor origin: WKSecurityOrigin,
            initiatedByFrame frame: WKFrameInfo,
            type: WKMediaCaptureType,
            decisionHandler: @escaping (WKPermissionDecision) -> Void
        ) {
            decisionHandler(.grant)
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            webReady = false
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            webReady = true
            webView.evaluateJavaScript("""
                window.__ACCESSIBLE_VISION_NATIVE_IOS__ = true;
                window.__accessibleVisionEnableRuntimeHooks?.();
                """)
            if let latestPacket {
                deliver(latestPacket, to: webView)
            }
        }

        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            guard message.name == "nativeVision" else { return }
            let body = message.body as? [String: Any]
            let type = String(body?["type"] as? String ?? "")
            if type == "requestNativeMediaStart" {
                onMediaCaptureRequested()
            } else if type == "nativeMediaReleased" {
                onMediaCaptureReleased()
            } else if type == "fallbackWebCamera" {
                camera.stop()
            }
        }

        private func receive(_ packet: NativeVisionFramePacket) {
            latestPacket = packet
            guard webReady, let webView else { return }
            deliver(packet, to: webView)
        }

        private func deliver(_ packet: NativeVisionFramePacket, to webView: WKWebView) {
            guard
                let data = try? JSONEncoder().encode(packet),
                let json = String(data: data, encoding: .utf8)
            else {
                return
            }
            webView.evaluateJavaScript("window.__accessibleVisionReceiveFrame?.(\(json));")
        }
    }
}
