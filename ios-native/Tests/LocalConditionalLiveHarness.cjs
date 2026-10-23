'use strict';
const assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
const source=fs.readFileSync('ios-native/AccessibleVision/LocalScreening/LocalScreenConditionalLive.swift','utf8').split('static let script = #"""')[1].split('"""#')[0];
function create() {
  const events=[],played=[],sent=[],timers=new Map(); let serial=0,baseTicks=0,closed=0;
  const r={transport:'browser-direct',activeTaskSeq:1,isReady:true,frameCount:0,activeRequestSeq:0,alertedResultKeys:[],
    inputTranscriptBuffer:'',outputTranscriptBuffer:'',task:'accepted-condition',player:{monitorTotalDurationMs:0,reset(){played.length=0;}},
    session:{sendClientContent:m=>sent.push(m),close(){closed++;}}};
  const c={console,performance,AbortController,JSON,Date,appState:{geminiReminder:r,stream:{}},elements:{camera:{readyState:2}},
    GEMINI_ACTIVE_REMINDER_ALERT_COOLDOWN_MS:0,ACTIVE_REMINDER_FAST_FRAME_OPTIONS:{},
    __ACCESSIBLE_VISION_BACKEND__:'aliyun',__ACCESSIBLE_VISION_SECTION__:'assistant',
    setTimeout:(fn)=>{const id=++serial;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),
    logClientEvent:(...args)=>events.push(args),buildGeminiLiveSystemInstruction:()=> 'original contract rules',
    getGeminiActiveReminderTask:()=>r.task,isGeminiPlaybackActive:()=>false,
    buildGeminiReminderResultKey:text=>text,shouldDedupeActiveReminderOccurrences:()=>true,
    countGeminiReminderSpeechUnits:text=>[...text].length,
    rollbackGeminiPendingAlertDelivery:rr=>{rr.pendingAlertDelivery=null;},
    isGeminiReminderExecutionMode:()=>false,captureReminderFrame:()=> 'data:image/jpeg;base64,AA==',
    requestGeminiActiveReminderResult:async()=>{throw new Error('injected test failure');},
    parseImageDataUrlForClient:value=>({mimeType:'image/jpeg',data:value.split(',')[1]}),
    runGeminiActiveReminderTick:()=>{baseTicks++;},
    handleGeminiLiveMessage:raw=>{
      const m=JSON.parse(raw); r.inputTranscriptBuffer+=m.inputText||'';r.outputTranscriptBuffer+=m.outputText||'';
      for(const part of m.audioParts||[]){played.push(part.data);r.player.monitorTotalDurationMs+=1000;if(r.pendingAlertDelivery)r.pendingAlertDelivery.hadAudio=true;}
      if(m.interrupted){r.pendingAlertDelivery=null;r.turnInProgress=false;}
      if(m.turnComplete){const p=r.pendingAlertDelivery;if(p?.hadAudio)r.alertedResultKeys.push(p.resultKey);r.pendingAlertDelivery=null;r.outputTranscriptBuffer='';r.turnInProgress=false;}
    }};
  c.window=c;vm.runInNewContext(source,c);c.__huiyanConditionalLiveSelect(true);c.__huiyanConditionalLiveInstall();
  const message=m=>c.handleGeminiLiveMessage(JSON.stringify({type:'gemini.message',...m}));
  const check=()=>{const controller=new AbortController();return {controller,promise:c.__huiyanConditionalLiveReview({body:{task:r.task,frameCount:1,imageDataUrl:'data:image/jpeg;base64,AA=='},reminder:r,owns:()=>c.appState.geminiReminder===r&&r.activeTaskSeq===1,signal:controller.signal})};};
  return {c,r,events,played,sent,timers,message,check,get closed(){return closed;},get baseTicks(){return baseTicks;}};
}
(async()=>{
  const a=create();assert.match(a.c.buildGeminiLiveSystemInstruction(),/不调用任何工具/);
  const english=create(), eng=english.check();english.message({outputText:'To maintain silence as the light is not turned on.',audioParts:[{data:'wrong-silence-reason'}],turnComplete:true});
  assert.equal((await eng.promise).liveSpoke,false);assert.equal(english.played.length,0);assert.equal(english.r.alertedResultKeys.length,0);
  const negative=a.check();a.message({audioParts:[{data:'nonzero-untranscribed'}],outputText:'\u200b'});
  assert.equal(a.played.length,0);a.message({turnComplete:true});assert.equal((await negative.promise).liveSpoke,false);assert.equal(a.r.alertedResultKeys.length,0);
  const b=create(), positive=b.check();b.message({audioParts:[{data:'first'}]});assert.equal(b.played.length,0);
  b.message({outputText:'满足条件。',audioParts:[{data:'second'}]});assert.deepEqual(b.played,['first','second']);
  b.message({turnComplete:true});assert.equal((await positive.promise).liveSpoke,true);assert.equal(b.r.alertedResultKeys.length,1);assert.equal(b.r.localLiveHistory.spoken[0],'满足条件。');
  assert.ok(!JSON.stringify(b.sent).includes('report_'));assert.equal(b.sent.length,1);
  const duplicate=b.check();b.message({outputText:'满足条件。',audioParts:[{data:'duplicate'}],turnComplete:true});await assert.rejects(duplicate.promise,/duplicate/);assert.equal(b.played.length,2);
  const stale=create(), sp=stale.check();stale.r.activeTaskSeq=2;
  stale.message({outputText:'old response',audioParts:[{data:'old'}],turnComplete:true});await assert.rejects(sp.promise,/cancelled/);assert.equal(stale.played.length,0);
  const abort=create(), ap=abort.check();ap.controller.abort();await assert.rejects(ap.promise,/aborted/);
  abort.message({outputText:'late',audioParts:[{data:'late'}],turnComplete:true});assert.equal(abort.played.length,0);
  const input=create(), ip=input.check();input.message({inputText:'new user question',outputText:'old',audioParts:[{data:'old'}],turnComplete:true});await assert.rejects(ip.promise,/cancelled/);assert.equal(input.r.inputTranscriptBuffer,'new user question');assert.equal(input.played.length,0);
  input.message({outputText:'ordinary answer',audioParts:[{data:'ordinary'}],turnComplete:true});assert.deepEqual(input.played,['ordinary']);
  const timeout=create(), tp=timeout.check();[...timeout.timers.values()][0]();await assert.rejects(tp.promise,/timeout/);assert.equal(timeout.closed,1);
  const error=create(), ep=error.check();error.c.handleGeminiLiveMessage(JSON.stringify({type:'gemini.error'}));await assert.rejects(ep.promise,/gemini.error/);assert.equal(error.closed,1);
  const busy=create();busy.r.turnInProgress=true;await assert.rejects(busy.check().promise,/当前回合/);assert.equal(busy.sent.length,0);
  const failure=create();await failure.c.runGeminiActiveReminderTick();assert.equal(failure.r.inFlight,false);assert.equal(failure.r.activeInFlightCount,0);
  assert.match(b.c.buildGeminiLiveSystemInstruction(),/具体相对位置/);
  assert.match(b.c.buildGeminiLiveSystemInstruction(),/不复述用户问题/);
  assert.match(JSON.stringify(b.sent),/应用播报方式/);
  assert.match(JSON.stringify(b.sent),/具体相对位置/);
  failure.c.__huiyanConditionalLiveSelect(false);await failure.c.runGeminiActiveReminderTick();assert.equal(failure.baseTicks,1);
  assert.equal(failure.c.buildGeminiLiveSystemInstruction(),'original contract rules');
  console.log('PASS conditional Live: empty/format-only audio gate, ordered streaming, duplicate/stale/abort/input isolation, ordinary speech restored, timeout closes, tick release, old routes unchanged.');
})().catch(e=>{console.error(e);process.exitCode=1;});
