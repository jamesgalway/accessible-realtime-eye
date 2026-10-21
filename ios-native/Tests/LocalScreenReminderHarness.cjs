'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('ios-native/AccessibleVision/LocalScreening/LocalScreenReminderBridge.swift', 'utf8').split('static let script = #"""')[1].split('"""#')[0];
function create({ backend = 'aliyun', section = 'assistant', transport = 'aliyun-realtime' } = {}) {
  const posts = [], http = [], timers = new Map(), events = [];
  const context = { URL, Response, AbortController, performance, console, appState:{geminiReminder:{transport}},
    location:{href:'https://example.test/',origin:'https://example.test',pathname:'/'},
    logClientEvent:(...args)=>events.push(args),
    setTimeout:fn=>{const id=timers.size+1;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id) };
  context.window = context;
  context.__ACCESSIBLE_VISION_BACKEND__ = backend; context.__ACCESSIBLE_VISION_SECTION__ = section;
  context.webkit = {messageHandlers:{nativeLocalScreen:{postMessage:m=>posts.push(m)}}};
  context.fetch = async (path, init={}) => {
    http.push({path:String(path),body:init.body && JSON.parse(init.body)});
    return new Response(JSON.stringify(String(path).endsWith('-prepare')?{prompt:'original contract prompt'}:
      {ok:true,shouldAlert:true,state:'HIT',provider:'local-minicpm35b',transport:'native-local-minicpm35b'}),{status:200});
  };
  vm.runInNewContext(source, context);
  return {context,posts,http,timers,events};
}
const tick = () => new Promise(resolve=>setImmediate(resolve));
const body = {task:'category=target_presence;lifecycle=once;target=user-authorized-condition',imageDataUrl:'data:image/jpeg;base64,AA==',promptMode:'deep_multitask',frameCount:1};
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
  const message=hit.posts.find(x=>x.type==='screen');assert.ok(message);assert.equal(message.task,body.task);assert.equal(message.prompt,'original contract prompt');
  hit.context.__huiyanLocalScreenReply({id:message.id,modelText:'{"state":"HIT"}',modelLatencyMs:2100,withinBudget:true});
  const result=await (await pending).json();assert.equal(result.shouldAlert,true);
  assert.deepEqual(hit.http.map(x=>x.path),['/api/active-reminder-direct-prepare','/api/active-reminder-direct-finalize']);
  assert.equal(hit.http[1].body.modelProvider,'local-minicpm35b');assert.equal(hit.http[1].body.task,body.task);
  const late=create();late.context.__huiyanSetLocalScreenEnabled(true);
  const slow=late.context.fetch('/api/active-reminder-check',options());const rejected=assert.rejects(slow,/3.5/);await tick();
  const old=late.posts.find(x=>x.type==='screen');[...late.timers.values()][0]();await rejected;
  late.context.__huiyanLocalScreenReply({id:old.id,modelText:'HIT',withinBudget:true});await tick();
  assert.equal(late.http.length,1);assert.ok(late.posts.some(x=>x.type==='cancel'));
  const failed=create();failed.context.__huiyanSetLocalScreenEnabled(true);
  const failure=failed.context.fetch('/api/active-reminder-check',options());const failedCheck=assert.rejects(failure,/busy/);await tick();
  failed.context.__huiyanLocalScreenReply({id:failed.posts.find(x=>x.type==='screen').id,error:'busy'});await failedCheck;
  assert.equal(failed.http.length,1);
  console.log('Local reminder bridge: Ali scope, original contract/finalizer, disabled route, late-result cancellation and no hidden model fallback passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
