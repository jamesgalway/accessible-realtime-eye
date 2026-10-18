import SwiftUI
import ReplayKit

@MainActor
final class ScreenShareController: ObservableObject {
    @Published private(set) var prepared = false
    @Published private(set) var preparing = false
    @Published private(set) var started = false
    @Published private(set) var status = "尚未开始屏幕共享。"
    @Published private(set) var transcript = ""
    @Published private(set) var stopLabel = "停止当前任务"
    private var runtime: ScreenShareRuntime?
    private var task: Task<Void, Never>?
    private var poll: Timer?
    private var identity = UUID()

    func prepare(backend: AssistantBackend) {
        guard !prepared, !preparing else { return }
        stop()
        preparing = true; status = "正在准备屏幕共享。"
        let identity = self.identity, runtime = ScreenShareRuntime()
        self.runtime = runtime
        runtime.onError = { [weak self] text in
            guard let self, self.identity == identity else { return }
            self.status = text
        }
        runtime.audio.onInterruption = { [weak self] in
            guard let self, self.identity == identity else { return }
            self.stop(message: "声音通道被系统中断，屏幕共享已结束，请重新开始。")
        }
        runtime.receiver.onEnd = { [weak self] message in
            guard let self, self.identity == identity else { return }; self.stop(message: message)
        }
        runtime.receiver.onFrame = { [weak self] in
            guard let self, self.identity == identity, self.prepared, !self.started else { return }
            self.started = true; self.status = "已收到屏幕画面，正在连接慧眼。"
            runtime.command("start")
        }
        task = Task { [weak self] in
            do {
                try await runtime.load(backend: backend)
                try Task.checkCancellation()
                try await runtime.audio.start()
                try Task.checkCancellation()
                guard let self, self.identity == identity else { runtime.stop(); return }
                try runtime.receiver.start()
                self.preparing = false; self.prepared = true
                self.status = "准备完成。点下面的系统屏幕共享按钮，再选择开始广播；随后可以切到其他应用。"
                let timer = Timer(timeInterval: 0.5, repeats: true) { [weak self] _ in
                    guard let self, self.identity == identity, self.started else { return }
                    let snapshot = runtime.snapshot()
                    if let value = snapshot["status"] as? String, !value.isEmpty { self.status = value }
                    self.transcript = snapshot["transcript"] as? String ?? ""
                    self.stopLabel = snapshot["stopLabel"] as? String ?? "停止当前任务"
                }
                self.poll = timer; RunLoop.main.add(timer, forMode: .common)
            } catch {
                guard let self, self.identity == identity else { runtime.stop(); return }
                self.stop(message: "屏幕共享准备失败：\(error.localizedDescription)")
            }
        }
    }
    func stopTask() { runtime?.command("stopTask") }
    func stop(message: String = "屏幕共享已结束。") {
        identity = UUID(); task?.cancel(); task = nil
        poll?.invalidate(); poll = nil
        let old = runtime; runtime = nil; old?.stop()
        preparing = false; prepared = false; started = false
        status = message; transcript = ""
    }
}

struct ScreenShareView: View {
    let backend: AssistantBackend
    @ObservedObject var controller: ScreenShareController
    @State private var showConversation = false
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("屏幕共享").font(.title2).accessibilityAddTraits(.isHeader)
                Text("当前使用\(backend.title)。可以询问屏幕内容、设置主动提醒，或使用持续播报；普通问答保留联网搜索。")
                Text(controller.status)
                if !controller.prepared {
                    Button(controller.preparing ? "正在准备" : "准备屏幕共享") { controller.prepare(backend: backend) }
                        .disabled(controller.preparing)
                } else {
                    ScreenBroadcastPicker()
                        .frame(height: 54)
                    if controller.started && controller.stopLabel.contains("持续播报") {
                        Button(controller.stopLabel) { controller.stopTask() }
                    }
                    Button("结束屏幕共享") { controller.stop() }
                }
                Text("开始广播后可以切到其他应用，像使用慧眼一样直接说出问题或任务。系统不允许录制的画面可能无法获取。")
                if !controller.transcript.isEmpty {
                    Button(showConversation ? "折叠互动内容" : "展开互动内容") { showConversation.toggle() }
                    if showConversation { Text(controller.transcript).textSelection(.enabled) }
                }
            }
            .buttonStyle(.bordered)
            .padding()
        }
    }
}

private struct ScreenBroadcastPicker: UIViewRepresentable {
    func makeUIView(context: Context) -> RPSystemBroadcastPickerView {
        let view = RPSystemBroadcastPickerView(frame: CGRect(x: 0, y: 0, width: 54, height: 54))
        // Derive from the installed identifier because personal signing may
        // rewrite the container and extension bundle IDs together.
        if let plugins = Bundle.main.builtInPlugInsURL,
           let files = try? FileManager.default.contentsOfDirectory(at: plugins, includingPropertiesForKeys: nil),
           let extensionURL = files.first(where: { $0.pathExtension == "appex" }), let bundle = Bundle(url: extensionURL) {
            view.preferredExtension = bundle.bundleIdentifier
        }
        view.showsMicrophoneButton = false
        for button in view.subviews.compactMap({ $0 as? UIButton }) {
            button.accessibilityLabel = "打开系统屏幕共享"
            button.accessibilityHint = "在系统面板选择开始广播，然后切换到需要查看的应用。"
        }
        return view
    }
    func updateUIView(_ uiView: RPSystemBroadcastPickerView, context: Context) {}
}
