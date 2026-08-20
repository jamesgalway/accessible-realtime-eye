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

assert.match(
  view,
  /@State private var selectedBackend: AssistantBackend\?\s*$/m,
  'App launch must not preselect a live backend.'
);
assert.match(
  view,
  /if let selectedBackend\s*\{[\s\S]*?liveAssistant\(for: selectedBackend\)[\s\S]*?\}\s*else\s*\{[\s\S]*?entrySelection/,
  'The entry selection must render before the live assistant.'
);
assert.doesNotMatch(
  view,
  /@State private var selectedBackend: AssistantBackend\s*=/,
  'A backend must not be selected automatically.'
);
assert.match(view, /private func liveAssistant\(for backend: AssistantBackend\)/);
assert.match(view, /\.onAppear\s*\{\s*camera\.start\(\)\s*\}/);
assert.match(
  view,
  /private func leaveLiveAssistant\(\)\s*\{[\s\S]*?torch\.turnOff\(\)[\s\S]*?camera\.stop\(\)[\s\S]*?selectedBackend = nil/,
  'Leaving the live page must stop native hardware before returning to the menu.'
);
assert.match(
  webView,
  /dismantleUIView[\s\S]*?releaseMediaResources/,
  'Destroying the final web page must release its media resources.'
);
assert.match(webView, /__accessibleVisionReleaseMedia/);
assert.match(webView, /getTracks\?\.\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);

console.log('App launch lifecycle harness: 9/9 PASS');
