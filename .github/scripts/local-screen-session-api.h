// Local experiment API: fixed system state includes the hybrid model's recurrent state.
void mb_mtmd_local_set_abort(mb_mtmd_context * ctx, bool (*callback)(void *), void * data);
bool mb_mtmd_local_prepare_system(mb_mtmd_context * ctx, const char * text);
bool mb_mtmd_local_restore_system(mb_mtmd_context * ctx);
size_t mb_mtmd_local_system_size(mb_mtmd_context * ctx);
