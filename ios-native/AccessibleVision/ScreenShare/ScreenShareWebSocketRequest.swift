import Foundation

enum ScreenShareWebSocketRequest {
    static func make(url: URL, baseURL: URL, enrolledCookies: [HTTPCookie]) -> URLRequest {
        var request = URLRequest(url: url)
        // URLSession's automatic cookie matching does not reliably carry Secure
        // HTTPS enrollment cookies into WSS handshakes. Use the enrollment result
        // directly, scoped to this application's secure origin, including when
        // its configured base URL has an empty path.
        request.httpShouldHandleCookies = false
        guard baseURL.scheme == "https", url.scheme == "wss",
              url.host == baseURL.host, (url.port ?? 443) == (baseURL.port ?? 443)
        else { return request }
        let cookies = enrolledCookies.filter {
            $0.name == "huiyan_native_access" && $0.isSecure && $0.isHTTPOnly
                && $0.domain.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: ".")) == baseURL.host?.lowercased()
                && $0.path == "/" && ($0.expiresDate == nil || $0.expiresDate! > Date())
        }
        for (name, value) in HTTPCookie.requestHeaderFields(with: cookies) {
            request.setValue(value, forHTTPHeaderField: name)
        }
        return request
    }
}
