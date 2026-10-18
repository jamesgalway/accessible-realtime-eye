import Foundation

let base = URL(string: "https://screen.example.test")!
let cookies = HTTPCookie.cookies(withResponseHeaderFields: [
    "Set-Cookie": "huiyan_native_access=fixture-only; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=86400"
], for: base.appendingPathComponent("api/client-access"))
precondition(cookies.count == 1 && cookies[0].isHTTPOnly && cookies[0].isSecure)
let socket = URL(string: "wss://screen.example.test/api/ws?modelProfile=flash")!
let request = ScreenShareWebSocketRequest.make(url: socket, baseURL: base, enrolledCookies: cookies)
precondition(request.value(forHTTPHeaderField: "Cookie") == "huiyan_native_access=fixture-only")
precondition(!request.httpShouldHandleCookies)
var normalizedProperties = cookies[0].properties!
normalizedProperties[.domain] = ".screen.example.test"
let normalized = HTTPCookie(properties: normalizedProperties)!
precondition(ScreenShareWebSocketRequest.make(url: socket, baseURL: base, enrolledCookies: [normalized])
    .value(forHTTPHeaderField: "Cookie") == "huiyan_native_access=fixture-only")
for target in ["wss://generativelanguage.googleapis.com/ws/test", "wss://other.example.test/api/ws",
               "ws://screen.example.test/api/ws", "wss://screen.example.test:8443/api/ws"] {
    let other = ScreenShareWebSocketRequest.make(url: URL(string: target)!, baseURL: base, enrolledCookies: cookies)
    precondition(other.value(forHTTPHeaderField: "Cookie") == nil, "Enrollment must remain within its secure origin")
}
let empty = ScreenShareWebSocketRequest.make(url: socket, baseURL: base, enrolledCookies: [])
precondition(empty.value(forHTTPHeaderField: "Cookie") == nil)
let expired = HTTPCookie.cookies(withResponseHeaderFields: [
    "Set-Cookie": "huiyan_native_access=expired; Path=/; Secure; HttpOnly; Expires=Thu, 01 Jan 1970 00:00:00 GMT"
], for: base.appendingPathComponent("api/client-access"))
precondition(ScreenShareWebSocketRequest.make(url: socket, baseURL: base, enrolledCookies: expired)
    .value(forHTTPHeaderField: "Cookie") == nil)
print("Native screen WebSocket enrollment: secure own-origin header retained; Google, other origins, missing and expired enrollment excluded.")
