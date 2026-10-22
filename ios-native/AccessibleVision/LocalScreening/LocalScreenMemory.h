#include <stdint.h>
#include <stdbool.h>
#ifdef __cplusplus
extern "C" {
#endif
uint64_t huiyan_local_available_memory(void);
uint64_t huiyan_local_footprint(void);
void huiyan_local_vision_log_begin(const char * path, const char * metal_path);
void huiyan_local_log_gpu_state(const char * phase);
void huiyan_local_vision_log_clear_error(void);
const char * huiyan_local_vision_error(void);
int huiyan_local_vision_cpu_retryable(void);
void huiyan_local_vision_log_end(void);
void * huiyan_local_cancel_create(void);
void huiyan_local_cancel_free(void * state);
void huiyan_local_cancel_reset(void * state, double remaining_ms);
void huiyan_local_cancel_request(void * state);
bool huiyan_local_should_abort(void * state);
#ifdef __cplusplus
}
#endif
