import Foundation

enum AppConfiguration {
    static var greenCloudBaseURL: URL {
        guard
            let rawValue = Bundle.main.object(forInfoDictionaryKey: "GreenCloudBaseURL") as? String,
            let url = URL(string: rawValue),
            url.scheme == "https"
        else {
            preconditionFailure("GreenCloudBaseURL is missing or invalid")
        }
        return url
    }
}

enum NativeTaskMode: String, Sendable {
    case idle
    case activeReminder
    case findObject
    case continuousNarration
    case navigationSiteAssist
}

