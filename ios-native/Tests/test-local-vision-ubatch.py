"""Exercise the actual adaptive function with the patched initialization."""
from pathlib import Path
import subprocess,sys
bridge=Path(sys.argv[1])/'MBMtmd.mm';out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
text=bridge.read_text(encoding='utf-8')
expr=text.split('ctx->ubatch_adaptive = ',1)[1].split(';',1)[0]
start=text.index('static bool moe_adaptive_ubatch(mb_mtmd_context * ctx, bool has_image, int n_tokens) {')
function=text[start:text.index('\nmb_mtmd_context * mb_mtmd_init(',start)]
code=r'''
#include <cassert>
#include <cstdio>
#include <cstdint>
struct Params{int n_ubatch;};
struct mb_mtmd_context{bool ubatch_adaptive=false;int n_past=0,n_ubatch_cur=128,n_ctx_cur=4096;bool moe_window_active=false,text_only=false;};
bool pinned=false;int rebuilds=0;
bool moe_ubatch_pinned(){return pinned;}
int32_t moe_ub_for_tokens(bool,int){return 2048;}
int32_t moe_ub_window_max(){return 1024;}
bool recreate_lctx(mb_mtmd_context*ctx,int,int want){++rebuilds;ctx->n_ubatch_cur=want;return true;}
void initialize(mb_mtmd_context *ctx,Params params){ctx->ubatch_adaptive='''+expr+r''';}
'''+function+r'''
int main(){
 for(int batch:{128,256}){mb_mtmd_context ctx;ctx.n_ubatch_cur=batch;initialize(&ctx,{batch});
  assert(!ctx.ubatch_adaptive);assert(!moe_adaptive_ubatch(&ctx,true,0));
  assert(!moe_adaptive_ubatch(&ctx,false,4000));assert(ctx.n_ubatch_cur==batch);}
 assert(rebuilds==0);
 mb_mtmd_context automatic;initialize(&automatic,{0});assert(automatic.ubatch_adaptive);
 assert(moe_adaptive_ubatch(&automatic,true,0));assert(rebuilds==1);
 mb_mtmd_context ongoing;ongoing.n_past=1;initialize(&ongoing,{0});
 assert(!moe_adaptive_ubatch(&ongoing,true,0));assert(rebuilds==1);
}
'''
code=code.replace('#include <cstdint>','#include <cstdint>\n#include <initializer_list>')
(out/'test.cpp').write_text(code,encoding='utf-8')
subprocess.run(['clang++','-std=c++17',str(out/'test.cpp'),'-o',str(out/'test')],check=True)
subprocess.run([str(out/'test')],check=True)
print('PASS: explicit 128/256 stays fixed for image/text prefill; default adaptive mode and existing KV protection preserved.')
