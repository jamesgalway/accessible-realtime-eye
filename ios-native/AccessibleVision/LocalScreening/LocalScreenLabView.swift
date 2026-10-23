import PhotosUI
import SwiftUI
import UIKit

enum LocalReminderVoice: String { case aliyun, google }

@MainActor
final class LocalScreenLab: ObservableObject {
    static let shared = LocalScreenLab()
    @Published var status = "请先下载并加载模型，再填写要判断的条件。"
    @Published private(set) var busy = false
    @Published private(set) var loaded = false
    @Published private(set) var localReminders = false
    @Published private(set) var profile = LocalScreenProfile.moe35b
    @Published private(set) var reminderVoice = LocalReminderVoice.aliyun
    private let engine = LocalScreenEngine()
    private var revision = 0
    private var applicationActive = true

    func setApplicationActive(_ active: Bool) {
        applicationActive = active
        if !active { engine.cancel() }
        if loaded || busy { record(["event":active ? "local_app_active" : "local_app_suspended"]) }
    }

    func handleMemoryWarning() {
        guard loaded else { return }
        engine.releaseVisionForMemoryWarning()
        record(["event":"local_memory_warning_encoder_released"])
    }

    func enableReminders(profile selected: LocalScreenProfile = .moe35b, voice: LocalReminderVoice = .aliyun) async throws {
        guard applicationActive else { throw LocalScreenError.message("请回到慧眼前台后再加载。") }
        guard !busy else { throw LocalScreenError.message("本地模型正在处理上一项任务，请稍后再试。") }
        guard LocalModelStore.ready(profile:selected) else { throw LocalScreenError.message("\(selected.shortName)模型文件尚未全部校验完成，请稍后再开启。") }
        busy = true; defer { busy = false }
        if loaded && profile != selected { await engine.unload(); loaded = false; localReminders = false }
        profile = selected
        if !loaded {
            status = "正在加载本地主动提醒模型。"
            record(["event":"model_load_started","availableBytes":huiyan_local_available_memory(),"footprintBytes":huiyan_local_footprint()])
            do {
                let ms = try await engine.load(directory: selected.directory, profile:selected)
                loaded = true; record(["event":"model_loaded","loadMs":ms])
            } catch {
                record(["event":"model_load_failed","error":error.localizedDescription,"availableBytes":huiyan_local_available_memory()])
                throw error
            }
        }
        reminderVoice = voice
        localReminders = true
        status = "\(profile.shortName)本地主动提醒实验已启用。返回阿里慧眼说提醒条件，筛图期间请保留应用在前台。三秒总延迟仍需实测。"
        record(["event":"local_reminders_enabled","voice":voice.rawValue,"liveTransport":voice == .aliyun ? "aliyun-realtime" : "browser-direct"])
    }

    func reminder(jpeg: Data, prompt: String, task: String, capturedAt: TimeInterval, requestID: String) async throws -> LocalScreenMeasurement {
        guard localReminders, loaded else { throw LocalScreenError.message("本地主动提醒尚未启用。") }
        guard applicationActive else { throw LocalScreenError.message("本地筛图在后台已暂停。") }
        guard !busy else { throw LocalScreenError.message("本地筛图还在处理上一张画面。") }
        busy = true; defer { busy = false }
        let result:LocalScreenMeasurement
        do { result = try await engine.screen(jpeg: jpeg, condition: task, capturedAt: capturedAt, preparedPrompt: prompt,budgetMs:20_000) }
        catch {
            record(["event":"reminder_screen_failed","requestID":requestID,"error":error.localizedDescription])
            throw error
        }
        if let data = try? JSONEncoder().encode(result), var event = (try? JSONSerialization.jsonObject(with:data)) as? [String:Any] {
            event["event"] = "reminder_screen_result"; event["requestID"] = requestID; event["task"] = task
            event["thermalState"] = ProcessInfo.processInfo.thermalState.rawValue
            record(event)
        }
        return result
    }

    func cancelReminder() { engine.cancel() }

    func load() {
        guard !busy else { return }
        busy = true; revision += 1
        profile = .moe35b
        let token = revision
        status = "正在加载35B模型，请稍等。"
        Task {
            defer { if token == revision { busy = false } }
            do {
                let ms = try await engine.load(directory: LocalModelStore.directory)
                guard token == revision else { return }
                loaded = true
                status = String(format: "模型已加载，用时%.1f秒。可以筛当前画面或选择照片。", ms / 1000)
                record(["event": "model_loaded", "loadMs": ms])
            } catch { if token == revision { loaded = false; status = error.localizedDescription } }
        }
    }

    func screen(condition: String, capture: () -> Data?) {
        guard !busy, loaded else { return }
        let condition = condition.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !condition.isEmpty, condition.count <= 500 else {
            status = "请填写要判断的条件，不超过500字。"; return
        }
        let started = ProcessInfo.processInfo.systemUptime
        guard let jpeg = capture() else { status = "当前没有可用画面，请开启慧眼或选择照片。"; return }
        busy = true; revision += 1
        let token = revision
        status = "正在本地判断，图片不会发到模型API。"
        Task {
            defer { if token == revision { busy = false } }
            do {
                let result = try await engine.screen(jpeg: jpeg, condition: condition, capturedAt: started)
                guard token == revision else { return }
                let label = ["HIT": "满足条件", "NO_HIT": "未满足条件", "UNCERTAIN": "无法确定"][result.decision] ?? "无法确定"
                status = String(format: "%@。从取图到结果共%.2f秒，%@3.5秒筛图预算。进程内存约%.2fGB。",
                    label, result.totalMs / 1000, result.withinBudget ? "在" : "超过", Double(result.footprintBytes) / 1e9)
                if let data = try? JSONEncoder().encode(result),
                   var event = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] {
                    event["event"] = "screen_result"; event["condition"] = condition
                    event["thermalState"] = ProcessInfo.processInfo.thermalState.rawValue
                    record(event)
                }
            } catch { if token == revision { status = error.localizedDescription; record(["event": "screen_error", "error": status]) } }
        }
    }

    func unload() async {
        revision += 1; busy = true; loaded = false; localReminders = false
        status = "正在释放本地模型。"
        await engine.unload()
        busy = false; status = "模型已卸载，文件保留。"
    }

    func close() {
        if localReminders { return }
        Task { await unload() }
    }

    private func record(_ event: [String: Any]) {
        var event = event
        event["time"] = ISO8601DateFormatter().string(from: Date())
        event["model"] = profile.identifier
        let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("local-screening-diagnostics", isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let url = directory.appendingPathComponent("events.jsonl")
            var data = try JSONSerialization.data(withJSONObject: event, options: [.sortedKeys])
            data.append(0x0A)
            if !FileManager.default.fileExists(atPath: url.path) { try data.write(to: url) }
            else {
                let handle = try FileHandle(forWritingTo: url); defer { try? handle.close() }
                try handle.seekToEnd(); try handle.write(contentsOf: data)
            }
        } catch { status += " 本地诊断记录写入失败。" }
    }
}

struct LocalScreenLabView: View {
    @ObservedObject var camera: NativeCameraService
    @StateObject private var store = LocalModelStore()
    @StateObject private var lab = LocalScreenLab.shared
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @State private var condition = ""
    @State private var photo: PhotosPickerItem?
    @State private var photoData: Data?
    @State private var photoBusy = false
    @State private var photoStatus = "尚未选择照片。"
    @State private var confirmDelete = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("本地模型管理。主动提醒请使用阿里慧眼上方的本地主动提醒按钮，照常说提醒条件。本页也可选照片检查模型。本地筛图单独计时，不等待语音。")
                    Text(store.status)
                    if lab.loaded { Text("当前加载：\(lab.profile.shortName)。本页管理35B文件，1B使用主页的独立实验入口。") }
                    Button("下载或继续下载模型") { store.download() }
                        .disabled(store.busy || store.ready || lab.busy)
                    Button("停止下载") { store.cancel() }.disabled(!store.busy)
                    Button("加载模型") { lab.load() }.disabled(!store.ready || store.busy || lab.busy || lab.loaded)
                    Button("卸载模型，保留文件") { Task { await lab.unload() } }.disabled(!lab.loaded || lab.busy)
                    Button("删除下载的模型", role: .destructive) { confirmDelete = true }
                        .disabled(store.busy || lab.busy)
                }
                Section("要判断的条件") {
                    TextField("填写画面需要满足的条件", text: $condition, axis: .vertical)
                    Button("筛当前画面") {
                        lab.screen(condition: condition) { camera.jpegData(maxWidth: 384, quality: 0.65) }
                    }.disabled(!lab.loaded || lab.busy || !camera.isRunning)
                    PhotosPicker("选择测试照片", selection: $photo, matching: .images)
                        .disabled(lab.busy || photoBusy)
                    Text(photoStatus)
                    Button("筛选中的照片") {
                        lab.screen(condition: condition) { Self.jpeg(photoData) }
                    }.disabled(!lab.loaded || lab.busy || photoBusy || photoData == nil)
                }
                Section("测试结果") { Text(lab.status).textSelection(.enabled) }
            }
            .navigationTitle("本地筛图实验")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("关闭") { dismiss() } } }
            .confirmationDialog("删除35B模型及其分片，释放手机存储？", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("删除模型", role: .destructive) {
                    Task {
                        await lab.unload()
                        do { try store.deleteFiles() } catch { lab.status = error.localizedDescription }
                    }
                }
            }
            .onChange(of: photo) { item in
                photoBusy = true; photoData = nil
                photoStatus = "正在读取所选照片。"
                Task {
                    let data = try? await item?.loadTransferable(type: Data.self)
                    guard photo == item else { return }
                    photoData = data; photoBusy = false
                    photoStatus = data == nil ? "照片读取失败，请重新选择。" : "照片已选择，可以测试。"
                }
            }
            .onDisappear { store.cancel(); lab.close() }
            .onChange(of: scenePhase) { phase in
                if phase == .background { store.cancel(); Task { await lab.unload() } }
            }
        }
    }

    private static func jpeg(_ data: Data?) -> Data? {
        guard let data, let image = UIImage(data: data), image.size.width > 0, image.size.height > 0 else { return nil }
        let scale = min(1, 512 / max(image.size.width, image.size.height))
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let format = UIGraphicsImageRendererFormat(); format.scale = 1
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }.jpegData(compressionQuality: 0.65)
    }
}
