'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
let now=10000, interval=null, pending=null, requests=0, originalTicks=0, messages=[], voices=[];
const events={};const reminder={findTarget:'杯子',findTaskSeq:1,isReady:true};
const context={console,Date:class extends Date {static now(){return now;}},URL,AbortController,
  setInterval:fn=>(interval=fn,1),clearInterval:()=>{interval=null;},setTimeout:()=>1,clearTimeout:()=>{},
  document:{hidden:false,addEventListener:(key,fn)=>events[key]=fn},
  appState:{geminiReminder:reminder},isGeminiPlaybackActive:()=>false,logClientEvent:()=>{},
  sendGeminiLiveEvent:event=>(voices.push(event),true),clearGeminiFindObjectMemory:()=>{},
  completeGeminiFindObjectWhenReady:()=>{},runGeminiFindObjectTick:()=>{originalTicks++;},
  fetch:(url,opts)=>url.includes('config')?Promise.resolve({json:async()=>({enabled:true,version:1})}):
    (requests++,new Promise(resolve=>pending={resolve,body:JSON.parse(opts.body)}))};
context.window=context;context.__ACCESSIBLE_VISION_BACKEND__='aliyun';
context.webkit={messageHandlers:{nativeFind:{postMessage:m=>messages.push(m)}}};
context.addEventListener=(key,fn)=>events[key]=fn;
vm.createContext(context);
for(const file of ['NativeFindPolicy.js','NativeFindRuntime.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../AccessibleVision/Services',file),'utf8'),context);
const drain=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const frame=id=>context.__nativeFindFrame({frameId:id,lidarAvailable:true,capturedAtMs:now,imageDataUrl:'data:image/jpeg;base64,AA=='});
const click=id=>events.click({target:{closest:()=>({id})}});
const respond=async(extra={})=>{const p=pending;p.resolve({ok:true,json:async()=>({ok:true,token:p.body.token,frameId:p.body.frameId,
  visible:true,box:[0.3,0.3,0.2,0.2],speech:'杯子在桌上。',canApproach:true,...extra})});await drain();};
(async()=>{
 context.__accessibleVisionEnableRuntimeHooks();await drain();frame(1);
 click('start-aliyun-cheap-unified-visual-assistant');context.runGeminiFindObjectTick(reminder);assert.equal(originalTicks,1);
 click('start-aliyun-unified-visual-assistant');context.runGeminiFindObjectTick(reminder);now+=500;frame(2);interval();
 assert.equal(requests,1);await respond();
 const seed=messages.find(m=>m.type==='seed');assert.equal(seed.frameId,2);
 const observation={token:seed.token,seedFrameId:2,valid:true,x:0.5,y:0.5,meters:2,at:now};
 context.__nativeFindObservation(observation);interval();assert.equal(voices.length,1);
 now+=1500;frame(3);context.__nativeFindObservation({...observation,at:now});interval();
 assert.equal(messages.at(-1).code,'forward');assert.equal(requests,1);
 for(let i=0;i<10;i++){now+=100;frame(4+i);context.__nativeFindObservation({...observation,at:now});interval();}
 assert.equal(requests,1,'stable local tracking must not send repeated model requests');
 now+=500;frame(20);context.__nativeFindObservation({...observation,at:now,meters:1.0});interval();assert.equal(requests,2);
 await respond({touchReady:true});
 assert.equal(messages.filter(m=>m.type==='hand').length,0,'prefetch is not permission to reach at one metre');
 now+=1700;frame(21);context.__nativeFindObservation({...observation,at:now,meters:0.7});interval();
 assert.equal(requests,3);await respond({touchReady:true});assert.equal(messages.some(m=>m.type==='hand'),true);
 now+=1600;frame(22);context.__nativeFindObservation({...observation,at:now,meters:0.7,handX:0.8,handY:0.5});interval();
 interval();assert.equal(requests,4);
 reminder.findTaskSeq=2;interval();assert.equal(messages.at(-1).type,'stop');
 const voiceCount=voices.length;await respond({handVisible:true,touchReady:true});
 assert.equal(voices.length,voiceCount,'late model response cannot speak after task exit');
 console.log('PASS: entry isolation, exact-frame seed, stable local tracking without model requests, near prefetch, hand handover, cancelled-task response isolation');
})().catch(e=>{console.error(e);process.exitCode=1;});
