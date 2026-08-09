import SwiftUI

struct WebAssistantView: View {
    @StateObject private var torch = NativeTorchController()

    var body: some View {
        VStack(spacing: 0) {
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
