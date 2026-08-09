import SwiftUI

struct WebAssistantView: View {
    @StateObject private var torch = NativeTorchController()

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            GreenCloudWebView(url: AppConfiguration.greenCloudBaseURL)
                .ignoresSafeArea()

            Button(torch.isEnabled ? "关闭闪光灯" : "打开闪光灯") {
                torch.toggle()
            }
            .buttonStyle(.borderedProminent)
            .padding(16)
            .accessibilityHint("只在打开和关闭之间切换，不会由模型自动改变。")
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
        }
    }
}
