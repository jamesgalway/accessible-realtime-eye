import Foundation

enum AppConfiguration {
    static var greenCloudBaseURL: URL {
        secureURL(forInfoKey: "GreenCloudBaseURL")
    }

    static var aliyunBaseURL: URL {
        secureURL(forInfoKey: "AliyunBaseURL")
    }

    private static func secureURL(forInfoKey key: String) -> URL {
        guard
            let rawValue = Bundle.main.object(forInfoDictionaryKey: key) as? String,
            let url = URL(string: rawValue),
            url.scheme == "https"
        else {
            preconditionFailure("\(key) is missing or invalid")
        }
        return url
    }
}

enum AssistantBackend: String, CaseIterable, Identifiable {
    case greenCloud
    case aliyun

    var id: String { rawValue }

    var title: String {
        switch self {
        case .greenCloud:
            return "绿云 Gemini 版"
        case .aliyun:
            return "阿里百炼版"
        }
    }

    var baseURL: URL {
        switch self {
        case .greenCloud:
            return AppConfiguration.greenCloudBaseURL
        case .aliyun:
            return AppConfiguration.aliyunBaseURL
        }
    }

    var teachingRuntimeRouteId: String {
        switch self {
        case .greenCloud:
            return "greencloud_google"
        case .aliyun:
            return "aliyun_google"
        }
    }

    var teachingBaseURL: URL {
        let pageURL = baseURL.appending(path: "teaching/start.html")
        guard var components = URLComponents(url: pageURL, resolvingAgainstBaseURL: false) else {
            preconditionFailure("Teaching URL is invalid")
        }
        components.queryItems = [
            URLQueryItem(name: "runtimeRoute", value: teachingRuntimeRouteId)
        ]
        guard let url = components.url else {
            preconditionFailure("Teaching URL route is invalid")
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
