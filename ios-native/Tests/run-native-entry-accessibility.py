from pathlib import Path
import json,subprocess,sys,os

root=Path(__file__).resolve().parents[1]
devices=json.loads(subprocess.check_output(['xcrun','simctl','list','devices','available','--json']))
choices=[(runtime,device) for runtime,items in devices['devices'].items() if 'iOS' in runtime
         and runtime.endswith(os.environ.get('HUIYAN_UI_SIM_RUNTIME',''))
         for device in items if device['name'].startswith('iPhone') and device.get('isAvailable')]
assert choices,'No available iPhone simulator'
runtime,device=choices[0]
print('UI check runtime:', runtime, device['name'],flush=True)
# The runner's precreated device stalled twice in CoreLocation data migration.
# Use a clean temporary simulator, leaving all precreated device data alone.
device_type=device.get('deviceTypeIdentifier')
if not device_type:
    types=json.loads(subprocess.check_output(['xcrun','simctl','list','devicetypes','--json']))
    device_type=next(item['identifier'] for item in types['devicetypes'] if item['name']==device['name'])
udid=subprocess.check_output(['xcrun','simctl','create','HuiyanEntryAccessibility',device_type,runtime]).decode().strip()
assert len(udid)==36
subprocess.run(['xcrun','simctl','bootstatus',udid,'-b'],check=True,timeout=180)
log=root/'entry-accessibility-test.log'
command=['xcodebuild','-project','AccessibleVision.xcodeproj','-scheme','NativeEntryAccessibility',
    '-configuration','Debug','-destination','platform=iOS Simulator,id='+udid,
    '-derivedDataPath','entry-test-build','CODE_SIGNING_ALLOWED=NO','test']
with log.open('w',encoding='utf-8',newline='\n') as output:
    result=subprocess.run(command,cwd=root,stdout=output,stderr=subprocess.STDOUT,timeout=480)
lines=log.read_text(encoding='utf-8',errors='replace').splitlines()
if result.returncode:
    for index,line in enumerate(lines):
        if 'error:' in line or 'XCTAssert' in line or 'Asynchronous wait failed' in line:
            print('\n'.join(lines[max(0,index-1):index+3]))
    print('\n'.join(lines[-90:]))
    sys.exit(result.returncode)
print('\n'.join(line for line in lines if 'Test Case' in line or 'TEST SUCCEEDED' in line))
print('Native Google entry controls and web content are exposed together in the actual iPhone simulator accessibility tree; no model started.')
