"""Opt-in one-marker fast return. Never leave an advanced but missing KV position."""
from pathlib import Path
import hashlib,json,sys
root=Path(sys.argv[1]);manifest={'version':'opt-in-binary-before-feedback-v1','files':{}}
for name in ['MBMtmd.h','MBMtmd.mm']:
 p=root/name;before=p.read_bytes();s=before.decode('utf-8')
 if name.endswith('.h'):
  needle='// Release all resources owned by the context.';assert s.count(needle)==1
  s=s.replace(needle,'// Only binary screening may return before feedback; next use must clean/restore.\nvoid mb_mtmd_local_set_binary_fast_return(mb_mtmd_context * ctx, bool enabled);\n'+needle,1)
 else:
  needle='struct mb_mtmd_context {';assert s.count(needle)==1
  s=s.replace(needle,needle+'\n    bool local_binary_fast_return = false;\n    bool local_binary_requires_restore = false;',1)
  needle='bool mb_mtmd_clean_kv_cache(mb_mtmd_context * ctx) {\n    if (!ctx || !ctx->lctx) return false;'
  assert s.count(needle)==1
  s=s.replace(needle,needle+'\n    ctx->local_binary_requires_restore = false;',1)
  for signature in ['int mb_mtmd_prefill_image(mb_mtmd_context * ctx, const char * image_path) {',
    'int mb_mtmd_prefill_text(mb_mtmd_context * ctx, const char * text_in, const char * role_in) {']:
   assert s.count(signature)==1
   s=s.replace(signature,signature+'\n    if (ctx && ctx->local_binary_requires_restore) { set_error(ctx, "binary result requires clean/restore before reuse"); return -1; }',1)
  signature='mb_mtmd_token mb_mtmd_loop(mb_mtmd_context * ctx) {';assert s.count(signature)==1
  helper='''static bool mb_local_binary_piece(const std::string & piece) {
    size_t a = 0, b = piece.size();
    auto space = [](unsigned char c) { return c == ' ' || c == '\\t' || c == '\\r' || c == '\\n'; };
    while (a < b && space((unsigned char) piece[a])) ++a;
    while (b > a && space((unsigned char) piece[b-1])) --b;
    return b == a+1 && (piece[a] == 'Y' || piece[a] == 'N');
}
'''
  s=s.replace(signature,helper+'\n'+signature,1)
  needle='    if (!ctx || !ctx->lctx || !ctx->sampler) return result;';assert s.count(needle)==1
  s=s.replace(needle,needle+'\n    if (ctx->local_binary_requires_restore) { set_error(ctx, "binary result requires clean/restore before reuse"); return result; }',1)
  needle='    std::string piece = is_eog ? std::string() : token_to_piece_impl(ctx->vocab, tok);';assert s.count(needle)==1
  early='''
    // The caller ends at Y/N and restores a full KV/SSM snapshot next frame.
    // These logits already contain the complete image/question computation.
    // Do not evaluate the chosen output token just to throw its state away.
    if (ctx->local_binary_fast_return && !is_eog && ctx->cached_piece.empty() && mb_local_binary_piece(piece)) {
        ctx->local_binary_requires_restore = true;
        ctx->perf_decode_tokens += 1;
        ctx->perf_decode_ms += std::max(0.0, now_ms() - t0);
        result.token = static_cast<char *>(malloc(piece.size()+1));
        if (!result.token) { set_error(ctx, "binary result allocation failed"); return result; }
        memcpy(result.token,piece.data(),piece.size()); result.token[piece.size()] = '\\0';
        result.is_end = false;
        return result;
    }
'''
  s=s.replace(needle,needle+early,1)
  s+='\nvoid mb_mtmd_local_set_binary_fast_return(mb_mtmd_context * ctx, bool enabled) {\n    if (ctx) ctx->local_binary_fast_return = enabled;\n}\n'
 after=s.encode('utf-8');p.write_bytes(after)
 manifest['files'][name]={'before':hashlib.sha256(before).hexdigest(),'after':hashlib.sha256(after).hexdigest()}
(root/'bridge-binary-fast-return-patch.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print('Installed opt-in binary fast return; explicit context cleanup required before reuse.')
