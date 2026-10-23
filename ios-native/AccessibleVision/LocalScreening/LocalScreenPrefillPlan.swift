import Foundation

// Isolated 35B experiment. Preserve routing/weights; vary batching and the
// capacity of the upstream per-layer cache, within the existing memory budget.
struct LocalScreenPrefillPlan {
    let requested: Bool
    let cacheSlots: Int
    let microBatch: Int
    let windowRows: Int
    var mode: String { windowRows == 4 ? "window4" : "baseline" }

    init(arguments: [String], is35B: Bool, affordableSlots: Int) {
        // Normal 35B experiment entry uses the candidate; the offline benchmark
        // defaults to the installed baseline unless explicitly asked otherwise.
        requested = is35B && (!arguments.contains("-huiyanLocalScreenBenchmark") ||
            arguments.contains("-huiyan35bWindowPrefill"))
        let cap = requested ? 56 : 32
        cacheSlots = is35B ? min(cap, max(0, affordableSlots - 8) / 8 * 8) : 0
        // Four rows can select at most 32 experts. Require the cache itself to
        // hold them even without the optional eight prefetch slots.
        let active = requested && cacheSlots >= 32
        microBatch = active ? 4 : 256
        windowRows = active ? 4 : 1
    }
}
