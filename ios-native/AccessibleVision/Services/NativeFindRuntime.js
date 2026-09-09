(() => {
  'use strict';
  if (!window.webkit?.messageHandlers?.nativeFind || window.__nativeFindInstalled) return;
  window.__nativeFindInstalled = true;
  let selected = false, enabled = false, latest = null, current = null, counter = 0;
  let timer = null;
  const post = body => window.webkit.messageHandlers.nativeFind.postMessage(body);
  const log = (name, details) => { if (typeof logClientEvent === 'function') logClientEvent(`native_find.${name}`, details); };
  const alive = s => current === s && appState.geminiReminder === s.reminder && !s.reminder.stopping
    && s.reminder.findTarget === s.target && (s.reminder.findTaskSeq || 0) === s.task;
  const busy = s => s.reminder.turnInProgress || isGeminiPlaybackActive(s.reminder) || Date.now() < s.modelSpeechUntil;
  const mute = s => post({ type: 'mute', token: s.token });
  function stop() {
    if (current) { current.abort?.abort(); post({type:'stop'}); log('stopped', {token:current.token}); }
    current = null;
    if (timer) clearInterval(timer);
    timer = null;
  }
  function sayLocal(s, code) {
    if (!alive(s) || busy(s)) return;
    const now = Date.now();
    if (s.lastCode === code && now - s.lastSaid < NativeFindPolicy.repeatMs(code)) return;
    if (now - s.lastSaid < 850 && !['lost','stop','hold'].includes(code)) return;
    post({type:'speak', token:s.token, code});
    s.lastCode = code; s.lastSaid = now;
    log('local_guidance', {code, phase:s.phase, meters:s.observation?.meters});
  }
  function sayModel(s, text) {
    if (!alive(s) || !text || busy(s)) return false;
    mute(s);
    const sent = sendGeminiLiveEvent({type:'say', text, deliveryMode:'guidance'});
    if (sent) { s.modelSpeechUntil = Date.now() + 1200; log('model_speech', {phase:s.phase}); }
    return Boolean(sent);
  }
  window.__nativeFindFrame = packet => { latest = packet; };
  window.__nativeFindObservation = observation => {
    const s = current;
    if (!s || !alive(s) || observation.token !== s.token || observation.seedFrameId !== s.seedFrame) return;
    s.observation = observation;
    if (observation.lost) {
      s.phase = 'lock'; s.contactCount = 0; s.pendingSpeech = '';
      mute(s); sayLocal(s, 'lost');
      log('lost', {reason:observation.reason});
    }
  };
  async function recognize(s, phase) {
    if (!alive(s) || s.inFlight || !latest?.lidarAvailable || Date.now() - latest.capturedAtMs > 1000) return;
    const frame = latest;
    if (s.lastModelFrame === frame.frameId || Date.now() < s.retryAt) return;
    s.inFlight = true; s.lastModelFrame = frame.frameId;
    const controller = new AbortController(); s.abort = controller;
    const timeout = setTimeout(() => controller.abort(), 11000);
    log('model_request', {phase, frameId:frame.frameId});
    try {
      const response = await fetch('/api/native-find-check', {
        method:'POST', headers:{'Content-Type':'application/json'}, signal:controller.signal,
        body:JSON.stringify({version:1, token:s.token, phase, target:s.target,
          frameId:frame.frameId, imageDataUrl:frame.imageDataUrl,
          referenceImageDataUrl:s.reference || ''})
      });
      const result = await response.json();
      if (!alive(s)) return;
      if (!response.ok || !result.ok || result.token !== s.token || result.frameId !== frame.frameId) throw new Error('recognition_failed');
      if (Date.now() - frame.capturedAtMs > 6500) { s.retryAt = Date.now() + 500; return; }
      if (!result.visible || !Array.isArray(result.box)) {
        s.phase = 'lock'; s.observation = null; s.contactCount = 0;
        mute(s); sayLocal(s, 'lost'); s.retryAt = Date.now() + 1500; return;
      }
      s.lastModelAt = Date.now(); s.canApproach = result.canApproach === true;
      // Don't reset a healthy tracker on every hand check. New boxes only seed loss/initial lock.
      if (!NativeFindPolicy.fresh(s.observation, Date.now())) {
        s.seedFrame = frame.frameId; s.observation = null;
        post({type:'seed', token:s.token, frameId:frame.frameId, box:result.box, handPhase:phase === 'hand'});
      }
      if (!s.reference) s.reference = frame.imageDataUrl;
      if (phase === 'lock') {
        s.phase = s.handEntered ? 'hand' : 'approach';
        if (!s.announced) { s.pendingSpeech = result.speech; s.announced = true; }
      } else {
        s.nearReady = result.touchReady === true;
        if ((result.touchReady && s.observation?.meters <= 0.85) || (s.handEntered && result.handVisible)) {
          s.handEntered = true; s.phase = 'hand';
          post({type:'hand',token:s.token});
          if (!s.handAnnounced || (result.handVisible && !s.handSeenByModel)) {
            s.pendingSpeech = result.speech; s.handAnnounced = true;
          }
          s.handSeenByModel = result.handVisible;
        } else {
          s.phase = s.observation?.meters <= 0.85 ? 'near_wait' : 'approach';
          if (s.phase === 'near_wait') s.pendingSpeech = result.speech;
        }
        // Two independent current images, with the local hand still at the target.
        const o = s.observation;
        const atTarget = NativeFindPolicy.fresh(o, Date.now()) && Number.isFinite(o.handX)
          && Math.hypot(o.x-o.handX,o.y-o.handY) < 0.10;
        s.contactCount = result.contact && atTarget && Date.now()-frame.capturedAtMs < 3500 ? s.contactCount + 1 : 0;
        if (s.contactCount >= 2) {
          s.phase = 'done'; s.pendingSpeech = '';
          mute(s);
          s.reminder.findContactCompletionPending = true;
          s.reminder.findContactCount = s.contactCount;
          s.reminder.findContactCompletionConfidence = result.confidence;
          s.reminder.findContactCompletionFrameCount = frame.frameId;
          completeGeminiFindObjectWhenReady(s.reminder);
          return;
        }
      }
      s.retryAt = Date.now() + (phase === 'hand' ? 1500 : 500);
    } catch (error) {
      if (alive(s)) { s.retryAt = Date.now() + 2000; log('model_error', {reason:error.name}); }
    } finally {
      clearTimeout(timeout);
      s.inFlight = false;
      if (s.abort === controller) s.abort = null;
    }
  }
  function tick(s) {
    if (!alive(s) || document.hidden || !selected || !enabled) { stop(); return; }
    if (s.phase === 'done') { completeGeminiFindObjectWhenReady(s.reminder); return; }
    const now = Date.now(), o = s.observation;
    if (!latest?.lidarAvailable || now - latest.capturedAtMs > 1200) {
      mute(s); sayLocal(s,'lost'); s.phase='lock'; s.observation=null; return;
    }
    if (s.pendingSpeech && NativeFindPolicy.fresh(o,now)) {
      if (sayModel(s,s.pendingSpeech)) s.pendingSpeech='';
      return;
    }
    if (!NativeFindPolicy.fresh(o, now)) {
      if (o?.valid) { mute(s); sayLocal(s,'lost'); s.observation=null; }
      if (!s.inFlight) recognize(s, s.handEntered ? 'hand' : 'lock');
      return;
    }
    if (s.phase === 'lock') { recognize(s, s.handEntered ? 'hand' : 'lock'); return; }
    if (!s.handEntered && o.meters < 1.10 && !s.inFlight && now >= s.retryAt) {
      recognize(s,'hand'); // Prefetch the near-phase semantic handover.
    }
    if (s.phase === 'near_wait') { sayLocal(s,'stop'); return; }
    const code = NativeFindPolicy.direction(o,s.handEntered,s.canApproach,s.lastCode);
    sayLocal(s, code);
    if (s.handEntered && (code === 'hold' || code === 'hand_missing' || !s.handSeenByModel)) recognize(s,'hand');
    // Identity check is bounded, not per frame. Geometry remains local throughout.
    if (now - s.lastModelAt > 20000) { mute(s); s.phase='lock'; recognize(s,s.handEntered?'hand':'lock'); }
  }
  function begin(reminder) {
    stop();
    const s = {reminder, target:reminder.findTarget, task:reminder.findTaskSeq||0,
      token:`nf_${Date.now()}_${++counter}`, phase:'lock', seedFrame:0, observation:null,
      inFlight:false, lastModelFrame:0, lastModelAt:0, retryAt:Date.now()+400,
      lastCode:'', lastSaid:0, modelSpeechUntil:0, contactCount:0, pendingSpeech:''};
    current = s; post({type:'begin',token:s.token});
    timer = setInterval(() => tick(s),100);
    log('started',{target:s.target,token:s.token});
  }
  document.addEventListener('click', event => {
    const id = event.target?.closest?.('button')?.id || '';
    if (!id.startsWith('start-')) return;
    selected = id === (window.__ACCESSIBLE_VISION_BACKEND__ === 'aliyun'
      ? 'start-aliyun-unified-visual-assistant' : 'start-unified-visual-assistant');
    stop();
  }, true);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  window.addEventListener('pagehide', stop);
  const previousHooks = window.__accessibleVisionEnableRuntimeHooks;
  window.__accessibleVisionEnableRuntimeHooks = () => {
    previousHooks?.();
    if (window.__nativeFindHooks || typeof runGeminiFindObjectTick !== 'function') return;
    window.__nativeFindHooks = true;
    fetch('/api/native-find-config').then(r=>r.json()).then(c=>{enabled=c.enabled===true && c.version===1;}).catch(()=>{});
    const originalTick = runGeminiFindObjectTick;
    runGeminiFindObjectTick = function(reminder) {
      if (!selected || !enabled || !latest?.lidarAvailable) {
        stop(); return originalTick.apply(this,arguments);
      }
      if (!reminder?.findTarget) { stop(); return; }
      if (!current || !alive(current)) begin(reminder);
      tick(current);
    };
    const originalClear = clearGeminiFindObjectMemory;
    clearGeminiFindObjectMemory = function() { stop(); return originalClear.apply(this,arguments); };
    const originalSend = sendGeminiLiveEvent;
    sendGeminiLiveEvent = function(event) {
      if (current && event?.type === 'say') mute(current);
      return originalSend.apply(this,arguments);
    };
  };
})();
