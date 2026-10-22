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
view_model = destination/'GetMoreRam/AppIDViewModel.swift'
model_text = view_model.read_text(encoding='utf-8')
old_fetch = '        let ids = try await AppleAPI.shared.fetchAppIDsForTeam(team: team, session: session)'
new_fetch = '''        let configuration = try DataManager.shared.model.authenticationConfiguration()
        AnisetteDataHelper.shared.configure(configuration)
        session.anisetteData = try await AnisetteDataHelper.shared.getAnisetteData(refresh: true)
        let response = try await AppleAPI.shared.sendRequestWithURL(
            requestURL: AppleAPI.shared.qhURL.appendingPathComponent("ios/listAppIds.action"),
            additionalParameters: nil, session: session, team: team)
        await MainActor.run { self.responseSummary = AppIDListResponse.summary(response) }
        let records = try AppIDListResponse.records(response)
        let ids = records.compactMap { AppID(responseDictionary: $0) }
        if !records.isEmpty && ids.isEmpty {
            throw "Apple returned App ID records that this tool cannot decode. " + AppIDListResponse.summary(response)
        }'''
assert model_text.count(old_fetch) == 1
model_text = model_text.replace(old_fetch,new_fetch)
old_property = '    @Published var appIDs : [AppIDModel] = []'
assert model_text.count(old_property) == 1
model_text = model_text.replace(old_property,old_property+'\n    @Published var responseSummary = ""')
old_update = '        let cool = try await AppleAPI.shared.updateAppID('
assert model_text.count(old_update) == 1
model_text = model_text.replace(old_update,'''        let configuration = try DataManager.shared.model.authenticationConfiguration()
        AnisetteDataHelper.shared.configure(configuration)
        session.anisetteData = try await AnisetteDataHelper.shared.getAnisetteData(refresh: true)
        let cool = try await AppleAPI.shared.updateAppID(''')
model_text += '\n' + (ROOT/'AppIDListResponse.swift').read_text(encoding='utf-8')
view_model.write_text(model_text,encoding='utf-8',newline='\n')
view = destination/'GetMoreRam/AppIDView.swift'
view_text = view.read_text(encoding='utf-8')
anchor = '                    Button("Refresh") {'
assert view_text.count(anchor) == 1
view_text = view_text.replace(anchor,'''                    if !viewModel.responseSummary.isEmpty {
                        Text(viewModel.responseSummary).font(.system(.footnote, design: .monospaced))
                    }
                    Button("Refresh") {''')
view.write_text(view_text,encoding='utf-8',newline='\n')
receipt = {'upstreamRevision':REVISION,'upstreamArchiveSHA256':hashlib.sha256(raw).hexdigest(),
           'sourceBeforeSHA256':before,'sourceAfterSHA256':hashlib.sha256(text.encode('utf-8')).hexdigest(),
           'appIDViewModelSHA256':hashlib.sha256(model_text.encode('utf-8')).hexdigest(),
           'appIDViewSHA256':hashlib.sha256(view_text.encode('utf-8')).hexdigest(),
           'scope':'Bounded header transport plus fresh headers and explicit App ID response diagnostics; Apple password/verification unchanged'}
(destination/'network-fix-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
print(json.dumps(receipt))
