from pathlib import Path
import subprocess,sys
root=Path(__file__).resolve().parents[2];out=Path(sys.argv[1]);bridge=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
s=(bridge/'MBMtmd.mm').read_text(encoding='utf-8')
start=s.index('static bool mb_local_binary_piece(')
end=s.index('\n}',s.index('mb_mtmd_token mb_mtmd_loop(',start))+2
body=s[start:end]
for sig in ['bool mb_mtmd_clean_kv_cache(mb_mtmd_context * ctx) {','int mb_mtmd_prefill_image(mb_mtmd_context * ctx, const char * image_path) {','int mb_mtmd_prefill_text(mb_mtmd_context * ctx, const char * text_in, const char * role_in) {']:
 p=s.index(sig);scope=s[p:p+400]
 assert ('local_binary_requires_restore = false' if sig.startswith('bool') else 'local_binary_requires_restore') in scope
code=r'''
#include <cassert>
#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <string>
#include <vector>
#include <deque>
using llama_token=int;
struct mb_mtmd_token {char *token;bool is_end;};
struct mb_mtmd_context {
 std::unique_ptr<int> lctx{new int(1)},sampler{new int(1)};int *vocab=nullptr,*spec=nullptr;
 bool local_binary_fast_return=false,local_binary_requires_restore=false,spec_enabled=false,spec_end_after=false;
 std::deque<std::string> spec_out;std::string cached_piece,last_error;int batch=0,n_past=10,moe_k_decode=8,model_version=47,perf_decode_tokens=0;double perf_decode_ms=0;
};
constexpr int MB_MOE_K_DECODE=8;
int decodes=0,samples=0,accepts=0,next=0;std::vector<int> scheduled;bool decodeFails=false;
std::vector<std::string> pieces={"Y","N"," ","{","Y/N"," \tY\n"};
double now_ms(){static double t=0;return ++t;}
void perf_begin_turn_if_needed(mb_mtmd_context*){}
mb_mtmd_token spec_drain(mb_mtmd_context*){return {nullptr,true};}
mb_mtmd_token mb_mtmd_loop_spec(mb_mtmd_context*,double){return {nullptr,true};}
int llama_sampler_sample(int*,int*,int){++samples;return next<(int)scheduled.size()?scheduled[next++]:99;}
void llama_sampler_accept(int*,int){++accepts;}
bool llama_vocab_is_eog(int*,int tok){return tok==99;}
void mb_toklog(const char*,int){}
std::string token_to_piece_impl(int*,int tok){return pieces.at(tok);}
void batch_add_one(int&,int,int,int){}
void apply_moe_k(mb_mtmd_context*,int){}
int llama_decode(int*,int&){++decodes;return decodeFails?1:0;}
void set_error(mb_mtmd_context*c,const std::string&s){c->last_error=s;}
bool is_chatml_moe(int){return false;}
bool is_valid_utf8(const char*){return true;}
'''+body+r'''
void reset(std::vector<int> toks){scheduled=toks;next=decodes=samples=accepts=0;decodeFails=false;}
std::string take(mb_mtmd_token t){std::string s=t.token?t.token:"";free(t.token);return s;}
int main(){
 {mb_mtmd_context c;reset({0});auto r=mb_mtmd_loop(&c);assert(take(r)=="Y"&&!r.is_end&&decodes==1&&c.n_past==11);}
 for(int tok:{0,1,5}){mb_mtmd_context c;c.local_binary_fast_return=true;reset({tok});auto r=mb_mtmd_loop(&c);
  assert(take(r)==pieces[tok]&&!r.is_end&&decodes==0&&c.n_past==10&&samples==1&&accepts==1&&c.local_binary_requires_restore);
  c.local_binary_fast_return=false;auto again=mb_mtmd_loop(&c);assert(again.is_end&&samples==1&&c.last_error.find("requires clean/restore")!=std::string::npos);
  // Real clean/restore has been checked above to clear the pending flag. A
  // restored task's logits/sampler are independent of the discarded output.
  c.local_binary_requires_restore=false;c.local_binary_fast_return=true;reset({1});assert(take(mb_mtmd_loop(&c))=="N"&&decodes==0&&c.n_past==10);
 }
 {mb_mtmd_context c;c.local_binary_fast_return=true;reset({2,0});assert(take(mb_mtmd_loop(&c))==" "&&decodes==1&&c.n_past==11);assert(take(mb_mtmd_loop(&c))=="Y"&&decodes==1&&c.n_past==11);}
 for(int tok:{3,4,99}){mb_mtmd_context c;c.local_binary_fast_return=true;reset({tok});auto r=mb_mtmd_loop(&c);take(r);assert(decodes==1&&!c.local_binary_requires_restore&&c.n_past==11);}
 {mb_mtmd_context c;reset({0});decodeFails=true;auto r=mb_mtmd_loop(&c);assert(r.is_end&&r.token==nullptr&&!c.last_error.empty());}
 {mb_mtmd_context c;c.local_binary_fast_return=true;c.spec_enabled=true;int spec=1;c.spec=&spec;reset({0});auto r=mb_mtmd_loop(&c);assert(r.is_end&&samples==0&&!c.local_binary_requires_restore);}
}
'''
(out/'test.cpp').write_text(code,encoding='utf-8')
subprocess.run(['clang++','-std=c++17','-O2',str(out/'test.cpp'),'-o',str(out/'test')],check=True)
subprocess.run([str(out/'test')],check=True)
print('PASS: original default/EOS/error/spec behavior, binary same sampled token before feedback, no KV advance, whitespace continuation and mandatory cleanup isolation.')
