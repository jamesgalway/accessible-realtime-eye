import Foundation

enum AppIDListResponse {
    static func summary(_ response: [String: Any]) -> String {
        let code = response["resultCode"].map { String(describing: $0) } ?? "absent"
        let count = (response["appIds"] as? [[String:Any]])?.count
        return "App ID list: resultCode=\(code); keys=\(response.keys.sorted().joined(separator: ",")); count=\(count.map(String.init) ?? "unavailable")"
    }

    static func records(_ response: [String:Any]) throws -> [[String:Any]] {
        let code: Int
        if let value = response["resultCode"] as? Int { code = value }
        else if let value = response["resultCode"] as? String, let number = Int(value) { code = number }
        else if response["resultCode"] == nil { code = 0 }
        else { throw NSError(domain:"MemoryHelper.AppIDList",code:-2,userInfo:[NSLocalizedDescriptionKey:summary(response)]) }
        if code != 0 {
            let message = (response["userString"] as? String) ?? (response["resultString"] as? String) ?? "Apple rejected the App ID list request"
            throw NSError(domain:"MemoryHelper.AppIDList",code:code,userInfo:[NSLocalizedDescriptionKey:String(message.prefix(500))+"\n"+summary(response)])
        }
        guard let records = response["appIds"] as? [[String:Any]] else {
            throw NSError(domain:"MemoryHelper.AppIDList",code:-3,userInfo:[NSLocalizedDescriptionKey:summary(response)])
        }
        return records
    }
}
