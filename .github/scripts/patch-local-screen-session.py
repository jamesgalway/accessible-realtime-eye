from pathlib import Path
import hashlib,json,sys
directory=Path(sys.argv[1]);scripts=Path(__file__).resolve().parent
manifest={'version':'fixed-system-task-state-and-resident-vision-v4-1b-text-position','files':{}}
for name in ['MBMtmd.h','MBMtmd.mm']:
    path=directory/name;before=path.read_bytes();text=before.decode('utf-8')
    if name.endswith('.h'):
        text=text.replace('#include <stdint.h>','#include <stdint.h>\n#include <stddef.h>',1)
        needle='// Release all resources owned by the context.'
        assert text.count(needle)==1
        text=text.replace(needle,(scripts/'local-screen-session-api.h').read_text(encoding='utf-8')+'\n'+needle,1)
    else:
        needle='struct mb_mtmd_context {';assert text.count(needle)==1
        text=text.replace(needle,needle+'\n    bool local_keep_vision = false;\n    std::vector<uint8_t> local_system_state, local_task_state;\n    std::string local_system_text, local_task_text;\n    llama_pos local_system_n_past = 0, local_task_n_past = 0;',1)
        needle='static bool mb_release_vision(mb_mtmd_context * ctx, const char * where) {\n'
        assert text.count(needle)==1
        text=text.replace(needle,needle+'    if (ctx && ctx->local_keep_vision) return false;\n',1)
        needle='    } else if (role == "system") {'
        assert text.count(needle)==1
        text=text.replace(needle,'    } else if (role == "local_reminder_task") {\n        formatted += "<|im_start|>user\\n" + text + "<|im_end|>\\n";\n'+needle,1)
        # Dense 1B has canvas time in slot z. The merged embedding batch is
        # permuted ZYXT by llama.cpp, so text z must equal its text position,
        # matching token-only prefill. Retain the original 35B path exactly.
        needle='pos[off + k + 3 * total]       = 0; //'
        assert text.count(needle)==1
        text=text.replace(needle,'pos[off + k + 3 * total]       = ctx->model_version == 471 ? p + (llama_pos) k : 0; //',1)
        text+='\n'+(scripts/'local-screen-session-api.cpp').read_text(encoding='utf-8')
    after=text.encode('utf-8');path.write_bytes(after)
    manifest['files'][name]={'before':hashlib.sha256(before).hexdigest(),'after':hashlib.sha256(after).hexdigest()}
(directory/'bridge-session-patch.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print('Installed fixed system/task KV/SSM snapshots and abort callback bridge.')
