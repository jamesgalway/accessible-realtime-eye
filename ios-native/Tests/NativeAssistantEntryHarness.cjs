const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('ios-native/AccessibleVision/Services/NativeAssistantEntryController.swift','utf8');
const script = source.split('static let script = #"""')[1].split('"""#')[0];
const states = [], calls = [];
const buttons = {
  'start-unified-visual-assistant': { hidden:false, disabled:false, click(){calls.push('original-unified')} },
  'start-browser-direct-unified-assistant': { hidden:true, disabled:false, click(){calls.push('original-direct')} },
  'start-aliyun-unified-visual-assistant': { hidden:false, disabled:false, click(){calls.push('original-ali')} },
  'start-aliyun-cheap-unified-visual-assistant': { hidden:false, disabled:false, click(){calls.push('original-ali-video')} },
  'stop-realtime': { hidden:false, disabled:true, click(){calls.push('original-stop')} }
};
const echoControl = { checkbox:{checked:true} }, camera = {muted:true,srcObject:{originalStream:true}};
const summary = {textContent:'故障诊断工具'};
const diagnostics = {open:true, children:[],querySelector(){return summary},appendChild(node){this.children.push(node)}};
buttons['copy-realtime-log'] = {closest(){return diagnostics}};
buttons['strong-echo-guard'] = {closest(){return echoControl}};
buttons.camera = camera;
let observed, style;
const window = { webkit:{messageHandlers:{nativeAssistantEntries:{postMessage(state){states.push(state)}}}} };
const document = {
  getElementById(id){return buttons[id]}, documentElement:{dataset:{}},
  createElement(){return {}}, head:{appendChild(value){style=value}}
};
const context = { window, document, Promise, MutationObserver:class {constructor(fn){observed=fn} observe(){}} };
vm.runInNewContext(script,context);
assert.equal(states.at(-1).unified,true);
assert.equal(states.at(-1).directScreen,false);
assert.equal(window.__accessibleVisionActivateNativeEntry('unified'),true);
assert.deepEqual(calls,['original-unified']);
assert.equal(window.__accessibleVisionActivateNativeEntry('directScreen'),false);
buttons['start-browser-direct-unified-assistant'].hidden=false;
observed();
assert.equal(states.at(-1).directScreen,true);
assert.equal(window.__accessibleVisionActivateNativeEntry('directScreen'),true);
assert.deepEqual(calls,['original-unified','original-direct']);
buttons['start-unified-visual-assistant'].disabled=true;
observed();
assert.equal(states.at(-1).unified,false);
assert.equal(window.__accessibleVisionActivateNativeEntry('unified'),false);
assert.equal(window.__accessibleVisionActivateNativeEntry('unknown'),false);
assert.equal(window.__accessibleVisionActivateNativeEntry('aliVideo'),false);
assert.equal(window.__accessibleVisionActivateNativeEntry('googleVoice'),false);
assert.equal(window.__accessibleVisionActivateNativeEntry('stop'),false);
buttons['stop-realtime'].disabled=false;
observed();
assert.equal(states.at(-1).stop,true);
assert.equal(window.__accessibleVisionActivateNativeEntry('stop'),true);
assert.equal(calls.at(-1),'original-stop');
assert.match(style.textContent,/display:none!important/);
assert.doesNotMatch(script,/getUserMedia|response\.create|set_active_reminder|startGemini/);
assert.equal(summary.textContent,'诊断工具');
assert.equal(diagnostics.open,false);
assert.equal(diagnostics.children[0],echoControl);
assert.equal(diagnostics.children[1],camera);
assert.equal(echoControl.checkbox.checked,true);
assert.equal(camera.srcObject.originalStream,true);
assert.equal(document.documentElement.dataset.nativeSection,'assistant');
assert.match(style.textContent,/data-native-navigation-panel/);
assert.match(style.textContent,/body>\.hero>p/);
const navigationPanel={dataset:{}};
buttons['route-title']={closest(){return navigationPanel}};
const navigationWindow={__ACCESSIBLE_VISION_SECTION__:'navigation',webkit:window.webkit};
vm.runInNewContext(script,{...context,window:navigationWindow});
assert.equal(document.documentElement.dataset.nativeSection,'navigation');
assert.equal(navigationPanel.dataset.nativeNavigationPanel,'');
const aliWindow = {__ACCESSIBLE_VISION_BACKEND__:'aliyun',webkit:window.webkit};
buttons['start-unified-visual-assistant'].disabled=false;
vm.runInNewContext(script,{...context,window:aliWindow});
assert.equal(states.at(-1).directScreen,false);
assert.equal(states.at(-1).aliVideo,true);
assert.equal(aliWindow.__accessibleVisionActivateNativeEntry('unified'),true);
assert.equal(calls.at(-1),'original-ali');
assert.equal(aliWindow.__accessibleVisionActivateNativeEntry('aliVideo'),true);
assert.equal(calls.at(-1),'original-ali-video');
assert.equal(aliWindow.__accessibleVisionActivateNativeEntry('directScreen'),false);
assert.equal(states.at(-1).googleVoice,true);
assert.equal(aliWindow.__accessibleVisionActivateNativeEntry('googleVoice'),true);
assert.equal(calls.at(-1),'original-unified');
const plain = { window:{},document };
vm.runInNewContext(script,plain);
assert.equal(plain.window.__accessibleVisionActivateNativeEntry,undefined);
console.log('Native entry bridge: provider isolation, original button dispatch, busy mirroring, diagnostic node/stream identity and browser isolation passed.');
