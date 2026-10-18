import Foundation
import WebKit
import AppKit

// This bounded connection probe reuses the production enrollment and request
// constructors. It sends no audio, images, text, or response.create events.
enum AssistantBackend: CaseIterable {
    case aliyun
    var baseURL: URL { URL(string: "https://zzy1287451073.bond")! }
}

_ = NSApplication.shared
var finished = false
var failed = false
func report(_ fields: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: fields, options: [.sortedKeys]),
       let text = String(data: data, encoding: .utf8) { print(text) }
}

Task { @MainActor in
    let base = AssistantBackend.aliyun.baseURL
    let dataStore = WKWebsiteDataStore.nonPersistent()
    do {
        let cookie = try await NativeAccessEnrollment.authorize(for: base, cookieStore: dataStore.httpCookieStore)
        let exported: [HTTPCookie] = await withCheckedContinuation { continuation in
            dataStore.httpCookieStore.getAllCookies { continuation.resume(returning: $0) }
        }
        report(["event": "enrollment", "verifiedResponseCookieCount": 1,
                "webKitExportCount": exported.count,
                "responseHttpOnly": cookie.isHTTPOnly,
                "exportedHttpOnlyCount": exported.filter { $0.isHTTPOnly }.count,
                "exportedLeadingDotCount": exported.filter { $0.domain.hasPrefix(".") }.count])
        let socketURL = URL(string: "wss://zzy1287451073.bond/api/ws?modelProfile=flash")!
        let request = ScreenShareWebSocketRequest.make(url: socketURL, baseURL: base, enrolledCookies: [cookie])
        guard request.value(forHTTPHeaderField: "Cookie") != nil else { throw URLError(.userAuthenticationRequired) }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 12
        configuration.timeoutIntervalForResource = 15
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }
        let socket = session.webSocketTask(with: request)
        defer { socket.cancel(with: .normalClosure, reason: nil) }
        socket.resume()
        do {
            let message = try await socket.receive()
            let data: Data
            switch message {
            case .string(let text): data = Data(text.utf8)
            case .data(let bytes): data = bytes
            @unknown default: throw URLError(.cannotParseResponse)
            }
            guard let body = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  body["type"] as? String == "proxy.ready"
            else { throw URLError(.cannotParseResponse) }
            report(["event": "native_websocket_ready", "model": body["model"] as? String ?? "",
                    "voice": body["voice"] as? String ?? "", "generatedResponseRequested": false])
        } catch {
            report(["event": "websocket_failed", "httpStatus": (socket.response as? HTTPURLResponse)?.statusCode ?? 0,
                    "errorCode": (error as NSError).code])
            throw error
        }
    } catch {
        report(["event": "probe_failed", "errorCode": (error as NSError).code])
        failed = true
    }
    finished = true
}
let deadline = Date().addingTimeInterval(30)
while !finished && Date() < deadline {
    _ = RunLoop.main.run(mode: .default, before: Date().addingTimeInterval(0.02))
}
if !finished { report(["event": "probe_timeout"]); exit(1) }
exit(failed ? 1 : 0)
