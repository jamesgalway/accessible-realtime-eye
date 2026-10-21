#include "../AccessibleVision/LocalScreening/LocalVisionFailure.h"
#include <cassert>
#include <iostream>
int main() {
    assert(huiyan_vision_cpu_retryable("Metal: GPU buffer allocation failed"));
    assert(huiyan_vision_cpu_retryable("clip_init: std::bad_alloc"));
    assert(huiyan_vision_cpu_retryable("failed to initialize GPU backend"));
    assert(!huiyan_vision_cpu_retryable("mismatch between text model and mmproj; Metal"));
    assert(!huiyan_vision_cpu_retryable("unknown projector type"));
    assert(!huiyan_vision_cpu_retryable("failed to open model buffer"));
    assert(!huiyan_vision_cpu_retryable("failed to initialize CPU backend"));
    assert(!huiyan_vision_cpu_retryable("Failed to load CLIP model"));
    std::cout << "Vision fallback: GPU allocation/backend only, incompatible or missing files preserved.\n";
}
