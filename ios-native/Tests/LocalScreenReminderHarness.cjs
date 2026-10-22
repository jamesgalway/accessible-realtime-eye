'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('ios-native/AccessibleVision/LocalScreening/LocalScreenReminderBridge.swift', 'utf8').split('static let script = #"""')[1].split('"""#')[0];
function create({ backend = 'aliyun', section = 'assistant', transport = 'aliyun-realtime' } = {}) {
  const posts = [], http = [], timers = new Map(), intervals = new Map(), delays=[], events = [];
  const context = { URL, Response, AbortController, performance, console, appState:{geminiReminder:{transport}},
    location:{href:'https://example.test/',origin:'https://example.test',pathname:'/'},
    logClientEvent:(...args)=>events.push(args),
    setTimeout:(fn,ms)=>{const id=timers.size+1;timers.set(id,fn);delays.push(ms);return id;},clearTimeout:id=>timers.delete(id),
    setInterval:fn=>{const id=intervals.size+1;intervals.set(id,fn);return id;},clearInterval:id=>intervals.delete(id) };
  context.window = context;
  context.__ACCESSIBLE_VISION_BACKEND__ = backend; context.__ACCESSIBLE_VISION_SECTION__ = section;
  context.webkit = {messageHandlers:{nativeLocalScreen:{postMessage:m=>posts.push(m)}}};
  context.fetch = async (path, init={}) => {
    http.push({path:String(path),body:init.body && JSON.parse(init.body)});
    return new Response(JSON.stringify(String(path).endsWith('-prepare')?{prompt:'original contract prompt'}:
      {ok:true,shouldAlert:true,state:'HIT',provider:'local-minicpm35b',transport:'native-local-minicpm35b'}),{status:200});
  };
  vm.runInNewContext(source, context);
  return {context,posts,http,timers,intervals,delays,events};
}
const tick = () => new Promise(resolve=>setImmediate(resolve));
const body = {task:'category=target_presence;mode=appear;lifecycle=once;target=authorized-subject;condition=authorized-condition;speakText=authorized-result',imageDataUrl:'data:image/jpeg;base64,AA==',promptMode:'deep_multitask',frameCount:1};
const options = () => ({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
(async()=>{
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
  console.log('Local reminder bridge: four contract types, Y calls Ali on same frame, N has no model call, invalid/stale/cancel isolation and unchanged disabled/cloud routes passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
