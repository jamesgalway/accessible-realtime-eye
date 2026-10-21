#include "LocalScreenMemory.h"
#include <os/proc.h>
#include <mach/mach.h>
uint64_t huiyan_local_available_memory(void) { return os_proc_available_memory(); }
uint64_t huiyan_local_footprint(void) {
    task_vm_info_data_t info = {};
    mach_msg_type_number_t count = TASK_VM_INFO_COUNT;
    if (task_info(mach_task_self(), TASK_VM_INFO, (task_info_t)&info, &count) != KERN_SUCCESS) return 0;
    return info.phys_footprint;
}
