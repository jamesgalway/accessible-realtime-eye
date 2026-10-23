"""Byte-preserving prefill read cache for the isolated 35B experiment."""
from pathlib import Path
import hashlib,json,shutil,sys

root=Path(sys.argv[1]);scripts=Path(__file__).resolve().parent
path=root/'src/llama-moe-slot.cpp';before=path.read_bytes();text=before.decode('utf-8')
def replace(old,new):
    global text
    assert text.count(old)==1,old[:120]
    text=text.replace(old,new,1)

replace('#include "llama-moe-slot.h"','#include "llama-moe-slot.h"\n#include "huiyan-prefill-read-cache.h"\n#include <memory>')
replace('    struct layer_state {','    struct layer_state {\n        std::unique_ptr<huiyan_prefill_read_cache> huiyan_read_cache;')
replace('    struct pending_install {','''    static int huiyan_read_cache_slots() {
        const char * value = std::getenv("HUIYAN_MOE_PREFILL_READ_CACHE");
        return value ? std::min(32, std::max(0, std::atoi(value))) : 0;
    }
    std::atomic<uint64_t> huiyan_cache_hits{0}, huiyan_cache_saved{0}, huiyan_cache_stores{0};

    struct pending_install {''')
replace('                                bool window_mode = false) {','                                bool window_mode = false, size_t * disk_bytes = nullptr, bool use_cache = false) {\n        if (disk_bytes) *disk_bytes = 0;')
replace('        const int fd = fd_for(path);\n        const size_t offset = base + (size_t) expert * stride;','''        huiyan_prefill_read_cache::segment cache_parts[8];
        for (int i = 0; i < n; ++i) cache_parts[i] = {iov[i].iov_base, iov[i].iov_len};
        const bool cached = mode == 0 && use_cache && !window_mode && state.huiyan_read_cache;
        if (cached) {
            const int64_t copy0 = now_ns();
            if (state.huiyan_read_cache->copy_to(expert, cache_parts, n)) {
                huiyan_cache_hits.fetch_add(1, std::memory_order_relaxed);
                huiyan_cache_saved.fetch_add(nbytes, std::memory_order_relaxed);
                return now_ns() - copy0;
            }
        }
        const int fd = fd_for(path);
        const size_t offset = base + (size_t) expert * stride;''')
replace('        stats.n_bytes.fetch_add(nbytes, std::memory_order_relaxed);\n        stats.n_miss.fetch_add(1, std::memory_order_relaxed);\n        return dt;','''        stats.n_bytes.fetch_add(nbytes, std::memory_order_relaxed);
        stats.n_miss.fetch_add(1, std::memory_order_relaxed);
        if (disk_bytes) *disk_bytes = nbytes;
        if (cached && state.huiyan_read_cache->store(expert, cache_parts, n)) {
            huiyan_cache_stores.fetch_add(1, std::memory_order_relaxed);
        }
        return dt;''')
replace('        std::vector<int64_t> dts((size_t) n, 0);','        std::vector<int64_t> dts((size_t) n, 0);\n        std::vector<size_t> disk_bytes((size_t) n, 0);')
replace('                    state, pending[(size_t) i].expert, pending[(size_t) i].slot, window_mode);','                    state, pending[(size_t) i].expert, pending[(size_t) i].slot, window_mode, &disk_bytes[(size_t) i], !window_mode);')
replace('        t.wall_ns = now_ns() - wall0;\n        for (int i = 0; i < n; ++i) {','        t.wall_ns = now_ns() - wall0;\n        t.bytes = 0;\n        for (int i = 0; i < n; ++i) {\n            t.bytes += disk_bytes[(size_t) i];')
replace('    const size_t count = experts.size();','''    if (n_rows > 1 && pimpl->huiyan_read_cache_slots() > 0) {
        if (!state.huiyan_read_cache) {
            state.huiyan_read_cache = std::make_unique<huiyan_prefill_read_cache>(
                pimpl->huiyan_read_cache_slots(), pimpl->n_expert, state.pack_bytes);
        }
        state.huiyan_read_cache->prepare(experts);
    }
    const size_t count = experts.size();''')
replace('        cur = ubatch_acc{};','''        if (huiyan_read_cache_slots() > 0) {
            moe_log("huiyan-prefill-cache slots=%d hits_total=%llu saved_bytes_total=%llu stores_total=%llu",
                huiyan_read_cache_slots(),
                (unsigned long long) huiyan_cache_hits.load(std::memory_order_relaxed),
                (unsigned long long) huiyan_cache_saved.load(std::memory_order_relaxed),
                (unsigned long long) huiyan_cache_stores.load(std::memory_order_relaxed));
        }
        cur = ubatch_acc{};''')
after=text.encode('utf-8');path.write_bytes(after)
header=root/'src/huiyan-prefill-read-cache.h';shutil.copyfile(scripts/header.name,header)
result={'version':'prefill-read-cache-v1','engineCommit':'96bbf61710d44421ea54e63f5194f9b17c20d877',
        'files':{'src/llama-moe-slot.cpp':{'before':hashlib.sha256(before).hexdigest(),'after':hashlib.sha256(after).hexdigest()},
                 'src/'+header.name:{'after':hashlib.sha256(header.read_bytes()).hexdigest()}},
        'scope':'Immutable weight bytes only; all routed experts retained; enabled only by explicit experiment environment.'}
Path(sys.argv[2]).write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print('Applied optional byte-preserving prefill read cache.')
