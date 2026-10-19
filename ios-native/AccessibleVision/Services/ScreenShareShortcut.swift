import SwiftUI
import AppIntents
import OSLog
import UIKit

/// Both Shortcuts and the public URL entry request the existing screen view.
/// The view consumes the request only after its scene becomes active.
@MainActor
final class ScreenShareLaunchRouter: ObservableObject {
    static let shared = ScreenShareLaunchRouter()
    @Published private(set) var pendingRequest: UUID?
    private let logger = Logger(subsystem: Bundle.main.bundleIdentifier ?? "AccessibleVision", category: "ScreenShareShortcut")

    func request() {
        logger.notice("screen_share.shortcut_requested")
        pendingRequest = UUID()
    }

    func handle(_ url: URL) -> Bool {
        guard url.scheme?.lowercased() == "huiyan-screen",
              url.host?.lowercased() == "start",
              url.path.isEmpty || url.path == "/",
              url.user == nil, url.password == nil, url.port == nil,
              url.query == nil, url.fragment == nil else { return false }
        request()
        return true
    }

    func consume() -> Bool {
        guard pendingRequest != nil else { return false }
        logger.notice("screen_share.shortcut_consumed")
        pendingRequest = nil
        return true
    }
}

struct StartHuiyanScreenSharingIntent: AppIntent {
    static let title: LocalizedStringResource = "开始屏幕共享"
    static let description = IntentDescription("打开谷歌屏幕共享。")
    // Supported by the project's iOS16 deployment target and Xcode16 SDK.
    static var openAppWhenRun: Bool { true }

    @MainActor
    func perform() async throws -> some IntentResult {
        let logger = Logger(subsystem: Bundle.main.bundleIdentifier ?? "AccessibleVision", category: "ScreenShareShortcut")
        logger.notice("screen_share.shortcut_open_requested")
        let opened = await UIApplication.shared.open(URL(string: "huiyan-screen://start")!, options: [:])
        logger.notice("screen_share.shortcut_open_result: \(opened)")
        guard opened else { throw ScreenShareShortcutError.cannotOpen }
        return .result()
    }
}

private enum ScreenShareShortcutError: LocalizedError {
    case cannotOpen
    var errorDescription: String? { "无法打开屏幕共享入口，请从慧眼主界面打开。" }
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
