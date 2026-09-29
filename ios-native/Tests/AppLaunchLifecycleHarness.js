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
const configuration = fs.readFileSync(
  'ios-native/AccessibleVision/Services/AppConfiguration.swift',
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
assert.match(view, /teachingButton/);
assert.doesNotMatch(configuration, /case teachingTest/);
assert.match(configuration, /case \.greenCloud:[\s\S]*?return "greencloud_google"/);
assert.match(configuration, /case \.aliyun:[\s\S]*?return "aliyun_google"/);
assert.match(configuration, /baseURL\.appending\(path: "teaching\/start\.html"\)/);
assert.match(configuration, /URLQueryItem\(name: "runtimeRoute", value: teachingRuntimeRouteId\)/);
assert.match(view, /GreenCloudWebView\([\s\S]*?url: selectedURL/);
assert.match(view, /teachingMode \? selectedBackend\.teachingBaseURL : selectedBackend\.baseURL/);
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
  /guard selectedBackend != backend \|\| teachingMode else \{ return \}[\s\S]*?stopCurrentPageMedia\(\)[\s\S]*?selectedBackend = backend[\s\S]*?teachingMode = false/,
  'Switching backends must stop the previous native media session.'
);
assert.match(
  view,
  /Button\("教学"\)[\s\S]*?guard !teachingMode else \{ return \}[\s\S]*?stopCurrentPageMedia\(\)[\s\S]*?teachingMode = true/,
  'Teaching must bind the already selected backend instead of acting as a third backend.'
);
assert.match(
  view,
  /当前教学入口，绑定\\\(selectedBackend\.title\)/,
  'VoiceOver must announce which backend the teaching entry is bound to.'
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

console.log('App launch lifecycle harness: 31/31 PASS');
