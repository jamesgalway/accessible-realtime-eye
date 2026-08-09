import Foundation

struct GreenCloudClient {
    enum ProbeError: LocalizedError {
        case unexpectedResponse
        case unhealthy

        var errorDescription: String? {
            switch self {
            case .unexpectedResponse:
                return "绿云返回了无法识别的响应。"
            case .unhealthy:
                return "绿云服务当前没有通过健康检查。"
            }
        }
    }

    private struct HealthResponse: Decodable {
        let ok: Bool?
    }

    func probe() async throws {
        let url = AppConfiguration.greenCloudBaseURL.appending(path: "api/health")
        var request = URLRequest(url: url)
        request.timeoutInterval = 8
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw ProbeError.unexpectedResponse
        }
        let result = try JSONDecoder().decode(HealthResponse.self, from: data)
        guard result.ok != false else {
            throw ProbeError.unhealthy
        }
    }
}

