import SwiftUI

struct WebAssistantView: View {
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var camera = NativeCameraService()
    @StateObject private var torch = NativeTorchController()
    @State private var selectedBackend: AssistantBackend?

    var body: some View {
        Group {
            if let selectedBackend {
                liveAssistant(for: selectedBackend)
            } else {
                entrySelection
            }
        }
        .alert(
            "闪光灯不可用",
            isPresented: Binding(
                get: { !torch.errorMessage.isEmpty },
                set: { if !$0 { torch.clearError() } }
            )
        ) {
            Button("好", role: .cancel) {}
        } message: {
            Text(torch.errorMessage)
        }
        .onDisappear {
            torch.turnOff()
            camera.stop()
        }
        .onChange(of: scenePhase) { newPhase in
            if newPhase == .active, selectedBackend != nil {
                camera.start()
            } else {
                torch.turnOff()
                camera.stop()
            }
        }
    }

    private var entrySelection: some View {
        VStack(spacing: 20) {
            Text("实时慧眼")
                .font(.largeTitle)
                .accessibilityAddTraits(.isHeader)

            Text("请选择要进入的版本。进入后才会启动摄像头和麦克风；返回本页后会立即关闭，以节省电量。")
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)

            ForEach(AssistantBackend.allCases) { backend in
                Button("打开\(backend.title)") {
                    selectedBackend = backend
                }
                .buttonStyle(.borderedProminent)
                .frame(maxWidth: .infinity)
                .accessibilityHint("双击进入实时慧眼，并启动摄像头和麦克风")
            }

            Text("当前摄像头、麦克风和 LiDAR 均未启动。")
                .font(.footnote)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityLabel("当前摄像头、麦克风和雷达均未启动")
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    private func liveAssistant(for backend: AssistantBackend) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Button("返回入口选择") {
                    leaveLiveAssistant()
                }
                .buttonStyle(.bordered)
                .accessibilityHint("双击返回，并关闭摄像头、麦克风和雷达")

                Spacer(minLength: 0)

                AccessibleTorchButton(isEnabled: torch.isEnabled) {
                    torch.toggle()
                }
                .frame(width: 180, height: 44)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(.bar)

            Text("当前入口：\(backend.title)")
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 16)
                .padding(.bottom, 8)
                .background(.bar)
                .accessibilityLabel("当前入口，\(backend.title)")

            Divider()

            GreenCloudWebView(
                url: backend.baseURL,
                backend: backend,
                camera: camera
            )
            .id(backend.rawValue)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .onAppear {
            camera.start()
        }
        .onDisappear {
            torch.turnOff()
            camera.stop()
        }
    }

    private func leaveLiveAssistant() {
        torch.turnOff()
        camera.stop()
        selectedBackend = nil
    }
}
