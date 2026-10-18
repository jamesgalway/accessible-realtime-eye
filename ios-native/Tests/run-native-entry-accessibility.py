from pathlib import Path
import json,subprocess,sys

root=Path(__file__).resolve().parents[1]
devices=json.loads(subprocess.check_output(['xcrun','simctl','list','devices','available','--json']))
choices=[device for runtime,items in devices['devices'].items() if 'iOS' in runtime
         for device in items if device['name'].startswith('iPhone') and device.get('isAvailable')]
assert choices,'No available iPhone simulator'
device=choices[0]
subprocess.run(['xcrun','simctl','bootstatus',device['udid'],'-b'],check=True,timeout=180)
log=root/'entry-accessibility-test.log'
command=['xcodebuild','-project','AccessibleVision.xcodeproj','-scheme','NativeEntryAccessibility',
    '-configuration','Debug','-destination','platform=iOS Simulator,id='+device['udid'],
    '-derivedDataPath','entry-test-build','CODE_SIGNING_ALLOWED=NO','test']
with log.open('w',encoding='utf-8',newline='\n') as output:
    result=subprocess.run(command,cwd=root,stdout=output,stderr=subprocess.STDOUT,timeout=480)
lines=log.read_text(encoding='utf-8',errors='replace').splitlines()
if result.returncode:
    print('\n'.join(lines[-90:]))
    sys.exit(result.returncode)
print('\n'.join(line for line in lines if 'Test Case' in line or 'TEST SUCCEEDED' in line))
print('Native Google entry controls and web content are exposed together in the actual iPhone simulator accessibility tree; no model started.')
