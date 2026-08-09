import AVFoundation
import SwiftUI

struct HardwareFoundationView: View {
    @StateObject private var camera = NativeCameraService()
    @State private var serverStatus = "尚未检查绿云连接。"
    @State private var checkingServer = false
    private let speaker = AVSpeechSynthesizer()

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                ARCameraPreview(camera: camera)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: 12))

                Text(camera.statusText)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityLabel("硬件状态，\(camera.statusText)")

                Text(serverStatus)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityLabel("服务器状态，\(serverStatus)")

                HStack(spacing: 12) {
                    Button(camera.isRunning ? "停止相机" : "启动相机") {
                        camera.isRunning ? camera.stop() : camera.start()
                    }
                    .buttonStyle(.borderedProminent)

                    Button(camera.torchEnabled ? "关闭闪光灯" : "打开闪光灯") {
                        camera.toggleTorch()
                    }
                    .buttonStyle(.bordered)
                    .disabled(!camera.isRunning)
                    .accessibilityHint("只在打开和关闭之间切换，不会自动改变。")
                }

                HStack(spacing: 12) {
                    Button("读出正前方距离") {
                        speakCenterDistance()
                    }
                    .buttonStyle(.bordered)
                    .disabled(!camera.isRunning || !camera.lidarAvailable)

                    Button(checkingServer ? "正在检查" : "检查绿云") {
                        Task { await probeServer() }
                    }
                    .buttonStyle(.bordered)
                    .disabled(checkingServer)
                }
            }
            .padding()
            .navigationTitle("原生硬件验证")
            .task {
                camera.start()
                await probeServer()
            }
            .onDisappear {
                camera.stop()
            }
        }
    }

    private func speakCenterDistance() {
        let text: String
        if let meters = camera.centerDistanceMeters {
            text = String(format: "正前方大约 %.1f 米。", meters)
        } else {
            text = "暂时没有取得可靠的正前方距离。"
        }
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: "zh-CN")
        speaker.stopSpeaking(at: .immediate)
        speaker.speak(utterance)
    }

    @MainActor
    private func probeServer() async {
        checkingServer = true
        defer { checkingServer = false }
        do {
            try await GreenCloudClient().probe()
            serverStatus = "绿云服务连接正常。"
        } catch {
            serverStatus = "绿云服务连接失败：\(error.localizedDescription)"
        }
    }
}

