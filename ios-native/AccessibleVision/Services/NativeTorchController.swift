import AVFoundation
import SwiftUI

@MainActor
final class NativeTorchController: ObservableObject {
    @Published private(set) var isEnabled = false
    @Published private(set) var errorMessage = ""

    func toggle() {
        setEnabled(!isEnabled)
    }

    func turnOff() {
        setEnabled(false)
    }

    func clearError() {
        errorMessage = ""
    }

    private func setEnabled(_ enabled: Bool) {
        guard let device = AVCaptureDevice.default(
            .builtInWideAngleCamera,
            for: .video,
            position: .back
        ), device.hasTorch else {
            isEnabled = false
            errorMessage = "这台设备没有可用的后置闪光灯。"
            return
        }

        do {
            try device.lockForConfiguration()
            defer { device.unlockForConfiguration() }
            if enabled, device.isTorchModeSupported(.on) {
                try device.setTorchModeOn(level: 1)
            } else {
                device.torchMode = .off
            }
            isEnabled = enabled && device.torchMode == .on
            errorMessage = ""
        } catch {
            isEnabled = false
            errorMessage = "闪光灯切换失败。"
        }
    }
}
