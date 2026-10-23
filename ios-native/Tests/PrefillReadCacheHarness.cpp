#include "huiyan-prefill-read-cache.h"
#include <array>
#include <atomic>
#include <cassert>
#include <cstdio>
#include <thread>

using cache = huiyan_prefill_read_cache;
struct expert {
    std::array<uint8_t, 17> gate;
    std::array<uint8_t, 23> up;
    std::array<uint8_t, 31> down;
    expert(int id = 0, int layer = 0) {
        for (size_t i = 0; i < gate.size(); ++i) gate[i] = (uint8_t) (id * 7 + layer + i);
        for (size_t i = 0; i < up.size(); ++i) up[i] = (uint8_t) (id * 11 + layer * 3 + i);
        for (size_t i = 0; i < down.size(); ++i) down[i] = (uint8_t) (id * 13 + layer * 5 + i);
    }
    std::array<cache::segment,3> parts() { return {{{gate.data(), gate.size()}, {up.data(), up.size()}, {down.data(), down.size()}}}; }
    bool operator==(const expert & x) const { return gate == x.gate && up == x.up && down == x.down; }
};

int main() {
    cache first(32,256,71), second(32,256,71);
    std::vector<int32_t> ids;
    for (int i = 0; i < 123; ++i) ids.push_back(i);
    auto run = [&](cache & c, int layer) {
        c.prepare(ids);
        std::atomic<int> cursor{0}, hits{0};
        auto worker = [&] {
            for (;;) {
                const int next = cursor.fetch_add(1);
                if (next >= (int) ids.size()) break;
                const int id = ids[(size_t) next];
                expert wanted(id,layer), output(253,17);
                auto parts = output.parts();
                if (c.copy_to(id,parts.data(),3)) hits++;
                else { output = wanted; parts = output.parts(); c.store(id,parts.data(),3); }
                assert(output == wanted); // Every family, including cold uncached experts.
            }
        };
        std::vector<std::thread> threads;
        for (int i = 0; i < 8; ++i) threads.emplace_back(worker);
        for (auto & t : threads) t.join();
        assert(c.retained_bytes() <= 32 * 71);
        return hits.load();
    };
    assert(run(first,0)==0);
    assert(run(first,0)==32); // A 123-expert scan must not churn away all 32 entries.
    assert(run(second,1)==0); // Layer identity must not leak weights.
    assert(run(second,1)==32);
    ids.clear(); for(int i=123;i<246;++i) ids.push_back(i);
    assert(run(first,0)==0); // Reassigned slots are invalid until genuinely filled.
    assert(run(first,0)==32);
    first.clear(); assert(first.retained_bytes()==0); assert(run(first,0)==0);
    auto invalid=ids;invalid.push_back(256);
    bool threw=false;try { first.prepare(invalid); } catch(const std::runtime_error &) { threw=true; } assert(threw);
    expert output; auto parts=output.parts(); parts[2].size--;
    threw=false;try { first.copy_to(123,parts.data(),3); } catch(const std::runtime_error &) { threw=true; } assert(threw);
    cache off(0,256,71);off.prepare(ids);parts=output.parts();assert(!off.store(123,parts.data(),3));assert(!off.copy_to(123,parts.data(),3));
    cache top(1,256,71);top.prepare({9,9,9,3});
    expert a(9),b(3);auto pa=a.parts(),pb=b.parts();
    assert(top.store(9,pa.data(),3));assert(!top.store(3,pb.data(),3));
    assert(top.copy_to(9,pb.data(),3));assert(a==b);
    std::puts("PASS: immutable bytes, all families, 8-worker access, admission/eviction, layer isolation and invalidation");
}
