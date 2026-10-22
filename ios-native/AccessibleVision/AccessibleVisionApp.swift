import SwiftUI
import AppIntents

@main
struct AccessibleVisionApp: App {
    init() {
        HuiyanScreenShortcuts.updateAppShortcutParameters()
    }

    var body: some Scene {
        WindowGroup {
            if ProcessInfo.processInfo.arguments.contains("-huiyanLocalScreenBenchmark") {
                LocalScreenBenchmarkView()
            } else {
                WebAssistantView()
            }
        }
    }
}
