import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

// Only the read-only Anisette get_headers request is retried. Apple password,
// verification and capability requests never pass through this transport.
enum AnisetteHeaderTransport {
    struct InvalidResponse: LocalizedError {
        let status: Int
        let bytes: Int
        let contentType: String
        var errorDescription: String? {
            "Anisette header refresh returned unreadable data (HTTP \(status), \(bytes) bytes, \(contentType)). Apple verification was not submitted."
        }
    }

    static func fetch(
        _ original: URLRequest,
        session: URLSession = .shared,
        log: (String) -> Void = { _ in },
        sleep: (UInt64) async throws -> Void = { try await Task.sleep(nanoseconds: $0) }
    ) async throws -> (Data, HTTPURLResponse) {
        let deadline = ProcessInfo.processInfo.systemUptime + 25
        for attempt in 1...3 {
            try Task.checkCancellation()
            var request = original
            request.timeoutInterval = min(8, max(0.1, deadline - ProcessInfo.processInfo.systemUptime))
            do {
                let (data, response) = try await session.data(for: request)
                guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
                let status = http.statusCode
                let type = String((http.value(forHTTPHeaderField: "Content-Type") ?? "unknown").prefix(100))
                let dictionary = (try? JSONSerialization.jsonObject(with: data)) as? [String: String]
                log("Anisette refresh: attempt=\(attempt) HTTP=\(status) bytes=\(data.count) type=\(type) validJSON=\(dictionary != nil)")
                if status == 200, dictionary != nil { return (data, http) }
                let error = InvalidResponse(status: status, bytes: data.count, contentType: type)
                let retryable = [429, 500, 502, 503, 504].contains(status) || (status == 200 && dictionary == nil)
                guard retryable, attempt < 3, ProcessInfo.processInfo.systemUptime < deadline - 1 else { throw error }
            } catch let error as URLError {
                let retryable = [URLError.timedOut, .cannotConnectToHost, .networkConnectionLost, .dnsLookupFailed].contains(error.code)
                log("Anisette refresh: attempt=\(attempt) transportCode=\(error.code.rawValue)")
                guard retryable, attempt < 3, !Task.isCancelled, ProcessInfo.processInfo.systemUptime < deadline - 1 else { throw error }
            }
            log("Anisette refresh: retrying only authentication headers; no password or verification request repeated")
            try await sleep(UInt64(attempt) * 500_000_000)
        }
        throw URLError(.badServerResponse)
    }
}
