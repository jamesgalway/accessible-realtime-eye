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
  'start-aliyun-cheap-unified-visual-assistant': { hidden:false, disabled:false, click(){calls.push('original-ali-video')} }
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
  getElementById(id){return buttons[id]}, documentElement:{},
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
assert.match(style.textContent,/display:none!important/);
assert.doesNotMatch(script,/getUserMedia|response\.create|set_active_reminder|startGemini/);
assert.equal(summary.textContent,'诊断工具');
assert.equal(diagnostics.open,false);
assert.equal(diagnostics.children[0],echoControl);
assert.equal(diagnostics.children[1],camera);
assert.equal(echoControl.checkbox.checked,true);
assert.equal(camera.srcObject.originalStream,true);
const aliWindow = {__ACCESSIBLE_VISION_BACKEND__:'aliyun',webkit:window.webkit};
vm.runInNewContext(script,{...context,window:aliWindow});
assert.equal(states.at(-1).directScreen,false);
assert.equal(states.at(-1).aliVideo,true);
assert.equal(aliWindow.__accessibleVisionActivateNativeEntry('unified'),true);
assert.equal(calls.at(-1),'original-ali');
assert.equal(aliWindow.__accessibleVisionActivateNativeEntry('aliVideo'),true);
assert.equal(calls.at(-1),'original-ali-video');
assert.equal(aliWindow.__accessibleVisionActivateNativeEntry('directScreen'),false);
const plain = { window:{},document };
vm.runInNewContext(script,plain);
assert.equal(plain.window.__accessibleVisionActivateNativeEntry,undefined);
console.log('Native entry bridge: provider isolation, original button dispatch, busy mirroring, diagnostic node/stream identity and browser isolation passed.');
