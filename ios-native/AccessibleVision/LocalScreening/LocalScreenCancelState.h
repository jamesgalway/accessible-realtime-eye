#pragma once
#include <atomic>
#include <cstdint>
struct LocalScreenCancelState {
    std::atomic<bool> cancelled{true};
    std::atomic<int64_t> deadline{0};
    void reset(int64_t end) { deadline.store(end); cancelled.store(false); }
    void cancel() { cancelled.store(true); }
    bool shouldAbort(int64_t now) const {
        const auto end=deadline.load();
        return cancelled.load() || (end>0 && now>=end);
    }
};
