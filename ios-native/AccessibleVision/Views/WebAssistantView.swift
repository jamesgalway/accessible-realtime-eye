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
    @StateObject private var screenSharing = ScreenShareController()
    @StateObject private var assistantEntries = NativeAssistantEntryController()
    @State private var mediaCaptureRequested = false

    private var teachingMode: Bool { selectedSection == .teaching }

    private var selectedURL: URL {
        teachingMode ? selectedBackend.teachingBaseURL : selectedBackend.baseURL
    }

    var body: some View {
        GeometryReader { viewport in
        ScrollView {
        VStack(spacing: 0) {
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
                    Button("屏幕共享") {
                        guard !screenSharingMode else { return }
                        stopCurrentPageMedia()
                        screenSharingMode = true
                    }
                    .accessibilityIdentifier("nativeScreenShareButton")
                    .accessibilityValue(screenSharingMode ? "已选择" : "未选择")
                    Button("结束慧眼") {
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
                ScreenShareView(backend: selectedBackend, controller: screenSharing)
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
            .id("\(selectedBackend.rawValue):\(selectedSection.rawValue)")
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
        if screenSharingMode {
            stopCurrentPageMedia()
            screenSharingMode = false
            assistantEntries.startWhenReady(entry, backend: selectedBackend)
        } else {
            assistantEntries.start(entry, backend: selectedBackend)
        }
    }
}
