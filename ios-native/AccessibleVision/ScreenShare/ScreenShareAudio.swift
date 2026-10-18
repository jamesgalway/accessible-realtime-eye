import AVFoundation

/// Owned exclusively by the screen sharing entry. The camera and teaching
/// web views never instantiate this class or change their audio session here.
final class ScreenShareAudio: NSObject, AVSpeechSynthesizerDelegate {
    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private var converter: AVAudioConverter?
    private var activeContext: Int?
    private var generation = 0
    private var running = false
    private var ownsSession = false
    private var tapInstalled = false
    private(set) var inputBytes = 0
    private(set) var queuedPackets = 0
    private(set) var playedPackets = 0
    var diagnostics: [String: Any] {
        let session = AVAudioSession.sharedInstance()
        return ["inputBytes": inputBytes, "queuedPackets": queuedPackets, "playedPackets": playedPackets,
                "running": running, "voiceProcessing": engine.inputNode.isVoiceProcessingEnabled,
                "category": session.category.rawValue, "mode": session.mode.rawValue,
                "outputs": session.currentRoute.outputs.map { $0.portType.rawValue }]
    }
    private var observation: NSObjectProtocol?
    var onInput: ((Data) -> Void)?
    var onPlayed: ((Int) -> Void)?
    var onInterruption: (() -> Void)?
    var onSpeech: ((Int, String) -> Void)?
    private let speech = AVSpeechSynthesizer()
    private var speechIDs: [ObjectIdentifier: Int] = [:]
    private let format = AVAudioFormat(standardFormatWithSampleRate: 24000, channels: 1)!

    @MainActor
    func start() async throws {
        let permitted = await withCheckedContinuation { continuation in
            AVAudioSession.sharedInstance().requestRecordPermission { continuation.resume(returning: $0) }
        }
        try Task.checkCancellation()
        guard permitted else { throw NSError(domain: "ScreenShare", code: 1, userInfo: [NSLocalizedDescriptionKey: "请在系统设置中允许慧眼使用麦克风。"] ) }
        let session = AVAudioSession.sharedInstance()
        // Mix with the foreground video's audio and VoiceOver. Voice processing
        // can still reduce other audio; use its minimum ducking level below.
        try session.setCategory(.playAndRecord, mode: .default,
                                options: [.mixWithOthers, .defaultToSpeaker, .allowBluetooth, .allowBluetoothA2DP])
        try session.setActive(true)
        ownsSession = true
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: format)
        let input = engine.inputNode
        // Hardware echo cancellation uses the device output as reference. Keep
        // ReplayKit app audio out of the microphone path as a separate measure.
        try input.setVoiceProcessingEnabled(true)
        if #available(iOS 17.0, *) {
            input.voiceProcessingOtherAudioDuckingConfiguration = AVAudioVoiceProcessingOtherAudioDuckingConfiguration(
                enableAdvancedDucking: false, duckingLevel: .min)
        }
        speech.delegate = self
        speech.usesApplicationAudioSession = true
        let inputFormat = input.outputFormat(forBus: 0)
        guard inputFormat.sampleRate > 0,
              let target = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16000, channels: 1, interleaved: true),
              let converter = AVAudioConverter(from: inputFormat, to: target)
        else { throw NSError(domain: "ScreenShare", code: 2, userInfo: [NSLocalizedDescriptionKey: "麦克风暂时不可用。"] ) }
        self.converter = converter
        input.installTap(onBus: 0, bufferSize: 4096, format: inputFormat) { [weak self] buffer, _ in
            guard let self else { return }
            let capacity = AVAudioFrameCount(Double(buffer.frameLength) * 16000 / inputFormat.sampleRate + 32)
            guard let output = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: capacity) else { return }
            var supplied = false
            var error: NSError?
            converter.convert(to: output, error: &error) { _, status in
                if supplied { status.pointee = .noDataNow; return nil }
                supplied = true; status.pointee = .haveData; return buffer
            }
            guard error == nil, output.frameLength > 0, let samples = output.int16ChannelData?[0] else { return }
            let data = Data(bytes: samples, count: Int(output.frameLength) * 2)
            DispatchQueue.main.async { [weak self] in
                guard let self, self.running else { return }
                self.inputBytes += data.count
                self.onInput?(data)
            }
        }
        tapInstalled = true
        engine.prepare()
        try engine.start()
        player.play()
        running = true
        observation = NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification,
            object: session, queue: .main) { [weak self] note in
            guard (note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt) == AVAudioSession.InterruptionType.began.rawValue else { return }
            self?.onInterruption?()
        }
    }

    func enqueue(id: Int, context: Int, data: Data, rate: Double, delay: Double) {
        guard running, rate == 24000, data.count > 0, data.count % 2 == 0,
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(data.count / 2)),
              let channel = buffer.floatChannelData?[0] else { return }
        if activeContext != context {
            generation += 1; player.stop(); player.play(); activeContext = context
        }
        buffer.frameLength = buffer.frameCapacity
        data.withUnsafeBytes { raw in
            for i in 0..<Int(buffer.frameLength) {
                let sample = Int16(bitPattern: UInt16(raw[i * 2]) | UInt16(raw[i * 2 + 1]) << 8)
                channel[i] = Float(sample) / 32768
            }
        }
        let ticket = generation
        queuedPackets += 1
        // Completion is hardware playback completion, never enqueue acceptance.
        let when = AVAudioTime(hostTime: mach_absolute_time() + AVAudioTime.hostTime(forSeconds: max(0, delay)))
        player.scheduleBuffer(buffer, at: when, options: [], completionCallbackType: .dataPlayedBack) { [weak self] _ in
            DispatchQueue.main.async {
                guard let self, self.running, self.generation == ticket, self.activeContext == context else { return }
                self.playedPackets += 1
                self.onPlayed?(id)
            }
        }
    }

    func reset(context: Int) {
        guard activeContext == context else { return }
        generation += 1; player.stop()
        if running { player.play() }
        activeContext = nil
    }

    func speak(id: Int, text: String, rate: Float) {
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: "zh-CN")
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate * rate
        speechIDs[ObjectIdentifier(utterance)] = id
        speech.speak(utterance)
    }
    func cancelSpeech() { speech.stopSpeaking(at: .immediate); speechIDs.removeAll() }
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) {
        if let id = speechIDs[ObjectIdentifier(utterance)] { onSpeech?(id, "start") }
    }
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        if let id = speechIDs.removeValue(forKey: ObjectIdentifier(utterance)) { onSpeech?(id, "end") }
    }

    func stop() {
        running = false; generation += 1
        cancelSpeech()
        if let observation { NotificationCenter.default.removeObserver(observation) }
        observation = nil
        if tapInstalled { engine.inputNode.removeTap(onBus: 0); tapInstalled = false }
        player.stop(); engine.stop()
        if player.engine != nil { engine.detach(player) }
        converter = nil; activeContext = nil
        if ownsSession {
            ownsSession = false
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
    }
    deinit { stop() }
}
