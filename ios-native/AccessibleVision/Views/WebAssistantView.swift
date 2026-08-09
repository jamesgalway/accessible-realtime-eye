import SwiftUI

struct WebAssistantView: View {
    @StateObject private var torch = NativeTorchController()

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button(torch.isEnabled ? "关闭闪光灯" : "打开闪光灯") {
                    torch.toggle()
                }
                .buttonStyle(.borderedProminent)
                .accessibilityLabel(torch.isEnabled ? "关闭闪光灯" : "打开闪光灯")
                .accessibilityHint("固定按钮。双击后只在打开和关闭之间切换，不会由模型自动改变。")
                .accessibilitySortPriority(1000)

                Spacer(minLength: 0)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(.bar)
            .accessibilityElement(children: .contain)

            Divider()

            GreenCloudWebView(url: AppConfiguration.greenCloudBaseURL)
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
        }
    }
}
