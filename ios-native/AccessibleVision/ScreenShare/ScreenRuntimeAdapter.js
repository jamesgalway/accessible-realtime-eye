/* Appended to unchanged production task code, only in the screen JSContext. */
(function () {
  'use strict';
  const host = __screenHostCall;
  const screenSessionID = globalThis.__screenStartupID || crypto.randomUUID();
  globalThis.__screenNetworkEvent = details => logClientEvent('screen_share.connection', {
    screenSessionID, backend: __screenBackend, ...details
  });
  setInterval(() => {
    if (appState.realtime || appState.geminiReminder) {
      logClientEvent('screen_share.native_media', { screenSessionID, backend: __screenBackend, ...host('diagnostics') });
    }
  }, 10000);
  const disconnectable = () => ({ disconnect() {} });
  // Capture and playback use native devices; the existing 16 kHz input handlers,
  // 3200-byte packetizer, PcmPlayer, contracts and delivery callbacks remain intact.
  startManualAudioCapture = async realtime => { realtime.audioProcessor = disconnectable(); };
  startGeminiAudioCapture = async reminder => { reminder.audioProcessor = disconnectable(); };
  reportCameraSettings = stream => {
    appState.cameraInfo = { source: 'replaykit_screen', ...host('frameSize') };
    logClientEvent('screen_share.media_ready', appState.cameraInfo);
  };
  resolvePlatformContinuousNarrationDepthRequested = () => false;
  captureReminderFrame = options => host('capture', { width: options?.maxWidth || 320, quality: options?.quality || 0.45 });
  // Screen sharing has no physical find/approach capability. This is an entry
  // capability boundary, not a second semantic classifier or task implementation.
  const startMode = startGeminiReminderMode;
  startGeminiReminderMode = async options => {
    if (options?.taskSourceMode === 'find_object') { setActiveReminderStatus('屏幕共享当前提供问答、主动提醒和持续播报。'); return; }
    return startMode(options);
  };
  const validateMode = validateGeminiUnifiedModeCommand;
  validateGeminiUnifiedModeCommand = args => args?.action === 'propose_find_object'
    ? { ok: false, error: '屏幕共享当前未开放找东西。' } : validateMode(args);
  const activateMode = activateGeminiUnifiedExecutionMode;
  activateGeminiUnifiedExecutionMode = (reminder, mode, pending) => mode === 'find_object'
    ? false : activateMode(reminder, mode, pending);
  activateAliUnifiedFindObject = () => { setActiveReminderStatus('屏幕共享当前未开放找东西。'); return false; };
  globalThis.__screenInput = base64 => {
    const audioTrack = appState.stream?.getAudioTracks?.()[0];
    if (!audioTrack || !audioTrack.enabled || audioTrack.readyState !== 'live') return;
    const pcm = base64ToInt16(base64), samples = new Float32Array(pcm.length);
    for (let i = 0; i < samples.length; i++) samples[i] = pcm[i] / 32768;
    if (appState.realtime?.audioProcessor) handleManualAudioFrame(samples, 16000);
    else if (appState.geminiReminder?.audioProcessor) handleGeminiAudioFrame(samples, 16000);
  };
  globalThis.__screenCommand = async (command, text = '') => {
    try {
      if (command === 'start') {
        await checkHealth();
        if (__screenBackend === 'aliyun') await startAliyunCheapUnifiedVisualAssistant();
        else if (globalThis.__screenGoogleRoute === 'relay') await startUnifiedVisualAssistant();
        else await startBrowserDirectUnifiedAssistant();
      } else if (command === 'stopTask') handleRealtimeStopButton();
      else if (command === 'stop') stopRealtime();
    } catch (error) { host('status', { error: String(error?.message || error) }); }
  };
  globalThis.__screenSnapshot = () => ({
    status: elements.activeReminderStatus?.textContent || elements.realtimeConfigStatus?.textContent || '',
    transcript: String(elements.visionOutput?.textContent || '').slice(-10000),
    connected: !!(appState.realtime?.isReady || appState.geminiReminder?.isReady),
    stopLabel: elements.stopRealtime?.textContent || '停止当前任务'
  });
})();
