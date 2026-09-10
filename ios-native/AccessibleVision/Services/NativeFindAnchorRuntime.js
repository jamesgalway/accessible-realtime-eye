(() => {
  'use strict';
  if (!window.webkit?.messageHandlers?.nativeFind || window.__nativeFindInstalled) return;
  window.__nativeFindInstalled = true;
  let selected=false,enabled=false,latest=null,current=null,counter=0,timer=null,oldTick=null;
  const post=body=>window.webkit.messageHandlers.nativeFind.postMessage(body);
  const log=(name,details)=>{if(typeof logClientEvent==='function')logClientEvent(`native_find.${name}`,details);};
  const alive=s=>current===s&&appState.geminiReminder===s.reminder&&!s.reminder.stopping
    &&s.reminder.findTarget===s.target&&(s.reminder.findTaskSeq||0)===s.task;
  const phrases={search:'还没找到，请慢慢移动镜头。',left:'往左一点。',right:'往右一点。',
    forward:'方向对了。',reach:'到了，可以伸手。',reachLow:'到了，请蹲下伸手。'};

  // Recover only an expired player latch. A completed model response alone does
  // not mean queued audio has finished; respect the actual audio clock and tail.
  function refreshAudio(reminder){
    const ali=reminder?.transport==='aliyun-realtime';
    const owner=ali?appState.realtime:reminder,ctx=owner?.audioContext,player=owner?.player;
    if(!ctx||!player)return;
    if(ctx.state==='suspended'||ctx.state==='interrupted'){
      if(Date.now()-(owner.nativeFindResumeAt||0)>2000){owner.nativeFindResumeAt=Date.now();Promise.resolve(ctx.resume()).catch(()=>{});}
      return;
    }
    const until=ali?owner.assistantPlaybackUntil:owner.playbackUntil;
    if(ctx.state==='running'&&!reminder.turnInProgress&&!owner.responseInProgress
      &&player.nextStartTime<=ctx.currentTime&&Date.now()>(until||0)+300){
      if(ali)owner.assistantPlaybackActive=false;else owner.playbackActive=false;
    }
  }
  function voiceBusy(reminder){
    refreshAudio(reminder);
    if(reminder?.turnInProgress||isGeminiPlaybackActive(reminder))return true;
    if(reminder?.transport==='aliyun-realtime'){
      const host=appState.activeReminder,rt=appState.realtime;
      return !!(host?.pendingMessage||host?.awaitingResponse||rt?.responseInProgress);
    }
    return false;
  }
  const busy=s=>Date.now()<s.speechGuardUntil||voiceBusy(s.reminder);
  function stop(){
    if(current){current.reminder.nativeFindHandStage=false;current.abort?.abort();post({type:'stop'});log('stopped',{token:current.token});}
    current=null;if(timer)clearInterval(timer);timer=null;
  }
  function speak(s,code){
    if(!alive(s)||busy(s))return false;
    const now=Date.now(),repeat=code==='search'?4000:3500;
    if(s.lastCode===code&&now-s.lastSaid<repeat)return false;
    const text=code==='reach'&&s.firstResult?.requiresCrouch?phrases.reachLow:phrases[code];
    if(!sendGeminiLiveEvent({type:'say',text,deliveryMode:'guidance'}))return false;
    s.lastCode=code;s.lastSaid=now;s.speechGuardUntil=now+700;
    log('model_guidance',{code,phase:s.phase,meters:s.observation?.meters,
      requiresCrouch:code==='reach'&&s.firstResult?.requiresCrouch===true,source:'lidar_world_anchor'});
    return true;
  }
  function announce(s){
    if(!s.firstResult||s.announced||busy(s))return;
    const r=s.firstResult,o=s.observation;
    const x=o?.valid?o.x:r.box[0]+r.box[2]/2,y=o?.valid?o.y:r.box[1]+r.box[3]/2;
    const meters=o?.valid?o.meters:s.initialMeters;
    const context={enabled:true,zone:x<1/3?'left':x>2/3?'right':'center',targetY:y,
      distance:Number.isFinite(meters)?{meters,source:'apple_lidar',confidence:1,frameId:s.seedFrame}:null};
    let location=r.location||r.speech||'';
    const targetAt=location.indexOf(s.target);
    if(targetAt>=0&&targetAt<=12)location=location.slice(targetAt+s.target.length).replace(/^(?:就)?在/,'');
    if(announceFindObjectLocation(s.reminder,s.target,location,s.seedFrame,r.confidence,context)){
      s.announced=true;s.speechGuardUntil=Date.now()+700;
    }
  }
  window.__nativeFindFrame=packet=>{latest=packet;};
  window.__nativeFindObservation=o=>{
    const s=current;if(!s||!alive(s)||o.token!==s.token||o.seedFrameId!==s.seedFrame)return;
    s.observation=o;
    if(o.valid){s.anchorReady=true;s.seedFailed=false;s.lastInvalid='';return;}
    // Never clear the anchor or restart recognition because depth/view changes.
    if(o.lost&&!s.anchorReady)s.seedFailed=true;
    if(s.lastInvalid!==o.reason){s.lastInvalid=o.reason;log('tracking_status',{reason:o.reason,anchorPreserved:s.anchorReady});}
  };
  const frameDepth=(frame,box)=>{
    const w=frame.depthGridWidth,h=frame.depthGridHeight,g=frame.depthGrid;
    if(!Array.isArray(g)||!w||!h)return null;
    const x=Math.min(w-1,Math.floor((box[0]+box[2]/2)*w)),y=Math.min(h-1,Math.floor((box[1]+box[3]/2)*h));
    const samples=[];
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(x+dx<0||x+dx>=w||y+dy<0||y+dy>=h)continue;
      const n=g[(y+dy)*w+x+dx];if(typeof n==='number'&&Number.isFinite(n)&&n>0.15&&n<8)samples.push(n);
    }
    samples.sort((a,b)=>a-b);return samples.length>=3?samples[Math.floor(samples.length/2)]:null;
  };
  async function recognize(s){
    if(!alive(s)||s.inFlight||s.firstResult||!latest?.lidarAvailable||Date.now()<s.retryAt)return;
    const frame=latest;if(s.lastModelFrame===frame.frameId||Date.now()-frame.capturedAtMs>1000)return;
    s.inFlight=true;s.lastModelFrame=frame.frameId;
    const controller=new AbortController();s.abort=controller;const timeout=setTimeout(()=>controller.abort(),12000);
    log('model_request',{phase:'initial_lock',frameId:frame.frameId});
    try{
      const response=await fetch('/api/native-find-check',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,
        body:JSON.stringify({version:1,token:s.token,phase:'lock',target:s.target,frameId:frame.frameId,imageDataUrl:frame.imageDataUrl})});
      const r=await response.json();if(!alive(s))return;
      if(!response.ok||!r.ok)throw new Error(r.error||'recognition_failed');
      if(r.token!==s.token||r.frameId!==frame.frameId||Date.now()-frame.capturedAtMs>11000)return;
      if(!r.visible||!Array.isArray(r.box)){s.retryAt=Date.now()+1000;return;}
      s.seedFrame=frame.frameId;s.initialMeters=frameDepth(frame,r.box);s.firstResult=r;
      s.phase='approach';s.observation=null;
      log('seed',{frameId:frame.frameId,box:r.box,initialMeters:s.initialMeters});
      post({type:'seed',token:s.token,frameId:frame.frameId,box:r.box});announce(s);
    }catch(error){if(alive(s)){s.retryAt=Date.now()+1500;log('model_error',{reason:String(error.message).slice(0,150)});}}
    finally{clearTimeout(timeout);s.inFlight=false;if(s.abort===controller)s.abort=null;}
  }
  function handTick(s){
    if(s.handInFlight)return;
    s.handInFlight=true;
    Promise.resolve(oldTick(s.reminder)).catch(error=>log('hand_error',{reason:String(error.message).slice(0,100)}))
      .finally(()=>{s.handInFlight=false;});
  }
  function tick(s){
    if(!alive(s)||!selected||!enabled){stop();return;}
    if(document.hidden)return;
    refreshAudio(s.reminder);
    if(s.phase==='legacy_hand')return;
    if(!s.firstResult){recognize(s);speak(s,'search');return;}
    if(!s.announced){announce(s);return;}
    if(busy(s))return;
    if(s.phase==='reach_speech'){
      s.phase='legacy_hand';s.reminder.nativeFindHandStage=true;post({type:'stop'});
      s.reminder.findLocationAnnounced=true;s.reminder.findTargetLocked=true;
      s.reminder.findTargetSeenCount=Math.max(2,s.reminder.findTargetSeenCount||0);
      s.reminder.findLastSpokenStatus='';s.reminder.findLastSpokenAt=0;
      log('legacy_hand_handover',{meters:s.observation?.meters});handTick(s);return;
    }
    const o=s.observation;
    // Keep running through temporary missing depth/tracking; do not invent a new
    // distance from an old pose. Normal tracking automatically resumes the anchor.
    if(!NativeFindPolicy.fresh(o,Date.now()))return;
    // Radial world distance works when the phone points away as well as on-screen.
    // Reach notification always precedes optional direction speech.
    if(o.meters<=0.85){if(speak(s,'reach'))s.phase='reach_speech';return;}
    const code=NativeFindPolicy.approach(o,s.lastCode);
    if(!['left','right'].includes(code))return;
    if(s.candidateCode!==code){s.candidateCode=code;s.candidateAt=Date.now();return;}
    if(Date.now()-s.candidateAt>=500)speak(s,code);
  }
  function begin(reminder){
    stop();reminder.nativeFindHandStage=false;const s={reminder,target:reminder.findTarget,task:reminder.findTaskSeq||0,
      token:`nf_${Date.now()}_${++counter}`,phase:'lock',seedFrame:0,anchorReady:false,observation:null,
      inFlight:false,lastModelFrame:0,retryAt:Date.now()+400,lastCode:'',lastSaid:0,speechGuardUntil:0};
    current=s;post({type:'begin',token:s.token});timer=setInterval(()=>tick(s),100);
    log('started',{target:s.target,token:s.token,version:27,voice:'existing_model'});
  }
  document.addEventListener('click',event=>{
    const button=event.target?.closest?.('button'),id=button?.id||'';
    if(!id.startsWith('start-'))return;
    selected=id===(window.__ACCESSIBLE_VISION_BACKEND__==='aliyun'?'start-aliyun-unified-visual-assistant':'start-unified-visual-assistant');stop();
  },true);
  window.addEventListener('pagehide',stop);
  const previousHooks=window.__accessibleVisionEnableRuntimeHooks;
  window.__accessibleVisionEnableRuntimeHooks=()=>{
    previousHooks?.();if(window.__nativeFindHooks||typeof runGeminiFindObjectTick!=='function')return;
    window.__nativeFindHooks=true;
    fetch('/api/native-find-config').then(r=>r.json()).then(c=>{enabled=c.enabled===true&&c.version===1;}).catch(()=>{});
    oldTick=runGeminiFindObjectTick;
    runGeminiFindObjectTick=function(reminder){
      if(current&&alive(current)){
        tick(current);if(current?.phase==='legacy_hand')handTick(current);return;
      }
      stop();
      if(!selected||!enabled||!latest?.lidarAvailable)return oldTick.apply(this,arguments);
      if(!reminder?.findTarget)return;
      begin(reminder);tick(current);
    };
    const originalClear=clearGeminiFindObjectMemory;
    clearGeminiFindObjectMemory=function(){stop();return originalClear.apply(this,arguments);};
    const originalSend=sendGeminiLiveEvent;
    sendGeminiLiveEvent=function(event){
      // The voice model receives text only while geometry owns the approach.
      if(current&&current.phase!=='legacy_hand'&&(event?.type==='video'||event?.type==='ask'))return false;
      return originalSend.apply(this,arguments);
    };
  };
})();
