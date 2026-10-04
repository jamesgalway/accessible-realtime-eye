import AVFoundation
import Foundation

/// Observes the system audio session. This class never changes its route or category.
final class NativeAudioDiagnostics {
    var onSnapshot: (([String: Any]) -> Void)?
    private var observers: [NSObjectProtocol] = []
    private var volumeObservation: NSKeyValueObservation?
    private var timer: Timer?
    private var running = false

    func start() {
        guard !running else { snapshot(reason: "media_reused"); return }
        running = true
        let session = AVAudioSession.sharedInstance()
        let center = NotificationCenter.default
        let notifications: [(Notification.Name, String)] = [
            (AVAudioSession.routeChangeNotification, "route_changed"),
            (AVAudioSession.interruptionNotification, "interruption"),
            (AVAudioSession.mediaServicesWereResetNotification, "media_services_reset")
        ]
        for (name, reason) in notifications {
            observers.append(center.addObserver(forName: name, object: session, queue: .main) { [weak self] notification in
                var detail: [String: Any] = [:]
                if let code = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? NSNumber {
                    detail["routeChangeReason"] = code.intValue
                }
                if let oldRoute = notification.userInfo?[AVAudioSessionRouteChangePreviousRouteKey] as? AVAudioSessionRouteDescription {
                    detail["previousOutputs"] = oldRoute.outputs.map { $0.portType.rawValue }
                }
                if let type = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? NSNumber {
                    detail["interruptionType"] = type.intValue
                }
                self?.snapshot(reason: reason, detail: detail)
            })
        }
        volumeObservation = session.observe(\.outputVolume, options: [.new]) { [weak self] _, _ in
            DispatchQueue.main.async { self?.snapshot(reason: "volume_changed") }
        }
        timer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            self?.snapshot(reason: "periodic")
        }
        snapshot(reason: "media_started")
    }

    func stop() {
        guard running else { return }
        snapshot(reason: "media_released")
        running = false
        timer?.invalidate()
        timer = nil
        observers.forEach { NotificationCenter.default.removeObserver($0) }
        observers.removeAll()
        volumeObservation?.invalidate()
        volumeObservation = nil
    }

    private func snapshot(reason: String, detail: [String: Any] = [:]) {
        guard running else { return }
        let session = AVAudioSession.sharedInstance()
        let route = session.currentRoute
        let outputs = route.outputs.map { $0.portType.rawValue }
        var packet: [String: Any] = [
            "version": "20261004.1",
            "nativeAt": ISO8601DateFormatter().string(from: Date()),
            "reason": reason,
            "source": "native_audio_session",
            "outputs": outputs,
            "inputs": route.inputs.map { $0.portType.rawValue },
            "receiver": route.outputs.contains { $0.portType == .builtInReceiver },
            "speaker": route.outputs.contains { $0.portType == .builtInSpeaker },
            "category": session.category.rawValue,
            "mode": session.mode.rawValue,
            "categoryOptions": session.categoryOptions.rawValue,
            "outputVolume": session.outputVolume,
            "sampleRate": session.sampleRate,
            "ioBufferDuration": session.ioBufferDuration,
            "otherAudioPlaying": session.isOtherAudioPlaying,
            "secondaryAudioShouldBeSilenced": session.secondaryAudioShouldBeSilencedHint
        ]
        for (key, value) in detail { packet[key] = value }
        onSnapshot?(packet)
    }

    deinit { stop() }
}
