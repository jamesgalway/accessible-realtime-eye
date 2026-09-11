'use strict';
// Exercise production snapshots without loading server credentials or calling models.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=process.argv[2];
assert.ok(root,'Pass the directory containing before/after server and app snapshots');
function func(source,name){
  const start=source.search(new RegExp('^(?:async )?function '+name+'\\(','m'));
  assert.ok(start>=0,name);
  const rest=source.slice(start),end=rest.slice(1).search(/^(?:async )?function \w+\(/m);
  return end<0?rest:rest.slice(0,end+1);
}
(async()=>{
for(const backend of ['greencloud','aliyun']){
 const base=path.join(root,backend),server=fs.readFileSync(path.join(base,'after-server.js'),'utf8'),app=fs.readFileSync(path.join(base,'after-public-app.js'),'utf8');
 const before=fs.readFileSync(path.join(base,'before-public-app.js'),'utf8');
 // Exact function preservation protects the existing contact evidence and success audio sequence.
 for(const name of ['recordGeminiFindContactEvidence','completeGeminiFindObjectWhenReady','buildGeminiFindGuidance'])assert.equal(func(app,name),func(before,name),name+' changed');
 const c=vm.createContext({console,tryParseJsonObject:JSON.parse,FIND_DEPTH_ASSIST_URL:'test',FIND_DEPTH_FAR_THRESHOLD_M:0.85,FIND_DEPTH_FAR_RELEASE_MARGIN_M:0.2,FIND_DEPTH_MODEL_NEAR_OVERRIDE_FRAMES:2});
 vm.runInContext(func(server,'parseFindObjectResult')+func(server,'applyFindDepthAssist'),c);
 const specimen={status:'contact',confidence:0.9,location:'desk',zone:'center',visible:'yes',hand:'visible',view:'wide_scene',supportBase:'visible',foregroundFloor:'large',targetX:0.5,targetY:0.5};
 assert.equal(c.parseFindObjectResult(JSON.stringify(specimen)).status,'walk_forward','ordinary web semantics retained');
 assert.equal(c.parseFindObjectResult(JSON.stringify(specimen),{nativeHandStage:true}).status,'contact');
 for(const status of ['walk_left','walk_right','walk_forward','hand_missing','contact']){
   const parsed=c.parseFindObjectResult(JSON.stringify({...specimen,status,hand:status==='hand_missing'?'missing':'visible'}),{nativeHandStage:true});
   assert.ok(!parsed.status.startsWith('walk_'));
   const adjusted=c.applyFindDepthAssist(parsed,{ok:true},{nativeHandStage:true});
   assert.equal(adjusted.result.status,parsed.status,'depth must not overwrite hand/contact');
 }
 assert.equal(c.parseFindObjectResult(JSON.stringify({...specimen,visible:'no',status:'target_missing'}),{nativeHandStage:true}).status,'target_missing');
 Object.assign(c,{assertFindObjectLiveExperimentAvailable(){},normalizeFindObjectLiveSessionId:x=>x,GEMINI_LIVE_MODEL:'test',FIND_OBJECT_DEPTH_ASSIST_ENABLED:false,isAppleLidarOnlyFindRequest:()=>false,saveFindObjectFrame:()=>'',httpError:(code,msg)=>new Error(msg)});
 vm.runInContext(func(server,'finalizeBrowserDirectFindResult'),c);
 const finalized=await c.finalizeBrowserDirectFindResult({imageDataUrl:'data:image/jpeg;base64,AA==',target:'item',reminderSessionId:'test',nativeFindHandStage:true,modelResult:specimen});
 assert.equal(finalized.status,'contact','direct finalizer retains contact');
 let submitted;
 const manager={pending:null,requestCount:0,connectionId:'test',session:{sendClientContent(){manager.pending.resolve(specimen);}}};
 const a=vm.createContext({console,Date,Promise,Math,Number,setTimeout:()=>0,clearTimeout(){},parseImageDataUrlForClient:()=>({mimeType:'image/jpeg',data:'AA=='}),getBrowserDirectFindScreenSession:async()=>manager,GREEN_FIND_OBJECT_MAX_IN_FLIGHT:2,GEMINI_DIRECT_FIND_REQUEST_TIMEOUT_MS:10000,apiPost:async(url,body)=>(submitted=body,body)});
 vm.runInContext(func(app,'requestBrowserDirectFindScreenResult'),a);
 await a.requestBrowserDirectFindScreenResult({nativeFindHandStage:true,reminderSessionId:'test'},{imageDataUrl:'data:image/jpeg;base64,AA==',target:'item',frameCount:2});
 assert.equal(submitted.nativeFindHandStage,true,'direct stage reaches finalizer');
 assert.match(app,/reminder\.nativeFindHandStage !== true && status === 'occluded_by_hand'/);
 assert.match(app,/status === 'target_missing'\s+&& reminder\.nativeFindHandStage !== true/);
 assert.match(app,/window\.__nativeFindHandResult\?\.\(reminder,/);
 console.log('PASS '+backend+': direct stage, parser, depth, missing-target recovery, contact preservation');
}
})().catch(e=>{console.error(e);process.exitCode=1;});
