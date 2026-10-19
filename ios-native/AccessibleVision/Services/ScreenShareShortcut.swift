import SwiftUI
import AppIntents

/// Both Shortcuts and the public URL entry request the existing screen view.
/// The view consumes the request only after its scene becomes active.
@MainActor
final class ScreenShareLaunchRouter: ObservableObject {
    static let shared = ScreenShareLaunchRouter()
    @Published private(set) var pendingRequest: UUID?

    func request() { pendingRequest = UUID() }

    func handle(_ url: URL) {
        guard url.scheme?.lowercased() == "huiyan-screen",
              url.host?.lowercased() == "start",
              url.path.isEmpty || url.path == "/",
              url.user == nil, url.password == nil, url.port == nil,
              url.query == nil, url.fragment == nil else { return }
        request()
    }

    func consume() -> Bool {
        guard pendingRequest != nil else { return false }
        pendingRequest = nil
        return true
    }
}

struct StartHuiyanScreenSharingIntent: AppIntent {
    static let title: LocalizedStringResource = "开始屏幕共享"
    static let description = IntentDescription("打开谷歌屏幕共享。")
    // Supported by the project's iOS16 deployment target and Xcode16 SDK.
    static var openAppWhenRun: Bool { true }

    func perform() async throws -> some IntentResult {
        await MainActor.run { ScreenShareLaunchRouter.shared.request() }
        return .result()
    }
}

struct HuiyanScreenShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: StartHuiyanScreenSharingIntent(),
            phrases: [
                "用\(.applicationName)共享屏幕",
                "打开\(.applicationName)屏幕共享"
            ],
            shortTitle: "屏幕共享",
            systemImageName: "rectangle.on.rectangle"
        )
    }
}
