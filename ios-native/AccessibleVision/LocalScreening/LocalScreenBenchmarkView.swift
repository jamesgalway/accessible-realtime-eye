import CryptoKit
import SwiftUI
import UIKit

// USB-only developer invocation. Normal launches never read fixtures or start
// inference here. It uses the real engine and cached reminder prompt, with no
// web view, camera, microphone, cloud request or progress/reminder submission.
struct LocalScreenBenchmarkView: View {
    private struct Fixture: Decodable { let prompt: String; let samples: Int; let model: String? }
    @State private var status = "正在运行本地离线对照。"
    @Environment(\.scenePhase) private var phase
    private let engine = LocalScreenEngine()

    var body: some View {
        Text(status).padding().textSelection(.enabled)
            .task { await run() }
            .onChange(of: phase) { if $0 != .active { engine.cancel() } }
            .onReceive(NotificationCenter.default.publisher(for: UIApplication.didReceiveMemoryWarningNotification)) { _ in
                engine.releaseVisionForMemoryWarning()
            }
    }

    @MainActor private func run() async {
        let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("LocalScreenBenchmark", isDirectory: true)
        var output = directory.appendingPathComponent("benchmark-error.json")
        var report: [String: Any] = ["ioThreads": LocalScreenEngine.ioThreads,
            "startedAt": ISO8601DateFormatter().string(from: Date()), "complete": false,
            "budgetMs": 20_000, "scope": "offline-native-reminder-engine"]
        do {
            let fixtureData = try Data(contentsOf: directory.appendingPathComponent("fixture.json"))
            guard fixtureData.count <= 10_000 else { throw LocalScreenError.message("对照配置过大。") }
            let fixture = try JSONDecoder().decode(Fixture.self, from: fixtureData)
            guard let profile = LocalScreenProfile(rawValue:fixture.model ?? "35b") else { throw LocalScreenError.message("对照模型无效。") }
            let readCacheRequested = profile == .moe35b && ProcessInfo.processInfo.arguments.contains("-huiyan35bPrefillReadCache")
            output = directory.appendingPathComponent("result-\(profile == .dense1b ? "1b-" : "")io\(LocalScreenEngine.ioThreads)\(readCacheRequested ? "-readcache" : "").json")
            report["model"] = profile.identifier
            guard !fixture.prompt.isEmpty, fixture.prompt.count <= 1200, (1...4).contains(fixture.samples) else {
                throw LocalScreenError.message("对照配置无效。")
            }
            let jpeg = try Data(contentsOf: directory.appendingPathComponent("frame.jpg"))
            guard jpeg.count <= 2_000_000, UIImage(data: jpeg) != nil else { throw LocalScreenError.message("对照图片无效。") }
            report["imageSHA256"] = SHA256.hash(data: jpeg).map { String(format: "%02x", $0) }.joined()
            report["promptSHA256"] = SHA256.hash(data: Data(fixture.prompt.utf8)).map { String(format: "%02x", $0) }.joined()
            report["loadMs"] = try await engine.load(directory: profile.directory,profile:profile)
            let planURL = directory.deletingLastPathComponent().appendingPathComponent("local-screen-memory-plan.json")
            report["memoryPlan"] = try JSONSerialization.jsonObject(with: Data(contentsOf: planURL))
            var samples = [[String: Any]]()
            for index in 0..<fixture.samples {
                guard !Task.isCancelled, UIApplication.shared.applicationState == .active else { throw CancellationError() }
                let result = try await engine.screen(jpeg: jpeg, condition: "", capturedAt: ProcessInfo.processInfo.systemUptime,
                    preparedPrompt: fixture.prompt, budgetMs: 20_000)
                let data = try JSONEncoder().encode(result)
                var sample = try JSONSerialization.jsonObject(with: data) as! [String: Any]
                sample["sampleIndex"] = index
                sample["thermalState"] = ProcessInfo.processInfo.thermalState.rawValue
                samples.append(sample)
                report["samples"] = samples
                try JSONSerialization.data(withJSONObject: report, options: [.sortedKeys]).write(to: output, options: .atomic)
            }
            report["complete"] = true
            status = "离线对照已完成，结果已保存。"
        } catch {
            report["error"] = error.localizedDescription
            status = "离线对照结束：\(error.localizedDescription)"
        }
        report["finishedAt"] = ISO8601DateFormatter().string(from: Date())
        do { try JSONSerialization.data(withJSONObject: report, options: [.sortedKeys]).write(to: output, options: .atomic) }
        catch { status += " 结果写入失败。" }
        await engine.unload()
    }
}
