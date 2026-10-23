'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('ios-native/AccessibleVision/LocalScreening/LocalScreenReminderBridge.swift', 'utf8').split('static let script = #"""')[1].split('"""#')[0];
function create({ backend = 'aliyun', section = 'assistant', transport = 'aliyun-realtime',configTransport='browser-direct',modelReply } = {}) {
  const liveCalls = [];
  const posts = [], http = [], timers = new Map(), intervals = new Map(), delays=[], events = [], modelCalls=[];
  const context = { URL, Response, AbortController, performance, console, appState:{geminiReminder:{transport}},
    location:{href:'https://example.test/',origin:'https://example.test',pathname:'/'},
    logClientEvent:(...args)=>events.push(args),parseImageDataUrlForClient:value=>({mimeType:'image/jpeg',data:value.split(',')[1]}),
    setTimeout:(fn,ms)=>{const id=timers.size+1;timers.set(id,fn);delays.push(ms);return id;},clearTimeout:id=>timers.delete(id),
    setInterval:fn=>{const id=intervals.size+1;intervals.set(id,fn);return id;},clearInterval:id=>intervals.delete(id) };
  context.window = context;
  context.__ACCESSIBLE_VISION_BACKEND__ = backend; context.__ACCESSIBLE_VISION_SECTION__ = section;
  context.webkit = {messageHandlers:{nativeLocalScreen:{postMessage:m=>posts.push(m)}}};
  context.appState.geminiReminder.browserGeminiAi={models:{generateContent:async args=>{modelCalls.push(args);return modelReply ? modelReply(args) : {text:'{"state":"HIT","speakable":true,"observation":"visible result"}'};}}};
  context.fetch = async (path, init={}) => {
    http.push({path:String(path),body:init.body && JSON.parse(init.body)});
    if(String(path).includes('/api/gemini-browser-config')) return new Response(JSON.stringify({transport:configTransport,model:'google-live',voice:'existing-voice',apiKey:'private-test-only'}));
    return new Response(JSON.stringify(String(path).endsWith('-prepare')?{prompt:'original contract prompt',model:'google-review',jsonMode:true,timeoutMs:3500,maxOutputTokens:160}:
      {ok:true,shouldAlert:true,state:'HIT',provider:'local-minicpm35b',transport:'native-local-minicpm35b'}),{status:200});
  };
  context.__huiyanConditionalLiveSelect = () => {};
  context.__huiyanConditionalLiveInstall = () => {};
  context.__huiyanConditionalLiveReview = async args => {
    liveCalls.push(args);
    if(modelReply) await modelReply(args);
    if(!args.owns() || args.signal.aborted) throw new Error('review过期');
    return {shouldAlert:false,liveReviewHandled:true,liveSpoke:true};
  };
  vm.runInNewContext(source, context);
  return {context,posts,http,timers,intervals,delays,events,modelCalls,liveCalls};
}
const tick = () => new Promise(resolve=>setImmediate(resolve));
const body = {task:'category=target_presence;mode=appear;lifecycle=once;target=authorized-subject;condition=authorized-condition;speakText=authorized-result',imageDataUrl:'data:image/jpeg;base64,AA==',promptMode:'deep_multitask',frameCount:1};
const options = () => ({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
function decisionTurn(outcome = 'accepted', late = false) {
  const played=[], forwarded=[]; let resolveRecovery;
  const r={pendingTaskSetupTranscript:'authorized reminder',activeTaskSeq:1};
  const rt={aliCheapContractCandidateSeq:1};
  const c={URL,Response,AbortController,performance,console,appState:{activeReminder:r,realtime:rt},
    location:{href:'https://example.test/',origin:'https://example.test',pathname:'/'},
    __ACCESSIBLE_VISION_BACKEND__:'aliyun',__ACCESSIBLE_VISION_SECTION__:'assistant',
    webkit:{messageHandlers:{nativeLocalScreen:{postMessage(){}}}},fetch:async()=>{},
    isAliCheapDirectFunctionContractExperiment:()=>true,hasGeminiActiveReminderIntent:()=>outcome!=='ordinary',
    handleRealtimeServerEvent:async m=>{
      forwarded.push(m.type);
      if(m.type==='response.audio.delta') played.push(m.delta);
      if(m.type==='response.function_call_arguments.done') {
        rt.pendingAliCheapToolResult={accepted:true};r.pendingTaskSetupTranscript='';
        rt.aliCheapContractConfirmationInFlight=true;
      }
      if(m.type==='response.done' && r.pendingTaskSetupTranscript) {
        r.pendingTaskSetupTranscript='';
        if(outcome!=='ordinary') void c.startSpeedReminderTaskNormalizeFromConfirmation('request','',{confirmOnAccepted:true});
      }
      if(m.type==='response.done') rt.pendingAliCheapToolResult=null;
    },
    startSpeedReminderTaskNormalizeFromConfirmation:async()=>{
      const accepted = await new Promise(resolve=>{resolveRecovery=resolve;});
      if(accepted) { r.activeTaskSeq++;played.push('accepted confirmation'); }
      return accepted;
    }};
  const eventHandler=c.handleRealtimeServerEvent, normalizer=c.startSpeedReminderTaskNormalizeFromConfirmation;
  if(late) { delete c.handleRealtimeServerEvent;delete c.startSpeedReminderTaskNormalizeFromConfirmation; }
  c.window=c;vm.runInNewContext(source,c);c.__huiyanSetLocalScreenEnabled(true);
  if(late) { c.handleRealtimeServerEvent=eventHandler;c.startSpeedReminderTaskNormalizeFromConfirmation=normalizer; }
  return {c,r,rt,played,forwarded,finish:value=>resolveRecovery(value),
    send:(type,delta)=>c.handleRealtimeServerEvent({type,delta})};
}
(async()=>{
  const loading=decisionTurn('accepted',true);
  await loading.c.fetch('/api/health');
  await loading.send('response.audio.delta','early loading question');await loading.send('response.done');
  assert.deepEqual(loading.played,[]);loading.finish(true);await tick();assert.deepEqual(loading.played,['accepted confirmation']);
  const accepted=decisionTurn();
  await accepted.send('response.audio.delta','premature question');assert.deepEqual(accepted.played,[]);
  await accepted.send('response.audio.done');await accepted.send('response.done');assert.deepEqual(accepted.played,[]);
  accepted.finish(true);await tick();assert.deepEqual(accepted.played,['accepted confirmation']);
  const noTask=decisionTurn('none');await noTask.send('response.audio.delta','original answer');
  await noTask.send('response.done');noTask.finish(false);await tick();assert.deepEqual(noTask.played,['original answer']);
  const ordinary=decisionTurn('ordinary');await ordinary.send('response.audio.delta','ordinary answer');
  await ordinary.send('response.done');assert.deepEqual(ordinary.played,['ordinary answer']);
  const tool=decisionTurn();await tool.send('response.audio.delta','before tool');
  await tool.send('response.function_call_arguments.done');
  await tool.send('response.audio.delta','before function output');await tool.send('response.done');
  await tool.send('response.audio.delta','tool accepted confirmation');assert.deepEqual(tool.played,['tool accepted confirmation']);
  const replaced=decisionTurn();await replaced.send('response.audio.delta','old');await replaced.send('response.done');
  replaced.rt.aliCheapContractCandidateSeq++;replaced.finish(false);await tick();assert.deepEqual(replaced.played,[]);
  const switched=decisionTurn();await switched.send('response.audio.delta','old');
  switched.c.__huiyanSetLocalScreenEnabled(false);await switched.send('response.done');assert.deepEqual(switched.played,[]);
  for (const config of [{backend:'greenCloud'},{section:'teaching'}]) {
    const r=create(config);assert.equal(r.context.__huiyanLocalScreenInstalled,undefined);
  }
  const disabled=create();await disabled.context.fetch('/api/active-reminder-check',options());assert.equal(disabled.http.length,1);
  const google=create({transport:'google'});google.context.__huiyanSetLocalScreenEnabled(true);
  await google.context.fetch('/api/active-reminder-check',options());assert.equal(google.http.length,1);assert.equal(google.posts.length,1);
  const hit=create();hit.context.__huiyanSetLocalScreenEnabled(true);
  const pending=hit.context.fetch('/api/active-reminder-check',options());await tick();
  const message=hit.posts.find(x=>x.type==='screen');assert.ok(message);assert.equal(message.task,body.task);
  assert.equal(message.prompt,'主体：authorized-subject\n核验条件：authorized-condition');assert.equal(hit.http.length,0);assert.equal(hit.delays[0],20000);
  hit.context.__huiyanLocalScreenReply({id:message.id,modelText:'Y',modelLatencyMs:2100,withinBudget:true});
  const result=await (await pending).json();assert.equal(result.shouldAlert,true);
  assert.deepEqual(hit.http.map(x=>x.path),['/api/active-reminder-local-describe']);
  assert.equal(hit.http[0].body.localDecision,'Y');assert.equal(hit.http[0].body.task,body.task);
  assert.equal(hit.http[0].body.imageDataUrl,body.imageDataUrl);assert.equal(hit.intervals.size,0);
  const miss=create();miss.context.__huiyanSetLocalScreenEnabled(true);
  const no=miss.context.fetch('/api/active-reminder-check',options());await tick();
  miss.context.__huiyanLocalScreenReply({id:miss.posts.find(x=>x.type==='screen').id,modelText:'N',withinBudget:true});await no;
  assert.deepEqual(miss.http.map(x=>x.path),['/api/active-reminder-direct-finalize']);assert.equal(miss.http[0].body.modelText,'N');
  for (const decision of ['Y','N']) {
    const dense=create();dense.context.__huiyanSetLocalScreenEnabled(true);
    const response=dense.context.fetch('/api/active-reminder-check',options());await tick();
    dense.context.__huiyanLocalScreenReply({id:dense.posts.find(x=>x.type==='screen').id,
      modelText:decision,model:'MiniCPM-V-4.7-1B',withinBudget:true});await response;
    assert.equal(dense.http.length,1);
    if (decision === 'Y') {
      assert.equal(dense.http[0].path,'/api/active-reminder-local-describe');
      assert.equal(dense.http[0].body.localScreenModel,'MiniCPM-V-4.7-1B');
      assert.equal(dense.http[0].body.imageDataUrl,body.imageDataUrl);
    } else {
      assert.equal(dense.http[0].path,'/api/active-reminder-direct-finalize');
      assert.equal(dense.http[0].body.modelProvider,'local-minicpm1b');
    }
    assert.equal(dense.events.find(e=>e[0]==='local_screening.result')[1].model,'MiniCPM-V-4.7-1B');
  }
  for(const [category,mode,lifecycle] of [['target_presence','appear','distinct_occurrences'],['state_tracking','result_reached','once'],['state_tracking','state_changed','continuous_changes']]){
    const rule=create();rule.context.__huiyanSetLocalScreenEnabled(true);
    const task=`category=${category};mode=${mode};lifecycle=${lifecycle};target=subject;condition=complete-condition;speakText=result`;
    const response=rule.context.fetch('/api/active-reminder-check',{...options(),body:JSON.stringify({...body,task})});await tick();
    const posted=rule.posts.find(x=>x.type==='screen');assert.ok(posted.prompt.includes('complete-condition'));
    assert.equal(posted.prompt.includes('核验可观察性'),mode==='state_changed');
    rule.context.__huiyanLocalScreenReply({id:posted.id,modelText:'Y',withinBudget:true});await response;
    assert.equal(rule.http[0].path,'/api/active-reminder-local-describe');assert.equal(rule.http[0].body.task,task);
  }
  const late=create();late.context.__huiyanSetLocalScreenEnabled(true);
  const slow=late.context.fetch('/api/active-reminder-check',options());const rejected=assert.rejects(slow,/20/);await tick();
  const old=late.posts.find(x=>x.type==='screen');[...late.timers.values()][0]();await rejected;
  late.context.__huiyanLocalScreenReply({id:old.id,modelText:'HIT',withinBudget:true});await tick();
  assert.equal(late.http.length,0);assert.ok(late.posts.some(x=>x.type==='cancel'));
  const failed=create();failed.context.__huiyanSetLocalScreenEnabled(true);
  const failure=failed.context.fetch('/api/active-reminder-check',options());const failedCheck=assert.rejects(failure,/busy/);await tick();
  failed.context.__huiyanLocalScreenReply({id:failed.posts.find(x=>x.type==='screen').id,error:'busy'});await failedCheck;
  assert.equal(failed.http.length,0);
  const changed=create();changed.context.__huiyanSetLocalScreenEnabled(true);
  const change=changed.context.fetch('/api/active-reminder-check',options());const changeRejected=assert.rejects(change,/取消/);await tick();
  changed.context.appState.geminiReminder.activeTaskSeq=2;[...changed.intervals.values()][0]();await changeRejected;
  assert.equal(changed.http.length,0);assert.ok(changed.posts.some(x=>x.type==='cancel'));
  const invalid=create();invalid.context.__huiyanSetLocalScreenEnabled(true);
  const bad=invalid.context.fetch('/api/active-reminder-check',options());const invalidCheck=assert.rejects(bad,/是或否/);await tick();
  invalid.context.__huiyanLocalScreenReply({id:invalid.posts.find(x=>x.type==='screen').id,modelText:'description',withinBudget:true});await invalidCheck;
  assert.equal(invalid.http.length,0);
  for(const decision of ['Y','N']) {
    const g=create({transport:'browser-direct'});g.context.__huiyanSetLocalScreenEnabled(true,'google');
    await g.context.fetch('/api/gemini-browser-config');
    assert.equal(g.events[0][1].transport,'browser-direct');assert.equal(JSON.stringify(g.events).includes('private-test-only'),false);
    g.http.length=0;
    const p=g.context.fetch('/api/active-reminder-check',options());await tick();
    g.context.__huiyanLocalScreenReply({id:g.posts.find(x=>x.type==='screen').id,model:'MiniCPM-V-4.7-1B',modelText:decision,modelLatencyMs:410,withinBudget:true});await p;
    assert.equal(g.modelCalls.length,decision==='Y'?1:0);
    assert.equal(g.liveCalls.length,0);
    assert.ok(!g.http.some(x=>x.path==='/api/active-reminder-local-describe'||x.path==='/api/active-reminder-check'));
    if(decision==='Y') {
      assert.deepEqual(g.http.map(x=>x.path),['/api/active-reminder-direct-prepare','/api/active-reminder-direct-finalize']);
      assert.equal(g.http[0].body.modelProvider,'local-minicpm1b-google');assert.equal(g.http[1].body.modelProvider,'local-minicpm1b-google');
      assert.equal(g.modelCalls[0].model,'google-review');assert.equal(g.modelCalls[0].contents[0].parts[0].text,'original contract prompt');
      assert.equal(g.modelCalls[0].contents[0].parts[1].inlineData.data,'AA==');assert.ok(g.delays.includes(3500));
    }
    const event=g.events.find(x=>x[0]==='local_screening.result')[1];assert.equal(event.voice,'google');assert.equal(event.liveTransport,'browser-direct');
  }
  const proxy=create({transport:'server-proxy',configTransport:'server-proxy'});proxy.context.__huiyanSetLocalScreenEnabled(true,'google');
  await assert.rejects(proxy.context.fetch('/api/gemini-browser-config'),/手机直连/);assert.equal(proxy.modelCalls.length,0);
  let finishReview;
  const staleGoogle=create({transport:'browser-direct',modelReply:()=>new Promise(resolve=>{finishReview=resolve;})});
  staleGoogle.context.__huiyanSetLocalScreenEnabled(true,'google');
  const oldGoogle=staleGoogle.context.fetch('/api/active-reminder-check',options());const oldRejected=assert.rejects(oldGoogle,/过期|超时/);await tick();
  staleGoogle.context.__huiyanLocalScreenReply({id:staleGoogle.posts.find(x=>x.type==='screen').id,model:'MiniCPM-V-4.7-1B',modelText:'Y',withinBudget:true});await tick();
  staleGoogle.context.appState.geminiReminder.activeTaskSeq=2;
  finishReview({text:'old result'});await oldRejected;
  assert.equal(staleGoogle.http.filter(x=>x.path.endsWith('-finalize')).length,0);
  const cloudFailure=create({transport:'browser-direct',modelReply:async()=>{throw new Error('review unavailable 503');}});
  cloudFailure.context.__huiyanSetLocalScreenEnabled(true,'google');
  const unavailable=cloudFailure.context.fetch('/api/active-reminder-check',options());
  const unavailableCheck=assert.rejects(unavailable,/503/);await tick();
  cloudFailure.context.__huiyanLocalScreenReply({id:cloudFailure.posts.find(x=>x.type==='screen').id,model:'MiniCPM-V-4.7-1B',modelText:'Y',withinBudget:true});
  await unavailableCheck;
  assert.equal(cloudFailure.liveCalls.length,0);assert.equal(cloudFailure.modelCalls.length,1);
  assert.equal(cloudFailure.http.filter(x=>x.path.endsWith('-finalize')||x.path.endsWith('-local-describe')).length,0);
  assert.equal(cloudFailure.timers.size,0);assert.equal(cloudFailure.intervals.size,0);
  console.log('PASS: Ali decision audio isolation, four contracts, 1B-triggered Google direct Lite review, zero Live review/Ali calls, N skips model, stale result isolation.');
})().catch(error=>{console.error(error);process.exitCode=1;});

assert.doesNotMatch(fs.readFileSync('ios-native/AccessibleVision/Views/GreenCloudWebView.swift','utf8'), /WKUserScript\(source:LocalScreenConditionalLive\.script/);
