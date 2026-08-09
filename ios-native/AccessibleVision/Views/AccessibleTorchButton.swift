import SwiftUI
import UIKit

struct AccessibleTorchButton: UIViewRepresentable {
    let isEnabled: Bool
    let action: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(action: action)
    }

    func makeUIView(context: Context) -> UIButton {
        let button = UIButton(type: .system)
        button.configuration = .filled()
        button.isAccessibilityElement = true
        button.accessibilityTraits = .button
        button.accessibilityIdentifier = "nativeTorchButton"
        button.addTarget(
            context.coordinator,
            action: #selector(Coordinator.activate),
            for: .touchUpInside
        )
        return button
    }

    func updateUIView(_ button: UIButton, context: Context) {
        context.coordinator.action = action
        button.setTitle(isEnabled ? "关闭闪光灯" : "打开闪光灯", for: .normal)
        button.accessibilityLabel = "闪光灯"
        button.accessibilityValue = isEnabled ? "已打开" : "已关闭"
        button.accessibilityHint = isEnabled ? "双击关闭闪光灯" : "双击打开闪光灯"
    }

    final class Coordinator: NSObject {
        var action: () -> Void

        init(action: @escaping () -> Void) {
            self.action = action
        }

        @objc func activate() {
            action()
        }
    }
}

