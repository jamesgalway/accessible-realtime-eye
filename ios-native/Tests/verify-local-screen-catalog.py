"""Check pinned model completeness and bridge provenance without weights/API calls."""
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit, unquote
import hashlib
import json
import re

root = Path(__file__).resolve().parents[1]
directory = root / 'AccessibleVision/LocalScreening'
catalog = json.loads((directory / 'model-catalog.json').read_text(encoding='utf-8'))
expected = {
    'MiniCPM-V-4_7-35B-A3B-mix_q3gud_im-les.gguf', 'mmproj-model-f16.gguf',
    'experts/manifest.json', *(f'experts/layer_{i:03d}.bin' for i in range(40))
}
files = catalog['files']
assert len(files) == len(expected) == 43
assert {f['path'] for f in files} == expected
assert sum(f['bytes'] for f in files) == catalog['totalBytes'] == 16_623_585_508
assert catalog['revision'] == '8716e5209f308fd53f197ccd7d50c6fdcc2dc37d'
for entry in files:
    path = PurePosixPath(entry['path'])
    url = urlsplit(entry['url'])
    assert not path.is_absolute() and '..' not in path.parts
    assert url.scheme == 'https' and url.hostname == 'huggingface.co'
    assert f'/resolve/{catalog["revision"]}/' in url.path
    assert unquote(url.path).endswith('/MiniCPM-V-4.7-35B-A3B/' + entry['path'])
    assert re.fullmatch('[0-9a-f]{64}', entry['sha256'])

provenance = json.loads((directory / 'upstream-provenance.json').read_text(encoding='utf-8'))
for name, expected_hash in provenance['bridgeSha256'].items():
    assert hashlib.sha256((directory / 'Upstream' / name).read_bytes()).hexdigest() == expected_hash, name
dense = json.loads((directory / 'model-catalog-1b.json').read_text(encoding='utf-8'))
assert dense['revision'] == catalog['revision']
assert {f['path']: f['bytes'] for f in dense['files']} == {
    'MiniCPM-V-4_7-1B-Q4_K_M.gguf': 672003584, 'mmproj-model-f16.gguf': 1108746816}
assert dense['totalBytes'] == 1780750400
for entry in dense['files']:
    url = urlsplit(entry['url'])
    assert url.scheme == 'https' and url.hostname == 'huggingface.co'
    assert '/resolve/' + dense['revision'] + '/MiniCPM-V-4.7-1B/' + entry['path'] == unquote(url.path).removeprefix('/tc-mb/MiniCPM-V-Apps-gguf')
    assert re.fullmatch('[0-9a-f]{64}', entry['sha256'])
dense_vision = next(entry for entry in dense['files'] if entry['path'] == 'mmproj-model-f16.gguf')
moe_vision = next(entry for entry in files if entry['path'] == 'mmproj-model-f16.gguf')
assert dense_vision['sha256'] != moe_vision['sha256'] and dense_vision['bytes'] != moe_vision['bytes']
print('Pinned 35B/1B catalogs: complete paired files, sizes, URLs, SHA256 and bridge provenance passed.')
