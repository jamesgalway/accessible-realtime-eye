import Foundation

@main struct AppIDListResponseTests {
    static func main() throws {
        let valid: [String:Any] = ["resultCode":0,"appIds":[["identifier":"test-only"]]]
        let parsed = try AppIDListResponse.records(valid)
        let empty = try AppIDListResponse.records(["appIds":[]])
        let numeric = try AppIDListResponse.records(["resultCode":"0","appIds":[]])
        precondition(parsed.count == 1)
        precondition(empty.isEmpty)
        precondition(numeric.isEmpty)
        var passed = 3
        for (response, code) in [
            (["resultCode":1100,"userString":"Session expired"] as [String:Any],1100),
            (["resultCode":"35","resultString":"Request rejected"] as [String:Any],35),
            (["resultCode":0,"unrecognized":[]] as [String:Any],-3),
            (["resultCode":"invalid","appIds":[]] as [String:Any],-2)
        ] {
            do { _ = try AppIDListResponse.records(response); preconditionFailure("Must reject invalid response") }
            catch { precondition((error as NSError).code == code); passed += 1 }
        }
        precondition(!AppIDListResponse.summary(valid).contains("test-only"))
        passed += 1
        print("App ID list diagnostics: \(passed) behavior checks passed")
    }
}
