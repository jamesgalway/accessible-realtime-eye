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
uint64_t huiyan_local_available_memory(void) { return os_proc_available_memory(); }
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
static void vision_log(enum ggml_log_level level, const char * text, void *) {
    if (!text) return;
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
void huiyan_local_vision_log_begin(const char * path) {
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
void huiyan_local_vision_log_end(void) { mtmd_log_set(nullptr, nullptr); }
