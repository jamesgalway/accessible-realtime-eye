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
    @Published private(set) var broadcastPresentation = 0
    private var runtime: ScreenShareRuntime?
    private var task: Task<Void, Never>?
    private var poll: Timer?
    private var identity = UUID()
    private var connectionError: String?

    func prepare(backend: AssistantBackend) {
        guard !prepared, !preparing else { return }
        stop()
        preparing = true; status = "正在准备屏幕共享。"
        let identity = self.identity, runtime = ScreenShareRuntime()
        self.runtime = runtime
        runtime.onError = { [weak self] text in
            guard let self, self.identity == identity else { return }
            self.status = text
            self.connectionError = text
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
                self.status = "请在系统面板开始广播。"
                self.broadcastPresentation += 1
                let timer = Timer(timeInterval: 0.5, repeats: true) { [weak self] _ in
                    guard let self, self.identity == identity, self.started else { return }
                    let snapshot = runtime.snapshot()
                    if let error = self.connectionError { self.status = error }
                    else if snapshot["connected"] as? Bool != true { self.status = "屏幕广播已开始，正在连接模型声音。" }
                    else if let value = snapshot["status"] as? String, !value.isEmpty { self.status = value }
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
        connectionError = nil
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
                Text(controller.status)
                if !controller.prepared {
                    Button(controller.preparing ? "正在准备" : "开始屏幕共享") { controller.prepare(backend: backend) }
                        .disabled(controller.preparing)
                } else {
                    ScreenBroadcastPicker(presentationRequest: controller.broadcastPresentation)
                        .frame(height: 54)
                    if controller.started && controller.stopLabel.contains("持续播报") {
                        Button(controller.stopLabel) { controller.stopTask() }
                    }
                    Button("结束屏幕共享") { controller.stop() }
                }
                if !controller.transcript.isEmpty {
                    Button(showConversation ? "折叠互动内容" : "展开互动内容") { showConversation.toggle() }
                    if showConversation { Text(controller.transcript).textSelection(.enabled) }
                }
            }
            .buttonStyle(.bordered)
            .padding()
        }
        .task { controller.prepare(backend: backend) }
    }
}

private struct ScreenBroadcastPicker: UIViewRepresentable {
    let presentationRequest: Int
    func makeUIView(context: Context) -> ScreenBroadcastPickerHost { ScreenBroadcastPickerHost() }
    func updateUIView(_ uiView: ScreenBroadcastPickerHost, context: Context) {
        uiView.requestPresentation(presentationRequest)
    }
}

/// Present once after preparation and attachment to the window. Returning from
/// the system panel or a SwiftUI update must not open it again automatically.
private final class ScreenBroadcastPickerHost: UIView {
    private let picker = RPSystemBroadcastPickerView(frame: CGRect(x: 0, y: 0, width: 54, height: 54))
    private var pendingPresentation = 0
    private var handledPresentation = 0

    init() {
        super.init(frame: .zero)
        addSubview(picker)
        // Derive from the installed identifier because personal signing may
        // rewrite the container and extension bundle IDs together.
        if let plugins = Bundle.main.builtInPlugInsURL,
           let files = try? FileManager.default.contentsOfDirectory(at: plugins, includingPropertiesForKeys: nil),
           let extensionURL = files.first(where: { $0.pathExtension == "appex" }), let bundle = Bundle(url: extensionURL) {
            picker.preferredExtension = bundle.bundleIdentifier
        }
        picker.showsMicrophoneButton = false
        for button in picker.subviews.compactMap({ $0 as? UIButton }) {
            button.accessibilityLabel = "开始屏幕共享"
        }
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }
    override func layoutSubviews() {
        super.layoutSubviews()
        picker.frame = CGRect(x: (bounds.width - 54) / 2, y: 0, width: 54, height: 54)
    }
    override func didMoveToWindow() {
        super.didMoveToWindow()
        presentPendingRequest()
    }
    func requestPresentation(_ request: Int) {
        pendingPresentation = request
        presentPendingRequest()
    }
    private func presentPendingRequest() {
        guard window != nil, pendingPresentation > handledPresentation,
              let button = picker.subviews.compactMap({ $0 as? UIButton }).first else { return }
        let request = pendingPresentation
        handledPresentation = request
        DispatchQueue.main.async { [weak self, weak button] in
            guard let self, self.window != nil, self.pendingPresentation == request else { return }
            button?.sendActions(for: .touchUpInside)
        }
    }
}
