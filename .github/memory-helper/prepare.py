from pathlib import Path
import hashlib, json, sys, urllib.request, zipfile, io

ROOT = Path(__file__).resolve().parent
REVISION = '979506c5ab27f7dba313b7500906b82a7309b59c'
destination = Path(sys.argv[1]).resolve()
assert not destination.exists(), 'Use a fresh staging directory'
url = 'https://codeload.github.com/failury/GetMoreRam/zip/' + REVISION
with urllib.request.urlopen(url, timeout=45) as response:
    raw = response.read()
assert hashlib.sha256(raw).hexdigest() == '4b807c60437b522c958d06013828f396698be448896b01b2cc2c1f30ee67fa43', 'Upstream archive bytes changed'
with zipfile.ZipFile(io.BytesIO(raw)) as archive:
    prefix = archive.namelist()[0].split('/')[0] + '/'
    for item in archive.infolist():
        relative = item.filename.removeprefix(prefix)
        if not relative or item.is_dir(): continue
        target = (destination / relative).resolve()
        assert destination in target.parents
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(archive.read(item))

source = destination/'GetMoreRam/AnisetteDataHelper.swift'
text = source.read_text(encoding='utf-8')
old = '''        let (data, response) = try await URLSession.shared.data(for: request)
        
        return try await self.extractAnisetteData(data, response as? HTTPURLResponse, v3: true)'''
new = '''        let (data, response) = try await AnisetteHeaderTransport.fetch(request, log: { self.printOut($0) })
        return try await self.extractAnisetteData(data, response, v3: true)'''
assert text.count(old) == 1, 'Pinned get_headers function changed'
before = hashlib.sha256(text.encode('utf-8')).hexdigest()
assert before == 'd197930e8e8c37d9deab714f955b38823c990a69e858f6e0547e8c710c2309aa'
text = text.replace(old,new)
text += '\n' + (ROOT/'AnisetteHeaderTransport.swift').read_text(encoding='utf-8')
source.write_text(text,encoding='utf-8',newline='\n')
receipt = {'upstreamRevision':REVISION,'upstreamArchiveSHA256':hashlib.sha256(raw).hexdigest(),
           'sourceBeforeSHA256':before,'sourceAfterSHA256':hashlib.sha256(text.encode('utf-8')).hexdigest(),
           'scope':'Only get_headers transport; no Apple password, verification or capability changes'}
(destination/'network-fix-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
print(json.dumps(receipt))
