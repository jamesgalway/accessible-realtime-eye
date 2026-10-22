import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

final class MockProtocol: URLProtocol {
    static var replies: [(Int, Data)] = []
    static var calls = 0
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let index = Self.calls
        Self.calls += 1
        guard index < Self.replies.count else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse)); return
        }
        let (status, data) = Self.replies[index]
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil,
            headerFields: ["Content-Type":"application/json"])!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

@main struct TransportTests {
    static func main() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MockProtocol.self]
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }
        let request = URLRequest(url: URL(string:"https://example.invalid/v3/get_headers")!)
        let valid = Data(#"{"X-Apple-I-MD":"not-a-real-token"}"#.utf8)
        var passed = 0
        for (responses, expectedCalls, expectedSuccess) in [
            ([(502,Data()), (200,valid)], 2, true),
            ([(200,Data("<html>busy</html>".utf8)), (200,valid)], 2, true),
            ([(200,Data()), (200,Data()), (200,Data())], 3, false),
            ([(403,Data())], 1, false),
            ([(429,Data()), (200,valid)], 2, true),
            ([(200,Data(#"{"result":"GetHeadersError","message":"-45061"}"#.utf8))], 1, true),
            ([(200,valid)], 1, true)
        ] {
            MockProtocol.replies = responses
            MockProtocol.calls = 0
            var success = false
            var logs = [String]()
            do {
                _ = try await AnisetteHeaderTransport.fetch(request,session:session,log:{logs.append($0)},sleep:{_ in})
                success = true
            } catch {}
            precondition(success == expectedSuccess)
            precondition(MockProtocol.calls == expectedCalls)
            precondition(!logs.joined().contains("not-a-real-token"))
            passed += 1
        }
        MockProtocol.replies = [(502,Data()),(200,valid)]
        MockProtocol.calls = 0
        do {
            _ = try await AnisetteHeaderTransport.fetch(request,session:session,sleep:{_ in throw CancellationError()})
            preconditionFailure("Cancellation must stop the retry")
        } catch is CancellationError { precondition(MockProtocol.calls == 1); passed += 1 }
        print("Anisette transport: \(passed) behavior checks passed")
    }
}
