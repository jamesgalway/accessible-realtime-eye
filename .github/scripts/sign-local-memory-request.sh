#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
APP="$ROOT/ios-native/build/Build/Products/Debug-iphoneos/AccessibleVision.app"
REQUEST="$ROOT/ios-native/AccessibleVision/LocalScreening/LocalScreening.entitlements"
test -d "$APP"
# The private installer must see the requested entitlement in the executable.
# CODE_SIGNING_ALLOWED=NO otherwise leaves only an unconsumed source plist.
# Ad-hoc signing transports the request; it does not grant Apple's capability.
while IFS= read -r -d '' nested; do
    /usr/bin/codesign --force --sign - "$nested"
done < <(find "$APP" -depth -type d \( -name '*.framework' -o -name '*.appex' \) -print0)
/usr/bin/codesign --force --sign - --generate-entitlement-der --entitlements "$REQUEST" "$APP"
/usr/bin/codesign --verify --deep --strict "$APP"
/usr/bin/codesign --display --entitlements :- "$APP" > "$RUNNER_TEMP/local-memory-request.plist"
python3 - "$RUNNER_TEMP/local-memory-request.plist" <<'PY'
from pathlib import Path
import plistlib,sys
raw=Path(sys.argv[1]).read_bytes()
# codesign's display output can include a legacy signature-blob prefix.
start=raw.find(b'<?xml')
assert start >= 0, 'codesign did not export XML entitlements'
request=plistlib.loads(raw[start:])
assert request.get('com.apple.developer.kernel.increased-memory-limit') is True
print('Verified embedded memory entitlement request; final profile/device grant still requires verification.')
PY
