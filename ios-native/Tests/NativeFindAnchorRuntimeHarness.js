'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
let now=10000,interval=null,pending=null,requests=0,directRequests=0,directPending=null,directBodies=[],autoResponse=false,originalTicks=0,messages=[],announcements=[],spoken=[];
const events={};const reminder={findTarget:'杯子',findTaskSeq:1,isReady:true};
const audioContext={currentTime:10,state:'running',resume:async()=>{audioContext.state='running';}};
const player={audioContext,nextStartTime:0,sources:[],enqueue(){this.nextStartTime=audioContext.currentTime+2;return now+2000;},reset(){this.nextStartTime=audioContext.currentTime;}};
reminder.player=player;reminder.audioContext=audioContext;
const c={console,Date:class extends Date{static now(){return now;}},URL,AbortController,
 setInterval:fn=>(interval=fn,1),clearInterval:()=>{interval=null;},setTimeout:()=>1,clearTimeout:()=>{},
 document:{hidden:false,addEventListener:(k,fn)=>events[k]=fn},appState:{geminiReminder:reminder},
 isGeminiPlaybackActive:()=>false,logClientEvent:()=>{},sendGeminiLiveEvent:event=>(spoken.push(event),true),
 handleGeminiLiveMessage:raw=>{if(JSON.parse(raw).interrupted)player.reset();},
 clearGeminiFindObjectMemory:()=>{},runGeminiFindObjectTick:()=>{originalTicks++;},
 requestBrowserDirectFindScreenResult:(r,body)=>{
   directRequests++;directBodies.push(body);
   if(autoResponse)return Promise.resolve({ok:true,frameCount:body.frameCount,visible:'yes',confidence:0.9,targetX:0.5,targetY:0.5,location:'桌子上'});
   return new Promise(resolve=>directPending={resolve,body});
 },
 announceFindObjectLocation:(r,target,location,frame,confidence,context)=>{
   if(!c.sendGeminiLiveEvent({type:'say',text:target+location}))return false;
   announcements.push({target,location,context});r.findLocationAnnounced=true;return true;
 },
 fetch:(url,opts)=>url.includes('config')?Promise.resolve({json:async()=>({enabled:true,version:1})}):
 (requests++,autoResponse?Promise.resolve({ok:true,json:async()=>({ok:true,frameCount:JSON.parse(opts.body).frameCount,visible:'yes',confidence:0.9,targetX:0.5,targetY:0.5,location:'桌子上'})}):
 new Promise(resolve=>pending={resolve,body:JSON.parse(opts.body)}))};
c.window=c;c.__ACCESSIBLE_VISION_BACKEND__='aliyun';
c.webkit={messageHandlers:{nativeFind:{postMessage:m=>messages.push(m)}}};c.addEventListener=(k,fn)=>events[k]=fn;
vm.createContext(c);
for(const f of ['NativeFindPolicy.js','NativeFindAnchorRuntime.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../AccessibleVision/Services',f),'utf8'),c);
const drain=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const frame=id=>c.__nativeFindFrame({frameId:id,lidarAvailable:true,capturedAtMs:now,imageDataUrl:'data:image/jpeg;base64,AA==',depthGridWidth:3,depthGridHeight:3,depthGrid:Array(9).fill(2)});
const click=id=>events.click({target:{closest:()=>({id})}});
let drainedCount=0;
const finishSpeech=()=>{
 if(spoken.length>drainedCount){player.enqueue('audio');drainedCount=spoken.length;}
 now+=3000;audioContext.currentTime=player.nextStartTime+1;
 reminder.turnInProgress=false;reminder.assistantResponseActive=false;
};
(async()=>{
 c.__accessibleVisionEnableRuntimeHooks();await drain();frame(1);
 click('start-aliyun-cheap-unified-visual-assistant');c.runGeminiFindObjectTick(reminder);assert.equal(originalTicks,1);
 click('start-unified-visual-assistant');reminder.turnInProgress=true;player.enqueue('opening');
 c.runGeminiFindObjectTick(reminder);now+=500;frame(2);interval();
 assert.equal(requests,1);assert.equal(spoken.length,0,'opening acknowledgement must not be preempted before a real miss');const p=pending;
 p.resolve({ok:true,json:async()=>({ok:true,frameCount:2,visible:'yes',confidence:0.9,targetX:0.5,targetY:0.5,location:'桌子上'})});await drain();
 now+=800;interval();
 assert.equal(announcements.length,0,'location must wait for the opening speech guard');
 assert.equal(p.body.nativeFindAnchorSeed,true,'first recognition owns its exact frame geometry');
 finishSpeech();interval();
 assert.equal(announcements.length,0,'location waits until the world anchor is ready');
 const seed=messages.find(m=>m.type==='seed');
 const o={token:seed.token,seedFrameId:2,valid:true,x:0.5,y:0.5,meters:2,onScreen:true,inFront:true,at:now};
 c.__nativeFindObservation(o);interval();
 assert.equal(announcements.length,1,'ready anchor releases the single location announcement');
 now+=7000;
 assert.equal(c.sendGeminiLiveEvent({type:'say',text:'next'}),false,'late first audio must not be replaced after seven seconds');
 player.enqueue('location');drainedCount=spoken.length;
 reminder.turnInProgress=false;
 assert.equal(c.sendGeminiLiveEvent({type:'say',text:'next'}),false,'queued audio blocks despite cleared model and playback flags');
 const queuedEnd=player.nextStartTime;
 c.handleGeminiLiveMessage(JSON.stringify({interrupted:true}));
 assert.equal(player.nextStartTime,queuedEnd,'upstream interruption must preserve already queued find speech');
 audioContext.state='suspended';player.sources=[{}];
 assert.equal(c.sendGeminiLiveEvent({type:'say',text:'next'}),false,'suspended queued audio cannot be treated as finished');
 audioContext.state='running';player.sources=[];finishSpeech();
 assert.equal(announcements[0].context.distance.meters,2);assert.equal(announcements[0].context.targetY,0.5);
 for(let i=0;i<35;i++){finishSpeech();now+=1000;frame(3+i);c.__nativeFindObservation({...o,x:1.2,onScreen:false,at:now});interval();}
 assert.equal(requests,1,'off-screen stationary coordinate must not trigger cloud reacquisition, even after 20 seconds');
 assert.equal(spoken.at(-1).text,'往右一点。');
 c.__nativeFindObservation({...o,valid:false,reason:'camera_tracking_limited',at:now});interval();assert.equal(requests,1);
 finishSpeech();now+=4000;frame(39);c.__nativeFindObservation({...o,x:0.7,meters:0.7,onScreen:true,at:now});interval();
 assert.equal(originalTicks,1,'near distance while off-center must keep correcting before hand stage');
 finishSpeech();now+=4000;frame(40);c.__nativeFindObservation({...o,x:1.2,meters:0.55,onScreen:false,at:now});interval();
 assert.equal(spoken.at(-1).text,'到了，可以伸手。');
 now+=800;interval();assert.equal(originalTicks,1,'hand stage must wait for reach audio');
 finishSpeech();interval();
 assert.equal(originalTicks,2,'strict near handoff must delegate without another visibility gate');
 assert.notEqual(messages.at(-1).type,'stop','handover preserves the original world anchor');
 await drain();
 c.runGeminiFindObjectTick(reminder);assert.equal(originalTicks,3,'all subsequent hand checks use existing pipeline');
 assert.equal(announcements.length,1);assert.equal(requests,1);
 c.__nativeFindObservation({...o,x:1.2,meters:0.5,onScreen:false,at:now});
 assert.equal(c.__nativeFindHandResult(reminder,{visible:'no',hand:'visible',confidence:0.9,capturedAtMs:now}),true);
 assert.equal(spoken.at(-1).text,'手往右一点。');
 const beforeCancelledAudio=player.nextStartTime;
 c.__nativeFindHandResult(reminder,{visible:'yes',hand:'visible',confidence:0.9,capturedAtMs:now});
 player.enqueue('obsolete fallback');drainedCount=spoken.length;
 assert.equal(player.nextStartTime,beforeCancelledAudio,'visible target cancels unsounded fallback audio');
 now+=1000;audioContext.currentTime+=1;
 assert.equal(c.sendGeminiLiveEvent({type:'say',text:'model hand direction'}),true,'model resumes after suppressed fallback');
 finishSpeech();
 c.__nativeFindObservation({...o,x:-0.2,meters:0.5,onScreen:false,at:now});
 c.__nativeFindHandResult(reminder,{visible:'no',hand:'visible',confidence:0.9,capturedAtMs:now});
 assert.equal(spoken.at(-1).text,'手往左一点。');
 player.enqueue('fallback starts');drainedCount=spoken.length;
 c.__nativeFindHandResult(reminder,{visible:'yes',hand:'visible',confidence:0.9,capturedAtMs:now});
 audioContext.currentTime+=0.1;const oldEnd=player.nextStartTime;player.enqueue('fallback finishes');
 assert.ok(player.nextStartTime>oldEnd,'a started sentence finishes without hard interruption');
 finishSpeech();
 const silentCount=spoken.length;
 for(const observation of [{...o,x:0.8},{...o,x:1.2,inFront:false},{...o,x:1.2,valid:false}]){
   c.__nativeFindObservation({...observation,at:now});
   c.__nativeFindHandResult(reminder,{visible:'no',hand:'visible',confidence:0.9,capturedAtMs:now});interval();
 }
 assert.equal(spoken.length,silentCount,'no guessing for occlusion within view or invalid/behind tracking');
 c.__nativeFindObservation({...o,x:1.2,at:now});
 c.__nativeFindHandResult(reminder,{visible:'no',hand:'missing',confidence:0.9,capturedAtMs:now});interval();
 assert.equal(spoken.length,silentCount,'missing hand never produces anchor hand guidance');
 assert.equal(c.sendGeminiLiveEvent({type:'say',text:'hand'}),true);
 assert.equal(c.sendGeminiLiveEvent({type:'say',text:'contact'}),false,'hand guidance and contact share the same gate');
 finishSpeech();assert.equal(c.sendGeminiLiveEvent({type:'say',text:'contact'}),true);
 c.clearGeminiFindObjectMemory(reminder);assert.equal(messages.at(-1).type,'stop');
 assert.equal(c.isGeminiPlaybackActive(reminder),true,'completion speech remains protected after target memory clears');
 finishSpeech();assert.equal(c.isGeminiPlaybackActive(reminder),false);
 autoResponse=true;
 const verifyEntry=async(backend,id,transport,frameId,expectedDirect)=>{
   c.__ACCESSIBLE_VISION_BACKEND__=backend;reminder.findTaskSeq+=1;reminder.findTarget='测试物';
   reminder.findScreenTransport=transport;reminder.turnInProgress=false;click(id);frame(frameId);
   const beforeServer=requests,beforeDirect=directRequests;c.runGeminiFindObjectTick(reminder);now+=500;interval();await drain();
   assert.equal(requests-beforeServer,expectedDirect?0:1,`${backend} ${id} server route`);
   assert.equal(directRequests-beforeDirect,expectedDirect?1:0,`${backend} ${id} direct route`);
   if(expectedDirect)assert.equal(directBodies.at(-1).nativeFindAnchorSeed,true);
   c.clearGeminiFindObjectMemory(reminder);finishSpeech();
 };
 await verifyEntry('aliyun','start-aliyun-unified-visual-assistant','generate_content',50,false);
 await verifyEntry('greenCloud','start-unified-visual-assistant','generate_content',51,false);
 await verifyEntry('greenCloud','start-browser-direct-unified-assistant','browser_direct_live',52,true);
 c.__ACCESSIBLE_VISION_BACKEND__='aliyun';reminder.findScreenTransport='generate_content';
 reminder.findTaskSeq++;click('start-aliyun-unified-visual-assistant');frame(60);
 c.runGeminiFindObjectTick(reminder);now+=500;frame(61);interval();await drain();
 const failedSeed=messages.filter(m=>m.type==='seed').at(-1),beforeRetry=requests,beforeAnnouncements=announcements.length;
 c.__nativeFindObservation({token:failedSeed.token,seedFrameId:failedSeed.frameId,valid:false,lost:true,reason:'seed_depth_unavailable'});
 interval();assert.equal(requests,beforeRetry,'seed retries are rate limited');
 now+=1600;frame(62);interval();await drain();
 assert.equal(requests,beforeRetry+1,'failed first anchor does not leave recognition stuck');
 assert.equal(announcements.length,beforeAnnouncements,'no provisional success speech');
 const retried=messages.filter(m=>m.type==='seed').at(-1);
 c.__nativeFindObservation({...o,token:retried.token,seedFrameId:retried.frameId,at:now});interval();
 assert.equal(announcements.length,beforeAnnouncements+1,'successful retry announces once');
 c.clearGeminiFindObjectMemory(reminder);finishSpeech();
 const P=require('../AccessibleVision/Services/NativeFindPolicy.js');
 assert.equal(P.approach({x:0.37,y:0.5}),'forward','web middle third must remain centered');
 assert.equal(P.approach({x:0.68,y:0.5}),'right');assert.equal(P.approach({x:0.64,y:0.5}),'forward');
 assert.equal(P.approach({x:0.64,y:0.5},'right'),'right');assert.equal(P.approach({x:0.60,y:0.5},'right'),'forward');
 assert.equal(P.approach({x:-0.2,y:0.5}),'left');
 console.log('PASS: four required entries share native find; direct entry preserves browser-direct recognition; synchronized speech and strict near handoff remain intact');
})().catch(e=>{console.error(e);process.exitCode=1;});
