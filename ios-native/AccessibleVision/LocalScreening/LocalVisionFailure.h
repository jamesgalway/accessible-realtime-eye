#pragma once
#include <algorithm>
#include <cctype>
#include <string>

inline bool huiyan_vision_cpu_retryable(std::string detail) {
    std::transform(detail.begin(), detail.end(), detail.begin(),
        [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
    // CPU cannot repair incompatible files or the shared CPU backend itself.
    for (const char * invalid : {"mismatch", "unknown projector", "failed to open",
            "failed to seek", "does this file exist", "tensor not found",
            "failed to initialize cpu backend"}) {
        if (detail.find(invalid) != std::string::npos) return false;
    }
    for (const char * hardware : {"metal", "gpu", "alloc", "buffer", "backend"}) {
        if (detail.find(hardware) != std::string::npos) return true;
    }
    return false;
}
