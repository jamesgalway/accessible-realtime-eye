import Foundation
import JavaScriptCore

let root = URL(fileURLWithPath: CommandLine.arguments[1])
let context = JSContext()!
var failed = false
context.exceptionHandler = { _, exception in
    // This fixture contains test-only placeholders, never enrollment material.
    print("JSCore failure: \(exception?.toString() ?? "unknown")")
    failed = true
}
func encode(_ value: Any?) -> String {
    guard let value, let data = try? JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed]) else { return "null" }
    return String(data: data, encoding: .utf8)!
}
func event(_ object: [String: Any]) {
    DispatchQueue.main.async { context.objectForKeyedSubscript("__screenEvent")?.call(withArguments: [object]) }
}
let host: @convention(block) (String) -> String = { text in
    guard let data = text.data(using: .utf8), let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return "null" }
    let id = value["id"] as? Int ?? 0
    switch value["op"] as? String {
    case "clock": return encode(ProcessInfo.processInfo.systemUptime)
    case "hasFrame": return "true"
    case "frameSize": return "{\"width\":576,\"height\":1024}"
    case "url":
        let base = URL(string: value["base"] as? String ?? "")
        let url = URL(string: value["value"] as? String ?? "", relativeTo: base)!.absoluteURL
        let p = URLComponents(url: url, resolvingAgainstBaseURL: true)!
        return encode(["protocol": p.scheme! + ":", "host": p.host!, "hostname": p.host!, "pathname": p.path.isEmpty ? "/" : p.path,
                       "search": p.percentEncodedQuery.map { "?" + $0 } ?? "", "hash": ""])
    case "fetch":
        let body = (value["url"] as? String ?? "").contains("/api/health")
            ? "{\"ok\":true,\"appVariant\":\"greencloud-gemini\",\"geminiConfigured\":true}"
            : "{\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"verified\"}]}}]}"
        event(["kind": "fetch", "id": id, "status": 200, "headers": ["content-type": "application/json"], "body": body])
    case "socket": event(["kind": "socket", "id": id, "type": "open"])
    case "socketSend":
        if (value["data"] as? String ?? "").contains("\"setup\"") { event(["kind": "socket", "id": id, "type": "message", "data": "{\"setupComplete\":{}}"] ) }
    case "timer": break
    case "uuid": return encode(UUID().uuidString)
    default: break
    }
    return "null"
}
context.setObject(host, forKeyedSubscript: "_screenHost" as NSString)
context.setObject("https://example.test/", forKeyedSubscript: "__screenBaseURL" as NSString)
context.setObject("greencloud", forKeyedSubscript: "__screenBackend" as NSString)
for rel in ["AccessibleVision/ScreenShare/ScreenRuntimeEnvironment.js", "AccessibleVision/ScreenShare/Resources/screen-google-sdk.js", "AccessibleVision/ScreenShare/Resources/greencloud-screen-runtime.js"] {
    let source = try String(contentsOf: root.appendingPathComponent(rel), encoding: .utf8)
    context.evaluateScript(source, withSourceURL: URL(string: "fixture:///" + rel))
    if failed { exit(1) }
}
context.evaluateScript("""
globalThis.smokeDone = false;
(async () => {
 const ai = new HuiyanGoogleSDK.GoogleGenAI({apiKey:'fixture-key'});
 const r = await ai.models.generateContent({model:'fixture',contents:'fixture'});
 if (r.text !== 'verified') throw Error('REST result missing');
 const s = await ai.live.connect({model:'fixture',config:{responseModalities:['AUDIO']},callbacks:{onmessage:()=>{}}});
 if (!s || typeof s.sendRealtimeInput !== 'function') throw Error('Live session missing');
 globalThis.smokeDone = true;
})().catch(e=>{globalThis.smokeFailure=String(e);});
""")
let deadline = Date().addingTimeInterval(10)
while Date() < deadline && !failed && context.objectForKeyedSubscript("smokeDone")?.toBool() != true {
    _ = RunLoop.main.run(mode: .default, before: Date().addingTimeInterval(0.02))
}
guard !failed, context.objectForKeyedSubscript("smokeDone")?.toBool() == true else {
    print("JSCore smoke did not complete: \(context.objectForKeyedSubscript("smokeFailure")?.toString() ?? "timeout")")
    exit(1)
}
print("Native JavaScriptCore loaded original Huiyan and completed SDK REST/Live fixtures.")
