"""Apply the bounded allocation-failure fix to the pinned experiment engine."""
from pathlib import Path
import hashlib,json,sys

def patch_files(root):
    changes = {
        'ggml/src/ggml-metal/ggml-metal.cpp': [(
            '    ggml_metal_buffer_t res = ggml_metal_buffer_init(ctx_dev, size, shared);\n\n    ggml_backend_buffer_i buf_i',
            '    ggml_metal_buffer_t res = ggml_metal_buffer_init(ctx_dev, size, shared);\n    if (!res) return nullptr;\n\n    ggml_backend_buffer_i buf_i')],
        'tools/mtmd/clip.cpp': [(
            '            ctx_clip.buf.reset(ggml_backend_alloc_ctx_tensors_from_buft(ctx_clip.ctx_data.get(), buft));\n            ggml_backend_buffer_set_usage',
            '            ctx_clip.buf.reset(ggml_backend_alloc_ctx_tensors_from_buft(ctx_clip.ctx_data.get(), buft));\n            if (!ctx_clip.buf) {\n                throw std::runtime_error(string_format("CLIP tensor buffer allocation failed on %s", ggml_backend_name(ctx_clip.backend)));\n            }\n            ggml_backend_buffer_set_usage')],
    }
    result={}
    for relative, replacements in changes.items():
        path=root/relative;before=path.read_bytes();text=before.decode('utf-8')
        for old,new in replacements:
            assert text.count(old)==1,relative
            text=text.replace(old,new)
        after=text.encode('utf-8');path.write_bytes(after)
        result[relative]={'before':hashlib.sha256(before).hexdigest(),'after':hashlib.sha256(after).hexdigest()}
    relative='ggml/src/ggml-metal/ggml-metal-device.m'
    path=root/relative;before=path.read_bytes();text=before.decode('utf-8')
    begin=text.index('ggml_metal_buffer_t ggml_metal_buffer_init(')
    end=text.index('ggml_metal_buffer_t ggml_metal_buffer_map(',begin)
    block=text[begin:end]
    assert block.count('        free(res);\n        return NULL;')==2
    block=block.replace('        free(res);\n        return NULL;','        ggml_metal_buffer_free(res);\n        return NULL;')
    after=(text[:begin]+block+text[end:]).encode('utf-8');path.write_bytes(after)
    result[relative]={'before':hashlib.sha256(before).hexdigest(),'after':hashlib.sha256(after).hexdigest()}
    return {'version':'vision-allocation-null-v2','engineCommit':'96bbf61710d44421ea54e63f5194f9b17c20d877','files':result}

if __name__=='__main__':
    result=patch_files(Path(sys.argv[1]))
    Path(sys.argv[2]).write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print('Applied pinned Metal allocation failure, cleanup and CLIP error propagation fix.')
