#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
UPSTREAM_SHA=fa9d837e3d38dfde7a9484ec1cc6bc2e5bc9b420
ENGINE_SHA=96bbf61710d44421ea54e63f5194f9b17c20d877
SOURCE="${RUNNER_TEMP:?}/huiyan-minicpm35b-upstream"
git init "$SOURCE"
git -C "$SOURCE" remote add origin https://github.com/OpenBMB/MiniCPM-V-Apps.git
git -C "$SOURCE" fetch --depth 1 origin "$UPSTREAM_SHA"
git -C "$SOURCE" checkout --detach FETCH_HEAD
test "$(git -C "$SOURCE" rev-parse HEAD)" = "$UPSTREAM_SHA"
git -C "$SOURCE" submodule update --init --depth 1 llama.cpp-omni
test "$(git -C "$SOURCE/llama.cpp-omni" rev-parse HEAD)" = "$ENGINE_SHA"
python3 "$ROOT/.github/scripts/patch-local-vision-allocation.py" "$SOURCE/llama.cpp-omni" "$RUNNER_TEMP/local-vision-engine-patch.json"
python3 "$ROOT/ios-native/Tests/test-local-vision-allocation.py" "$SOURCE/llama.cpp-omni" "$RUNNER_TEMP/local-vision-allocation-test"
python3 "$ROOT/.github/scripts/patch-local-prefill-read-cache.py" "$SOURCE/llama.cpp-omni" "$RUNNER_TEMP/prefill-read-cache-patch.json"
clang++ -std=c++17 -Wall -Wextra -pthread -fsanitize=address,undefined -I"$SOURCE/llama.cpp-omni/src" "$ROOT/ios-native/Tests/PrefillReadCacheHarness.cpp" -o "$RUNNER_TEMP/prefill-read-cache-test"
"$RUNNER_TEMP/prefill-read-cache-test"

DEST="$ROOT/ios-native/LocalScreeningFramework"
mkdir -p "$DEST"
# The cache key contains both immutable source revisions and the Xcode version.
if [[ ! -d "$DEST/llama.xcframework" ]]; then
    MINIMAL_MODE=ios-device bash "$SOURCE/scripts/build_xcframework.sh"
    cp -R "$SOURCE/MiniCPM-V-demo/thirdparty/llama.xcframework" "$DEST/"
fi
BRIDGE="$ROOT/ios-native/AccessibleVision/LocalScreening/Upstream"
mkdir -p "$BRIDGE"
for file in MBMtmd.h MBMtmd.mm MBPrewarmTable.h; do
    cp "$SOURCE/MiniCPM-V-demo/MTMDWrapper/Bridge/$file" "$BRIDGE/$file"
done
cp "$SOURCE/LICENSE" "$ROOT/ios-native/AccessibleVision/LocalScreening/ThirdParty-NOTICES.txt"
python3 "$ROOT/ios-native/Tests/verify-local-screen-catalog.py"
cp "$RUNNER_TEMP/local-vision-engine-patch.json" "$BRIDGE/engine-allocation-patch.json"
cp "$RUNNER_TEMP/prefill-read-cache-patch.json" "$BRIDGE/prefill-read-cache-patch.json"
python3 "$ROOT/.github/scripts/patch-local-vision-ubatch.py" "$BRIDGE" "$BRIDGE/bridge-ubatch-patch.json"
python3 "$ROOT/ios-native/Tests/test-local-vision-ubatch.py" "$BRIDGE" "$RUNNER_TEMP/local-vision-ubatch-test"
python3 "$ROOT/.github/scripts/patch-local-screen-session.py" "$BRIDGE"
python3 "$ROOT/ios-native/Tests/test-local-screen-session.py" "$RUNNER_TEMP/local-screen-session-test" "$BRIDGE"
