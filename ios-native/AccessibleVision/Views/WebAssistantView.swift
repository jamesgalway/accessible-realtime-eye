import SwiftUI
import UIKit

struct WebAssistantView: View {
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var camera = NativeCameraService()
    @StateObject private var torch = NativeTorchController()
    @State private var selectedBackend: AssistantBackend = .greenCloud
    @State private var teachingMode = false
    @State private var screenSharingMode = false
    @StateObject private var screenSharing = ScreenShareController()
    @State private var mediaCaptureRequested = false

    private var selectedURL: URL {
        teachingMode ? selectedBackend.teachingBaseURL : selectedBackend.baseURL
    }

    var body: some View {
        VStack(spacing: 0) {
            if !screenSharingMode {
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
            }

            HStack(spacing: 12) {
                backendButton(.greenCloud)
                backendButton(.aliyun)
                teachingButton
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
            .background(.bar)
            .accessibilityElement(children: .contain)
            .accessibilityLabel("选择功能入口")

            Button("屏幕共享") {
                guard !screenSharingMode else { return }
                stopCurrentPageMedia()
                teachingMode = false
                screenSharingMode = true
            }
            .buttonStyle(.borderedProminent)
            .tint(screenSharingMode ? .accentColor : .secondary)
            .accessibilityValue(screenSharingMode ? "当前入口，绑定\(selectedBackend.title)" : "将绑定\(selectedBackend.title)")
            .accessibilityHint("进入独立屏幕共享；旧任务会结束")
            .padding(.bottom, 8)

            Divider()

            if screenSharingMode {
                ScreenShareView(backend: selectedBackend, controller: screenSharing)
            } else {
            GreenCloudWebView(
                url: selectedURL,
                backend: selectedBackend,
                camera: camera,
                onMediaCaptureRequested: {
                    mediaCaptureRequested = true
                    setIdleTimerDisabled(true)
                    camera.start()
                },
                onMediaCaptureReleased: {
                    mediaCaptureRequested = false
                    setIdleTimerDisabled(false)
                    torch.turnOff()
                    camera.stop()
                }
            )
            .id("\(selectedBackend.rawValue):\(teachingMode ? "teaching" : "assistant")")
            .frame(maxWidth: .infinity, maxHeight: .infinity)
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
            screenSharing.stop()
            setIdleTimerDisabled(false)
            torch.turnOff()
            camera.stop()
        }
        .onChange(of: scenePhase) { newPhase in
            if newPhase == .active, mediaCaptureRequested {
                setIdleTimerDisabled(true)
                camera.start()
            } else {
                setIdleTimerDisabled(false)
                torch.turnOff()
                camera.stop()
            }
        }
    }

    private func backendButton(_ backend: AssistantBackend) -> some View {
        let isSelected = selectedBackend == backend && !teachingMode && !screenSharingMode
        return Button(backend.title) {
            guard selectedBackend != backend || teachingMode || screenSharingMode else { return }
            stopCurrentPageMedia()
            selectedBackend = backend
            teachingMode = false
            screenSharingMode = false
        }
        .buttonStyle(.borderedProminent)
        .tint(isSelected ? .accentColor : .secondary)
        .accessibilityLabel(backend.title)
        .accessibilityValue(isSelected ? "当前入口" : "未选择")
        .accessibilityHint(isSelected ? "当前正在使用" : "双击切换到这个入口；旧任务会结束")
    }

    private var teachingButton: some View {
        Button("教学") {
            guard !teachingMode else { return }
            stopCurrentPageMedia()
            teachingMode = true
            screenSharingMode = false
        }
        .buttonStyle(.borderedProminent)
        .tint(teachingMode ? .accentColor : .secondary)
        .accessibilityLabel("教学")
        .accessibilityValue(
            teachingMode
                ? "当前教学入口，绑定\(selectedBackend.title)"
                : "将绑定\(selectedBackend.title)"
        )
        .accessibilityHint(
            teachingMode
                ? "当前正在使用"
                : "双击进入教学；教学会沿用当前选择的服务器入口和谷歌声音"
        )
    }

    private func stopCurrentPageMedia() {
        screenSharing.stop()
        mediaCaptureRequested = false
        setIdleTimerDisabled(false)
        torch.turnOff()
        camera.stop()
    }

    private func setIdleTimerDisabled(_ disabled: Bool) {
        UIApplication.shared.isIdleTimerDisabled = disabled
    }
}
