const assert = require('node:assert/strict');
const fs = require('node:fs');

const view = fs.readFileSync(
  'ios-native/AccessibleVision/Views/WebAssistantView.swift',
  'utf8'
);
const webView = fs.readFileSync(
  'ios-native/AccessibleVision/Views/GreenCloudWebView.swift',
  'utf8'
);
const bridge = fs.readFileSync(
  'ios-native/AccessibleVision/Services/NativeVisionBridgeScript.swift',
  'utf8'
);

assert.match(
  view,
  /@State private var selectedBackend: AssistantBackend = \.greenCloud\s*$/m,
  'The original direct interface must open on GreenCloud.'
);
assert.doesNotMatch(
  view,
  /entrySelection|返回入口选择/,
  'The app must not add a separate entry-selection screen.'
);
assert.doesNotMatch(
  view,
  /selectedBackend: AssistantBackend\?/,
  'The direct interface must not wait for a backend selection.'
);
assert.match(view, /backendButton\(\.greenCloud\)/);
assert.match(view, /backendButton\(\.aliyun\)/);
assert.match(view, /GreenCloudWebView\([\s\S]*?url: selectedBackend\.baseURL/);
assert.doesNotMatch(
  view,
  /\.onAppear\s*\{\s*camera\.start\(\)\s*\}/,
  'Opening a backend page must not start the camera.'
);
assert.match(view, /onMediaCaptureRequested:[\s\S]*?mediaCaptureRequested = true[\s\S]*?camera\.start\(\)/);
assert.match(view, /onMediaCaptureReleased:[\s\S]*?mediaCaptureRequested = false[\s\S]*?camera\.stop\(\)/);
assert.match(
  view,
  /onMediaCaptureRequested:[\s\S]*?setIdleTimerDisabled\(true\)[\s\S]*?camera\.start\(\)/,
  'A formally started session must prevent idle dimming and locking.'
);
assert.match(
  view,
  /onMediaCaptureReleased:[\s\S]*?setIdleTimerDisabled\(false\)[\s\S]*?camera\.stop\(\)/,
  'Ending the formal session must restore the system idle timer.'
);
assert.match(
  view,
  /onChange\(of: scenePhase\)[\s\S]*?newPhase == \.active, mediaCaptureRequested[\s\S]*?setIdleTimerDisabled\(true\)[\s\S]*?else[\s\S]*?setIdleTimerDisabled\(false\)/,
  'Only a foreground formal session may keep the screen awake.'
);
assert.match(view, /UIApplication\.shared\.isIdleTimerDisabled = disabled/);
assert.match(
  view,
  /guard selectedBackend != backend else \{ return \}[\s\S]*?mediaCaptureRequested = false[\s\S]*?camera\.stop\(\)[\s\S]*?selectedBackend = backend/,
  'Switching backends must stop the previous native media session.'
);
assert.match(
  webView,
  /dismantleUIView[\s\S]*?releaseMediaResources/,
  'Destroying the final web page must release its media resources.'
);
assert.match(webView, /__accessibleVisionReleaseMedia/);
assert.match(webView, /getTracks\?\.\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
assert.match(webView, /requestNativeMediaStart/);
assert.match(webView, /nativeMediaReleased/);
assert.match(bridge, /postNative\(\{ type: 'requestNativeMediaStart' \}\)/);
assert.match(bridge, /postNative\(\{ type: 'nativeMediaReleased' \}\)/);

console.log('App launch lifecycle harness: 21/21 PASS');
