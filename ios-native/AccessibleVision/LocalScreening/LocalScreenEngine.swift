import Foundation

struct LocalScreenMeasurement: Codable {
    let decision: String
    let rawText: String
    let totalMs: Double
    let firstTokenMs: Double
    let imageMs: Double
    let prefillMs: Double
    let decodeMs: Double
    let withinBudget: Bool
    let footprintBytes: UInt64
    let availableBytes: UInt64
    let cacheSlots: Int
}

final class LocalScreenEngine: @unchecked Sendable {
    private let queue = DispatchQueue(label: "com.zzypiano.local-screen35b", qos: .userInitiated)
    private let lock = NSLock()
    private var revision = 0
    private var context: OpaquePointer?
    private var cacheSlots = 0
    private static let model = "MiniCPM-V-4_7-35B-A3B-mix_q3gud_im-les.gguf"

    private func nextRevision() -> Int { lock.lock(); defer { lock.unlock() }; revision += 1; return revision }
    private func current(_ value: Int) -> Bool { lock.lock(); defer { lock.unlock() }; return value == revision }
    func cancel() { _ = nextRevision() }

    func unload() async {
        cancel()
        await withCheckedContinuation { continuation in
            queue.async { [self] in
                if let context { mb_mtmd_free(context) }
                context = nil
                continuation.resume()
            }
        }
    }

    func load(directory: URL) async throws -> Double {
        let token = nextRevision()
        return try await withCheckedThrowingContinuation { continuation in
            queue.async { [self] in
                do {
                    guard current(token) else { throw CancellationError() }
                    if let context { mb_mtmd_free(context); self.context = nil }
                    let started = ProcessInfo.processInfo.systemUptime
                    var params = mb_mtmd_params_default()
                    params.n_predict = 160; params.n_ctx = 4096; params.n_ubatch = 256
                    params.temperature = 0; params.image_max_slice_nums = 1
                    params.moe_slot_bank = 256
                    // Use upstream's actual 4k-context reserve and shrink the cache,
                    // including its supported zero-window mode. A speculative memory
                    // estimate must not prevent the engine attempting allocation.
                    let available = Int64(huiyan_local_available_memory())
                    let slotBytes: Int64 = (346_030_080 / 256) * 40
                    let footprint = Int64(huiyan_local_footprint())
                    let physicalGiB = Double(ProcessInfo.processInfo.physicalMemory) / 1_073_741_824
                    let ceiling = Int64(physicalGiB >= 13.5 ? 11 : physicalGiB >= 9.5 ? 6 : 5) * 1_073_741_824
                    let headroom = max(0, min(available > 0 ? available : ceiling - footprint, ceiling - footprint))
                    let reserve: Int64 = 2440 * 1_048_576
                    let affordable = max(0, Int((headroom - reserve) / slotBytes))
                    cacheSlots = min(32, max(0, affordable - 8) / 8 * 8)
                    params.moe_lookahead_prefetch_depth = cacheSlots > 0 ? 8 : 0
                    params.moe_decode_window = Int32(cacheSlots)
                    params.moe_prewarm_level = Int32(min(16, cacheSlots))
                    params.spec_draft_n_max = 0
                    let plan: [String:Any] = ["availableBytes":available,"footprintBytes":footprint,"physicalBytes":ProcessInfo.processInfo.physicalMemory,
                        "headroomBytes":headroom,"reserveBytes":reserve,"cacheSlots":cacheSlots,"ubatch":256,"activeExpertsPerLayer":8]
                    let planURL = FileManager.default.urls(for:.documentDirectory,in:.userDomainMask)[0].appendingPathComponent("local-screen-memory-plan.json")
                    try JSONSerialization.data(withJSONObject:plan,options:[.sortedKeys]).write(to:planURL,options:.atomic)
                    let model = directory.appendingPathComponent(Self.model).path
                    let vision = directory.appendingPathComponent("mmproj-model-f16.gguf").path
                    let experts = directory.appendingPathComponent("experts").path
                    let created = model.withCString { modelPath in vision.withCString { visionPath in experts.withCString { expertsPath in
                        mb_mtmd_init(modelPath, visionPath, expertsPath, nil, &params)
                    } } }
                    guard let created else { throw LocalScreenError.message(String(cString: mb_mtmd_last_init_error())) }
                    guard current(token) else { mb_mtmd_free(created); throw CancellationError() }
                    mb_mtmd_set_model_version(created, 47)
                    mb_mtmd_set_enable_thinking(created, false)
                    context = created
                    continuation.resume(returning: (ProcessInfo.processInfo.systemUptime - started) * 1000)
                } catch { continuation.resume(throwing: error) }
            }
        }
    }

    func screen(jpeg: Data, condition: String, capturedAt: TimeInterval, preparedPrompt: String? = nil) async throws -> LocalScreenMeasurement {
        let token = nextRevision()
        return try await withCheckedThrowingContinuation { continuation in
            queue.async { [self] in
                let temporary = FileManager.default.temporaryDirectory.appendingPathComponent("local-screen-\(UUID().uuidString).jpg")
                defer { try? FileManager.default.removeItem(at: temporary) }
                do {
                    guard current(token) else { throw CancellationError() }
                    guard let context else { throw LocalScreenError.message("请先加载35B模型。") }
                    guard mb_mtmd_clean_kv_cache(context) else { throw LocalScreenError.message("本地模型未能释放上一张图的上下文。") }
                    try jpeg.write(to: temporary)
                    mb_mtmd_perf_reset(context)
                    guard temporary.path.withCString({ mb_mtmd_prefill_image(context, $0) }) == 0 else {
                        throw LocalScreenError.message(String(cString: mb_mtmd_get_last_error(context)))
                    }
                    guard current(token) else { throw CancellationError() }
                    // Include expert prewarm in wall-clock latency; do not hide it
                    // between image selection and the timed generation step.
                    guard mb_mtmd_prewarm_after_image(context) == 0 else { throw LocalScreenError.message("专家预读失败。") }
                    let prompt = preparedPrompt ?? "只根据当前图片判断条件：\(condition)\n清晰满足输出HIT；清晰未满足输出NO_HIT；看不清或证据不足输出UNCERTAIN。只输出一个英文标记，不解释，不推断先前画面。"
                    guard prompt.withCString({ text in "user".withCString { mb_mtmd_prefill_text(context, text, $0) } }) == 0 else {
                        throw LocalScreenError.message(String(cString: mb_mtmd_get_last_error(context)))
                    }
                    var raw = "", firstToken = 0.0
                    for _ in 0..<(preparedPrompt == nil ? 12 : 160) {
                        guard current(token) else { throw CancellationError() }
                        let output = mb_mtmd_loop(context)
                        if let text = output.token {
                            if firstToken == 0 { firstToken = (ProcessInfo.processInfo.systemUptime - capturedAt) * 1000 }
                            raw += String(cString: text); mb_mtmd_string_free(text)
                        }
                        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
                        if output.is_end || (preparedPrompt == nil && ["HIT", "NO_HIT", "UNCERTAIN"].contains(trimmed)) { break }
                    }
                    guard current(token) else { throw CancellationError() }
                    let total = (ProcessInfo.processInfo.systemUptime - capturedAt) * 1000
                    let footprint = huiyan_local_footprint()
                    let available = huiyan_local_available_memory()
                    let perf = mb_mtmd_perf_snapshot(context)
                    let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
                    let decision = ["HIT", "NO_HIT", "UNCERTAIN"].contains(trimmed) ? trimmed : "UNCERTAIN"
                    continuation.resume(returning: LocalScreenMeasurement(decision: decision, rawText: raw,
                        totalMs: total, firstTokenMs: firstToken, imageMs: perf.image_encode_ms,
                        prefillMs: perf.prefill_ms, decodeMs: perf.decode_ms, withinBudget: total <= 3500,
                        footprintBytes: footprint, availableBytes: available, cacheSlots: cacheSlots))
                } catch { continuation.resume(throwing: error) }
            }
        }
    }
}
