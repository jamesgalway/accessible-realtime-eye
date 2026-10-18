import Foundation
import Network
import CryptoKit

enum ScreenBroadcastWire {
    static let port: NWEndpoint.Port = 18784
    static let maximumPacket = 1_500_000
    static func credential() -> Data? {
        guard let url = Bundle.main.url(forResource: "NativeAccessCredentials", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: String],
              let value = object["nativeCredential"], value.count == 64 else { return nil }
        return Data(value.utf8)
    }
    static func proof(_ challenge: String) -> String? {
        guard let credential = credential() else { return nil }
        return Data(HMAC<SHA256>.authenticationCode(for: Data(("huiyan-screen-v1:" + challenge).utf8),
            using: SymmetricKey(data: credential))).base64EncodedString()
    }
    static func matches(_ signature: Data, challenge: String) -> Bool {
        guard let key = credential(), let raw = Data(base64Encoded: signature) else { return false }
        return HMAC<SHA256>.isValidAuthenticationCode(raw, authenticating: Data(("huiyan-screen-v1:" + challenge).utf8), using: SymmetricKey(data: key))
    }
    static func packet(_ type: UInt8, _ payload: Data = Data()) -> Data {
        var length = UInt32(payload.count + 1).bigEndian
        var result = withUnsafeBytes(of: &length) { Data($0) }
        result.append(type); result.append(payload); return result
    }
}

final class ScreenBroadcastReader {
    let connection: NWConnection
    var onPacket: ((UInt8, Data) -> Void)?
    var onEnd: (() -> Void)?
    private var buffer = Data()
    private var closed = false
    init(_ connection: NWConnection) { self.connection = connection }
    func read() {
        guard !closed else { return }
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, complete, error in
            guard let self, !self.closed else { return }
            if let data { self.buffer.append(data) }
            while self.buffer.count >= 4 {
                let length = self.buffer.prefix(4).reduce(0) { ($0 << 8) | Int($1) }
                guard length >= 1, length <= ScreenBroadcastWire.maximumPacket else { self.finish(); return }
                guard self.buffer.count >= length + 4 else { break }
                let packet = self.buffer.subdata(in: 4..<(length + 4))
                self.buffer.removeSubrange(0..<(length + 4))
                self.onPacket?(packet[0], packet.dropFirst())
            }
            if complete || error != nil { self.finish() } else { self.read() }
        }
    }
    func finish() { guard !closed else { return }; closed = true; connection.cancel(); onEnd?() }
}
