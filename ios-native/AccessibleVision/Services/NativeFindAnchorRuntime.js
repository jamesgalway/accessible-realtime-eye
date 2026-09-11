(() => {
  'use strict';
  if (!window.webkit?.messageHandlers?.nativeFind || window.__nativeFindInstalled) return;
  window.__nativeFindInstalled = true;
  let selected=false,enabled=false,latest=null,current=null,counter=0,timer=null,oldTick=null;
  const entryIds={
    greenCloud:new Set(['start-unified-visual-assistant','start-browser-direct-unified-assistant']),
    aliyun:new Set(['start-unified-visual-assistant','start-aliyun-unified-visual-assistant'])
  };
  const post=body=>window.webkit.messageHandlers.nativeFind.postMessage(body);
  const log=(name,details)=>{if(typeof logClientEvent==='function')logClientEvent(`native_find.${name}`,details);};
  const alive=s=>current===s&&appState.geminiReminder===s.reminder&&!s.reminder.stopping
    &&s.reminder.findTarget===s.target&&(s.reminder.findTaskSeq||0)===s.task;
  const phrases={search:'还没找到，请慢慢移动镜头。',left:'往左一点。',right:'往右一点。',
    forward:'方向对了。',reach:'到了，可以伸手。',reachLow:'到了，请蹲下伸手。'};
  let speechOwner=null,speechPlayer=null,speechPendingAt=0,speechAudioAt=0,speechFallback=null;
  function playerFor(reminder){return reminder?.transport==='aliyun-realtime'?appState.realtime?.player:reminder?.player;}
  function protectSpeech(reminder){
    speechOwner=reminder;
    const player=playerFor(reminder);
    if(!player||player===speechPlayer)return;
    speechPlayer=player;speechPendingAt=0;speechAudioAt=0;
    const enqueue=player.enqueue;
    player.enqueue=function(data){
      // Discard only a superseded fallback that has never reached the speaker.
      // Once its first audio chunk is queued, let the entire utterance finish.
      if(speechPlayer===this&&speechFallback&&!speechFallback.started){
        const f=speechFallback;
        if(f.cancelled||!alive(f.state)||handSide(f.state)!==f.side){
          f.cancelled=true;speechPendingAt=0;
          if(!f.logged){f.logged=true;log('hand_fallback_cancelled',{reason:'superseded_before_audio'});}
          return Date.now();
        }
        f.started=true;
      }
      const end=enqueue.apply(this,arguments);
      if(speechOwner===appState.geminiReminder&&speechPlayer===this){
        if(speechPendingAt)log('speech_audio_started',{waitMs:Date.now()-speechPendingAt});
        speechPendingAt=0;speechAudioAt=Date.now();
      }
      return end;
    };
  }
  function physicalSpeechBusy(reminder){
    if(reminder!==speechOwner||reminder!==appState.geminiReminder||reminder?.stopping)return false;
    const player=playerFor(reminder),ctx=player?.audioContext,now=Date.now();
    // A delayed first chunk must not let a second SAY cancel the first request.
    if(speechPendingAt){
      if(now-speechPendingAt<20000)return true;
      log('speech_audio_timeout',{waitMs:now-speechPendingAt});speechPendingAt=0;
    }
    if(ctx&&player){
      if((ctx.state==='suspended'||ctx.state==='interrupted')&&player.sources?.length)return true;
      const latency=Math.max(0.15,Number(ctx.outputLatency)||0,Number(ctx.baseLatency)||0);
      if(player.nextStartTime>0&&ctx.currentTime<player.nextStartTime+latency)return true;
    }
    return speechAudioAt>0&&now-speechAudioAt<300;
  }

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
    if(reminder?.turnInProgress||reminder?.assistantResponseActive||isGeminiPlaybackActive(reminder))return true;
    if(reminder?.transport==='aliyun-realtime'){
      const host=appState.activeReminder,rt=appState.realtime;
      return !!(host?.pendingMessage||host?.awaitingResponse||rt?.responseInProgress);
    }
    return false;
  }
  const busy=s=>Date.now()<s.speechGuardUntil||voiceBusy(s.reminder);
  function handSide(s){
    const e=s.handEvidence,o=s.observation;
    if(!alive(s)||s.phase!=='legacy_hand'||!e||e.visible!=='no'||e.hand!=='visible'
      ||e.confidence<0.55||Date.now()-e.capturedAtMs>6000
      ||!s.anchorReady||!NativeFindPolicy.fresh(o,Date.now())||o.inFront===false)return '';
    return o.x<0?'left':o.x>1?'right':'';
  }
  function handFallback(s){
    const side=handSide(s);
    if(!side||busy(s)||Date.now()-(s.lastFallbackAt||0)<2500)return;
    const text=side==='left'?'手往左一点。':'手往右一点。';
    if(sendGeminiLiveEvent({type:'say',text,deliveryMode:'guidance',nativeFindFallback:side})){
      s.lastFallbackAt=Date.now();
      log('hand_fallback',{side,x:s.observation.x,source:'original_world_anchor'});
    }
  }
  window.__nativeFindHandResult=(reminder,result)=>{
    const s=current;if(!s||!alive(s)||s.phase!=='legacy_hand'||s.reminder!==reminder)return false;
    s.handEvidence=result;
    if(speechFallback&&!speechFallback.started&&handSide(s)!==speechFallback.side)speechFallback.cancelled=true;
    // A missing target is not permission to re-search or walk. The next model
    // frame still runs normally; the original anchor supplies lateral help only.
    if(result.visible==='no'&&result.hand==='visible'&&result.confidence>=0.55){handFallback(s);return true;}
    return false;
  };
  function stop(){
    if(speechFallback&&!speechFallback.started)speechFallback.cancelled=true;
    if(current){current.reminder.nativeFindHandStage=false;current.abort?.abort();post({type:'stop'});log('stopped',{token:current.token});}
    current=null;if(timer)clearInterval(timer);timer=null;
  }
  function speak(s,code){
    if(!alive(s)||busy(s))return false;
    // Model speech reaches the user a few seconds after this decision. Leave
    // enough time to act before another identical lateral command is queued.
    const now=Date.now(),repeat=code==='search'?4000:6500;
    if(s.lastCode===code&&now-s.lastSaid<repeat)return false;
    const text=code==='reach'&&s.firstResult?.requiresCrouch?phrases.reachLow:phrases[code];
    if(!sendGeminiLiveEvent({type:'say',text,deliveryMode:'guidance'}))return false;
    s.lastCode=code;s.lastSaid=now;
    log('model_guidance',{code,phase:s.phase,meters:s.observation?.meters,x:s.observation?.x,
      y:s.observation?.y,onScreen:s.observation?.onScreen,
      targetWorld:s.observation?.targetWorld,cameraWorld:s.observation?.cameraWorld,
      requiresCrouch:code==='reach'&&s.firstResult?.requiresCrouch===true,source:'lidar_world_anchor'});
    return true;
  }
  function announce(s){
    if(!s.firstResult||!s.anchorReady||!NativeFindPolicy.fresh(s.observation,Date.now())||s.announced||busy(s))return;
    const r=s.firstResult,o=s.observation;
    const x=o?.valid?o.x:r.box[0]+r.box[2]/2,y=o?.valid?o.y:r.box[1]+r.box[3]/2;
    const meters=o?.valid?o.meters:s.initialMeters;
    const context={enabled:true,zone:x<1/3?'left':x>2/3?'right':'center',targetY:y,
      distance:Number.isFinite(meters)?{meters,source:'apple_lidar',confidence:1,frameId:s.seedFrame}:null};
    let location=r.location||r.speech||'';
    const targetAt=location.indexOf(s.target);
    if(targetAt>=0&&targetAt<=12)location=location.slice(targetAt+s.target.length).replace(/^(?:就)?在/,'');
    if(announceFindObjectLocation(s.reminder,s.target,location,s.seedFrame,r.confidence,context)){
      s.announced=true;
    }
  }
  window.__nativeFindFrame=packet=>{latest=packet;};
  window.__nativeFindObservation=o=>{
    const s=current;if(!s||!alive(s)||o.token!==s.token||o.seedFrameId!==s.seedFrame)return;
    s.observation=o;
    if(o.anchorReady)s.anchorReady=true;
    if(o.valid){s.anchorReady=true;s.seedFailed=false;s.lastInvalid='';return;}
    // Never clear the anchor or restart recognition because depth/view changes.
    if(o.lost&&!s.anchorReady){
      s.seedFailed=true;s.firstResult=null;s.seedFrame=0;s.observation=null;s.phase='lock';
      s.retryAt=Date.now()+1500;s.hasSearchMiss=false;
      log('seed_retry',{reason:o.reason});
    }
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
      const body={target:s.target,frameCount:frame.frameId,reminderSessionId:s.reminder.reminderSessionId||'',
        nativeFindHandStage:false,nativeFindAnchorSeed:true,imageDataUrl:frame.imageDataUrl};
      const direct=s.reminder.findScreenTransport==='browser_direct_live'
        &&typeof requestBrowserDirectFindScreenResult==='function';
      let r;
      if(direct){
        r=await requestBrowserDirectFindScreenResult(s.reminder,{...body,requestSeq:1});
      }else{
        const response=await fetch('/api/find-object-check',{method:'POST',headers:{'Content-Type':'application/json'},
          signal:controller.signal,body:JSON.stringify(body)});
        r=await response.json();
        if(!response.ok||!r.ok)throw new Error(r.error||'recognition_failed');
      }
      if(!alive(s))return;
      if(!r?.ok)throw new Error(r?.error||'recognition_failed');
      if(Number(r.frameCount)!==frame.frameId||Date.now()-frame.capturedAtMs>11000)return;
      const x=Number(r.targetX),y=Number(r.targetY),confidence=Number(r.confidence||0);
      if(r.visible!=='yes'||confidence<0.55||!Number.isFinite(x)||!Number.isFinite(y)
        ||x<0||x>1||y<0||y>1){s.hasSearchMiss=true;s.retryAt=Date.now()+700;return;}
      const half=0.02;
      const box=[Math.max(0,x-half),Math.max(0,y-half),Math.min(2*half,x+half,1-x+half),Math.min(2*half,y+half,1-y+half)];
      const location=String(r.location||'');
      const firstResult={...r,visible:true,confidence,box,speech:location,
        requiresCrouch:/(?:地面|地板|脚边|台阶底)/.test(location)};
      s.seedFrame=frame.frameId;s.initialMeters=frameDepth(frame,box);s.firstResult=firstResult;
      s.phase='approach';s.observation=null;
      log('seed',{frameId:frame.frameId,box,initialMeters:s.initialMeters,
        transport:direct?'browser_direct_live':'server_find_object'});
      post({type:'seed',token:s.token,frameId:frame.frameId,box});announce(s);
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
    if(s.phase==='legacy_hand'){handFallback(s);return;}
    // Let the opening acknowledgement finish. Only say "not found" after an
    // actual recognition miss; a fast first hit goes straight to its location.
    if(!s.firstResult){recognize(s);if(s.hasSearchMiss)speak(s,'search');return;}
    if(!s.announced){announce(s);return;}
    if(busy(s))return;
    if(s.phase==='reach_speech'){
      s.phase='legacy_hand';s.reminder.nativeFindHandStage=true;
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
    const code=NativeFindPolicy.approach(o,s.lastCode);
    // Prefer a centered handoff from normal reach distance. At a stricter
    // distance, allow any on-screen target so a small horizontal seed error
    // cannot block hand/contact recognition after the user has arrived.
    const centered=o.onScreen===true&&o.x>=0.40&&o.x<=0.60;
    const closeEnough=o.meters<=0.60;
    if((o.meters<=0.85&&centered)||closeEnough){if(speak(s,'reach'))s.phase='reach_speech';return;}
    if(!['left','right'].includes(code)){
      // Once the target returns to the model's middle third, discard the old
      // side latch so a small later wobble cannot revive a stale instruction.
      if(code==='forward'&&['left','right'].includes(s.lastCode)){s.lastCode='';s.candidateCode='';}
      return;
    }
    if(s.candidateCode!==code){s.candidateCode=code;s.candidateAt=Date.now();return;}
    if(Date.now()-s.candidateAt>=500)speak(s,code);
  }
  function begin(reminder){
    stop();reminder.nativeFindHandStage=false;const s={reminder,target:reminder.findTarget,task:reminder.findTaskSeq||0,
      token:`nf_${Date.now()}_${++counter}`,phase:'lock',seedFrame:0,anchorReady:false,observation:null,
      inFlight:false,lastModelFrame:0,retryAt:Date.now()+400,hasSearchMiss:false,lastCode:'',lastSaid:0,
      speechGuardUntil:Date.now()+700,lastSpeechBlockedAt:0};
    protectSpeech(reminder);
    current=s;post({type:'begin',token:s.token});timer=setInterval(()=>tick(s),100);
    log('started',{target:s.target,token:s.token,version:41,voice:'existing_model'});
  }
  document.addEventListener('click',event=>{
    const button=event.target?.closest?.('button'),id=button?.id||'';
    if(!id.startsWith('start-'))return;
    selected=entryIds[window.__ACCESSIBLE_VISION_BACKEND__]?.has(id)===true;stop();
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
    const originalPlayback=isGeminiPlaybackActive;
    isGeminiPlaybackActive=function(reminder=appState.geminiReminder){
      return physicalSpeechBusy(reminder)||originalPlayback.apply(this,arguments);
    };
    if(typeof handleGeminiLiveMessage==='function'){
      const originalMessage=handleGeminiLiveMessage;
      handleGeminiLiveMessage=function(raw){
        if(speechOwner===appState.geminiReminder&&!speechOwner?.stopping){
          let message;try{message=JSON.parse(raw);}catch{}
          if(message?.interrupted&&(physicalSpeechBusy(speechOwner)||speechOwner.turnInProgress)){
            log('speech_interruption_ignored',{reason:'button_only_find_task'});
            raw=JSON.stringify({...message,interrupted:false});
          }
        }
        return originalMessage.call(this,raw);
      };
    }
    const originalSend=sendGeminiLiveEvent;
    sendGeminiLiveEvent=function(event){
      // The voice model receives text only while geometry owns the approach.
      if(current&&current.phase!=='legacy_hand'&&(event?.type==='video'||event?.type==='ask'))return false;
      if(current&&event?.type==='say'&&event.text){
        if(busy(current)){
          const now=Date.now();
          if(now-current.lastSpeechBlockedAt>1000){current.lastSpeechBlockedAt=now;log('speech_waiting',{phase:current.phase,text:String(event.text).slice(0,40)});}
          return false;
        }
        const fallback=event.nativeFindFallback;
        const previousFallback=speechFallback;
        speechFallback=fallback?{state:current,side:fallback,started:false,cancelled:false}:null;
        const outgoing={...event};delete outgoing.nativeFindFallback;
        const sent=originalSend.call(this,outgoing);
        if(!sent)speechFallback=previousFallback;
        if(sent){
          const now=Date.now();
          speechPendingAt=now;
          current.speechGuardUntil=Math.max(current.speechGuardUntil,now+700);
          log('speech_reserved',{phase:current.phase,text:String(event.text).slice(0,60)});
        }
        return sent;
      }
      return originalSend.apply(this,arguments);
    };
  };
})();
