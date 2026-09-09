(() => {
  'use strict';
  if (!window.webkit?.messageHandlers?.nativeFind || window.__nativeFindInstalled) return;
  window.__nativeFindInstalled = true;
  let selected=false,enabled=false,latest=null,current=null,counter=0,timer=null,oldTick=null;
  const post=body=>window.webkit.messageHandlers.nativeFind.postMessage(body);
  const log=(name,details)=>{if(typeof logClientEvent==='function')logClientEvent(`native_find.${name}`,details);};
  const alive=s=>current===s&&appState.geminiReminder===s.reminder&&!s.reminder.stopping
    &&s.reminder.findTarget===s.target&&(s.reminder.findTaskSeq||0)===s.task;
  const busy=s=>s.reminder.turnInProgress||isGeminiPlaybackActive(s.reminder)||Date.now()<s.modelSpeechUntil;
  const mute=s=>post({type:'mute',token:s.token});
  function stop(){
    if(current){current.reminder.nativeFindHandStage=false;current.abort?.abort();post({type:'stop'});log('stopped',{token:current.token});}
    current=null;if(timer)clearInterval(timer);timer=null;
  }
  function finishFromButton(){
    const s=current;if(!s)return;
    s.reminder.nativeFindHandStage=false;s.abort?.abort();post({type:'finish',token:s.token,code:'stopped'});
    log('stopped',{token:s.token,reason:'stop_button'});current=null;if(timer)clearInterval(timer);timer=null;
  }
  function local(s,code,force=false){
    if(!alive(s)||(!force&&busy(s)))return false;
    const now=Date.now();
    if(s.lastCode===code&&now-s.lastSaid<NativeFindPolicy.repeatMs(code))return false;
    if(now-s.lastSaid<850&&!['lost','stop','reach'].includes(code))return false;
    post({type:'speak',token:s.token,code});s.lastCode=code;s.lastSaid=now;
    log('local_guidance',{code,phase:s.phase,meters:s.observation?.meters,source:'lidar_world_anchor'});
    return true;
  }
  function announce(s){
    if(!s.firstResult||s.announced||busy(s))return false;
    const r=s.firstResult,o=s.observation;
    const x=o?.valid?o.x:r.box[0]+r.box[2]/2;
    const y=o?.valid?o.y:r.box[1]+r.box[3]/2;
    const meters=o?.valid?o.meters:s.initialMeters;
    const context={enabled:true,zone:x<1/3?'left':x>2/3?'right':'center',targetY:y,
      distance:Number.isFinite(meters)?{meters,source:'apple_lidar',confidence:1,frameId:s.seedFrame}:null};
    mute(s);
    // Reuse exactly the existing location/height/distance announcement and cloud voice.
    if(announceFindObjectLocation(s.reminder,s.target,r.location||r.speech||'',s.seedFrame,r.confidence,context)){
      s.announced=true;s.modelSpeechUntil=Date.now()+1200;return true;
    }
    return false;
  }
  window.__nativeFindFrame=packet=>{latest=packet;};
  window.__nativeFindObservation=o=>{
    const s=current;if(!s||!alive(s)||o.token!==s.token||o.seedFrameId!==s.seedFrame)return;
    s.observation=o;
    if(o.valid){s.anchorReady=true;return;}
    local(s,'lost');
    // Only initial depth/seed failure retries recognition. Once anchored, preserve
    // the stationary target through off-screen motion and temporary AR interruption.
    if(o.lost&&!s.anchorReady){s.seedFailed=true;s.retryAt=Date.now()+1200;}
    log('tracking_paused',{reason:o.reason,anchorPreserved:s.anchorReady});
  };
  const frameDepth=(frame,box)=>{
    const w=frame.depthGridWidth,h=frame.depthGridHeight,g=frame.depthGrid;
    if(!Array.isArray(g)||!w||!h)return null;
    const x=Math.min(w-1,Math.floor((box[0]+box[2]/2)*w)),y=Math.min(h-1,Math.floor((box[1]+box[3]/2)*h));
    const samples=[];
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const n=g[Math.max(0,Math.min(h-1,y+dy))*w+Math.max(0,Math.min(w-1,x+dx))];
      if(typeof n==='number'&&Number.isFinite(n)&&n>0.15&&n<8)samples.push(n);
    }
    samples.sort((a,b)=>a-b);return samples.length>=3?samples[Math.floor(samples.length/2)]:null;
  };
  async function recognize(s){
    if(!alive(s)||s.inFlight||s.anchorReady||!latest?.lidarAvailable||Date.now()<s.retryAt)return;
    const frame=latest;if(s.lastModelFrame===frame.frameId||Date.now()-frame.capturedAtMs>1000)return;
    s.inFlight=true;s.lastModelFrame=frame.frameId;s.seedFailed=false;
    const controller=new AbortController();s.abort=controller;
    const timeout=setTimeout(()=>controller.abort(),12000);
    log('model_request',{phase:'initial_lock',frameId:frame.frameId});
    try{
      const response=await fetch('/api/native-find-check',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,
        body:JSON.stringify({version:1,token:s.token,phase:'lock',target:s.target,frameId:frame.frameId,imageDataUrl:frame.imageDataUrl})});
      const result=await response.json();if(!alive(s))return;
      if(!response.ok||!result.ok)throw new Error(result.error||'recognition_failed');
      if(result.token!==s.token||result.frameId!==frame.frameId||Date.now()-frame.capturedAtMs>11000)return;
      if(!result.visible||!Array.isArray(result.box)){s.retryAt=Date.now()+1000;local(s,'search');return;}
      s.seedFrame=frame.frameId;s.initialMeters=frameDepth(frame,result.box);s.firstResult=result;
      log('seed',{frameId:frame.frameId,box:result.box,initialMeters:s.initialMeters});
      s.phase='approach';s.observation=null;s.seedAt=Date.now();
      post({type:'seed',token:s.token,frameId:frame.frameId,box:result.box});
      announce(s);
    }catch(error){if(alive(s)){s.retryAt=Date.now()+1500;log('model_error',{reason:String(error.message).slice(0,150)});}}
    finally{clearTimeout(timeout);s.inFlight=false;if(s.abort===controller)s.abort=null;}
  }
  function handover(s){
    if(!alive(s)||busy(s))return;
    s.phase='legacy_hand';s.reminder.nativeFindHandStage=true;
    post({type:'handover',token:s.token,code:'reach'});
    s.reminder.findLocationAnnounced=true;s.reminder.findTargetLocked=true;
    s.reminder.findTargetSeenCount=Math.max(2,s.reminder.findTargetSeenCount||0);
    s.reminder.findLastSpokenStatus='';s.reminder.findLastSpokenAt=0;
    log('legacy_hand_handover',{meters:s.observation?.meters});
    if(timer)clearInterval(timer);timer=null;
    oldTick(s.reminder);
  }
  function tick(s){
    if(!alive(s)||document.hidden||!selected||!enabled){stop();return;}
    if(s.phase==='legacy_hand')return;
    if(!s.announced&&s.firstResult){announce(s);return;}
    if(!s.anchorReady){
      if(s.phase==='lock'||s.seedFailed)local(s,'search');
      if(s.phase==='lock'||s.seedFailed||(s.seedAt&&Date.now()-s.seedAt>1500))recognize(s);
      return;
    }
    const o=s.observation;
    if(!NativeFindPolicy.fresh(o,Date.now())){local(s,'lost');return;}
    // Coordinate remains valid outside camera view: only local corrections, no cloud call.
    if(o.onScreen&&o.meters<=0.85){local(s,'stop');handover(s);return;}
    const code=NativeFindPolicy.approach(o,s.lastCode);
    if(s.candidateCode!==code){s.candidateCode=code;s.candidateCount=1;return;}
    s.candidateCount=(s.candidateCount||0)+1;
    if(s.candidateCount<3)return;
    local(s,code);
  }
  function begin(reminder){
    stop();const s={reminder,target:reminder.findTarget,task:reminder.findTaskSeq||0,
      token:`nf_${Date.now()}_${++counter}`,phase:'lock',seedFrame:0,anchorReady:false,observation:null,
      inFlight:false,lastModelFrame:0,retryAt:Date.now()+400,lastCode:'',lastSaid:0,modelSpeechUntil:0};
    current=s;post({type:'begin',token:s.token});timer=setInterval(()=>tick(s),100);log('started',{target:s.target,token:s.token});
  }
  document.addEventListener('click',event=>{
    const id=event.target?.closest?.('button')?.id||'';if(!id.startsWith('start-'))return;
    selected=id===(window.__ACCESSIBLE_VISION_BACKEND__==='aliyun'?'start-aliyun-unified-visual-assistant':'start-unified-visual-assistant');stop();
  },true);
  document.addEventListener('click',event=>{if(event.target?.closest?.('button')?.id==='stop-realtime')finishFromButton();},true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});window.addEventListener('pagehide',stop);
  const previousHooks=window.__accessibleVisionEnableRuntimeHooks;
  window.__accessibleVisionEnableRuntimeHooks=()=>{
    previousHooks?.();if(window.__nativeFindHooks||typeof runGeminiFindObjectTick!=='function')return;
    window.__nativeFindHooks=true;
    fetch('/api/native-find-config').then(r=>r.json()).then(c=>{enabled=c.enabled===true&&c.version===1;}).catch(()=>{});
    const originalPlaybackActive=isGeminiPlaybackActive;
    isGeminiPlaybackActive=function(reminder){
      // The original hand-guidance voice remains authoritative. Once its model
      // turn has completed, ignore a stale audio-player latch so the next
      // recognized hand/target relation can be spoken instead of staying mute.
      if(current?.phase==='legacy_hand'&&reminder===current.reminder&&!reminder.turnInProgress)return false;
      return originalPlaybackActive.apply(this,arguments);
    };
    oldTick=runGeminiFindObjectTick;
    runGeminiFindObjectTick=function(reminder){
      if(!selected||!enabled||!latest?.lidarAvailable){stop();return oldTick.apply(this,arguments);}
      if(!reminder?.findTarget){stop();return;}
      if(current&&alive(current)&&current.phase==='legacy_hand')return oldTick.apply(this,arguments);
      if(!current||!alive(current))begin(reminder);tick(current);
    };
    const originalClear=clearGeminiFindObjectMemory;
    clearGeminiFindObjectMemory=function(){stop();return originalClear.apply(this,arguments);};
    const originalSend=sendGeminiLiveEvent;
    sendGeminiLiveEvent=function(event){if(current&&event?.type==='say')mute(current);return originalSend.apply(this,arguments);};
  };
})();
