// Local experiment API: fixed system state includes the hybrid model's recurrent state.
void mb_mtmd_local_set_abort(mb_mtmd_context * ctx, bool (*callback)(void *), void * data);
bool mb_mtmd_local_prepare_system(mb_mtmd_context * ctx, const char * text);
bool mb_mtmd_local_restore_system(mb_mtmd_context * ctx);
size_t mb_mtmd_local_system_size(mb_mtmd_context * ctx);
// Task data is a closed user message without an assistant generation header.
// This snapshot never contains a frame or generated result.
bool mb_mtmd_local_prepare_task(mb_mtmd_context * ctx, const char * text, bool * reused);
// Only the native screening experiment opts in; default is unchanged.
void mb_mtmd_local_set_vision_resident(mb_mtmd_context * ctx, bool enabled);
