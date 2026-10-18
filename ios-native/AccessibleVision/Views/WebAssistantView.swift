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
    @StateObject private var assistantEntries = NativeAssistantEntryController()
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
                backendButton(.aliyun)
                backendButton(.greenCloud)
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
            .background(.bar)

            HStack(spacing: 12) {
                teachingButton
                Button("屏幕共享") {
                    guard !screenSharingMode else { return }
                    stopCurrentPageMedia()
                    teachingMode = false
                    screenSharingMode = true
                }
                .buttonStyle(.borderedProminent)
                .tint(screenSharingMode ? .accentColor : .secondary)
                .accessibilityIdentifier("nativeScreenShareButton")
                .accessibilityValue(screenSharingMode ? "当前入口，绑定\(selectedBackend.title)" : "将绑定\(selectedBackend.title)")
                .accessibilityHint("进入独立屏幕共享；旧任务会结束")
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 8)

                HStack(spacing: 12) {
                    Button("实时慧眼") { openAssistant(.unified) }
                        .disabled(!teachingMode && !screenSharingMode && !assistantEntries.unifiedAvailable)
                        .accessibilityIdentifier("nativeUnifiedAssistantButton")
                    if selectedBackend == .greenCloud {
                    Button("直连筛图") { openAssistant(.directScreen) }
                        .disabled(!teachingMode && !screenSharingMode && !assistantEntries.directScreenAvailable)
                        .accessibilityHint("启动原来的手机直连筛图方案")
                        .accessibilityIdentifier("nativeDirectScreenAssistantButton")
                    } else {
                        Button("实时视频实验") { openAssistant(.aliVideo) }
                            .disabled(!teachingMode && !screenSharingMode && !assistantEntries.aliVideoAvailable)
                            .accessibilityLabel("阿里实时视频实验")
                            .accessibilityIdentifier("nativeAliVideoAssistantButton")
                    }
                }
                .buttonStyle(.borderedProminent)
                .padding(.horizontal, 16)
                .padding(.bottom, 8)
                if !assistantEntries.status.isEmpty { Text(assistantEntries.status) }

            if screenSharingMode {
                Button("返回慧眼") {
                    stopCurrentPageMedia()
                    teachingMode = false
                    screenSharingMode = false
                }
                .buttonStyle(.bordered)
                .accessibilityHint("结束屏幕共享，返回慧眼页面")
                .padding(.bottom, 8)
            }

            Divider()
                .accessibilityHidden(true)

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
                },
                entryController: !teachingMode ? assistantEntries : nil
            )
            .id("\(selectedBackend.rawValue):\(teachingMode ? "teaching" : "assistant")")
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .accessibilityIdentifier("nativeWebContent")
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
        let title = backend == .greenCloud ? "Gemini版" : "阿里百炼"
        return Button(title) {
            guard selectedBackend != backend || teachingMode || screenSharingMode else { return }
            stopCurrentPageMedia()
            selectedBackend = backend
            teachingMode = false
            screenSharingMode = false
        }
        .buttonStyle(.borderedProminent)
        .tint(isSelected ? .accentColor : .secondary)
        .accessibilityLabel(title)
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
        assistantEntries.cancelPending()
        mediaCaptureRequested = false
        setIdleTimerDisabled(false)
        torch.turnOff()
        camera.stop()
    }

    private func setIdleTimerDisabled(_ disabled: Bool) {
        UIApplication.shared.isIdleTimerDisabled = disabled
    }

    private func openAssistant(_ entry: NativeAssistantEntryController.Entry) {
        guard entry != .directScreen || selectedBackend == .greenCloud else { return }
        guard entry != .aliVideo || selectedBackend == .aliyun else { return }
        if teachingMode || screenSharingMode {
            stopCurrentPageMedia()
            teachingMode = false
            screenSharingMode = false
            assistantEntries.startWhenReady(entry, backend: selectedBackend)
        } else {
            assistantEntries.start(entry, backend: selectedBackend)
        }
    }
}
