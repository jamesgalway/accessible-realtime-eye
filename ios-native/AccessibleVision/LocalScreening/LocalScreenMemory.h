#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
uint64_t huiyan_local_available_memory(void);
uint64_t huiyan_local_footprint(void);
void huiyan_local_vision_log_begin(const char * path);
void huiyan_local_vision_log_clear_error(void);
const char * huiyan_local_vision_error(void);
int huiyan_local_vision_cpu_retryable(void);
void huiyan_local_vision_log_end(void);
#ifdef __cplusplus
}
#endif
