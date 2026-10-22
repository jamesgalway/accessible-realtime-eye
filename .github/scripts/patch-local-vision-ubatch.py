"""Respect the experiment caller's explicit multimodal compute batch."""
from pathlib import Path
import hashlib,json,sys
path=Path(sys.argv[1])/'MBMtmd.mm'
before=path.read_bytes();text=before.decode('utf-8')
old='    ctx->ubatch_adaptive = !moe_ubatch_pinned();'
new='    ctx->ubatch_adaptive = params.n_ubatch <= 0 && !moe_ubatch_pinned();'
assert text.count(old)==2
assert text.index(old)>text.index('mb_mtmd_context * mb_mtmd_init(')
after=text.replace(old,new,1).encode('utf-8');path.write_bytes(after)
result={'version':'respect-explicit-ubatch-v1','file':'MBMtmd.mm','before':hashlib.sha256(before).hexdigest(),'after':hashlib.sha256(after).hexdigest(),
    'scope':'Multimodal explicit positive n_ubatch disables automatic context enlargement; default and text-only behavior unchanged.'}
Path(sys.argv[2]).write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print('Patched multimodal bridge to respect explicit n_ubatch.')
