"""Fault-inject the actual patched Metal allocator without requiring a GPU."""
from pathlib import Path
import subprocess,sys
root=Path(sys.argv[1]);output=Path(sys.argv[2]);output.mkdir(parents=True,exist_ok=True)
metal=(root/'ggml/src/ggml-metal/ggml-metal.cpp').read_text(encoding='utf-8')
function=metal[metal.index('static ggml_backend_buffer_t ggml_backend_metal_buffer_type_alloc_buffer('):]
function=function[:function.index('static size_t ggml_backend_metal_buffer_type_get_alloc_size(')]
clip=(root/'tools/mtmd/clip.cpp').read_text(encoding='utf-8')
guard=clip[clip.index('            ctx_clip.buf.reset(ggml_backend_alloc_ctx_tensors_from_buft('):]
guard=guard[:guard.index('            for (auto & t : tensors_to_load)')]
source=r'''
#include <cassert>
#include <cstddef>
#include <stdexcept>
#include <string>
#include <memory>
struct Device { void *context; };
struct BufferType { Device *device; };
using ggml_backend_buffer_type_t=BufferType*;
using ggml_metal_device_t=void*;
struct MetalBuffer { bool shared; };
using ggml_metal_buffer_t=MetalBuffer*;
using ggml_backend_buffer_t=void*;
using ggml_backend_buffer_i=int;
int ggml_backend_metal_buffer_shared_i=1,ggml_backend_metal_buffer_private_i=2;
bool failed=true;int reads=0,wraps=0,usage=0;MetalBuffer metalBuffer{true};
ggml_metal_buffer_t ggml_metal_buffer_init(void*,size_t,bool){return failed?nullptr:&metalBuffer;}
bool ggml_metal_buffer_is_shared(ggml_metal_buffer_t value){assert(value);++reads;return value->shared;}
void *ggml_backend_buffer_init(BufferType*,int kind,MetalBuffer *value,size_t){assert(value);++wraps;assert(kind==(value->shared?1:2));return value;}
''' + function + r'''
struct Clip { std::unique_ptr<int> buf,ctx_data;void *backend=nullptr; };
int *ggml_backend_alloc_ctx_tensors_from_buft(int*,BufferType*){return failed?nullptr:new int(1);}
const char *ggml_backend_name(void*){return "MTL0";}
std::string string_format(const char*,const char*){return "CLIP tensor buffer allocation failed on MTL0";}
void ggml_backend_buffer_set_usage(int *value,int){assert(value);++usage;}
const int GGML_BACKEND_BUFFER_USAGE_WEIGHTS=1;
void probe_clip(Clip& ctx_clip,BufferType *buft){
''' + guard + r'''
}
int main(){
 Device device{nullptr};BufferType type{&device};Clip clip;
 assert(ggml_backend_metal_buffer_type_alloc_buffer(&type,1024,true)==nullptr);
 assert(reads==0&&wraps==0);
 bool caught=false;try{probe_clip(clip,&type);}catch(const std::runtime_error&e){caught=std::string(e.what()).find("allocation failed")!=std::string::npos;}
 assert(caught&&usage==0);
 failed=false;
 assert(ggml_backend_metal_buffer_type_alloc_buffer(&type,1024,true));
 metalBuffer.shared=false;assert(ggml_backend_metal_buffer_type_alloc_buffer(&type,1024,false));
 assert(reads==2&&wraps==2);
 probe_clip(clip,&type);assert(usage==1);
}
'''
(output/'test.cpp').write_text(source,encoding='utf-8')
subprocess.run(['clang++','-std=c++17',str(output/'test.cpp'),'-o',str(output/'test')],check=True)
subprocess.run([str(output/'test')],check=True)
print('PASS: real patched allocator tolerates allocation failure; CLIP returns an exception; shared/private success paths unchanged.')
