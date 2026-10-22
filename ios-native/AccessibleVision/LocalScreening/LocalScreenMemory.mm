#include "LocalScreenMemory.h"
#include <os/proc.h>
#include <mach/mach.h>
#include <llama/mtmd.h>
#include <algorithm>
#include <cctype>
#include <cstdio>
#include <mutex>
#include <string>
#include "LocalVisionFailure.h"
#import <Metal/Metal.h>
#include <fcntl.h>
#include <unistd.h>
#include <cstring>
#include <chrono>
#include "LocalScreenCancelState.h"
uint64_t huiyan_local_available_memory(void) { return os_proc_available_memory(); }
static int64_t local_now_ns() {
    return std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::steady_clock::now().time_since_epoch()).count();
}
void * huiyan_local_cancel_create(void) { return new LocalScreenCancelState; }
void huiyan_local_cancel_free(void * state) { delete static_cast<LocalScreenCancelState *>(state); }
void huiyan_local_cancel_reset(void * state,double remaining_ms) {
    if (state) static_cast<LocalScreenCancelState *>(state)->reset(remaining_ms>0 ? local_now_ns()+static_cast<int64_t>(remaining_ms*1e6) : 0);
}
void huiyan_local_cancel_request(void * state) { if(state) static_cast<LocalScreenCancelState *>(state)->cancel(); }
bool huiyan_local_should_abort(void * state) { return !state || static_cast<LocalScreenCancelState *>(state)->shouldAbort(local_now_ns()); }
uint64_t huiyan_local_footprint(void) {
    task_vm_info_data_t info = {};
    mach_msg_type_number_t count = TASK_VM_INFO_COUNT;
    if (task_info(mach_task_self(), TASK_VM_INFO, (task_info_t)&info, &count) != KERN_SUCCESS) return 0;
    return info.phys_footprint;
}

// mtmd/CLIP has its own logger. The upstream bridge only persists selected
// llama messages, so a projection failure otherwise loses its underlying cause.
static std::mutex visionLogMutex;
static std::string visionLogPath, visionErrors;
static size_t visionLogBytes = 0;
static int savedEngineStderr = -1;
void huiyan_local_log_gpu_state(const char * phase) {
    @autoreleasepool {
        id<MTLDevice> device = MTLCreateSystemDefaultDevice();
        if (!device) { fprintf(stderr, "[huiyan-gpu] %s no Metal device\n", phase); return; }
        fprintf(stderr, "[huiyan-gpu] %s device=%s maxBufferLength=%llu recommendedWorkingSet=%llu allocated=%llu processAvailable=%llu footprint=%llu\n",
            phase, device.name.UTF8String,
            (unsigned long long)device.maxBufferLength, (unsigned long long)device.recommendedMaxWorkingSetSize,
            (unsigned long long)device.currentAllocatedSize, (unsigned long long)huiyan_local_available_memory(),
            (unsigned long long)huiyan_local_footprint());
        fflush(stderr);
#if !__has_feature(objc_arc)
        [device release];
#endif
    }
}
static void vision_log(enum ggml_log_level level, const char * text, void *) {
    if (!text) return;
    if (strstr(text, "model size:")) huiyan_local_log_gpu_state("before-vision-weights");
    std::lock_guard<std::mutex> guard(visionLogMutex);
    if (level == GGML_LOG_LEVEL_ERROR) {
        visionErrors += text;
        if (visionErrors.size() > 8192) visionErrors.erase(0, visionErrors.size() - 8192);
    }
    if (level < GGML_LOG_LEVEL_INFO || visionLogBytes > 2 * 1024 * 1024) return;
    if (FILE * file = fopen(visionLogPath.c_str(), "a")) {
        visionLogBytes += fprintf(file, "%s", text);
        fclose(file);
    }
}
void huiyan_local_vision_log_begin(const char * path, const char * metal_path) {
    // Preserve the engine's original callbacks while capturing the Metal driver
    // messages they write to stderr. Restore the descriptor when loading ends.
    fflush(stderr);
    const int output = open(metal_path, O_WRONLY | O_CREAT | O_TRUNC, 0600);
    if (output >= 0) {
        savedEngineStderr = dup(STDERR_FILENO);
        if (savedEngineStderr >= 0 && dup2(output, STDERR_FILENO) < 0) {
            close(savedEngineStderr); savedEngineStderr = -1;
        }
        close(output);
    }
    huiyan_local_log_gpu_state("capture-start");
    {
        std::lock_guard<std::mutex> guard(visionLogMutex);
        visionLogPath = path ? path : ""; visionErrors.clear(); visionLogBytes = 0;
        if (FILE * file = fopen(visionLogPath.c_str(), "w")) fclose(file);
    }
    mtmd_log_set(vision_log, nullptr);
}
void huiyan_local_vision_log_clear_error(void) {
    std::lock_guard<std::mutex> guard(visionLogMutex);
    visionErrors.clear();
}
const char * huiyan_local_vision_error(void) {
    static thread_local std::string snapshot;
    std::lock_guard<std::mutex> guard(visionLogMutex);
    snapshot = visionErrors;
    return snapshot.c_str();
}
int huiyan_local_vision_cpu_retryable(void) {
    std::lock_guard<std::mutex> guard(visionLogMutex);
    return huiyan_vision_cpu_retryable(visionErrors);
}
void huiyan_local_vision_log_end(void) {
    mtmd_log_set(nullptr, nullptr);
    fflush(stderr);
    if (savedEngineStderr >= 0) {
        dup2(savedEngineStderr, STDERR_FILENO); close(savedEngineStderr); savedEngineStderr = -1;
    }
}
