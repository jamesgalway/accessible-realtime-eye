from pathlib import Path
import subprocess,sys
root=Path(__file__).resolve().parents[2];out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
api=(root/'.github/scripts/local-screen-session-api.cpp').read_text(encoding='utf-8')
bridge=(Path(sys.argv[2])/'MBMtmd.mm').read_text(encoding='utf-8')
start=bridge.index('static bool mb_release_vision(')
release=bridge[start:bridge.index('// Counterpart to mb_release_vision()',start)]
code=r'''
#include <cassert>
#include <cstring>
#include <cstdint>
#include <memory>
#include <string>
#include <vector>
#include "LocalScreenCancelState.h"
using llama_pos=int;
struct Lctx{std::vector<uint8_t> state;};
struct mb_mtmd_context{bool local_keep_vision=false;std::unique_ptr<int> vision{new int(1)};std::unique_ptr<Lctx> lctx{new Lctx};std::unique_ptr<int> sampler{new int(1)};
 std::vector<uint8_t> local_system_state,local_task_state;std::string local_system_text,local_task_text,pending_image,last_error;
 int local_system_n_past=0,local_task_n_past=0,n_past=0;};
int prefills=0,resets=0;bool restoreFailure=false,sizeFailure=false;
void llama_set_abort_callback(Lctx*,bool(*)(void*),void*){}
bool mb_mtmd_clean_kv_cache(mb_mtmd_context*ctx){ctx->lctx->state.clear();ctx->n_past=0;ctx->pending_image.clear();return true;}
int mb_mtmd_prefill_text(mb_mtmd_context*ctx,const char*text,const char*role){assert(std::string(role)=="system"||std::string(role)=="local_reminder_task");++prefills;
 ctx->lctx->state.insert(ctx->lctx->state.end(),text,text+std::strlen(text));ctx->n_past=static_cast<int>(ctx->lctx->state.size());return 0;}
size_t llama_state_seq_get_size(Lctx*ctx,int){return sizeFailure?0:ctx->state.size();}
size_t llama_state_seq_get_data(Lctx*ctx,uint8_t*data,size_t size,int){std::memcpy(data,ctx->state.data(),size);return size;}
size_t llama_state_seq_set_data(Lctx*ctx,const uint8_t*data,size_t size,int){if(restoreFailure)return 0;ctx->state.assign(data,data+size);return size;}
void llama_sampler_reset(int*){++resets;}
void mb_logf(const char*,...){}
void set_error(mb_mtmd_context*ctx,const std::string&e){ctx->last_error=e;}
int visionReleases=0;
bool mb_unload_mmproj_enabled(){return true;}
bool mtmd_vision_loaded(int*ptr){return *ptr!=0;}
bool mtmd_vision_unload(int*ptr){*ptr=0;++visionReleases;return true;}
double footprint_mib(){return 0;}
void mb_log_mem(const char*){}
'''+release+api+r'''
int main(){
 mb_mtmd_context ctx;assert(mb_mtmd_local_prepare_system(&ctx,"fixed rules"));
 mb_mtmd_local_set_vision_resident(&ctx,true);assert(ctx.local_keep_vision&&visionReleases==0);
 assert(!mb_release_vision(&ctx,"next frame")&&visionReleases==0);
 mb_mtmd_local_set_vision_resident(&ctx,false);assert(!ctx.local_keep_vision&&visionReleases==1);
 assert(!mb_release_vision(nullptr,"no context"));
 auto fixed=ctx.lctx->state;int position=ctx.n_past;
 assert(mb_mtmd_local_prepare_system(&ctx,"fixed rules"));assert(prefills==1);
 for(int task=0;task<2;++task){ctx.lctx->state={'o','l','d'};ctx.n_past=100;ctx.pending_image="prior scene";
  assert(mb_mtmd_local_restore_system(&ctx));assert(ctx.lctx->state==fixed);assert(ctx.n_past==position);assert(ctx.pending_image.empty());}
 assert(resets==2&&prefills==1);
 bool reused=true;assert(mb_mtmd_local_prepare_task(&ctx,"question A",&reused)&&!reused);auto taskA=ctx.lctx->state;
 assert(prefills==2&&taskA.size()>fixed.size());
 ctx.lctx->state.push_back('X');ctx.pending_image="old frame";
 assert(mb_mtmd_local_prepare_task(&ctx,"question A",&reused)&&reused);
 assert(ctx.lctx->state==taskA&&ctx.pending_image.empty()&&prefills==2);
 assert(mb_mtmd_local_prepare_task(&ctx,"question B",&reused)&&!reused&&prefills==3);
 assert(ctx.lctx->state!=taskA&&std::string(ctx.lctx->state.begin(),ctx.lctx->state.end())=="fixed rulesquestion B");
 restoreFailure=true;assert(!mb_mtmd_local_prepare_task(&ctx,"question B",&reused)&&!reused);
 assert(ctx.lctx->state.empty());restoreFailure=false;
 restoreFailure=true;assert(!mb_mtmd_local_restore_system(&ctx));assert(ctx.n_past==0&&ctx.lctx->state.empty());restoreFailure=false;
 sizeFailure=true;assert(!mb_mtmd_local_prepare_system(&ctx,"changed rules"));assert(!mb_mtmd_local_restore_system(&ctx));
 LocalScreenCancelState cancellation;cancellation.reset(100);assert(!cancellation.shouldAbort(99));assert(cancellation.shouldAbort(100));
 cancellation.reset(0);assert(!cancellation.shouldAbort(999));cancellation.cancel();assert(cancellation.shouldAbort(0));
 cancellation.reset(200);assert(!cancellation.shouldAbort(199));assert(cancellation.shouldAbort(201));
}
'''
(out/'test.cpp').write_text(code,encoding='utf-8')
subprocess.run(['clang++','-std=c++17','-I',str(root/'ios-native/AccessibleVision/LocalScreening'),str(out/'test.cpp'),'-o',str(out/'test')],check=True)
subprocess.run([str(out/'test')],check=True)
print('PASS: original release retained by default, opted-in residency skips release, warning releases vision; isolated cached questions, failed restore and cancellation checks passed.')
