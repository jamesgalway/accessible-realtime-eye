'use strict';
const assert = require('node:assert/strict');
const P = require('../AccessibleVision/Services/NativeFindPolicy.js');
const {parseResult,check} = require('../server/native-find-endpoint.cjs');
const o = {valid:true, x:0.5,y:0.5,meters:2,at:1000};
assert.equal(P.direction({...o,x:0.2},false,true),'left');
assert.equal(P.direction({...o,x:0.8},false,true),'right');
assert.equal(P.direction(o,false,true),'forward');
assert.equal(P.direction(o,false,false),'aligned');
assert.equal(P.direction({...o,meters:0.8},false,true),'stop');
assert.equal(P.direction({...o,x:0.43},false,true,'left'),'left');
assert.equal(P.direction({...o,x:0.48},false,true,'left'),'forward');
assert.equal(P.direction({...o,valid:false},false,true),'lost');
assert.equal(P.direction(o,true,true),'hand_missing');
assert.equal(P.direction({...o,handX:0.8,handY:0.5},true,true),'hand_left');
assert.equal(P.direction({...o,handX:0.2,handY:0.5},true,true),'hand_right');
assert.equal(P.direction({...o,handX:0.5,handY:0.8},true,true),'hand_up');
assert.equal(P.direction({...o,handX:0.5,handY:0.2},true,true),'hand_down');
assert.equal(P.direction({...o,handX:0.5,handY:0.5},true,true),'hold');
assert.equal(P.fresh(o,1600),false);assert.equal(P.fresh(o,1200),true);
assert.equal(P.fresh(o,900),false);
const good={visible:true,confidence:0.9,box:[0.3,0.3,0.2,0.2],speech:'杯子在桌上。',canApproach:true};
assert.equal(parseResult(JSON.stringify(good)).visible,true);
for(const box of [[0.9,0.3,0.2,0.2],[0.3,0.3,0,0.2],['0.3',0.3,0.2,0.2],null]) {
  assert.equal(parseResult(JSON.stringify({...good,box})).visible,false);
}
assert.equal(parseResult(JSON.stringify({...good,confidence:0.4,contact:true,handVisible:true})).contact,false);
assert.equal(parseResult(JSON.stringify({...good,contact:true,handVisible:false})).contact,false);
(async()=>{
 let calls=0;
 const deps={error:(code,message)=>Object.assign(new Error(message),{code}),callModel:async()=>{calls++;return JSON.stringify(good);}};
 await assert.rejects(check({version:1,token:'t'},deps));assert.equal(calls,0);
 const result=await check({version:1,token:'t',frameId:42,target:'杯子',imageDataUrl:'data:image/jpeg;base64,AA=='},deps);
 assert.equal(result.frameId,42);assert.equal(result.visible,true);assert.equal(calls,1);
 console.log('PASS: local approach/hand corrections, deadband, stale frames, no inferred contact, strict model boxes, request validation');
})().catch(e=>{console.error(e);process.exitCode=1;});
