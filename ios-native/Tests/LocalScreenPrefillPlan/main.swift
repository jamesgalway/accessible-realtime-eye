import Foundation

let offline = ["app", "-huiyanLocalScreenBenchmark", "-huiyan35bWindowPrefill"]
for affordable in 0...256 {
    let baseline = LocalScreenPrefillPlan(arguments: ["-huiyanLocalScreenBenchmark"], is35B: true, affordableSlots: affordable)
    let normal = LocalScreenPrefillPlan(arguments: [], is35B: true, affordableSlots: affordable)
    let trial = LocalScreenPrefillPlan(arguments: offline, is35B: true, affordableSlots: affordable)
    let dense = LocalScreenPrefillPlan(arguments: offline, is35B: false, affordableSlots: affordable)
    assert(baseline.cacheSlots == min(32, max(0, affordable - 8) / 8 * 8))
    assert(baseline.microBatch == 256 && baseline.windowRows == 1 && !baseline.requested)
    assert(normal.cacheSlots == trial.cacheSlots && normal.microBatch == trial.microBatch && normal.requested)
    assert(dense.cacheSlots == 0 && dense.microBatch == 256 && !dense.requested)
    assert(trial.cacheSlots <= 56 && trial.cacheSlots % 8 == 0)
    if trial.cacheSlots > 0 { assert(trial.cacheSlots + 8 <= affordable) }
    if trial.windowRows > 1 {
        assert(trial.microBatch == trial.windowRows)
        assert(trial.windowRows * 8 <= trial.cacheSlots)
    } else {
        assert(trial.microBatch == 256 && trial.cacheSlots < 32)
    }
}
print("PASS: baseline comparison, 1B isolation, memory bounds and full top-8 batch capacity")
