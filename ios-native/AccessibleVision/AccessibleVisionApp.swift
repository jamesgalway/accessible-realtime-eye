import SwiftUI
import AppIntents

@main
struct AccessibleVisionApp: App {
    init() {
        HuiyanScreenShortcuts.updateAppShortcutParameters()
    }

    var body: some Scene {
        WindowGroup {
            WebAssistantView()
                .onOpenURL { ScreenShareLaunchRouter.shared.handle($0) }
        }
    }
}
