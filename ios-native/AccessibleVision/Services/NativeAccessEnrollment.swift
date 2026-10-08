import Foundation
import WebKit

@MainActor
enum NativeAccessEnrollment {
    static func authorize(for pageURL: URL, cookieStore: WKHTTPCookieStore) async throws {
        let trusted = AssistantBackend.allCases.map { $0.baseURL }
        guard pageURL.scheme == "https", trusted.contains(where: {
            $0.host == pageURL.host && $0.port == pageURL.port && $0.scheme == pageURL.scheme
        }), let resource = Bundle.main.url(forResource: "NativeAccessCredentials", withExtension: "json"),
              let data = try? Data(contentsOf: resource),
              let fields = try? JSONSerialization.jsonObject(with: data) as? [String: String],
              let credential = fields["nativeCredential"], credential.count == 64,
              var components = URLComponents(url: pageURL, resolvingAgainstBaseURL: false)
        else { throw URLError(.userAuthenticationRequired) }
        components.path = "/api/client-access"
        components.query = nil
        components.fragment = nil
        guard let endpoint = components.url else { throw URLError(.badURL) }
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["nativeCredential": credential])
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 15
        configuration.timeoutIntervalForResource = 20
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }
        let (responseData, response) = try await session.data(for: request)
        try Task.checkCancellation()
        guard let http = response as? HTTPURLResponse, http.statusCode == 200,
              let result = try JSONSerialization.jsonObject(with: responseData) as? [String: Any],
              result["accessProfile"] as? String == "native"
        else { throw URLError(.userAuthenticationRequired) }
        var headers: [String: String] = [:]
        for (key, value) in http.allHeaderFields { headers[String(describing: key)] = String(describing: value) }
        let cookies = HTTPCookie.cookies(withResponseHeaderFields: headers, for: endpoint)
        guard let cookie = cookies.first(where: { $0.name == "huiyan_native_access" }), cookie.isSecure, cookie.isHTTPOnly
        else { throw URLError(.userAuthenticationRequired) }
        await cookieStore.setCookie(cookie)
        try Task.checkCancellation()
    }
}
