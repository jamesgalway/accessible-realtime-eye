import SwiftUI

struct WebAssistantView: View {
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var camera = NativeCameraService()
    @StateObject private var torch = NativeTorchController()
    @State private var selectedBackend: AssistantBackend = .greenCloud
    @State private var mediaCaptureRequested = false

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                AccessibleTorchButton(isEnabled: torch.isEnabled) {
                    torch.toggle()
                }
                .frame(width: 180, height: 44)
                .accessibilitySortPriority(1000)

                Spacer(minLength: 0)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(.bar)

            HStack(spacing: 12) {
                backendButton(.greenCloud)
                backendButton(.aliyun)
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
            .background(.bar)
            .accessibilityElement(children: .contain)
            .accessibilityLabel("选择识别模型")

            Divider()

            GreenCloudWebView(
                url: selectedBackend.baseURL,
                backend: selectedBackend,
                camera: camera,
                onMediaCaptureRequested: {
                    mediaCaptureRequested = true
                    camera.start()
                },
                onMediaCaptureReleased: {
                    mediaCaptureRequested = false
                    torch.turnOff()
                    camera.stop()
                }
            )
            .id(selectedBackend.rawValue)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
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
            if newPhase == .active, mediaCaptureRequested {
                camera.start()
            } else {
                torch.turnOff()
                camera.stop()
            }
        }
    }

    private func backendButton(_ backend: AssistantBackend) -> some View {
        let isSelected = selectedBackend == backend
        return Button(backend.title) {
            guard selectedBackend != backend else { return }
            mediaCaptureRequested = false
            torch.turnOff()
            camera.stop()
            selectedBackend = backend
        }
        .buttonStyle(.borderedProminent)
        .tint(isSelected ? .accentColor : .secondary)
        .accessibilityLabel(backend.title)
        .accessibilityValue(isSelected ? "当前入口" : "未选择")
        .accessibilityHint(isSelected ? "当前正在使用" : "双击切换到这个入口；旧任务会结束")
    }
}
