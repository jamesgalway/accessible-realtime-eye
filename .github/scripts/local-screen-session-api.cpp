void mb_mtmd_local_set_abort(mb_mtmd_context * ctx, bool (*callback)(void *), void * data) {
    if (ctx && ctx->lctx) llama_set_abort_callback(ctx->lctx.get(), callback, data);
}
void mb_mtmd_local_set_vision_resident(mb_mtmd_context * ctx, bool enabled) {
    if (!ctx) return;
    ctx->local_keep_vision = enabled;
    if (!enabled) mb_release_vision(ctx,"local residency released");
    mb_logf("[huiyan-local] vision residency: %s",enabled ? "retained across frames" : "original release/reload");
}
bool mb_mtmd_local_prepare_system(mb_mtmd_context * ctx, const char * text) {
    if (!ctx || !ctx->lctx || !text || !*text) return false;
    if (!ctx->local_system_state.empty() && ctx->local_system_text == text) return true;
    ctx->local_system_state.clear();
    ctx->local_task_state.clear();
    ctx->local_task_text.clear();
    if (!mb_mtmd_clean_kv_cache(ctx) || mb_mtmd_prefill_text(ctx,text,"system") != 0) return false;
    const size_t size = llama_state_seq_get_size(ctx->lctx.get(),0);
    if (!size) { set_error(ctx,"Fixed system state snapshot is empty"); return false; }
    try { ctx->local_system_state.resize(size); }
    catch (const std::exception & error) { set_error(ctx,error.what()); return false; }
    if (llama_state_seq_get_data(ctx->lctx.get(),ctx->local_system_state.data(),size,0) != size) {
        ctx->local_system_state.clear(); set_error(ctx,"Fixed system state snapshot failed"); return false;
    }
    ctx->local_system_n_past = ctx->n_past;
    ctx->local_system_text = text;
    mb_logf("[huiyan-local] fixed system prepared once: tokens=%d state_bytes=%zu",ctx->n_past,size);
    return true;
}
bool mb_mtmd_local_restore_system(mb_mtmd_context * ctx) {
    if (!ctx || !ctx->lctx || ctx->local_system_state.empty()) return false;
    if (!mb_mtmd_clean_kv_cache(ctx)) return false;
    const size_t size = ctx->local_system_state.size();
    if (llama_state_seq_set_data(ctx->lctx.get(),ctx->local_system_state.data(),size,0) != size) {
        mb_mtmd_clean_kv_cache(ctx); set_error(ctx,"Fixed system state restore failed"); return false;
    }
    ctx->n_past = ctx->local_system_n_past;
    llama_sampler_reset(ctx->sampler.get());
    mb_logf("[huiyan-local] fixed system restored; previous frame/task removed: tokens=%d",ctx->n_past);
    return true;
}
size_t mb_mtmd_local_system_size(mb_mtmd_context * ctx) { return ctx ? ctx->local_system_state.size() : 0; }

bool mb_mtmd_local_prepare_task(mb_mtmd_context * ctx, const char * text, bool * reused) {
    if (reused) *reused = false;
    if (!ctx || !ctx->lctx || !text || !*text) return false;
    const bool cached = !ctx->local_task_state.empty() && ctx->local_task_text == text;
    if (!cached) {
        ctx->local_task_state.clear();
        ctx->local_task_text.clear();
        if (!mb_mtmd_local_restore_system(ctx)
            || mb_mtmd_prefill_text(ctx,text,"local_reminder_task") != 0) return false;
        const size_t size = llama_state_seq_get_size(ctx->lctx.get(),0);
        if (!size) { set_error(ctx,"Task state snapshot is empty"); return false; }
        try { ctx->local_task_state.resize(size); }
        catch (const std::exception & error) { set_error(ctx,error.what()); return false; }
        if (llama_state_seq_get_data(ctx->lctx.get(),ctx->local_task_state.data(),size,0) != size) {
            ctx->local_task_state.clear(); set_error(ctx,"Task state snapshot failed"); return false;
        }
        ctx->local_task_n_past = ctx->n_past;
        ctx->local_task_text = text;
        mb_logf("[huiyan-local] visual question prepared once: tokens=%d state_bytes=%zu",ctx->n_past,size);
        return true;
    }
    if (!mb_mtmd_clean_kv_cache(ctx)) return false;
    const size_t size = ctx->local_task_state.size();
    if (llama_state_seq_set_data(ctx->lctx.get(),ctx->local_task_state.data(),size,0) != size) {
        mb_mtmd_clean_kv_cache(ctx); set_error(ctx,"Task state restore failed"); return false;
    }
    ctx->n_past = ctx->local_task_n_past;
    llama_sampler_reset(ctx->sampler.get());
    if (reused) *reused = true;
    mb_logf("[huiyan-local] visual question restored; prior frame/result removed: tokens=%d",ctx->n_past);
    return true;
}
