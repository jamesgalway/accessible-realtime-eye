#pragma once
#include <algorithm>
#include <cstdint>
#include <cstring>
#include <mutex>
#include <numeric>
#include <stdexcept>
#include <vector>

// Caches immutable expert BYTES, never activations, routing or image evidence.
// Retain the most frequent experts from the current batch, rather than ordinary
// LRU: a scan of 100+ experts would evict a 32-slot LRU before the next frame.
class huiyan_prefill_read_cache {
public:
    struct segment { void * data; size_t size; };
    huiyan_prefill_read_cache(int capacity, int experts, size_t bytes)
        : capacity_(std::min(32, std::max(0, capacity))), bytes_(bytes),
          entries_((size_t) capacity_), index_((size_t) experts, -1),
          score_((size_t) experts, 0) {
        if (experts <= 0 || bytes == 0) throw std::runtime_error("invalid expert read cache shape");
    }

    // Called once per layer/batch, before any I/O workers begin. An explicit
    // admission set keeps cold misses from evicting selected reusable experts.
    void prepare(const std::vector<int32_t> & ids) {
        std::vector<uint32_t> counts(index_.size(), 0);
        for (int32_t id : ids) {
            if (id < 0 || (size_t) id >= counts.size()) throw std::runtime_error("invalid cached expert id");
            counts[(size_t) id]++;
        }
        std::lock_guard<std::mutex> lock(mutex_);
        if (disabled_) return;
        std::vector<int> ranked;
        for (size_t id = 0; id < counts.size(); ++id) {
            score_[id] = score_[id] / 2 + counts[id];
            if (counts[id]) ranked.push_back((int) id);
        }
        std::sort(ranked.begin(), ranked.end(), [&](int a, int b) {
            return score_[(size_t) a] != score_[(size_t) b]
                ? score_[(size_t) a] > score_[(size_t) b] : a < b;
        });
        if (ranked.size() > (size_t) capacity_) ranked.resize((size_t) capacity_);
        std::vector<bool> selected(counts.size(), false);
        for (int id : ranked) selected[(size_t) id] = true;
        for (auto & entry : entries_) {
            if (entry.id >= 0 && !selected[(size_t) entry.id]) { entry.id = -1; entry.valid = false; }
        }
        std::fill(index_.begin(), index_.end(), -1);
        for (size_t slot = 0; slot < entries_.size(); ++slot) {
            if (entries_[slot].id >= 0) index_[(size_t) entries_[slot].id] = (int) slot;
        }
        for (int id : ranked) {
            if (index_[(size_t) id] >= 0) continue;
            auto it = std::find_if(entries_.begin(), entries_.end(), [](const entry & e) { return e.id < 0; });
            if (it == entries_.end()) throw std::runtime_error("expert read cache admission overflow");
            it->id = id; it->valid = false;
            index_[(size_t) id] = (int) (it - entries_.begin());
        }
    }

    bool copy_to(int id, const segment * out, int n) const {
        validate(out, n);
        std::lock_guard<std::mutex> lock(mutex_);
        const int slot = lookup(id);
        if (slot < 0 || !entries_[(size_t) slot].valid) return false;
        size_t offset = 0;
        for (int i = 0; i < n; ++i) {
            std::memcpy(out[i].data, entries_[(size_t) slot].data.data() + offset, out[i].size);
            offset += out[i].size;
        }
        return true;
    }

    bool store(int id, const segment * src, int n) {
        validate(src, n);
        std::lock_guard<std::mutex> lock(mutex_);
        const int slot = lookup(id);
        if (slot < 0) return false;
        auto & e = entries_[(size_t) slot];
        e.valid = false;
        try { e.data.resize(bytes_); }
        catch (const std::bad_alloc &) { release_locked(); disabled_ = true; return false; }
        size_t offset = 0;
        for (int i = 0; i < n; ++i) {
            std::memcpy(e.data.data() + offset, src[i].data, src[i].size);
            offset += src[i].size;
        }
        e.valid = true;
        return true;
    }

    void clear() { std::lock_guard<std::mutex> lock(mutex_); release_locked(); }
    size_t retained_bytes() const {
        std::lock_guard<std::mutex> lock(mutex_);
        size_t bytes = 0;
        for (const auto & e : entries_) bytes += e.data.size();
        return bytes;
    }
private:
    struct entry { int id = -1; bool valid = false; std::vector<uint8_t> data; };
    const int capacity_;
    const size_t bytes_;
    std::vector<entry> entries_;
    std::vector<int> index_;
    std::vector<uint32_t> score_;
    mutable std::mutex mutex_;
    bool disabled_ = false;
    int lookup(int id) const {
        if (disabled_ || id < 0 || (size_t) id >= index_.size()) return -1;
        return index_[(size_t) id];
    }
    void validate(const segment * parts, int n) const {
        if (!parts || n <= 0 || n > 8) throw std::runtime_error("invalid expert cache segments");
        size_t total = 0;
        for (int i = 0; i < n; ++i) {
            if (!parts[i].data || parts[i].size > bytes_ - total) throw std::runtime_error("invalid expert cache segment size");
            total += parts[i].size;
        }
        if (total != bytes_) throw std::runtime_error("incomplete expert cache segments");
    }
    void release_locked() {
        for (auto & e : entries_) { e.id = -1; e.valid = false; std::vector<uint8_t>().swap(e.data); }
        std::fill(index_.begin(), index_.end(), -1);
        std::fill(score_.begin(), score_.end(), 0);
    }
};
