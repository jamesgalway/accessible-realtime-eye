import Foundation
import JavaScriptCore
import WebKit
import Security
import UIKit

enum ScreenShareGoogleRoute: String {
    case direct, relay
}

final class ScreenShareRuntime: NSObject, URLSessionWebSocketDelegate {
    private var context: JSContext?
    private var network: URLSession?
    private var baseURL: URL?
    private var enrolledCookies: [HTTPCookie] = []
    private var timers: [Int: Timer] = [:]
    private var requests: [Int: URLSessionDataTask] = [:]
    private var sockets: [Int: URLSessionWebSocketTask] = [:]
    private var generation = UUID()
    private let startupID = UUID().uuidString
    private var startupBackend = ""
    private var startupRoute = ""
    private var stopRecorded = false
    let receiver = ScreenBroadcastReceiver()
    let audio = ScreenShareAudio()
    var onError: ((String) -> Void)?

    @MainActor
    func load(backend: AssistantBackend, googleRoute: ScreenShareGoogleRoute) async throws {
        startupBackend = backend == .aliyun ? "aliyun" : "greencloud"
        startupRoute = backend == .aliyun ? "aliyun-video" : googleRoute.rawValue
        recordStartup("authorization_started")
        let ticket = generation
        let dataStore = WKWebsiteDataStore.nonPersistent()
        let cookie = try await NativeAccessEnrollment.authorize(for: backend.baseURL, cookieStore: dataStore.httpCookieStore)
        let cookies = [cookie]
        try Task.checkCancellation()
        guard ticket == generation else { throw CancellationError() }
        recordStartup("authorization_ready")
        baseURL = backend.baseURL
        enrolledCookies = cookies
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 65
        config.timeoutIntervalForResource = 90
        cookies.forEach { config.httpCookieStorage?.setCookie($0) }
        network = URLSession(configuration: config, delegate: self, delegateQueue: .main)
        guard let context = JSContext() else { throw URLError(.cannotCreateFile) }
        self.context = context
        context.exceptionHandler = { [weak self] _, _ in self?.onError?("屏幕共享运行出现错误，请结束后重试。") }
        let bridge: @convention(block) (String) -> String = { [weak self] message in
            guard let self, let data = message.data(using: .utf8),
                  let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            else { return "null" }
            return Self.json(self.dispatch(object))
        }
        context.setObject(bridge, forKeyedSubscript: "_screenHost" as NSString)
        context.setObject(backend.baseURL.absoluteString, forKeyedSubscript: "__screenBaseURL" as NSString)
        context.setObject(backend == .aliyun ? "aliyun" : "greencloud", forKeyedSubscript: "__screenBackend" as NSString)
        context.setObject(googleRoute.rawValue, forKeyedSubscript: "__screenGoogleRoute" as NSString)
        context.setObject(startupID, forKeyedSubscript: "__screenStartupID" as NSString)
        for name in ["ScreenRuntimeEnvironment", "screen-google-sdk", backend == .aliyun ? "aliyun-screen-runtime" : "greencloud-screen-runtime"] {
            guard let url = Bundle.main.url(forResource: name, withExtension: "js") else { throw URLError(.fileDoesNotExist) }
            context.evaluateScript(try String(contentsOf: url, encoding: .utf8), withSourceURL: URL(string: "huiyan-resource:///" + name + ".js"))
            guard context.exception == nil else { throw URLError(.cannotParseResponse) }
        }
        audio.onInput = { [weak self] data in self?.event(["kind": "pcm", "data": data.base64EncodedString()]) }
        audio.onPlayed = { [weak self] id in self?.event(["kind": "audioEnded", "id": id]) }
        audio.onSpeech = { [weak self] id, type in self?.event(["kind": "speech", "id": id, "type": type]) }
        recordStartup("runtime_loaded")
        uploadStartupHistory()
    }

    // Store only lifecycle facts. A later successful preparation can report an
    // earlier attempt that failed before JavaScript or model logging existed.
    func recordStartup(_ phase: String, details: [String: Any] = [:]) {
        let packet = details.merging([
            "screenSessionID": startupID, "phase": phase,
            "backend": startupBackend, "route": startupRoute,
            "atMs": Date().timeIntervalSince1970 * 1000,
            "uptimeMs": ProcessInfo.processInfo.systemUptime * 1000
        ]) { _, new in new }
        var history = Self.readStartupHistory()
        history.append(packet)
        if let url = Self.startupHistoryURL(),
           let data = try? JSONSerialization.data(withJSONObject: Array(history.suffix(64))) {
            try? data.write(to: url, options: .atomic)
        }
        if let logger = context?.objectForKeyedSubscript("logClientEvent"), !logger.isUndefined, !logger.isNull {
            logger.call(withArguments: ["screen_share.startup", packet])
        }
    }

    private static func startupHistoryURL() -> URL? {
        guard let directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return nil }
        do { try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true) }
        catch { return nil }
        return directory.appendingPathComponent("screen-share-startup.json")
    }

    private static func readStartupHistory() -> [[String: Any]] {
        guard let url = startupHistoryURL(), let data = try? Data(contentsOf: url), data.count <= 100_000,
              let records = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return [] }
        return records
    }

    private func uploadStartupHistory() {
        var records = Array(Self.readStartupHistory().suffix(24))
        var encoded = Self.json(records)
        while encoded.count > 7500 && records.count > 1 {
            records.removeFirst(); encoded = Self.json(records)
        }
        var packet: [String: Any] = ["screenSessionID": startupID, "records": records.count]
        var tail = encoded[...], index = 0
        // The existing server logger preserves each string field up to 600
        // characters; bounded parts retain the complete history without a new API.
        while !tail.isEmpty {
            let part = tail.prefix(500)
            packet["part\(index)"] = String(part)
            tail = tail.dropFirst(part.count); index += 1
        }
        packet["partCount"] = index
        if let logger = context?.objectForKeyedSubscript("logClientEvent"), !logger.isUndefined, !logger.isNull {
            logger.call(withArguments: ["screen_share.startup_history", packet])
        }
    }

    func command(_ command: String, text: String = "") {
        context?.objectForKeyedSubscript("__screenCommand")?.call(withArguments: [command, text])
    }
    func snapshot() -> [String: Any] {
        context?.objectForKeyedSubscript("__screenSnapshot")?.call(withArguments: [])?.toDictionary() as? [String: Any] ?? [:]
    }
    private static func json(_ value: Any?) -> String {
        guard let value, let data = try? JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed]),
              let text = String(data: data, encoding: .utf8) else { return "null" }
        return text
    }
    private func event(_ value: [String: Any]) {
        context?.objectForKeyedSubscript("__screenEvent")?.call(withArguments: [value])
    }
    private func dispatch(_ message: [String: Any]) -> Any? {
        let id = message["id"] as? Int ?? 0
        switch message["op"] as? String {
        case "clock": return ProcessInfo.processInfo.systemUptime
        case "uuid": return UUID().uuidString
        case "random":
            var bytes = [UInt8](repeating: 0, count: min(65536, max(0, message["length"] as? Int ?? 0)))
            _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
            return bytes
        case "hasFrame": return receiver.image != nil
        case "frameSize": return ["width": receiver.image?.size.width ?? 0, "height": receiver.image?.size.height ?? 0]
        case "diagnostics":
            var result = audio.diagnostics
            result["frameCount"] = receiver.frameCount
            result["frameAgeSeconds"] = receiver.frameAge
            result["applicationState"] = UIApplication.shared.applicationState.rawValue
            return result
        case "capture": return receiver.capture(width: message["width"] as? Double ?? 320, quality: message["quality"] as? Double ?? 0.45)
        case "encodeBase64":
            guard let text = message["value"] as? String else { return "" }
            return Data(text.utf16.map { UInt8(truncatingIfNeeded: $0) }).base64EncodedString()
        case "decodeBase64":
            guard let value = message["value"] as? String, let data = Data(base64Encoded: value) else { return "" }
            return String(String.UnicodeScalarView(data.map { UnicodeScalar($0) }))
        case "utf8Encode": return Array(Data((message["value"] as? String ?? "").utf8))
        case "utf8Decode": return String(data: Data(message["value"] as? [UInt8] ?? []), encoding: .utf8) ?? ""
        case "url":
            let reference = URL(string: message["base"] as? String ?? "")
            guard let url = URL(string: message["value"] as? String ?? "", relativeTo: reference)?.absoluteURL,
                  let parts = URLComponents(url: url, resolvingAgainstBaseURL: true), let scheme = parts.scheme, let host = parts.host else { return nil }
            return ["protocol": scheme + ":", "host": host + (parts.port.map { ":\($0)" } ?? ""), "hostname": host,
                    "pathname": parts.percentEncodedPath.isEmpty ? "/" : parts.percentEncodedPath,
                    "search": parts.percentEncodedQuery.map { "?" + $0 } ?? "", "hash": parts.percentEncodedFragment.map { "#" + $0 } ?? ""]
        case "timer":
            let repeatTimer = message["repeat"] as? Bool ?? false
            let timer = Timer(timeInterval: max(0.001, (message["ms"] as? Double ?? 0) / 1000), repeats: repeatTimer) { [weak self] _ in
                guard let self else { return }
                if !repeatTimer { self.timers.removeValue(forKey: id) }
                self.event(["kind": "timer", "id": id])
            }
            timers[id] = timer; RunLoop.main.add(timer, forMode: .common)
        case "cancelTimer": timers.removeValue(forKey: id)?.invalidate()
        case "fetch": fetch(message)
        case "cancelFetch": requests.removeValue(forKey: id)?.cancel()
        case "socket": openSocket(message)
        case "socketSend": sockets[id]?.send(.string(message["data"] as? String ?? "")) { [weak self] error in
            guard error != nil else { return }
            DispatchQueue.main.async { self?.event(["kind": "socket", "id": id, "type": "error", "message": "实时发送失败"]) }
        }
        case "socketClose":
            sockets.removeValue(forKey: id)?.cancel(with: .normalClosure, reason: nil)
            // As in a browser, close is asynchronous and cannot re-enter stopRealtime.
            DispatchQueue.main.async { [weak self] in self?.event(["kind": "socket", "id": id, "type": "close", "code": 1000]) }
        case "audio":
            if let encoded = message["data"] as? String, let data = Data(base64Encoded: encoded) {
                audio.enqueue(id: id, context: message["context"] as? Int ?? 0, data: data,
                    rate: message["rate"] as? Double ?? 24000, delay: message["delay"] as? Double ?? 0)
            }
        case "audioReset": audio.reset(context: message["context"] as? Int ?? 0)
        case "speech": audio.speak(id: id, text: message["text"] as? String ?? "", rate: message["rate"] as? Float ?? 0.95)
        case "speechCancel": audio.cancelSpeech()
        case "status": if let error = message["error"] as? String { onError?(error) }
        default: break
        }
        return nil
    }
    private func trustedURL(_ raw: String, socket: Bool = false) -> URL? {
        guard let baseURL, let url = URL(string: raw, relativeTo: baseURL)?.absoluteURL,
              url.scheme == (socket ? "wss" : "https"),
              url.user == nil, url.password == nil else { return nil }
        if url.host == baseURL.host && url.port == baseURL.port { return url }
        if url.host == "generativelanguage.googleapis.com" && (url.port == nil || url.port == 443) { return url }
        return nil
    }
    private func fetch(_ message: [String: Any]) {
        let id = message["id"] as? Int ?? 0, ticket = generation
        guard let network, requests.count < 64, let url = trustedURL(message["url"] as? String ?? "") else {
            event(["kind": "fetch", "id": id, "error": "请求地址不可用"]); return
        }
        var request = URLRequest(url: url)
        request.httpMethod = message["method"] as? String ?? "GET"
        for (name, value) in message["headers"] as? [String: String] ?? [:] {
            if !["cookie", "host", "connection"].contains(name.lowercased()) { request.setValue(value, forHTTPHeaderField: name) }
        }
        if let body = message["body"] as? String { request.httpBody = body.data(using: .utf8) }
        let task = network.dataTask(with: request) { [weak self] data, response, error in
            DispatchQueue.main.async {
                guard let self, self.generation == ticket, self.requests.removeValue(forKey: id) != nil else { return }
                guard error == nil, let http = response as? HTTPURLResponse, let data, data.count <= 8_000_000 else {
                    self.event(["kind": "fetch", "id": id, "error": "网络请求失败或超时"]); return
                }
                var headers: [String: String] = [:]
                for (key, value) in http.allHeaderFields { headers[String(describing: key)] = String(describing: value) }
                self.event(["kind": "fetch", "id": id, "status": http.statusCode,
                    "body": String(data: data, encoding: .utf8) ?? "", "headers": headers])
            }
        }
        requests[id] = task; task.resume()
    }
    private func openSocket(_ message: [String: Any]) {
        let id = message["id"] as? Int ?? 0
        guard let network, sockets.count < 8, let url = trustedURL(message["url"] as? String ?? "", socket: true) else {
            event(["kind": "socket", "id": id, "type": "error", "message": "连接地址不可用"]); return
        }
        guard let baseURL else { return }
        let request = ScreenShareWebSocketRequest.make(url: url, baseURL: baseURL, enrolledCookies: enrolledCookies)
        reportSocket(id: id, stage: "prepared", details: [
            "ownOrigin": url.host == baseURL.host,
            "enrollmentCount": enrolledCookies.count,
            "authorizationAttached": request.value(forHTTPHeaderField: "Cookie") != nil
        ])
        let task = network.webSocketTask(with: request)
        task.maximumMessageSize = 8_000_000
        sockets[id] = task; task.resume(); receive(task, id: id, ticket: generation)
    }
    private func receive(_ task: URLSessionWebSocketTask, id: Int, ticket: UUID) {
        task.receive { [weak self] result in
            DispatchQueue.main.async {
                guard let self, self.generation == ticket, self.sockets[id] === task else { return }
                switch result {
                case .success(let message):
                    let text: String
                    switch message { case .string(let value): text = value
                    case .data(let value): text = String(data: value, encoding: .utf8) ?? ""
                    @unknown default: text = "" }
                    self.event(["kind": "socket", "id": id, "type": "message", "data": text])
                    self.receive(task, id: id, ticket: ticket)
                case .failure:
                    let status = (task.response as? HTTPURLResponse)?.statusCode ?? 0
                    self.reportSocket(id: id, stage: "failed", details: ["httpStatus": status])
                    self.sockets.removeValue(forKey: id)
                    self.event(["kind": "socket", "id": id, "type": "close", "code": 1006, "reason": "网络连接中断"])
                    self.onError?(status > 0 ? "模型声音连接失败（HTTP \(status)）。" : "模型声音连接中断，请结束屏幕共享后重试。")
                }
            }
        }
    }
    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
        guard let id = sockets.first(where: { $0.value === webSocketTask })?.key else { return }
        reportSocket(id: id, stage: "open")
        event(["kind": "socket", "id": id, "type": "open"])
    }
    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        guard let id = sockets.first(where: { $0.value === webSocketTask })?.key else { return }
        sockets.removeValue(forKey: id)
        event(["kind": "socket", "id": id, "type": "close", "code": closeCode.rawValue])
    }
    func stop() {
        if !stopRecorded { stopRecorded = true; recordStartup("stopped") }
        command("stop")
        generation = UUID()
        timers.values.forEach { $0.invalidate() }; timers.removeAll()
        requests.values.forEach { $0.cancel() }; requests.removeAll()
        sockets.values.forEach { $0.cancel(with: .goingAway, reason: nil) }; sockets.removeAll()
        network?.invalidateAndCancel(); network = nil
        enrolledCookies.removeAll()
        context = nil
        receiver.stop(); audio.stop()
    }
    deinit { stop() }

    private func reportSocket(id: Int, stage: String, details: [String: Any] = [:]) {
        recordStartup("socket_" + stage, details: details)
        event(["kind": "network", "details": details.merging(["stage": stage, "socketID": id]) { _, new in new }])
    }
}
