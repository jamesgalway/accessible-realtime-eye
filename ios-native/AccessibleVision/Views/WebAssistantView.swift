import SwiftUI
import UIKit

struct WebAssistantView: View {
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var camera = NativeCameraService()
    @StateObject private var torch = NativeTorchController()
    @State private var selectedBackend: AssistantBackend = .greenCloud
    private enum Section: String { case assistant, navigation, teaching }
    @State private var selectedSection: Section = .assistant
    @State private var screenSharingMode = false
    @State private var screenSharingPageHidden = false
    @State private var googleScreenRoute: ScreenShareGoogleRoute = .direct
    @StateObject private var screenSharing = ScreenShareController()
    @StateObject private var screenLaunch = ScreenShareLaunchRouter.shared
    @State private var screenSharingEntryID = UUID()
    @StateObject private var assistantEntries = NativeAssistantEntryController()
    @State private var mediaCaptureRequested = false

    private var teachingMode: Bool { selectedSection == .teaching }
    private var screenSharingPageVisible: Bool { screenSharingMode && !screenSharingPageHidden }

    private var selectedURL: URL {
        teachingMode ? selectedBackend.teachingBaseURL : selectedBackend.baseURL
    }

    var body: some View {
        GeometryReader { viewport in
        ScrollView {
        VStack(spacing: 0) {
            if screenSharingPageVisible {
                HStack {
                    Button("返回慧眼主界面") { screenSharingPageHidden = true }
                        .accessibilityIdentifier("nativeScreenShareBackButton")
                    Spacer(minLength: 0)
                }
                .buttonStyle(.bordered)
                .padding(.horizontal, 16)
                .padding(.bottom, 8)
            }
            if !screenSharingPageVisible {
            HStack(spacing: 12) {
                backendButton(.aliyun)
                backendButton(.greenCloud)
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
            .background(.bar)

            HStack {
                AccessibleTorchButton(isEnabled: torch.isEnabled) { torch.toggle() }
                    .frame(width: 180, height: 44)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 8)

            HStack(spacing: 12) {
                sectionButton(.assistant, title: "慧眼")
                sectionButton(.navigation, title: "导航")
                sectionButton(.teaching, title: "教学")
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 8)

            if selectedSection == .assistant {
                HStack(spacing: 12) {
                    if selectedBackend == .aliyun {
                        Button("谷歌声音") { openAssistant(.googleVoice) }
                            .disabled(!screenSharingMode && !assistantEntries.googleVoiceAvailable)
                            .accessibilityIdentifier("nativeAliGoogleVoiceButton")
                    }
                    Button("实时慧眼") { openAssistant(.unified) }
                        .disabled(!screenSharingMode && !assistantEntries.unifiedAvailable)
                        .accessibilityIdentifier("nativeUnifiedAssistantButton")
                    if selectedBackend == .greenCloud {
                    Button("直连筛图") { openAssistant(.directScreen) }
                        .disabled(!screenSharingMode && !assistantEntries.directScreenAvailable)
                        .accessibilityIdentifier("nativeDirectScreenAssistantButton")
                    } else {
                        Button("实时视频实验") { openAssistant(.aliVideo) }
                            .disabled(!screenSharingMode && !assistantEntries.aliVideoAvailable)
                            .accessibilityLabel("阿里实时视频实验")
                            .accessibilityIdentifier("nativeAliVideoAssistantButton")
                    }
                }
                .buttonStyle(.borderedProminent)
                .padding(.horizontal, 16)
                .padding(.bottom, 8)
                HStack(spacing: 12) {
                    if selectedBackend == .greenCloud {
                        Button("共享直连") { openScreenShare(.direct) }
                            .accessibilityIdentifier("nativeDirectScreenShareButton")
                            .accessibilityValue(screenSharingMode && googleScreenRoute == .direct ? "已选择" : "未选择")
                        Button("共享绿云") { openScreenShare(.relay) }
                            .accessibilityIdentifier("nativeRelayScreenShareButton")
                            .accessibilityValue(screenSharingMode && googleScreenRoute == .relay ? "已选择" : "未选择")
                    } else {
                        Button("屏幕共享") { openScreenShare(.direct) }
                            .accessibilityIdentifier("nativeScreenShareButton")
                            .accessibilityValue(screenSharingMode ? "已选择" : "未选择")
                    }
                    Button(screenSharingMode ? "结束共享" : "结束慧眼") {
                        if screenSharingMode {
                            stopCurrentPageMedia()
                            screenSharingMode = false
                        } else {
                            assistantEntries.start(.stop, backend: selectedBackend)
                        }
                    }
                    .disabled(!screenSharingMode && !assistantEntries.stopAvailable)
                    .accessibilityIdentifier("nativeEndAssistantButton")
                }
                .buttonStyle(.borderedProminent)
                .padding(.horizontal, 16)
                .padding(.bottom, 8)
                if !assistantEntries.status.isEmpty { Text(assistantEntries.status) }
            }

            Divider()
                .accessibilityHidden(true)
            if screenSharingMode {
                ScreenShareTaskContent(controller: screenSharing)
                    .padding(.horizontal, 16)
            }
            }

            if screenSharingPageVisible {
                ScreenShareView(backend: selectedBackend, googleRoute: googleScreenRoute, controller: screenSharing)
                    .id("\(selectedBackend.rawValue):\(googleScreenRoute.rawValue):\(screenSharingEntryID)")
                    .frame(height: max(320, viewport.size.height - 270))
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
                entryController: !teachingMode ? assistantEntries : nil,
                presentationSection: selectedSection.rawValue
            )
            .id("\(selectedBackend.rawValue):\(teachingMode ? "teaching" : "assistant")")
            .frame(maxWidth: .infinity)
            .frame(height: max(320, viewport.size.height - 270))
            .accessibilityIdentifier("nativeWebContent")
            }
        }
        .frame(minHeight: viewport.size.height, alignment: .top)
        }
        .accessibilityIdentifier("nativeAppScroll")
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
        .onAppear { consumeScreenShareShortcut() }
        .onChange(of: screenLaunch.pendingRequest) { _ in consumeScreenShareShortcut() }
        .onDisappear {
            screenSharing.stop()
            setIdleTimerDisabled(false)
            torch.turnOff()
            camera.stop()
        }
        .onChange(of: scenePhase) { newPhase in
            if newPhase == .active { consumeScreenShareShortcut() }
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
        let isSelected = selectedBackend == backend
        let title = backend == .greenCloud ? "Gemini版" : "阿里百炼"
        return Button(title) {
            guard selectedBackend != backend else { return }
            stopCurrentPageMedia()
            selectedBackend = backend
            screenSharingMode = false
        }
        .buttonStyle(.borderedProminent)
        .tint(isSelected ? .accentColor : .secondary)
        .accessibilityLabel(title)
        .accessibilityValue(isSelected ? "已选择" : "未选择")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityIdentifier("nativeBackend-\(backend.rawValue)")
    }

    private func sectionButton(_ section: Section, title: String) -> some View {
        let isSelected = selectedSection == section
        return Button(title) {
            guard selectedSection != section || screenSharingMode else { return }
            if !teachingMode && section != .teaching && assistantEntries.stopAvailable {
                assistantEntries.start(.stop, backend: selectedBackend)
            }
            stopCurrentPageMedia()
            selectedSection = section
            screenSharingMode = false
        }
        .buttonStyle(.borderedProminent)
        .tint(isSelected ? .accentColor : .secondary)
        .accessibilityLabel(title)
        .accessibilityValue(isSelected ? "已选择，\(selectedBackend.title)" : "未选择")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityIdentifier("nativeSection-\(section.rawValue)")
    }

    private func stopCurrentPageMedia() {
        screenSharing.stop()
        screenSharingPageHidden = false
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
        guard entry != .googleVoice || selectedBackend == .aliyun else { return }
        guard entry != .aliVideo || selectedBackend == .aliyun else { return }
        if screenSharingMode {
            stopCurrentPageMedia()
            screenSharingMode = false
            assistantEntries.startWhenReady(entry, backend: selectedBackend)
        } else {
            assistantEntries.start(entry, backend: selectedBackend)
        }
    }

    private func openScreenShare(_ route: ScreenShareGoogleRoute) {
        if screenSharingMode, googleScreenRoute == route {
            screenSharingPageHidden = false
            return
        }
        stopCurrentPageMedia()
        googleScreenRoute = route
        screenSharingMode = true
    }

    private func consumeScreenShareShortcut() {
        guard scenePhase == .active, screenLaunch.consume() else { return }
        if selectedBackend == .greenCloud, selectedSection == .assistant, screenSharingMode,
           screenSharing.preparing || screenSharing.prepared {
            screenSharingPageHidden = false
            screenSharing.requestBroadcastPanelIfNeeded()
            return
        }
        stopCurrentPageMedia()
        selectedBackend = .greenCloud
        selectedSection = .assistant
        googleScreenRoute = .direct
        screenSharingEntryID = UUID()
        screenSharingMode = true
    }
}
