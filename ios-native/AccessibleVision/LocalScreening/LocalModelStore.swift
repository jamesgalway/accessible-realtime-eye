import CryptoKit
import Combine
import Foundation

struct LocalModelCatalog: Decodable {
    struct File: Decodable {
        let path: String
        let url: URL
        let bytes: Int64
        let sha256: String
    }
    let model: String
    let revision: String
    let totalBytes: Int64
    let files: [File]
}

@MainActor
final class LocalModelStore: ObservableObject {
    static func ready(profile: LocalScreenProfile) -> Bool {
        guard let catalogURL = Bundle.main.url(forResource: profile.catalogName, withExtension: "json"),
              let data = try? Data(contentsOf: catalogURL),
              let catalog = try? JSONDecoder().decode(LocalModelCatalog.self, from: data),
              let receiptData = try? Data(contentsOf: profile.directory.appendingPathComponent("verified-files.json")),
              let receipt = try? JSONDecoder().decode([String:String].self, from: receiptData) else { return false }
        return catalog.files.allSatisfy { file in
            let attributes = try? FileManager.default.attributesOfItem(atPath: profile.directory.appendingPathComponent(file.path).path)
            return receipt[file.path] == file.sha256 && (attributes?[.size] as? NSNumber)?.int64Value == file.bytes
        }
    }
    @Published private(set) var status = "35B模型尚未下载。完整文件约16.6GB，建议Wi-Fi和20GB空闲存储。"
    @Published private(set) var busy = false
    @Published private(set) var ready = false
    private var task: Task<Void, Never>?
    static let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("MiniCPM35BExperiment", isDirectory: true)
    let catalog: LocalModelCatalog?

    init() {
        catalog = Bundle.main.url(forResource: "model-catalog", withExtension: "json")
            .flatMap { try? Data(contentsOf: $0) }
            .flatMap { try? JSONDecoder().decode(LocalModelCatalog.self, from: $0) }
        refresh()
    }

    private func receipt() -> [String: String] {
        guard let data = try? Data(contentsOf: Self.directory.appendingPathComponent("verified-files.json")),
              let decoded = try? JSONDecoder().decode([String: String].self, from: data) else { return [:] }
        return decoded
    }

    private func verified(_ file: LocalModelCatalog.File, receipt: [String: String]) -> Bool {
        let attributes = try? FileManager.default.attributesOfItem(atPath: Self.directory.appendingPathComponent(file.path).path)
        return receipt[file.path] == file.sha256 && (attributes?[.size] as? NSNumber)?.int64Value == file.bytes
    }

    func refresh() {
        guard let catalog else { ready = false; status = "模型文件清单没有载入。"; return }
        if FileManager.default.fileExists(atPath: Self.directory.path) {
            var directory = Self.directory
            var resource = URLResourceValues(); resource.isExcludedFromBackup = true
            try? directory.setResourceValues(resource)
        }
        let saved = receipt()
        ready = catalog.files.allSatisfy { verified($0, receipt: saved) }
        if ready { status = "35B模型文件已准备，可以加载。" }
    }

    func cancel() { task?.cancel() }

    // The caller first awaits engine.unload so no mmap points at deleted files.
    func deleteFiles() throws {
        guard !busy else { throw LocalScreenError.message("请先停止下载，稍后再删除。") }
        if FileManager.default.fileExists(atPath: Self.directory.path) {
            try FileManager.default.removeItem(at: Self.directory)
        }
        ready = false
        status = "本地模型已删除，手机存储已释放。"
    }

    func download() {
        guard !busy, let catalog else { return }
        busy = true
        task = Task {
            defer { busy = false; task = nil; refresh() }
            do {
                try FileManager.default.createDirectory(at: Self.directory, withIntermediateDirectories: true)
                var directory = Self.directory
                var resource = URLResourceValues(); resource.isExcludedFromBackup = true
                try directory.setResourceValues(resource)
                var saved = receipt()
                let pending = catalog.files.filter { !verified($0, receipt: saved) }
                let remaining = pending.reduce(Int64(0)) { $0 + $1.bytes }
                let free = (try FileManager.default.attributesOfFileSystem(forPath: Self.directory.path)[.systemFreeSize] as? NSNumber)?.int64Value ?? 0
                guard free > remaining + 2_000_000_000 else { throw LocalScreenError.message("手机空闲存储不足，请为模型预留约20GB空间。") }
                for (index, file) in pending.enumerated() {
                    try Task.checkCancellation()
                    let components = file.path.split(separator: "/")
                    guard !file.path.hasPrefix("/"), !components.contains(".."), file.url.scheme == "https",
                          file.url.host == "huggingface.co" else { throw LocalScreenError.message("模型文件路径不合法。") }
                    status = "正在下载第 \(index + 1) 个文件，共 \(pending.count) 个。已完成文件会保留，可稍后继续。"
                    let (temporary, response) = try await URLSession.shared.download(from: file.url)
                    defer { try? FileManager.default.removeItem(at: temporary) }
                    guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw LocalScreenError.message("模型文件下载失败，请稍后继续。") }
                    let count = (try FileManager.default.attributesOfItem(atPath: temporary.path)[.size] as? NSNumber)?.int64Value
                    guard count == file.bytes else { throw LocalScreenError.message("模型文件没有下载完整，请稍后继续。") }
                    status = "正在校验第 \(index + 1) 个文件。"
                    let digest = try await Task.detached(priority: .utility) { try Self.digest(temporary) }.value
                    try Task.checkCancellation()
                    guard digest == file.sha256 else { throw LocalScreenError.message("模型文件校验失败，请重新下载该文件。") }
                    let destination = Self.directory.appendingPathComponent(file.path)
                    try FileManager.default.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
                    if FileManager.default.fileExists(atPath: destination.path) { try FileManager.default.removeItem(at: destination) }
                    try FileManager.default.moveItem(at: temporary, to: destination)
                    saved[file.path] = digest
                    try JSONEncoder().encode(saved).write(to: Self.directory.appendingPathComponent("verified-files.json"), options: .atomic)
                }
            } catch is CancellationError { status = "下载已停止，已经校验的文件保留。" }
            catch { status = error.localizedDescription }
        }
    }

    nonisolated private static func digest(_ url: URL) throws -> String {
        let handle = try FileHandle(forReadingFrom: url); defer { try? handle.close() }
        var hash = SHA256()
        while let data = try handle.read(upToCount: 4 * 1024 * 1024), !data.isEmpty { hash.update(data: data) }
        return hash.finalize().map { String(format: "%02x", $0) }.joined()
    }
}

enum LocalScreenError: LocalizedError {
    case message(String)
    var errorDescription: String? { switch self { case .message(let text): return text } }
}
