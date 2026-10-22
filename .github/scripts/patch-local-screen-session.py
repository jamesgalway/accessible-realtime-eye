from pathlib import Path
import hashlib,json,sys
directory=Path(sys.argv[1]);scripts=Path(__file__).resolve().parent
manifest={'version':'fixed-system-state-and-abort-v1','files':{}}
for name in ['MBMtmd.h','MBMtmd.mm']:
    path=directory/name;before=path.read_bytes();text=before.decode('utf-8')
    if name.endswith('.h'):
        text=text.replace('#include <stdint.h>','#include <stdint.h>\n#include <stddef.h>',1)
        needle='// Release all resources owned by the context.'
        assert text.count(needle)==1
        text=text.replace(needle,(scripts/'local-screen-session-api.h').read_text(encoding='utf-8')+'\n'+needle,1)
    else:
        needle='struct mb_mtmd_context {';assert text.count(needle)==1
        text=text.replace(needle,needle+'\n    std::vector<uint8_t> local_system_state;\n    std::string local_system_text;\n    llama_pos local_system_n_past = 0;',1)
        text+='\n'+(scripts/'local-screen-session-api.cpp').read_text(encoding='utf-8')
    after=text.encode('utf-8');path.write_bytes(after)
    manifest['files'][name]={'before':hashlib.sha256(before).hexdigest(),'after':hashlib.sha256(after).hexdigest()}
(directory/'bridge-session-patch.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print('Installed fixed system KV/SSM snapshot and abort callback bridge.')
