'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
let now=10000,interval=null,pending=null,requests=0,originalTicks=0,messages=[],announcements=[];
const events={};const reminder={findTarget:'杯子',findTaskSeq:1,isReady:true};
const c={console,Date:class extends Date{static now(){return now;}},URL,AbortController,
 setInterval:fn=>(interval=fn,1),clearInterval:()=>{interval=null;},setTimeout:()=>1,clearTimeout:()=>{},
 document:{hidden:false,addEventListener:(k,fn)=>events[k]=fn},appState:{geminiReminder:reminder},
 isGeminiPlaybackActive:()=>false,logClientEvent:()=>{},sendGeminiLiveEvent:()=>true,
 clearGeminiFindObjectMemory:()=>{},runGeminiFindObjectTick:()=>{originalTicks++;},
 announceFindObjectLocation:(r,target,location,frame,confidence,context)=>(announcements.push({target,location,context}),r.findLocationAnnounced=true,true),
 fetch:(url,opts)=>url.includes('config')?Promise.resolve({json:async()=>({enabled:true,version:1})}):
 (requests++,new Promise(resolve=>pending={resolve,body:JSON.parse(opts.body)}))};
c.window=c;c.__ACCESSIBLE_VISION_BACKEND__='aliyun';
c.webkit={messageHandlers:{nativeFind:{postMessage:m=>messages.push(m)}}};c.addEventListener=(k,fn)=>events[k]=fn;
vm.createContext(c);
for(const f of ['NativeFindPolicy.js','NativeFindAnchorRuntime.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../AccessibleVision/Services',f),'utf8'),c);
const drain=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const frame=id=>c.__nativeFindFrame({frameId:id,lidarAvailable:true,capturedAtMs:now,imageDataUrl:'data:image/jpeg;base64,AA==',depthGridWidth:3,depthGridHeight:3,depthGrid:Array(9).fill(2)});
const click=id=>events.click({target:{closest:()=>({id})}});
(async()=>{
 c.__accessibleVisionEnableRuntimeHooks();await drain();frame(1);
 click('start-aliyun-cheap-unified-visual-assistant');c.runGeminiFindObjectTick(reminder);assert.equal(originalTicks,1);
 click('start-aliyun-unified-visual-assistant');c.runGeminiFindObjectTick(reminder);now+=500;frame(2);interval();
 assert.equal(requests,1);const p=pending;
 p.resolve({ok:true,json:async()=>({ok:true,token:p.body.token,frameId:2,visible:true,confidence:0.9,box:[0.4,0.4,0.2,0.2],speech:'杯子在桌子上。'})});await drain();
 assert.equal(announcements.length,1,'first announcement must not wait for tracker initialization');
 assert.equal(announcements[0].context.distance.meters,2);assert.equal(announcements[0].context.targetY,0.5);
 const seed=messages.find(m=>m.type==='seed');
 const o={token:seed.token,seedFrameId:2,valid:true,x:0.5,y:0.5,meters:2,onScreen:true,at:now};
 for(let i=0;i<35;i++){now+=1000;frame(3+i);c.__nativeFindObservation({...o,x:1.2,onScreen:false,at:now});interval();}
 assert.equal(requests,1,'off-screen stationary coordinate must not trigger cloud reacquisition, even after 20 seconds');
 assert.equal(messages.at(-1).code,'right');
 c.__nativeFindObservation({...o,valid:false,reason:'camera_tracking_limited',at:now});interval();assert.equal(requests,1);
 now+=1500;frame(40);c.__nativeFindObservation({...o,meters:0.7,at:now});interval();
 assert.equal(originalTicks,2,'near stage must immediately delegate to existing model tick');
 c.runGeminiFindObjectTick(reminder);assert.equal(originalTicks,3,'all subsequent hand checks use existing pipeline');
 assert.equal(announcements.length,1);assert.equal(requests,1);
 c.clearGeminiFindObjectMemory(reminder);assert.equal(messages.at(-1).type,'stop');
 const P=require('../AccessibleVision/Services/NativeFindPolicy.js');
 assert.equal(P.approach({x:0.62,y:0.5}),'forward');assert.equal(P.approach({x:0.7,y:0.5}),'right');
 assert.equal(P.approach({x:0.5,y:0.5},'right'),'forward');assert.equal(P.approach({x:-0.2,y:0.5}),'left');
 console.log('PASS: first announcement includes synchronized distance/height context; off-screen anchor stays local; AR interruption pauses without recognition; hand stage restored; center-third correction');
})().catch(e=>{console.error(e);process.exitCode=1;});
