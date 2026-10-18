'use strict';

const AUDIO_INPUT_RATE = 16000;
const AUDIO_OUTPUT_RATE = 24000;
const pendingIOSAudioContextClosures = [];
const AUDIO_SEND_BYTES = 3200;
const VIDEO_FRAME_INTERVAL_MS = 1000;
const VIDEO_TRACK_DRAW_INTERVAL_MS = 1000;
const SILENT_VIDEO_CHECK_MS = 10000;
const ACTIVE_REMINDER_INTERVAL_MS = 1000;
const RTC_ACTIVE_REMINDER_INTERVAL_MS = 500;
const SPEED_ACTIVE_REMINDER_INTERVAL_MS = 500;
const GEMINI_ACTIVE_REMINDER_INTERVAL_MS = 1000;
const ALI_FIND_OBJECT_SCHEDULER_INTERVAL_MS = 500;
const ACTIVE_REMINDER_FAST_FRAME_OPTIONS = { maxWidth: 384, quality: 0.50 };
const FIND_OBJECT_FRAME_OPTIONS = { maxWidth: 512, quality: 0.55 };
const ACTIVE_REMINDER_ALERT_COOLDOWN_MS = 10000;
const SPEED_ACTIVE_REMINDER_ALERT_COOLDOWN_MS = 3000;
const GEMINI_ACTIVE_REMINDER_ALERT_COOLDOWN_MS = 3000;
const GEMINI_BROWSER_SDK_URL = 'https://aistudiocdn.com/@google/genai@^1.27.0';
const GEMINI_REMINDER_CONTRACT_TOOL_NAME = 'set_active_reminder_contract';
const GEMINI_FIND_OBJECT_TOOL_NAME = 'set_find_object_target';
const GEMINI_LIVE_FIND_RESULT_TOOL_NAME = 'submit_find_object_frame_result';
const GEMINI_LIVE_FIND_COMPARISON_TOOL_NAME = 'submit_find_object_comparison_result';
const GEMINI_DIRECT_FIND_CONNECT_TIMEOUT_MS = 10000;
const GEMINI_DIRECT_FIND_REQUEST_TIMEOUT_MS = 10000;
const GEMINI_CONTINUOUS_NARRATION_TOOL_NAME = 'set_continuous_narration_focus';
const GEMINI_UNIFIED_MODE_TOOL_NAME = 'select_visual_assistance_mode';
const GEMINI_FIND_GUIDANCE_REPEAT_MS = 650;
const FIND_OBJECT_MAX_IN_FLIGHT = 1;
const GREEN_FIND_OBJECT_MAX_IN_FLIGHT = 2;
const GREEN_FIND_OBJECT_HEDGE_MS = 2000;
const CONTINUOUS_NARRATION_INTERVAL_MS = 8000;
const CONTINUOUS_NARRATION_MIN_INTERVAL_MS = 1000;
const CONTINUOUS_NARRATION_MAX_INTERVAL_MS = 300000;
const CONTINUOUS_NARRATION_TICK_MS = 1000;
const CONTINUOUS_NARRATION_DEPTH_TIMEOUT_MS = 4500;
const CONTINUOUS_NARRATION_USER_SPEECH_HOLD_MS = 2000;
const FIND_APPROACH_GUIDANCE_REPEAT_MS = 1800;
const FIND_APPROACH_CONFIRM_FRAMES = 1;
const FIND_APPROACH_MIN_CONFIDENCE = 0.75;
const FIND_TARGET_LOCK_FRAMES = 1;
const GREEN_FIND_TARGET_LOCK_FRAMES = 1;
const FIND_TARGET_REACQUIRE_FRAMES = 2;
const FIND_TOUCH_CONFIRM_TIMEOUT_MS = 10000;
const RTC_ACTIVE_REMINDER_USER_SPEECH_PAUSE_MS = 10000;
const RTC_ACTIVE_REMINDER_LOCAL_ALERT_PAUSE_MS = 12000;
const SPEED_ACTIVE_REMINDER_LOCAL_ALERT_PAUSE_MS = 2500;
const ACTIVE_REMINDER_POST_SPEECH_SUPPRESS_MS = 4500;
const ACTIVE_REMINDER_AUDIO_SLICE_MS = 5000;
const ASSISTANT_PLAYBACK_TAIL_MS = 350;
const GEMINI_ASSISTANT_PLAYBACK_TAIL_MS = 900;
const ASSISTANT_PLAYBACK_MIN_GUARD_MS = 900;
const REALTIME_RESPONSE_SETTLE_MS = 650;
const MANUAL_COMMIT_MIN_GAP_MS = 900;
const MANUAL_TRANSCRIPT_WAIT_TIMEOUT_MS = 5000;
const RTC_ACTIVE_REMINDER_POLL_MIN_GAP_MS = 1300;
const MANUAL_LOCAL_VAD_START_RMS = 0.04;
const MANUAL_LOCAL_VAD_END_RMS = 0.02;
const GEMINI_PLAYBACK_SPEECH_THRESHOLD = 0.05;
const MANUAL_LOCAL_VAD_INTERRUPT_START_RMS = 0.12;
const MANUAL_LOCAL_VAD_INTERRUPT_FRAMES = 4;
const MANUAL_LOCAL_VAD_END_MS = 700;
const MANUAL_LOCAL_VAD_MIN_AUDIO_MS = 650;
const RTC_MANUAL_LOCAL_VAD_START_RMS = 0.028;
const RTC_MANUAL_LOCAL_VAD_END_RMS = 0.014;
const RTC_MANUAL_LOCAL_VAD_INTERRUPT_START_RMS = 0.09;
const RTC_MANUAL_LOCAL_VAD_INTERRUPT_FRAMES = 3;
const RTC_MANUAL_LOCAL_VAD_END_MS = 420;
const RTC_MANUAL_LOCAL_VAD_MIN_AUDIO_MS = 420;
const DEFAULT_VAD_PROFILE = {
  type: 'semantic_vad',
  threshold: 0.65,
  silence_duration_ms: 900,
  create_response: true
};
const ASSISTANT_PLAYBACK_VAD_PROFILE = {
  type: 'semantic_vad',
  threshold: 0.92,
  silence_duration_ms: 1300,
  create_response: true
};
const CLIENT_API_KEY_STORAGE = 'accessibleNav.dashscopeKey';
const CLIENT_WEBRTC_ENDPOINT_STORAGE = 'accessibleNav.webrtcEndpoint';
const FOLLOW_ROUTE_MATCH_METERS = 45;
const FOLLOW_START_CALIBRATION_MS = 30000;
const FOLLOW_START_CALIBRATION_METERS = 120;
const FOLLOW_OFF_ROUTE_LIMIT = 3;

const appState = {
  origin: null,
  destination: null,
  route: null,
  stream: null,
  realtime: null,
  realtimeConfig: null,
  lastVisionText: '',
  pendingAudio: [],
  pendingAudioBytes: 0,
  sentFirstAudio: false,
  latestAssistantText: '',
  latestUserTranscript: '',
  realtimeDebugLog: [],
  cameraInfo: null,
  videoFrameCount: 0,
  assistantMicMuteTimer: null,
  assistantVadRestoreTimer: null,
  realtimeStarting: false,
  activeReminder: null,
  geminiReminder: null,
  navigationFollow: null
};

const elements = {
  health: document.querySelector('#health'),
  city: document.querySelector('#city'),
  origin: document.querySelector('#origin'),
  destination: document.querySelector('#destination'),
  mode: document.querySelector('#mode'),
  poiStatus: document.querySelector('#poi-status'),
  poiResults: document.querySelector('#poi-results'),
  manualRoute: document.querySelector('#manual-route'),
  routeOutput: document.querySelector('#route-output'),
  followOutput: document.querySelector('#follow-output'),
  visionOutput: document.querySelector('#vision-output'),
  camera: document.querySelector('#camera'),
  videoFrame: document.querySelector('#video-frame'),
  remoteAudio: document.querySelector('#remote-audio'),
  realtimeMode: document.querySelector('#realtime-mode'),
  realtimeConfigStatus: document.querySelector('#realtime-config-status'),
  activeReminderStatus: document.querySelector('#active-reminder-status'),
  advancedRealtimeConfig: document.querySelector('#advanced-realtime-config'),
  clientApiKey: document.querySelector('#client-api-key'),
  clientWebRtcEndpoint: document.querySelector('#client-webrtc-endpoint'),
  visionQuestion: document.querySelector('#vision-question'),
  strongEchoGuard: document.querySelector('#strong-echo-guard'),
  startUnifiedVisualAssistant: document.querySelector('#start-unified-visual-assistant'),
  startBrowserDirectUnifiedAssistant: document.querySelector('#start-browser-direct-unified-assistant'),
  startAliyunUnifiedVisualAssistant: document.querySelector('#start-aliyun-unified-visual-assistant'),
  startAliyunCheapUnifiedVisualAssistant: document.querySelector('#start-aliyun-cheap-unified-visual-assistant'),
  startRtcActiveReminder: document.querySelector('#start-rtc-active-reminder'),
  startSpeedActiveReminder: document.querySelector('#start-speed-active-reminder'),
  startGeminiActiveReminder: document.querySelector('#start-gemini-active-reminder'),
  startGeminiObservationActiveReminder: document.querySelector('#start-gemini-observation-active-reminder'),
  startGeminiContractActiveReminder: document.querySelector('#start-gemini-contract-active-reminder'),
  startGeminiLiteContractActiveReminder: document.querySelector('#start-gemini-lite-contract-active-reminder'),
  startGeminiFindObject: document.querySelector('#start-gemini-find-object'),
  startGeminiContinuousNarration: document.querySelector('#start-gemini-continuous-narration'),
  stopRealtime: document.querySelector('#stop-realtime'),
  checkSilentVideo: document.querySelector('#check-silent-video'),
  commitSilentContext: document.querySelector('#commit-silent-context'),
  commitAndRespond: document.querySelector('#commit-and-respond'),
  copyRealtimeLog: document.querySelector('#copy-realtime-log'),
  startFollow: document.querySelector('#start-follow'),
  stopFollow: document.querySelector('#stop-follow')
};

const mainContent = document.querySelector('#main');
const realtimePanel = document.querySelector('.camera-panel');
if (mainContent && realtimePanel) {
  mainContent.prepend(realtimePanel);
}

document.querySelector('#use-location').addEventListener('click', useCurrentLocation);
document.querySelector('#search-origin').addEventListener('click', () => searchPoi('origin'));
document.querySelector('#search-destination').addEventListener('click', () => searchPoi('destination'));
document.querySelector('#plan-route').addEventListener('click', planRoute);
document.querySelector('#load-manual-route').addEventListener('click', loadManualRoute);
document.querySelector('#speak-route').addEventListener('click', () => speak(elements.routeOutput.textContent));
document.querySelector('#start-follow').addEventListener('click', startNavigationFollow);
document.querySelector('#stop-follow').addEventListener('click', stopNavigationFollow);
document.querySelector('#start-realtime').addEventListener('click', startRealtime);
elements.startUnifiedVisualAssistant?.addEventListener('click', startUnifiedVisualAssistant);
elements.startBrowserDirectUnifiedAssistant?.addEventListener('click', startBrowserDirectUnifiedAssistant);
elements.startAliyunUnifiedVisualAssistant?.addEventListener('click', startAliyunUnifiedVisualAssistant);
elements.startAliyunCheapUnifiedVisualAssistant?.addEventListener('click', startAliyunCheapUnifiedVisualAssistant);
elements.startRtcActiveReminder?.addEventListener('click', startRtcActiveReminder);
elements.startSpeedActiveReminder?.addEventListener('click', startSpeedActiveReminder);
elements.startGeminiActiveReminder?.addEventListener('click', startGeminiActiveReminder);
elements.startGeminiObservationActiveReminder?.addEventListener('click', startGeminiObservationActiveReminder);
elements.startGeminiContractActiveReminder?.addEventListener('click', startGeminiContractActiveReminder);
elements.startGeminiLiteContractActiveReminder?.addEventListener('click', startGeminiLiteContractActiveReminder);
elements.startGeminiFindObject?.addEventListener('click', startGeminiFindObject);
elements.startGeminiContinuousNarration?.addEventListener('click', startGeminiContinuousNarration);
document.querySelector('#send-context').addEventListener('click', sendRealtimeContext);
elements.stopRealtime?.addEventListener('click', handleRealtimeStopButton);
document.querySelector('#speak-vision').addEventListener('click', () => speak(appState.lastVisionText || elements.visionOutput.textContent));
document.querySelector('#save-client-key').addEventListener('click', saveClientApiKey);
document.querySelector('#clear-client-key').addEventListener('click', clearClientApiKey);
document.querySelector('#copy-realtime-log').addEventListener('click', copyRealtimeDebugLog);
document.querySelector('#check-silent-video').addEventListener('click', checkSilentVideoPush);
document.querySelector('#commit-silent-context').addEventListener('click', () => commitRealtimeManualBuffer({ requestResponse: false }));
document.querySelector('#commit-and-respond').addEventListener('click', () => commitRealtimeManualBuffer({ requestResponse: true }));

initializeClientApiKey();
checkHealth();

async function checkHealth() {
  try {
    const data = await apiGet('/api/health');
    appState.appVariant = data.appVariant || 'aliyun';
    appState.realtimeConfig = {
      model: data.realtimeModel,
      voice: data.realtimeVoice,
      webSocketConfigured: data.realtimeWebSocketConfigured,
      webRtcConfigured: data.realtimeWebRtcConfigured,
      serverApiKeyConfigured: data.bailianConfigured,
      clientApiKeySupported: data.clientApiKeySupported
    };
    const greencloudGemini = appState.appVariant === 'greencloud-gemini';
    appState.geminiLiveFindExperiment = Boolean(data.geminiLiveFindExperiment);
    appState.geminiBrowserDirectScreenExperiment = Boolean(data.geminiBrowserDirectScreenExperiment);
    applyAppVariant(appState.appVariant);
    if (greencloudGemini) {
      elements.realtimeConfigStatus.textContent = data.geminiConfigured
        ? ''
        : 'Gemini API Key 未配置，主动提醒暂时不可用。';
      elements.realtimeConfigStatus.hidden = Boolean(data.geminiConfigured);
    } else {
      selectRecommendedRealtimeMode(appState.realtimeConfig);
      updateRealtimeConfigStatus(appState.realtimeConfig);
    }
    elements.health.textContent = '';
    elements.health.hidden = true;
  } catch (error) {
    elements.health.textContent = `后端状态检查失败：${error.message}`;
    elements.health.hidden = false;
    updateRealtimeConfigStatus(null);
  }
}

async function useCurrentLocation() {
  if (!navigator.geolocation) {
    setPoiStatus('这个浏览器不支持定位。');
    return;
  }

  setPoiStatus('正在获取当前位置，请在手机上允许定位。');
  navigator.geolocation.getCurrentPosition((position) => {
    const coordinate = `${position.coords.longitude.toFixed(6)},${position.coords.latitude.toFixed(6)}`;
    appState.origin = {
      name: '浏览器当前位置',
      location: coordinate,
      note: '浏览器定位坐标可能需要和高德坐标校准，第一版只适合粗测。'
    };
    elements.origin.value = `浏览器当前位置：${coordinate}`;
    setPoiStatus(`已设置起点为浏览器当前位置：${coordinate}。精确路侧测试前需要校准坐标。`);
  }, (error) => {
    setPoiStatus(`定位失败：${error.message}`);
  }, {
    enableHighAccuracy: true,
    timeout: 12000,
    maximumAge: 0
  });
}

async function searchPoi(kind) {
  const input = kind === 'origin' ? elements.origin : elements.destination;
  const keyword = input.value.trim();
  const city = elements.city.value.trim() || '上海';

  if (!keyword) {
    setPoiStatus(kind === 'origin' ? '请先输入起点。' : '请先输入终点。');
    return;
  }

  const coordinate = extractCoordinate(keyword);
  if (coordinate) {
    setSelectedPoi(kind, {
      name: kind === 'origin' ? '手动输入起点坐标' : '手动输入终点坐标',
      address: '',
      location: coordinate
    });
    setPoiStatus(`已直接使用坐标：${coordinate}`);
    return;
  }

  setPoiStatus(`正在用高德搜索${kind === 'origin' ? '起点' : '终点'}：${keyword}`);
  try {
    const data = await apiGet(`/api/poi?keyword=${encodeURIComponent(keyword)}&city=${encodeURIComponent(city)}`);
    renderPoiResults(kind, data.pois || []);
  } catch (error) {
    setPoiStatus(`搜索失败：${error.message}`);
  }
}

function renderPoiResults(kind, pois) {
  elements.poiResults.replaceChildren();

  if (pois.length === 0) {
    setPoiStatus('没有搜索到地点。请换一个更完整的名字或地址。');
    return;
  }

  const title = document.createElement('h3');
  title.id = 'poi-results-title';
  title.textContent = `搜索到 ${pois.length} 个地点。请选择一个作为${kind === 'origin' ? '起点' : '终点'}`;
  elements.poiResults.append(title);

  const list = document.createElement('div');
  list.setAttribute('role', 'list');
  list.className = 'result-list';
  elements.poiResults.append(list);

  let firstButton = null;
  pois.forEach((poi, index) => {
    const item = document.createElement('article');
    item.className = 'result-item';
    item.setAttribute('role', 'listitem');

    const text = document.createElement('p');
    const address = poi.address || poi.adname || '地址未返回';
    const entrance = poi.entrLocation ? `，入口坐标 ${poi.entrLocation}` : '';
    text.id = `poi-result-${kind}-${index + 1}`;
    text.textContent = `第 ${index + 1} 条，${poi.name}，${address}，坐标 ${poi.location}${entrance}`;

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `选择第 ${index + 1} 条作为${kind === 'origin' ? '起点' : '终点'}：${poi.name}`;
    button.setAttribute('aria-describedby', text.id);
    button.addEventListener('click', () => setSelectedPoi(kind, poi));
    if (!firstButton) {
      firstButton = button;
    }

    item.append(text, button);
    list.append(item);
  });

  setPoiStatus(`搜索到 ${pois.length} 个地点，结果已经显示在搜索按钮下方。旁白焦点会移动到第一条结果。`);
  window.setTimeout(() => firstButton?.focus(), 80);
}

function setSelectedPoi(kind, poi) {
  if (kind === 'origin') {
    appState.origin = poi;
    elements.origin.value = `${poi.name}：${routeCoordinateForPoi(poi)}`;
  } else {
    appState.destination = poi;
    elements.destination.value = `${poi.name}：${routeCoordinateForPoi(poi)}`;
  }
  const coordinate = routeCoordinateForPoi(poi);
  const coordinateNote = poi.entrLocation && poi.entrLocation !== poi.location
    ? `已优先使用入口坐标 ${poi.entrLocation}，不是 POI 中心点 ${poi.location}`
    : `坐标 ${coordinate}`;
  setPoiStatus(`已设置${kind === 'origin' ? '起点' : '终点'}：${poi.name}，${coordinateNote}`);
  window.setTimeout(() => {
    if (kind === 'origin') {
      elements.destination.focus();
    } else {
      document.querySelector('#plan-route')?.focus();
    }
  }, 80);
}

async function planRoute() {
  const city = elements.city.value.trim() || '上海';
  const origin = routeCoordinateForPoi(appState.origin) || extractCoordinate(elements.origin.value);
  const destination = routeCoordinateForPoi(appState.destination) || extractCoordinate(elements.destination.value);

  if (!origin || !destination) {
    elements.routeOutput.textContent = '请先搜索并选择起点、终点，或者直接输入高德坐标。';
    speak('请先搜索并选择起点、终点，或者直接输入高德坐标。');
    return;
  }

  elements.routeOutput.textContent = '正在调用高德规划路线。';
  try {
    const routeRequest = {
      origin,
      destination,
      city,
      destinationCity: city,
      mode: elements.mode.value,
      originPoi: appState.origin,
      destinationPoi: appState.destination
    };
    const data = appState.appVariant === 'greencloud-gemini'
      ? await planRouteViaJob(routeRequest)
      : await apiPost('/api/route', routeRequest);

    appState.route = {
      provider: data.provider,
      mode: data.mode,
      originPoi: appState.origin,
      destinationPoi: appState.destination,
      request: data.request,
      facts: data.facts,
      structuredRoute: data.structuredRoute,
      summaryText: data.summaryText,
      accessibleScript: data.accessibleScript
    };

    const text = data.accessibleScript || data.summaryText || '暂时没有生成可执行路线。';

    elements.routeOutput.textContent = text;
    speak(firstSpeechParagraph(text));
    sendRealtimeContext({ quiet: true });
  } catch (error) {
    elements.routeOutput.textContent = `路线规划失败：${error.message}`;
    speak(`路线规划失败：${error.message}`);
  }
}

async function planRouteViaJob(routeRequest) {
  const started = await apiPost('/api/route-job', routeRequest);
  if (!started.jobId) {
    throw new Error('服务器没有返回路线任务编号。');
  }
  const startedAt = Date.now();
  const timeoutMs = 5 * 60 * 1000;
  let lastStatusSecond = -1;
  while (Date.now() - startedAt < timeoutMs) {
    await delay(1500);
    const job = await apiGet(`/api/route-job?id=${encodeURIComponent(started.jobId)}`);
    if (job.status === 'complete' && job.result) {
      return job.result;
    }
    const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
    if (elapsedSeconds !== lastStatusSecond && elapsedSeconds % 10 === 0) {
      lastStatusSecond = elapsedSeconds;
      elements.routeOutput.textContent = `正在规划路线，已等待 ${elapsedSeconds} 秒。长路线会在后台继续计算，请不要重复提交。`;
    }
  }
  throw new Error('路线规划超过 5 分钟，请稍后重试。');
}

function routeCoordinateForPoi(poi) {
  if (!poi) {
    return '';
  }
  return poi.entrLocation || poi.location || '';
}

function loadManualRoute() {
  const text = elements.manualRoute.value.trim();
  if (!text) {
    elements.routeOutput.textContent = '请先粘贴一段路线事实。';
    speak('请先粘贴一段路线事实。');
    return;
  }

  appState.route = {
    provider: 'manual-or-mcp',
    mode: 'manual',
    originPoi: appState.origin,
    destinationPoi: appState.destination,
    summaryText: text,
    facts: {
      provider: 'manual-or-mcp',
      generatedAt: new Date().toISOString(),
      sourceNote: '这段路线不是网页后端直接调用高德 Web Key 生成，而是由 Codex 通过高德 MCP、其它地图工具或人工核对后导入。',
      navigationRules: {
        doNotGuess: true,
        keepPoiPointAndRoadTouchPointSeparate: true,
        keepStopNameAndCurbsideStopPointSeparate: true,
        ifMapAndCameraConflictSayConflict: true,
        doNotGiveUnverifiedCrossingInstruction: true
      },
      manualRouteText: text
    }
  };

  const output = [
    '已载入无 Key 测试路线。',
    '',
    text,
    '',
    '规则提醒：实时慧眼会带着这段路线事实回答；如果画面和路线冲突，必须说不确定。'
  ].join('\n');
  elements.routeOutput.textContent = output;
  speak(firstSpeechParagraph(output));
  sendRealtimeContext({ quiet: true });
}

function startNavigationFollow() {
  const structuredRoute = appState.route?.structuredRoute;
  const followSteps = Array.isArray(structuredRoute?.followSteps) ? structuredRoute.followSteps : [];
  if (!followSteps.length) {
    updateFollowOutput('还没有可跟随的结构化无障碍路线。请先生成路线。');
    speak('请先生成路线，再开始 GPS 跟随播报。');
    return;
  }
  if (!navigator.geolocation) {
    updateFollowOutput('这个浏览器不支持 GPS 定位。');
    speak('这个浏览器不支持定位。');
    return;
  }
  if (!window.isSecureContext && location.hostname !== '127.0.0.1' && location.hostname !== 'localhost') {
    updateFollowOutput('浏览器定位需要 HTTPS。请用 HTTPS 页面打开这个原型。');
    speak('浏览器定位需要 HTTPS。');
    return;
  }
  if (appState.navigationFollow?.watchId !== undefined && appState.navigationFollow?.watchId !== null) {
    updateFollowOutput('GPS 跟随已经在运行。');
    return;
  }

  appState.navigationFollow = {
    watchId: null,
    route: structuredRoute,
    startedAt: Date.now(),
    currentStepId: '',
    announcedStepIds: new Set(),
    announcedTurnThresholds: new Set(),
    offRouteCount: 0,
    lastOffRouteSpeechAt: 0
  };
  logClientEvent('navigation.follow_started', {
    followStepCount: followSteps.length,
    routeSummary: structuredRoute.summary || '',
    routeName: structuredRoute.name || ''
  });

  const watchId = navigator.geolocation.watchPosition(
    handleFollowPosition,
    handleFollowError,
    {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 15000
    }
  );
  appState.navigationFollow.watchId = watchId;
  updateFollowOutput('GPS 跟随已启动。请在手机上允许定位。第一版只支持前台网页，锁屏或切后台可能停止。');
  speak('GPS 跟随已启动。请允许定位。');
  sendRealtimeContext({ quiet: true, reason: 'navigation follow started' });
}

function stopNavigationFollow() {
  const follow = appState.navigationFollow;
  if (follow?.watchId !== undefined && follow?.watchId !== null) {
    navigator.geolocation.clearWatch(follow.watchId);
  }
  appState.navigationFollow = null;
  updateFollowOutput('GPS 跟随已停止。');
  logClientEvent('navigation.follow_stopped', {
    currentStepId: follow?.currentStepId || '',
    offRouteCount: follow?.offRouteCount || 0
  });
  sendRealtimeContext({ quiet: true, reason: 'navigation follow stopped' });
}

function applyAppVariant(variant) {
  if (window.ZzyaiClientAccess?.profile === 'web' && elements.startBrowserDirectUnifiedAssistant) {
    elements.startBrowserDirectUnifiedAssistant.textContent = '实时慧眼（谷歌筛图）';
  }
  const greencloudGemini = variant === 'greencloud-gemini';
  document.querySelector('#start-realtime')?.setAttribute('hidden', '');
  elements.startSpeedActiveReminder?.setAttribute('hidden', '');
  elements.advancedRealtimeConfig?.toggleAttribute('hidden', greencloudGemini || window.ZzyaiClientAccess?.profile === 'web');
  elements.startGeminiActiveReminder?.setAttribute('hidden', '');
  elements.startGeminiObservationActiveReminder?.setAttribute('hidden', '');
  elements.startGeminiContractActiveReminder?.setAttribute('hidden', '');
  elements.startGeminiLiteContractActiveReminder?.setAttribute('hidden', '');
  elements.startGeminiFindObject?.setAttribute('hidden', '');
  elements.startGeminiContinuousNarration?.setAttribute('hidden', '');
  elements.startBrowserDirectUnifiedAssistant?.toggleAttribute(
    'hidden',
    !(greencloudGemini && appState.geminiBrowserDirectScreenExperiment)
  );
  elements.startAliyunUnifiedVisualAssistant?.toggleAttribute('hidden', greencloudGemini || window.ZzyaiClientAccess?.profile === 'web');
  elements.startAliyunCheapUnifiedVisualAssistant?.toggleAttribute('hidden', greencloudGemini);
  if (elements.startUnifiedVisualAssistant) {
    elements.startUnifiedVisualAssistant.textContent = greencloudGemini
      ? '实时慧眼'
      : '实时慧眼（Google声音）';
  }
  if (elements.startGeminiFindObject) {
    elements.startGeminiFindObject.textContent = greencloudGemini
      ? 'Gemini 找东西实验'
      : '阿里快筛找东西实验';
  }
}

function handleFollowError(error) {
  const message = error?.message || '定位失败。';
  updateFollowOutput(`GPS 跟随定位失败：${message}`);
  logClientEvent('navigation.follow_error', {
    code: error?.code || '',
    message
  });
  speak(`定位失败：${message}`);
}

function handleFollowPosition(position) {
  const follow = appState.navigationFollow;
  const steps = follow?.route?.followSteps || [];
  if (!follow || !steps.length) {
    return;
  }

  const rawLocation = `${position.coords.longitude},${position.coords.latitude}`;
  const accuracy = Number(position.coords.accuracy || 0);
  const match = matchLocationToFollowStepsWithCoordinateFallback(rawLocation, steps);
  if (!match) {
    updateFollowOutput(`当前位置：${rawLocation}。暂时无法匹配到路线。定位精度约 ${formatFollowMeters(accuracy)}。`);
    logClientEvent('navigation.follow_position_unmatched', {
      rawLocation,
      accuracy
    });
    return;
  }

  const threshold = Math.max(FOLLOW_ROUTE_MATCH_METERS, accuracy + 25);
  const now = Date.now();
  const isStartCalibration = now - (follow.startedAt || now) <= FOLLOW_START_CALIBRATION_MS;
  if (isStartCalibration && match.distanceMeters > threshold && match.distanceMeters <= FOLLOW_START_CALIBRATION_METERS) {
    follow.offRouteCount = 0;
    updateFollowOutput([
      `GPS 起点校准中：当前位置离规划路线约 ${formatFollowMeters(match.distanceMeters)}，定位精度约 ${formatFollowMeters(accuracy)}。`,
      `当前先不判定偏航。匹配来源：${match.coordinateSource}。`,
      `最近路线步骤：第 ${match.stepIndex + 1} 步，${match.step.roadName || match.step.targetRoadName || match.step.kind}。`
    ].join('\n'));
    logClientEvent('navigation.follow_start_calibrating', {
      rawLocation,
      matchedLocation: match.location,
      coordinateSource: match.coordinateSource,
      accuracy,
      distanceMeters: Math.round(match.distanceMeters),
      stepIndex: match.stepIndex,
      stepId: match.step.id || ''
    });
    return;
  }
  if (match.distanceMeters > threshold) {
    follow.offRouteCount += 1;
    const text = `当前位置离规划路线约 ${formatFollowMeters(match.distanceMeters)}，定位精度约 ${formatFollowMeters(accuracy)}。可能偏离路线，请先停下确认。`;
    updateFollowOutput(text);
    logClientEvent('navigation.follow_off_route', {
      rawLocation,
      matchedLocation: match.location,
      coordinateSource: match.coordinateSource,
      accuracy,
      distanceMeters: Math.round(match.distanceMeters),
      threshold: Math.round(threshold),
      offRouteCount: follow.offRouteCount,
      stepIndex: match.stepIndex,
      stepId: match.step.id || ''
    });
    if (follow.offRouteCount >= FOLLOW_OFF_ROUTE_LIMIT && now - follow.lastOffRouteSpeechAt > 20000) {
      follow.lastOffRouteSpeechAt = now;
      speak('可能偏离路线，请先停下确认。');
    }
    return;
  }

  follow.offRouteCount = 0;
  const currentStep = match.step;
  logClientEvent('navigation.follow_position_matched', {
    rawLocation,
    matchedLocation: match.location,
    coordinateSource: match.coordinateSource,
    accuracy,
    distanceMeters: Math.round(match.distanceMeters),
    stepIndex: match.stepIndex,
    stepId: currentStep.id || '',
    roadName: currentStep.roadName || '',
    targetRoadName: currentStep.targetRoadName || ''
  });
  if (currentStep.id !== follow.currentStepId) {
    follow.currentStepId = currentStep.id;
    if (currentStep.announce?.onEnter && currentStep.spokenText && !follow.announcedStepIds.has(currentStep.id)) {
      follow.announcedStepIds.add(currentStep.id);
      speak(currentStep.spokenText);
    }
  }

  const nextTurn = findNextTurnStep(steps, match.stepIndex);
  const turnDistance = nextTurn?.turnPoint ? distanceBetweenCoordinates(match.location, nextTurn.turnPoint) : Infinity;
  maybeAnnounceTurn(follow, nextTurn, turnDistance);

  const nextText = nextTurn?.spokenText && Number.isFinite(turnDistance)
    ? `下一转弯约 ${formatFollowMeters(turnDistance)}：${nextTurn.spokenText}`
    : '暂时没有下一转弯提醒。';
  updateFollowOutput([
    `当前匹配：第 ${match.stepIndex + 1} 步，${currentStep.roadName || currentStep.targetRoadName || currentStep.kind}。`,
    `离路线约 ${formatFollowMeters(match.distanceMeters)}，定位精度约 ${formatFollowMeters(accuracy)}。`,
    `当前播报句：${currentStep.spokenText || '这一段只用于定位。'}`,
    nextText
  ].join('\n'));
}

function maybeAnnounceTurn(follow, turnStep, distanceMeters) {
  if (!turnStep?.spokenText || !Number.isFinite(distanceMeters)) {
    return;
  }
  const thresholds = Array.isArray(turnStep.announce?.beforeTurnMeters)
    ? turnStep.announce.beforeTurnMeters
    : [30, 15, 5];
  for (const threshold of thresholds) {
    const key = `${turnStep.id}:${threshold}`;
    if (distanceMeters <= threshold && !follow.announcedTurnThresholds.has(key)) {
      follow.announcedTurnThresholds.add(key);
      speak(`前方约 ${threshold} 米，${turnStep.spokenText}`);
      break;
    }
  }
}

function findNextTurnStep(steps, currentIndex) {
  for (let index = Math.max(0, currentIndex); index < steps.length; index += 1) {
    const step = steps[index];
    if (step.kind === 'turn' && step.turnPoint) {
      return step;
    }
  }
  return null;
}

function matchLocationToFollowSteps(location, steps) {
  const primary = steps.filter((step) => step.kind !== 'turn' && step.polyline);
  const candidates = primary.length ? primary : steps.filter((step) => step.polyline);
  let best = null;
  for (const step of candidates) {
    const stepIndex = steps.indexOf(step);
    const projection = projectLocationToPolyline(location, step.polyline);
    if (!projection) {
      continue;
    }
    if (!best || projection.distanceMeters < best.distanceMeters) {
      best = {
        step,
        stepIndex,
        distanceMeters: projection.distanceMeters
      };
    }
  }
  return best;
}

function matchLocationToFollowStepsWithCoordinateFallback(rawLocation, steps) {
  const candidates = [
    { location: rawLocation, coordinateSource: 'browser_raw' }
  ];
  const converted = convertWgs84ToGcj02Coordinate(rawLocation);
  if (converted && converted !== rawLocation) {
    candidates.push({ location: converted, coordinateSource: 'wgs84_to_gcj02' });
  }

  let best = null;
  for (const candidate of candidates) {
    const match = matchLocationToFollowSteps(candidate.location, steps);
    if (!match) {
      continue;
    }
    const enriched = {
      ...match,
      location: candidate.location,
      coordinateSource: candidate.coordinateSource
    };
    if (!best || enriched.distanceMeters < best.distanceMeters) {
      best = enriched;
    }
  }
  return best;
}

function projectLocationToPolyline(location, polyline) {
  const point = parseClientLngLat(location);
  const points = String(polyline || '').split(';').map(parseClientLngLat).filter(Boolean);
  if (!point || points.length < 2) {
    return null;
  }
  let best = null;
  for (let index = 0; index < points.length - 1; index += 1) {
    const projection = projectClientPointOnSegment(point, points[index], points[index + 1]);
    if (!best || projection.distanceMeters < best.distanceMeters) {
      best = projection;
    }
  }
  return best;
}

function projectClientPointOnSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return {
      distanceMeters: clientDistanceMeters(point, start)
    };
  }
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  const projected = {
    x: start.x + t * dx,
    y: start.y + t * dy
  };
  return {
    distanceMeters: clientDistanceMeters(point, projected)
  };
}

function distanceBetweenCoordinates(left, right) {
  const a = parseClientLngLat(left);
  const b = parseClientLngLat(right);
  return a && b ? clientDistanceMeters(a, b) : Infinity;
}

function parseClientLngLat(value) {
  const coordinate = extractCoordinate(value);
  if (!coordinate) {
    return null;
  }
  const [lngText, latText] = coordinate.split(',');
  const lng = Number(lngText);
  const lat = Number(latText);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return null;
  }
  const scale = Math.cos(lat * Math.PI / 180);
  return {
    lng,
    lat,
    x: lng * 111320 * scale,
    y: lat * 110540
  };
}

function clientDistanceMeters(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function formatFollowMeters(value) {
  const meters = Number(value || 0);
  if (!Number.isFinite(meters)) {
    return '未知距离';
  }
  return `${Math.round(meters)} 米`;
}

function updateFollowOutput(text) {
  if (elements.followOutput) {
    elements.followOutput.textContent = text;
  }
}

async function getRealtimeMediaStream() {
  const audio = {
    channelCount: 1,
    echoCancellation: { ideal: true },
    noiseSuppression: { ideal: true },
    autoGainControl: { ideal: true }
  };
  const videoBase = {
    width: { ideal: 1280 },
    height: { ideal: 720 }
  };
  const attempts = [
    {
      label: '强制后置摄像头',
      constraints: {
        video: { ...videoBase, facingMode: { exact: 'environment' } },
        audio
      }
    },
    {
      label: '优先后置摄像头',
      constraints: {
        video: { ...videoBase, facingMode: { ideal: 'environment' } },
        audio
      }
    },
    {
      label: '系统默认摄像头',
      constraints: {
        video: videoBase,
        audio
      }
    }
  ];

  let lastError = null;
  for (const attempt of attempts) {
    try {
      recordRealtimeDebug('media.request', attempt.label);
      const stream = await navigator.mediaDevices.getUserMedia(attempt.constraints);
      recordRealtimeDebug('media.success', attempt.label);
      if (attempt.label !== '强制后置摄像头') {
        appendVisionLog(`强制后置摄像头不可用，已降级为：${attempt.label}。需要看下面的摄像头自检结果。`);
      }
      return stream;
    } catch (error) {
      lastError = error;
      recordRealtimeDebug('media.failed', `${attempt.label}：${error.name || 'Error'} ${error.message || ''}`.trim());
    }
  }
  throw lastError || new Error('摄像头和麦克风打开失败。');
}

function reportCameraSettings(stream) {
  const videoTrack = stream.getVideoTracks()[0];
  const audioTrack = stream.getAudioTracks()[0];
  const settings = videoTrack?.getSettings?.() || {};
  const audioSettings = audioTrack?.getSettings?.() || {};
  const facingMode = settings.facingMode || 'unknown';
  const facingText = facingMode === 'environment'
    ? '后置摄像头'
    : facingMode === 'user'
      ? '前置摄像头'
      : '未知摄像头';
  const width = settings.width || elements.camera.videoWidth || '未知';
  const height = settings.height || elements.camera.videoHeight || '未知';
  const frameRate = settings.frameRate || '未知';
  const label = videoTrack?.label || '浏览器未提供名称';
  const audioState = audioTrack
    ? `麦克风已拿到，回声消除=${formatBooleanSetting(audioSettings.echoCancellation)}，降噪=${formatBooleanSetting(audioSettings.noiseSuppression)}，自动增益=${formatBooleanSetting(audioSettings.autoGainControl)}`
    : '没有拿到麦克风';
  appState.cameraInfo = { facingMode, facingText, width, height, frameRate, label, audioState, audioSettings };
  appendVisionLog(`摄像头自检：当前是${facingText}，分辨率 ${width}x${height}，帧率 ${frameRate}，设备名：${label}；${audioState}。`);
  if (facingMode !== 'environment') {
    appendVisionLog('提醒：当前没有确认拿到后置摄像头，现场描述可能和你面前环境不一致。');
  }
  recordRealtimeDebug('media.settings', appState.cameraInfo);
}

function formatBooleanSetting(value) {
  if (value === true) {
    return '开';
  }
  if (value === false) {
    return '关';
  }
  return '未知';
}

async function startRealtime() {
  return startRealtimeSession({ activeReminderMode: 'ali_stable', forceMode: '' });
}

function convertWgs84ToGcj02Coordinate(value) {
  const point = parseClientLngLat(value);
  if (!point || !isPointInChina(point.lng, point.lat)) {
    return '';
  }
  const dLat = transformGcjLat(point.lng - 105.0, point.lat - 35.0);
  const dLng = transformGcjLng(point.lng - 105.0, point.lat - 35.0);
  const radLat = point.lat / 180.0 * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - 0.006693421622965943 * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  const mgLat = point.lat + (dLat * 180.0) / ((6335552.717000426 * magic) / (sqrtMagic * sqrtMagic) * Math.PI);
  const mgLng = point.lng + (dLng * 180.0) / (6378245.0 / sqrtMagic * Math.cos(radLat) * Math.PI);
  return `${mgLng.toFixed(6)},${mgLat.toFixed(6)}`;
}

function isPointInChina(lng, lat) {
  return lng >= 72.004 && lng <= 137.8347 && lat >= 0.8293 && lat <= 55.8271;
}

function transformGcjLat(x, y) {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0;
  ret += (160.0 * Math.sin(y / 12.0 * Math.PI) + 320 * Math.sin(y * Math.PI / 30.0)) * 2.0 / 3.0;
  return ret;
}

function transformGcjLng(x, y) {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0;
  ret += (150.0 * Math.sin(x / 12.0 * Math.PI) + 300.0 * Math.sin(x / 30.0 * Math.PI)) * 2.0 / 3.0;
  return ret;
}

async function startRtcActiveReminder() {
  return startRealtimeSession({ activeReminderMode: 'rtc', forceMode: 'websocket' });
}

async function startSpeedActiveReminder() {
  return startRealtimeSession({ activeReminderMode: 'ali_experiment', forceMode: '' });
}

async function startAliObservationActiveReminder() {
  return startRealtimeSession({ activeReminderMode: 'ali_experiment', forceMode: '' });
}

async function startGeminiActiveReminder() {
  return startGeminiReminderMode({
    label: 'Gemini 稳定主动提醒',
    promptMode: 'deep_multitask',
    deliveryMode: 'result',
    taskSourceMode: 'confirmation_output',
    muteMicDuringPlayback: true
  });
}

async function startGeminiObservationActiveReminder() {
  return startGeminiReminderMode({
    label: 'Gemini 实验主动提醒',
    promptMode: 'deep_multitask',
    deliveryMode: 'result',
    taskSourceMode: 'confirmation_output',
    muteMicDuringPlayback: true
  });
}

async function startGeminiContractActiveReminder() {
  return startGeminiReminderMode({
    label: 'Gemini 合同实验',
    promptMode: 'deep_multitask',
    deliveryMode: 'result',
    taskSourceMode: 'function_contract',
    thinkingLevel: 'medium',
    muteMicDuringPlayback: true,
    strictMuteDuringResponse: true
  });
}

async function startUnifiedVisualAssistant() {
  return startGeminiReminderMode(geminiVisualAssistantBaseOptions({
    label: appState.appVariant === 'greencloud-gemini'
      ? '实时慧眼'
      : '实时慧眼（Google声音）'
  }));
}

async function startBrowserDirectUnifiedAssistant() {
  if (window.ZzyaiClientAccess?.profile === 'web') return startUnifiedVisualAssistant();
  return startGeminiReminderMode(geminiBrowserDirectVisualAssistantBaseOptions());
}

async function startAliyunUnifiedVisualAssistant() {
  return startRealtimeSession({
    activeReminderMode: 'ali_unified',
    forceMode: 'websocket',
    unifiedAliVoice: true,
    visualAssistantBaseExperiment: true,
    directFunctionContractExperiment: true
  });
}

async function startAliyunCheapUnifiedVisualAssistant() {
  return startRealtimeSession({
    activeReminderMode: 'ali_unified',
    forceMode: 'websocket',
    unifiedAliVoice: true,
    visualAssistantBaseExperiment: true,
    realtimeModelProfile: 'flash',
    directFunctionContractExperiment: true
  });
}

async function startGeminiLiteContractActiveReminder() {
  return startGeminiReminderMode({
    label: 'Gemini Lite 合同对比',
    promptMode: 'deep_multitask',
    deliveryMode: 'result',
    taskSourceMode: 'confirmation_output',
    muteMicDuringPlayback: true,
    strictMuteDuringResponse: true
  });
}

async function startGeminiFindObject() {
  const greencloudGemini = appState.appVariant === 'greencloud-gemini';
  return startGeminiReminderMode({
    label: greencloudGemini ? 'Gemini 找东西实验' : '阿里快筛找东西实验',
    promptMode: 'find_object',
    deliveryMode: 'guidance',
    taskSourceMode: 'find_object',
    thinkingLevel: 'medium',
    muteMicDuringPlayback: true,
    strictMuteDuringResponse: true
  });
}

async function startGeminiLiveFindExperiment() {
  return startGeminiReminderMode({
    label: '手机直连 3.1 Flash 找东西实验',
    promptMode: 'find_object',
    deliveryMode: 'guidance',
    taskSourceMode: 'find_object',
    findScreenTransport: 'browser_direct_live',
    thinkingLevel: 'medium',
    muteMicDuringPlayback: true,
    strictMuteDuringResponse: true
  });
}

async function startGeminiContinuousNarration() {
  return startGeminiReminderMode({
    label: '持续播报',
    promptMode: 'continuous_narration',
    deliveryMode: 'narration',
    taskSourceMode: 'continuous_narration',
    thinkingLevel: 'low',
    muteMicDuringPlayback: true,
    strictMuteDuringResponse: true
  });
}

async function startGeminiReminderMode(options = {}) {
  const label = options.label || 'Gemini 主动提醒';
  if (appState.realtimeStarting || appState.realtime || appState.geminiReminder) {
    appendVisionLog(`请先结束当前实时慧眼，再启动 ${label}。`);
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    appendVisionLog('这个浏览器不支持摄像头和麦克风调用。');
    return;
  }

  appState.realtimeStarting = true;
  try {
    resetRealtimeDebugLog();
    appendVisionLog(options.taskSourceMode === 'continuous_narration'
      ? `正在启动 ${label}。本入口由 Gemini Live 直接观察并定时播报，不使用图片快筛。`
      : options.taskSourceMode === 'unified_assistant'
        ? `正在启动 ${label}。同一入口将按语音任务切换主动提醒、找东西或持续播报。`
        : `正在启动 ${label}。后台视觉模型负责半秒快筛，Gemini Live 负责对话和模型声音播报。`);
    logClientEvent('gemini_reminder.start_requested', {
      label,
      promptMode: options.promptMode || 'baseline',
      deliveryMode: options.deliveryMode || 'broadcast'
    });

    const reusableStream = options.reuseExistingStream
      && appState.stream
      && appState.stream.getTracks().some((track) => track.readyState === 'live');
    if (!reusableStream) {
      appState.stream = await getRealtimeMediaStream();
    }
    elements.camera.srcObject = appState.stream;
    await elements.camera.play();
    reportCameraSettings(appState.stream);

    await startGeminiLiveReminderSession(options);
  } catch (error) {
    appendVisionLog(`${label}启动失败：${error.message}`);
    logClientEvent('gemini_reminder.start_failed', {
      label,
      stage: appState.geminiReminder ? 'gemini_live' : 'media',
      error: error.message
    });
    stopGeminiActiveReminder('Gemini 主动提醒已停止。');
  } finally {
    appState.realtimeStarting = false;
  }
}

async function startRealtimeSession(options = {}) {
  if (appState.realtimeStarting || appState.realtime || appState.geminiReminder) {
    appendVisionLog('实时慧眼已经在运行。');
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    appendVisionLog('这个浏览器不支持摄像头和麦克风调用。');
    return;
  }

  appState.realtimeStarting = true;
  try {
    resetRealtimeDebugLog();
    const config = await getRealtimeConfig();
    const mode = options.forceMode || resolveRealtimeMode(config);
    ensureRealtimeCanStart(mode, config);
    const experimentText = options.activeReminderMode === 'rtc'
      ? '，并启用 Manual 实验主动提醒'
      : options.activeReminderMode === 'ali_unified'
        ? '，并启用纯阿里统一实时慧眼'
      : options.activeReminderMode === 'ali_experiment' || options.activeReminderMode === 'speed'
        ? '，并启用阿里实验主动提醒'
        : options.activeReminderMode === 'ali_stable' || options.activeReminderMode === 'flash' || options.activeReminderMode === 'speed_observation'
          ? '，并启用阿里稳定主动提醒'
          : '';
    appendVisionLog(`正在启动${mode === 'webrtc' ? 'WebRTC 通话' : 'WebSocket 实时流'}${experimentText}，请允许摄像头和麦克风。`);

    appState.stream = await getRealtimeMediaStream();
    elements.camera.srcObject = appState.stream;
    await elements.camera.play();
    reportCameraSettings(appState.stream);

    if (mode === 'webrtc') {
      await startWebRtcRealtime();
    } else {
      await startWebSocketRealtime(options.realtimeModelProfile, {
        directFunctionContractExperiment: Boolean(options.directFunctionContractExperiment)
      });
    }
    startActiveReminderLoop(options.activeReminderMode || 'flash');
    if (options.unifiedAliVoice) {
      startAliUnifiedVisualState({
        visualAssistantBaseExperiment: Boolean(options.visualAssistantBaseExperiment)
      });
    }
  } catch (error) {
    appendVisionLog(`实时慧眼启动失败：${formatRealtimeStartError(error.message)}`);
    stopRealtime();
  } finally {
    appState.realtimeStarting = false;
  }
}

async function startWebSocketRealtime(modelProfile = '', options = {}) {
  const config = appState.realtimeConfig || await getRealtimeConfig();
  const webSocketPath = config.webSocketPath || '/api/ws';
  const socketUrl = new URL(webSocketPath, `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`);
  if (modelProfile === 'flash') {
    socketUrl.searchParams.set('modelProfile', 'flash');
  }
  const socket = new WebSocket(socketUrl.toString());
  const audioContext = new AudioContext();
  let player = null;
  player = new PcmPlayer(
    audioContext,
    AUDIO_OUTPUT_RATE,
    (scheduledEndAt) => {
      if (appState.realtime?.player === player) {
        markAssistantPlaybackScheduled(scheduledEndAt, 'player audio queue');
      }
    },
    () => {
      if (appState.realtime?.player === player) {
        markAssistantPlaybackEnded('player audio queue idle');
      }
    },
    'aliyun_live'
  );

  appState.realtime = {
    mode: 'websocket',
    socket,
    audioContext,
    player,
    videoTimer: null,
    audioProcessor: null,
    audioSource: null,
    audioSilenceGain: null,
    localVadSpeaking: false,
    localVadStartedAt: 0,
    localVadLastVoiceAt: 0,
    localVadInterrupting: false,
    localVadPlaybackHighFrames: 0,
    localVadPlaybackCandidateFrames: [],
    localVadAutoCommitTimer: null,
    localVadSuppressUntil: 0,
    assistantEchoDroppedFrames: 0,
    assistantEchoLastLogAt: 0,
    suppressAssistantOutputUntilManualCommit: false,
    interruptedAssistantOutputDiscardLogged: false,
    assistantPlaybackActive: false,
    assistantPlaybackUntil: 0,
    responseInProgress: false,
    lastResponseDoneAt: 0,
    lastManualCommitAt: 0,
    pendingManualTranscriptStartedAt: 0,
    lastRtcPollAt: 0,
    modelProfile,
    directFunctionContractExperiment: Boolean(options.directFunctionContractExperiment),
    pendingAliCheapToolResult: null,
    aliCheapContractConfirmationInFlight: false,
    aliCheapContractConfirmation: null,
    isReady: false
  };

  socket.addEventListener('open', () => {
    const apiKey = getClientApiKey();
    if (apiKey) {
      socket.send(JSON.stringify({ type: 'proxy.auth', apiKey }));
      appendVisionLog('本机到后端的实时连接已打开，已发送手机临时 Key，等待后端连接百炼。');
    } else {
      appendVisionLog('本机到后端的实时连接已打开，等待后端连接百炼。如果服务端没有 Key，请先在页面填写并保存百炼 Key。');
    }
  });

  socket.addEventListener('message', async (event) => {
    const message = JSON.parse(event.data);
    await handleRealtimeServerEvent(message);
  });

  socket.addEventListener('close', () => {
    appendVisionLog('实时连接已关闭。');
    stopRealtime();
  });

  socket.addEventListener('error', () => {
    appendVisionLog('实时连接出错。');
  });
}

async function activateWebSocketStreams() {
  const realtime = appState.realtime;
  if (!realtime || realtime.mode !== 'websocket' || realtime.audioProcessor) {
    return;
  }

  await startManualAudioCapture(realtime);
  realtime.videoTimer = setInterval(sendVideoFrame, VIDEO_FRAME_INTERVAL_MS);
  appendVisionLog('WebSocket Manual 已启动：麦克风语音和低频视频帧正在持续发送。当前不会因为环境声音自动请求模型回答；实验按钮只用于诊断。');
}

async function startManualAudioCapture(realtime) {
  if (!appState.stream) {
    throw new Error('没有可用的麦克风流。');
  }

  const audioContext = realtime.audioContext;
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  const source = audioContext.createMediaStreamSource(appState.stream);
  realtime.audioSource = source;

  if (audioContext.audioWorklet) {
    await audioContext.audioWorklet.addModule('/audio-worklet.js');
    const processor = new AudioWorkletNode(audioContext, 'pcm-capture');
    const silenceGain = audioContext.createGain();
    silenceGain.gain.value = 0;
    processor.port.onmessage = (event) => handleManualAudioFrame(event.data, audioContext.sampleRate);
    source.connect(processor);
    processor.connect(silenceGain);
    silenceGain.connect(audioContext.destination);
    realtime.audioProcessor = processor;
    realtime.audioSilenceGain = silenceGain;
    recordRealtimeDebug('manual.audio_capture.started', {
      method: 'audioWorklet',
      inputRate: audioContext.sampleRate,
      outputRate: AUDIO_INPUT_RATE,
      chunkBytes: AUDIO_SEND_BYTES
    });
    return;
  }

  const processor = audioContext.createScriptProcessor(4096, 1, 1);
  const silenceGain = audioContext.createGain();
  silenceGain.gain.value = 0;
  processor.onaudioprocess = (event) => {
    handleManualAudioFrame(event.inputBuffer.getChannelData(0), audioContext.sampleRate);
  };
  source.connect(processor);
  processor.connect(silenceGain);
  silenceGain.connect(audioContext.destination);
  realtime.audioProcessor = processor;
  realtime.audioSilenceGain = silenceGain;
  recordRealtimeDebug('manual.audio_capture.started', {
    method: 'scriptProcessor',
    inputRate: audioContext.sampleRate,
    outputRate: AUDIO_INPUT_RATE,
    chunkBytes: AUDIO_SEND_BYTES
  });
}

async function startWebRtcRealtime() {
  const config = await getRealtimeConfig();
  if (!config.webRtcConfigured) {
    throw new Error('WebRTC Endpoint 未配置。百炼 WebRTC 需要官方白名单 Endpoint，请先用 WebSocket 实时流测试。');
  }

  const peer = new RTCPeerConnection({ iceServers: [] });
  const outboundChannel = peer.createDataChannel('oai-events');
  const audioTrack = appState.stream.getAudioTracks()[0];
  const localVideoTrack = appState.stream.getVideoTracks()[0];
  const canvasTrack = createLowFpsVideoTrack(localVideoTrack);
  peer.addTrack(audioTrack, appState.stream);
  peer.addTrack(canvasTrack, new MediaStream([canvasTrack]));
  recordRealtimeDebug('webrtc.tracks.added', {
    audio: Boolean(audioTrack),
    sourceVideo: localVideoTrack?.getSettings?.() || {},
    sentVideo: canvasTrack?.getSettings?.() || {}
  });

  peer.ontrack = (event) => {
    elements.remoteAudio.srcObject = event.streams[0];
  };

  peer.ondatachannel = (event) => {
    attachRealtimeDataChannel(event.channel);
  };

  outboundChannel.onopen = () => {
    appState.realtime.eventChannel = outboundChannel;
    appState.realtime.isReady = true;
    recordRealtimeDebug('datachannel.open', outboundChannel.label || 'outbound');
    sendRealtimeContext({ quiet: true });
    appendVisionLog('WebRTC 通话已接通。你可以直接说话。');
  };

  outboundChannel.onmessage = (event) => {
    handleRealtimeDataChannelMessage(event.data);
  };
  outboundChannel.onerror = () => {
    recordRealtimeDebug('datachannel.error', outboundChannel.label || 'outbound');
    appendVisionLog('WebRTC 事件通道出错。');
  };
  outboundChannel.onclose = () => {
    recordRealtimeDebug('datachannel.close', outboundChannel.label || 'outbound');
    appendVisionLog('WebRTC 事件通道已关闭。');
  };

  appState.realtime = {
    mode: 'webrtc',
    peer,
    eventChannel: outboundChannel,
    canvasTrack,
    statsTimer: null,
    voice: config.voice,
    isReady: false
  };

  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  await waitForIceGatheringComplete(peer);
  recordRealtimeDebug('webrtc.offer.ready', summarizeSdp(peer.localDescription.sdp));

  const response = await fetch('/api/realtime/sdp', {
    method: 'POST',
    headers: getRealtimeSdpHeaders(),
    body: peer.localDescription.sdp
  });
  const answerSdp = await response.text();
  if (!response.ok) {
    throw new Error(parseErrorText(answerSdp) || `HTTP ${response.status}`);
  }
  await peer.setRemoteDescription({ type: 'answer', sdp: answerSdp });
  recordRealtimeDebug('webrtc.answer.ready', summarizeSdp(answerSdp));
  startVideoStatsPolling(peer);
}

async function getRealtimeConfig() {
  const config = await apiGet('/api/realtime/config');
  appState.realtimeConfig = config;
  updateRealtimeConfigStatus(config);
  return config;
}

function selectRecommendedRealtimeMode(config) {
  if (!elements.realtimeMode || !config) {
    return;
  }
  if (config.webSocketConfigured || config.serverApiKeyConfigured) {
    elements.realtimeMode.value = 'websocket';
  } else if (config.webRtcConfigured) {
    elements.realtimeMode.value = 'webrtc';
  }
}

function resolveRealtimeMode(config) {
  const requested = elements.realtimeMode.value;
  if (requested === 'websocket' && (config?.webSocketConfigured || config?.serverApiKeyConfigured || readClientApiKey())) {
    return 'websocket';
  }
  if (requested === 'webrtc' && (config?.webRtcConfigured || readClientWebRtcEndpoint())) {
    return 'webrtc';
  }
  return config?.webRtcConfigured ? 'webrtc' : 'websocket';
}

function ensureRealtimeCanStart(mode, config) {
  const hasServerKey = Boolean(config.serverApiKeyConfigured || config.webSocketConfigured);
  const hasServerEndpoint = Boolean(config.webRtcConfigured);
  const hasClientKey = Boolean(readClientApiKey());
  const hasClientEndpoint = Boolean(readClientWebRtcEndpoint());
  if (mode === 'webrtc' && !hasClientKey && !hasServerKey) {
    throw new Error('服务端没有保存百炼 Key。请展开高级调试，临时填写并保存百炼 DashScope Key。');
  }
  if (mode === 'websocket' && !hasClientKey && !hasServerKey) {
    throw new Error('WebSocket Manual 需要百炼 Key。请展开高级调试，临时填写并保存百炼 DashScope Key。');
  }
  if (mode === 'webrtc' && !hasClientEndpoint && !hasServerEndpoint) {
    throw new Error('服务端没有保存百炼 WebRTC Endpoint。请展开高级调试填写白名单 Endpoint。');
  }
}

function parseErrorText(text) {
  try {
    const data = JSON.parse(text);
    return data.error || data.message || text;
  } catch {
    return text;
  }
}

function formatRealtimeStartError(message) {
  if (String(message || '').includes('Endpoint.AccessDenied')) {
    return [
      '百炼拒绝了当前 WebRTC Endpoint。',
      '这通常不是手机或摄像头问题，而是 DashScope Key 和 WebRTC Endpoint 不属于同一个百炼业务空间，或该 Key 没有这个 Workspace Endpoint 的权限。',
      '要修 WebRTC，需要在百炼控制台确认 Key、Workspace ID、Endpoint 三者属于同一个业务空间。'
    ].join('');
  }
  return message;
}

function attachRealtimeDataChannel(channel) {
  channel.onopen = () => {
    recordRealtimeDebug('datachannel.open', channel.label || 'inbound');
    if (appState.realtime?.mode === 'webrtc' && !appState.realtime.eventChannel) {
      appState.realtime.eventChannel = channel;
      appState.realtime.isReady = true;
      sendRealtimeContext({ quiet: true });
    }
  };
  channel.onmessage = (event) => {
    handleRealtimeDataChannelMessage(event.data);
  };
  channel.onerror = () => {
    recordRealtimeDebug('datachannel.error', channel.label || 'inbound');
    appendVisionLog(`WebRTC 数据通道出错：${channel.label || '未命名通道'}`);
  };
  channel.onclose = () => {
    recordRealtimeDebug('datachannel.close', channel.label || 'inbound');
    appendVisionLog(`WebRTC 数据通道已关闭：${channel.label || '未命名通道'}`);
  };
}

function handleRealtimeDataChannelMessage(data) {
  try {
    const message = JSON.parse(data);
    handleRealtimeServerEvent(message);
  } catch (error) {
    recordRealtimeDebug('datachannel.parse_failed', String(data || '').slice(0, 500));
    appendVisionLog(`WebRTC 返回了无法解析的事件：${error.message}`);
  }
}

function queueIOSAudioContextClose(audioContext, label) {
  if (!audioContext || audioContext.state === 'closed') {
    return;
  }
  try {
    const closing = Promise.resolve(audioContext.close()).catch((error) => {
      recordRealtimeDebug('audio_context.close_failed', `${label}:${error?.message || error}`);
    });
    pendingIOSAudioContextClosures.push(closing);
  } catch (error) {
    recordRealtimeDebug('audio_context.close_failed', `${label}:${error?.message || error}`);
  }
}

function scheduleIOSWebAudioSessionReset() {
  const audioSession = navigator.audioSession;
  const closures = pendingIOSAudioContextClosures.splice(0);
  const resetRoute = (stage) => {
    if (appState.stream || appState.realtime || appState.geminiReminder) {
      return;
    }
    for (const element of [elements.remoteAudio, elements.camera]) {
      try {
        element?.pause?.();
        if (element) element.srcObject = null;
      } catch {}
    }
    window.__accessibleVisionReleaseMedia?.();
    if (!audioSession || typeof audioSession.type !== 'string') {
      return;
    }
    try {
      audioSession.type = 'playback';
      audioSession.type = 'auto';
      recordRealtimeDebug('audio_session.route_reset', `playback_to_auto:${stage}`);
    } catch (error) {
      recordRealtimeDebug('audio_session.route_reset_failed', error?.message || String(error));
    }
  };
  Promise.allSettled(closures).then(() => {
    setTimeout(() => resetRoute('after_close'), 120);
    setTimeout(() => resetRoute('settled_retry'), 900);
  });
}

function stopRealtime() {
  const realtime = appState.realtime;
  stopActiveReminderLoop('主动提醒已停止。');
  stopGeminiActiveReminder('Gemini 主动提醒已停止。');

  if (realtime?.videoTimer) {
    clearInterval(realtime.videoTimer);
  }
  if (realtime?.statsTimer) {
    clearInterval(realtime.statsTimer);
  }
  if (realtime?.canvasTrack?._drawTimer) {
    clearInterval(realtime.canvasTrack._drawTimer);
  }
  if (appState.assistantMicMuteTimer) {
    clearTimeout(appState.assistantMicMuteTimer);
    appState.assistantMicMuteTimer = null;
  }
  if (appState.assistantVadRestoreTimer) {
    clearTimeout(appState.assistantVadRestoreTimer);
    appState.assistantVadRestoreTimer = null;
  }
  if (realtime?.localVadAutoCommitTimer) {
    clearTimeout(realtime.localVadAutoCommitTimer);
  }
  if (realtime?.audioProcessor) {
    realtime.audioProcessor.disconnect();
  }
  if (realtime?.audioSource) {
    realtime.audioSource.disconnect();
  }
  if (realtime?.audioSilenceGain) {
    realtime.audioSilenceGain.disconnect();
  }
  if (realtime?.player) {
    realtime.player.reset('realtime_stopped');
  }
  if (realtime?.socket && realtime.socket.readyState <= WebSocket.OPEN) {
    realtime.socket.close();
  }
  if (realtime?.peer) {
    realtime.peer.close();
  }
  if (elements.remoteAudio?.srcObject?.getTracks) {
    for (const track of elements.remoteAudio.srcObject.getTracks()) {
      track.stop();
    }
  }
  if (elements.remoteAudio) {
    elements.remoteAudio.pause();
    elements.remoteAudio.srcObject = null;
  }
  if (appState.stream) {
    for (const track of appState.stream.getTracks()) {
      track.stop();
    }
  }
  queueIOSAudioContextClose(realtime?.audioContext, 'realtime_output');

  appState.stream = null;
  appState.realtime = null;
  appState.pendingAudio = [];
  appState.pendingAudioBytes = 0;
  appState.sentFirstAudio = false;
  appState.videoFrameCount = 0;
  elements.camera.pause?.();
  elements.camera.srcObject = null;
  scheduleIOSWebAudioSessionReset();
}

function setLocalMicrophoneEnabled(enabled, reason = '') {
  if (!appState.stream) {
    return;
  }
  for (const track of appState.stream.getAudioTracks()) {
    track.enabled = enabled;
  }
  const passiveButtonMode = isVisualAssistantSpecialTaskButtonOnlyMode(appState.geminiReminder)
    || /button-only mode/i.test(String(reason || ''));
  window.__accessibleVisionSetNativeMicrophoneEnabled?.(enabled || !passiveButtonMode);
  recordRealtimeDebug(enabled ? 'mic.enabled' : 'mic.disabled', reason);
}

function isAliFullDuplexRealtimeSession() {
  const realtime = appState.realtime;
  return Boolean(
    realtime?.mode === 'websocket'
    && (
      isAliUnifiedHostSession(appState.activeReminder)
      || isSpeedLogicMode(appState.activeReminder?.mode)
    )
  );
}

function clearRealtimeManualInputBuffer(reason = '', options = {}) {
  const realtime = appState.realtime;
  const droppedChunks = appState.pendingAudio.length;
  const droppedBytes = appState.pendingAudioBytes;
  const hadUpstreamAudio = Boolean(appState.sentFirstAudio);
  appState.pendingAudio = [];
  appState.pendingAudioBytes = 0;
  appState.sentFirstAudio = false;
  if (realtime) {
    realtime.localVadPlaybackCandidateFrames = [];
  }
  if (
    options.clearServer !== false
    && realtime?.mode === 'websocket'
    && realtime.socket?.readyState === WebSocket.OPEN
  ) {
    sendRealtimeEvent({ type: 'input_audio_buffer.clear' });
  }
  recordRealtimeDebug('manual.input_buffer_cleared', {
    reason,
    droppedChunks,
    droppedBytes,
    hadUpstreamAudio
  });
  logClientEvent('realtime.manual_input_buffer_cleared', {
    reason,
    droppedChunks,
    droppedBytes,
    hadUpstreamAudio,
    nativeIOS: Boolean(window.__ACCESSIBLE_VISION_NATIVE_IOS__)
  });
}

function noteAssistantEchoAudioDropped(rms) {
  const realtime = appState.realtime;
  if (!realtime) {
    return;
  }
  realtime.assistantEchoDroppedFrames = (realtime.assistantEchoDroppedFrames || 0) + 1;
  const now = Date.now();
  if (
    realtime.assistantEchoLastLogAt
    && now - realtime.assistantEchoLastLogAt < 1000
  ) {
    return;
  }
  const droppedFrames = realtime.assistantEchoDroppedFrames;
  realtime.assistantEchoDroppedFrames = 0;
  realtime.assistantEchoLastLogAt = now;
  recordRealtimeDebug('assistant.echo_audio_dropped', {
    droppedFrames,
    rms
  });
  logClientEvent('assistant_echo_audio_dropped', {
    droppedFrames,
    rms: Number(rms || 0).toFixed(4),
    nativeIOS: Boolean(window.__ACCESSIBLE_VISION_NATIVE_IOS__)
  });
}

function suppressManualVadAfterReminder(reason, durationMs = ACTIVE_REMINDER_POST_SPEECH_SUPPRESS_MS) {
  const realtime = appState.realtime;
  if (!realtime) {
    return;
  }
  realtime.localVadSuppressUntil = Date.now() + durationMs;
  realtime.localVadSpeaking = false;
  realtime.localVadStartedAt = 0;
  realtime.localVadLastVoiceAt = 0;
  realtime.localVadInterrupting = false;
  realtime.localVadPlaybackHighFrames = 0;
  realtime.localVadPlaybackCandidateFrames = [];
  if (realtime.localVadAutoCommitTimer) {
    clearTimeout(realtime.localVadAutoCommitTimer);
    realtime.localVadAutoCommitTimer = null;
  }
  appState.pendingAudio = [];
  appState.pendingAudioBytes = 0;
  appState.sentFirstAudio = false;
  if (realtime.mode === 'websocket' && realtime.socket?.readyState === WebSocket.OPEN) {
    sendRealtimeEvent({ type: 'input_audio_buffer.clear' });
  }
  recordRealtimeDebug('manual.local_vad.suppressed_after_reminder', {
    reason,
    durationMs
  });
  logClientEvent('active_reminder.post_speech_vad_suppressed', {
    reason,
    durationMs
  });
}

function muteMicrophoneWhileAssistantSpeaks(reason) {
  enterAssistantPlaybackVadGuard(reason);
  if (isVisualAssistantSpecialTaskButtonOnlyMode(appState.geminiReminder)) {
    if (appState.assistantMicMuteTimer) {
      clearTimeout(appState.assistantMicMuteTimer);
      appState.assistantMicMuteTimer = null;
    }
    setLocalMicrophoneEnabled(false, `${reason}; continuous narration button-only mode`);
    recordRealtimeDebug('mic.kept_disabled', `${reason}; special task stops by button`);
    return;
  }
  if (isAliFullDuplexRealtimeSession()) {
    if (appState.assistantMicMuteTimer) {
      clearTimeout(appState.assistantMicMuteTimer);
      appState.assistantMicMuteTimer = null;
    }
    setLocalMicrophoneEnabled(true, `${reason}; ali full duplex echo filtering`);
    recordRealtimeDebug('mic.kept_enabled', `${reason}; ali full duplex echo filtering`);
    return;
  }
  if (!elements.strongEchoGuard?.checked) {
    recordRealtimeDebug('mic.kept_enabled', `${reason}; strong echo guard off`);
    return;
  }
  if (appState.assistantMicMuteTimer) {
    clearTimeout(appState.assistantMicMuteTimer);
  }
  setLocalMicrophoneEnabled(false, reason);
  appState.assistantMicMuteTimer = setTimeout(() => {
    setLocalMicrophoneEnabled(true, 'assistant safety timeout');
    appState.assistantMicMuteTimer = null;
  }, 12000);
}

function getActiveSpecialTaskModeForStop() {
  const visual = appState.geminiReminder;
  if (!visual) {
    return '';
  }
  const mode = visual.transport === 'aliyun-realtime'
    ? getAliUnifiedCurrentMode()
    : getGeminiReminderExecutionMode(visual);
  if (mode === 'find_object' && visual.findTarget) {
    return 'find_object';
  }
  if (mode === 'continuous_narration' && visual.continuousNarrationActive) {
    return 'continuous_narration';
  }
  return '';
}

function syncSpecialTaskStopControl(options = {}) {
  if (!elements.stopRealtime) {
    return;
  }
  const mode = getActiveSpecialTaskModeForStop();
  elements.stopRealtime.textContent = mode === 'find_object'
    ? '停止找东西'
    : mode === 'continuous_narration'
      ? '停止持续播报'
      : '结束实时慧眼';
  if (mode === 'find_object' || mode === 'continuous_narration') {
    elements.stopRealtime.hidden = false;
    elements.stopRealtime.disabled = false;
  }
  if (mode && options.focus) {
    window.setTimeout(() => {
      if (getActiveSpecialTaskModeForStop() === mode) {
        elements.stopRealtime.focus({ preventScroll: true });
      }
    }, 0);
  }
}

function focusSpecialTaskStoppedStatus() {
  window.setTimeout(() => {
    elements.stopRealtime?.focus({ preventScroll: true });
  }, 0);
}

async function handleRealtimeStopButton() {
  const mode = getActiveSpecialTaskModeForStop();
  if (!mode) {
    stopRealtime();
    return;
  }
  const visual = appState.geminiReminder;
  const stoppedLabel = mode === 'find_object' ? '找东西' : '持续播报';
  logClientEvent('special_task.stop_button_pressed', { mode });
  if (visual?.transport === 'aliyun-realtime') {
    cancelAliUnifiedSpeechForTaskSwitch('special_task_stop_button');
    returnAliUnifiedToDistributor('special_task_stop_button');
    setLocalMicrophoneEnabled(true, 'special task stopped by button');
    setActiveReminderStatus(`${stoppedLabel}已停止，视觉助手底座继续运行。`);
    syncSpecialTaskStopControl();
    focusSpecialTaskStoppedStatus();
    return;
  }
  if (!visual) {
    return;
  }
  const browserDirectScreenExperiment = Boolean(visual.browserDirectScreenExperiment);
  visual.player?.reset('visual_mode_switch');
  visual.turnInProgress = false;
  setGeminiAssistantResponseActive(visual, false);
  stopGeminiActiveReminder();
  await startGeminiReminderMode(geminiVisualAssistantBaseOptions({
    label: browserDirectScreenExperiment
      ? '实时慧眼（手机直连筛图）'
      : appState.appVariant === 'greencloud-gemini'
        ? '实时慧眼'
        : '实时慧眼（Google声音）',
    browserDirectScreenExperiment,
    reuseExistingStream: true
  }));
  setLocalMicrophoneEnabled(true, 'special task stopped by button');
  setActiveReminderStatus(`${stoppedLabel}已停止，视觉助手底座继续运行。`);
  syncSpecialTaskStopControl();
  focusSpecialTaskStoppedStatus();
}

function releaseMicrophoneAfterAssistant(delayMs = 900) {
  if (appState.assistantMicMuteTimer) {
    clearTimeout(appState.assistantMicMuteTimer);
  }
  const guardDelayMs = Math.max(delayMs, getAssistantPlaybackRemainingMs() + ASSISTANT_PLAYBACK_TAIL_MS);
  restoreVadAfterAssistant(guardDelayMs + 500);
  appState.assistantMicMuteTimer = setTimeout(() => {
    if (isVisualAssistantSpecialTaskButtonOnlyMode(appState.geminiReminder)) {
      setLocalMicrophoneEnabled(false, 'assistant response ended; special task button-only mode');
    } else {
      setLocalMicrophoneEnabled(true, 'assistant response ended');
    }
    appState.assistantMicMuteTimer = null;
  }, guardDelayMs);
}

function enterAssistantPlaybackVadGuard(reason, playbackUntil = 0) {
  const realtime = appState.realtime;
  const wasPlaybackActive = isAssistantPlaybackActive(realtime);
  if (realtime) {
    realtime.assistantPlaybackActive = true;
    realtime.assistantPlaybackUntil = Math.max(
      realtime.assistantPlaybackUntil || 0,
      playbackUntil || Date.now() + ASSISTANT_PLAYBACK_MIN_GUARD_MS
    );
  }
  if (appState.assistantVadRestoreTimer) {
    clearTimeout(appState.assistantVadRestoreTimer);
    appState.assistantVadRestoreTimer = null;
  }
  if (wasPlaybackActive) {
    return;
  }
  if (isAliFullDuplexRealtimeSession()) {
    clearRealtimeManualInputBuffer(`assistant_playback_started:${reason}`);
    realtime.localVadSpeaking = false;
    realtime.localVadStartedAt = 0;
    realtime.localVadLastVoiceAt = 0;
    realtime.localVadInterrupting = false;
    realtime.localVadPlaybackHighFrames = 0;
    realtime.localVadPlaybackCandidateFrames = [];
  }
  updateRealtimeSession({
    vadProfile: ASSISTANT_PLAYBACK_VAD_PROFILE,
    reason: `assistant playback: ${reason}`
  });
}

function restoreVadAfterAssistant(delayMs = 1400) {
  if (appState.assistantVadRestoreTimer) {
    clearTimeout(appState.assistantVadRestoreTimer);
  }
  appState.assistantVadRestoreTimer = setTimeout(() => {
    const remainingMs = getAssistantPlaybackRemainingMs();
    if (remainingMs > 0) {
      restoreVadAfterAssistant(remainingMs + ASSISTANT_PLAYBACK_TAIL_MS);
      return;
    }
    if (appState.realtime) {
      appState.realtime.assistantPlaybackActive = false;
      appState.realtime.assistantPlaybackUntil = 0;
      appState.realtime.localVadInterrupting = false;
      appState.realtime.localVadPlaybackHighFrames = 0;
    }
    updateRealtimeSession({
      vadProfile: DEFAULT_VAD_PROFILE,
      reason: 'assistant tail ended'
    });
    appState.assistantVadRestoreTimer = null;
  }, delayMs);
}

function markAssistantPlaybackScheduled(scheduledEndAt, reason) {
  const realtime = appState.realtime;
  if (!realtime || !scheduledEndAt) {
    return;
  }
  const playbackUntil = scheduledEndAt + ASSISTANT_PLAYBACK_TAIL_MS;
  enterAssistantPlaybackVadGuard(reason, playbackUntil);
  recordRealtimeDebug('assistant.playback_scheduled', {
    reason,
    remainingMs: getAssistantPlaybackRemainingMs(realtime)
  });
}

function markAssistantPlaybackEnded(reason) {
  const realtime = appState.realtime;
  if (!realtime) {
    return;
  }
  realtime.assistantPlaybackUntil = Math.min(realtime.assistantPlaybackUntil || 0, Date.now());
  restoreVadAfterAssistant(ASSISTANT_PLAYBACK_TAIL_MS);
  recordRealtimeDebug('assistant.playback_idle', reason);
  const visual = appState.geminiReminder;
  if (
    visual?.transport === 'aliyun-realtime'
    && visual.pendingDistributorAnnouncement
    && !getAliUnifiedCurrentMode()
  ) {
    const announcement = visual.pendingDistributorAnnouncement;
    if (sendAliUnifiedSpeech(announcement, 'say')) {
      visual.pendingDistributorAnnouncement = '';
    }
  }
}

function getAssistantPlaybackRemainingMs(realtime = appState.realtime) {
  if (!realtime?.assistantPlaybackUntil) {
    return 0;
  }
  return Math.max(0, realtime.assistantPlaybackUntil - Date.now());
}

function isAssistantPlaybackActive(realtime = appState.realtime) {
  if (!realtime) {
    return false;
  }
  return Boolean(realtime.assistantPlaybackActive || getAssistantPlaybackRemainingMs(realtime) > 0);
}

function getRealtimeResponseSettleRemainingMs(realtime = appState.realtime) {
  if (!realtime?.lastResponseDoneAt) {
    return 0;
  }
  return Math.max(0, REALTIME_RESPONSE_SETTLE_MS - (Date.now() - realtime.lastResponseDoneAt));
}

function isRealtimeResponseSettling(realtime = appState.realtime) {
  return getRealtimeResponseSettleRemainingMs(realtime) > 0;
}

function isManualTranscriptPending(realtime = appState.realtime) {
  if (!realtime?.pendingManualResponseAfterTranscript) {
    return false;
  }
  if (!realtime.pendingManualTranscriptStartedAt) {
    return true;
  }
  if (Date.now() - realtime.pendingManualTranscriptStartedAt <= MANUAL_TRANSCRIPT_WAIT_TIMEOUT_MS) {
    return true;
  }
  realtime.pendingManualResponseAfterTranscript = false;
  realtime.pendingManualTranscriptStartedAt = 0;
  logClientEvent('manual_response.transcript_wait_timeout', {
    timeoutMs: MANUAL_TRANSCRIPT_WAIT_TIMEOUT_MS
  });
  return false;
}

function sendRealtimeContext(options = {}) {
  const realtime = appState.realtime;
  if (!realtime || !realtime.isReady) {
    if (!options.quiet) {
      appendVisionLog('实时慧眼还没有接通，暂时不能发送上下文。');
    }
    return;
  }

  updateRealtimeSession({
    vadProfile: DEFAULT_VAD_PROFILE,
    reason: options.reason || 'context update'
  });

  if (!options.quiet) {
    appendVisionLog('已把当前导航上下文发送给实时模型。你现在可以直接问：我是不是到门口了，站牌是不是这个，入口在哪边。');
  }
}

function updateRealtimeSession(options = {}) {
  const realtime = appState.realtime;
  if (!realtime || !realtime.isReady) {
    return;
  }

  const isManualWebSocket = realtime.mode === 'websocket';
  const vadProfile = options.vadProfile || DEFAULT_VAD_PROFILE;
  const profileKey = isManualWebSocket
    ? 'manual:null'
    : `${vadProfile.type}:${vadProfile.threshold}:${vadProfile.silence_duration_ms}`;
  if (!options.force && realtime.vadProfileKey === profileKey && options.reason !== 'context update') {
    return;
  }
  realtime.vadProfileKey = profileKey;

  const session = {
    modalities: options.modalities || ['text', 'audio'],
    voice: appState.realtime?.voice || appState.realtimeConfig?.voice || 'Tina',
    input_audio_format: 'pcm',
    output_audio_format: 'pcm',
    turn_detection: isManualWebSocket ? null : vadProfile,
    instructions: buildRealtimeInstructions()
  };

  if (realtime.directFunctionContractExperiment) {
    session.tools = [buildAliCheapReminderContractToolDeclaration()];
  } else {
    session.enable_search = true;
    session.search_options = {
      enable_source: true
    };
  }

  if (!isManualWebSocket || isAliRealtimeVideoExperiment()) {
    session.input_audio_transcription = {
      model: 'qwen3-asr-flash-realtime'
    };
  }

  const event = {
    type: 'session.update',
    session
  };
  sendRealtimeEvent(event);
  recordRealtimeDebug('client.session.update', {
    modalities: event.session.modalities,
    voice: event.session.voice,
    inputAudioTranscription: event.session.input_audio_transcription || null,
    turnDetection: event.session.turn_detection,
    enableSearch: event.session.enable_search,
    searchOptions: event.session.search_options,
    tools: event.session.tools?.map((tool) => tool.function?.name || '') || [],
    directFunctionContractExperiment: Boolean(realtime.directFunctionContractExperiment),
    manualMode: isManualWebSocket,
    reason: options.reason || '',
    target: elements.visionQuestion.value
  });
  if (appState.activeReminder && (options.force || options.reason === 'active reminder alert')) {
    logClientEvent('active_reminder.session_update', {
      reason: options.reason || '',
      mode: appState.activeReminder.mode || '',
      pendingMessage: appState.activeReminder.pendingMessage || '',
      pendingTask: appState.activeReminder.pendingTask || '',
      pendingSpeechText: appState.activeReminder.pendingSpeechText || '',
      alertCount: appState.activeReminder.alertCount || 0,
      instructions: session.instructions
    });
  }
}

function isAliCheapDirectFunctionContractExperiment() {
  return Boolean(
    appState.realtime?.directFunctionContractExperiment
    && isAliUnifiedHostSession(appState.activeReminder)
  );
}

function clearAliCheapContractCandidate(reason = '') {
  const reminder = appState.activeReminder;
  if (!reminder) {
    return '';
  }
  const transcript = String(reminder.pendingTaskSetupTranscript || '');
  clearSpeedTaskSetupWatchdog(reminder);
  reminder.pendingTaskSetupTranscript = '';
  reminder.pendingTaskSetupAt = 0;
  reminder.taskNormalizeInFlight = false;
  if (transcript) {
    logClientEvent('ali_cheap_contract.candidate_cleared', {
      reason,
      transcript,
      activeTaskPreserved: Boolean(reminder.taskOverride)
    });
  }
  return transcript;
}

function requestAliCheapFunctionContractDecision(transcript) {
  const reminder = appState.activeReminder;
  const realtime = appState.realtime;
  const rawTranscript = String(transcript || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (
    !rawTranscript
    || !isAliCheapDirectFunctionContractExperiment()
    || !reminder
    || !realtime?.isReady
  ) {
    return false;
  }
  if (
    reminder.pendingMessage
    || reminder.awaitingResponse
    || realtime.responseInProgress
    || isAssistantPlaybackActive(realtime)
    || isRealtimeResponseSettling(realtime)
  ) {
    cancelSpeedTaskSetupResponse('new cheap contract candidate preempts previous response');
  }
  realtime.aliCheapContractCandidateSeq = (realtime.aliCheapContractCandidateSeq || 0) + 1;
  realtime.pendingAliCheapToolResult = null;
  realtime.aliCheapContractConfirmationInFlight = false;
  realtime.aliCheapContractConfirmation = null;
  reminder.pendingTaskSetupTranscript = rawTranscript;
  reminder.pendingTaskSetupAt = Date.now();
  reminder.taskNormalizeInFlight = true;
  armSpeedTaskSetupWatchdog(reminder);
  logClientEvent('ali_cheap_contract.decision_requested', {
    transcript: rawTranscript,
    activeTaskPreserved: Boolean(reminder.taskOverride),
    activeMode: getAliUnifiedCurrentMode()
  });
  sendVideoFrame({ force: true });
  const requested = requestRealtimeManualResponse('ali_cheap_function_contract_decision');
  if (!requested) {
    clearAliCheapContractCandidate('realtime_response_unavailable');
  }
  return requested;
}

function handleAliCheapReminderContractToolCall(message) {
  if (!isAliCheapDirectFunctionContractExperiment()) {
    return false;
  }
  const reminder = appState.activeReminder;
  const visual = appState.geminiReminder;
  const realtime = appState.realtime;
  if (!reminder || !visual || !realtime) {
    return false;
  }
  if (realtime.pendingAliCheapToolResult) {
    logClientEvent('ali_cheap_contract.duplicate_tool_event_ignored', {
      name: message.name || '',
      callId: message.call_id || ''
    });
    return true;
  }

  const callId = String(message.call_id || '');
  const toolName = String(message.name || '');
  const freshInstruction = String(reminder.pendingTaskSetupTranscript || '')
    .replace(/\s+/g, ' ')
    .trim();
  let args = null;
  let error = '';
  try {
    args = JSON.parse(String(message.arguments || '{}'));
  } catch {
    error = 'invalid_json_arguments';
  }
  if (!callId) {
    error = error || 'missing_call_id';
  } else if (toolName !== GEMINI_REMINDER_CONTRACT_TOOL_NAME) {
    error = error || 'unknown_function';
  } else if (!freshInstruction) {
    error = error || 'missing_fresh_user_instruction';
  }

  const validated = error ? null : validateGeminiReminderFunctionContract(args);
  if (!error && !validated?.ok) {
    error = validated?.error || 'invalid_structured_contract';
  }

  if (error) {
    realtime.pendingAliCheapToolResult = {
      callId,
      accepted: false,
      output: JSON.stringify({
        result: 'rejected',
        error,
        next: freshInstruction
          ? '重新提交一个完整且字段合法的合同；不要先说确认句。'
          : '本轮不是待签合同任务，请直接回答用户问题，不要建立任务。'
      })
    };
    logClientEvent('ali_cheap_contract.function_contract_rejected', {
      callId,
      error,
      transcript: freshInstruction,
      args: args || {}
    });
    return true;
  }

  const contract = validated.contract;
  clearAliUnifiedVisualExecution('ali_cheap_function_contract_accepted');
  clearActiveReminderTaskForNewInstruction(reminder, 'ali_cheap_function_contract_accepted');
  reminder.mode = 'ali_experiment';
  reminder.taskOverride = validated.taskText;
  reminder.taskNormalizeInFlight = true;
  visual.unifiedActiveMode = 'active_reminder';
  clearSpeedTaskSetupWatchdog(reminder);
  reminder.pendingTaskSetupTranscript = '';
  reminder.pendingTaskSetupAt = 0;
  realtime.aliCheapContractConfirmationInFlight = true;
  realtime.aliCheapContractConfirmation = {
    callId,
    transcript: freshInstruction,
    contractType: contract.contractType,
    target: contract.target,
    condition: contract.condition,
    speakText: contract.speakText
  };
  realtime.pendingAliCheapToolResult = {
    callId,
    accepted: true,
    output: JSON.stringify({
      result: 'accepted',
      taskActive: true,
      contract: {
        contractType: contract.contractType,
        filterSubject: contract.filterSubject,
        yesCondition: contract.yesCondition,
        yesSpeech: contract.yesSpeech
      },
      next: '合同已接收。现在只用一句自然中文确认以后何时提醒；不要判断当前画面，不要提前说提醒结果。'
    })
  };
  setActiveReminderStatus(`阿里便宜声音实验合同已建立：${contract.condition}。`);
  logClientEvent('ali_cheap_contract.function_contract_accepted', {
    callId,
    transcript: freshInstruction,
    activeTaskSeq: reminder.activeTaskSeq || 0,
    ...contract,
    task: validated.taskText
  });
  return true;
}

function recoverAliReminderContractAfterMissingTool(transcript) {
  const reminder = appState.activeReminder;
  const realtime = appState.realtime;
  if (!isAliCheapDirectFunctionContractExperiment() || !reminder || !realtime
      || !hasGeminiActiveReminderIntent(transcript, '')) return false;
  setActiveReminderStatus('正在核实并补建提醒合同，合同接受后再确认。');
  // The user's request is the evidence. A premature model answer cannot veto it.
  void startSpeedReminderTaskNormalizeFromConfirmation(transcript, '', {
    confirmOnAccepted: true,
    expectedTaskSeq: reminder.activeTaskSeq,
    expectedCandidateSeq: realtime.aliCheapContractCandidateSeq
  });
  return true;
}

function continueAliCheapToolCallAfterResponseDone() {
  const realtime = appState.realtime;
  const pending = realtime?.pendingAliCheapToolResult;
  if (!realtime || !pending) {
    return false;
  }
  realtime.pendingAliCheapToolResult = null;
  updateRealtimeSession({
    reason: pending.accepted
      ? 'ali cheap contract accepted; request confirmation'
      : 'ali cheap contract rejected; request correction',
    force: true
  });
  sendRealtimeEvent({
    type: 'conversation.item.create',
    item: {
      type: 'function_call_output',
      call_id: pending.callId,
      output: pending.output
    }
  });
  appState.latestAssistantText = '';
  realtime.responseInProgress = true;
  if (appState.geminiReminder?.transport === 'aliyun-realtime') {
    appState.geminiReminder.turnInProgress = true;
    appState.geminiReminder.assistantResponseActive = true;
  }
  sendRealtimeEvent({
    type: 'response.create',
    response: { modalities: ['text', 'audio'] }
  });
  logClientEvent('ali_cheap_contract.function_output_sent', {
    callId: pending.callId,
    accepted: pending.accepted
  });
  return true;
}

async function handleRealtimeServerEvent(message) {
  recordRealtimeDebug('server.event', summarizeRealtimeEvent(message));
  if (message.type === 'proxy.need_key') {
    appendVisionLog(message.message || '请先填写并保存百炼 Key，然后重新开始实时慧眼。');
    return;
  }

  if (message.type === 'proxy.ready') {
    appState.realtime.isReady = true;
    if (appState.geminiReminder?.transport === 'aliyun-realtime') {
      appState.geminiReminder.isReady = true;
      setActiveReminderStatus('纯阿里实时慧眼已启动，正在静默等待任务。');
    }
    sendRealtimeContext({ quiet: true });
    await activateWebSocketStreams();
    appendVisionLog(`百炼实时模型已连接：${message.model}。你可以直接说话。`);
    return;
  }

  if (message.type === 'proxy.error') {
    appendVisionLog(message.message || '实时代理返回错误。');
    abandonSpeedTaskSetup(appState.activeReminder, 'realtime_proxy_error');
    return;
  }

  if (message.type === 'proxy.closed') {
    appendVisionLog(`百炼实时连接关闭：${message.code || ''} ${message.reason || ''}`.trim());
    abandonSpeedTaskSetup(appState.activeReminder, 'realtime_proxy_closed');
    return;
  }

  if (message.type === 'response.function_call_arguments.done') {
    if (handleAliCheapReminderContractToolCall(message)) {
      return;
    }
  }

  if (message.type === 'response.audio.delta' && message.delta && appState.realtime?.player) {
    if (appState.realtime.suppressAssistantOutputUntilManualCommit) {
      if (!appState.realtime.interruptedAssistantOutputDiscardLogged) {
        appState.realtime.interruptedAssistantOutputDiscardLogged = true;
        logClientEvent('assistant_interrupted_output_discarded', {
          type: message.type,
          nativeIOS: Boolean(window.__ACCESSIBLE_VISION_NATIVE_IOS__)
        });
      }
      return;
    }
    appState.realtime.responseInProgress = true;
    const scheduledEndAt = appState.realtime.player.enqueue(message.delta);
    if (
      scheduledEndAt
      && usesReliableReminderDelivery(appState.activeReminder)
      && appState.activeReminder?.pendingMessage === 'speed_trigger'
    ) {
      appState.activeReminder.pendingAlertHadAudio = true;
    }
    if (!scheduledEndAt) {
      muteMicrophoneWhileAssistantSpeaks('assistant audio delta');
    }
    return;
  }

  if (message.type === 'response.audio_transcript.delta' || message.type === 'response.text.delta') {
    if (appState.realtime?.suppressAssistantOutputUntilManualCommit) {
      return;
    }
    if (appState.activeReminder?.mode === 'rtc' && appState.activeReminder.rtcPollInProgress) {
      appState.activeReminder.rtcPollText += message.delta || '';
      recordRealtimeDebug('rtc_active_reminder.poll_partial_text', appState.activeReminder.rtcPollText);
      return;
    }
    if (appState.realtime) {
      appState.realtime.responseInProgress = true;
    }
    muteMicrophoneWhileAssistantSpeaks(message.type);
    appState.latestAssistantText += message.delta || '';
    appState.lastVisionText = appState.latestAssistantText;
    recordRealtimeDebug('assistant.partial_text', appState.latestAssistantText);
    return;
  }

  if (message.type === 'response.audio_transcript.done' || message.type === 'response.text.done') {
    if (appState.realtime?.suppressAssistantOutputUntilManualCommit) {
      return;
    }
    const text = message.transcript || message.text || appState.latestAssistantText;
    if (appState.activeReminder?.mode === 'rtc' && appState.activeReminder.rtcPollInProgress) {
      if (text) {
        appState.activeReminder.rtcPollText = text;
      }
      recordRealtimeDebug('rtc_active_reminder.poll_text_done', text || '');
      return;
    }
    if (text) {
      appState.lastVisionText = text;
      updateVisionOutput(`模型：${text}`);
      if (
        usesReliableReminderDelivery(appState.activeReminder)
        && appState.activeReminder?.pendingMessage === 'speed_trigger'
      ) {
        appState.activeReminder.pendingAlertHadText = true;
      }
    }
    logClientEvent('realtime.assistant_text_done', {
      text: text || '',
      activeReminderMode: appState.activeReminder?.mode || '',
      pendingMessage: appState.activeReminder?.pendingMessage || '',
      pendingTask: appState.activeReminder?.pendingTask || '',
      awaitingResponse: Boolean(appState.activeReminder?.awaitingResponse),
      alertCount: appState.activeReminder?.alertCount || 0
    });
    if (
      text
      && isSpeedLogicMode(appState.activeReminder?.mode)
      && !isAliCheapDirectFunctionContractExperiment()
      && appState.activeReminder.pendingTaskSetupTranscript
    ) {
      const inputTranscript = appState.activeReminder.pendingTaskSetupTranscript;
      const updated = updateSpeedReminderTaskFromConfirmation(inputTranscript, text);
      clearSpeedTaskSetupWatchdog(appState.activeReminder);
      logClientEvent('active_reminder.speed_task_interpret_done', {
        mode: appState.activeReminder.mode || '',
        inputTranscript,
        outputTranscript: text,
        updated
      });
      appState.activeReminder.pendingTaskSetupTranscript = '';
      appState.activeReminder.pendingTaskSetupAt = 0;
    }
    appState.latestAssistantText = '';
    releaseMicrophoneAfterAssistant();
    return;
  }

  if (message.type === 'response.done' || message.type === 'response.audio.done') {
    if (message.type === 'response.done') {
      appState.realtime?.player?.logModelDone((appState.latestAssistantText || '').length);
    }
    const aliUnifiedVisual = appState.geminiReminder?.transport === 'aliyun-realtime'
      ? appState.geminiReminder
      : null;
    const completingAliUnifiedOneShotQuestion = Boolean(
      message.type === 'response.done'
      && aliUnifiedVisual?.unifiedOneShotQuestionInFlight
    );
    logClientEvent('realtime.response_done', {
      text: appState.latestAssistantText || '',
      activeReminderMode: appState.activeReminder?.mode || '',
      pendingMessage: appState.activeReminder?.pendingMessage || '',
      pendingTask: appState.activeReminder?.pendingTask || '',
      awaitingResponse: Boolean(appState.activeReminder?.awaitingResponse),
      alertCount: appState.activeReminder?.alertCount || 0
    });
    if (appState.realtime) {
      appState.realtime.responseInProgress = false;
      appState.realtime.lastResponseDoneAt = Date.now();
    }
    if (appState.geminiReminder?.transport === 'aliyun-realtime') {
      appState.geminiReminder.turnInProgress = false;
      appState.geminiReminder.assistantResponseActive = false;
    }
    if (message.type === 'response.done' && continueAliCheapToolCallAfterResponseDone()) {
      return;
    }
    if (
      message.type === 'response.done'
      && isAliCheapDirectFunctionContractExperiment()
      && appState.activeReminder?.pendingTaskSetupTranscript
    ) {
      const transcript = clearAliCheapContractCandidate('model_answered_without_contract');
      const recoveryRequested = recoverAliReminderContractAfterMissingTool(transcript);
      if (!recoveryRequested) {
        setActiveReminderStatus(appState.activeReminder?.taskOverride
          ? '本轮按普通问答处理，原主动提醒继续运行。'
          : '本轮按普通问答处理，等待新的提醒任务。');
      }
      logClientEvent(recoveryRequested ? 'ali_cheap_contract.no_tool_recovery_requested' : 'ali_cheap_contract.no_tool_ordinary_answer', {
        transcript,
        activeTaskPreserved: Boolean(appState.activeReminder?.taskOverride)
      });
    }
    if (
      message.type === 'response.done'
      && appState.realtime?.aliCheapContractConfirmationInFlight
    ) {
      const confirmation = appState.realtime.aliCheapContractConfirmation;
      appState.realtime.aliCheapContractConfirmationInFlight = false;
      appState.realtime.aliCheapContractConfirmation = null;
      if (appState.activeReminder) {
        appState.activeReminder.taskNormalizeInFlight = false;
      }
      logClientEvent('ali_cheap_contract.confirmation_completed', {
        callId: confirmation?.callId || '',
        transcript: confirmation?.transcript || '',
        condition: confirmation?.condition || '',
        text: appState.latestAssistantText || ''
      });
    }
    if (completingAliUnifiedOneShotQuestion) {
      clearAliUnifiedOneShotQuestion(aliUnifiedVisual, 'response_completed');
      updateRealtimeSession({
        reason: 'ali unified one shot reset',
        force: true
      });
      logClientEvent('ali_unified.one_shot_question_completed', {
        text: appState.latestAssistantText || ''
      });
    }
    if (message.type === 'response.done' && appState.activeReminder?.pendingTaskSetupTranscript) {
      abandonSpeedTaskSetup(appState.activeReminder, 'response_completed_without_contract_confirmation');
    }
    if (appState.activeReminder?.awaitingResponse) {
      if (appState.activeReminder.mode === 'rtc' && appState.activeReminder.rtcPollInProgress) {
        finalizeRtcActiveReminderPoll();
        releaseMicrophoneAfterAssistant();
        return;
      }
      logClientEvent('active_reminder.rtc_done', {
        mode: appState.realtime?.mode || '',
        alertCount: appState.activeReminder.alertCount
      });
      const completedReminderMessage = appState.activeReminder.pendingMessage || '';
      let completedSpeedTask = '';
      if (
        isSpeedLogicMode(appState.activeReminder.mode)
        && appState.activeReminder.pendingMessage === 'speed_trigger'
        && appState.activeReminder.speedPendingAlertTaskKey
        && !appState.activeReminder.speedResponseCanceled
      ) {
        const reliableDelivery = usesReliableReminderDelivery(appState.activeReminder);
        const delivered = !reliableDelivery || appState.activeReminder.pendingAlertHadAudio;
        if (delivered) {
          appState.activeReminder.speedAlertedTaskKey = appState.activeReminder.speedPendingAlertTaskKey;
          if (reliableDelivery && shouldDedupeActiveReminderOccurrences(appState.activeReminder.pendingTask || '')) {
            appState.activeReminder.alertedResultKeys = [
              ...(appState.activeReminder.alertedResultKeys || []),
              appState.activeReminder.speedPendingAlertTaskKey
            ].slice(-20);
            commitActiveReminderStateDelivery(
              appState.activeReminder,
              appState.activeReminder.speedPendingAlertState
            );
          }
          logClientEvent('active_reminder.speed_scene_marked_delivered', {
            alertCount: appState.activeReminder.alertCount,
            task: appState.activeReminder.speedAlertedTaskKey,
            hadAudio: Boolean(appState.activeReminder.pendingAlertHadAudio),
            hadText: Boolean(appState.activeReminder.pendingAlertHadText)
          });
          if (shouldCompleteActiveReminderTaskAfterDelivery(appState.activeReminder.pendingTask || '')) {
            completedSpeedTask = appState.activeReminder.pendingTask || '';
          }
        } else {
          rollbackActiveReminderStateDelivery(
            appState.activeReminder,
            appState.activeReminder.speedPendingAlertState,
            appState.activeReminder.speedPendingAlertSnapshot
          );
          logClientEvent('active_reminder.speed_alert_not_delivered', {
            alertCount: appState.activeReminder.alertCount,
            task: appState.activeReminder.speedPendingAlertTaskKey,
            reason: 'no_audio_received'
          });
        }
      }
      if (
        appState.activeReminder.mode === 'rtc'
        && appState.activeReminder.pendingMessage
        && appState.activeReminder.rtcPendingAlertTaskKey
        && !appState.activeReminder.rtcResponseCanceled
      ) {
        appState.activeReminder.rtcAlertedTaskKey = appState.activeReminder.rtcPendingAlertTaskKey;
        logClientEvent('rtc_active_reminder.scene_marked_delivered', {
          alertCount: appState.activeReminder.alertCount,
          task: appState.activeReminder.rtcAlertedTaskKey
        });
      }
      if (appState.activeReminder.mode === 'rtc') {
        clearActiveReminderPendingResponse();
      } else {
        clearActiveReminderPendingResponse();
      }
      if (completedSpeedTask) {
        completeActiveReminderTask(appState.activeReminder, completedSpeedTask, 'audio_delivered');
      }
      const visual = appState.geminiReminder;
      if (
        visual?.transport === 'aliyun-realtime'
        && visual.returnToUnifiedAfterAliSpeech
      ) {
        const returnReason = visual.returnToUnifiedAfterAliSpeech;
        visual.returnToUnifiedAfterAliSpeech = '';
        returnAliUnifiedToDistributor(returnReason);
        if (visual.visualAssistantBaseExperiment) {
          setActiveReminderStatus('找东西已完成，视觉助手底座继续运行。');
        } else {
          setActiveReminderStatus('找东西已完成并返回任务分发。');
          visual.pendingDistributorAnnouncement = '找东西已完成，已返回任务选择，可以说新任务。';
          if (sendAliUnifiedSpeech(visual.pendingDistributorAnnouncement, 'say')) {
            visual.pendingDistributorAnnouncement = '';
          }
        }
      }
      if (completedReminderMessage === 'speed_task_confirm') {
        clearRealtimeManualInputBuffer('speed_task_confirmation_done');
      }
    } else {
      maybeRequestActiveReminderResponse();
    }
    releaseMicrophoneAfterAssistant();
    return;
  }

  if (message.type === 'conversation.item.input_audio_transcription.delta') {
    const delta = message.delta || message.text || '';
    if (delta) {
      appState.latestUserTranscript += delta;
    }
    return;
  }

  if (message.type === 'conversation.item.input_audio_transcription.completed') {
    const transcript = message.transcript || appState.latestUserTranscript;
    let activeReminderConsumedTranscript = false;
    if (transcript) {
      appendVisionLog(`你说：${transcript}`);
      activeReminderConsumedTranscript = updateActiveReminderTaskFromTranscript(transcript);
    }
    appState.latestUserTranscript = '';
    if (appState.realtime?.pendingManualResponseAfterTranscript) {
      appState.realtime.pendingManualResponseAfterTranscript = false;
      appState.realtime.pendingManualTranscriptStartedAt = 0;
      if (!activeReminderConsumedTranscript) {
        if (shouldRequestManualResponseFromTranscript(transcript)) {
          requestRealtimeManualResponse('transcript_non_task');
        } else {
          logClientEvent('manual_response.suppressed_for_unclear_transcript', {
            transcript
          });
        }
      } else {
        logClientEvent('active_reminder.manual_response_suppressed_for_task', {
          transcript
        });
      }
    }
    return;
  }

  if (message.type === 'input_audio_buffer.speech_started') {
    if (isAssistantPlaybackActive(appState.realtime)) {
      logClientEvent('active_reminder.server_speech_ignored_during_reminder', {
        mode: appState.activeReminder?.mode || '',
        pendingMessage: appState.activeReminder?.pendingMessage || '',
        awaitingResponse: Boolean(appState.activeReminder?.awaitingResponse),
        remainingMs: getAssistantPlaybackRemainingMs(appState.realtime)
      });
      return;
    }
    if (appState.realtime?.player) {
      appState.realtime.player.reset('server_speech_started');
    }
    if (appState.realtime) {
      appState.realtime.responseInProgress = false;
    }
    if (appState.activeReminder?.pendingMessage || appState.activeReminder?.awaitingResponse) {
      logClientEvent('active_reminder.user_speech_cancel', {
        mode: appState.realtime?.mode || '',
        awaitingResponse: Boolean(appState.activeReminder?.awaitingResponse)
      });
    }
    if (appState.activeReminder?.mode === 'rtc') {
      appState.activeReminder.suspendUntil = Date.now() + RTC_ACTIVE_REMINDER_USER_SPEECH_PAUSE_MS;
      logClientEvent('rtc_active_reminder.suspend_for_server_speech', {
        pauseMs: RTC_ACTIVE_REMINDER_USER_SPEECH_PAUSE_MS
      });
    }
    clearActiveReminderPendingResponse();
    appendVisionLog('检测到你开始说话。');
    return;
  }

  if (message.type === 'error') {
    appendVisionLog(`模型错误：${message.error?.message || JSON.stringify(message.error || message)}`);
  }
}

function sendRealtimeEvent(event) {
  const realtime = appState.realtime;
  if (!realtime) {
    return;
  }

  if (!event.event_id && event.type !== 'proxy.auth') {
    event.event_id = `event_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
  const text = JSON.stringify(event);
  if (realtime.mode === 'websocket' && realtime.socket?.readyState === WebSocket.OPEN) {
    realtime.socket.send(text);
  } else if (realtime.mode === 'webrtc' && realtime.eventChannel?.readyState === 'open') {
    realtime.eventChannel.send(text);
  }
}

function commitRealtimeManualBuffer(options = {}) {
  const realtime = appState.realtime;
  if (!realtime || realtime.mode !== 'websocket' || !realtime.isReady) {
    appendVisionLog('Manual 提交失败：请先选择 WebSocket Manual 并启动实时慧眼。');
    return;
  }
  const now = Date.now();
  if (isManualTranscriptPending(realtime)) {
    recordRealtimeDebug('client.manual.commit_suppressed', {
      reason: 'waiting_transcript',
      trigger: options.trigger || 'button'
    });
    return;
  }
  if (now - (realtime.lastManualCommitAt || 0) < MANUAL_COMMIT_MIN_GAP_MS) {
    recordRealtimeDebug('client.manual.commit_suppressed', {
      reason: 'commit_gap',
      trigger: options.trigger || 'button',
      elapsedMs: now - (realtime.lastManualCommitAt || 0)
    });
    return;
  }
  if (realtime.responseInProgress || isRealtimeResponseSettling(realtime)) {
    recordRealtimeDebug('client.manual.commit_suppressed', {
      reason: realtime.responseInProgress ? 'response_in_progress' : 'response_settling',
      trigger: options.trigger || 'button',
      settleRemainingMs: getRealtimeResponseSettleRemainingMs(realtime)
    });
    return;
  }

  flushPendingAudio();

  const hadAudioForThisCommit = appState.sentFirstAudio || appState.pendingAudioBytes > 0;
  if (!hadAudioForThisCommit) {
    appendVisionLog('Manual 提交提醒：目前还没有检测到已发送的麦克风音频分片，可能会被百炼判定为空音频缓冲区。请确认麦克风权限和环境声。');
    return;
  }

  realtime.manualResponseInstruction = Boolean(options.requestResponse);
  realtime.localVadSpeaking = false;
  realtime.localVadStartedAt = 0;
  realtime.localVadLastVoiceAt = 0;
  realtime.localVadInterrupting = false;
  realtime.localVadPlaybackHighFrames = 0;
  if (realtime.localVadAutoCommitTimer) {
    clearTimeout(realtime.localVadAutoCommitTimer);
    realtime.localVadAutoCommitTimer = null;
  }
  const deferResponseUntilTranscript = Boolean(options.deferResponseUntilTranscript);
  const transcriptOnlySpeedCommit = Boolean(deferResponseUntilTranscript && isSpeedLogicMode(appState.activeReminder?.mode));
  if (!transcriptOnlySpeedCommit) {
    updateRealtimeSession({
      reason: options.requestResponse && !deferResponseUntilTranscript ? 'manual response request' : 'manual context commit',
      force: true
    });
  }
  if (isAliRealtimeVideoExperiment()) sendVideoFrame({ force: true });
  sendRealtimeEvent({ type: 'input_audio_buffer.commit' });
  realtime.suppressAssistantOutputUntilManualCommit = false;
  realtime.interruptedAssistantOutputDiscardLogged = false;
  realtime.lastManualCommitAt = now;
  recordRealtimeDebug('client.manual.commit', {
    requestResponse: Boolean(options.requestResponse),
    trigger: options.trigger || 'button',
    mode: transcriptOnlySpeedCommit ? 'audio_transcript_commit' : 'audio_image_commit',
    videoFramesDrawn: appState.videoFrameCount,
    sentAudioThisTurn: hadAudioForThisCommit,
    transcriptOnlySpeedCommit
  });
  appState.sentFirstAudio = false;

  if (options.requestResponse && deferResponseUntilTranscript) {
    realtime.pendingManualResponseAfterTranscript = true;
    realtime.pendingManualTranscriptStartedAt = Date.now();
    appendVisionLog('已提交语音，等待识别是否为主动提醒任务。');
  } else if (options.requestResponse) {
    requestRealtimeManualResponse(options.trigger || 'manual');
    appendVisionLog('已按 Manual 模式提交真实麦克风音频和图像缓冲区，并请求模型根据刚才画面回答。');
  } else if (!options.quiet) {
    appendVisionLog('已按 Manual 模式提交真实麦克风音频和图像缓冲区，暂不请求模型回答。');
  }
}

function requestRealtimeManualResponse(trigger = 'manual') {
  const realtime = appState.realtime;
  if (!realtime || realtime.mode !== 'websocket' || !realtime.isReady) {
    return false;
  }
  if (appState.activeReminder?.pendingMessage || appState.activeReminder?.awaitingResponse) {
    logClientEvent('manual_response.suppressed_for_active_reminder', {
      trigger,
      pendingMessage: appState.activeReminder.pendingMessage || '',
      awaitingResponse: Boolean(appState.activeReminder.awaitingResponse)
    });
    return false;
  }
  if (realtime.responseInProgress || isRealtimeResponseSettling(realtime)) {
    logClientEvent('manual_response.suppressed_for_busy_realtime', {
      trigger,
      responseInProgress: Boolean(realtime.responseInProgress),
      settleRemainingMs: getRealtimeResponseSettleRemainingMs(realtime)
    });
    return false;
  }
  updateRealtimeSession({
    reason: 'manual response request',
    force: true
  });
  appState.latestAssistantText = '';
  realtime.responseInProgress = true;
  sendRealtimeEvent({
    type: 'response.create'
  });
  logClientEvent('manual_response.create', { trigger });
  return true;
}

async function requestSpeedVisionAnswer(question) {
  const reminder = appState.activeReminder;
  if (!reminder || !isSpeedLogicMode(reminder.mode)) {
    requestRealtimeManualResponse('speed_visual_fallback');
    return;
  }
  if (reminder.pendingMessage || reminder.awaitingResponse) {
    logClientEvent('speed_visual_answer.suppressed_for_pending_response', {
      question,
      pendingMessage: reminder.pendingMessage || '',
      awaitingResponse: Boolean(reminder.awaitingResponse)
    });
    return;
  }
  try {
    setActiveReminderStatus('极速视觉追问：正在让 3.6 看当前画面。');
    reminder.pendingMessage = 'speed_visual_lookup';
    reminder.pendingTask = question;
    reminder.pendingSpeechText = '';
    const imageDataUrl = captureReminderFrame({ maxWidth: 384, quality: 0.45 });
    const result = await apiPost('/api/speed-vision-answer', {
      imageDataUrl,
      question
    });
    const answer = String(result.spokenText || result.rawText || '').replace(/\s+/g, ' ').trim();
    if (!answer) {
      setActiveReminderStatus('极速视觉追问：3.6 没有返回可播报答案。');
      return;
    }
    appState.lastVisionText = answer;
    updateVisionOutput(`模型：${answer}`);
    reminder.pendingMessage = 'speed_visual_answer';
    reminder.pendingTask = question;
    reminder.pendingSpeechText = answer;
    reminder.awaitingResponse = false;
    logClientEvent('speed_visual_answer.queued', {
      question,
      answer,
      latencyMs: result.latencyMs ?? null
    });
    maybeRequestActiveReminderResponse();
  } catch (error) {
    if (reminder.pendingMessage === 'speed_visual_lookup') {
      reminder.pendingMessage = '';
      reminder.pendingTask = '';
      reminder.pendingSpeechText = '';
    }
    logClientEvent('speed_visual_answer.failed', {
      question,
      error: error.message
    });
    setActiveReminderStatus(`极速视觉追问失败：${error.message}`);
  }
}

function shouldRequestManualResponseFromTranscript(transcript) {
  const text = String(transcript || '').replace(/\s+/g, '');
  if (!text) {
    return false;
  }
  if (isLikelyReminderEchoTranscript(text)) {
    return false;
  }
  if (/^(好|好的|嗯|啊|呃|哦|行|可以|知道了|收到)[。！？!?]*$/.test(text)) {
    return false;
  }
  if (/^(.{1,4})[，,。.\s]*(\1){1,3}[。！？!?]*$/.test(text)) {
    return false;
  }
  if (/(再看|看一下|看看|帮我看|这是什么|是什么|谁|哪里|在哪|哪|哪儿|为何|为什么|为啥|如何|左边|右边|前面|后面|上面|下面|有没有|是不是|能不能|可不可以|会不会|要不要|需不需要|应该|吗|呢|怎么|怎样|多少|什么|几|今天|明天|昨天|星期|周几|几点|几号|日期|时间|现在几点|当前时间)/.test(text)) {
    return true;
  }
  if (/(帮我|告诉我|跟我说|说一下|讲一下|解释|描述|读一下|念一下|确认一下|判断一下|回答)/.test(text)) {
    return true;
  }
  return text.length >= 6 && /[？?]$/.test(String(transcript || '').trim());
}

function sendRealtimeTextItem(text) {
  sendRealtimeEvent({
    type: 'conversation.item.create',
    item: {
      type: 'message',
      role: 'user',
      content: [
        {
          type: 'input_text',
          text
        }
      ]
    }
  });
}

function handleManualAudioFrame(frame, inputRate) {
  if (!frame || frame.length === 0) {
    return;
  }
  const decision = updateManualLocalVad(frame);
  if (!decision?.allow) {
    if (decision?.reason === 'assistant_playback') {
      noteAssistantEchoAudioDropped(decision.rms);
    }
    return;
  }
  const frames = decision.frames?.length ? decision.frames : [frame];
  for (const sourceFrame of frames) {
    const downsampled = downsampleFloat32(sourceFrame, inputRate, AUDIO_INPUT_RATE);
    const pcm = floatToPcm16(downsampled);
    queueAudioChunk(pcm);
  }
}

function updateManualLocalVad(frame) {
  const realtime = appState.realtime;
  if (!realtime || realtime.mode !== 'websocket' || !realtime.isReady) {
    return { allow: true, frames: [frame], rms: 0 };
  }
  if (appState.assistantMicMuteTimer) {
    return { allow: false, frames: [], rms: 0, reason: 'microphone_muted' };
  }

  let sumSquares = 0;
  for (let i = 0; i < frame.length; i += 1) {
    sumSquares += frame[i] * frame[i];
  }
  const rms = Math.sqrt(sumSquares / frame.length);
  const now = Date.now();
  if (realtime.localVadSuppressUntil && now < realtime.localVadSuppressUntil) {
    realtime.localVadSpeaking = false;
    realtime.localVadStartedAt = 0;
    realtime.localVadLastVoiceAt = 0;
  realtime.localVadInterrupting = false;
  realtime.localVadPlaybackHighFrames = 0;
  realtime.localVadPlaybackCandidateFrames = [];
    realtime.localVadPlaybackCandidateFrames = [];
    return { allow: false, frames: [], rms, reason: 'vad_suppressed' };
  }
  if (realtime.localVadSuppressUntil && now >= realtime.localVadSuppressUntil) {
    realtime.localVadSuppressUntil = 0;
  }
  const assistantPlaybackActive = isAssistantPlaybackActive(realtime);
  if (assistantPlaybackActive) {
    realtime.localVadSpeaking = false;
    realtime.localVadStartedAt = 0;
    realtime.localVadLastVoiceAt = 0;
    realtime.localVadInterrupting = false;
    realtime.localVadPlaybackHighFrames = 0;
    realtime.localVadPlaybackCandidateFrames = [];
    return { allow: false, frames: [], rms, reason: 'assistant_playback' };
  }
  holdContinuousNarrationForDetectedUserSpeech(
    appState.geminiReminder,
    rms,
    MANUAL_LOCAL_VAD_START_RMS
  );
  const useRtcVad = appState.activeReminder?.mode === 'rtc';
  const startRms = useRtcVad ? RTC_MANUAL_LOCAL_VAD_START_RMS : MANUAL_LOCAL_VAD_START_RMS;
  const endRms = useRtcVad ? RTC_MANUAL_LOCAL_VAD_END_RMS : MANUAL_LOCAL_VAD_END_RMS;
  const interruptStartRms = useRtcVad ? RTC_MANUAL_LOCAL_VAD_INTERRUPT_START_RMS : MANUAL_LOCAL_VAD_INTERRUPT_START_RMS;
  const interruptFrames = useRtcVad ? RTC_MANUAL_LOCAL_VAD_INTERRUPT_FRAMES : MANUAL_LOCAL_VAD_INTERRUPT_FRAMES;
  const endMs = useRtcVad ? RTC_MANUAL_LOCAL_VAD_END_MS : MANUAL_LOCAL_VAD_END_MS;
  const minAudioMs = useRtcVad ? RTC_MANUAL_LOCAL_VAD_MIN_AUDIO_MS : MANUAL_LOCAL_VAD_MIN_AUDIO_MS;
  const startThreshold = assistantPlaybackActive
    ? interruptStartRms
    : startRms;
  if (!realtime.localVadSpeaking && assistantPlaybackActive) {
    if (rms < startThreshold) {
      realtime.localVadPlaybackHighFrames = 0;
      realtime.localVadPlaybackCandidateFrames = [];
      return { allow: false, frames: [], rms, reason: 'assistant_playback' };
    }
    realtime.localVadPlaybackHighFrames += 1;
    realtime.localVadPlaybackCandidateFrames.push(new Float32Array(frame));
    if (realtime.localVadPlaybackCandidateFrames.length > interruptFrames) {
      realtime.localVadPlaybackCandidateFrames.shift();
    }
    if (realtime.localVadPlaybackHighFrames < interruptFrames) {
      return { allow: false, frames: [], rms, reason: 'assistant_playback' };
    }
  }

  if (!realtime.localVadSpeaking && rms >= startThreshold) {
    const bargeInFrames = assistantPlaybackActive
      ? realtime.localVadPlaybackCandidateFrames.slice()
      : [frame];
    realtime.localVadSpeaking = true;
    realtime.localVadStartedAt = now;
    realtime.localVadLastVoiceAt = now;
    realtime.localVadInterrupting = Boolean(assistantPlaybackActive);
    if (appState.activeReminder?.mode === 'rtc') {
      appState.activeReminder.suspendUntil = now + RTC_ACTIVE_REMINDER_USER_SPEECH_PAUSE_MS;
      logClientEvent('rtc_active_reminder.suspend_for_user_speech', {
        pauseMs: RTC_ACTIVE_REMINDER_USER_SPEECH_PAUSE_MS,
        interrupting: realtime.localVadInterrupting
      });
    }
    if (realtime.localVadInterrupting) {
      clearRealtimeManualInputBuffer('assistant_barge_in_started');
      if (window.speechSynthesis?.speaking) {
        window.speechSynthesis.cancel();
      }
      if (realtime.player) {
        realtime.player.reset('local_barge_in');
      }
      if (realtime.responseInProgress) {
        sendRealtimeEvent({ type: 'response.cancel' });
        realtime.responseInProgress = false;
      }
      if (isSpeedLogicMode(appState.activeReminder?.mode) && appState.activeReminder.pendingMessage) {
        appState.activeReminder.speedResponseCanceled = true;
      }
      if (appState.activeReminder?.mode === 'rtc' && appState.activeReminder.pendingMessage) {
        appState.activeReminder.rtcResponseCanceled = true;
      }
      realtime.assistantPlaybackActive = false;
      realtime.assistantPlaybackUntil = 0;
      realtime.localVadPlaybackHighFrames = 0;
      realtime.localVadPlaybackCandidateFrames = [];
      realtime.suppressAssistantOutputUntilManualCommit = true;
      realtime.interruptedAssistantOutputDiscardLogged = false;
      appState.latestAssistantText = '';
      recordRealtimeDebug('manual.local_vad.interrupt_started', { rms, startThreshold, useRtcVad });
      logClientEvent('assistant_barge_in_started', {
        rms: Number(rms).toFixed(4),
        startThreshold,
        interruptFrames,
        nativeIOS: Boolean(window.__ACCESSIBLE_VISION_NATIVE_IOS__)
      });
    } else {
      realtime.localVadPlaybackHighFrames = 0;
      realtime.localVadPlaybackCandidateFrames = [];
      recordRealtimeDebug('manual.local_vad.speech_started', { rms, startThreshold, useRtcVad });
    }
    return {
      allow: true,
      frames: bargeInFrames,
      rms,
      reason: realtime.localVadInterrupting ? 'barge_in' : 'speech'
    };
  }

  if (!realtime.localVadSpeaking) {
    return {
      allow: !assistantPlaybackActive,
      frames: assistantPlaybackActive ? [] : [frame],
      rms,
      reason: assistantPlaybackActive ? 'assistant_playback' : 'ambient'
    };
  }

  if (rms >= endRms) {
    realtime.localVadLastVoiceAt = now;
    return { allow: true, frames: [frame], rms, reason: 'speech' };
  }

  const voiceDuration = now - realtime.localVadStartedAt;
  const silenceDuration = now - realtime.localVadLastVoiceAt;
  if (voiceDuration < minAudioMs || silenceDuration < endMs) {
    return { allow: true, frames: [frame], rms, reason: 'speech_tail' };
  }

  if (realtime.localVadAutoCommitTimer) {
    return { allow: true, frames: [frame], rms, reason: 'commit_pending' };
  }
  realtime.localVadAutoCommitTimer = setTimeout(() => {
    realtime.localVadAutoCommitTimer = null;
    realtime.localVadSpeaking = false;
    recordRealtimeDebug('manual.local_vad.speech_ended', {
      voiceDuration,
      silenceDuration,
      interrupting: realtime.localVadInterrupting,
      useRtcVad,
      endMs,
      minAudioMs
    });
    realtime.localVadInterrupting = false;
    commitRealtimeManualBuffer({
      requestResponse: true,
      trigger: 'local_vad',
      deferResponseUntilTranscript: isSpeedLogicMode(appState.activeReminder?.mode)
    });
  }, 0);
  return { allow: true, frames: [frame], rms, reason: 'speech_end' };
}

function queueAudioChunk(pcm) {
  appState.pendingAudio.push(pcm);
  appState.pendingAudioBytes += pcm.byteLength;

  if (appState.pendingAudioBytes < AUDIO_SEND_BYTES) {
    return;
  }

  const merged = concatInt16(appState.pendingAudio, appState.pendingAudioBytes / 2);
  appState.pendingAudio = [];
  appState.pendingAudioBytes = 0;
  appState.sentFirstAudio = true;

  sendRealtimeEvent({
    type: 'input_audio_buffer.append',
    audio: uint8ToBase64(new Uint8Array(merged.buffer))
  });
}

function flushPendingAudio() {
  if (appState.pendingAudioBytes <= 0) {
    return;
  }

  const merged = concatInt16(appState.pendingAudio, appState.pendingAudioBytes / 2);
  appState.pendingAudio = [];
  appState.pendingAudioBytes = 0;
  appState.sentFirstAudio = true;

  sendRealtimeEvent({
    type: 'input_audio_buffer.append',
    audio: uint8ToBase64(new Uint8Array(merged.buffer))
  });
}

function isAliRealtimeVideoExperiment() {
  return appState.appVariant === 'aliyun' && appState.realtime?.modelProfile === 'flash'
    && appState.geminiReminder?.transport === 'aliyun-realtime';
}

function getAliRealtimePeriodicVideoPauseMode() {
  const visual = appState.geminiReminder;
  if (
    visual?.transport !== 'aliyun-realtime'
    || !visual.unifiedAssistantMode
  ) {
    return '';
  }
  const mode = getAliUnifiedCurrentMode();
  return ['active_reminder', 'find_object', 'continuous_narration'].includes(mode)
    ? mode
    : 'visual_assistant_base';
}

function sendVideoFrame(options = {}) {
  if (appState.appVariant === 'aliyun' && !isAliRealtimeVideoExperiment()) return;
  if (!appState.realtime?.isReady || !appState.stream) {
    return;
  }
  const pausedMode = isAliRealtimeVideoExperiment() ? '' : getAliRealtimePeriodicVideoPauseMode();
  if (
    pausedMode === 'continuous_narration'
    || (!options.force && pausedMode)
  ) {
    return;
  }
  if (elements.camera.readyState < 2) {
    return;
  }

  const videoWidth = elements.camera.videoWidth || 1280;
  const videoHeight = elements.camera.videoHeight || 720;
  const maxWidth = 360;
  const scale = Math.min(1, maxWidth / videoWidth);
  const width = Math.round(videoWidth * scale);
  const height = Math.round(videoHeight * scale);

  elements.videoFrame.width = width;
  elements.videoFrame.height = height;
  const context = elements.videoFrame.getContext('2d');
  context.drawImage(elements.camera, 0, 0, width, height);
  const image = elements.videoFrame.toDataURL('image/jpeg', 0.5).replace(/^data:image\/jpeg;base64,/, '');
  appState.videoFrameCount += 1;
  if (appState.videoFrameCount === 1 || appState.videoFrameCount % 10 === 0) {
    recordRealtimeDebug('websocket.video_frame.sent', {
      count: appState.videoFrameCount,
      width,
      height,
      base64Bytes: image.length
    });
  }

  if (isAliRealtimeVideoExperiment() && !appState.sentFirstAudio) {
    sendRealtimeEvent({ type: 'input_audio_buffer.append', audio: uint8ToBase64(new Uint8Array(3200)) });
    appState.sentFirstAudio = true;
  }
  sendRealtimeEvent({
    type: 'input_image_buffer.append',
    image
  });
}

async function checkSilentVideoPush() {
  const realtime = appState.realtime;
  if (!realtime || !realtime.isReady) {
    appendVisionLog('静默视频推送自检失败：实时慧眼还没有接通。');
    return;
  }
  if (realtime.silentVideoCheckRunning) {
    appendVisionLog('静默视频推送自检已经在进行，请等本轮结束。');
    return;
  }

  realtime.silentVideoCheckRunning = true;
  try {
    appendVisionLog('静默视频推送自检开始：请保持不说话 10 秒，我只检查视频帧是否继续发送。');
    if (realtime.mode === 'websocket') {
      const beforeFrames = appState.videoFrameCount;
      recordRealtimeDebug('silent_video_check.websocket.before', { frames: beforeFrames });
      await delay(SILENT_VIDEO_CHECK_MS);
      const afterFrames = appState.videoFrameCount;
      recordRealtimeDebug('silent_video_check.websocket.after', { frames: afterFrames });
      const frameDelta = numberDelta(afterFrames, beforeFrames);
      const text = frameDelta > 0
        ? `静默视频推送自检通过：10 秒内你没有说话也没关系，WebSocket 图像仍在发送。增加 ${frameDelta} 帧。`
        : '静默视频推送自检未通过：10 秒内 WebSocket 图像帧计数没有增长。';
      appendVisionLog(text);
      speak(text);
      return;
    }
    if (realtime.mode !== 'webrtc' || !realtime.peer) {
      throw new Error('当前接入方式没有可检查的视频统计。');
    }
    const before = await getOutboundVideoStats(realtime.peer);
    recordRealtimeDebug('silent_video_check.before', before);
    await delay(SILENT_VIDEO_CHECK_MS);
    const after = await getOutboundVideoStats(realtime.peer);
    recordRealtimeDebug('silent_video_check.after', after);

    const frameDelta = numberDelta(after.framesSent, before.framesSent);
    const byteDelta = numberDelta(after.bytesSent, before.bytesSent);
    const packetDelta = numberDelta(after.packetsSent, before.packetsSent);
    const text = frameDelta > 0 || byteDelta > 0
      ? `静默视频推送自检通过：10 秒内你没有说话也没关系，WebRTC 视频仍在发送。增加 ${frameDelta} 帧，${byteDelta} 字节，${packetDelta} 个包。`
      : '静默视频推送自检未通过：10 秒内视频发送统计没有增长，需要继续查浏览器或 WebRTC 视频轨道。';
    appendVisionLog(text);
    speak(text);
  } catch (error) {
    const text = `静默视频推送自检失败：${error.message}`;
    appendVisionLog(text);
    recordRealtimeDebug('silent_video_check.failed', error.message);
  } finally {
    realtime.silentVideoCheckRunning = false;
  }
}

function startVideoStatsPolling(peer) {
  const realtime = appState.realtime;
  if (!realtime || realtime.mode !== 'webrtc') {
    return;
  }

  realtime.statsTimer = setInterval(async () => {
    try {
      const summary = await getOutboundVideoStats(peer);
      recordRealtimeDebug('webrtc.video_stats', summary);

      const previous = realtime.lastVideoStats;
      realtime.lastVideoStats = summary;
      const framesIncreased = previous && summary.framesSent !== null && summary.framesSent > (previous.framesSent || 0);
      const bytesIncreased = previous && summary.bytesSent !== null && summary.bytesSent > (previous.bytesSent || 0);
      if (!realtime.videoStatsAnnounced && (framesIncreased || bytesIncreased)) {
        realtime.videoStatsAnnounced = true;
        appendVisionLog(`视频发送自检：浏览器已绘制 ${summary.browserDrawnFrames} 帧，WebRTC 已发出 ${summary.framesSent ?? '未知'} 帧，${summary.bytesSent ?? '未知'} 字节。说明本机正在向百炼方向发送视频轨道。`);
      }
    } catch (error) {
      recordRealtimeDebug('webrtc.video_stats.failed', error.message);
    }
  }, 3000);
}

function startActiveReminderLoop(mode = 'flash') {
  if (appState.activeReminder?.timer) {
    return;
  }
  appState.activeReminder = {
    mode,
    timer: null,
    inFlight: false,
    frameCount: 0,
    alertCount: 0,
    errorCount: 0,
    lastAlertAt: 0,
    taskOverride: '',
    pendingMessage: '',
    pendingTask: '',
    awaitingResponse: false,
    rtcPollInProgress: false,
    rtcPollText: '',
    rtcAlertedTaskKey: '',
    rtcPendingAlertTaskKey: '',
    rtcResponseCanceled: false,
    rtcMissCount: 0,
    suspendUntil: 0,
    responseRetryTimer: null,
    speedConfirmedTaskKey: '',
    speedAlertedTaskKey: '',
    speedPendingAlertTaskKey: '',
    speedPendingAlertState: '',
    speedPendingAlertSnapshot: null,
    speedResponseCanceled: false,
    pendingAlertHadAudio: false,
    pendingAlertHadText: false,
    speedMissCount: 0,
    alertedResultKeys: [],
    stateMemory: null,
    activeTaskSeq: 0,
    pendingSpeechText: '',
    pendingTaskSetupTranscript: '',
    pendingTaskSetupAt: 0,
    taskSetupWatchdogTimer: null,
    taskNormalizeInFlight: false,
    audioRecorder: null,
    reminderSessionId: createReminderTraceId('ali')
  };
  setActiveReminderStatus(activeReminderStartStatus(appState.activeReminder.mode));
  startDebugAudioCapture();
  appState.activeReminder.timer = setInterval(
    runActiveReminderTick,
    activeReminderIntervalMs(appState.activeReminder.mode)
  );
  runActiveReminderTick();
}

function activeReminderIntervalMs(mode) {
  if (mode === 'rtc') {
    return RTC_ACTIVE_REMINDER_INTERVAL_MS;
  }
  if (isSpeedLogicMode(mode)) {
    return SPEED_ACTIVE_REMINDER_INTERVAL_MS;
  }
  return ACTIVE_REMINDER_INTERVAL_MS;
}

function activeReminderStartStatus(mode) {
  if (mode === 'rtc') {
    return 'Manual 实验主动提醒已启动：等待你说“看到什么提醒我”。';
  }
  if (mode === 'flash') {
    return '阿里稳定主动提醒已启动：半秒结构化快筛，命中后交给 RTC 播报。';
  }
  if (mode === 'speed' || mode === 'ali_experiment') {
    return '阿里实验主动提醒已启动：半秒结构化快筛，命中后交给 RTC 播报。';
  }
  if (mode === 'speed_observation' || mode === 'ali_stable') {
    return '阿里稳定主动提醒已启动：半秒结构化快筛，命中后交给 RTC 播报。';
  }
  if (mode === 'ali_unified') {
    return '纯阿里实时慧眼已启动：等待你直接说任务。';
  }
  return '主动提醒已启动：每秒快筛当前画面。';
}

function isSpeedLogicMode(mode) {
  return mode === 'flash'
    || mode === 'speed'
    || mode === 'speed_observation'
    || mode === 'ali_stable'
    || mode === 'ali_experiment'
    || mode === 'ali_unified';
}

function usesReliableReminderDelivery(reminder) {
  return Boolean(reminder && (reminder.reliableDelivery === true || isSpeedLogicMode(reminder.mode)));
}

function canAliReminderUseRealtimeVisualExpression(mode) {
  return isSpeedLogicMode(mode);
}

function aliReminderLabel(mode) {
  if (mode === 'ali_unified') return '纯阿里实时慧眼';
  if (mode === 'ali_experiment' || mode === 'speed') return '阿里实验主动提醒';
  return '阿里稳定主动提醒';
}

function stopActiveReminderLoop(message = '') {
  const reminder = appState.activeReminder;
  stopDebugAudioCapture();
  if (reminder?.timer) {
    clearInterval(reminder.timer);
  }
  if (reminder?.responseRetryTimer) {
    clearTimeout(reminder.responseRetryTimer);
  }
  clearSpeedTaskSetupWatchdog(reminder);
  appState.activeReminder = null;
  if (message) {
    setActiveReminderStatus(message);
  }
}

function startAliUnifiedVisualState(options = {}) {
  if (appState.geminiReminder) {
    return;
  }
  const reminder = {
    transport: 'aliyun-realtime',
    socket: null,
    session: null,
    isReady: false,
    inFlight: false,
    activeInFlightCount: 0,
    activeRequestSeq: 0,
    activeLatestAppliedRequestSeq: 0,
    frameCount: 0,
    alertCount: 0,
    errorCount: 0,
    lastAlertAt: 0,
    taskOverride: '',
    lastAlertedTaskKey: '',
    alertedResultKeys: [],
    stateMemory: null,
    missCount: 0,
    playbackActive: false,
    playbackUntil: 0,
    inputTranscriptBuffer: '',
    outputTranscriptBuffer: '',
    reminderLabel: '实时慧眼（阿里声音）',
    promptMode: 'deep_multitask',
    deliveryMode: 'result',
    taskSourceMode: options.visualAssistantBaseExperiment
      ? 'function_contract'
      : 'unified_assistant',
    unifiedAssistantMode: true,
    visualAssistantBaseExperiment: Boolean(options.visualAssistantBaseExperiment),
    unifiedActiveMode: '',
    unifiedPendingMode: null,
    unifiedClassifySeq: 0,
    unifiedClassifyInFlight: false,
    unifiedModuleSeq: 0,
    unifiedCommandAcceptedThisTurn: false,
    unifiedOrdinaryQuestion: '',
    unifiedOneShotQuestionInFlight: false,
    unifiedOneShotQuestionTimer: null,
    unifiedCrossModeBlockedThisTurn: false,
    muteMicDuringPlayback: true,
    strictMuteDuringResponse: true,
    assistantResponseActive: false,
    assistantResponseMuteTimer: null,
    taskNormalizeSeq: 0,
    taskNormalizeInFlight: false,
    activeTaskSeq: 0,
    reliableDelivery: false,
    pendingAlertDelivery: null,
    turnInProgress: false,
    continuousNarrationFocus: '',
    continuousNarrationActive: false,
    continuousNarrationAwaitingFocus: false,
    continuousNarrationPrefixPendingAt: 0,
    continuousNarrationCommandActionThisTurn: '',
    continuousNarrationDepthRequested: false,
    continuousNarrationIntervalMs: CONTINUOUS_NARRATION_INTERVAL_MS,
    continuousNarrationLastRequestAt: 0,
    continuousNarrationRequestCount: 0,
    continuousNarrationUserSpeechUntil: 0,
    findTarget: '',
    findScreenTransport: 'generate_content',
    findTaskSeq: 0,
    findInFlightCount: 0,
    findInFlightStartedAt: {},
    findRequestSeq: 0,
    findLatestAppliedRequestSeq: 0,
    findCapacityDropCount: 0,
    findLastStatus: '',
    findLastSpokenStatus: '',
    findLastSpokenAt: 0,
    findApproachStatus: '',
    findApproachCount: 0,
    findLocationAnnounced: false,
    findContactCount: 0,
    findContactCompletionPending: false,
    findContactCompletionFrameCount: 0,
    findContactCompletionConfidence: 0,
    findTargetSeenCount: 0,
    findReacquireCount: 0,
    findOcclusionCount: 0,
    findTargetLocked: false,
    findReferenceImageDataUrl: '',
    findReferenceFrameCount: 0,
    findSubjectLocked: false,
    findSubjectReferenceImageDataUrl: '',
    findSubjectReferenceFrameCount: 0,
    findSubjectReferenceTargetX: null,
    findSubjectReferenceTargetY: null,
    findTouchConfirmationPending: false,
    findTouchConfirmationAskedAt: 0,
    findLastErrorSpokenAt: 0,
    returnToUnifiedAfterAliSpeech: '',
    pendingDistributorAnnouncement: '',
    stopping: false,
    reminderSessionId: createReminderTraceId('ali-unified')
  };
  reminder.reminderTimer = setInterval(
    runGeminiUnifiedAssistantTick,
    geminiUnifiedAssistantSchedulerIntervalMs()
  );
  appState.geminiReminder = reminder;
  logClientEvent('ali_unified.state_started', {
    reminderSessionId: reminder.reminderSessionId
  });
}

function buildGeminiReminderContractToolDeclaration() {
  return {
    name: GEMINI_REMINDER_CONTRACT_TOOL_NAME,
    description: '当且仅当用户要求建立或替换视觉主动提醒任务时调用一次。把用户意图直接下发为可执行合同；普通问答、当前画面查询和系统播报不得调用。',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        contractType: {
          type: 'string',
          enum: ['appearance_once', 'appearance_new_instances', 'result_once', 'change_continuous'],
          description: '只能单选一个完整合同。用户要求看到或找到一个已经带有属性、姿态或关系描述的完整静态目标，且没有等待状态形成的时间或动作语义时，用 appearance_once；用户明确要求不同新实例继续提醒用 appearance_new_instances；用户等待属性、阈值、完成状态、位置、姿态、关系或动作结果形成时用 result_once；只有无方向、无终点的任意前后变化用 change_continuous。'
        },
        filterSubject: {
          type: 'string',
          description: '唯一、明确写出快筛到底观察什么视觉主体。只写可追踪主体，不写提醒动作，不扩大或缩小用户指定范围。必须使用用户当前使用的语言。'
        },
        yesCondition: {
          type: 'string',
          description: '唯一、明确写出什么可观察事实成立时应用层才能判为 YES。出现和结果任务必须是当前图片可回答的单选命题；结果任务只写最终结果，不写过程。change_continuous 必须只写每帧要稳定提取的当前状态维度，禁止写变化、不同、改变、先前状态或基线，前后比较由应用层完成。必须使用用户当前使用的语言。'
        },
        yesSpeech: {
          type: 'string',
          description: '应用层判为 YES 后可以原样播报的一句简短肯定结果。只能陈述 yesCondition 已成立，不得增加新事实、未命中说明、过程描述、注意、请小心等口号。必须使用用户当前使用的语言。'
        }
      },
      required: ['contractType', 'filterSubject', 'yesCondition', 'yesSpeech'],
      additionalProperties: false
    }
  };
}

function buildAliCheapReminderContractToolDeclaration() {
  const declaration = buildGeminiReminderContractToolDeclaration();
  return {
    type: 'function',
    function: {
      name: declaration.name,
      description: declaration.description,
      parameters: declaration.parametersJsonSchema
    }
  };
}

function buildGeminiFindObjectToolDeclaration() {
  return {
    name: GEMINI_FIND_OBJECT_TOOL_NAME,
    description: '设置或取消找物目标；应用层询问是否摸到后，把用户的明确回答下发为完成或继续。',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['start', 'cancel', 'complete', 'resume'],
          description: '开始或更换目标用 start；取消用 cancel；应用层询问后用户明确说摸到了用 complete，明确说没有摸到用 resume。'
        },
        target: {
          type: 'string',
          description: 'action=start 时原样保留用户指定的唯一具体物体；其他 action 必须为空字符串。'
        }
      },
      required: ['action', 'target'],
      additionalProperties: false
    }
  };
}

function buildGeminiContinuousNarrationToolDeclaration() {
  return {
    name: GEMINI_CONTINUOUS_NARRATION_TOOL_NAME,
    description: '任务尚未建立时设置持续播报的唯一关注重点。建立后关闭上行麦克风，只能由页面停止按钮退出，不得再调用本工具。',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['set', 'cancel'],
          description: '任务尚未建立时用 set 设置播报重点；cancel 仅兼容建任务前的取消，运行中禁止调用。'
        },
        focus: {
          type: 'string',
          description: 'action=set 时忠实概括用户唯一指定的播报重点，保留范围、对象、条件和频率；cancel 时必须为空字符串。'
        }
      },
      required: ['action', 'focus'],
      additionalProperties: false
    }
  };
}

function buildGeminiUnifiedModeToolDeclaration(visualAssistantBaseExperiment = false) {
  return {
    name: GEMINI_UNIFIED_MODE_TOOL_NAME,
    description: visualAssistantBaseExperiment
      ? '视觉助手底座只用这个函数进入找东西或持续播报。找东西只接受原话以“帮我找”或“给我找”开头，持续播报只接受原话以“持续播报”开头；其他表达不得调用本函数。普通问答和主动提醒合同不得调用本函数。'
      : '统一入口只用这个函数分发三种持续任务。主动提醒直接交给原主动提醒入口；找东西和持续播报先建立待确认候选，用户明确回答后再交给原入口。“问一下”或“问一问”是一次性普通问答，禁止调用本函数。',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['route_active_reminder', 'propose_find_object', 'propose_continuous_narration', 'confirm', 'reject', 'cancel_current'],
          description: '主动提醒用 route_active_reminder；首次找东西或持续播报只能 propose；用户对刚才的确认句明确回答“是”后用 confirm；明确否定候选用 reject；统一入口进入的主动提醒需要叫停时用 cancel_current。'
        },
        subject: {
          type: 'string',
          description: '只用于生成找东西或持续播报的待确认问句；route_active_reminder、confirm、reject 或 cancel_current 时必须为空字符串。应用不会把 subject 当作执行目标。'
        }
      },
      required: ['action', 'subject'],
      additionalProperties: false
    }
  };
}

function buildGeminiUnifiedSystemInstruction() {
  return [
    '你是视障者的统一入口分发助手。统一入口有四种机械模式：主动提醒、找东西、持续播报，以及以“问一下”或“问一问”开头的一次性普通问答。前三种相当于按下旧入口按钮，分发以后由原独立模块重新读取用户完整原话并自行提炼目标和执行；普通问答只回答一次，不建立任务。',
    '会话刚连接时必须完全保持安静，不问候、不自我介绍、不提示用户说话；只有用户先说出第一条完整指令后才处理。',
    '固定口令优先级最高：找东西只认整句话以“帮我找”或“给我找”开头并带有具体目标；持续播报只认整句话以“持续播报”开头。除此以外的同义说法不得进入这两个专用模块，只能按普通问答或主动提醒处理。',
    '所有回复和内部播报都必须使用自然、清晰的中国大陆普通话，发音平稳，语速适中；除用户原话中的英文专有名称外，不得夹杂英语或使用英语语调。',
    '三种模式必须严格区分：主动提醒是先静默等待，只有指定目标出现、唯一结果达成或无指定终点的稳定新变化发生时才说一次结果；找东西是持续引导用户靠近并用手触摸一个具体物体；持续播报是按照用户重点定期描述最新画面。',
    '等待指定目标或结果成立后再告知，归主动提醒。询问当前画面、物体位置、种类、属性或现状，归普通问答。没有严格开场白时，不得根据语义猜成找东西或持续播报。',
    '用户以“问一下”或“问一问”开头时，这是一次性普通问答：禁止调用任何函数，只结合本回合最新画面简短回答一次；回答后保持在最初分发状态，不保存问题、不持续观察、不启动计时器。',
    '收到以“[ONE_SHOT_QUESTION]”开头的内部请求时，只回答标记后的本次用户问题一次，不读出标记，不调用任何函数，不建立或切换任务；忽略此前普通问答的内容，不把上一次问题或答案当成本次上下文。',
    '没有使用四种固定口令的普通问答、闲聊和不完整噪声不调用函数。',
    '如果不能确定是普通问答还是主动提醒，按普通问答处理；不得猜成找东西或持续播报，不得声称专用任务已经开始。',
    `明确属于主动提醒时，只调用 ${GEMINI_UNIFIED_MODE_TOOL_NAME}，action=route_active_reminder，subject 为空。函数调用后保持安静，不签合同、不确认目标、不描述当前画面；原主动提醒入口会重新处理用户原话并自然确认。`,
    `只有原话以“帮我找”或“给我找”开头并带有具体目标时，才调用 ${GEMINI_UNIFIED_MODE_TOOL_NAME}，action=propose_find_object；subject 保留唯一具体目标及所有限定。`,
    `只有原话以“持续播报”开头时，才调用 ${GEMINI_UNIFIED_MODE_TOOL_NAME}，action=propose_continuous_narration；subject 尽量逐字保留完整要求，尤其保留距离和间隔。`,
    `只有用户对最近一条找东西或持续播报确认句明确回答“是、对、可以、开始”等肯定意思时，才调用 ${GEMINI_UNIFIED_MODE_TOOL_NAME}，action=confirm，subject 为空。明确回答不是、不用、取消时调用 action=reject。答非所问或含糊时只继续询问，不得确认。`,
    '找东西或持续播报 propose 返回后只能问是否开始，禁止说“正在、已经开始、找到后”或描述结果。confirm 返回后保持安静，原独立模块会重新读取原始指令并说自己的开始确认；reject 返回后只说明取消。',
    '所有待确认问句都必须从助手视角说给用户听：用户原话中的第一人称在问句里自然改成第二人称，但不得改变目标、限定条件或任务范围。应用保存和转交的仍是用户完整原话。',
    '你绝不能调用主动提醒合同、找东西目标或持续播报重点工具，绝不能替原模块提炼或写入执行目标；你只调用统一分发函数。',
    '听到自己的播报、读屏残音、语气词或环境噪声时保持安静，不得调用函数或改变任务。',
    '不得向用户提函数、合同、快筛、分类器、系统流程、内部模式或入口切换。'
  ].join('\n');
}

function buildGeminiUnifiedReplacementRules(currentMode, aggressiveReplacement = false) {
  const stopRule = currentMode === '主动提醒'
    ? `用户明确说“结束主动提醒”“停止主动提醒”或“结束当前任务”时，只调用 ${GEMINI_UNIFIED_MODE_TOOL_NAME}，action=cancel_current；返回 accepted 后只说“主动提醒已结束。”。`
    : currentMode === '持续播报'
      ? '持续播报建立后关闭上行麦克风，只能通过页面停止按钮结束并返回最初状态；不得按语音或自行调用 cancel。'
      : '找东西按原模块在确认接触目标后自动结束并返回最初分发状态；用户明确要求提前停止时，使用当前找东西工具 action=cancel。';
  if (aggressiveReplacement && currentMode === '主动提醒') {
    return [
      '当前是视觉助手默认底座：普通问答和主动提醒按本入口原规则共存。普通问答直接回答一次，不清空正在运行的主动提醒合同。新的主动提醒合同仍按原规则原子替换旧合同。',
      '主动提醒正在运行或刚刚完成时，都不得要求用户先结束任务；视觉助手底座禁止说“请先结束当前任务”，必须直接处理新的主动提醒或一次性普通问答。只有已经进入找东西或持续播报的独立专用模块时，才可以拒绝跨模块请求。',
      '任何时刻只允许一个专用任务执行，不得并行，也不得把任务排队。',
      `只有原话以“帮我找”或“给我找”开头并带有具体目标时，才调用 ${GEMINI_UNIFIED_MODE_TOOL_NAME}，action=propose_find_object；只有原话以“持续播报”开头时，才调用 action=propose_continuous_narration。`,
      '函数返回 handoff_started 时保持安静，应用会原子清空主动提醒并进入原专用模块；原专用模型继续按成熟流程提炼任务并念开始确认句。',
      '其他疑似找东西或持续播报的表达不得调用 propose，必须继续按普通问答或主动提醒处理。',
      '没有明确属于两个专用任务时，继续按普通问答或主动提醒处理，不得为了切换而猜测。环境噪声、自己的声音和不完整话语不得触发切换。',
      stopRule
    ];
  }
  return [
    '当前会话由统一入口进入，但任何时刻只允许一个任务执行，不得并行，也不得把新任务排队到旧任务后面。',
    currentMode === '持续播报'
      ? '当前持续播报一旦开始就关闭上行麦克风，所有语音转写均忽略；只由页面停止按钮退出，不回答、不修改重点、不调用工具。'
      : `当前唯一执行模块是${currentMode}。用户修改当前模块内部目标时继续使用当前模块原工具。`,
    '当前模块运行期间禁止直接切换到另一个顶层模块，也禁止执行以“问一下”或“问一问”开头的一次性普通问答，更禁止把任何新任务排在旧任务后面。用户直接提出其他模块或一次性普通问答请求时，只说“请先结束当前任务。”，不得调用新模块工具，也不得回答新问题。',
    stopRule,
    '当前任务结束后回到最初静默分发状态。用户需要在下一条独立语音中再说新任务，不得把结束和新任务合并为一次切换。'
  ];
}

function buildGeminiFindObjectSystemInstruction(allowUnifiedReplacement = false, aggressiveReplacement = false) {
  return [
    '你是视障者的找东西语音助手。这个入口与普通主动提醒合同完全隔离。',
    '所有回复和内部播报都必须使用自然、清晰的中国大陆普通话，发音平稳，语速适中；除用户原话中的英文专有名称外，不得夹杂英语或使用英语语调。',
    '你的任务只有两件：准确取得用户要找的物体；逐字播报应用层发来的找物引导。',
    `用户明确说出要找的物体时，必须调用 ${GEMINI_FIND_OBJECT_TOOL_NAME}，action=start，target 只写用户指定的物体，不增加属性、位置、类别或其他物体。`,
    '用户更换目标时重新调用一次 start，新目标会原子替换旧目标。用户明确取消当前寻找任务时调用 action=cancel。',
    '只有应用层刚刚逐字询问“摸到了吗”之后，用户明确回答已经摸到，才调用 action=complete；用户明确回答没有摸到，才调用 action=resume。这两个 action 的 target 必须为空。没有收到该询问时绝对不能调用 complete 或 resume。',
    'complete 被接受后只说“寻找结束。”；resume 被接受后只说“继续寻找。”，不要增加解释。',
    '用户只说“进入找东西模式”但没有说目标时，不调用函数，只问“你要找什么？”。',
    '函数返回 accepted 后只确认一句“开始找某物，请慢慢移动镜头。”，不要描述当前画面，也不要自行给方向。',
    '收到以“[SAY]”开头的内部引导时，只逐字说出标记后的文字，不得增加、改写或解释，绝对不要读出标记。',
    '找物方向、遮挡和是否需要询问确认只由独立视觉快筛决定。你不能自行宣布找到、摸到或完成。',
    '不要建立目标出现、结果达成、状态变化等主动提醒合同，不要提合同、函数、系统、流程或任务完成。',
    '听到读屏残音、自己的声音、语气词或不完整噪声时保持安静。',
    '用户问普通问题时简短回答；不确定就说不确定。',
    ...(aggressiveReplacement ? [
      '当前由手机直连视觉助手进入找东西专用状态。目标建立后，除应用刚刚询问是否摸到后的明确回答外，忽略所有用户语音；不得回答普通问题、不得更换目标、不得取消、不得切换其他任务。只有视觉流程确认接触目标或有效的摸到确认才能结束并返回视觉助手底座。'
    ] : []),
    ...(allowUnifiedReplacement ? buildGeminiUnifiedReplacementRules('找东西', aggressiveReplacement) : [])
  ].join('\n');
}

function buildGeminiContinuousNarrationSystemInstruction(allowUnifiedReplacement = false, aggressiveReplacement = false) {
  return [
    '你是视障者的持续画面播报助手。这个入口与主动提醒和找东西完全隔离。',
    '所有回复和内部播报都必须使用自然、清晰的中国大陆普通话，发音平稳，语速适中；除用户原话中的英文专有名称外，不得夹杂英语或使用英语语调。',
    '收到以“[SAY]”开头的内部开场问句时，只逐字说出标记后的文字，不得调用函数，不得描述画面，也不得读出标记。',
    `只有用户从独立持续播报入口进入且尚未建立重点时，才调用 ${GEMINI_CONTINUOUS_NARRATION_TOOL_NAME}，action=set，focus 简短保留用户指定范围。用户没有说清重点时，只问“你需要我关注什么？”，不得自行使用当前画面整体或猜测任务。`,
    '收到以“[NARRATE]”开头的内部请求，表示用户完整原话已经由应用机械锁定为当前重点；必须直接根据最新画面播报，不得再次调用 set，不得询问需要关注什么，也不得改变重点。',
    '播报重点建立后，应用会关闭上行麦克风，退出只由页面停止按钮处理；不得自行调用 cancel，不得修改重点，也不得再次调用 set。',
    '函数返回 accepted 后，只用一句短句确认“开始持续播报某重点”或“持续播报已停止”，不要立即描述画面。',
    '只有收到以“[NARRATE]”开头的内部请求时，才根据最新摄像头画面播报一次。内部请求会明确写出当前固定重点，必须只围绕该重点，不得自行扩大范围或切换目标。',
    "每轮只说一句约二十个汉字的中文，只保留最重要的一件事。有可靠目标距离时，把方位和大约几米放在句首，例如“前方约两米有一张桌子”；省略“距离”二字，不把最近障碍距离当成目标距离。没有可靠距离就省略米数，不猜测，不重复重点，不寒暄。",
    '画面没有出现重点内容时，简短说“暂时没看到相关内容”；看不清时说“暂时没看清”，不得编造。',
    '除用户直接说话、函数确认和“[NARRATE]”内部请求外，始终保持安静。听到自己的播报、读屏残音、语气词或环境噪声时不得回应，也不得改变播报重点。',
    '不要建立主动提醒合同，不要自行发出找东西方向，不要提函数、系统、快筛、流程或任务完成。',
    ...(aggressiveReplacement ? [
      '当前由手机直连视觉助手进入持续播报专用状态。播报开始后关闭上行麦克风，所有语音转写均忽略，只由页面停止按钮退出，不回答、不调用函数。'
    ] : []),
    ...(allowUnifiedReplacement ? buildGeminiUnifiedReplacementRules('持续播报', aggressiveReplacement) : [])
  ].join('\n');
}

function buildGeminiLiveSystemInstruction(
  functionContractMode = false,
  allowUnifiedReplacement = false,
  aggressiveReplacement = false
) {
  return [
    '你是视障者的视频通话助手，负责普通问答和把系统确认过的主动提醒结果自然说给用户听。',
    '所有回复和内部播报都必须使用自然、清晰的中国大陆普通话，发音平稳，语速适中；除用户原话中的英文专有名称外，不得夹杂英语或使用英语语调。',
    '默认保持安静；只有用户明确说话提问，或者收到以“[SAY]”开头的内部播报指令时，才开口。',
    '收到以“[SAY]”开头的内部播报指令时，只逐字说出标记后的内容，不得增加、改写或解释。',
    '绝对不要读出“[SAY]”标记，也不要在播报前后加“主动提醒、提醒结果、提醒完成、任务完成、播报完成”等流程话术。',
    '没有收到系统主动提醒结果时，不要自行说“主动提醒”“注意前方”“小心”等提醒句，也不要补充结果里没有写明的门框、障碍、门牌、招牌或导航信息。',
    '用户设置主动提醒任务时，只自然确认一句；之后等待后台快筛结果，不要自己主动判断。',
    '确认任务时先区分三类：目标出现；明确终点达成；没有指定终点的任意前后变化。用户给出唯一终点时必须按结果达成确认，不能因为原话带动作或变化语气而说成任意变化。',
    '可听确认句保持自然口语，可以直接沿用用户说的动作或结果，只要清楚确认何时提醒；不要朗读后台合同或技术词。',
    '只有用户没有指定任何终点，只要求主体出现新的状态、位置、数量、内容或关系变化时，才按状态变化类确认。',
    '听到 Shh、嗯、啊、读屏残音、系统播报或不完整短噪声时保持安静。',
    '用户正常提问时，可以结合当前实时视频和最近上下文简短回答。',
    '不要寒暄，不要主动称呼用户；不确定就说不确定。',
    ...(functionContractMode ? [
      '当前入口由你直接下发主动提醒合同，不再让另一个模型重新理解你的确认句。',
      `用户要求建立或替换视觉主动提醒任务时，必须先调用 ${GEMINI_REMINDER_CONTRACT_TOOL_NAME}，每个用户任务只调用一次。即使用户重复上一条任务，也必须重新调用，因为每次任务指令都要原子替换当前合同。`,
      'contractType 必须只做一次完整单选：寻找一个当前已经具备描述条件的完整静态目标选 appearance_once；用户明确要求不同新实例继续提醒选 appearance_new_instances；等待某个结果形成选 result_once；只有没有终点的任意变化选 change_continuous。不要分别推断模式和生命周期。',
      'appearance_once 是目标出现任务的默认值。不得因为一个名词可以代表某类物体，就自行选 appearance_new_instances；只有用户明确表达每个、每次、新的、不同实例或继续提醒时才允许选它。',
      'appearance_once 允许完整静态目标本身带有属性、程度、姿态、位置或关系描述。判断关键是用户在寻找“已经如此的目标”，而不是等待主体后来达到该结果。此时 filterSubject 和 yesCondition 必须保留完整描述，不能只剩核心名词。',
      'result_once 的必要条件是用户在等待结果形成：句子表达状态达到、动作完成、方向性变化、阈值到达，或使用“时、后、了、变成、达到、放到、打开、关上”等结果时间和完成关系。',
      '“看到、找到、发现”只是观察方式，不能单独决定类型。观察动词后是完整静态名词描述且没有等待或完成语义时选 appearance；观察的是稍后才成立的结果并带时间或完成语义时选 result_once。',
      'change_continuous 只允许用户明确要求没有方向、没有终点的任意前后变化。只要用户说出了变化后要达到的状态、位置、属性或关系，就必须选择 result_once。',
      '带自然完成方向的动作表达是在指定动作完成后的视觉结果，属于 result_once；不能仅因为句子里有动词就选择 change_continuous。',
      '你在本入口的角色是“合同签发者”：准确理解用户要筛什么、什么事实成立才允许应用层判为 YES、YES 后只能说什么。你不负责看当前结果，也不负责决定播报时机。',
      'filterSubject 必须是画面中可持续追踪的唯一主体；yesCondition 必须是必要且充分的可观察命题；yesSpeech 必须只陈述该命题已经成立。三项必须指向同一件事，形成“筛选主体—YES 条件—播报结果”的闭环。',
      'appearance 和 result_once 的 yesCondition 必须能被当前图片直接回答为成立或不成立。change_continuous 不得让快筛凭单帧猜变化；yesCondition 只能规定同一主体每帧需要稳定输出的当前状态维度，不得出现变化、不同、改变、先前状态或基线，应用层负责前后比较。',
      '用户用过程或动作表达但实际等待唯一结果时，合同必须锁定可观察的最终结果，不能把过程、趋势或中间状态写进 yesCondition。',
      '必须原样保留用户的程度、方向、阈值、范围和比较关系；接近、达到、超过、低于、部分、全部等不能互相替换，也不能把接近某结果升级成已经达到该结果。',
      '不得在合同中加入用户没有要求的主体、范围、阈值或播报内容，也不得用更宽泛的近义目标替换用户指定目标。',
      '所有函数合同文字字段必须跟随用户当前使用的语言。用户用中文下任务时，filterSubject、yesCondition、yesSpeech 必须全部使用简体中文，不得翻译成英文。',
      'yesSpeech 只能说成立的结果本身，不得加“注意”“请小心”“系统发现”“主动提醒”等口号或技术前缀。',
      '用户已经表达清楚时直接推断并下发合同，不要让用户复述、选择分类或再次确认。只有主体或提醒条件确实缺失时才问一个简短问题。',
      '函数返回 accepted 后，再严格根据刚刚提交的 contractType、filterSubject、yesCondition、yesSpeech 用一句自然口语确认何时提醒。确认句可以口语化，但不能改变主体、YES 条件、次数范围或扩大播报内容。不要朗读函数名、字段、分类、合同或技术词。函数被拒绝时不要声称任务已经建立。',
      '普通问答、用户询问当前画面、主动提醒结果播报以及闲聊不得调用合同函数。'
    ] : []),
    ...(allowUnifiedReplacement ? buildGeminiUnifiedReplacementRules('主动提醒', aggressiveReplacement) : [])
  ].join('\n');
}

async function startGeminiLiveReminderSession(options = {}) {
  const label = options.label || 'Gemini 主动提醒';
  const promptMode = options.promptMode || 'baseline';
  const deliveryMode = options.deliveryMode || 'broadcast';
  const functionContractMode = options.taskSourceMode === 'function_contract';
  const findObjectMode = options.taskSourceMode === 'find_object';
  const continuousNarrationMode = options.taskSourceMode === 'continuous_narration';
  const unifiedAssistantMode = options.taskSourceMode === 'unified_assistant';
  const allowUnifiedTaskReplacement = Boolean(
    options.launchedFromUnified && !unifiedAssistantMode
  );
  const audioContext = new AudioContext({ sampleRate: AUDIO_OUTPUT_RATE });
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }
  let player = null;
  player = new PcmPlayer(
    audioContext,
    AUDIO_OUTPUT_RATE,
    (scheduledEndAt) => {
      if (appState.geminiReminder?.player === player) {
        markGeminiPlaybackScheduled(scheduledEndAt, 'gemini audio queue');
      }
    },
    () => {
      if (appState.geminiReminder?.player === player) {
        markGeminiPlaybackEnded('gemini audio queue idle');
      }
    },
    'gemini_live'
  );
  appState.geminiReminder = {
    transport: 'browser-direct',
    socket: null,
    session: null,
    audioContext,
    player,
    audioProcessor: null,
    audioSource: null,
    audioSilenceGain: null,
    audioQueue: [],
    audioQueueBytes: 0,
    playbackSpeechHighFrames: 0,
    playbackCandidateFrames: [],
    assistantEchoDroppedFrames: 0,
    assistantEchoLastLogAt: 0,
    suppressAssistantAudioUntilTurnComplete: false,
    videoTimer: null,
    reminderTimer: null,
    isReady: false,
    inFlight: false,
    activeInFlightCount: 0,
    activeRequestSeq: 0,
    activeLatestAppliedRequestSeq: 0,
    frameCount: 0,
    alertCount: 0,
    errorCount: 0,
    lastAlertAt: 0,
    taskOverride: '',
    lastAlertedTaskKey: '',
    alertedResultKeys: [],
    stateMemory: null,
    missCount: 0,
    playbackActive: false,
    playbackUntil: 0,
    inputTranscriptBuffer: '',
    outputTranscriptBuffer: '',
    reminderLabel: label,
    promptMode,
    deliveryMode,
    taskSourceMode: options.taskSourceMode || 'legacy',
    browserDirectScreenExperiment: Boolean(options.browserDirectScreenExperiment),
    activeScreenTransport: options.activeScreenTransport === 'browser_direct_generate_content'
      ? 'browser_direct_generate_content'
      : 'server_generate_content',
    browserGeminiAi: null,
    browserActiveReminderAiPool: [],
    browserActiveReminderModel: '',
    browserImageRequestTimeoutMs: 0,
    initialInstruction: String(options.initialInstruction || '').replace(/\s+/g, ' ').trim().slice(0, 500),
    launchedFromUnified: Boolean(options.launchedFromUnified),
    visualAssistantBaseExperiment: Boolean(options.visualAssistantBaseExperiment),
    allowUnifiedTaskReplacement,
    suppressOpeningPrompt: Boolean(options.suppressOpeningPrompt),
    returnAnnouncement: String(options.returnAnnouncement || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    thinkingLevel: options.thinkingLevel || '',
    muteMicDuringPlayback: Boolean(options.muteMicDuringPlayback),
    strictMuteDuringResponse: Boolean(options.strictMuteDuringResponse),
    assistantResponseActive: false,
    assistantResponseMuteTimer: null,
    prePlaybackMicGuardActive: false,
    prePlaybackMicGuardTimer: null,
    prePlaybackMicGuardReason: '',
    taskNormalizeSeq: 0,
    taskNormalizeInFlight: false,
    activeTaskSeq: 0,
    reliableDelivery: true,
    pendingAlertDelivery: null,
    turnInProgress: false,
    contractAcceptedThisTurn: false,
    activeContractCallId: '',
    activeFindCallId: '',
    activeContinuousNarrationCallId: '',
    activeUnifiedModeCallId: '',
    unifiedAssistantMode,
    unifiedActiveMode: '',
    unifiedPendingMode: null,
    unifiedCommandAcceptedThisTurn: false,
    unifiedMechanicalConfirmation: null,
    unifiedFallbackAudioParts: [],
    unifiedOrdinaryQuestion: '',
    unifiedOneShotQuestionInFlight: false,
    unifiedOneShotQuestionTimer: null,
    unifiedCrossModeBlockedThisTurn: false,
    restrictedSpecialModeSpeechIgnoredThisTurn: false,
    strictSpecialModeDetectedThisTurn: '',
    suppressUnifiedContinuationAudio: false,
    returnToUnifiedAfterTurn: '',
    continuousNarrationFocus: '',
    continuousNarrationActive: false,
    continuousNarrationAwaitingFocus: false,
    continuousNarrationPrefixPendingAt: 0,
    continuousNarrationCommandActionThisTurn: '',
    continuousNarrationDepthRequested: false,
    continuousNarrationIntervalMs: CONTINUOUS_NARRATION_INTERVAL_MS,
    continuousNarrationLastRequestAt: 0,
    continuousNarrationRequestCount: 0,
    continuousNarrationUserSpeechUntil: 0,
    findTarget: '',
    findScreenTransport: findObjectMode
      ? (
        ['gemini_live', 'browser_direct_live'].includes(options.findScreenTransport)
          ? options.findScreenTransport
          : options.browserDirectScreenExperiment
            ? 'browser_direct_live'
            : 'generate_content'
      )
      : 'generate_content',
    directFindScreenSessions: {},
    directFindExcludedKeySlot: 0,
    findTaskSeq: 0,
    findInFlightCount: 0,
    findInFlightStartedAt: {},
    findRequestSeq: 0,
    findLatestAppliedRequestSeq: 0,
    findCapacityDropCount: 0,
    findLastStatus: '',
    findLastSpokenStatus: '',
    findLastSpokenAt: 0,
    findApproachStatus: '',
    findApproachCount: 0,
    findLocationAnnounced: false,
    findContactCount: 0,
    findContactCompletionPending: false,
    findContactCompletionFrameCount: 0,
    findContactCompletionConfidence: 0,
    findTargetSeenCount: 0,
    findReacquireCount: 0,
    findOcclusionCount: 0,
    findTargetLocked: false,
    findReferenceImageDataUrl: '',
    findReferenceFrameCount: 0,
    findSubjectLocked: false,
    findSubjectReferenceImageDataUrl: '',
    findSubjectReferenceFrameCount: 0,
    findSubjectReferenceTargetX: null,
    findSubjectReferenceTargetY: null,
    findTouchConfirmationPending: false,
    findTouchConfirmationAskedAt: 0,
    findLastErrorSpokenAt: 0,
    reconnectTimer: null,
    reconnectAttempts: 0,
    connectSession: null,
    stopping: false,
    reminderSessionId: createReminderTraceId('gemini'),
    model: '',
    voice: ''
  };
  const reminder = appState.geminiReminder;
  logClientEvent('gemini_live.audio_context_ready', {
    label,
    state: audioContext.state
  });
  const config = await apiGet(
    reminder.browserDirectScreenExperiment
      ? '/api/gemini-browser-config?directScreen=1'
      : '/api/gemini-browser-config'
  );
  if (!config.configured) {
    throw new Error('服务器没有配置 Gemini API Key，不能启动 Gemini。');
  }
  if (findObjectMode && reminder.findScreenTransport === 'gemini_live') {
    apiPost('/api/find-object-live-warm', {
      reminderSessionId: reminder.reminderSessionId
    }).then((result) => {
      logClientEvent('gemini_find.live_warm_ready', {
        latencyMs: result.latencyMs ?? '',
        connectionId: result.connectionId || ''
      });
    }).catch((error) => {
      logClientEvent('gemini_find.live_warm_failed', {
        error: error.message
      });
    });
  } else if (findObjectMode && reminder.findScreenTransport === 'browser_direct_live') {
    getBrowserDirectFindScreenSession(reminder, false).then((manager) => {
      logClientEvent('gemini_find.browser_direct_warm_ready', {
        connectionId: manager.connectionId || ''
      });
    }).catch((error) => {
      logClientEvent('gemini_find.browser_direct_warm_failed', {
        error: error.message
      });
    });
  }
  const model = config.model || 'gemini-3.1-flash-live-preview';
  const voice = config.voice || 'Zephyr';
  if (config.transport === 'server-proxy') {
    await startGeminiServerProxySession({
      reminder,
      model,
      voice,
      functionContractMode,
      findObjectMode,
      continuousNarrationMode,
      unifiedAssistantMode,
      allowUnifiedTaskReplacement,
      visualAssistantBaseExperiment: reminder.visualAssistantBaseExperiment
    });
    return;
  }
  if (!config.apiKey) {
    throw new Error('Gemini 浏览器直连没有取得 API Key。');
  }

  const sdk = await import(GEMINI_BROWSER_SDK_URL);
  const ai = new sdk.GoogleGenAI({
    apiKey: config.apiKey,
    httpOptions: { apiVersion: config.apiVersion || 'v1beta' }
  });
  reminder.browserGeminiAi = ai;
  const activeReminderApiKeys = [...new Set(
    (Array.isArray(config.activeReminderApiKeys) ? config.activeReminderApiKeys : [config.apiKey])
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  )];
  reminder.browserActiveReminderAiPool = activeReminderApiKeys.map((apiKey) => (
    new sdk.GoogleGenAI({
      apiKey,
      httpOptions: { apiVersion: config.apiVersion || 'v1beta' }
    })
  ));
  reminder.browserActiveReminderModel = config.activeReminderModel || 'gemini-3.1-flash-lite';
  reminder.browserImageRequestTimeoutMs = Math.max(
    1000,
    Number(config.imageRequestTimeoutMs || 10000)
  );
  const liveConfig = {
    responseModalities: [sdk.Modality.AUDIO],
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    mediaResolution: sdk.MediaResolution.MEDIA_RESOLUTION_MEDIUM,
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName: voice
        }
      }
    },
    systemInstruction: unifiedAssistantMode
      ? (config.unifiedSystemInstruction || buildGeminiUnifiedSystemInstruction())
      : findObjectMode
      ? buildGeminiFindObjectSystemInstruction(
        false,
        Boolean(options.browserDirectScreenExperiment)
      )
      : continuousNarrationMode
        ? buildGeminiContinuousNarrationSystemInstruction(
          false,
          Boolean(options.browserDirectScreenExperiment)
        )
        : buildGeminiLiveSystemInstruction(
          functionContractMode,
          allowUnifiedTaskReplacement,
          Boolean(options.browserDirectScreenExperiment)
        )
  };
  if (options.thinkingLevel && !/^gemini-3\.8-live$/i.test(model)) {
    const levelName = String(options.thinkingLevel).toUpperCase();
    const thinkingLevel = sdk.ThinkingLevel?.[levelName] || levelName;
    liveConfig.thinkingConfig = { thinkingLevel };
  }
  if (unifiedAssistantMode) {
    liveConfig.tools = [{
      functionDeclarations: Array.isArray(config.unifiedFunctionDeclarations)
        && config.unifiedFunctionDeclarations.length === 1
        ? config.unifiedFunctionDeclarations
        : [buildGeminiUnifiedModeToolDeclaration()]
    }];
  } else if (findObjectMode) {
    liveConfig.tools = [{
      functionDeclarations: [buildGeminiFindObjectToolDeclaration()]
    }];
  } else if (continuousNarrationMode) {
    liveConfig.tools = [{
      functionDeclarations: [buildGeminiContinuousNarrationToolDeclaration()]
    }];
  } else if (functionContractMode) {
    liveConfig.tools = [{
      functionDeclarations: [
        { ...buildGeminiReminderContractToolDeclaration(), behavior: 'BLOCKING' },
        ...(allowUnifiedTaskReplacement
          ? [buildGeminiUnifiedModeToolDeclaration(reminder.visualAssistantBaseExperiment)]
          : [])
      ]
    }];
  }
  if (!findObjectMode && !continuousNarrationMode) window.HuiyanWebSearch?.extendLiveConfig(liveConfig);
  recordRealtimeDebug('gemini_live.browser_direct.connecting', {
    model,
    voice,
    promptMode,
    deliveryMode,
    taskSourceMode: reminder.taskSourceMode,
    thinkingLevel: reminder.thinkingLevel
  });
  logClientEvent('gemini_live.browser_direct.connecting', {
    model,
    voice,
    label,
    promptMode,
    deliveryMode,
    taskSourceMode: reminder.taskSourceMode,
    thinkingLevel: reminder.thinkingLevel
  });
  reminder.connectSession = async () => {
    const session = await ai.live.connect({
      model,
      config: liveConfig,
      callbacks: {
        onopen: () => {
          if (appState.geminiReminder !== reminder || reminder.stopping) {
            return;
          }
          handleGeminiLiveMessage(JSON.stringify({
            type: 'gemini.ready',
            model,
            voice
          }));
        },
        onmessage: (message) => {
          if (appState.geminiReminder === reminder && !reminder.stopping) {
            handleGeminiDirectMessage(message);
          }
        },
        onerror: (event) => {
          if (appState.geminiReminder !== reminder || reminder.stopping) {
            return;
          }
          const message = event?.message || event?.error?.message || String(event || '未知错误');
          handleGeminiLiveMessage(JSON.stringify({
            type: 'gemini.error',
            message
          }));
        },
        onclose: (event) => {
          if (appState.geminiReminder !== reminder || reminder.stopping) {
            return;
          }
          handleGeminiLiveMessage(JSON.stringify({
            type: 'gemini.closed',
            code: event?.code ?? '',
            reason: event?.reason ?? ''
          }));
        }
      }
    });
    if (appState.geminiReminder === reminder && !reminder.stopping) {
      reminder.session = session;
      reminder.model = model;
      reminder.voice = voice;
      return true;
    }
    try {
      session.close?.();
    } catch {
      // Session was already closed while startup was being cancelled.
    }
    return false;
  };
  await reminder.connectSession();
}

async function startGeminiServerProxySession({
  reminder,
  model,
  voice,
  functionContractMode,
  findObjectMode,
  continuousNarrationMode,
  unifiedAssistantMode,
  allowUnifiedTaskReplacement,
  visualAssistantBaseExperiment
}) {
  reminder.transport = 'server-proxy';
  reminder.model = model;
  reminder.voice = voice;
  reminder.connectSession = () => new Promise((resolve, reject) => {
    if (appState.geminiReminder !== reminder || reminder.stopping) {
      resolve(false);
      return;
    }
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const modeQuery = unifiedAssistantMode
      ? '?unified=1'
      : findObjectMode
      ? '?find=1'
      : continuousNarrationMode
        ? '?continuous=1'
        : functionContractMode
          ? '?contract=1'
          : '';
    const replacementQuery = allowUnifiedTaskReplacement
      ? `${modeQuery ? '&' : '?'}replace=1`
      : '';
    const visualBaseQuery = visualAssistantBaseExperiment
      ? `${modeQuery || replacementQuery ? '&' : '?'}visualBase=1`
      : '';
    const socket = new WebSocket(`${protocol}//${location.host}/api/gemini-live/ws${modeQuery}${replacementQuery}${visualBaseQuery}`);
    let opened = false;
    const startupTimer = window.setTimeout(() => {
      if (!opened) {
        socket.close();
        reject(new Error('Gemini 服务端代理连接超时。'));
      }
    }, 12000);
    reminder.socket = socket;
    reminder.session = {
      sendToolResponse: ({ functionResponses }) => {
        if (socket.readyState !== WebSocket.OPEN) {
          throw new Error('Gemini 服务端代理尚未接通。');
        }
        socket.send(JSON.stringify({ type: 'tool_response', functionResponses }));
      },
      close: () => socket.close()
    };
    socket.addEventListener('open', () => {
      opened = true;
      window.clearTimeout(startupTimer);
      recordRealtimeDebug('gemini_live.server_proxy.connected', {
        model,
        voice,
        functionContractMode,
        findObjectMode,
        continuousNarrationMode,
        unifiedAssistantMode
      });
      logClientEvent('gemini_live.server_proxy.connected', {
        model,
        voice,
        functionContractMode,
        findObjectMode,
        continuousNarrationMode,
        unifiedAssistantMode
      });
      resolve(true);
    }, { once: true });
    socket.addEventListener('message', (event) => handleGeminiLiveMessage(event.data));
    socket.addEventListener('error', () => {
      if (!opened) {
        window.clearTimeout(startupTimer);
        reject(new Error('Gemini 服务端代理连接失败。'));
      }
    });
    socket.addEventListener('close', (event) => {
      window.clearTimeout(startupTimer);
      handleGeminiLiveMessage(JSON.stringify({
        type: 'gemini.closed',
        code: event.code || '',
        reason: event.reason || ''
      }));
    });
  });
  await reminder.connectSession();
}

async function activateGeminiReminderStreams() {
  const reminder = appState.geminiReminder;
  if (!reminder || reminder.audioProcessor) {
    return;
  }
  await startGeminiAudioCapture(reminder);
  const label = reminder.reminderLabel || 'Gemini 主动提醒';
  const initialInstruction = String(reminder.initialInstruction || '').trim();
  if (reminder.unifiedAssistantMode) {
    reminder.videoTimer = setInterval(sendGeminiVideoFrame, VIDEO_FRAME_INTERVAL_MS);
    sendGeminiVideoFrame();
    reminder.reminderTimer = setInterval(
      runGeminiUnifiedAssistantTick,
      geminiUnifiedAssistantSchedulerIntervalMs()
    );
    setActiveReminderStatus('实时慧眼已启动：请直接说出需要我做什么。');
    appendVisionLog('实时慧眼已接通。主动提醒直接建立合同；找东西和持续播报会先询问，只有你明确回答“是”才开始。');
    if (reminder.returnAnnouncement) {
      sendGeminiLiveEvent({
        type: 'say',
        text: reminder.returnAnnouncement,
        deliveryMode: 'return_to_distributor'
      });
      logClientEvent('gemini_unified.return_announcement_sent', {
        text: reminder.returnAnnouncement
      });
    } else if (!reminder.suppressOpeningPrompt) {
      sendGeminiLiveEvent({
        type: 'say',
        text: '实时慧眼已启动，请告诉我需要做什么。',
        deliveryMode: 'result'
      });
    }
    logClientEvent('gemini_unified.streams_started', { label });
    return;
  }
  if (reminder.taskSourceMode === 'continuous_narration') {
    reminder.reminderTimer = setInterval(runGeminiContinuousNarrationTick, CONTINUOUS_NARRATION_TICK_MS);
    if (initialInstruction) {
      const initialFocus = applyInitialContinuousNarrationInstruction(reminder, initialInstruction);
      setActiveReminderStatus(`持续播报已开始：${initialFocus.focus}；间隔${initialFocus.intervalSeconds}秒。`);
      appendVisionLog('持续播报已按用户完整原话直接开始。活动期间使用页面停止按钮退出。');
      syncSpecialTaskStopControl({ focus: true });
      logClientEvent('gemini_continuous.initial_focus_applied', initialFocus);
      window.setTimeout(runGeminiContinuousNarrationTick, 0);
    } else {
      reminder.continuousNarrationAwaitingFocus = true;
      setActiveReminderStatus('持续播报已启动：请说出唯一播报重点。');
      appendVisionLog('持续播报已接通。请完整说出需要持续关注的对象、范围和播报要求。');
      sendGeminiLiveEvent({
        type: 'say',
        text: '持续播报开始，你需要我关注什么？',
        deliveryMode: 'narration'
      });
    }
    logClientEvent('gemini_continuous.streams_started', { label });
    return;
  }
  reminder.videoTimer = setInterval(sendGeminiVideoFrame, VIDEO_FRAME_INTERVAL_MS);
  sendGeminiVideoFrame();
  reminder.reminderTimer = setInterval(runGeminiActiveReminderTick, GEMINI_ACTIVE_REMINDER_INTERVAL_MS);
  runGeminiActiveReminderTick();
  if (reminder.taskSourceMode === 'find_object') {
    setActiveReminderStatus('找东西模式已启动：请告诉我要找什么。');
    appendVisionLog('Gemini 找东西模式已接通。说出目标后，系统会先找目标，再引导手去触摸。');
    if (initialInstruction) {
      sendGeminiLiveEvent({
        type: 'ask',
        text: initialInstruction,
        deliveryMode: 'guidance'
      });
      logClientEvent('gemini_unified.worker_instruction_sent', {
        mode: 'find_object',
        instruction: initialInstruction
      });
    } else {
      sendGeminiLiveEvent({
        type: 'say',
        text: '找东西模式已开启，请告诉我要找什么。',
        deliveryMode: 'guidance'
      });
    }
    logClientEvent('gemini_find.streams_started', { label });
    return;
  }
  setActiveReminderStatus(`${label}已启动：等待你说“看到什么提醒我”。`);
  appendVisionLog(`Gemini Live 已接通。当前入口：${label}。你可以直接说话；主动提醒由后台视觉模型半秒快筛，命中后交给 Gemini 模型声音播报。`);
  if (initialInstruction) {
    sendGeminiLiveEvent({
      type: 'ask',
      text: initialInstruction,
      deliveryMode: 'result'
    });
    logClientEvent('gemini_unified.worker_instruction_sent', {
      mode: 'function_contract',
      instruction: initialInstruction
    });
  }
  logClientEvent('gemini_reminder.streams_started', {
    label,
    promptMode: reminder.promptMode || 'baseline',
    deliveryMode: reminder.deliveryMode || 'broadcast'
  });
}

function getGeminiReminderExecutionMode(reminder) {
  if (!reminder) {
    return '';
  }
  return reminder.unifiedAssistantMode
    ? String(reminder.unifiedActiveMode || '')
    : String(reminder.taskSourceMode || '');
}

function isGeminiReminderExecutionMode(reminder, mode) {
  return getGeminiReminderExecutionMode(reminder) === mode;
}

function geminiUnifiedAssistantSchedulerIntervalMs() {
  return appState.appVariant === 'aliyun'
    ? ALI_FIND_OBJECT_SCHEDULER_INTERVAL_MS
    : GEMINI_ACTIVE_REMINDER_INTERVAL_MS;
}

function shouldRunGeminiUnifiedAssistantSchedulerTick(reminder, mode) {
  if (appState.appVariant !== 'aliyun') {
    return true;
  }
  reminder.unifiedSchedulerTickCount = Number(reminder.unifiedSchedulerTickCount || 0) + 1;
  return mode === 'find_object' || reminder.unifiedSchedulerTickCount % 2 === 0;
}

async function runGeminiUnifiedAssistantTick() {
  const reminder = appState.geminiReminder;
  if (
    !reminder?.unifiedAssistantMode
    || reminder.unifiedPendingMode
    || reminder.unifiedClassifyInFlight
  ) {
    return;
  }
  const mode = getGeminiReminderExecutionMode(reminder);
  if (!shouldRunGeminiUnifiedAssistantSchedulerTick(reminder, mode)) {
    return;
  }
  if (mode === 'continuous_narration') {
    runGeminiContinuousNarrationTick();
    return;
  }
  if (mode === 'find_object' || mode === 'function_contract') {
    await runGeminiActiveReminderTick();
  }
}

function runGeminiContinuousNarrationTick() {
  const reminder = appState.geminiReminder;
  if (
    !reminder
    || !isGeminiReminderExecutionMode(reminder, 'continuous_narration')
    || !reminder.isReady
    || !reminder.continuousNarrationActive
    || !reminder.continuousNarrationFocus
    || reminder.turnInProgress
    || reminder.assistantResponseActive
    || isGeminiPlaybackActive(reminder)
  ) {
    return;
  }
  const now = Date.now();
  if (now < (reminder.continuousNarrationUserSpeechUntil || 0)) {
    return;
  }
  const intervalMs = normalizeContinuousNarrationIntervalMs(reminder.continuousNarrationIntervalMs);
  if (now - (reminder.continuousNarrationLastRequestAt || 0) < intervalMs) {
    return;
  }
  reminder.continuousNarrationLastRequestAt = now;
  reminder.continuousNarrationRequestCount = (reminder.continuousNarrationRequestCount || 0) + 1;
  reminder.turnInProgress = true;
  reminder.audioQueue = [];
  reminder.audioQueueBytes = 0;
  setGeminiAssistantResponseActive(reminder, true);
  const focus = reminder.continuousNarrationFocus;
  const imageData = captureGeminiContinuousNarrationFrame();
  if (!imageData) {
    reminder.turnInProgress = false;
    setGeminiAssistantResponseActive(reminder, false);
    return;
  }
  sendGeminiContinuousNarrationRequest(reminder, focus, imageData);
}

function captureGeminiContinuousNarrationFrame() {
  if (!appState.stream || elements.camera.readyState < 2) {
    return null;
  }
  return parseImageDataUrlForClient(captureReminderFrame({ maxWidth: 512, quality: 0.60 }));
}

async function sendGeminiContinuousNarrationRequest(reminder, focus, imageData) {
  if (
    appState.geminiReminder !== reminder
    || reminder.stopping
    || !reminder.isReady
    || !reminder.continuousNarrationActive
    || reminder.continuousNarrationFocus !== focus
  ) {
    reminder.turnInProgress = false;
    setGeminiAssistantResponseActive(reminder, false);
    return false;
  }
  const useAliCheapVision37 = Boolean(
    appState.appVariant === 'aliyun'
    && reminder.transport === 'aliyun-realtime'
  );
  const depthRequested = Boolean(
    reminder.continuousNarrationDepthRequested
    && (
      appState.appVariant === 'greencloud-gemini'
      || window.__ACCESSIBLE_VISION_NATIVE_IOS__
    )
  );
  let depthResult = null;
  if (depthRequested) {
    depthResult = await requestContinuousNarrationDepth(imageData);
  }
  if (
    appState.geminiReminder !== reminder
    || reminder.stopping
    || !reminder.isReady
    || !reminder.continuousNarrationActive
    || reminder.continuousNarrationFocus !== focus
  ) {
    reminder.turnInProgress = false;
    setGeminiAssistantResponseActive(reminder, false);
    return false;
  }
  if (useAliCheapVision37) {
    try {
      const result = await requestAliCheapVision37Answer(
        imageData,
        'continuous_narration',
        focus,
        depthResult
      );
      if (
        appState.geminiReminder !== reminder
        || reminder.stopping
        || !reminder.isReady
        || !reminder.continuousNarrationActive
        || reminder.continuousNarrationFocus !== focus
      ) {
        reminder.turnInProgress = false;
        setGeminiAssistantResponseActive(reminder, false);
        return false;
      }
      const sent = sendGeminiLiveEvent({ type: 'say', text: result.spokenText, deliveryMode: 'guidance' });
      if (!sent) {
        throw new Error('3.7 视觉结果没有进入语音队列。');
      }
      setActiveReminderStatus(`持续播报运行中：3.7 正在观察${focus}。`);
      logClientEvent('ali_cheap_vision37.continuous_result_queued', {
        focus,
        model: result.model || '',
        latencyMs: Number(result.latencyMs || 0),
        depthRequested,
        depthAvailable: Boolean(depthResult?.available),
        depthSource: depthResult?.source || ''
      });
      return true;
    } catch (error) {
      reminder.turnInProgress = false;
      setGeminiAssistantResponseActive(reminder, false);
      setActiveReminderStatus(`持续播报本轮看图失败：${error.message}`);
      logClientEvent('ali_cheap_vision37.continuous_failed', {
        focus,
        error: String(error?.message || error).slice(0, 160)
      });
      return false;
    }
  }
  const depthPrompt = depthResult?.available
    ? depthResult.source === 'apple_lidar'
      ? `苹果 LiDAR 同步测距：${formatContinuousNarrationDepthSummary(depthResult.summary)}。先根据本次画面确定主要目标所在分区，再使用该分区距离并说“大约”或“左右”；不得把全画面最近距离当成目标距离，分区不明确时不要报具体米数。`
      : `视觉估距素材：${formatContinuousNarrationDepthSummary(depthResult.summary)}。这是单摄像头粗略估算，不是雷达；只能结合本次画面使用“大约”或“左右”，不得精确到厘米，不确定时不要说距离。`
    : '';
  const sent = sendGeminiLiveEvent({
    type: 'ask',
    text: `[NARRATE]当前固定播报重点：${focus}。只根据本次请求附带的最新画面，每轮只说一句约二十个汉字的中文，只保留最重要的一件事。有可靠目标距离时，把方位和大约几米放在句首，例如“前方约两米有一张桌子”；省略“距离”二字，不把最近障碍距离当成目标距离。没有可靠距离就省略米数，不猜测，不重复重点，不寒暄。${depthPrompt}`,
    imageData
  });
  if (!sent) {
    reminder.turnInProgress = false;
    setGeminiAssistantResponseActive(reminder, false);
    return false;
  }
  setActiveReminderStatus(`持续播报运行中：当前重点是${focus}。`);
  logClientEvent('gemini_continuous.narration_requested', {
    focus,
    intervalSeconds: normalizeContinuousNarrationIntervalMs(reminder.continuousNarrationIntervalMs) / 1000,
    requestCount: reminder.continuousNarrationRequestCount,
    depthRequested,
    depthAvailable: Boolean(depthResult?.available),
    depthLatencyMs: Number(depthResult?.latencyMs || 0)
  });
  return true;
}

async function requestContinuousNarrationDepth(imageData) {
  const mimeType = String(imageData?.mimeType || '').trim();
  const data = String(imageData?.data || '').trim();
  if (!mimeType.startsWith('image/') || !data) {
    return { available: false, latencyMs: 0 };
  }
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONTINUOUS_NARRATION_DEPTH_TIMEOUT_MS);
  try {
    const response = await fetch('/api/continuous-narration-depth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageDataUrl: `data:${mimeType};base64,${data}`
      }),
      signal: controller.signal
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.ok || !result?.available || !result?.summary) {
      return {
        available: false,
        latencyMs: Number(result?.latencyMs || (Date.now() - startedAt))
      };
    }
    return {
      available: true,
      summary: result.summary,
      source: String(result.source || ''),
      latencyMs: Number(result.latencyMs || (Date.now() - startedAt))
    };
  } catch (error) {
    logClientEvent('gemini_continuous.depth_unavailable', {
      reason: error?.name === 'AbortError' ? 'timeout' : String(error?.message || error).slice(0, 80),
      latencyMs: Date.now() - startedAt
    });
    return { available: false, latencyMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timeout);
  }
}

async function requestAliCheapVision37Answer(imageData, taskType, instruction, depthResult = null) {
  const mimeType = String(imageData?.mimeType || '').trim();
  const data = String(imageData?.data || '').trim();
  if (!mimeType.startsWith('image/') || !data) {
    throw new Error('没有取得当前画面。');
  }
  const trustedAppleLidar = Boolean(
    depthResult?.available
    && depthResult?.source === 'apple_lidar'
    && depthResult?.summary
  );
  const result = await apiPost('/api/ali-cheap-vision37-answer', {
    imageDataUrl: `data:${mimeType};base64,${data}`,
    taskType,
    instruction,
    depthSource: trustedAppleLidar ? 'apple_lidar' : '',
    depthSummary: trustedAppleLidar ? depthResult.summary : null
  });
  const spokenText = String(result?.spokenText || '').replace(/\s+/g, ' ').trim();
  if (!spokenText) {
    throw new Error('3.7 没有返回可播报结果。');
  }
  return {
    spokenText,
    model: String(result.model || ''),
    latencyMs: Number(result.latencyMs || 0),
    depthSource: String(result.depthSource || '')
  };
}

function formatContinuousNarrationDepthSummary(summary) {
  const rowNames = { upper: '上方', middle: '中部', lower: '下方' };
  const columnNames = { left: '左侧', center: '中央', right: '右侧' };
  const zones = Array.isArray(summary?.zones) ? summary.zones : [];
  const parts = zones
    .map((zone) => {
      const row = rowNames[zone?.row];
      const column = columnNames[zone?.column];
      const meters = Number(zone?.approximateMeters);
      return row && column && Number.isFinite(meters)
        ? `${row}${column}约${meters.toFixed(1)}米`
        : '';
    })
    .filter(Boolean);
  const overallNearM = Number(summary?.overallNearM);
  if (Number.isFinite(overallNearM)) {
    parts.push(`画面较近区域约${overallNearM.toFixed(1)}米`);
  }
  return parts.join('，');
}

function normalizeContinuousNarrationIntervalMs(value) {
  const intervalMs = Number(value);
  if (
    !Number.isFinite(intervalMs)
    || intervalMs < CONTINUOUS_NARRATION_MIN_INTERVAL_MS
    || intervalMs > CONTINUOUS_NARRATION_MAX_INTERVAL_MS
  ) {
    return CONTINUOUS_NARRATION_INTERVAL_MS;
  }
  return Math.round(intervalMs / 1000) * 1000;
}

function parseContinuousNarrationNumber(value) {
  const text = String(value || '').trim();
  if (/^\d{1,3}$/.test(text)) {
    return Number(text);
  }
  if (!/^[零〇一二两三四五六七八九十百]+$/.test(text)) {
    return 0;
  }
  const digits = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const units = { 十: 10, 百: 100 };
  let total = 0;
  let current = 0;
  for (const character of text) {
    if (Object.prototype.hasOwnProperty.call(digits, character)) {
      current = digits[character];
      continue;
    }
    const unit = units[character] || 0;
    if (unit) {
      total += (current || 1) * unit;
      current = 0;
    }
  }
  return total + current;
}

function extractContinuousNarrationIntervalMs(transcript) {
  const compact = String(transcript || '').replace(/[，,。.!！?？；;：:\s]/g, '');
  const valuePattern = '([0-9]{1,3}|[零〇一二两三四五六七八九十百]{1,8})';
  const matches = [
    compact.match(new RegExp(`(?:间隔(?:时间)?(?:为|是)?|每隔|每)${valuePattern}秒(?:钟)?`)),
    compact.match(new RegExp(`${valuePattern}秒(?:钟)?(?:播报)?(?:一次|一回)`)),
    compact.match(new RegExp(`以${valuePattern}秒(?:钟)?(?:作为|为)间隔`))
  ];
  for (const match of matches) {
    if (!match) {
      continue;
    }
    const intervalMs = parseContinuousNarrationNumber(match[1]) * 1000;
    if (
      intervalMs >= CONTINUOUS_NARRATION_MIN_INTERVAL_MS
      && intervalMs <= CONTINUOUS_NARRATION_MAX_INTERVAL_MS
    ) {
      return intervalMs;
    }
  }
  return 0;
}

function resolveContinuousNarrationIntervalMs(transcript) {
  return extractContinuousNarrationIntervalMs(transcript) || CONTINUOUS_NARRATION_INTERVAL_MS;
}

function normalizeContinuousNarrationInstruction(transcript) {
  return String(transcript || '')
    .replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function applyInitialContinuousNarrationInstruction(reminder, instruction) {
  const focus = normalizeContinuousNarrationInstruction(instruction);
  if (!reminder || !focus) {
    return null;
  }
  reminder.continuousNarrationFocus = focus;
  reminder.continuousNarrationActive = true;
  reminder.continuousNarrationAwaitingFocus = false;
  reminder.continuousNarrationDepthRequested = resolvePlatformContinuousNarrationDepthRequested(focus);
  reminder.continuousNarrationIntervalMs = resolveContinuousNarrationIntervalMs(focus);
  reminder.continuousNarrationLastRequestAt = 0;
  reminder.continuousNarrationRequestCount = 0;
  reminder.continuousNarrationUserSpeechUntil = 0;
  reminder.initialInstruction = '';
  setLocalMicrophoneEnabled(false, 'continuous narration focus established; button-only mode');
  return {
    focus,
    intervalSeconds: reminder.continuousNarrationIntervalMs / 1000,
    depthRequested: reminder.continuousNarrationDepthRequested
  };
}

function resolveContinuousNarrationDepthRequested(transcript) {
  let compact = String(transcript || '').replace(/[，,。.!！?？；;：:\s]/g, '');
  compact = compact.replace(
    /(?:不要|不用|无需|别)(?:再)?(?:播报|告诉我|说明|提供)?(?:任何)?(?:距离|远近|多远|几米|多少米|米数)/g,
    ''
  );
  return (
    /距离|多远|几米|多少米|远近|米数/.test(compact)
    || /离(?:我|镜头|手机|当前位置).{0,12}(?:多远|几米|多少米)/.test(compact)
    || /(?:[0-9]{1,3}|[零〇一二两三四五六七八九十百]{1,8})米(?:内|以内|范围内)/.test(compact)
  );
}

function resolvePlatformContinuousNarrationDepthRequested(transcript) {
  if (window.__ACCESSIBLE_VISION_NATIVE_IOS__) {
    return true;
  }
  return appState.appVariant === 'greencloud-gemini';
}

async function startGeminiAudioCapture(reminder) {
  if (!appState.stream) {
    throw new Error('没有可用的麦克风流。');
  }
  const inputContext = new AudioContext();
  reminder.inputAudioContext = inputContext;
  if (inputContext.state === 'suspended') {
    await inputContext.resume();
  }
  const source = inputContext.createMediaStreamSource(appState.stream);
  reminder.audioSource = source;
  if (inputContext.audioWorklet) {
    await inputContext.audioWorklet.addModule('/audio-worklet.js');
    const processor = new AudioWorkletNode(inputContext, 'pcm-capture');
    const silenceGain = inputContext.createGain();
    silenceGain.gain.value = 0;
    processor.port.onmessage = (event) => handleGeminiAudioFrame(event.data, inputContext.sampleRate);
    source.connect(processor);
    processor.connect(silenceGain);
    silenceGain.connect(inputContext.destination);
    reminder.audioProcessor = processor;
    reminder.audioSilenceGain = silenceGain;
    return;
  }
  const processor = inputContext.createScriptProcessor(4096, 1, 1);
  const silenceGain = inputContext.createGain();
  silenceGain.gain.value = 0;
  processor.onaudioprocess = (event) => {
    handleGeminiAudioFrame(event.inputBuffer.getChannelData(0), inputContext.sampleRate);
  };
  source.connect(processor);
  processor.connect(silenceGain);
  silenceGain.connect(inputContext.destination);
  reminder.audioProcessor = processor;
  reminder.audioSilenceGain = silenceGain;
}

function setGeminiAssistantResponseActive(reminder, active) {
  if (!reminder) {
    return;
  }
  reminder.assistantResponseActive = Boolean(active);
  if (reminder.assistantResponseMuteTimer) {
    clearTimeout(reminder.assistantResponseMuteTimer);
    reminder.assistantResponseMuteTimer = null;
  }
  if (!active || !reminder.strictMuteDuringResponse) {
    return;
  }
  reminder.assistantResponseMuteTimer = setTimeout(() => {
    if (appState.geminiReminder !== reminder || !reminder.assistantResponseActive) {
      return;
    }
    reminder.assistantResponseActive = false;
    reminder.assistantResponseMuteTimer = null;
    logClientEvent('gemini_live.response_mute_watchdog_released', {
      label: reminder.reminderLabel || 'Gemini 合同实验'
    });
  }, 20000);
}

function setGeminiPrePlaybackMicGuard(reminder, active, reason = '') {
  if (!reminder) {
    return;
  }
  if (reminder.prePlaybackMicGuardTimer) {
    clearTimeout(reminder.prePlaybackMicGuardTimer);
    reminder.prePlaybackMicGuardTimer = null;
  }
  reminder.prePlaybackMicGuardActive = Boolean(active);
  reminder.prePlaybackMicGuardReason = active ? reason : '';
  if (!active) {
    return;
  }
  reminder.audioQueue = [];
  reminder.audioQueueBytes = 0;
  reminder.prePlaybackMicGuardTimer = setTimeout(() => {
    if (appState.geminiReminder !== reminder || !reminder.prePlaybackMicGuardActive) {
      return;
    }
    reminder.prePlaybackMicGuardActive = false;
    reminder.prePlaybackMicGuardTimer = null;
    reminder.prePlaybackMicGuardReason = '';
    logClientEvent('gemini_live.preplay_mic_guard_watchdog_released', {
      reason
    });
  }, 8000);
}

function stopGeminiActiveReminder(message = '') {
  const reminder = appState.geminiReminder;
  if (!reminder) {
    return;
  }
  reminder.stopping = true;
  reminder.webSearchController?.close();
  if (reminder.findScreenTransport === 'gemini_live' && reminder.reminderSessionId) {
    fetch('/api/find-object-live-close', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        reminderSessionId: reminder.reminderSessionId
      }),
      keepalive: true
    }).catch(() => {});
  }
  if (reminder.findScreenTransport === 'browser_direct_live') {
    stopBrowserDirectFindScreenSessions(reminder, 'session_stopped');
  }
  setGeminiAssistantResponseActive(reminder, false);
  setGeminiPrePlaybackMicGuard(reminder, false);
  if (reminder.reconnectTimer) {
    clearTimeout(reminder.reconnectTimer);
    reminder.reconnectTimer = null;
  }
  if (reminder.unifiedOneShotQuestionTimer) {
    clearTimeout(reminder.unifiedOneShotQuestionTimer);
    reminder.unifiedOneShotQuestionTimer = null;
  }
  rollbackGeminiPendingAlertDelivery(reminder, 'session_stopped');
  if (reminder.videoTimer) {
    clearInterval(reminder.videoTimer);
  }
  if (reminder.reminderTimer) {
    clearInterval(reminder.reminderTimer);
  }
  if (reminder.audioProcessor) {
    reminder.audioProcessor.disconnect();
  }
  if (reminder.audioSource) {
    reminder.audioSource.disconnect();
  }
  if (reminder.audioSilenceGain) {
    reminder.audioSilenceGain.disconnect();
  }
  if (reminder.player) {
    reminder.player.reset('gemini_stopped');
  }
  if (reminder.socket && reminder.socket.readyState <= WebSocket.OPEN) {
    reminder.socket.close();
  }
  try {
    reminder.session?.close?.();
  } catch {
    // Gemini browser-direct session may already be closed.
  }
  queueIOSAudioContextClose(reminder.audioContext, 'gemini_output');
  queueIOSAudioContextClose(reminder.inputAudioContext, 'gemini_input');
  appState.geminiReminder = null;
  syncSpecialTaskStopControl();
  if (message) {
    setActiveReminderStatus(message);
  }
}

function normalizeGeminiReminderContractField(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function validateGeminiReminderFunctionContract(args) {
  const contractType = String(args?.contractType || '').trim();
  const contractTypes = {
    appearance_once: { category: 'target_presence', mode: 'appear', lifecycle: 'once' },
    appearance_new_instances: { category: 'target_presence', mode: 'appear', lifecycle: 'distinct_occurrences' },
    result_once: { category: 'state_tracking', mode: 'result_reached', lifecycle: 'once' },
    change_continuous: { category: 'state_tracking', mode: 'state_changed', lifecycle: 'continuous_changes' }
  };
  const typeContract = contractTypes[contractType] || null;
  const category = typeContract?.category || '';
  const mode = typeContract?.mode || '';
  const lifecycle = typeContract?.lifecycle || '';
  const target = normalizeGeminiReminderContractField(args?.filterSubject);
  const condition = normalizeGeminiReminderContractField(args?.yesCondition);
  const speakText = normalizeGeminiReminderContractField(args?.yesSpeech);
  const fieldLengthsValid = target.length <= 80 && condition.length <= 180 && speakText.length <= 100;
  const serializationSafe = ![target, condition, speakText].some((value) => /[；;\r\n]/.test(value));
  if (!typeContract || !fieldLengthsValid || !serializationSafe || !target || !condition || !speakText) {
    return {
      ok: false,
      error: '合同字段缺失、合同单选无效或字段不能安全执行。'
    };
  }
  const contract = {
    contractType,
    category,
    mode,
    lifecycle,
    filterSubject: target,
    yesCondition: condition,
    yesSpeech: speakText,
    target,
    condition,
    speakText
  };
  const taskText = category === 'state_tracking'
    ? `任务类型：state_tracking。调度合同：category=state_tracking；mode=${mode}；lifecycle=${lifecycle}；target=${target}；condition=${condition}；speakText=${speakText}。快筛职责：每帧只输出 currentState、resultReached、resultText；未达成、没看到、看不清、不确定或中间状态不得播报。`
    : `任务类型：target_presence。调度合同：category=target_presence；mode=appear；lifecycle=${lifecycle}；target=${target}；condition=${condition}；speakText=${speakText}。快筛职责：只在目标明确出现时 HIT；未发现、看不清、不确定不得播报。`;
  return { ok: true, contract, taskText };
}

function validateGeminiFindObjectCommand(args) {
  const action = String(args?.action || '').trim();
  const target = normalizeGeminiReminderContractField(args?.target);
  if (['cancel', 'complete', 'resume'].includes(action) && !target) {
    return { ok: true, action, target: '' };
  }
  if (
    action !== 'start'
    || !target
    || target.length > 80
    || /[；;\r\n]/.test(target)
  ) {
    return { ok: false, error: '找物指令缺少有效的唯一目标。' };
  }
  return { ok: true, action, target };
}

function validateGeminiContinuousNarrationCommand(args) {
  const action = String(args?.action || '').trim();
  const focus = normalizeGeminiReminderContractField(args?.focus);
  if (action === 'cancel' && !focus) {
    return { ok: true, action, focus: '' };
  }
  if (action !== 'set' || !focus || focus.length > 80 || /[；;\r\n]/.test(focus)) {
    return { ok: false, error: '持续播报指令缺少有效的唯一重点。' };
  }
  return { ok: true, action, focus };
}

function validateGeminiUnifiedModeCommand(args) {
  const action = String(args?.action || '').trim();
  const subject = normalizeGeminiReminderContractField(args?.subject);
  if (['route_active_reminder', 'confirm', 'reject', 'cancel_current'].includes(action) && !subject) {
    return {
      ok: true,
      action,
      subject: '',
      mode: action === 'route_active_reminder' ? 'function_contract' : ''
    };
  }
  const mode = action === 'propose_find_object'
    ? 'find_object'
    : action === 'propose_continuous_narration'
      ? 'continuous_narration'
      : '';
  if (!mode || !subject || subject.length > 100 || /[；;\r\n]/.test(subject)) {
    return { ok: false, error: '统一入口候选缺少有效模式或任务内容。' };
  }
  return { ok: true, action, subject, mode };
}

function clearGeminiContinuousNarrationMemory(reminder) {
  if (!reminder) {
    return;
  }
  reminder.continuousNarrationFocus = '';
  reminder.continuousNarrationActive = false;
  reminder.continuousNarrationAwaitingFocus = false;
  reminder.continuousNarrationPrefixPendingAt = 0;
  reminder.continuousNarrationCommandActionThisTurn = '';
  reminder.continuousNarrationDepthRequested = false;
  reminder.continuousNarrationIntervalMs = CONTINUOUS_NARRATION_INTERVAL_MS;
  reminder.continuousNarrationLastRequestAt = Date.now();
  reminder.continuousNarrationRequestCount = 0;
  reminder.continuousNarrationUserSpeechUntil = 0;
  reminder.activeContinuousNarrationCallId = '';
  if (appState.geminiReminder === reminder) {
    syncSpecialTaskStopControl();
  }
}

function activateGeminiUnifiedExecutionMode(reminder, mode, pending = null) {
  if (!reminder?.unifiedAssistantMode) {
    return false;
  }
  const previousMode = getGeminiReminderExecutionMode(reminder);
  reminder.activeTaskSeq = (reminder.activeTaskSeq || 0) + 1;
  clearGeminiReminderTaskForNewInstruction(reminder, `unified_switch_${mode}`);
  reminder.findTaskSeq = (reminder.findTaskSeq || 0) + 1;
  clearGeminiFindObjectMemory(reminder, `unified_switch_${mode}`);
  clearGeminiContinuousNarrationMemory(reminder);
  reminder.unifiedPendingMode = null;
  reminder.unifiedActiveMode = mode;
  reminder.inFlight = false;
  reminder.turnInProgress = true;

  if (mode === 'find_object') {
    reminder.findTarget = normalizeGeminiReminderContractField(pending?.subject);
    reminder.findTaskSeq = (reminder.findTaskSeq || 0) + 1;
    if (reminder.findTarget) {
      setLocalMicrophoneEnabled(false, 'find object started; button-only mode');
    }
    setActiveReminderStatus(`找东西正在寻找：${reminder.findTarget}。请慢慢移动镜头。`);
  } else if (mode === 'continuous_narration') {
    const instruction = String(pending?.instruction || pending?.subject || '').replace(/\s+/g, ' ').trim().slice(0, 100);
    reminder.continuousNarrationFocus = instruction;
    reminder.continuousNarrationActive = Boolean(instruction);
    reminder.continuousNarrationAwaitingFocus = !instruction;
    reminder.continuousNarrationDepthRequested = resolvePlatformContinuousNarrationDepthRequested(instruction);
    reminder.continuousNarrationIntervalMs = resolveContinuousNarrationIntervalMs(instruction);
    reminder.continuousNarrationLastRequestAt = 0;
    reminder.continuousNarrationRequestCount = 0;
    reminder.continuousNarrationUserSpeechUntil = 0;
    if (reminder.continuousNarrationActive) {
      setLocalMicrophoneEnabled(false, 'continuous narration started; button-only mode');
    }
    setActiveReminderStatus(`持续播报已开始：${instruction}；间隔${reminder.continuousNarrationIntervalMs / 1000}秒。`);
  } else if (mode === 'function_contract') {
    setActiveReminderStatus('实时慧眼正在建立主动提醒合同。');
  }

  logClientEvent('gemini_unified.mode_activated', {
    previousMode,
    mode,
    subject: pending?.subject || '',
    intervalSeconds: mode === 'continuous_narration'
      ? reminder.continuousNarrationIntervalMs / 1000
      : '',
    depthRequested: mode === 'continuous_narration'
      ? reminder.continuousNarrationDepthRequested
      : false
  });
  syncSpecialTaskStopControl({ focus: mode === 'find_object' || mode === 'continuous_narration' });
  return true;
}

function clearGeminiFindObjectMemory(reminder, reason = '') {
  if (!reminder) {
    return;
  }
  const previousTarget = reminder.findTarget || '';
  reminder.findTarget = '';
  reminder.findLastStatus = '';
  reminder.findLastSpokenStatus = '';
  reminder.findLastSpokenAt = 0;
  reminder.findApproachStatus = '';
  reminder.findApproachCount = 0;
  reminder.findLocationAnnounced = false;
  reminder.findContactCount = 0;
  reminder.findContactCompletionPending = false;
  reminder.findContactCompletionFrameCount = 0;
  reminder.findContactCompletionConfidence = 0;
  reminder.findTargetSeenCount = 0;
  reminder.findReacquireCount = 0;
  reminder.findOcclusionCount = 0;
  reminder.findTargetLocked = false;
  reminder.findReferenceImageDataUrl = '';
  reminder.findReferenceFrameCount = 0;
  reminder.findSubjectLocked = false;
  reminder.findSubjectReferenceImageDataUrl = '';
  reminder.findSubjectReferenceFrameCount = 0;
  reminder.findSubjectReferenceTargetX = null;
  reminder.findSubjectReferenceTargetY = null;
  reminder.findTouchConfirmationPending = false;
  reminder.findTouchConfirmationAskedAt = 0;
  reminder.findLastErrorSpokenAt = 0;
  reminder.activeFindCallId = '';
  reminder.inFlight = false;
  logClientEvent('gemini_find.memory_cleared', {
    reason,
    previousTarget,
    findTaskSeq: reminder.findTaskSeq || 0
  });
  if (appState.geminiReminder === reminder) {
    syncSpecialTaskStopControl();
  }
}

function normalizeGeminiUnifiedConfirmationMeaning(value) {
  return String(value || '')
    .replace(/\s+/g, '')
    .replace(/[，,。.!！?？；;：:、"'“”‘’]/g, '')
    .replace(/(已经|当前|画面中|画面里|明确|一下|一下子)/g, '')
    .replace(/[的了着我你您会将]/g, '');
}

function buildGeminiUnifiedSubjectTermGroups(subject, continuous = false) {
  const text = String(subject || '').trim();
  if (!continuous) {
    return text ? [[text]] : [];
  }
  return text
    .split(/[，,；;]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => [item]);
}

function buildGeminiUnifiedContractTermGroups(contract) {
  const contractType = String(contract?.contractType || '').trim();
  const target = String(contract?.filterSubject || contract?.target || '').trim();
  const condition = String(contract?.yesCondition || contract?.condition || '').trim();
  const speech = String(contract?.yesSpeech || contract?.speakText || '').trim();
  if (contractType === 'change_continuous') {
    return [
      ...(target ? [[target]] : []),
      ['变化', '改变']
    ];
  }
  if (contractType === 'result_once') {
    return [[condition, speech].filter((item) => normalizeGeminiUnifiedConfirmationMeaning(item))];
  }
  return target ? [[target]] : [];
}

function geminiUnifiedConfirmationContainsTerms(output, termGroups) {
  const normalizedOutput = normalizeGeminiUnifiedConfirmationMeaning(output);
  return Array.isArray(termGroups) && termGroups.every((alternatives) => (
    Array.isArray(alternatives)
    && alternatives.some((term) => {
      const normalizedTerm = normalizeGeminiUnifiedConfirmationMeaning(term);
      return normalizedTerm && normalizedOutput.includes(normalizedTerm);
    })
  ));
}

function prepareGeminiUnifiedMechanicalConfirmation(reminder, text, termGroups = []) {
  const speech = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 180);
  if (!reminder?.unifiedAssistantMode || !speech) {
    return false;
  }
  reminder.unifiedMechanicalConfirmation = {
    text: speech,
    termGroups,
    bufferedAudioParts: [],
    discardToolContinuation: true
  };
  reminder.player?.reset('mechanical_confirmation_prepared');
  reminder.playbackActive = false;
  reminder.playbackUntil = 0;
  logClientEvent('gemini_unified.mechanical_confirmation_prepared', {
    text: speech,
    termGroups
  });
  return true;
}

function extractGeminiUnifiedRawInstruction(reminder, message) {
  const buffered = String(reminder?.inputTranscriptBuffer || '').replace(/\s+/g, ' ').trim();
  const messageInput = String(
    message?.inputText
    || extractGeminiTranscriptionText(message?.serverContent?.inputTranscription)
    || ''
  ).replace(/\s+/g, ' ').trim();
  if (!messageInput || buffered.endsWith(messageInput)) {
    return buffered.slice(0, 500);
  }
  return `${buffered} ${messageInput}`.trim().slice(0, 500);
}

function geminiStandaloneModeOptions(
  mode,
  initialInstruction,
  browserDirectScreenExperiment = false,
  visualAssistantBaseExperiment = false
) {
  const common = {
    initialInstruction,
    reuseExistingStream: true,
    launchedFromUnified: true,
    visualAssistantBaseExperiment,
    browserDirectScreenExperiment,
    muteMicDuringPlayback: true,
    strictMuteDuringResponse: true
  };
  if (mode === 'find_object') {
    return {
      ...common,
      label: appState.appVariant === 'greencloud-gemini'
        ? 'Gemini 找东西实验'
        : '阿里快筛找东西实验',
      promptMode: 'find_object',
      deliveryMode: 'guidance',
      taskSourceMode: 'find_object',
      findScreenTransport: browserDirectScreenExperiment
        ? 'browser_direct_live'
        : 'generate_content',
      thinkingLevel: 'medium'
    };
  }
  if (mode === 'continuous_narration') {
    return {
      ...common,
      label: '持续播报',
      promptMode: 'continuous_narration',
      deliveryMode: 'narration',
      taskSourceMode: 'continuous_narration',
      thinkingLevel: 'low'
    };
  }
  return {
    ...common,
    label: 'Gemini 合同实验',
    promptMode: 'deep_multitask',
    deliveryMode: 'result',
    taskSourceMode: 'function_contract',
    activeScreenTransport: browserDirectScreenExperiment
      ? 'browser_direct_generate_content'
      : 'server_generate_content',
    thinkingLevel: 'medium'
  };
}

function scheduleGeminiUnifiedHandoff(reminder, mode, instruction) {
  const rawInstruction = String(instruction || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (
    (!reminder?.unifiedAssistantMode && !reminder?.allowUnifiedTaskReplacement)
    || !rawInstruction
  ) {
    logClientEvent('gemini_unified.handoff_rejected', {
      mode,
      reason: 'missing_raw_instruction'
    });
    return false;
  }
  reminder.unifiedHandoff = { mode, instruction: rawInstruction };
  window.setTimeout(async () => {
    if (appState.geminiReminder !== reminder || reminder.stopping) {
      return;
    }
    const handoff = reminder.unifiedHandoff;
    if (!handoff) {
      return;
    }
    reminder.unifiedHandoff = null;
    logClientEvent('gemini_unified.handoff_started', {
      mode: handoff.mode,
      instruction: handoff.instruction
    });
    stopGeminiActiveReminder();
    try {
      await startGeminiReminderMode(
        geminiStandaloneModeOptions(
          handoff.mode,
          handoff.instruction,
          Boolean(reminder.browserDirectScreenExperiment),
          Boolean(reminder.visualAssistantBaseExperiment)
        )
      );
      logClientEvent('gemini_unified.handoff_completed', {
        mode: handoff.mode,
        instruction: handoff.instruction
      });
    } catch (error) {
      appendVisionLog(`实时慧眼切换失败：${error.message}`);
      logClientEvent('gemini_unified.handoff_failed', {
        mode: handoff.mode,
        error: error.message
      });
    }
  }, 80);
  return true;
}

function resolveUnifiedMechanicalModeCue(transcript) {
  const compact = String(transcript || '')
    .replace(/\s+/g, '')
    .replace(/[，,。.!！?？；;：:、"'“”‘’]/g, '');
  if (!compact) {
    return '';
  }
  const ordinaryText = compact.replace(/^(请你|请|麻烦你|麻烦|能不能|可以请你)/, '');
  if (/^(问一下|问一问)/.test(ordinaryText)) {
    return 'ordinary_question';
  }
  const findMatch = compact.match(/^(帮我找|给我找)(.+)$/);
  if (findMatch && !/^(东西|一下|一找)$/.test(findMatch[2])) {
    return 'find_object';
  }
  if (/^持续播报/.test(compact)) {
    return 'continuous_narration';
  }
  if (/(提醒我|告诉我|通知我|说一声)/.test(compact)) {
    return 'function_contract';
  }
  return '';
}

function isBareContinuousNarrationPrefix(transcript) {
  const compact = String(transcript || '')
    .replace(/\s+/g, '')
    .replace(/[，,。.!！?？；;：:、"'“”‘’]/g, '');
  return compact === '持续播报';
}

function resolveVisualAssistantStrictSpecialModeCue(transcript) {
  const compact = String(transcript || '')
    .replace(/\s+/g, '')
    .replace(/[，,。.!！?？；;：:、"'“”‘’]/g, '');
  if (!compact) {
    return '';
  }
  const findMatch = compact.match(/^(帮我找|给我找)(.+)$/);
  if (findMatch && !/^(东西|一下|一找)$/.test(findMatch[2])) {
    return 'find_object';
  }
  if (/^持续播报/.test(compact)) {
    return 'continuous_narration';
  }
  return '';
}

function isUnifiedMechanicalConfirmation(transcript, expected) {
  const compact = String(transcript || '')
    .replace(/\s+/g, '')
    .replace(/[，,。.!！?？；;：:、"'“”‘’]/g, '');
  if (expected === 'confirm') {
    return /^(是|是的|对|对的|可以|开始|是开始|对开始|可以开始)$/.test(compact);
  }
  return /^(不是|不对|不用|取消|先不用|不要)$/.test(compact);
}

function clearUnifiedPendingCandidateForNewInstruction(reminder, instruction, source = '') {
  const pending = reminder?.unifiedPendingMode;
  if (!pending) {
    return false;
  }
  reminder.unifiedPendingMode = null;
  if (pending.activeReminderWasSuspended && appState.activeReminder) {
    appState.activeReminder.suspendUntil = 0;
  }
  logClientEvent('unified.pending_candidate_cleared_for_new_instruction', {
    source,
    previousMode: pending.mode || '',
    previousInstruction: pending.instruction || '',
    instruction: String(instruction || '').slice(0, 500)
  });
  return true;
}

async function handleGeminiUnifiedMechanicalFallback(
  reminder,
  input,
  unifiedCommandAcceptedThisTurn
) {
  if (
    !reminder?.unifiedAssistantMode
    || appState.geminiReminder !== reminder
    || unifiedCommandAcceptedThisTurn
  ) {
    return false;
  }
  const rawInstruction = String(input || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (!rawInstruction) {
    return false;
  }
  const pending = reminder.unifiedPendingMode;
  if (pending) {
    if (isUnifiedMechanicalConfirmation(rawInstruction, 'confirm')) {
      reminder.unifiedPendingMode = null;
      logClientEvent('gemini_unified.mechanical_confirm', {
        mode: pending.mode,
        instruction: pending.instruction
      });
      scheduleGeminiUnifiedHandoff(reminder, pending.mode, pending.instruction);
      return true;
    }
    if (isUnifiedMechanicalConfirmation(rawInstruction, 'reject')) {
      reminder.unifiedPendingMode = null;
      sendGeminiLiveEvent({
        type: 'say',
        text: '已取消本次任务。',
        deliveryMode: 'unified_confirmation_rejected'
      });
      logClientEvent('gemini_unified.mechanical_reject', {
        mode: pending.mode,
        instruction: pending.instruction
      });
      return true;
    }
    clearUnifiedPendingCandidateForNewInstruction(
      reminder,
      rawInstruction,
      'gemini_mechanical_fallback'
    );
  }
  const mode = resolveUnifiedMechanicalModeCue(rawInstruction);
  if (!mode) {
    sendGeminiLiveEvent({
      type: 'say',
      text: '你是要找东西、持续描述、设置提醒，还是问一下当前画面？',
      deliveryMode: 'unified_clarification'
    });
    logClientEvent('gemini_unified.mechanical_clarification', {
      instruction: rawInstruction
    });
    return true;
  }
  if (mode === 'ordinary_question') {
    reminder.unifiedOneShotQuestionInFlight = true;
    const imageData = captureGeminiContinuousNarrationFrame();
    const sent = sendGeminiLiveEvent({
      type: 'ask',
      text: `[ONE_SHOT_QUESTION]${rawInstruction}`,
      imageData,
      deliveryMode: 'unified_one_shot_question'
    });
    if (!sent) {
      reminder.unifiedOneShotQuestionInFlight = false;
      sendGeminiLiveEvent({
        type: 'say',
        text: '这次没有取得当前画面，请再问一次。',
        deliveryMode: 'unified_one_shot_question_failed'
      });
    }
    logClientEvent('gemini_unified.one_shot_question_requested', {
      instruction: rawInstruction,
      imageAttached: Boolean(imageData),
      sent: Boolean(sent)
    });
    return true;
  }
  if (mode === 'function_contract') {
    logClientEvent('gemini_unified.mechanical_route', {
      mode,
      instruction: rawInstruction
    });
    scheduleGeminiUnifiedHandoff(reminder, mode, rawInstruction);
    return true;
  }
  reminder.unifiedClassifyInFlight = true;
  try {
    const result = await apiPost('/api/unified-visual-task-classify', {
      transcript: rawInstruction,
      activeMode: '',
      pendingMode: '',
      pendingSubject: '',
      findTouchConfirmationPending: false
    });
    if (
      appState.geminiReminder !== reminder
      || reminder.stopping
      || !reminder.unifiedAssistantMode
    ) {
      return true;
    }
    const expectedAction = mode === 'find_object'
      ? 'propose_find_object'
      : 'propose_continuous_narration';
    if (result.action !== expectedAction || !result.subject || !result.confirmationSpeech) {
      sendGeminiLiveEvent({
        type: 'say',
        text: '你是要找东西、持续描述、设置提醒，还是问一下当前画面？',
        deliveryMode: 'unified_clarification'
      });
      logClientEvent('gemini_unified.mechanical_route_rejected', {
        mode,
        instruction: rawInstruction,
        action: result.action || ''
      });
      return true;
    }
    reminder.unifiedPendingMode = {
      mode,
      subject: result.subject,
      instruction: rawInstruction,
      previousMode: ''
    };
    if (
      reminder.browserDirectScreenExperiment
      && mode === 'continuous_narration'
    ) {
      reminder.unifiedPendingMode = null;
      logClientEvent('gemini_unified.mechanical_direct_handoff', {
        mode,
        subject: result.subject,
        instruction: rawInstruction
      });
      scheduleGeminiUnifiedHandoff(reminder, mode, rawInstruction);
      return true;
    }
    sendGeminiLiveEvent({
      type: 'say',
      text: result.confirmationSpeech,
      deliveryMode: 'unified_confirmation'
    });
    setActiveReminderStatus(`等待确认：${result.confirmationSpeech}`);
    logClientEvent('gemini_unified.mechanical_candidate_created', {
      mode,
      subject: result.subject,
      instruction: rawInstruction,
      confirmationSpeech: result.confirmationSpeech
    });
    return true;
  } catch (error) {
    if (appState.geminiReminder === reminder && !reminder.stopping) {
      sendGeminiLiveEvent({
        type: 'say',
        text: '这次任务没有建立成功，请重新说一次。',
        deliveryMode: 'unified_route_failed'
      });
    }
    logClientEvent('gemini_unified.mechanical_route_failed', {
      mode,
      instruction: rawInstruction,
      error: error.message
    });
    return true;
  } finally {
    if (appState.geminiReminder === reminder) {
      reminder.unifiedClassifyInFlight = false;
    }
  }
}

function geminiUnifiedRouterOptions({
  suppressOpeningPrompt = false,
  returnAnnouncement = '',
  browserDirectScreenExperiment = false
} = {}) {
  return {
    label: browserDirectScreenExperiment
      ? '实时慧眼（手机直连筛图）'
      : '实时慧眼',
    promptMode: 'deep_multitask',
    deliveryMode: 'result',
    taskSourceMode: 'unified_assistant',
    browserDirectScreenExperiment,
    activeScreenTransport: browserDirectScreenExperiment
      ? 'browser_direct_generate_content'
      : 'server_generate_content',
    findScreenTransport: browserDirectScreenExperiment
      ? 'browser_direct_live'
      : 'generate_content',
    thinkingLevel: 'medium',
    muteMicDuringPlayback: true,
    strictMuteDuringResponse: true,
    reuseExistingStream: true,
    suppressOpeningPrompt,
    returnAnnouncement
  };
}

function geminiVisualAssistantBaseOptions({
  label = '',
  browserDirectScreenExperiment = false,
  reuseExistingStream = false,
  returnAnnouncement = ''
} = {}) {
  return {
    label: label || (browserDirectScreenExperiment
      ? '实时慧眼（手机直连筛图）'
      : '实时慧眼（Google声音）'),
    promptMode: 'deep_multitask',
    deliveryMode: 'result',
    taskSourceMode: 'function_contract',
    browserDirectScreenExperiment,
    visualAssistantBaseExperiment: true,
    activeScreenTransport: browserDirectScreenExperiment
      ? 'browser_direct_generate_content'
      : 'server_generate_content',
    findScreenTransport: browserDirectScreenExperiment
      ? 'browser_direct_live'
      : 'generate_content',
    launchedFromUnified: true,
    thinkingLevel: 'medium',
    muteMicDuringPlayback: true,
    strictMuteDuringResponse: true,
    reuseExistingStream,
    suppressOpeningPrompt: true,
    returnAnnouncement
  };
}

function geminiBrowserDirectVisualAssistantBaseOptions(options = {}) {
  return geminiVisualAssistantBaseOptions({
    ...options,
    label: '实时慧眼（手机直连筛图）',
    browserDirectScreenExperiment: true
  });
}

function scheduleGeminiReturnToUnified(reminder, reason = '') {
  if (
    !reminder?.launchedFromUnified
    || reminder.returnToUnifiedScheduled
    || appState.geminiReminder !== reminder
  ) {
    return false;
  }
  reminder.returnToUnifiedScheduled = true;
  const deadline = Date.now() + 30000;
  const finishReturn = async () => {
    if (appState.geminiReminder !== reminder || reminder.stopping) {
      return;
    }
    if (
      Date.now() < deadline
      && (
        reminder.turnInProgress
        || reminder.assistantResponseActive
        || isGeminiPlaybackActive(reminder)
      )
    ) {
      window.setTimeout(finishReturn, 250);
      return;
    }
    logClientEvent('gemini_unified.return_started', {
      fromMode: reminder.taskSourceMode || '',
      reason
    });
    stopGeminiActiveReminder();
    try {
      const returningToVisualAssistantBase = Boolean(reminder.visualAssistantBaseExperiment);
      await startGeminiReminderMode(
        returningToVisualAssistantBase
          ? geminiVisualAssistantBaseOptions({
            label: reminder.browserDirectScreenExperiment
              ? '实时慧眼（手机直连筛图）'
              : '实时慧眼（Google声音）',
            browserDirectScreenExperiment: Boolean(reminder.browserDirectScreenExperiment),
            reuseExistingStream: true,
            returnAnnouncement: '当前专用任务已结束，视觉助手继续运行。'
          })
          : geminiUnifiedRouterOptions({
            suppressOpeningPrompt: true,
            returnAnnouncement: '当前任务已结束，已返回任务选择，可以说新任务。',
            browserDirectScreenExperiment: Boolean(reminder.browserDirectScreenExperiment)
          })
      );
      setLocalMicrophoneEnabled(true, 'special task completed; visual assistant restored');
      setActiveReminderStatus(returningToVisualAssistantBase
        ? '视觉助手已恢复：普通问答和主动提醒可以继续使用。'
        : '实时慧眼已返回任务分发，等待下一条指令。');
      logClientEvent('gemini_unified.return_completed', {
        fromMode: reminder.taskSourceMode || '',
        reason
      });
    } catch (error) {
      appendVisionLog(`实时慧眼返回分发失败：${error.message}`);
      logClientEvent('gemini_unified.return_failed', {
        fromMode: reminder.taskSourceMode || '',
        reason,
        error: error.message
      });
    }
  };
  window.setTimeout(finishReturn, 250);
  return true;
}

function pauseGeminiActiveReminderForSpecialModeDecision(reminder, reason) {
  if (!reminder?.visualAssistantBaseExperiment) {
    return;
  }
  reminder.activeTaskSeq = (reminder.activeTaskSeq || 0) + 1;
  rollbackGeminiPendingAlertDelivery(reminder, reason);
  reminder.pendingMessage = '';
  reminder.pendingTask = '';
  reminder.pendingSpeechText = '';
  logClientEvent('gemini_unified.active_base_paused', {
    reason,
    activeTaskSeq: reminder.activeTaskSeq,
    taskPreserved: Boolean(reminder.taskOverride)
  });
}

function handleGeminiUnifiedModeToolCall(message) {
  const reminder = appState.geminiReminder;
  const functionCalls = message?.toolCall?.functionCalls;
  if (
    (!reminder?.unifiedAssistantMode && !reminder?.allowUnifiedTaskReplacement)
    || !Array.isArray(functionCalls)
    || !functionCalls.some((call) => call?.name === GEMINI_UNIFIED_MODE_TOOL_NAME)
  ) {
    return false;
  }
  const functionResponses = [];
  let accepted = false;
  const rawInstruction = extractGeminiUnifiedRawInstruction(reminder, message);
  if (
    reminder.unifiedPendingMode
    && !isUnifiedMechanicalConfirmation(rawInstruction, 'confirm')
    && !isUnifiedMechanicalConfirmation(rawInstruction, 'reject')
  ) {
    clearUnifiedPendingCandidateForNewInstruction(
      reminder,
      rawInstruction,
      'gemini_tool_call'
    );
  }
  const currentMode = reminder.unifiedAssistantMode
    ? ''
    : getGeminiReminderExecutionMode(reminder);
  const strictSpecialMode = resolveVisualAssistantStrictSpecialModeCue(rawInstruction);
  const mechanicalMode = reminder.unifiedAssistantMode
    ? resolveUnifiedMechanicalModeCue(rawInstruction)
    : '';
  const expectedMechanicalAction = mechanicalMode === 'function_contract'
    ? 'route_active_reminder'
    : mechanicalMode === 'find_object'
      ? 'propose_find_object'
      : mechanicalMode === 'continuous_narration'
        ? 'propose_continuous_narration'
        : '';
  let handoff = null;
  for (const call of functionCalls) {
    if (accepted || call?.name !== GEMINI_UNIFIED_MODE_TOOL_NAME) {
      functionResponses.push({
        id: call?.id,
        name: call?.name || '',
        response: { result: 'rejected', error: accepted ? 'duplicate_command_in_turn' : 'mixed_functions_not_allowed' }
      });
      continue;
    }
    const command = validateGeminiUnifiedModeCommand(call.args);
    if (!command.ok) {
      functionResponses.push({
        id: call.id,
        name: call.name,
        response: { result: 'rejected', error: command.error }
      });
      logClientEvent('gemini_unified.command_rejected', {
        callId: call.id || '',
        error: command.error,
        args: call.args || {}
      });
      continue;
    }
    if (
      mechanicalMode === 'ordinary_question'
      || (
        expectedMechanicalAction
        && command.action !== expectedMechanicalAction
      )
    ) {
      functionResponses.push({
        id: call.id,
        name: call.name,
        response: {
          result: 'rejected',
          error: mechanicalMode === 'ordinary_question'
            ? 'one_shot_question_uses_no_tool'
            : 'mechanical_mode_mismatch',
          expectedAction: expectedMechanicalAction
        }
      });
      logClientEvent('gemini_unified.mechanical_tool_rejected', {
        callId: call.id || '',
        mode: mechanicalMode,
        action: command.action
      });
      continue;
    }
    const allowAggressiveReplacementCommand = Boolean(
      reminder.visualAssistantBaseExperiment
      && currentMode === 'function_contract'
      && (
        command.action.startsWith('propose_')
        || (
          reminder.unifiedPendingMode
          && (command.action === 'confirm' || command.action === 'reject')
        )
      )
    );
    if (currentMode && command.action !== 'cancel_current' && !allowAggressiveReplacementCommand) {
      functionResponses.push({
        id: call.id,
        name: call.name,
        response: {
          result: 'rejected',
          error: 'must_end_current_task_first',
          instruction: '请先结束当前任务，返回任务分发后再单独说新任务。'
        }
      });
      logClientEvent('gemini_unified.cross_mode_rejected', {
        callId: call.id || '',
        currentMode,
        action: command.action
      });
      continue;
    }
    if (command.action === 'cancel_current') {
      if (!currentMode) {
        functionResponses.push({
          id: call.id,
          name: call.name,
          response: { result: 'rejected', error: 'no_active_task' }
        });
        continue;
      }
      reminder.activeUnifiedModeCallId = call.id || '';
      accepted = true;
      reminder.returnToUnifiedAfterTurn = `cancel_${currentMode}`;
      functionResponses.push({
        id: call.id,
        name: call.name,
        response: {
          result: 'accepted',
          stoppedMode: currentMode,
          returnToDistributor: true
        }
      });
      setActiveReminderStatus('当前任务正在停止，随后返回任务分发。');
      logClientEvent('gemini_unified.current_task_cancelled', {
        callId: call.id || '',
        mode: currentMode
      });
      continue;
    }
    if (command.action === 'route_active_reminder') {
      if (currentMode === 'function_contract') {
        functionResponses.push({
          id: call.id,
          name: call.name,
          response: { result: 'rejected', error: 'same_mode_uses_current_module' }
        });
        continue;
      }
      if (!rawInstruction) {
        functionResponses.push({
          id: call.id,
          name: call.name,
          response: { result: 'rejected', error: 'missing_raw_instruction' }
        });
        continue;
      }
      reminder.activeUnifiedModeCallId = call.id || '';
      accepted = true;
      reminder.suppressUnifiedContinuationAudio = true;
      handoff = {
        mode: 'function_contract',
        instruction: rawInstruction
      };
      functionResponses.push({
        id: call.id,
        name: call.name,
        response: {
          result: 'handoff_started',
          mode: 'function_contract',
          speakNow: false
        }
      });
      setActiveReminderStatus('正在进入原主动提醒入口。');
      logClientEvent('gemini_unified.route_selected', {
        callId: call.id || '',
        mode: 'function_contract',
        instruction: rawInstruction
      });
      continue;
    }
    if (command.action.startsWith('propose_')) {
      if (!strictSpecialMode || command.mode !== strictSpecialMode) {
        functionResponses.push({
          id: call.id,
          name: call.name,
          response: {
            result: 'rejected',
            error: 'special_mode_requires_exact_opening',
            expectedMode: strictSpecialMode || 'ordinary_or_active_reminder'
          }
        });
        logClientEvent('gemini_unified.special_mode_proposal_blocked', {
          callId: call.id || '',
          strictSpecialMode,
          proposedMode: command.mode,
          instruction: rawInstruction
        });
        continue;
      }
      if (command.mode === currentMode) {
        functionResponses.push({
          id: call.id,
          name: call.name,
          response: { result: 'rejected', error: 'same_mode_uses_current_module' }
        });
        continue;
      }
      const instruction = rawInstruction;
      if (!instruction) {
        functionResponses.push({
          id: call.id,
          name: call.name,
          response: { result: 'rejected', error: 'missing_raw_instruction' }
        });
        continue;
      }
      const strictDirectHandoff = Boolean(
        reminder.visualAssistantBaseExperiment
        && currentMode === 'function_contract'
        && strictSpecialMode === command.mode
      );
      if (strictDirectHandoff) {
        pauseGeminiActiveReminderForSpecialModeDecision(
          reminder,
          `strict_handoff_${command.mode}`
        );
        reminder.unifiedPendingMode = null;
        reminder.activeUnifiedModeCallId = call.id || '';
        accepted = true;
        reminder.suppressUnifiedContinuationAudio = true;
        handoff = { mode: command.mode, instruction };
        functionResponses.push({
          id: call.id,
          name: call.name,
          response: {
            result: 'handoff_started',
            mode: command.mode,
            speakNow: false,
            taskStarted: false
          }
        });
        setActiveReminderStatus(command.mode === 'find_object'
          ? '正在从主动提醒切换到原找东西入口。'
          : '正在直接进入原持续播报入口。');
        logClientEvent('gemini_unified.aggressive_handoff_started', {
          callId: call.id || '',
          fromMode: currentMode,
          mode: command.mode,
          instruction
        });
        continue;
      }
      reminder.unifiedPendingMode = {
        mode: command.mode,
        subject: command.subject,
        instruction,
        previousMode: currentMode
      };
      pauseGeminiActiveReminderForSpecialModeDecision(
        reminder,
        `pending_confirmation_${command.mode}`
      );
      reminder.activeUnifiedModeCallId = call.id || '';
      accepted = true;
      functionResponses.push({
        id: call.id,
        name: call.name,
        response: {
          result: 'pending_confirmation',
          mode: command.mode,
          subject: command.subject,
          taskStarted: false
        }
      });
      setActiveReminderStatus(command.mode === 'find_object'
        ? `等待确认是否开始找：${command.subject}。`
        : `等待确认是否开始持续播报：${command.subject}。`);
      logClientEvent('gemini_unified.candidate_created', {
        callId: call.id || '',
        mode: command.mode,
        subject: command.subject,
        instruction,
        taskStarted: false
      });
      continue;
    }
    const pending = reminder.unifiedPendingMode;
    if (!pending) {
      functionResponses.push({
        id: call.id,
        name: call.name,
        response: { result: 'rejected', error: 'no_pending_candidate' }
      });
      continue;
    }
    if (command.action === 'reject') {
      reminder.unifiedPendingMode = null;
      reminder.activeUnifiedModeCallId = call.id || '';
      accepted = true;
      functionResponses.push({
        id: call.id,
        name: call.name,
        response: {
          result: 'rejected_by_user',
          resumedMode: pending.previousMode || ''
        }
      });
      setActiveReminderStatus(pending.previousMode
        ? '已取消切换，继续原来的任务。'
        : '已取消本次任务，实时慧眼继续等待。');
      logClientEvent('gemini_unified.candidate_rejected', {
        callId: call.id || '',
        mode: pending.mode,
        subject: pending.subject
      });
      continue;
    }
    if (command.action === 'confirm') {
      reminder.unifiedPendingMode = null;
      reminder.activeUnifiedModeCallId = call.id || '';
      accepted = true;
      reminder.suppressUnifiedContinuationAudio = true;
      handoff = {
        mode: pending.mode,
        instruction: pending.instruction
      };
      functionResponses.push({
        id: call.id,
        name: call.name,
        response: {
          result: 'handoff_started',
          mode: pending.mode,
          speakNow: false,
          taskStarted: false
        }
      });
      setActiveReminderStatus(pending.mode === 'find_object'
        ? '正在进入原找东西入口。'
        : '正在进入原持续播报入口。');
      logClientEvent('gemini_unified.candidate_confirmed', {
        callId: call.id || '',
        mode: pending.mode,
        subject: pending.subject,
        instruction: pending.instruction
      });
    }
  }
  reminder.unifiedCommandAcceptedThisTurn = accepted;
  try {
    if (reminder.strictMuteDuringResponse) {
      reminder.audioQueue = [];
      reminder.audioQueueBytes = 0;
      setGeminiAssistantResponseActive(reminder, true);
    }
    reminder.session?.sendToolResponse({ functionResponses });
    logClientEvent('gemini_unified.tool_response_sent', {
      responseCount: functionResponses.length,
      accepted
    });
    if (handoff) {
      scheduleGeminiUnifiedHandoff(reminder, handoff.mode, handoff.instruction);
    }
  } catch (error) {
    reminder.unifiedMechanicalConfirmation = null;
    setGeminiAssistantResponseActive(reminder, false);
    logClientEvent('gemini_unified.tool_response_failed', { error: error.message });
  }
  return true;
}

function handleGeminiFindObjectToolCall(message) {
  const reminder = appState.geminiReminder;
  const functionCalls = message?.toolCall?.functionCalls;
  if (
    !reminder
    || !isGeminiReminderExecutionMode(reminder, 'find_object')
    || !Array.isArray(functionCalls)
    || !functionCalls.length
  ) {
    return false;
  }
  const functionResponses = [];
  let accepted = false;
  let acceptedAction = '';
  for (const call of functionCalls) {
    if (accepted || call?.name !== GEMINI_FIND_OBJECT_TOOL_NAME) {
      functionResponses.push({
        id: call?.id,
        name: call?.name || '',
        response: { result: 'rejected', error: accepted ? 'duplicate_command_in_turn' : 'unknown_function' }
      });
      continue;
    }
    const command = validateGeminiFindObjectCommand(call.args);
    if (!command.ok) {
      functionResponses.push({
        id: call.id,
        name: call.name,
        response: { result: 'rejected', error: command.error }
      });
      logClientEvent('gemini_find.command_rejected', {
        callId: call.id || '',
        error: command.error,
        args: call.args || {}
      });
      continue;
    }
    if (
      reminder.findTarget
      && command.action === 'cancel'
      && !isExactSingleWordStop(reminder.inputTranscriptBuffer)
    ) {
      functionResponses.push({
        id: call.id,
        name: call.name,
        response: { result: 'rejected', error: 'active_find_only_accepts_stop' }
      });
      logClientEvent('gemini_find.command_rejected', {
        callId: call.id || '',
        error: 'active_find_only_accepts_stop',
        action: command.action
      });
      continue;
    }
    if (
      (command.action === 'complete' || command.action === 'resume')
      && (!reminder.findTarget || !reminder.findTouchConfirmationPending)
    ) {
      functionResponses.push({
        id: call.id,
        name: call.name,
        response: { result: 'rejected', error: 'touch_confirmation_not_pending' }
      });
      logClientEvent('gemini_find.command_rejected', {
        callId: call.id || '',
        error: 'touch_confirmation_not_pending',
        action: command.action
      });
      continue;
    }
    if (
      reminder.visualAssistantBaseExperiment
      && reminder.findTarget
      && (
        command.action === 'start'
        || (
          command.action === 'cancel'
          && !isExactSingleWordStop(reminder.inputTranscriptBuffer)
        )
      )
    ) {
      functionResponses.push({
        id: call.id,
        name: call.name,
        response: { result: 'rejected', error: 'visual_assistant_find_is_locked' }
      });
      logClientEvent('gemini_find.command_rejected', {
        callId: call.id || '',
        error: 'visual_assistant_find_is_locked',
        action: command.action
      });
      continue;
    }
    reminder.findTaskSeq = (reminder.findTaskSeq || 0) + 1;
    const previousTarget = reminder.findTarget || '';
    if (command.action === 'start') {
      clearGeminiFindObjectMemory(reminder, 'new_target');
      reminder.findTarget = command.target;
      reminder.frameCount = 0;
    } else if (command.action === 'cancel') {
      clearGeminiFindObjectMemory(reminder, 'user_cancelled');
    } else if (command.action === 'complete') {
      clearGeminiFindObjectMemory(reminder, 'user_confirmed_touch');
    } else {
      reminder.findTouchConfirmationPending = false;
      reminder.findTouchConfirmationAskedAt = 0;
      reminder.findOcclusionCount = 0;
      reminder.findLastSpokenStatus = '';
      reminder.findLastSpokenAt = 0;
      reminder.inFlight = false;
    }
    reminder.activeFindCallId = call.id || '';
    accepted = true;
    acceptedAction = command.action;
    if (command.action === 'start' && reminder.findTarget) {
      setLocalMicrophoneEnabled(false, 'find object tool accepted; button-only mode');
    }
    syncSpecialTaskStopControl({ focus: command.action === 'start' });
    if (
      reminder.launchedFromUnified
      && (command.action === 'cancel' || command.action === 'complete')
    ) {
      reminder.returnToUnifiedAfterTurn = `find_${command.action}`;
    }
    functionResponses.push({
      id: call.id,
      name: call.name,
      response: {
        result: 'accepted',
        action: command.action,
        targetActive: Boolean(reminder.findTarget)
      }
    });
    const statusText = command.action === 'start'
      ? `找东西模式正在寻找：${command.target}。请慢慢移动镜头。`
      : command.action === 'resume'
        ? `继续寻找：${previousTarget}。`
        : command.action === 'complete'
          ? `已经确认摸到${previousTarget}，找东西任务已结束。`
          : '找东西任务已清空。请告诉我要找什么。';
    setActiveReminderStatus(statusText);
    logClientEvent('gemini_find.command_accepted', {
      callId: call.id || '',
      action: command.action,
      target: command.target || previousTarget,
      findTaskSeq: reminder.findTaskSeq || 0
    });
  }
  try {
    if (reminder.strictMuteDuringResponse) {
      setGeminiPrePlaybackMicGuard(reminder, true, 'find_tool_confirmation');
      setGeminiAssistantResponseActive(reminder, true);
    }
    reminder.session?.sendToolResponse({ functionResponses });
    logClientEvent('gemini_find.tool_response_sent', {
      responseCount: functionResponses.length,
      accepted
    });
  } catch (error) {
    setGeminiAssistantResponseActive(reminder, false);
    if (acceptedAction === 'cancel' || acceptedAction === 'complete') {
      reminder.returnToUnifiedAfterTurn = '';
    }
    if (accepted && acceptedAction === 'start') {
      reminder.findTaskSeq = (reminder.findTaskSeq || 0) + 1;
      clearGeminiFindObjectMemory(reminder, 'tool_response_failed');
      reminder.activeFindCallId = '';
    }
    logClientEvent('gemini_find.tool_response_failed', { error: error.message });
  }
  return true;
}

function handleGeminiContinuousNarrationToolCall(message) {
  const reminder = appState.geminiReminder;
  const functionCalls = message?.toolCall?.functionCalls;
  if (
    !reminder
    || !isGeminiReminderExecutionMode(reminder, 'continuous_narration')
    || !Array.isArray(functionCalls)
    || !functionCalls.length
  ) {
    return false;
  }
  const functionResponses = [];
  let accepted = false;
  for (const call of functionCalls) {
    if (accepted || call?.name !== GEMINI_CONTINUOUS_NARRATION_TOOL_NAME) {
      functionResponses.push({
        id: call?.id,
        name: call?.name || '',
        response: { result: 'rejected', error: accepted ? 'duplicate_command_in_turn' : 'unknown_function' }
      });
      continue;
    }
    const command = validateGeminiContinuousNarrationCommand(call.args);
    if (!command.ok) {
      functionResponses.push({
        id: call.id,
        name: call.name,
        response: { result: 'rejected', error: command.error }
      });
      logClientEvent('gemini_continuous.command_rejected', {
        callId: call.id || '',
        error: command.error,
        args: call.args || {}
      });
      continue;
    }
    if (reminder.continuousNarrationActive) {
      functionResponses.push({
        id: call.id,
        name: call.name,
        response: { result: 'rejected', error: 'continuous_narration_button_only' }
      });
      logClientEvent('gemini_continuous.command_rejected', {
        callId: call.id || '',
        error: 'continuous_narration_button_only'
      });
      continue;
    }
    const initialInstructionAuthority = command.action === 'set'
      ? normalizeContinuousNarrationInstruction(reminder.initialInstruction)
      : '';
    const authoritativeFocus = initialInstructionAuthority || command.focus;
    reminder.continuousNarrationFocus = command.action === 'set' ? authoritativeFocus : '';
    reminder.continuousNarrationActive = command.action === 'set';
    reminder.continuousNarrationAwaitingFocus = command.action !== 'set';
    reminder.continuousNarrationDepthRequested = command.action === 'set'
      && resolvePlatformContinuousNarrationDepthRequested(authoritativeFocus);
    reminder.continuousNarrationIntervalMs = command.action === 'set'
      ? resolveContinuousNarrationIntervalMs(authoritativeFocus)
      : CONTINUOUS_NARRATION_INTERVAL_MS;
    reminder.continuousNarrationLastRequestAt = command.action === 'set' ? 0 : Date.now();
    reminder.continuousNarrationRequestCount = 0;
    reminder.continuousNarrationUserSpeechUntil = 0;
    reminder.activeContinuousNarrationCallId = call.id || '';
    if (command.action === 'set' && initialInstructionAuthority) {
      reminder.initialInstruction = '';
    }
    reminder.continuousNarrationCommandActionThisTurn = command.action;
    accepted = true;
    if (reminder.continuousNarrationActive) {
      setLocalMicrophoneEnabled(false, 'continuous narration tool accepted; button-only mode');
    }
    syncSpecialTaskStopControl({ focus: command.action === 'set' });
    if (reminder.launchedFromUnified && command.action === 'cancel') {
      reminder.returnToUnifiedAfterTurn = 'continuous_cancel';
    }
    functionResponses.push({
      id: call.id,
      name: call.name,
      response: {
        result: 'accepted',
        action: command.action,
        focus: reminder.continuousNarrationFocus,
        intervalSeconds: reminder.continuousNarrationIntervalMs / 1000,
        depthRequested: reminder.continuousNarrationDepthRequested,
        narrationActive: reminder.continuousNarrationActive
      }
    });
    setActiveReminderStatus(command.action === 'set'
      ? `持续播报重点已更新：${command.focus}。`
      : '持续播报已停止，请说出新的播报重点后重新开始。');
    logClientEvent('gemini_continuous.command_accepted', {
      callId: call.id || '',
      action: command.action,
      focus: reminder.continuousNarrationFocus,
      intervalSeconds: reminder.continuousNarrationIntervalMs / 1000,
      depthRequested: reminder.continuousNarrationDepthRequested
    });
  }
  try {
    if (reminder.strictMuteDuringResponse) {
      reminder.audioQueue = [];
      reminder.audioQueueBytes = 0;
      setGeminiAssistantResponseActive(reminder, true);
    }
    reminder.session?.sendToolResponse({ functionResponses });
    logClientEvent('gemini_continuous.tool_response_sent', {
      responseCount: functionResponses.length,
      accepted
    });
  } catch (error) {
    setGeminiAssistantResponseActive(reminder, false);
    if (reminder.continuousNarrationCommandActionThisTurn === 'cancel') {
      reminder.returnToUnifiedAfterTurn = '';
    }
    if (accepted) {
      reminder.continuousNarrationFocus = '';
      reminder.continuousNarrationActive = false;
      reminder.continuousNarrationAwaitingFocus = true;
      reminder.continuousNarrationDepthRequested = false;
      reminder.continuousNarrationIntervalMs = CONTINUOUS_NARRATION_INTERVAL_MS;
      reminder.activeContinuousNarrationCallId = '';
    }
    logClientEvent('gemini_continuous.tool_response_failed', { error: error.message });
  }
  return true;
}

function handleGeminiReminderContractToolCall(message) {
  const reminder = appState.geminiReminder;
  const functionCalls = message?.toolCall?.functionCalls;
  if (
    !reminder
    || (!reminder.unifiedAssistantMode && !isGeminiReminderExecutionMode(reminder, 'function_contract'))
    || !Array.isArray(functionCalls)
    || !functionCalls.length
  ) {
    return false;
  }
  const functionResponses = [];
  let acceptedCall = null;
  for (const call of functionCalls) {
    if (call?.name !== GEMINI_REMINDER_CONTRACT_TOOL_NAME) {
      functionResponses.push({
        id: call?.id,
        name: call?.name || '',
        response: { result: 'rejected', error: 'unknown_function' }
      });
      continue;
    }
    if (acceptedCall) {
      functionResponses.push({
        id: call.id,
        name: call.name,
        response: { result: 'rejected', error: 'duplicate_contract_in_turn' }
      });
      continue;
    }
    const freshInstruction = String(reminder.inputTranscriptBuffer || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!freshInstruction) {
      functionResponses.push({
        id: call.id,
        name: call.name,
        response: { result: 'rejected', error: 'missing_fresh_user_instruction' }
      });
      logClientEvent('gemini_reminder.function_contract_rejected', {
        label: reminder.reminderLabel || 'Gemini 合同实验',
        callId: call.id || '',
        error: 'missing_fresh_user_instruction'
      });
      continue;
    }
    const validated = validateGeminiReminderFunctionContract(call.args);
    if (!validated.ok) {
      functionResponses.push({
        id: call.id,
        name: call.name,
        response: { result: 'rejected', error: validated.error }
      });
      logClientEvent('gemini_reminder.function_contract_rejected', {
        label: reminder.reminderLabel || 'Gemini 合同实验',
        callId: call.id || '',
        error: validated.error,
        args: call.args || {}
      });
      continue;
    }
    const strictSpecialMode = reminder.visualAssistantBaseExperiment
      ? resolveVisualAssistantStrictSpecialModeCue(reminder.inputTranscriptBuffer)
      : '';
    if (strictSpecialMode) {
      functionResponses.push({
        id: call.id,
        name: call.name,
        response: {
          result: 'rejected',
          error: 'strict_special_mode_requires_handoff',
          expectedMode: strictSpecialMode
        }
      });
      logClientEvent('gemini_reminder.function_contract_rejected', {
        label: reminder.reminderLabel || 'Gemini 合同实验',
        callId: call.id || '',
        error: 'strict_special_mode_requires_handoff',
        expectedMode: strictSpecialMode
      });
      continue;
    }
    if (reminder.visualAssistantBaseExperiment && reminder.unifiedPendingMode) {
      functionResponses.push({
        id: call.id,
        name: call.name,
        response: { result: 'rejected', error: 'special_mode_confirmation_pending' }
      });
      logClientEvent('gemini_reminder.function_contract_rejected', {
        label: reminder.reminderLabel || 'Gemini 合同实验',
        callId: call.id || '',
        error: 'special_mode_confirmation_pending'
      });
      continue;
    }
    if (reminder.unifiedAssistantMode) {
      activateGeminiUnifiedExecutionMode(reminder, 'function_contract');
    } else {
      reminder.activeTaskSeq = (reminder.activeTaskSeq || 0) + 1;
      clearGeminiReminderTaskForNewInstruction(reminder, 'gemini_function_contract');
    }
    reminder.taskNormalizeInFlight = false;
    reminder.taskOverride = validated.taskText;
    reminder.contractAcceptedThisTurn = true;
    reminder.activeContractCallId = call.id || '';
    acceptedCall = { call, validated };
    functionResponses.push({
      id: call.id,
      name: call.name,
      response: { result: 'accepted', taskActive: true }
    });
    setActiveReminderStatus(`${reminder.reminderLabel || 'Gemini 合同实验'}任务已建立：${validated.contract.condition}。`);
    logClientEvent('gemini_reminder.function_contract_accepted', {
      label: reminder.reminderLabel || 'Gemini 合同实验',
      callId: call.id || '',
      activeTaskSeq: reminder.activeTaskSeq || 0,
      ...validated.contract,
      task: validated.taskText,
      inputTranscript: reminder.inputTranscriptBuffer.trim()
    });
  }
  try {
    if (reminder.strictMuteDuringResponse) {
      setGeminiPrePlaybackMicGuard(reminder, true, 'contract_confirmation');
      setGeminiAssistantResponseActive(reminder, true);
    }
    reminder.session?.sendToolResponse({ functionResponses });
    logClientEvent('gemini_live.tool_response_sent', {
      label: reminder.reminderLabel || 'Gemini 合同实验',
      responseCount: functionResponses.length,
      accepted: Boolean(acceptedCall)
    });
  } catch (error) {
    if (reminder.unifiedAssistantMode) {
      reminder.unifiedMechanicalConfirmation = null;
    }
    setGeminiPrePlaybackMicGuard(reminder, false);
    setGeminiAssistantResponseActive(reminder, false);
    if (acceptedCall && reminder.activeContractCallId === acceptedCall.call.id) {
      reminder.activeTaskSeq = (reminder.activeTaskSeq || 0) + 1;
      clearGeminiReminderTaskForNewInstruction(reminder, 'gemini_tool_response_failed');
      reminder.contractAcceptedThisTurn = false;
      reminder.activeContractCallId = '';
    }
    logClientEvent('gemini_live.tool_response_failed', {
      label: reminder.reminderLabel || 'Gemini 合同实验',
      error: error.message
    });
  }
  return true;
}

function handleGeminiReminderToolCancellation(message) {
  const reminder = appState.geminiReminder;
  const ids = message?.toolCallCancellation?.ids;
  if (
    !reminder
    || (!reminder.unifiedAssistantMode && !isGeminiReminderExecutionMode(reminder, 'function_contract'))
    || !Array.isArray(ids)
    || !ids.length
  ) {
    return false;
  }
  const activeCallCancelled = reminder.activeContractCallId && ids.includes(reminder.activeContractCallId);
  if (activeCallCancelled) {
    reminder.activeTaskSeq = (reminder.activeTaskSeq || 0) + 1;
    clearGeminiReminderTaskForNewInstruction(reminder, 'gemini_tool_call_cancelled');
    reminder.contractAcceptedThisTurn = false;
    reminder.activeContractCallId = '';
    setActiveReminderStatus(`${reminder.reminderLabel || 'Gemini 合同实验'}本轮任务已取消。`);
  }
  logClientEvent('gemini_live.tool_call_cancelled', {
    label: reminder.reminderLabel || 'Gemini 合同实验',
    ids,
    activeCallCancelled: Boolean(activeCallCancelled)
  });
  return true;
}

function handleGeminiFindObjectToolCancellation(message) {
  const reminder = appState.geminiReminder;
  const ids = message?.toolCallCancellation?.ids;
  if (!reminder || !isGeminiReminderExecutionMode(reminder, 'find_object') || !Array.isArray(ids) || !ids.length) {
    return false;
  }
  const activeCallCancelled = Boolean(reminder.activeFindCallId && ids.includes(reminder.activeFindCallId));
  if (activeCallCancelled) {
    reminder.findTaskSeq = (reminder.findTaskSeq || 0) + 1;
    clearGeminiFindObjectMemory(reminder, 'tool_call_cancelled');
    reminder.activeFindCallId = '';
    setActiveReminderStatus('本轮找东西任务已取消，请重新告诉我要找什么。');
  }
  logClientEvent('gemini_find.tool_call_cancelled', { ids, activeCallCancelled });
  return true;
}

function handleGeminiUnifiedModeToolCancellation(message) {
  const reminder = appState.geminiReminder;
  const ids = message?.toolCallCancellation?.ids;
  if (
    (!reminder?.unifiedAssistantMode && !reminder?.allowUnifiedTaskReplacement)
    || !Array.isArray(ids)
    || !ids.length
  ) {
    return false;
  }
  const activeCallCancelled = Boolean(
    reminder.activeUnifiedModeCallId
    && ids.includes(reminder.activeUnifiedModeCallId)
  );
  if (activeCallCancelled) {
    reminder.unifiedPendingMode = null;
    reminder.activeUnifiedModeCallId = '';
    setActiveReminderStatus('本轮模式选择已取消，实时慧眼继续等待。');
  }
  logClientEvent('gemini_unified.tool_call_cancelled', { ids, activeCallCancelled });
  return activeCallCancelled;
}

function handleGeminiWebSearchTools(message, reminder) {
  const search = window.HuiyanWebSearch;
  if (!search) return message;
  const calls = message?.toolCall?.functionCalls || [];
  if (!reminder.webSearchController && !calls.some((call) => call?.name === search.TOOL_NAME)) return message;
  const session = reminder.session;
  if (!session) return message;
  const taskEpoch = reminder.activeTaskSeq || 0;
  if (reminder.webSearchController?.session !== session || reminder.webSearchTaskEpoch !== taskEpoch) {
    reminder.webSearchController?.close();
    reminder.webSearchTaskEpoch = taskEpoch;
    reminder.webSearchController = search.createController({
      session,
      isCurrent: () => appState.geminiReminder === reminder && !reminder.stopping && reminder.session === session && (reminder.activeTaskSeq || 0) === taskEpoch && !reminder.unifiedPendingMode,
      canSearch: () => !['find_object', 'continuous_narration'].includes(getGeminiReminderExecutionMode(reminder)) && !reminder.unifiedPendingMode,
      log: logClientEvent
    });
  }
  return reminder.webSearchController.handle(message);
}

function dispatchGeminiToolEvents(message) {
  const reminder = appState.geminiReminder;
  if (!reminder) {
    return false;
  }
  message = handleGeminiWebSearchTools(message, reminder);
  if (reminder.unifiedAssistantMode) {
    handleGeminiUnifiedModeToolCancellation(message);
    handleGeminiReminderToolCancellation(message);
    handleGeminiFindObjectToolCancellation(message);
    const functionCalls = message?.toolCall?.functionCalls;
    if (!Array.isArray(functionCalls) || !functionCalls.length) {
      return false;
    }
    if (functionCalls.some((call) => call?.name === GEMINI_UNIFIED_MODE_TOOL_NAME)) {
      return handleGeminiUnifiedModeToolCall(message);
    }
    if (functionCalls.some((call) => call?.name === GEMINI_REMINDER_CONTRACT_TOOL_NAME)) {
      return handleGeminiReminderContractToolCall(message);
    }
    if (
      isGeminiReminderExecutionMode(reminder, 'find_object')
      && functionCalls.some((call) => call?.name === GEMINI_FIND_OBJECT_TOOL_NAME)
    ) {
      return handleGeminiFindObjectToolCall(message);
    }
    if (
      isGeminiReminderExecutionMode(reminder, 'continuous_narration')
      && functionCalls.some((call) => call?.name === GEMINI_CONTINUOUS_NARRATION_TOOL_NAME)
    ) {
      return handleGeminiContinuousNarrationToolCall(message);
    }
    return false;
  }
  if (reminder.allowUnifiedTaskReplacement) {
    handleGeminiUnifiedModeToolCancellation(message);
    const functionCalls = message?.toolCall?.functionCalls;
    if (
      Array.isArray(functionCalls)
      && functionCalls.some((call) => call?.name === GEMINI_UNIFIED_MODE_TOOL_NAME)
    ) {
      return handleGeminiUnifiedModeToolCall(message);
    }
  }
  handleGeminiReminderToolCancellation(message);
  handleGeminiFindObjectToolCancellation(message);
  handleGeminiContinuousNarrationToolCall(message);
  handleGeminiFindObjectToolCall(message);
  handleGeminiReminderContractToolCall(message);
  return true;
}

function handleGeminiDirectMessage(message) {
  dispatchGeminiToolEvents(message);
  const serverContent = message?.serverContent || {};
  const audioParts = extractGeminiDirectAudioParts(serverContent?.modelTurn?.parts || []);
  if (audioParts.length === 0 && typeof message?.data === 'string' && message.data) {
    audioParts.push({
      data: message.data,
      mimeType: 'audio/pcm;rate=24000'
    });
  }
  handleGeminiLiveMessage(JSON.stringify({
    type: 'gemini.message',
    browserDirect: true,
    text: message?.text || '',
    inputText: extractGeminiTranscriptionText(serverContent.inputTranscription),
    outputText: extractGeminiTranscriptionText(serverContent.outputTranscription),
    audioParts,
    turnComplete: Boolean(serverContent.turnComplete),
    interrupted: Boolean(serverContent.interrupted)
  }));
}

function extractGeminiDirectAudioParts(parts) {
  if (!Array.isArray(parts)) {
    return [];
  }
  return parts
    .map((part) => part?.inlineData)
    .filter((inlineData) => inlineData?.data && (!inlineData.mimeType || /^audio\//i.test(inlineData.mimeType)))
    .map((inlineData) => ({
      data: inlineData.data,
      mimeType: inlineData.mimeType || 'audio/pcm;rate=24000'
    }));
}

function extractGeminiTranscriptionText(transcription) {
  return typeof transcription?.text === 'string' ? transcription.text : '';
}

function handleGeminiLiveMessage(raw) {
  let message;
  try {
    message = JSON.parse(raw);
  } catch {
    appendVisionLog('Gemini Live 返回了无法解析的消息。');
    return;
  }
  const reminder = appState.geminiReminder;
  if (!reminder) {
    return;
  }
  dispatchGeminiToolEvents(message);
  if (message.type === 'gemini.ready') {
    reminder.isReady = true;
    reminder.reconnectAttempts = 0;
    reminder.turnInProgress = false;
    recordRealtimeDebug('gemini_live.ready', { model: message.model, voice: message.voice });
    logClientEvent('gemini_live.ready', {
      label: reminder.reminderLabel || 'Gemini 主动提醒',
      promptMode: reminder.promptMode || 'baseline',
      model: message.model || '',
      voice: message.voice || ''
    });
    activateGeminiReminderStreams().catch((error) => {
      appendVisionLog(`Gemini 音视频采集启动失败：${error.message}`);
    });
    return;
  }
  if (message.type === 'gemini.error') {
    setGeminiPrePlaybackMicGuard(reminder, false);
    appendVisionLog(`Gemini 错误：${message.message || '未知错误'}`);
    recordRealtimeDebug('gemini_live.error', message.message || '');
    logClientEvent('gemini_live.error', {
      label: reminder.reminderLabel || 'Gemini 主动提醒',
      promptMode: reminder.promptMode || 'baseline',
      message: message.message || ''
    });
    return;
  }
  if (message.type === 'gemini.closed') {
    reminder.webSearchController?.close();
    reminder.webSearchController = null;
    setGeminiPrePlaybackMicGuard(reminder, false);
    reminder.isReady = false;
    reminder.session = null;
    reminder.turnInProgress = false;
    reminder.player?.reset('gemini_closed');
    reminder.playbackActive = false;
    reminder.playbackUntil = 0;
    setGeminiAssistantResponseActive(reminder, false);
    appendVisionLog('Gemini Live 已关闭。');
    logClientEvent('gemini_live.closed', {
      label: reminder.reminderLabel || 'Gemini 主动提醒',
      promptMode: reminder.promptMode || 'baseline',
      code: message.code || '',
      reason: message.reason || ''
    });
    if (usesReliableReminderDelivery(reminder)) {
      rollbackGeminiPendingAlertDelivery(reminder, 'session_closed');
      scheduleGeminiReminderReconnect(reminder);
    }
    return;
  }
  if (message.type !== 'gemini.message') {
    return;
  }
  const discardUnifiedToolContinuation = Boolean(
    reminder.unifiedMechanicalConfirmation?.discardToolContinuation
  );
  const suppressUnifiedContinuationAudio = Boolean(
    reminder.suppressUnifiedContinuationAudio
  );
  if (message.interrupted) {
    logClientEvent('gemini_live.remote_interrupted', {
      label: reminder.reminderLabel || 'Gemini 主动提醒',
      turnInProgress: Boolean(reminder.turnInProgress),
      playbackActive: isGeminiPlaybackActive(reminder),
      pendingAlertDelivery: Boolean(reminder.pendingAlertDelivery),
      outputTextLength: reminder.outputTranscriptBuffer.length
    });
    setGeminiPrePlaybackMicGuard(reminder, false);
    reminder.player?.reset('gemini_remote_interrupted');
    reminder.playbackActive = false;
    reminder.playbackUntil = 0;
    setGeminiAssistantResponseActive(reminder, false);
    rollbackGeminiPendingAlertDelivery(reminder, 'turn_interrupted');
  }
  if (message.inputText) {
    reminder.turnInProgress = true;
    reminder.inputTranscriptBuffer += message.inputText;
    if (
      reminder.visualAssistantBaseExperiment
      && isGeminiReminderExecutionMode(reminder, 'function_contract')
    ) {
      const strictSpecialMode = resolveVisualAssistantStrictSpecialModeCue(
        reminder.inputTranscriptBuffer
      );
      if (strictSpecialMode) {
        reminder.strictSpecialModeDetectedThisTurn = strictSpecialMode;
      }
    }
    if (
      !reminder.unifiedAssistantMode
      && reminder.allowUnifiedTaskReplacement
      && !reminder.visualAssistantBaseExperiment
    ) {
      const currentMode = getGeminiReminderExecutionMode(reminder);
      const requestedMode = resolveUnifiedMechanicalModeCue(reminder.inputTranscriptBuffer);
      const requestedExecutionMode = requestedMode === 'function_contract'
        ? 'function_contract'
        : requestedMode;
      if (
        currentMode
        && (
          requestedMode === 'ordinary_question'
          || (
            requestedExecutionMode
            && requestedExecutionMode !== currentMode
          )
        )
      ) {
        reminder.unifiedCrossModeBlockedThisTurn = true;
        logClientEvent('gemini_unified.cross_mode_turn_blocked', {
          currentMode,
          requestedMode,
          input: reminder.inputTranscriptBuffer.trim()
        });
      }
    }
  }
  if (message.outputText) {
    reminder.turnInProgress = true;
    setGeminiAssistantResponseActive(reminder, true);
    reminder.outputTranscriptBuffer += message.outputText;
    appState.latestAssistantText = reminder.outputTranscriptBuffer;
  }
  for (const part of message.audioParts || []) {
    if (part.data) {
      reminder.turnInProgress = true;
      setGeminiAssistantResponseActive(reminder, true);
      if (suppressUnifiedContinuationAudio) {
        logClientEvent('gemini_unified.tool_continuation_audio_discarded', {
          reason: 'silent_handoff'
        });
        continue;
      }
      if (reminder.unifiedCrossModeBlockedThisTurn) {
        logClientEvent('gemini_unified.cross_mode_audio_discarded', {
          currentMode: getGeminiReminderExecutionMode(reminder)
        });
        continue;
      }
      if (reminder.suppressAssistantAudioUntilTurnComplete) {
        logClientEvent('gemini_live.interrupted_audio_discarded', {
          label: reminder.reminderLabel || 'Gemini active reminder'
        });
        continue;
      }
      if (reminder.strictSpecialModeDetectedThisTurn) {
        logClientEvent('gemini_unified.strict_special_mode_audio_discarded', {
          mode: reminder.strictSpecialModeDetectedThisTurn
        });
        continue;
      }
      if (discardUnifiedToolContinuation) {
        reminder.unifiedMechanicalConfirmation.bufferedAudioParts.push(part.data);
        logClientEvent('gemini_unified.tool_continuation_audio_buffered', {
          confirmationText: reminder.unifiedMechanicalConfirmation?.text || ''
        });
        continue;
      }
      if (
        reminder.unifiedAssistantMode
        && reminder.inputTranscriptBuffer.trim()
        && !reminder.unifiedCommandAcceptedThisTurn
        && !reminder.unifiedOneShotQuestionInFlight
      ) {
        reminder.unifiedFallbackAudioParts.push(part.data);
        logClientEvent('gemini_unified.fallback_audio_buffered', {
          input: reminder.inputTranscriptBuffer.trim()
        });
        continue;
      }
      if (appState.appVariant === 'aliyun' && !message.browserDirect
          && reminder.transport === 'aliyun-realtime'
          && reminder.visualAssistantBaseExperiment
          && reminder.inputTranscriptBuffer.trim() && !reminder.contractAcceptedThisTurn
          && !reminder.unifiedCommandAcceptedThisTurn) {
        continue;
      }
      const scheduledEndAt = reminder.player?.enqueue(part.data);
      if (scheduledEndAt && reminder.prePlaybackMicGuardActive) {
        setGeminiPrePlaybackMicGuard(reminder, false);
      }
      if (scheduledEndAt && usesReliableReminderDelivery(reminder) && reminder.pendingAlertDelivery) {
        reminder.pendingAlertDelivery.hadAudio = true;
      }
    }
  }
  if (message.turnComplete) {
    reminder.suppressAssistantAudioUntilTurnComplete = false;
    const mechanicalConfirmation = discardUnifiedToolContinuation
      ? reminder.unifiedMechanicalConfirmation
      : null;
    const input = reminder.inputTranscriptBuffer.trim();
    const output = reminder.outputTranscriptBuffer.trim();
    const aliVision37Ordinary = Boolean(appState.appVariant === 'aliyun'
      && !message.browserDirect
      && reminder.transport === 'aliyun-realtime'
      && reminder.visualAssistantBaseExperiment && !reminder.unifiedAssistantMode && input
      && !reminder.contractAcceptedThisTurn && !reminder.unifiedCommandAcceptedThisTurn
      && !reminder.strictSpecialModeDetectedThisTurn
      && !isVisualAssistantSpecialTaskButtonOnlyMode(reminder));
    const completingUnifiedOneShotQuestion = Boolean(
      reminder.unifiedAssistantMode
      && reminder.unifiedOneShotQuestionInFlight
    );
    const unifiedCrossModeBlockedThisTurn = Boolean(
      reminder.unifiedCrossModeBlockedThisTurn
    );
    const unifiedCommandAcceptedThisTurn = Boolean(
      reminder.unifiedCommandAcceptedThisTurn
    );
    const strictSpecialModeDetectedThisTurn = reminder.strictSpecialModeDetectedThisTurn;
    const unifiedFallbackAudioParts = reminder.unifiedAssistantMode && input
      ? reminder.unifiedFallbackAudioParts.splice(0)
      : [];
    const shouldRunUnifiedMechanicalFallback = Boolean(
      reminder.unifiedAssistantMode
      && input
      && !unifiedCommandAcceptedThisTurn
      && !completingUnifiedOneShotQuestion
      && !isGeminiReminderExecutionMode(reminder, 'find_object')
    );
    finalizeGeminiPendingAlertDelivery(reminder, output);
    if (input && !unifiedCrossModeBlockedThisTurn) {
      const handledTaskUpdate = updateGeminiReminderTaskFromGeminiTurn(input, output);
      if (!handledTaskUpdate && reminder.taskSourceMode !== 'confirmation_output' && reminder.taskSourceMode !== 'function_contract') {
        updateGeminiReminderTaskFromTranscript(input);
      }
    }
    if (input || output) {
      appendVisionLog(`Gemini 对话：${input ? `你说：${input}` : ''}${output ? ` 模型：${output}` : ''}`);
      recordRealtimeDebug('gemini_live.turn_complete', { input, output });
      logClientEvent('gemini_live.turn_complete', {
        label: reminder.reminderLabel || 'Gemini 主动提醒',
        promptMode: reminder.promptMode || 'baseline',
        input,
        output
      });
    }
    reminder.player?.logModelDone(output.length);
    reminder.inputTranscriptBuffer = '';
    reminder.outputTranscriptBuffer = '';
    reminder.turnInProgress = false;
    setGeminiAssistantResponseActive(reminder, false);
    reminder.contractAcceptedThisTurn = false;
    reminder.activeContractCallId = '';
    reminder.activeFindCallId = '';
    reminder.activeContinuousNarrationCallId = '';
    reminder.activeUnifiedModeCallId = '';
    reminder.unifiedCommandAcceptedThisTurn = false;
    reminder.suppressUnifiedContinuationAudio = false;
    reminder.unifiedCrossModeBlockedThisTurn = false;
    reminder.strictSpecialModeDetectedThisTurn = '';
    reminder.continuousNarrationCommandActionThisTurn = '';
    if (aliVision37Ordinary) {
      const imageData = captureGeminiContinuousNarrationFrame();
      if (imageData) sendGeminiLiveEvent({ type: 'ask', text: input, imageData, deliveryMode: 'ordinary_question' });
    }
    if (completingUnifiedOneShotQuestion) {
      reminder.unifiedOneShotQuestionInFlight = false;
      reminder.unifiedOrdinaryQuestion = '';
      logClientEvent('gemini_unified.one_shot_question_completed', {
        output
      });
    }
    if (unifiedCrossModeBlockedThisTurn) {
      sendGeminiLiveEvent({
        type: 'say',
        text: '请先结束当前任务。',
        deliveryMode: 'unified_cross_mode_rejected'
      });
      logClientEvent('gemini_unified.cross_mode_rejected', {
        currentMode: getGeminiReminderExecutionMode(reminder),
        input
      });
    }
    if (strictSpecialModeDetectedThisTurn && !unifiedCommandAcceptedThisTurn) {
      reminder.player?.reset('strict_special_mode_fallback');
      reminder.playbackActive = false;
      reminder.playbackUntil = 0;
      pauseGeminiActiveReminderForSpecialModeDecision(
        reminder,
        `strict_fallback_${strictSpecialModeDetectedThisTurn}`
      );
      logClientEvent('gemini_unified.strict_special_mode_fallback', {
        mode: strictSpecialModeDetectedThisTurn,
        instruction: input
      });
      scheduleGeminiUnifiedHandoff(reminder, strictSpecialModeDetectedThisTurn, input);
    }
    if (shouldRunUnifiedMechanicalFallback) {
      setGeminiAssistantResponseActive(reminder, true);
      Promise.resolve(
        handleGeminiUnifiedMechanicalFallback(
          reminder,
          input,
          unifiedCommandAcceptedThisTurn
        )
      ).then((handled) => {
        if (
          appState.geminiReminder !== reminder
          || reminder.stopping
          || !reminder.unifiedAssistantMode
        ) {
          return;
        }
        if (handled) {
          logClientEvent('gemini_unified.fallback_audio_discarded', {
            input,
            output,
            audioPartCount: unifiedFallbackAudioParts.length
          });
          return;
        }
        for (const audioData of unifiedFallbackAudioParts) {
          reminder.player?.enqueue(audioData);
        }
        setGeminiAssistantResponseActive(reminder, false);
        logClientEvent('gemini_unified.fallback_audio_released', {
          input,
          output,
          audioPartCount: unifiedFallbackAudioParts.length
        });
      }).catch((error) => {
        if (
          appState.geminiReminder !== reminder
          || reminder.stopping
          || !reminder.unifiedAssistantMode
        ) {
          return;
        }
        for (const audioData of unifiedFallbackAudioParts) {
          reminder.player?.enqueue(audioData);
        }
        setGeminiAssistantResponseActive(reminder, false);
        logClientEvent('gemini_unified.fallback_failed', {
          input,
          error: error.message
        });
      });
    }
    if (mechanicalConfirmation?.text) {
      reminder.unifiedMechanicalConfirmation = null;
      const confirmationComplete = geminiUnifiedConfirmationContainsTerms(
        output,
        mechanicalConfirmation.termGroups
      );
      if (confirmationComplete && mechanicalConfirmation.bufferedAudioParts?.length) {
        for (const audioData of mechanicalConfirmation.bufferedAudioParts) {
          reminder.player?.enqueue(audioData);
        }
        logClientEvent('gemini_unified.mechanical_confirmation_delivered', {
          text: mechanicalConfirmation.text,
          output
        });
      } else {
        logClientEvent('gemini_unified.tool_continuation_audio_discarded', {
          confirmationText: mechanicalConfirmation.text,
          output,
          reason: confirmationComplete ? 'missing_audio' : 'incomplete_confirmation'
        });
        window.setTimeout(() => {
          if (appState.geminiReminder !== reminder || !reminder.isReady || reminder.stopping) {
            return;
          }
          const sent = sendGeminiLiveEvent({
            type: 'say',
            text: mechanicalConfirmation.text,
            deliveryMode: 'unified_confirmation_retry'
          });
          logClientEvent('gemini_unified.mechanical_confirmation_sent', {
            text: mechanicalConfirmation.text,
            sent: Boolean(sent)
          });
        }, 0);
      }
    }
    if (reminder.returnToUnifiedAfterTurn) {
      const returnReason = reminder.returnToUnifiedAfterTurn;
      reminder.returnToUnifiedAfterTurn = '';
      scheduleGeminiReturnToUnified(reminder, returnReason);
    }
  }
}

function scheduleGeminiReminderReconnect(reminder) {
  if (
    !reminder
    || !usesReliableReminderDelivery(reminder)
    || reminder.stopping
    || reminder.reconnectTimer
    || typeof reminder.connectSession !== 'function'
  ) {
    return;
  }
  reminder.reconnectAttempts = (reminder.reconnectAttempts || 0) + 1;
  const delayMs = Math.min(10000, 1000 * (2 ** Math.min(3, reminder.reconnectAttempts - 1)));
  setActiveReminderStatus(`${reminder.reminderLabel || 'Gemini 主动提醒'}连接已断开，${Math.ceil(delayMs / 1000)} 秒后自动恢复。`);
  logClientEvent('gemini_live.reconnect_scheduled', {
    attempt: reminder.reconnectAttempts,
    delayMs
  });
  reminder.reconnectTimer = window.setTimeout(async () => {
    reminder.reconnectTimer = null;
    if (appState.geminiReminder !== reminder || reminder.stopping) {
      return;
    }
    try {
      await reminder.connectSession();
      logClientEvent('gemini_live.reconnect_started', {
        attempt: reminder.reconnectAttempts
      });
    } catch (error) {
      logClientEvent('gemini_live.reconnect_failed', {
        attempt: reminder.reconnectAttempts,
        error: error.message
      });
      scheduleGeminiReminderReconnect(reminder);
    }
  }, delayMs);
}

function isVisualAssistantSpecialTaskButtonOnlyMode(reminder) {
  if (!reminder) {
    return false;
  }
  const mode = getGeminiReminderExecutionMode(reminder);
  return Boolean(
    (mode === 'find_object' && reminder.findTarget)
    || (mode === 'continuous_narration' && reminder.continuousNarrationActive)
  );
}

function handleGeminiAudioFrame(frame, inputRate) {
  const reminder = appState.geminiReminder;
  if (!reminder || !reminder.isReady || !frame || frame.length === 0) {
    return;
  }
  if (isVisualAssistantSpecialTaskButtonOnlyMode(reminder)) {
    reminder.audioQueue = [];
    reminder.audioQueueBytes = 0;
    return;
  }
  let sumSquares = 0;
  for (let i = 0; i < frame.length; i += 1) {
    sumSquares += frame[i] * frame[i];
  }
  const rms = Math.sqrt(sumSquares / frame.length);
  holdContinuousNarrationForDetectedUserSpeech(
    reminder,
    rms,
    MANUAL_LOCAL_VAD_START_RMS
  );
  const playbackActive = isGeminiPlaybackActive(reminder);
  const responseGuardActive = Boolean(
    reminder.strictMuteDuringResponse
    && reminder.prePlaybackMicGuardActive
  );
  let frames = [frame];
  if (playbackActive) {
    reminder.audioQueue = [];
    reminder.audioQueueBytes = 0;
    reminder.playbackSpeechHighFrames = 0;
    reminder.playbackCandidateFrames = [];
    noteGeminiAssistantEchoDropped(reminder, rms);
    return;
  }
  if (
    reminder.muteMicDuringPlayback
    && reminder.strictMuteDuringResponse
    && responseGuardActive
  ) {
    reminder.audioQueue = [];
    reminder.audioQueueBytes = 0;
    reminder.playbackSpeechHighFrames = 0;
    reminder.playbackCandidateFrames = [];
    noteGeminiAssistantEchoDropped(reminder, rms);
    return;
  }
  reminder.playbackSpeechHighFrames = 0;
  reminder.playbackCandidateFrames = [];
  for (const sourceFrame of frames) {
    const downsampled = downsampleFloat32(sourceFrame, inputRate, AUDIO_INPUT_RATE);
    const pcm = floatToPcm16(downsampled);
    reminder.audioQueue.push(pcm);
    reminder.audioQueueBytes += pcm.byteLength;
  }
  if (reminder.audioQueueBytes < AUDIO_SEND_BYTES) {
    return;
  }
  const merged = concatInt16(reminder.audioQueue, reminder.audioQueueBytes / 2);
  reminder.audioQueue = [];
  reminder.audioQueueBytes = 0;
  sendGeminiLiveEvent({
    type: 'audio',
    mimeType: 'audio/pcm;rate=16000',
    data: uint8ToBase64(new Uint8Array(merged.buffer))
  });
}

function noteGeminiAssistantEchoDropped(reminder, rms) {
  reminder.assistantEchoDroppedFrames = (reminder.assistantEchoDroppedFrames || 0) + 1;
  const now = Date.now();
  if (
    reminder.assistantEchoLastLogAt
    && now - reminder.assistantEchoLastLogAt < 1000
  ) {
    return;
  }
  const droppedFrames = reminder.assistantEchoDroppedFrames;
  reminder.assistantEchoDroppedFrames = 0;
  reminder.assistantEchoLastLogAt = now;
  logClientEvent('gemini_live.assistant_echo_audio_dropped', {
    droppedFrames,
    rms: Number(rms || 0).toFixed(4),
    nativeIOS: Boolean(window.__ACCESSIBLE_VISION_NATIVE_IOS__)
  });
}

function holdContinuousNarrationForDetectedUserSpeech(reminder, rms, threshold) {
  if (
    !reminder
    || !isGeminiReminderExecutionMode(reminder, 'continuous_narration')
    || !reminder.continuousNarrationActive
    || reminder.assistantResponseActive
    || isGeminiPlaybackActive(reminder)
    || !Number.isFinite(rms)
    || rms < threshold
  ) {
    return false;
  }
  reminder.continuousNarrationUserSpeechUntil = Date.now()
    + CONTINUOUS_NARRATION_USER_SPEECH_HOLD_MS;
  return true;
}

function sendGeminiVideoFrame() {
  const reminder = appState.geminiReminder;
  if (appState.appVariant === 'aliyun' && reminder?.transport === 'aliyun-realtime') return;
  if (!reminder?.isReady || !appState.stream || elements.camera.readyState < 2) {
    return;
  }
  if (
    reminder.unifiedAssistantMode
    && isGeminiReminderExecutionMode(reminder, 'continuous_narration')
  ) {
    return;
  }
  const imageDataUrl = captureReminderFrame({ maxWidth: 360, quality: 0.55 });
  const payload = parseImageDataUrlForClient(imageDataUrl);
  if (!payload) {
    return;
  }
  sendGeminiLiveEvent({
    type: 'video',
    mimeType: payload.mimeType,
    data: payload.data
  });
}

async function requestBrowserDirectActiveReminderResult(reminder, {
  imageDataUrl,
  task,
  frameCount,
  promptMode,
  requestSeq
}) {
  if (!reminder?.browserGeminiAi?.models) {
    throw new Error('手机直连筛图尚未取得 Gemini 浏览器连接。');
  }
  const image = parseImageDataUrlForClient(imageDataUrl);
  if (!image) {
    throw new Error('手机直连主动提醒没有取得有效图片。');
  }
  const prepared = await apiPost('/api/active-reminder-direct-prepare', {
    task,
    frameCount,
    promptMode
  });
  if (
    appState.geminiReminder !== reminder
    || getGeminiActiveReminderTask() !== task
  ) {
    throw new Error('主动提醒任务已更换，本次手机直连筛图已作废。');
  }
  const timeoutMs = Math.max(
    1000,
    Math.min(
      15000,
      Number(prepared.timeoutMs || reminder.browserImageRequestTimeoutMs || 10000)
    )
  );
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  const aiPool = Array.isArray(reminder.browserActiveReminderAiPool)
    && reminder.browserActiveReminderAiPool.length
    ? reminder.browserActiveReminderAiPool
    : [reminder.browserGeminiAi];
  const browserKeySlot = (Math.max(1, Number(requestSeq || 1)) - 1) % aiPool.length;
  const activeReminderAi = aiPool[browserKeySlot] || reminder.browserGeminiAi;
  let response;
  try {
    response = await activeReminderAi.models.generateContent({
      model: prepared.model || reminder.browserActiveReminderModel || 'gemini-3.1-flash-lite',
      contents: [{
        role: 'user',
        parts: [
          { text: prepared.prompt },
          { inlineData: image }
        ]
      }],
      config: {
        temperature: 0,
        maxOutputTokens: Number(prepared.maxOutputTokens || 160),
        thinkingConfig: { thinkingBudget: 0 },
        ...(prepared.jsonMode ? { responseMimeType: 'application/json' } : {}),
        abortSignal: controller.signal
      }
    });
  } finally {
    window.clearTimeout(timer);
  }
  const modelLatencyMs = Date.now() - startedAt;
  const modelText = String(response?.text || '').trim();
  if (!modelText) {
    throw new Error('手机直连主动提醒没有返回有效筛图结果。');
  }
  return apiPost('/api/active-reminder-direct-finalize', {
    imageDataUrl,
    task,
    frameCount,
    promptMode,
    modelText,
    modelLatencyMs,
    browserKeySlot: browserKeySlot + 1
  });
}

function isBrowserDirectActiveReminderRetryableError(error) {
  const name = String(error?.name || '').toLowerCase();
  const message = String(error?.message || error || '').toLowerCase();
  const status = Number(error?.status || error?.statusCode || 0);
  return name === 'aborterror'
    || [429, 500, 502, 503, 504].includes(status)
    || message.includes('abort')
    || message.includes('failed to fetch')
    || message.includes('network')
    || message.includes('429')
    || message.includes('resource exhausted')
    || message.includes('quota');
}

async function requestGeminiActiveReminderResult(reminder, body) {
  if (reminder.activeScreenTransport !== 'browser_direct_generate_content') {
    return apiPost('/api/active-reminder-check', body);
  }
  try {
    return await requestBrowserDirectActiveReminderResult(reminder, body);
  } catch (error) {
    if (!isBrowserDirectActiveReminderRetryableError(error)) {
      throw error;
    }
    logClientEvent('gemini_reminder.browser_direct_fallback', {
      frameCount: body.frameCount || 0,
      reason: error.message || String(error)
    });
    return apiPost('/api/active-reminder-check', body);
  }
}

function usesGreencloudActiveReminderConcurrency(reminder) {
  return Boolean(
    reminder
    && appState.appVariant === 'greencloud-gemini'
    && ['server_generate_content', 'browser_direct_generate_content'].includes(
      reminder.activeScreenTransport
    )
  );
}

async function runGeminiActiveReminderTick() {
  const reminder = appState.geminiReminder;
  if (!reminder || !reminder.isReady || !appState.stream || elements.camera.readyState < 2) {
    return;
  }
  if (isGeminiReminderExecutionMode(reminder, 'find_object')) {
    await runGeminiFindObjectTick(reminder);
    return;
  }
  const activeInFlightCount = Math.max(0, Number(reminder.activeInFlightCount || 0));
  const greencloudConcurrentScreening = usesGreencloudActiveReminderConcurrency(reminder);
  if (!greencloudConcurrentScreening && activeInFlightCount >= 1) {
    return;
  }
  if (reminder.turnInProgress) {
    return;
  }
  const task = getGeminiActiveReminderTask();
  const label = reminder.reminderLabel || 'Gemini 主动提醒';
  const promptMode = reminder.promptMode || 'baseline';
  if (reminder.taskNormalizeInFlight) {
    if (reminder.frameCount === 0 || reminder.frameCount % 10 === 0) {
      setActiveReminderStatus(`${label}正在归一化任务，暂不快筛旧任务。`);
    }
    reminder.frameCount += 1;
    return;
  }
  if (reminder.visualAssistantBaseExperiment && reminder.unifiedPendingMode) {
    return;
  }
  if (!task) {
    if (reminder.frameCount === 0 || reminder.frameCount % 10 === 0) {
      setActiveReminderStatus(`${label}运行中：等待你说“看到什么提醒我”。`);
    }
    reminder.frameCount += 1;
    return;
  }
  reminder.activeInFlightCount = activeInFlightCount + 1;
  reminder.inFlight = true;
  reminder.activeRequestSeq = (reminder.activeRequestSeq || 0) + 1;
  const requestSeq = reminder.activeRequestSeq;
  reminder.frameCount += 1;
  const frameCount = reminder.frameCount;
  const taskSeq = reminder.activeTaskSeq || 0;
  try {
    const imageDataUrl = captureReminderFrame(ACTIVE_REMINDER_FAST_FRAME_OPTIONS);
    const result = await requestGeminiActiveReminderResult(reminder, {
      imageDataUrl,
      task,
      frameCount,
      promptMode,
      requestSeq
    });
    if (
      appState.geminiReminder !== reminder
      || (reminder.activeTaskSeq || 0) !== taskSeq
      || getGeminiActiveReminderTask() !== task
    ) {
      logClientEvent('gemini_reminder.check_ignored', {
        reason: 'stale_task_result',
        label,
        promptMode,
        frameCount,
        task,
        taskSeq,
        currentTaskSeq: reminder.activeTaskSeq || 0,
        currentTask: getGeminiActiveReminderTask()
      });
      return;
    }
    if (
      greencloudConcurrentScreening
      && requestSeq <= (reminder.activeLatestAppliedRequestSeq || 0)
    ) {
      logClientEvent('gemini_reminder.check_ignored', {
        reason: 'older_response',
        label,
        promptMode,
        frameCount,
        requestSeq,
        latestAppliedRequestSeq: reminder.activeLatestAppliedRequestSeq || 0,
        task
      });
      return;
    }
    if (greencloudConcurrentScreening) {
      reminder.activeLatestAppliedRequestSeq = requestSeq;
    }
    const guardedResult = applyReliableActiveReminderEvidenceGuard(reminder, result, task);
    const memoryResult = applyActiveReminderStateMemory(reminder, guardedResult, task, {
      source: 'gemini',
      label,
      frameCount,
      promptMode
    });
    recordRealtimeDebug('gemini_reminder.check_result', {
      frameCount,
      requestSeq,
      task,
      promptMode,
      transport: result.transport || reminder.activeScreenTransport || 'server_generate_content',
      browserKeySlot: result.browserKeySlot || '',
      shouldAlert: memoryResult.shouldAlert,
      latencyMs: memoryResult.latencyMs,
      rawText: memoryResult.rawText,
      state: memoryResult.state || '',
      currentState: memoryResult.currentState || '',
      observation: memoryResult.observation || '',
      resultReached: Boolean(memoryResult.resultReached),
      resultText: memoryResult.resultText || '',
      instanceKey: memoryResult.instanceKey || '',
      speakable: memoryResult.speakable || '',
      confidence: memoryResult.confidence ?? '',
      evidenceGuard: memoryResult._evidenceGuard || null,
      stateMemory: memoryResult._stateMemory || null
    });
    logClientEvent('gemini_reminder.check_result', {
      label,
      promptMode,
      frameCount,
      requestSeq,
      task,
      transport: result.transport || reminder.activeScreenTransport || 'server_generate_content',
      browserKeySlot: result.browserKeySlot || '',
      shouldAlert: Boolean(memoryResult.shouldAlert),
      latencyMs: memoryResult.latencyMs ?? '',
      rawText: memoryResult.rawText || '',
      state: memoryResult.state || '',
      currentState: memoryResult.currentState || '',
      observation: memoryResult.observation || '',
      resultReached: Boolean(memoryResult.resultReached),
      resultText: memoryResult.resultText || '',
      instanceKey: memoryResult.instanceKey || '',
      speakable: memoryResult.speakable || '',
      confidence: memoryResult.confidence ?? '',
      evidenceGuard: memoryResult._evidenceGuard || null,
      stateMemory: memoryResult._stateMemory || null
    });
    if (memoryResult.shouldAlert) {
      handleGeminiReminderAlert(memoryResult, task);
    } else {
      updateGeminiReminderMissState(reminder, task);
      if (reminder.frameCount === 1 || reminder.frameCount % 10 === 0) {
        setActiveReminderStatus(`${label}运行中：3.6 已快筛 ${reminder.frameCount} 帧，最近延迟 ${result.latencyMs ?? '未知'} 毫秒。`);
      }
    }
  } catch (error) {
    if (
      greencloudConcurrentScreening
      && requestSeq <= (reminder.activeLatestAppliedRequestSeq || 0)
    ) {
      logClientEvent('gemini_reminder.check_error_ignored', {
        reason: 'older_response',
        label,
        promptMode,
        frameCount,
        requestSeq,
        latestAppliedRequestSeq: reminder.activeLatestAppliedRequestSeq || 0,
        task,
        error: error.message
      });
      return;
    }
    reminder.errorCount += 1;
    recordRealtimeDebug('gemini_reminder.check_failed', error.message);
    logClientEvent('gemini_reminder.check_failed', {
      label,
      promptMode,
      frameCount,
      requestSeq,
      task,
      transport: reminder.activeScreenTransport || 'server_generate_content',
      error: error.message
    });
    if (reminder.errorCount === 1 || reminder.errorCount % 5 === 0) {
      setActiveReminderStatus(`${label}快筛失败：${error.message}`);
    }
  } finally {
    if (appState.geminiReminder === reminder) {
      reminder.activeInFlightCount = Math.max(
        0,
        Number(reminder.activeInFlightCount || 0) - 1
      );
      reminder.inFlight = reminder.activeInFlightCount > 0;
    }
  }
}

function buildGeminiFindGuidance(status, target, nativeHandStage = false) {
  const safeTarget = String(target || '').trim() || '目标物';
  const messages = {
    target_missing: `没看到${safeTarget}，请移动镜头。`,
    walk_left: '往左一点。',
    walk_right: '往右一点。',
    walk_forward: '往前走一步。',
    hand_missing: `${safeTarget}已锁定。手机别动，慢慢伸手。`,
    move_left: '左一点。',
    move_right: '右一点。',
    move_forward: '往前。',
    move_backward: '往回。',
    target_visible: `${safeTarget}还在，请保持手机不动。`,
    occluded_by_hand: `手挡住${safeTarget}了。手机别动，继续慢慢靠近。`,
    reacquire: `镜头或目标位置变了。请先停手，重新对准${safeTarget}。`
  };
  if (nativeHandStage) {
    Object.assign(messages, {
      target_missing: `请让手和${safeTarget}同时入镜。`,
      hand_missing: `请伸手靠近${safeTarget}。`,
      move_left: '手往左一点。',
      move_right: '手往右一点。',
      move_forward: '手往前一点。',
      move_backward: '手往回一点。',
      reacquire: `请让手和${safeTarget}同时入镜。`,
      uncertain: `请让手和${safeTarget}同时入镜。`
    });
  }
  return messages[status] || '';
}

function geminiFindGuidanceRepeatMs(status) {
  if (isFindObjectApproachStatus(status)) {
    return FIND_APPROACH_GUIDANCE_REPEAT_MS;
  }
  if (status === 'target_missing') {
    return 2500;
  }
  if (status === 'hand_missing') {
    return 2000;
  }
  if (status === 'occluded_by_hand' || status === 'reacquire') {
    return 2500;
  }
  if (status === 'uncertain') {
    return 1800;
  }
  return GEMINI_FIND_GUIDANCE_REPEAT_MS;
}

function isFindObjectApproachStatus(status) {
  return ['walk_left', 'walk_right', 'walk_forward'].includes(status);
}

function findObjectTargetLockFrames() {
  return appState.appVariant === 'greencloud-gemini'
    ? GREEN_FIND_TARGET_LOCK_FRAMES
    : FIND_TARGET_LOCK_FRAMES;
}

function confirmFindObjectApproachStatus(reminder, status, confidence) {
  if (!isFindObjectApproachStatus(status) || confidence < FIND_APPROACH_MIN_CONFIDENCE) {
    reminder.findApproachStatus = '';
    reminder.findApproachCount = 0;
    return false;
  }
  if (reminder.findApproachStatus === status) {
    reminder.findApproachCount = (reminder.findApproachCount || 0) + 1;
  } else {
    reminder.findApproachStatus = status;
    reminder.findApproachCount = 1;
  }
  return reminder.findApproachCount >= FIND_APPROACH_CONFIRM_FRAMES;
}

function normalizeFindObjectDistanceMeters(value) {
  const meters = Number(value);
  if (!Number.isFinite(meters) || meters <= 0.05 || meters >= 8) {
    return null;
  }
  return meters;
}

function formatFindObjectDistanceMeters(value) {
  const meters = normalizeFindObjectDistanceMeters(value);
  if (meters === null) {
    return '';
  }
  return (Math.round(meters * 10) / 10).toFixed(1).replace(/\.0$/, '');
}

function readFindObjectDistance(result) {
  const nativeLidar = result?.nativeLidar;
  const meters = normalizeFindObjectDistanceMeters(nativeLidar?.targetDepthM);
  const confidence = Number(nativeLidar?.confidence || 0);
  if (
    window.__ACCESSIBLE_VISION_NATIVE_IOS__
    && nativeLidar?.available === true
    && String(nativeLidar?.source || '') === 'apple_lidar'
    && meters !== null
    && Number.isFinite(confidence)
    && confidence >= 0.40
  ) {
    return {
      meters,
      source: 'apple_lidar',
      confidence,
      frameId: Number(nativeLidar?.frameId || 0)
    };
  }
  if (appState.appVariant !== 'greencloud-gemini') {
    return null;
  }
  const depthAssist = result?.depthAssist;
  const greencloudMeters = normalizeFindObjectDistanceMeters(
    depthAssist?.smoothedDepthM ?? depthAssist?.targetDepthM
  );
  const greencloudConfidence = Number(depthAssist?.confidence || 0);
  if (
    depthAssist?.available !== true
    || depthAssist?.used !== true
    || greencloudMeters === null
    || !Number.isFinite(greencloudConfidence)
    || greencloudConfidence < 0.55
  ) {
    return null;
  }
  return {
    meters: greencloudMeters,
    source: 'greencloud_depth_assist',
    confidence: greencloudConfidence,
    frameId: 0
  };
}

function describeFindObjectDirection(zone) {
  return ({
    left: '你左前方',
    center: '你正前方',
    right: '你右前方'
  })[String(zone || '')] || '你前方';
}

function describeFindObjectHeight(location, targetY) {
  const normalizedLocation = String(location || '').replace(/\s+/g, '');
  const locationRules = [
    [/(地面|地上|地板|脚边|脚下)/, '接近地面'],
    [/(桌子|桌面|书桌|餐桌)/, '桌面高度'],
    [/(台面|台子|窗台|洗手池|水池)/, '台面高度'],
    [/(架子|置物架|搁板|层板|层架)/, '架层高度'],
    [/(柜子|柜面|床头柜)/, '柜面高度'],
    [/(床上|床面|床边)/, '床面高度'],
    [/(沙发|椅子|座椅|凳子)/, '座面高度'],
    [/(门把手|扶手)/, '把手高度']
  ];
  for (const [pattern, description] of locationRules) {
    if (pattern.test(normalizedLocation)) {
      return description;
    }
  }
  const y = Number(targetY);
  if (!Number.isFinite(y) || y < 0 || y > 1) {
    return '';
  }
  if (y < 0.30) {
    return '胸口以上';
  }
  if (y < 0.58) {
    return '胸口附近';
  }
  if (y < 0.78) {
    return '腰部附近';
  }
  return '腰部以下';
}

function buildFindObjectLocationAnnouncement(target, location, context = null) {
  const safeTarget = String(target || '').trim() || '目标物';
  let safeLocation = String(location || '')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[。！？!?;,;；]+$/g, '')
    .trim();
  if (safeLocation.startsWith(`${safeTarget}就在`)) {
    safeLocation = safeLocation.slice(`${safeTarget}就在`.length);
  } else if (safeLocation.startsWith(`${safeTarget}在`)) {
    safeLocation = safeLocation.slice(`${safeTarget}在`.length);
  }
  safeLocation = safeLocation
    .replace(/^(?:在)?(?:你)?前方的?/, '')
    .replace(/^在/, '')
    .trim()
    .slice(0, 24);
  if (!context?.enabled) {
    return safeLocation
      ? `${safeTarget}在你前方的${safeLocation}。`
      : `${safeTarget}在你前方。`;
  }
  const direction = describeFindObjectDirection(context.zone);
  const height = describeFindObjectHeight(safeLocation, context.targetY);
  const distanceText = formatFindObjectDistanceMeters(context.distance?.meters);
  const details = [
    height ? (height === '接近地面' ? '高度接近地面' : `约在${height}`) : '',
    distanceText ? `离手机大约${distanceText}米` : ''
  ].filter(Boolean);
  const locationSpeech = safeLocation
    ? `${safeTarget}在${direction}的${safeLocation}`
    : `${safeTarget}在${direction}`;
  return `${locationSpeech}${details.length ? `，${details.join('，')}` : ''}。`;
}

function announceFindObjectLocation(
  reminder,
  target,
  location,
  frameCount,
  confidence,
  context = null
) {
  if (reminder.findLocationAnnounced || reminder.turnInProgress || isGeminiPlaybackActive(reminder)) {
    return false;
  }
  const announcement = buildFindObjectLocationAnnouncement(target, location, context);
  if (!sendGeminiLiveEvent({ type: 'say', text: announcement, deliveryMode: 'guidance' })) {
    return false;
  }
  reminder.findLocationAnnounced = true;
  reminder.findLastSpokenStatus = 'location';
  reminder.findLastSpokenAt = Date.now();
  setActiveReminderStatus(`已锁定${target}：${announcement}`);
  appendVisionLog(`Gemini 找东西：${announcement}`);
  logClientEvent('gemini_find.location_announced', {
    target,
    location: String(location || ''),
    announcement,
    frameCount,
    confidence,
    height: describeFindObjectHeight(location, context?.targetY),
    distanceMeters: context?.distance?.meters ?? '',
    distanceSource: context?.distance?.source || '',
    distanceConfidence: context?.distance?.confidence ?? '',
    nativeFrameId: context?.distance?.frameId || ''
  });
  return true;
}

function isFindObjectTargetVisibleStatus(status) {
  return ['hand_missing', 'move_left', 'move_right', 'move_forward', 'move_backward', 'contact'].includes(status);
}

function resetGeminiFindTargetLock(reminder, reason = '') {
  reminder.findTargetSeenCount = 0;
  reminder.findReacquireCount = 0;
  reminder.findOcclusionCount = 0;
  reminder.findTargetLocked = false;
  reminder.findReferenceImageDataUrl = '';
  reminder.findReferenceFrameCount = 0;
  reminder.findTouchConfirmationPending = false;
  reminder.findTouchConfirmationAskedAt = 0;
  logClientEvent('gemini_find.target_lock_cleared', {
    reason,
    target: reminder.findTarget || ''
  });
}

function updateAliFindSubjectReference(reminder, {
  imageDataUrl,
  frameCount,
  status,
  confidence,
  targetX,
  targetY
}) {
  if (
    appState.appVariant !== 'aliyun'
    || !reminder
    || String(reminder.findTarget || '').trim() === ''
    || !String(imageDataUrl || '').startsWith('data:image/')
    || String(status || '') === 'target_missing'
    || Number(confidence) < 0.55
    || !Number.isFinite(targetX)
    || targetX < 0
    || targetX > 1
    || !Number.isFinite(targetY)
    || targetY < 0
    || targetY > 1
  ) {
    return false;
  }
  if (!reminder.findSubjectLocked) {
    logClientEvent('gemini_find.subject_locked', {
      target: reminder.findTarget,
      frameCount,
      status,
      confidence,
      targetX,
      targetY
    });
  }
  reminder.findSubjectLocked = true;
  reminder.findSubjectReferenceImageDataUrl = imageDataUrl;
  reminder.findSubjectReferenceFrameCount = frameCount;
  reminder.findSubjectReferenceTargetX = targetX;
  reminder.findSubjectReferenceTargetY = targetY;
  return true;
}

function createAliFindSubjectIdentityReferenceImage(imageDataUrl, targetX, targetY) {
  if (
    appState.appVariant !== 'aliyun'
    || !String(imageDataUrl || '').startsWith('data:image/')
    || !Number.isFinite(targetX)
    || targetX < 0
    || targetX > 1
    || !Number.isFinite(targetY)
    || targetY < 0
    || targetY > 1
  ) {
    return Promise.resolve(imageDataUrl);
  }
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const sourceWidth = image.naturalWidth || image.width;
        const sourceHeight = image.naturalHeight || image.height;
        const cropSize = Math.max(96, Math.round(Math.min(sourceWidth, sourceHeight) * 0.5));
        const centerX = Math.round(sourceWidth * targetX);
        const centerY = Math.round(sourceHeight * targetY);
        const sourceX = Math.max(0, Math.min(sourceWidth - cropSize, centerX - Math.round(cropSize / 2)));
        const sourceY = Math.max(0, Math.min(sourceHeight - cropSize, centerY - Math.round(cropSize / 2)));
        const canvas = document.createElement('canvas');
        canvas.width = cropSize;
        canvas.height = cropSize;
        const context = canvas.getContext('2d');
        context.drawImage(
          image,
          sourceX,
          sourceY,
          cropSize,
          cropSize,
          0,
          0,
          cropSize,
          cropSize
        );
        const markerX = centerX - sourceX;
        const markerY = centerY - sourceY;
        const radius = Math.max(18, Math.round(cropSize * 0.13));
        const lineWidth = Math.max(5, Math.round(cropSize * 0.024));
        context.strokeStyle = '#ff0000';
        context.lineWidth = lineWidth;
        context.beginPath();
        context.arc(markerX, markerY, radius, 0, Math.PI * 2);
        context.stroke();
        context.beginPath();
        context.moveTo(markerX - radius, markerY);
        context.lineTo(markerX + radius, markerY);
        context.moveTo(markerX, markerY - radius);
        context.lineTo(markerX, markerY + radius);
        context.stroke();
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      } catch {
        resolve(imageDataUrl);
      }
    };
    image.onerror = () => resolve(imageDataUrl);
    image.src = imageDataUrl;
  });
}

function clearGeminiFindContactEvidence(reminder) {
  if (!reminder) {
    return;
  }
  reminder.findContactCount = 0;
  reminder.findContactCompletionPending = false;
  reminder.findContactCompletionFrameCount = 0;
  reminder.findContactCompletionConfidence = 0;
}

function recordGeminiFindContactEvidence(reminder, status, confidence, frameCount) {
  if (!reminder || status !== 'contact' || Number(confidence || 0) < 0.75) {
    return false;
  }
  reminder.findContactCount = (reminder.findContactCount || 0) + 1;
  if (reminder.findContactCount < 2) {
    return false;
  }
  reminder.findContactCompletionPending = true;
  reminder.findContactCompletionFrameCount = Number(frameCount || 0);
  reminder.findContactCompletionConfidence = Number(confidence || 0);
  return true;
}

function usesGreencloudFindSlowHedge(reminder) {
  return Boolean(
    reminder
    && appState.appVariant === 'greencloud-gemini'
    && ['generate_content', 'browser_direct_live'].includes(reminder.findScreenTransport)
  );
}

function beginGeminiFindObjectCheck(reminder, now = Date.now()) {
  const inFlightCount = Math.max(0, Number(reminder?.findInFlightCount || 0));
  const greencloudSlowHedge = usesGreencloudFindSlowHedge(reminder);
  const maxInFlight = greencloudSlowHedge
    ? GREEN_FIND_OBJECT_MAX_IN_FLIGHT
    : FIND_OBJECT_MAX_IN_FLIGHT;
  const startedAtValues = Object.values(reminder?.findInFlightStartedAt || {})
    .map(Number)
    .filter(Number.isFinite);
  const oldestStartedAt = startedAtValues.length ? Math.min(...startedAtValues) : 0;
  const oldestAgeMs = oldestStartedAt ? Math.max(0, now - oldestStartedAt) : Infinity;
  const waitingForHedge = greencloudSlowHedge
    && inFlightCount === 1
    && oldestAgeMs < GREEN_FIND_OBJECT_HEDGE_MS;
  if (!reminder || inFlightCount >= maxInFlight || waitingForHedge) {
    if (reminder) {
      reminder.findCapacityDropCount = (reminder.findCapacityDropCount || 0) + 1;
      if (reminder.findCapacityDropCount <= 2 || reminder.findCapacityDropCount % 10 === 0) {
        logClientEvent('gemini_find.frame_dropped', {
          reason: waitingForHedge ? 'waiting_for_slow_hedge' : 'max_in_flight',
          inFlightCount,
          maxInFlight,
          oldestAgeMs: Number.isFinite(oldestAgeMs) ? Math.round(oldestAgeMs) : '',
          droppedCount: reminder.findCapacityDropCount
        });
      }
    }
    return 0;
  }
  reminder.findRequestSeq = (reminder.findRequestSeq || 0) + 1;
  reminder.findInFlightCount = inFlightCount + 1;
  reminder.findInFlightStartedAt = reminder.findInFlightStartedAt || {};
  reminder.findInFlightStartedAt[reminder.findRequestSeq] = now;
  if (greencloudSlowHedge && inFlightCount === 1) {
    logClientEvent('gemini_find.slow_hedge_started', {
      requestSeq: reminder.findRequestSeq,
      oldestAgeMs: Math.round(oldestAgeMs),
      inFlightCount: reminder.findInFlightCount
    });
  }
  return reminder.findRequestSeq;
}

function finishGeminiFindObjectCheck(reminder, requestSeq = 0) {
  if (!reminder) {
    return 0;
  }
  if (reminder.findInFlightStartedAt && requestSeq) {
    delete reminder.findInFlightStartedAt[requestSeq];
  }
  reminder.findInFlightCount = Math.max(0, Number(reminder.findInFlightCount || 0) - 1);
  return reminder.findInFlightCount;
}

function geminiFindObjectCheckStaleReason(reminder, target, taskSeq, requestSeq) {
  if (appState.geminiReminder !== reminder || !isGeminiReminderExecutionMode(reminder, 'find_object')) {
    return 'session_replaced';
  }
  if ((reminder.findTaskSeq || 0) !== taskSeq || reminder.findTarget !== target) {
    return 'target_replaced';
  }
  if (requestSeq <= (reminder.findLatestAppliedRequestSeq || 0)) {
    return 'older_response';
  }
  return '';
}

function acceptGeminiFindObjectCheck(reminder, target, taskSeq, requestSeq) {
  const staleReason = geminiFindObjectCheckStaleReason(reminder, target, taskSeq, requestSeq);
  if (staleReason) {
    return staleReason;
  }
  reminder.findLatestAppliedRequestSeq = requestSeq;
  return '';
}

function browserDirectFindScreenSessionSlot(comparisonMode = false, lane = 0) {
  const normalizedLane = Number(lane) === 1 ? 1 : 0;
  return `${comparisonMode ? 'comparison' : 'single'}_${normalizedLane}`;
}

function isBrowserDirectFindQuotaError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('429')
    || message.includes('resource exhausted')
    || message.includes('quota');
}

function markBrowserDirectFindQuotaKey(reminder, manager, error) {
  if (!reminder || !manager?.keySlot || !isBrowserDirectFindQuotaError(error)) {
    return;
  }
  reminder.directFindExcludedKeySlot = manager.keySlot;
  logClientEvent('gemini_find.browser_direct_key_limited', {
    keySlot: manager.keySlot,
    lane: manager.lane,
    comparisonMode: manager.comparisonMode,
    error: error.message || String(error)
  });
}

function closeBrowserDirectFindScreenSession(reminder, manager, reason = 'closed', error = null) {
  if (!manager || manager.closed) {
    return;
  }
  manager.closed = true;
  clearTimeout(manager.connectTimer);
  const failure = error instanceof Error
    ? error
    : new Error(String(error || '手机直连图片会话已关闭。'));
  if (!manager.readySettled) {
    manager.readySettled = true;
    manager.rejectReady(failure);
  }
  if (manager.pending) {
    clearTimeout(manager.pending.timer);
    manager.pending.reject(failure);
    manager.pending = null;
  }
  try {
    manager.session?.close?.();
  } catch {
    // The browser SDK may have already closed the session.
  }
  const slot = browserDirectFindScreenSessionSlot(manager.comparisonMode, manager.lane);
  if (reminder?.directFindScreenSessions?.[slot] === manager) {
    reminder.directFindScreenSessions[slot] = null;
  }
  logClientEvent('gemini_find.browser_direct_closed', {
    connectionId: manager.connectionId,
    comparisonMode: manager.comparisonMode,
    reason,
    error: failure.message
  });
}

function stopBrowserDirectFindScreenSessions(reminder, reason = 'stopped') {
  if (!reminder?.directFindScreenSessions) {
    return;
  }
  for (const manager of Object.values(reminder.directFindScreenSessions)) {
    closeBrowserDirectFindScreenSession(
      reminder,
      manager,
      reason,
      new Error('手机直连找东西实验已结束。')
    );
  }
}

function createBrowserDirectFindScreenSession(reminder, comparisonMode = false, lane = 0) {
  const normalizedLane = Number(lane) === 1 ? 1 : 0;
  const slot = browserDirectFindScreenSessionSlot(comparisonMode, normalizedLane);
  let resolveReady;
  let rejectReady;
  const readyPromise = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const manager = {
    connectionId: `${comparisonMode ? 'cmp' : 'one'}-${Math.random().toString(36).slice(2, 8)}`,
    comparisonMode,
    lane: normalizedLane,
    keySlot: 0,
    session: null,
    closed: false,
    readySettled: false,
    resolveReady,
    rejectReady,
    readyPromise,
    connectTimer: null,
    pending: null,
    requestCount: 0
  };
  reminder.directFindScreenSessions[slot] = manager;
  manager.connectTimer = setTimeout(() => {
    closeBrowserDirectFindScreenSession(
      reminder,
      manager,
      'connect_timeout',
      new Error('手机直连 3.1 Flash 图片会话建立超时。')
    );
  }, GEMINI_DIRECT_FIND_CONNECT_TIMEOUT_MS);

  (async () => {
    const [tokenConfig, sdk] = await Promise.all([
      apiPost('/api/gemini-direct-find-token', {
        reminderSessionId: reminder.reminderSessionId || '',
        comparisonMode,
        excludeKeySlot: reminder.directFindExcludedKeySlot || 0
      }),
      import(GEMINI_BROWSER_SDK_URL)
    ]);
    if (manager.closed || appState.geminiReminder !== reminder) {
      throw new Error('手机直连找东西实验已经停止。');
    }
    const ai = new sdk.GoogleGenAI({
      apiKey: tokenConfig.token,
      httpOptions: { apiVersion: tokenConfig.apiVersion || 'v1beta' }
    });
    manager.keySlot = Math.max(0, Number(tokenConfig.keySlot || 0));
    if (
      reminder.directFindExcludedKeySlot
      && manager.keySlot
      && manager.keySlot !== reminder.directFindExcludedKeySlot
    ) {
      reminder.directFindExcludedKeySlot = 0;
    }
    const liveConfig = {
      responseModalities: [sdk.Modality.AUDIO],
      mediaResolution: sdk.MediaResolution.MEDIA_RESOLUTION_MEDIUM,
      systemInstruction: tokenConfig.systemInstruction,
      tools: [{
        functionDeclarations: [tokenConfig.functionDeclaration]
      }]
    };
    if (sdk.ThinkingLevel?.LOW && !/^gemini-3\.8-live$/i.test(directFindModel)) {
      liveConfig.thinkingConfig = {
        thinkingLevel: sdk.ThinkingLevel.LOW
      };
    }
    const expectedToolName = comparisonMode
      ? GEMINI_LIVE_FIND_COMPARISON_TOOL_NAME
      : GEMINI_LIVE_FIND_RESULT_TOOL_NAME;
    const markReady = () => {
      if (manager.closed || manager.readySettled || !manager.session) {
        return;
      }
      manager.readySettled = true;
      clearTimeout(manager.connectTimer);
      manager.resolveReady(manager);
    };
    manager.session = await ai.live.connect({
      model: tokenConfig.model || 'gemini-3.1-flash-live-preview',
      config: liveConfig,
      callbacks: {
        onopen: () => {
          logClientEvent('gemini_find.browser_direct_open', {
            connectionId: manager.connectionId,
            comparisonMode,
            lane: manager.lane,
            keySlot: manager.keySlot
          });
          markReady();
        },
        onmessage: (message) => {
          const pending = manager.pending;
          if (!pending) {
            return;
          }
          const functionCalls = Array.isArray(message?.toolCall?.functionCalls)
            ? message.toolCall.functionCalls
            : [];
          const resultCall = functionCalls.find((call) => call?.name === expectedToolName);
          if (resultCall && pending.modelResult === null) {
            pending.modelResult = resultCall.args ?? {};
            try {
              manager.session.sendToolResponse({
                functionResponses: [{
                  id: resultCall.id,
                  name: resultCall.name,
                  response: { accepted: true }
                }]
              });
            } catch (error) {
              clearTimeout(pending.timer);
              manager.pending = null;
              pending.reject(error);
              closeBrowserDirectFindScreenSession(reminder, manager, 'tool_response_failed', error);
              return;
            }
          }
          if (message?.serverContent?.interrupted) {
            const error = new Error('手机直连图片判断被中断。');
            clearTimeout(pending.timer);
            manager.pending = null;
            pending.reject(error);
            closeBrowserDirectFindScreenSession(reminder, manager, 'interrupted', error);
            return;
          }
          if (message?.serverContent?.turnComplete) {
            clearTimeout(pending.timer);
            manager.pending = null;
            if (pending.modelResult !== null) {
              pending.resolve(pending.modelResult);
            } else {
              const error = new Error('手机直连 3.1 Flash 没有提交找物结果。');
              pending.reject(error);
              closeBrowserDirectFindScreenSession(reminder, manager, 'missing_result', error);
            }
          }
        },
        onerror: (event) => {
          const message = event?.message || event?.error?.message || '手机直连图片会话错误。';
          markBrowserDirectFindQuotaKey(reminder, manager, new Error(message));
          closeBrowserDirectFindScreenSession(
            reminder,
            manager,
            'upstream_error',
            new Error(message)
          );
        },
        onclose: (event) => {
          if (manager.closed) {
            return;
          }
          const closeError = new Error(`手机直连图片会话已关闭${event?.reason ? `：${event.reason}` : '。'}`);
          markBrowserDirectFindQuotaKey(reminder, manager, closeError);
          closeBrowserDirectFindScreenSession(
            reminder,
            manager,
            'upstream_close',
            closeError
          );
        }
      }
    });
    markReady();
  })().catch((error) => {
    closeBrowserDirectFindScreenSession(reminder, manager, 'connect_failed', error);
  });
  return manager;
}

async function getBrowserDirectFindScreenSession(reminder, comparisonMode = false, lane = 0) {
  const normalizedLane = Number(lane) === 1 ? 1 : 0;
  const slot = browserDirectFindScreenSessionSlot(comparisonMode, normalizedLane);
  let manager = reminder.directFindScreenSessions?.[slot] || null;
  if (!manager || manager.closed) {
    manager = createBrowserDirectFindScreenSession(reminder, comparisonMode, normalizedLane);
  }
  await manager.readyPromise;
  return manager;
}

async function requestBrowserDirectFindScreenResult(reminder, {
  imageDataUrl,
  referenceImageDataUrl = '',
  target,
  frameCount,
  referenceFrameCount = 0,
  comparisonMode = false,
  requestSeq = 0
}) {
  const nativeHandStage = reminder.nativeFindHandStage === true;
  const currentImage = parseImageDataUrlForClient(imageDataUrl);
  const referenceImage = referenceImageDataUrl
    ? parseImageDataUrlForClient(referenceImageDataUrl)
    : null;
  if (!currentImage || (comparisonMode && !referenceImage)) {
    throw new Error('手机直连找东西实验没有取得有效图片。');
  }
  const lane = (Math.max(1, Number(requestSeq || 1)) - 1) % GREEN_FIND_OBJECT_MAX_IN_FLIGHT;
  const manager = await getBrowserDirectFindScreenSession(reminder, comparisonMode, lane);
  if (manager.pending) {
    throw new Error('上一张手机直连图片仍在判断。');
  }
  manager.requestCount += 1;
  const requestLabel = `${manager.connectionId}-${manager.requestCount}-${frameCount}`;
  const startedAt = Date.now();
  const modelResultPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (manager.pending?.requestLabel !== requestLabel) {
        return;
      }
      const error = new Error(`手机直连图片判断超过 ${GEMINI_DIRECT_FIND_REQUEST_TIMEOUT_MS} 毫秒。`);
      manager.pending = null;
      reject(error);
      closeBrowserDirectFindScreenSession(reminder, manager, 'request_timeout', error);
    }, GEMINI_DIRECT_FIND_REQUEST_TIMEOUT_MS);
    manager.pending = {
      requestLabel,
      modelResult: null,
      resolve,
      reject,
      timer
    };
  });
  try {
    manager.session.sendClientContent({
      turns: [{
        role: 'user',
        parts: comparisonMode
          ? [
            { inlineData: referenceImage },
            { inlineData: currentImage },
            {
              text: `[SCREEN ${requestLabel}]\n目标：${target}\n第1张是锁定参考图，第2张是当前图。只比较本回合这两张图并提交结果函数。`
            }
          ]
          : [
            { inlineData: currentImage },
            {
              text: `[SCREEN ${requestLabel}]\n目标：${target}\n${nativeHandStage ? '苹果雷达已确认进入伸手阶段。只判断手相对目标的方向或是否接触，禁止输出任何 walk 状态。\n' : ''}只判断本回合这一张最新图片并提交结果函数。`
            }
          ]
      }],
      turnComplete: true
    });
  } catch (error) {
    if (manager.pending?.requestLabel === requestLabel) {
      clearTimeout(manager.pending.timer);
      manager.pending = null;
    }
    closeBrowserDirectFindScreenSession(reminder, manager, 'send_failed', error);
    throw error;
  }
  const modelResult = await modelResultPromise;
  const modelLatencyMs = Date.now() - startedAt;
  return apiPost('/api/find-object-direct-finalize', {
    imageDataUrl,
    modelResult,
    target,
    frameCount,
    reminderSessionId: reminder.reminderSessionId || '',
    comparisonMode,
    referenceFrameCount,
    modelLatencyMs,
    nativeFindHandStage: nativeHandStage,
    screenLane: lane + 1
  });
}

function completeGeminiFindObjectWhenReady(reminder) {
  if (
    !reminder
    || !reminder.findContactCompletionPending
    || (reminder.findContactCount || 0) < 2
  ) {
    return false;
  }
  const target = String(reminder.findTarget || '').trim();
  if (!target || reminder.turnInProgress || isGeminiPlaybackActive(reminder)) {
    return false;
  }
  const taskSeq = reminder.findTaskSeq || 0;
  const frameCount = reminder.findContactCompletionFrameCount || reminder.frameCount || 0;
  const confidence = reminder.findContactCompletionConfidence || 1;
  const successText = `摸到${target}了，寻找结束。`;
  const sent = sendGeminiLiveEvent({
    type: 'say',
    text: successText,
    deliveryMode: 'guidance'
  });
  if (!sent) {
    return false;
  }
  if (reminder.transport === 'aliyun-realtime') {
    reminder.returnToUnifiedAfterAliSpeech = 'find_contact_confirmed';
  } else if (reminder.launchedFromUnified) {
    reminder.returnToUnifiedAfterTurn = 'find_contact_confirmed';
  }
  reminder.findTaskSeq = taskSeq + 1;
  clearGeminiFindObjectMemory(reminder, 'contact_confirmed');
  setActiveReminderStatus(successText);
  appendVisionLog(`Gemini 找东西：${successText}`);
  logClientEvent('gemini_find.completed', {
    target,
    frameCount,
    confidence
  });
  return true;
}

async function runGeminiFindObjectTick(reminder) {
  const target = String(reminder.findTarget || '').trim();
  if (!target) {
    return;
  }
  if (reminder.findContactCompletionPending) {
    completeGeminiFindObjectWhenReady(reminder);
    return;
  }
  if (reminder.findTouchConfirmationPending) {
    const pendingMs = Date.now() - (reminder.findTouchConfirmationAskedAt || Date.now());
    if (reminder.nativeFindHandStage !== true && pendingMs < FIND_TOUCH_CONFIRM_TIMEOUT_MS) {
      return;
    }
    reminder.findTouchConfirmationPending = false;
    reminder.findTouchConfirmationAskedAt = 0;
    reminder.findOcclusionCount = 0;
    logClientEvent('gemini_find.touch_confirmation_timeout', { target, pendingMs });
  }
  const requestSeq = beginGeminiFindObjectCheck(reminder);
  if (!requestSeq) {
    return;
  }
  reminder.frameCount += 1;
  const frameCount = reminder.frameCount;
  const taskSeq = reminder.findTaskSeq || 0;
  const findCheckPath = reminder.findScreenTransport === 'gemini_live'
    ? '/api/find-object-live-check'
    : '/api/find-object-check';
  const runFindScreenCheck = reminder.findScreenTransport === 'browser_direct_live'
    ? (body) => requestBrowserDirectFindScreenResult(reminder, {
      ...body,
      requestSeq
    })
    : (body) => apiPost(findCheckPath, body);
  try {
    const imageCapturedAtMs = Date.now();
    const imageDataUrl = captureReminderFrame(FIND_OBJECT_FRAME_OPTIONS);
    const followLockedAliSubject = appState.appVariant === 'aliyun'
      && reminder.findSubjectLocked
      && String(reminder.findSubjectReferenceImageDataUrl || '').startsWith('data:image/');
    const singleResult = await runFindScreenCheck({
      imageDataUrl,
      target,
      frameCount,
      reminderSessionId: reminder.reminderSessionId || '',
      nativeFindHandStage: reminder.nativeFindHandStage === true,
      ...(followLockedAliSubject
        ? {
          subjectLocked: true,
          referenceImageDataUrl: reminder.findSubjectReferenceImageDataUrl,
          referenceFrameCount: reminder.findSubjectReferenceFrameCount || 0
        }
        : {})
    });
    const initialStaleReason = geminiFindObjectCheckStaleReason(reminder, target, taskSeq, requestSeq);
    if (initialStaleReason) {
      logClientEvent('gemini_find.check_ignored', {
        reason: initialStaleReason,
        target,
        frameCount,
        findTaskSeq: taskSeq,
        requestSeq
      });
      return;
    }
    let status = String(singleResult.status || 'uncertain');
    if (reminder.nativeFindHandStage === true && isFindObjectApproachStatus(status)) {
      status = singleResult.hand === 'visible'
        ? ({ walk_left: 'move_left', walk_right: 'move_right', walk_forward: 'move_forward' }[status])
        : singleResult.hand === 'missing' ? 'hand_missing' : 'uncertain';
    }
    let confidence = Number(singleResult.confidence || 0);
    const location = String(singleResult.location || '');
    const zone = String(singleResult.zone || 'unknown');
    const visible = String(singleResult.visible || 'uncertain');
    const hand = String(singleResult.hand || 'uncertain');
    const view = String(singleResult.view || 'uncertain');
    const supportBase = String(singleResult.supportBase || 'uncertain');
    const foregroundFloor = String(singleResult.foregroundFloor || 'uncertain');
    const targetX = typeof singleResult.targetX === 'number' ? singleResult.targetX : Number.NaN;
    const targetY = typeof singleResult.targetY === 'number' ? singleResult.targetY : Number.NaN;
    const locationContext = {
      enabled: Boolean(
        window.__ACCESSIBLE_VISION_NATIVE_IOS__
        || appState.appVariant === 'greencloud-gemini'
      ),
      zone,
      targetY,
      distance: readFindObjectDistance(singleResult)
    };
    if (confidence < 0.55) {
      status = 'uncertain';
    }
    let comparisonResult = null;
    if (
      status === 'target_missing'
      && reminder.nativeFindHandStage !== true
      && reminder.findTargetLocked
      && reminder.findReferenceImageDataUrl
    ) {
      comparisonResult = await runFindScreenCheck({
        imageDataUrl,
        referenceImageDataUrl: reminder.findReferenceImageDataUrl,
        comparisonMode: true,
        referenceFrameCount: reminder.findReferenceFrameCount || 0,
        target,
        frameCount,
        reminderSessionId: reminder.reminderSessionId || ''
      });
      const comparisonStaleReason = geminiFindObjectCheckStaleReason(reminder, target, taskSeq, requestSeq);
      if (comparisonStaleReason) {
        logClientEvent('gemini_find.comparison_ignored', {
          reason: comparisonStaleReason,
          target,
          frameCount,
          findTaskSeq: taskSeq,
          requestSeq
        });
        return;
      }
      status = String(comparisonResult.status || 'uncertain');
      confidence = Number(comparisonResult.confidence || 0);
      if (confidence < 0.55) {
        status = 'uncertain';
      }
      logClientEvent('gemini_find.comparison_result', {
        target,
        frameCount,
        referenceFrameCount: reminder.findReferenceFrameCount || 0,
        status,
        confidence,
        latencyMs: comparisonResult.latencyMs ?? '',
        debugFrame: comparisonResult.debugFrame || ''
      });
    }
    const acceptedStaleReason = acceptGeminiFindObjectCheck(reminder, target, taskSeq, requestSeq);
    if (acceptedStaleReason) {
      logClientEvent('gemini_find.check_ignored', {
        reason: acceptedStaleReason,
        target,
        frameCount,
        findTaskSeq: taskSeq,
        requestSeq
      });
      return;
    }
    if (reminder.findContactCompletionPending) {
      logClientEvent('gemini_find.check_ignored', {
        reason: 'contact_completion_pending',
        target,
        frameCount,
        findTaskSeq: taskSeq,
        requestSeq
      });
      completeGeminiFindObjectWhenReady(reminder);
      return;
    }
    reminder.findLastStatus = status;
    logClientEvent('gemini_find.check_result', {
      target,
      frameCount,
      requestSeq,
      status,
      rawStatus: singleResult.status || '',
      comparisonStatus: comparisonResult?.status || '',
      confidence,
      location,
      zone,
      visible,
      hand,
      view,
      supportBase,
      foregroundFloor,
      targetX: Number.isFinite(targetX) ? targetX : '',
      targetY: Number.isFinite(targetY) ? targetY : '',
      transport: singleResult.transport || reminder.findScreenTransport || 'generate_content',
      latencyMs: singleResult.latencyMs ?? '',
      comparisonLatencyMs: comparisonResult?.latencyMs ?? '',
      targetLocked: Boolean(reminder.findTargetLocked),
      subjectLocked: Boolean(reminder.findSubjectLocked),
      subjectFollowApplied: Boolean(singleResult.subjectLocked),
      subjectReferenceFrameCount: reminder.findSubjectReferenceFrameCount || 0,
      debugFrame: comparisonResult?.debugFrame || singleResult.debugFrame || ''
    });

    if (reminder.nativeFindHandStage === true
      && window.__nativeFindHandResult?.(reminder, { visible, hand, status, confidence, capturedAtMs: imageCapturedAtMs, frameCount })) {
      return;
    }

    if (visible === 'yes') {
      const subjectReferenceImageDataUrl = await createAliFindSubjectIdentityReferenceImage(
        imageDataUrl,
        targetX,
        targetY
      );
      const subjectReferenceStaleReason = appState.geminiReminder !== reminder
        ? 'session_changed'
        : reminder.stopping
          ? 'session_stopping'
          : String(reminder.findTarget || '').trim() !== target
            ? 'target_changed'
            : (reminder.findTaskSeq || 0) !== taskSeq
              ? 'task_changed'
              : '';
      if (subjectReferenceStaleReason) {
        logClientEvent('gemini_find.subject_reference_ignored', {
          reason: subjectReferenceStaleReason,
          target,
          frameCount,
          findTaskSeq: taskSeq,
          requestSeq
        });
        return;
      }
      updateAliFindSubjectReference(reminder, {
        imageDataUrl: subjectReferenceImageDataUrl,
        frameCount,
        status,
        confidence,
        targetX,
        targetY
      });
    }

    if (isFindObjectApproachStatus(status)) {
      if (reminder.findTargetLocked || reminder.findReferenceImageDataUrl) {
        resetGeminiFindTargetLock(reminder, 'approach_phase');
      }
      if (!confirmFindObjectApproachStatus(reminder, status, confidence)) {
        setActiveReminderStatus(`正在确认${target}的走近方向，请保持镜头。`);
        return;
      }
      if (!reminder.findLocationAnnounced) {
        announceFindObjectLocation(reminder, target, location, frameCount, confidence, locationContext);
        return;
      }
    } else {
      reminder.findApproachStatus = '';
      reminder.findApproachCount = 0;
    }

    if (status === 'reacquire') {
      reminder.findReacquireCount = (reminder.findReacquireCount || 0) + 1;
      reminder.findOcclusionCount = 0;
      if (reminder.findReacquireCount < FIND_TARGET_REACQUIRE_FRAMES) {
        return;
      }
      resetGeminiFindTargetLock(reminder, 'reacquire');
    } else if (status === 'occluded_by_hand') {
      reminder.findOcclusionCount = (reminder.findOcclusionCount || 0) + 1;
      reminder.findReacquireCount = 0;
    } else if (status === 'target_visible') {
      reminder.findTargetLocked = true;
      reminder.findReacquireCount = 0;
      reminder.findOcclusionCount = 0;
    } else if (isFindObjectTargetVisibleStatus(status)) {
      reminder.findTargetSeenCount = (reminder.findTargetSeenCount || 0) + 1;
      reminder.findReacquireCount = 0;
      reminder.findOcclusionCount = 0;
      if (status === 'hand_missing' || !reminder.findReferenceImageDataUrl) {
        reminder.findReferenceImageDataUrl = imageDataUrl;
        reminder.findReferenceFrameCount = frameCount;
      }
      if (status !== 'hand_missing' || reminder.findTargetSeenCount >= findObjectTargetLockFrames()) {
        if (!reminder.findTargetLocked) {
          logClientEvent('gemini_find.target_locked', {
            target,
            frameCount,
            status,
            seenCount: reminder.findTargetSeenCount
          });
        }
        reminder.findTargetLocked = true;
      }
      if (status === 'hand_missing' && !reminder.findTargetLocked) {
        setActiveReminderStatus(`正在稳定锁定${target}，请保持镜头。`);
        return;
      }
    } else if (status === 'target_missing') {
      reminder.findTargetSeenCount = 0;
      reminder.findReacquireCount = 0;
      reminder.findOcclusionCount = 0;
    }

    if (isFindObjectTargetVisibleStatus(status) && reminder.findTargetLocked && !reminder.findLocationAnnounced) {
      announceFindObjectLocation(reminder, target, location, frameCount, confidence, locationContext);
      return;
    }

    if (status === 'contact' && confidence >= 0.75) {
      if (!recordGeminiFindContactEvidence(reminder, status, confidence, frameCount)) {
        setActiveReminderStatus(`正在确认手是否已经摸到${target}。`);
        return;
      }
      setActiveReminderStatus(`已经两次确认手摸到${target}，等待优先播报完成。`);
      completeGeminiFindObjectWhenReady(reminder);
      return;
    }
    if (reminder.nativeFindHandStage !== true && status === 'occluded_by_hand' && reminder.findOcclusionCount >= 2) {
      if (reminder.turnInProgress || isGeminiPlaybackActive(reminder)) {
        return;
      }
      const question = `手已经到${target}的位置，摸到了吗？`;
      if (!sendGeminiLiveEvent({ type: 'say', text: question, deliveryMode: 'guidance' })) {
        return;
      }
      reminder.findTouchConfirmationPending = true;
      reminder.findTouchConfirmationAskedAt = Date.now();
      reminder.findLastSpokenStatus = 'touch_confirmation';
      reminder.findLastSpokenAt = reminder.findTouchConfirmationAskedAt;
      setActiveReminderStatus(question);
      appendVisionLog(`Gemini 找东西：${question}`);
      logClientEvent('gemini_find.touch_confirmation_requested', {
        target,
        frameCount,
        confidence,
        referenceFrameCount: reminder.findReferenceFrameCount || 0
      });
      return;
    }
    const guidance = buildGeminiFindGuidance(status, target, reminder.nativeFindHandStage === true);
    if (!guidance || reminder.turnInProgress || isGeminiPlaybackActive(reminder)) {
      return;
    }
    const now = Date.now();
    const sameGuidance = reminder.findLastSpokenStatus === status;
    if (sameGuidance && now - (reminder.findLastSpokenAt || 0) < geminiFindGuidanceRepeatMs(status)) {
      return;
    }
    if (!sendGeminiLiveEvent({ type: 'say', text: guidance, deliveryMode: 'guidance' })) {
      return;
    }
    reminder.findLastSpokenStatus = status;
    reminder.findLastSpokenAt = now;
    setActiveReminderStatus(`正在找${target}：${guidance}`);
    appendVisionLog(`Gemini 找东西：${guidance}`);
    logClientEvent('gemini_find.guidance_sent', {
      target,
      frameCount,
      status,
      guidance,
      confidence
    });
  } catch (error) {
    const staleReason = geminiFindObjectCheckStaleReason(reminder, target, taskSeq, requestSeq);
    if (staleReason) {
      logClientEvent('gemini_find.check_error_ignored', {
        reason: staleReason,
        target,
        frameCount,
        findTaskSeq: taskSeq,
        requestSeq,
        error: error.message
      });
      return;
    }
    const requestWasAborted = error?.name === 'AbortError'
      || /aborted|abort|取消/i.test(String(error?.message || ''));
    reminder.errorCount += 1;
    logClientEvent(requestWasAborted ? 'gemini_find.check_aborted' : 'gemini_find.check_failed', {
      target,
      frameCount,
      requestSeq,
      error: error.message
    });
    if (reminder.errorCount === 1 || reminder.errorCount % 5 === 0) {
      setActiveReminderStatus(`找东西快筛失败：${error.message}`);
    }
    const now = Date.now();
    if (
      appState.appVariant !== 'greencloud-gemini'
      && !requestWasAborted
      && Number(reminder.findInFlightCount || 0) <= 1
      && !reminder.turnInProgress
      && now - (reminder.findLastErrorSpokenAt || 0) >= 20000
      && sendGeminiLiveEvent({
        type: 'say',
        text: '视觉识别暂时没有响应，正在重试。',
        deliveryMode: 'guidance'
      })
    ) {
      reminder.findLastErrorSpokenAt = now;
      logClientEvent('gemini_find.retry_notice_sent', {
        target,
        frameCount,
        error: error.message
      });
    }
  } finally {
    finishGeminiFindObjectCheck(reminder, requestSeq);
  }
}

function buildGeminiReminderDetailSpeech(reminder, result, task) {
  if (appState.appVariant !== 'aliyun') {
    return '';
  }
  const contract = parseActiveReminderContract(task);
  if (contract.mode !== 'state_changed' || !result.shouldAlert) {
    return '';
  }
  return normalizeActiveReminderSpeechText(result.currentState || '');
}

function handleGeminiReminderAlert(result, task) {
  const reminder = appState.geminiReminder;
  if (!reminder) {
    return;
  }
  const label = reminder.reminderLabel || 'Gemini 主动提醒';
  const promptMode = reminder.promptMode || 'baseline';
  const now = Date.now();
  const reliableDelivery = usesReliableReminderDelivery(reminder);
  const messageSource = promptMode === 'deep_multitask'
    ? (result.observation || result.rawText)
    : result.rawText;
  const message = buildGeminiReminderDetailSpeech(reminder, result, task)
    || normalizeActiveReminderSpeechText(messageSource) || buildActiveReminderAlertMessage(task);
  const resultKey = buildGeminiReminderResultKey(message, task, result.instanceKey || '');
  if (reliableDelivery && (reminder.pendingAlertDelivery || reminder.turnInProgress || isGeminiPlaybackActive(reminder))) {
    setActiveReminderStatus(`${label}已命中，等待当前语音回合完成。`);
    logClientEvent('gemini_reminder.alert_suppressed', {
      reason: reminder.pendingAlertDelivery ? 'delivery_pending' : 'voice_turn_busy',
      label,
      frameCount: reminder.frameCount,
      task,
      message,
      resultKey
    });
    rollbackActiveReminderStateDelivery(reminder, result.currentState || '', result._deliverySnapshot);
    return;
  }
  if (
    shouldDedupeActiveReminderOccurrences(task)
    && resultKey
    && reminder.alertedResultKeys?.includes(resultKey)
  ) {
    setActiveReminderStatus(`${label}已命中但保持静默：当前结果已提醒过。`);
    logClientEvent('gemini_reminder.alert_suppressed', {
      reason: 'result_already_alerted',
      label,
      promptMode,
      frameCount: reminder.frameCount,
      task,
      message,
      resultKey
    });
    commitActiveReminderStateDelivery(reminder, result.currentState || '');
    return;
  }
  if (now - reminder.lastAlertAt < GEMINI_ACTIVE_REMINDER_ALERT_COOLDOWN_MS) {
    setActiveReminderStatus(`${label}已命中但处于冷却中。`);
    logClientEvent('gemini_reminder.alert_suppressed', {
      reason: 'cooldown',
      label,
      promptMode,
      frameCount: reminder.frameCount,
      task,
      message,
      resultKey
    });
    rollbackActiveReminderStateDelivery(reminder, result.currentState || '', result._deliverySnapshot);
    return;
  }
  if (!reliableDelivery) {
    reminder.lastAlertAt = now;
    if (resultKey) {
      reminder.alertedResultKeys = [...(reminder.alertedResultKeys || []), resultKey].slice(-20);
    }
    reminder.missCount = 0;
    reminder.alertCount += 1;
    sendGeminiLiveEvent({ type: 'say', text: message, task, deliveryMode: reminder.deliveryMode || 'broadcast' });
  } else {
    const sent = sendGeminiLiveEvent({
      type: 'say',
      text: message,
      task,
      deliveryMode: reminder.deliveryMode || 'broadcast'
    });
    if (!sent) {
      rollbackActiveReminderStateDelivery(reminder, result.currentState || '', result._deliverySnapshot);
      setActiveReminderStatus(`${label}命中，但语音发送失败，等待下一帧重试。`);
      logClientEvent('gemini_reminder.alert_send_failed', {
        label,
        frameCount: reminder.frameCount,
        task,
        message,
        resultKey
      });
      return;
    }
    reminder.lastAlertAt = now;
    reminder.missCount = 0;
    reminder.alertCount += 1;
    reminder.pendingAlertDelivery = {
      task,
      taskSeq: reminder.activeTaskSeq || 0,
      resultKey,
      state: result.currentState || '',
      snapshot: result._deliverySnapshot || null,
      message,
      sentAt: now,
      hadAudio: false,
      audioDurationStartMs: reminder.player?.monitorTotalDurationMs || 0
    };
  }
  setActiveReminderStatus(`${label}触发 ${reminder.alertCount} 次：已交给 Gemini Live 播报。`);
  appendVisionLog(`${label}：${message}`);
  logClientEvent('gemini_reminder.alert_queued', {
    label,
    promptMode,
    deliveryMode: reminder.deliveryMode || 'broadcast',
    alertCount: reminder.alertCount,
    frameCount: reminder.frameCount,
    task,
    message,
    resultKey,
    rawText: result.rawText || '',
    observation: result.observation || '',
    resultReached: Boolean(result.resultReached),
    resultText: result.resultText || '',
    instanceKey: result.instanceKey || '',
    speakable: result.speakable || '',
    latencyMs: result.latencyMs ?? null
  });
}

function finalizeGeminiPendingAlertDelivery(reminder, outputText = '') {
  const pending = reminder?.pendingAlertDelivery;
  if (!pending) {
    return;
  }
  const currentTask = getGeminiActiveReminderTask();
  const currentTaskSeq = reminder.activeTaskSeq || 0;
  const queuedAudioMs = Math.max(
    0,
    (reminder.player?.monitorTotalDurationMs || 0) - (pending.audioDurationStartMs || 0)
  );
  const speechUnits = Math.max(
    countGeminiReminderSpeechUnits(pending.message),
    countGeminiReminderSpeechUnits(outputText)
  );
  const minimumAudioMs = speechUnits >= 16
    ? Math.min(1200, speechUnits * 40)
    : 0;
  const obviousTextAudioMismatch = Boolean(
    pending.hadAudio
    && minimumAudioMs > 0
    && queuedAudioMs < minimumAudioMs
  );
  const delivered = Boolean(pending.hadAudio && !obviousTextAudioMismatch);
  const current = pending.task === currentTask && pending.taskSeq === currentTaskSeq;
  let completedTask = '';
  if (delivered && current) {
    if (shouldDedupeActiveReminderOccurrences(pending.task) && pending.resultKey) {
      reminder.alertedResultKeys = [...(reminder.alertedResultKeys || []), pending.resultKey].slice(-20);
    }
    commitActiveReminderStateDelivery(reminder, pending.state);
    logClientEvent('gemini_reminder.alert_delivered', {
      task: pending.task,
      resultKey: pending.resultKey,
      state: pending.state,
      hadAudio: Boolean(pending.hadAudio),
      hadText: Boolean(String(outputText || '').trim()),
      queuedAudioMs: Math.round(queuedAudioMs),
      minimumAudioMs,
      speechUnits,
      obviousTextAudioMismatch,
      latencyMs: Date.now() - pending.sentAt
    });
    if (shouldCompleteActiveReminderTaskAfterDelivery(pending.task)) {
      completedTask = pending.task;
    }
  } else {
    rollbackActiveReminderStateDelivery(reminder, pending.state, pending.snapshot);
    logClientEvent('gemini_reminder.alert_not_delivered', {
      reason: current
        ? (pending.hadAudio ? 'audio_too_short' : 'no_audio_received')
        : 'stale_task',
      task: pending.task,
      resultKey: pending.resultKey,
      state: pending.state,
      hadAudio: Boolean(pending.hadAudio),
      hadText: Boolean(String(outputText || '').trim()),
      queuedAudioMs: Math.round(queuedAudioMs),
      minimumAudioMs,
      speechUnits,
      obviousTextAudioMismatch
    });
  }
  reminder.pendingAlertDelivery = null;
  if (completedTask) {
    completeGeminiReminderTask(reminder, completedTask, 'audio_delivered');
  }
}

function rollbackGeminiPendingAlertDelivery(reminder, reason = '') {
  const pending = reminder?.pendingAlertDelivery;
  if (!pending) {
    return;
  }
  rollbackActiveReminderStateDelivery(reminder, pending.state, pending.snapshot);
  logClientEvent('gemini_reminder.alert_delivery_rolled_back', {
    reason,
    task: pending.task,
    resultKey: pending.resultKey,
    state: pending.state
  });
  reminder.pendingAlertDelivery = null;
}

function buildGeminiReminderResultKey(message, task, instanceKey = '') {
  const compactMessage = String(message || '').replace(/\s+/g, '');
  const compactTask = String(task || '').replace(/\s+/g, '');
  const contract = parseActiveReminderContract(task);
  const target = extractGeminiReminderResultTarget(compactTask, compactMessage);
  if (contract.lifecycle === 'distinct_occurrences') {
    const stableInstance = normalizeGeminiReminderResultText(instanceKey);
    if (stableInstance) {
      return [target || contract.target || '目标', stableInstance].join('-').slice(0, 60);
    }
    const anchors = extractGeminiReminderStableAnchors(compactMessage);
    if (anchors.length) {
      return [target || contract.target || '目标', ...anchors].join('-').slice(0, 60);
    }
    return `${target || contract.target || '目标'}-${normalizeGeminiReminderResultText(compactMessage).slice(0, 32)}`;
  }
  if (target) {
    const anchors = extractGeminiReminderStableAnchors(compactMessage);
    if (anchors.length) {
      return [target, ...anchors].join('-').slice(0, 40);
    }
    return target;
  }
  const text = normalizeGeminiReminderResultText(compactMessage);
  if (text) {
    return text.slice(0, 30);
  }
  return String(task || '').replace(/\s+/g, '').slice(0, 30);
}

function normalizeGeminiReminderResultText(value) {
  return String(value || '')
    .replace(/\s+/g, '')
    .replace(/[，,。.!！?？；;：:、"'“”‘’]/g, '')
    .replace(/^(画面中|画面里|镜头里|视频里|当前|现在|前方|检测到|识别到|发现|看到|看见|出现|可见|有)/g, '')
    .replace(/(出现|可见|看到|看见|发现|检测到|识别到|了|啦|呢|啊|哦|呀|吧|嘛)$/g, '')
    .replace(/(一个|一只|一部|一台|这个|那个|用户的|我的|你的)/g, '')
    .trim();
}

function extractGeminiReminderResultTarget(taskText, messageText) {
  const contractTarget = extractActiveReminderContractField(taskText, 'target')
    || extractActiveReminderTarget(taskText);
  if (contractTarget) {
    return normalizeGeminiReminderResultTarget(contractTarget, taskText, messageText);
  }
  const target = extractGenericReminderNounPhrase(`${taskText} ${messageText}`);
  return normalizeGeminiReminderResultTarget(target, taskText, messageText);
}

function normalizeGeminiReminderResultTarget(target, taskText, messageText) {
  return cleanActiveReminderTarget(target || extractGenericReminderNounPhrase(`${taskText || ''} ${messageText || ''}`));
}

function extractGenericReminderNounPhrase(value) {
  const text = String(value || '').replace(/\s+/g, '');
  if (!text) {
    return '';
  }
  const patterns = [
    /target=([^；。\n]{1,24})/,
    /(?:目标|主体|对象)(?:是|为|：|:)?([^，,。.!！?？；;：:\s]{1,24})/,
    /(?:看到|看见|发现|识别到|找到|出现|有)([^，,。.!！?？；;：:\s]{1,24})/
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const target = cleanActiveReminderTarget(match?.[1] || '');
    if (target) {
      return target;
    }
  }
  return '';
}

function extractGeminiReminderStableAnchors(messageText) {
  const text = String(messageText || '');
  const anchors = Array.from(text.matchAll(/(?:在|位于|靠近|接近|放在|出现于|移到|移动到|到了)([^，,。.!！?？；;：:、\s]{1,12})/g))
    .map((match) => normalizeGeminiReminderResultText(match[1]))
    .filter(Boolean);
  const found = [];
  for (const anchor of anchors) {
    if (text.includes(anchor) && !found.some((item) => item.includes(anchor) || anchor.includes(item))) {
      found.push(anchor);
    }
  }
  return found.slice(0, 2);
}

function updateGeminiReminderMissState(reminder, task) {
  if (!task) {
    return;
  }
  reminder.missCount += 1;
  if (
    shouldDedupeActiveReminderOccurrences(task)
    && reminder.alertedResultKeys?.length
    && reminder.missCount >= 3
  ) {
    logClientEvent('gemini_reminder.occurrence_window_reset', {
      task,
      missCount: reminder.missCount
    });
    reminder.alertedResultKeys = [];
    reminder.missCount = 0;
  }
}

function extractActiveReminderContractField(task, fieldName) {
  const text = String(task || '');
  const pattern = new RegExp(`${fieldName}=([^；。\\n]+)`);
  const match = text.match(pattern);
  return String(match?.[1] || '').replace(/\s+/g, ' ').trim();
}

function parseActiveReminderContract(task) {
  const text = String(task || '');
  const compact = text.replace(/\s+/g, '');
  const explicitCategory = extractActiveReminderContractField(text, 'category');
  const category = explicitCategory === 'state_tracking' || /任务类型：state_tracking|category=state_tracking/.test(compact)
    ? 'state_tracking'
    : 'target_presence';
  const mode = category === 'target_presence'
    ? 'appear'
    : inferActiveReminderContractMode(
      extractActiveReminderContractField(text, 'mode') || extractActiveReminderContractField(text, 'condition') || text,
      category
    );
  const target = extractActiveReminderContractField(text, 'target');
  const condition = extractActiveReminderContractField(text, 'condition');
  const speakText = extractActiveReminderContractField(text, 'speakText');
  const lifecycle = normalizeClientActiveReminderLifecycle(
    extractActiveReminderContractField(text, 'lifecycle'),
    category,
    mode,
    text
  );
  return {
    category,
    mode,
    lifecycle,
    target,
    condition,
    speakText
  };
}

function normalizeClientActiveReminderLifecycle(value, category, mode, sourceText = '') {
  if (mode === 'state_changed') {
    return 'continuous_changes';
  }
  if (mode === 'result_reached' || category === 'state_tracking') {
    return 'once';
  }
  const raw = String(value || '').trim();
  if (raw === 'distinct_occurrences' || raw === 'repeat' || raw === 'continuous') {
    return 'distinct_occurrences';
  }
  const compact = String(sourceText || '').replace(/\s+/g, '');
  if (/(每次|每一个|每个|所有|凡是|只要有|持续提醒|一直提醒|反复提醒|新的目标|新目标|不同目标)/.test(compact)) {
    return 'distinct_occurrences';
  }
  return 'once';
}

function shouldCompleteActiveReminderTaskAfterDelivery(task) {
  return parseActiveReminderContract(task).lifecycle === 'once';
}

function shouldDedupeActiveReminderOccurrences(task) {
  return parseActiveReminderContract(task).lifecycle === 'distinct_occurrences';
}

function isPositiveActiveReminderResultText(value, contract = {}) {
  const text = String(value || '').replace(/\s+/g, '');
  return Boolean(text);
}

function applyReliableActiveReminderEvidenceGuard(reminder, result, task) {
  if (
    !usesReliableReminderDelivery(reminder)
    || (!result?.shouldAlert && result?.resultReached !== true)
  ) {
    return result;
  }
  const contract = parseActiveReminderContract(task);
  const inconsistentPresence = contract.category === 'target_presence'
    && (result.state !== 'HIT' || result.speakable !== true);
  if (!inconsistentPresence) {
    return result;
  }
  return {
    ...result,
    shouldAlert: false,
    resultReached: result.resultReached,
    resultText: result.resultText,
    speakable: false,
    _evidenceGuard: {
      action: 'suppressed',
      reason: 'inconsistent_presence_fields',
      confidence: result.confidence ?? null,
      state: result.state || '',
      category: contract.category
    }
  };
}

function applyActiveReminderStateMemory(reminder, result, task, meta = {}) {
  if (!reminder || !isActiveReminderStateTrackingTask(task) || result?.provider === 'idle' || result?.provider === 'test') {
    return result;
  }
  const contract = parseActiveReminderContract(task);
  if (result?._evidenceGuard?.action === 'suppressed') {
    return {
      ...result,
      shouldAlert: false,
      resultReached: false,
      resultText: '',
      speakable: false,
      _stateMemory: {
        action: 'evidence_guard_suppressed',
        reason: result._evidenceGuard.reason,
        previousState: reminder.stateMemory?.lastStableState || ''
      }
    };
  }
  const rawCurrentState = result.currentState || result.observation || result.rawText || '';
  if (contract.mode === 'state_changed' && isUnobservableActiveReminderState(task, rawCurrentState)) {
    return {
      ...result,
      shouldAlert: false,
      state: 'UNCERTAIN',
      currentState: '',
      observation: '',
      rawText: '',
      resultReached: false,
      resultText: '',
      speakable: false,
      _stateMemory: {
        action: 'unobservable_keep_memory',
        previousState: reminder.stateMemory?.lastStableState || '',
        currentState: '',
        candidateState: reminder.stateMemory?.candidateState || '',
        candidateCount: Number(reminder.stateMemory?.candidateCount || 0),
        candidateResetReason: '',
        reason: 'target_not_reliably_observable'
      }
    };
  }
  const currentState = normalizeActiveReminderProcessState(task, rawCurrentState);
  const uncertain = result.state === 'UNCERTAIN';
  if (uncertain) {
    return {
      ...result,
      shouldAlert: false,
      currentState: '',
      _stateMemory: {
        action: 'uncertain_keep_memory',
        previousState: reminder.stateMemory?.lastStableState || ''
      }
    };
  }
  if (!currentState || result.state === 'NO_HIT' || /^(N|NO|NO_HIT)$/i.test(currentState)) {
    return {
      ...result,
      shouldAlert: false,
      currentState,
      _stateMemory: {
        action: 'empty_or_no_hit',
        previousState: reminder.stateMemory?.lastStableState || ''
      }
    };
  }
  if (!reminder.stateMemory || reminder.stateMemory.task !== task) {
    reminder.stateMemory = {
      task,
      lastStableState: '',
      lastDeliveredState: '',
      lastReached: false,
      candidateState: '',
      candidateCount: 0,
      reachedCandidateState: '',
      reachedCandidateCount: 0,
      pendingDeliveryState: ''
    };
  }
  const memory = reminder.stateMemory;
  const deliverySnapshot = {
    task: memory.task,
    lastStableState: memory.lastStableState,
    lastDeliveredState: memory.lastDeliveredState,
    lastReached: memory.lastReached,
    candidateState: memory.candidateState,
    candidateCount: memory.candidateCount,
    reachedCandidateState: memory.reachedCandidateState,
    reachedCandidateCount: memory.reachedCandidateCount,
    pendingDeliveryState: memory.pendingDeliveryState
  };
  const previousState = memory.lastStableState || '';
  const changeTask = contract.mode === 'state_changed';
  if (memory.pendingDeliveryState && areActiveReminderStatesEquivalent(task, memory.pendingDeliveryState, currentState)) {
    return {
      ...result,
      shouldAlert: false,
      state: 'PROGRESS',
      currentState,
      speakable: false,
      _stateMemory: {
        action: 'delivery_pending',
        previousState,
        currentState
      }
    };
  }
  if (!previousState) {
    const initialModelReached = result.resultReached === true
      && isPositiveActiveReminderResultText(result.resultText || result.observation || currentState, contract);
    const initialReached = Boolean(!changeTask && initialModelReached);
    if (!initialReached) {
      memory.reachedCandidateState = '';
      memory.reachedCandidateCount = 0;
    }
    memory.lastStableState = currentState;
    memory.lastReached = initialReached;
    if (initialReached) {
      let message = normalizeActiveReminderSpeechText(result.resultText || '')
        || contract.speakText
        || formatActiveReminderStateMemoryMessage(task, currentState);
      if (!isPositiveActiveReminderResultText(message, contract)) {
        message = '';
      }
      if (message && memory.lastDeliveredState !== currentState) {
        if (usesReliableReminderDelivery(reminder)) {
          memory.pendingDeliveryState = currentState;
        } else {
          memory.lastDeliveredState = currentState;
        }
        return {
          ...result,
          shouldAlert: true,
          state: 'HIT',
          currentState,
          observation: message,
          rawText: message,
          speakable: true,
          _deliverySnapshot: deliverySnapshot,
          _stateMemory: {
            action: 'initial_result_alert',
            previousState: '',
            currentState,
            changeTask,
            reachedNow: true,
            reachedBefore: false,
            mode: contract.mode,
            resultReached: Boolean(result.resultReached),
            resultText: result.resultText || ''
          }
        };
      }
    }
    return {
      ...result,
      shouldAlert: false,
      currentState,
      observation: result.observation || currentState,
      _stateMemory: {
        action: 'baseline_set',
        previousState: '',
        currentState
      }
    };
  }

  let changed = !areActiveReminderStatesEquivalent(task, previousState, currentState);
  const modelReached = result.resultReached === true
    && isPositiveActiveReminderResultText(result.resultText || result.observation || currentState, contract);
  const reachedNow = !changeTask && modelReached;
  const reachedBefore = Boolean(memory.lastReached);
  if (!reachedNow) {
    memory.reachedCandidateState = '';
    memory.reachedCandidateCount = 0;
  }
  const shouldAlertByMemory = changeTask
    ? changed
    : (reachedNow && !reachedBefore);
  memory.lastStableState = currentState;
  memory.lastReached = reachedNow;

  let shouldAlert = Boolean(shouldAlertByMemory);
  let message = normalizeActiveReminderSpeechText(result.resultText || '')
    || (changeTask ? normalizeActiveReminderSpeechText(result.observation || result.rawText || currentState) : '')
    || contract.speakText
    || formatActiveReminderStateMemoryMessage(task, currentState);
  if (!isPositiveActiveReminderResultText(message, contract)) {
    shouldAlert = false;
    message = '';
  }
  if (shouldAlert && areActiveReminderStatesEquivalent(task, memory.lastDeliveredState, currentState)) {
    shouldAlert = false;
    message = '';
  }
  if (shouldAlert) {
    if (usesReliableReminderDelivery(reminder)) {
      memory.pendingDeliveryState = currentState;
    } else {
      memory.lastDeliveredState = currentState;
    }
  }

  return {
    ...result,
    shouldAlert,
    state: shouldAlert ? 'HIT' : (result.state || 'PROGRESS'),
    currentState,
    observation: shouldAlert ? message : (result.observation || currentState),
    rawText: shouldAlert ? message : (result.rawText || currentState),
    speakable: shouldAlert,
    _deliverySnapshot: shouldAlert ? deliverySnapshot : null,
    _stateMemory: {
      action: shouldAlert ? 'alert' : 'remember',
      previousState,
      currentState,
      changed,
      changeTask,
      reachedNow,
      reachedBefore,
      mode: contract.mode,
      resultReached: Boolean(result.resultReached),
      resultText: result.resultText || ''
    }
  };
}

function commitActiveReminderStateDelivery(reminder, state) {
  const memory = reminder?.stateMemory;
  if (!memory || !state) {
    return;
  }
  memory.lastDeliveredState = state;
  if (memory.pendingDeliveryState === state) {
    memory.pendingDeliveryState = '';
  }
}

function rollbackActiveReminderStateDelivery(reminder, state = '', snapshot = null) {
  const memory = reminder?.stateMemory;
  if (!memory) {
    return;
  }
  if (snapshot?.task && snapshot.task === memory.task) {
    memory.lastStableState = snapshot.lastStableState || '';
    memory.lastDeliveredState = snapshot.lastDeliveredState || '';
    memory.lastReached = Boolean(snapshot.lastReached);
    memory.candidateState = snapshot.candidateState || '';
    memory.candidateCount = Number(snapshot.candidateCount || 0);
    memory.reachedCandidateState = snapshot.reachedCandidateState || '';
    memory.reachedCandidateCount = Number(snapshot.reachedCandidateCount || 0);
    memory.pendingDeliveryState = snapshot.pendingDeliveryState || '';
    return;
  }
  if (!state || memory.pendingDeliveryState === state) {
    memory.pendingDeliveryState = '';
  }
}

function isActiveReminderStateTrackingTask(task) {
  const text = String(task || '').replace(/\s+/g, '');
  if (!text) {
    return false;
  }
  if (/任务类型：target_presence/.test(text)) {
    return false;
  }
  if (/任务类型：state_tracking|状态跟踪任务|持续观察|currentState/.test(text)) {
    return true;
  }
  if (looksLikeDescribedTargetPresenceInstruction(text)) {
    return false;
  }
  return hasActiveReminderStateTrackingTriggerText(text);
}

function normalizeActiveReminderProcessState(task, value) {
  return normalizeActiveReminderStateMemoryState(value);
}

function countGeminiReminderSpeechUnits(value) {
  return Array.from(
    String(value || '')
      .replace(/\[SAY\]/gi, '')
      .replace(/[\s，。！？、；：“”‘’（）【】《》,.!?;:'"()[\]{}<>_-]/g, '')
  ).length;
}

function activeReminderTracksExistenceChange(task) {
  const contract = parseActiveReminderContract(task);
  if (contract.mode !== 'state_changed') {
    return false;
  }
  const condition = `${contract.condition || ''}${contract.speakText || ''}`.replace(/\s+/g, '');
  return /(出现|消失|存在|不存在|进入|离开|移走|拿走)/.test(condition);
}

function isUnobservableActiveReminderState(task, value) {
  const state = normalizeActiveReminderStateMemoryState(value);
  if (!state) {
    return true;
  }
  if (/(未发现|没发现|没有发现|未看到|没看到|没有看到|看不到|无法看到|观察不到|不在画面|不在镜头|离开画面|离开镜头|移出画面|移出镜头|出画|失去目标|目标丢失|主体丢失|被遮挡|遮挡|模糊|看不清|无法判断|无法确认|证据不足)/.test(state)) {
    return true;
  }
  if (/(?:主体|目标|对象|人物|物体)?(?:已)?(?:消失|不存在|离开)$/.test(state)) {
    return !activeReminderTracksExistenceChange(task);
  }
  return false;
}

function normalizeActiveReminderStateMemoryState(value) {
  return String(value || '')
    .replace(/\s+/g, '')
    .replace(/[，,。.!！?？；;：:、"'“”‘’]/g, '')
    .replace(/^(当前|现在|画面中|画面里|镜头里|视频里|可以看到|可见|检测到|识别到)/g, '')
    .replace(/(了|啦|呢|啊|哦|呀|吧|嘛)$/g, '')
    .trim()
    .slice(0, 40);
}

function areActiveReminderStatesEquivalent(task, left, right) {
  const a = normalizeActiveReminderStateMemoryState(left);
  const b = normalizeActiveReminderStateMemoryState(right);
  return Boolean(a && b && a === b);
}

function formatActiveReminderStateMemoryMessage(task, currentState) {
  const state = normalizeActiveReminderStateMemoryState(currentState);
  if (!state) {
    return buildActiveReminderAlertMessage(task);
  }
  return state.slice(0, 40);
}

function updateGeminiReminderTaskFromTranscript(transcript) {
  const reminder = appState.geminiReminder;
  if (!reminder) {
    return false;
  }
  const instruction = extractActiveReminderInstruction(transcript);
  if (!instruction) {
    return false;
  }
  return updateGeminiReminderTaskFromInstruction(instruction, {
    source: 'input_transcript',
    inputTranscript: transcript
  });
}

function updateGeminiReminderTaskFromGeminiTurn(inputTranscript, outputTranscript) {
  const reminder = appState.geminiReminder;
  if (!reminder) {
    return false;
  }
  if (isGeminiReminderExecutionMode(reminder, 'find_object')) {
    applyFindObjectVoicePriority(inputTranscript);
    return true;
  }
  if (reminder.unifiedAssistantMode) {
    if (
      isGeminiReminderExecutionMode(reminder, 'continuous_narration')
      && !reminder.unifiedCommandAcceptedThisTurn
    ) {
      applyContinuousNarrationVoicePriority(inputTranscript);
    }
    return true;
  }
  if (isGeminiReminderExecutionMode(reminder, 'function_contract')) {
    return Boolean(reminder.contractAcceptedThisTurn);
  }
  if (isGeminiReminderExecutionMode(reminder, 'continuous_narration')) {
    applyContinuousNarrationVoicePriority(inputTranscript);
    return true;
  }
  startGeminiReminderTaskNormalize(inputTranscript, outputTranscript);
  return true;
}

function isExactSingleWordStop(transcript) {
  return hasStandaloneSingleWordStopSegment(transcript);
}

function hasStandaloneSingleWordStopSegment(transcript) {
  return String(transcript || '')
    .split(/[，,。.!！?？；;：:\r\n]+/)
    .some((segment) => segment.trim() === '停');
}

function applyFindObjectVoicePriority(inputTranscript) {
  const reminder = appState.geminiReminder;
  if (!reminder || !isGeminiReminderExecutionMode(reminder, 'find_object')) {
    return false;
  }
  const transcript = String(inputTranscript || '').replace(/\s+/g, ' ').trim();
  if (!reminder.findTarget) {
    return true;
  }
  if (!isExactSingleWordStop(transcript)) {
    logClientEvent('gemini_find.voice_ignored_while_active', { transcript });
    return true;
  }
  const target = String(reminder.findTarget || '').trim();
  reminder.findTaskSeq = (reminder.findTaskSeq || 0) + 1;
  clearGeminiFindObjectMemory(reminder, 'find_voice_stop');
  if (reminder.launchedFromUnified) {
    reminder.returnToUnifiedAfterTurn = 'find_voice_stop';
  }
  setActiveReminderStatus('找东西已停止，正在返回视觉助手。');
  logClientEvent('gemini_find.voice_priority_stopped', { transcript, target });
  sendGeminiLiveEvent({
    type: 'say',
    text: '找东西已停止。',
    deliveryMode: 'find_voice_stop'
  });
  return true;
}

function applyContinuousNarrationVoicePriority(inputTranscript) {
  const reminder = appState.geminiReminder;
  if (!reminder || !isGeminiReminderExecutionMode(reminder, 'continuous_narration')) {
    return false;
  }
  if (reminder.continuousNarrationActive) {
    logClientEvent('gemini_continuous.voice_ignored_while_active', {
      transcript: String(inputTranscript || '').slice(0, 80)
    });
    return true;
  }
  const rawTranscript = String(inputTranscript || '').replace(/\s+/g, ' ').trim();
  const focus = rawTranscript.slice(0, 80);
  if (
    !focus
    || focus.startsWith('[SAY]')
    || focus.startsWith('[NARRATE]')
    || focus === '持续播报开始，你需要我关注什么？'
  ) {
    return false;
  }
  // No task exists yet: a stop fragment is not a narration focus.
  if (hasStandaloneSingleWordStopSegment(focus)) {
    return true;
  }
  const intervalMs = resolveContinuousNarrationIntervalMs(rawTranscript);
  reminder.continuousNarrationFocus = focus;
  reminder.continuousNarrationActive = true;
  reminder.continuousNarrationAwaitingFocus = false;
  reminder.continuousNarrationDepthRequested = resolvePlatformContinuousNarrationDepthRequested(rawTranscript);
  reminder.continuousNarrationIntervalMs = intervalMs;
  reminder.continuousNarrationLastRequestAt = 0;
  reminder.continuousNarrationRequestCount = 0;
  reminder.continuousNarrationUserSpeechUntil = 0;
  setLocalMicrophoneEnabled(false, 'continuous narration focus established; button-only mode');
  syncSpecialTaskStopControl({ focus: true });
  setActiveReminderStatus(`持续播报重点已建立：${focus}；间隔${intervalMs / 1000}秒。`);
  logClientEvent('gemini_continuous.voice_priority_applied', {
    focus,
    intervalSeconds: intervalMs / 1000,
    depthRequested: reminder.continuousNarrationDepthRequested,
    modelCommandAction: reminder.continuousNarrationCommandActionThisTurn || ''
  });
  return true;
}

async function startGeminiReminderTaskNormalize(inputTranscript, outputTranscript) {
  const reminder = appState.geminiReminder;
  if (!reminder) {
    return false;
  }
  const seq = (reminder.taskNormalizeSeq || 0) + 1;
  reminder.taskNormalizeSeq = seq;
  reminder.taskNormalizeInFlight = true;
  setActiveReminderStatus(`${reminder.reminderLabel || 'Gemini 主动提醒'}正在由合同模型判断本轮任务。`);
  logClientEvent('gemini_reminder.task_normalize_requested', {
    label: reminder.reminderLabel || 'Gemini 主动提醒',
    promptMode: reminder.promptMode || 'baseline',
    seq,
    activeTaskSeq: reminder.activeTaskSeq || 0,
    inputTranscript,
    outputTranscript,
    taskSource: reminder.taskSourceMode === 'confirmation_output' ? 'gemini_confirmation_output' : 'legacy_input_or_output'
  });

  try {
    const result = await apiPost('/api/active-reminder-task-normalize', { inputTranscript, outputTranscript });
    if (appState.geminiReminder !== reminder || reminder.taskNormalizeSeq !== seq) {
      if (appState.geminiReminder === reminder && reminder.taskNormalizeSeq === seq) {
        reminder.taskNormalizeInFlight = false;
      }
      logClientEvent('gemini_reminder.task_normalize_ignored', {
        reason: 'stale_result',
        seq,
        currentTaskSeq: reminder.activeTaskSeq || 0,
        taskText: result.taskText || ''
      });
      return false;
    }
    reminder.taskNormalizeInFlight = false;
    if (result.action === 'none') {
      setActiveReminderStatus(reminder.taskOverride
        ? `${reminder.reminderLabel || 'Gemini 主动提醒'}继续执行当前任务。`
        : `${reminder.reminderLabel || 'Gemini 主动提醒'}等待新的提醒任务。`);
      logClientEvent('gemini_reminder.contract_model_no_task', {
        seq,
        inputTranscript,
        outputTranscript,
        provider: result.provider || '',
        model: result.model || '',
        latencyMs: result.latencyMs ?? '',
        attempts: result.attempts ?? ''
      });
      return false;
    }
    if (!isExecutableNormalizedActiveReminderContract(result)) {
      logClientEvent('gemini_reminder.task_normalize_rejected', {
        seq,
        reason: 'invalid_structured_contract',
        action: result.action || '',
        contractType: result.contractType || '',
        category: result.category || '',
        mode: result.mode || '',
        lifecycle: result.lifecycle || '',
        target: result.target || '',
        condition: result.condition || '',
        taskText: result.taskText || '',
        inputTranscript,
        outputTranscript
      });
      return false;
    }
    reminder.activeTaskSeq = (reminder.activeTaskSeq || 0) + 1;
    clearGeminiReminderTaskForNewInstruction(reminder, 'contract_model_replaced_task');
    reminder.taskOverride = result.taskText;
    setActiveReminderStatus(`${reminder.reminderLabel || 'Gemini 主动提醒'}任务已建立：${result.condition || result.target}。`);
    logClientEvent('gemini_reminder.task_normalized', {
      label: reminder.reminderLabel || 'Gemini 主动提醒',
      promptMode: reminder.promptMode || 'baseline',
      seq,
      action: result.action || '',
      contractType: result.contractType || '',
      category: result.category || '',
      target: result.target || '',
      condition: result.condition || '',
      confidence: result.confidence ?? '',
      task: result.taskText,
      latencyMs: result.latencyMs ?? '',
      rawText: result.rawText || '',
      attempts: result.attempts ?? ''
    });
    return true;
  } catch (error) {
    if (appState.geminiReminder === reminder && reminder.taskNormalizeSeq === seq) {
      reminder.taskNormalizeInFlight = false;
    }
    logClientEvent('gemini_reminder.task_normalize_failed', {
      seq,
      inputTranscript,
      outputTranscript,
      error: error.message
    });
    return false;
  }
}

function clearGeminiReminderTaskForNewInstruction(reminder, reason = '') {
  if (!reminder) {
    return;
  }
  rollbackGeminiPendingAlertDelivery(reminder, reason || 'new_instruction');
  reminder.taskOverride = '';
  reminder.lastAlertedTaskKey = '';
  reminder.alertedResultKeys = [];
  reminder.stateMemory = null;
  reminder.missCount = 0;
  reminder.lastAlertAt = 0;
  reminder.pendingMessage = '';
  reminder.pendingTask = '';
  reminder.pendingSpeechText = '';
  if (reason) {
    logClientEvent('gemini_reminder.task_cleared_for_new_instruction', {
      reason,
      activeTaskSeq: reminder.activeTaskSeq || 0
    });
  }
}

function completeGeminiReminderTask(reminder, task, reason = '') {
  if (!reminder || getGeminiActiveReminderTask() !== task) {
    return false;
  }
  reminder.activeTaskSeq = (reminder.activeTaskSeq || 0) + 1;
  reminder.taskOverride = '';
  reminder.lastAlertedTaskKey = '';
  reminder.alertedResultKeys = [];
  reminder.stateMemory = null;
  reminder.missCount = 0;
  setActiveReminderStatus(`${reminder.reminderLabel || 'Gemini 主动提醒'}任务已完成，等待新任务。`);
  logClientEvent('gemini_reminder.task_completed', {
    reason,
    task,
    activeTaskSeq: reminder.activeTaskSeq || 0
  });
  return true;
}

function updateGeminiReminderTaskFromConfirmation(inputTranscript, outputTranscript) {
  const reminder = appState.geminiReminder;
  if (!reminder) {
    return false;
  }
  if (!hasGeminiActiveReminderIntent(inputTranscript, outputTranscript)) {
    return false;
  }
  const target = extractGeminiReminderConfirmationTarget(outputTranscript);
  if (!target) {
    return false;
  }
  return updateGeminiReminderTaskFromInstruction(`看到${target}提醒我`, {
    source: 'confirmation_output',
    inputTranscript,
    outputTranscript
  });
}

function extractGeminiReminderConfirmationTarget(outputTranscript) {
  const text = String(outputTranscript || '').replace(/\s+/g, '').trim();
  if (!text || text.startsWith('主动提醒结果')) {
    return '';
  }
  const patterns = [
    /看到(.{1,24}?)(?:会提醒你|会提示你|会告诉你|会通知你|会叫你)/,
    /看到(.{1,24}?)(?:我会提醒你|我会提示你|我会告诉你|我会通知你)/,
    /看到(.{1,24}?)(?:提醒你|提示你|告诉你|通知你|叫你)/
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const target = cleanActiveReminderTarget(match?.[1] || '');
    if (target) {
      return target;
    }
  }
  return '';
}

function hasGeminiActiveReminderIntent(inputTranscript, outputTranscript = '') {
  const compactInput = String(inputTranscript || '').replace(/\s+/g, '');
  const compactOutput = String(outputTranscript || '').replace(/\s+/g, '');
  if (hasExplicitActiveReminderContractModeText(compactInput) || hasExplicitActiveReminderContractModeText(compactOutput)) {
    return true;
  }
  const hasUserTrigger = hasActiveReminderTaskTriggerText(compactInput);
  const hasUserNotifyAction = hasActiveReminderNotifyActionText(compactInput);
  if (hasUserTrigger && hasUserNotifyAction) {
    return true;
  }
  return Boolean(extractGeminiReminderConfirmationTarget(outputTranscript));
}

function isExecutableNormalizedActiveReminderContract(result) {
  const action = String(result?.action || '');
  const contractType = String(result?.contractType || '');
  const category = String(result?.category || '');
  const mode = String(result?.mode || '');
  const lifecycle = String(result?.lifecycle || '');
  const target = normalizeActiveReminderInstructionText(result?.target || '');
  const condition = normalizeActiveReminderInstructionText(result?.condition || '');
  const speakText = normalizeActiveReminderInstructionText(result?.speakText || '');
  const categoryModeValid = category === 'target_presence'
    ? mode === 'appear'
    : category === 'state_tracking' && (mode === 'result_reached' || mode === 'state_changed');
  const lifecycleValid = lifecycle === 'once'
    || lifecycle === 'distinct_occurrences'
    || lifecycle === 'continuous_changes';
  const contractTypeMatches = (
    (contractType === 'appearance_once' && category === 'target_presence' && mode === 'appear' && lifecycle === 'once')
    || (contractType === 'appearance_new_instances' && category === 'target_presence' && mode === 'appear' && lifecycle === 'distinct_occurrences')
    || (contractType === 'result_once' && category === 'state_tracking' && mode === 'result_reached' && lifecycle === 'once')
    || (contractType === 'change_continuous' && category === 'state_tracking' && mode === 'state_changed' && lifecycle === 'continuous_changes')
  );
  return Boolean(
    action === 'create_task'
    && result?.taskText
    && categoryModeValid
    && lifecycleValid
    && contractTypeMatches
    && target
    && condition
    && speakText
  );
}

function hasActiveReminderTaskTriggerText(compactText) {
  const compact = String(compactText || '').replace(/\s+/g, '');
  if (!compact) {
    return false;
  }
  return /(看到|看见|发现|识别到|找到|出现|有|如果|一旦|下次|等会|的时候|时候|时)/.test(compact)
    || hasActiveReminderStateTrackingTriggerText(compact);
}

function hasActiveReminderNotifyActionText(compactText) {
  const compact = String(compactText || '').replace(/\s+/g, '');
  if (!compact) {
    return false;
  }
  return /(提醒我|提示我|告诉我|通知我|叫我|和我说|跟我说|对我说|说一声|说一下|说下|我讲|跟我讲|告诉一下|报一下)/.test(compact);
}

function hasActiveReminderChangeTriggerText(compactText) {
  const compact = String(compactText || '').replace(/\s+/g, '');
  return /(变化|改变|有变化|状态变|一变|变了|换位置|换地方|移动了|挪动了|挪位置|位置变|内容变|移动到.*新|(?:从|由).{1,20}(?:变成|变为|到|拿起|拿起来|放下|离开|进入|出来))/.test(compact);
}

function hasActiveReminderStateTrackingTriggerText(compactText) {
  const compact = String(compactText || '').replace(/\s+/g, '');
  return hasActiveReminderChangeTriggerText(compact)
    || /(移动到|挪到|变成|变为|亮了|暗了|灭了|熄了|黑了|开了|关了|一开|一关|亮起来|暗下来|打开|关上|关掉|关闭|开启|开始|停止|停了|停下|停住|停转|快满|满了|接近|靠近|走近|到达|到站|走到|离开|进入|出来|过来|出现|没人了|无人了|没有.*了|不见|消失|伸到|放到|放上|放下|拿起|拿起来|挡住|让开|覆盖|铺满|翻到|跳到|叫到|轮到|显示完成|完成|通过|就绪|准备好了)/.test(compact)
    || /[\u4e00-\u9fa5]{1,16}(亮|灭|黑|满|完成|通过|就绪)(了)?(会提醒你|会告诉你|提醒我|告诉我)/.test(compact)
    || /(^|[，,。.!！?？；;])(?!看到|看见|发现|识别到|找到)[\u4e00-\u9fa5]{1,12}到[\u4e00-\u9fa5]{1,16}(提醒我|告诉我|和我说|说一声|说一下)?/.test(compact)
    || /(^|[，,。.!！?？；;])(等到|等|当|如果|一旦)?(开|关)[\u4e00-\u9fa5]{1,16}(提醒我|告诉我|和我说|说一声|说一下)?/.test(compact);
}

function looksLikeDescribedTargetPresenceInstruction(compactText) {
  const compact = String(compactText || '').replace(/\s+/g, '');
  if (!/(看到|看见|发现|识别到|找到).{1,40}(提醒我|告诉我|和我说|说一声|说一下|会提醒你|会告诉你)/.test(compact)) {
    return false;
  }
  if (hasActiveReminderChangeTriggerText(compact)) {
    return false;
  }
  if (/(亮了|暗了|灭了|熄了|开了|关了|快满|满了|铺满|覆盖|显示完成|完成|通过|就绪|准备好了|达到|到达|接近)(的时候|时候|时|后)/.test(compact)) {
    return false;
  }
  return /(看到|看见|发现|识别到|找到).{1,30}(着的|开的|关的|中的|里的|上的|下的|前的|后的|状态的|完成的|通过的|就绪的).{0,30}(提醒我|告诉我|和我说|说一声|说一下|会提醒你|会告诉你)/.test(compact)
    || /(看到|看见|发现|识别到|找到).{1,30}(提醒我|告诉我|和我说|说一声|说一下|会提醒你|会告诉你)/.test(compact)
      && !/(变成|变为|变化|改变|换位置|换地方|移动到|移动了|挪到|亮了|暗了|灭了|熄了|开了|关了|开始|停止|快满|满了|铺满|覆盖|显示完成|完成|通过|就绪|准备好了|达到|到达|接近|不见|消失)/.test(compact);
}

function updateGeminiReminderTaskFromInstruction(instruction, meta = {}) {
  const reminder = appState.geminiReminder;
  if (!reminder) {
    return false;
  }
  const parsedTask = buildActiveReminderTaskFromInstruction(instruction);
  const previousTask = reminder.taskOverride || '';
  reminder.taskOverride = parsedTask.task;
  if (previousTask !== parsedTask.task) {
    reminder.activeTaskSeq = (reminder.activeTaskSeq || 0) + 1;
    reminder.lastAlertedTaskKey = '';
    reminder.alertedResultKeys = [];
    reminder.stateMemory = null;
    reminder.missCount = 0;
  }
  setActiveReminderStatus('Gemini 主动提醒任务已更新：按你刚才说的话判断。');
  logClientEvent('gemini_reminder.task_updated', {
    label: reminder.reminderLabel || 'Gemini 主动提醒',
    promptMode: reminder.promptMode || 'baseline',
    source: meta.source || 'unknown',
    task: parsedTask.task,
    instruction,
    target: parsedTask.target,
    activeTaskSeq: reminder.activeTaskSeq || 0,
    inputTranscript: meta.inputTranscript || '',
    outputTranscript: meta.outputTranscript || ''
  });
  return true;
}

function updateSpeedReminderTaskFromConfirmation(inputTranscript, outputTranscript) {
  const reminder = appState.activeReminder;
  if (!reminder || !isSpeedLogicMode(reminder.mode)) {
    return false;
  }
  startSpeedReminderTaskNormalizeFromConfirmation(inputTranscript, outputTranscript);
  return true;
}

function clearActiveReminderTaskForNewInstruction(reminder, reason = '') {
  if (!reminder) {
    return;
  }
  reminder.activeTaskSeq = (reminder.activeTaskSeq || 0) + 1;
  reminder.taskOverride = '';
  reminder.pendingMessage = '';
  reminder.pendingTask = '';
  reminder.pendingSpeechText = '';
  reminder.awaitingResponse = false;
  reminder.rtcPollInProgress = false;
  reminder.rtcPollText = '';
  reminder.speedAlertedTaskKey = '';
  reminder.speedPendingAlertTaskKey = '';
  reminder.speedPendingAlertState = '';
  reminder.speedPendingAlertSnapshot = null;
  reminder.speedResponseCanceled = false;
  reminder.pendingAlertHadAudio = false;
  reminder.pendingAlertHadText = false;
  reminder.speedMissCount = 0;
  reminder.rtcAlertedTaskKey = '';
  reminder.rtcPendingAlertTaskKey = '';
  reminder.rtcResponseCanceled = false;
  reminder.rtcMissCount = 0;
  reminder.alertedResultKeys = [];
  reminder.stateMemory = null;
  reminder.lastAlertAt = 0;
  if (reason) {
    logClientEvent('active_reminder.task_cleared_for_new_instruction', {
      reason,
      activeTaskSeq: reminder.activeTaskSeq || 0
    });
  }
}

function completeActiveReminderTask(reminder, task, reason = '') {
  if (!reminder || getActiveReminderTask() !== task) {
    return false;
  }
  reminder.activeTaskSeq = (reminder.activeTaskSeq || 0) + 1;
  reminder.taskOverride = '';
  reminder.speedAlertedTaskKey = '';
  reminder.speedPendingAlertTaskKey = '';
  reminder.speedPendingAlertState = '';
  reminder.speedPendingAlertSnapshot = null;
  reminder.alertedResultKeys = [];
  reminder.stateMemory = null;
  reminder.speedMissCount = 0;
  setActiveReminderStatus(`${aliReminderLabel(reminder.mode)}任务已完成，等待新任务。`);
  logClientEvent('active_reminder.task_completed', {
    reason,
    mode: reminder.mode || '',
    task,
    activeTaskSeq: reminder.activeTaskSeq || 0
  });
  if (returnAliUnifiedToDistributor('active_reminder_audio_delivered')) {
    setActiveReminderStatus('主动提醒已完成，视觉助手底座继续运行。');
  }
  return true;
}

async function startSpeedReminderTaskNormalizeFromConfirmation(inputTranscript, outputTranscript, options = {}) {
  const reminder = appState.activeReminder;
  if (!reminder || !isSpeedLogicMode(reminder.mode)) {
    return false;
  }
  const seq = (reminder.taskNormalizeSeq || 0) + 1;
  reminder.taskNormalizeSeq = seq;
  reminder.taskNormalizeInFlight = true;
  logClientEvent('active_reminder.speed_task_normalize_requested', {
    seq,
    mode: reminder.mode || '',
    activeTaskSeq: reminder.activeTaskSeq || 0,
    inputTranscript,
    outputTranscript
  });
  try {
    const result = await apiPost('/api/active-reminder-task-normalize', {
      inputTranscript,
      outputTranscript,
      ...(options.confirmOnAccepted && isAliCheapDirectFunctionContractExperiment()
        ? { aliLiveContractRecovery: true } : {})
    });
    const recoveryStale = options.confirmOnAccepted && (
      reminder.activeTaskSeq !== options.expectedTaskSeq
      || appState.realtime?.aliCheapContractCandidateSeq !== options.expectedCandidateSeq
      || !isAliCheapDirectFunctionContractExperiment()
    );
    if (appState.activeReminder !== reminder || reminder.taskNormalizeSeq !== seq || recoveryStale) {
      if (!recoveryStale && appState.activeReminder === reminder && reminder.taskNormalizeSeq === seq) {
        reminder.taskNormalizeInFlight = false;
      }
      logClientEvent('active_reminder.speed_task_normalize_ignored', {
        reason: 'stale_result',
        seq,
        mode: reminder.mode || '',
        currentTaskSeq: reminder.activeTaskSeq || 0
      });
      return false;
    }
    reminder.taskNormalizeInFlight = false;
    if (result.action === 'none') {
      setActiveReminderStatus(reminder.taskOverride
        ? `${aliReminderLabel(reminder.mode)}继续执行当前任务。`
        : `${aliReminderLabel(reminder.mode)}等待新的提醒任务。`);
      logClientEvent('active_reminder.contract_model_no_task', {
        seq,
        mode: reminder.mode || '',
        inputTranscript,
        outputTranscript,
        provider: result.provider || '',
        model: result.model || '',
        latencyMs: result.latencyMs ?? '',
        attempts: result.attempts ?? ''
      });
      return false;
    }
    if (!isExecutableNormalizedActiveReminderContract(result)) {
      logClientEvent('active_reminder.speed_task_normalize_rejected', {
        seq,
        mode: reminder.mode || '',
        reason: 'invalid_structured_contract',
        action: result.action || '',
        contractType: result.contractType || '',
        category: result.category || '',
        contractMode: result.mode || '',
        lifecycle: result.lifecycle || '',
        target: result.target || '',
        condition: result.condition || '',
        taskText: result.taskText || ''
      });
      return false;
    }
    clearActiveReminderTaskForNewInstruction(reminder, 'contract_model_replaced_task');
    reminder.taskOverride = result.taskText;
    const currentTaskSeq = reminder.activeTaskSeq || 0;
    setActiveReminderStatus(`${aliReminderLabel(reminder.mode)}任务已建立：${result.condition || result.target}。`);
    logClientEvent('active_reminder.speed_task_normalized', {
      seq,
      mode: reminder.mode || '',
      action: result.action || '',
      contractType: result.contractType || '',
      category: result.category || '',
      target: result.target || '',
      condition: result.condition || '',
      confidence: result.confidence ?? '',
      task: result.taskText,
      activeTaskSeq: currentTaskSeq,
      latencyMs: result.latencyMs ?? '',
      rawText: result.rawText || '',
      attempts: result.attempts ?? ''
    });
    if (options.confirmOnAccepted) maybeConfirmSpeedActiveReminderTask(reminder, result.taskText);
    return true;
  } catch (error) {
    if (appState.activeReminder === reminder && reminder.taskNormalizeSeq === seq
        && (!options.confirmOnAccepted || (reminder.activeTaskSeq === options.expectedTaskSeq
          && appState.realtime?.aliCheapContractCandidateSeq === options.expectedCandidateSeq))) {
      reminder.taskNormalizeInFlight = false;
    }
    logClientEvent('active_reminder.speed_task_normalize_failed', {
      seq,
      mode: reminder.mode || '',
      inputTranscript,
      outputTranscript,
      error: error.message
    });
    return false;
  }
}

function shouldSpeedReminderDelegateTaskToModel(transcript) {
  const compact = String(transcript || '').replace(/\s+/g, '');
  return Boolean(compact) && !isLikelyReminderEchoTranscript(compact);
}

function clearSpeedTaskSetupWatchdog(reminder) {
  if (!reminder?.taskSetupWatchdogTimer) {
    return;
  }
  clearTimeout(reminder.taskSetupWatchdogTimer);
  reminder.taskSetupWatchdogTimer = null;
}

function abandonSpeedTaskSetup(reminder, reason) {
  if (!reminder?.pendingTaskSetupTranscript) {
    return;
  }
  const transcript = reminder.pendingTaskSetupTranscript;
  clearSpeedTaskSetupWatchdog(reminder);
  reminder.pendingTaskSetupTranscript = '';
  reminder.pendingTaskSetupAt = 0;
  reminder.taskNormalizeInFlight = false;
  logClientEvent('active_reminder.speed_task_interpret_abandoned', {
    mode: reminder.mode || '',
    reason,
    transcript
  });
}

function armSpeedTaskSetupWatchdog(reminder) {
  clearSpeedTaskSetupWatchdog(reminder);
  reminder.taskSetupWatchdogTimer = setTimeout(() => {
    if (appState.activeReminder !== reminder || !reminder.pendingTaskSetupTranscript) {
      return;
    }
    logClientEvent('active_reminder.speed_task_interpret_timeout', {
      mode: reminder.mode || '',
      transcript: reminder.pendingTaskSetupTranscript,
      elapsedMs: Date.now() - (reminder.pendingTaskSetupAt || Date.now())
    });
    abandonSpeedTaskSetup(reminder, 'contract_confirmation_timeout');
  }, 20000);
}

function maybeDelegateSpeedReminderTaskToModel(transcript) {
  const reminder = appState.activeReminder;
  const realtime = appState.realtime;
  if (!reminder || !isSpeedLogicMode(reminder.mode)) {
    return false;
  }
  if (!shouldSpeedReminderDelegateTaskToModel(transcript)) {
    return false;
  }
  const busyWithPreviousResponse = (
    reminder.pendingMessage
    || reminder.awaitingResponse
    || isAssistantPlaybackActive(realtime)
    || realtime?.responseInProgress
    || isRealtimeResponseSettling(realtime)
  );
  if (busyWithPreviousResponse) {
    logClientEvent('active_reminder.speed_task_interpret_preempting', {
      mode: reminder.mode || '',
      transcript,
      pendingMessage: reminder.pendingMessage || '',
      awaitingResponse: Boolean(reminder.awaitingResponse),
      assistantPlaybackActive: isAssistantPlaybackActive(realtime),
      responseInProgress: Boolean(realtime?.responseInProgress),
      settleRemainingMs: getRealtimeResponseSettleRemainingMs(realtime)
    });
    cancelSpeedTaskSetupResponse('new task preempts previous active reminder task');
  }
  reminder.pendingTaskSetupTranscript = String(transcript || '').trim();
  reminder.pendingTaskSetupAt = Date.now();
  reminder.taskNormalizeInFlight = true;
  armSpeedTaskSetupWatchdog(reminder);
  logClientEvent('active_reminder.speed_task_interpret_requested', {
    mode: reminder.mode || '',
    transcript: reminder.pendingTaskSetupTranscript
  });
  const responseRequested = requestRealtimeManualResponse('speed_task_setup');
  if (!responseRequested) {
    abandonSpeedTaskSetup(reminder, 'realtime_response_unavailable');
  }
  return true;
}

function splitChineseSpeechClauses(text) {
  return String(text || '').match(/[^。！？!?]+[。！？!?]?/g) || [];
}

function isSpeedReminderTaskishClause(clause) {
  const compact = String(clause || '').replace(/\s+/g, '');
  return /(提醒我|提示我|告诉我|通知我|叫我|和我说|跟我说|对我说|说一声|说一下|说下|我讲|跟我讲|找不到|找一下|帮我找)/.test(compact);
}

function isSpeedReminderAssistantEchoClause(clause) {
  const compact = String(clause || '').replace(/\s+/g, '');
  if (!compact) {
    return false;
  }
  if (isSpeedReminderTaskishClause(compact)) {
    return false;
  }
  if (isLikelyReminderEchoTranscript(compact)) {
    return true;
  }
  return /^(好的?|嗯|啊)?(看到|看到了|看见|看见了|我看到|我看到了)/.test(compact)
    && /(吗|就在|画面|左边|右边|上方|下方|中间|目标)/.test(compact);
}

function cleanSpeedReminderTranscriptForTask(transcript) {
  const raw = String(transcript || '').trim();
  if (!raw) {
    return '';
  }
  const clauses = splitChineseSpeechClauses(raw);
  if (clauses.length <= 1) {
    return raw;
  }
  const hasTaskishClause = clauses.some(isSpeedReminderTaskishClause);
  if (!hasTaskishClause) {
    return raw;
  }
  const kept = clauses.filter((clause) => !isSpeedReminderAssistantEchoClause(clause));
  const cleaned = kept.join('').trim();
  return cleaned || raw;
}

function getGeminiActiveReminderTask() {
  const reminder = appState.geminiReminder;
  if (reminder?.taskOverride) {
    return reminder.taskOverride;
  }
  return '';
}

function beginGeminiFindSpeechTurn(reminder, event) {
  if (
    event?.type !== 'say'
    || !event.text
  ) {
    return;
  }
  const specialTaskSpeech = Boolean(
    isGeminiReminderExecutionMode(reminder, 'find_object')
    || isGeminiReminderExecutionMode(reminder, 'continuous_narration')
  );
  if (specialTaskSpeech) {
    reminder.turnInProgress = true;
    setGeminiAssistantResponseActive(reminder, true);
  }
  if (reminder.strictMuteDuringResponse) {
    setGeminiPrePlaybackMicGuard(
      reminder,
      true,
      specialTaskSpeech ? 'special_task_say' : 'active_reminder_say'
    );
  }
}

function sendGeminiLiveEvent(event) {
  const reminder = appState.geminiReminder;
  if (
    appState.appVariant === 'aliyun'
    && reminder?.transport === 'aliyun-realtime'
    && event?.type === 'video'
  ) return true;
  if (
    appState.appVariant === 'aliyun'
    && !isAliRealtimeVideoExperiment()
    && reminder?.transport === 'aliyun-realtime'
    && event?.type === 'ask'
    && event.imageData?.data
  ) {
    const taskSeq = reminder?.findTaskSeq || 0;
    const mode = getGeminiReminderExecutionMode(reminder);
    requestAliCheapVision37Answer(event.imageData, 'ordinary_question', event.text)
      .then(result => {
        if (appState.geminiReminder !== reminder || reminder.stopping
            || (reminder.findTaskSeq || 0) !== taskSeq || getGeminiReminderExecutionMode(reminder) !== mode) return;
        sendGeminiLiveEvent({ type: 'say', text: result.spokenText, deliveryMode: event.deliveryMode || 'guidance' });
      }).catch(error => {
        if (appState.geminiReminder === reminder && !reminder.stopping) {
          reminder.turnInProgress = false;
          reminder.unifiedOneShotQuestionInFlight = false;
          setActiveReminderStatus(`3.7 看图暂时失败：${error.message}`);
        }
      });
    return true;
  }
  if (reminder?.transport === 'aliyun-realtime') {
    if (event.type === 'say' && event.text) {
      return sendAliUnifiedSpeech(event.text, 'say');
    }
    if (event.type === 'ask' && event.text) {
      if (event.imageData?.data) {
        sendRealtimeEvent({
          type: 'input_image_buffer.append',
          image: event.imageData.data
        });
      }
      return sendAliUnifiedSpeech(event.text, 'narrate');
    }
    return false;
  }
  if (reminder?.transport === 'browser-direct') {
    if (!reminder.session) {
      return false;
    }
    try {
      if (event.type === 'audio' && event.data) {
        reminder.session.sendRealtimeInput({
          audio: { data: event.data, mimeType: event.mimeType || 'audio/pcm;rate=16000' }
        });
        return true;
      }
      if (event.type === 'video' && event.data) {
        reminder.session.sendRealtimeInput({
          video: { data: event.data, mimeType: event.mimeType || 'image/jpeg' }
        });
        return true;
      }
      if (event.type === 'say' && event.text) {
        beginGeminiFindSpeechTurn(reminder, event);
        const text = String(event.text || '').replace(/\s+/g, ' ').trim().slice(0, 160);
        const taskText = String(event.task || '').replace(/\s+/g, ' ').trim().slice(0, 180);
        const payload = `[SAY]${text}`;
        reminder.session.sendClientContent({
          turns: [{ role: 'user', parts: [{ text: payload }] }],
          turnComplete: true
        });
        reminder.turnInProgress = true;
        logClientEvent('gemini_live.say_sent', {
          label: reminder.reminderLabel || 'Gemini 主动提醒',
          promptMode: reminder.promptMode || 'baseline',
          deliveryMode: event.deliveryMode || reminder.deliveryMode || 'broadcast',
          prefix: '[SAY]',
          text,
          task: taskText
        });
        return true;
      }
      if (event.type === 'ask' && event.text) {
        const text = String(event.text || '').replace(/\s+/g, ' ').trim().slice(0, 500);
        const parts = [];
        if (event.imageData?.data && event.imageData?.mimeType) {
          parts.push({
            inlineData: {
              data: event.imageData.data,
              mimeType: event.imageData.mimeType
            }
          });
        }
        parts.push({ text });
        reminder.session.sendClientContent({
          turns: [{ role: 'user', parts }],
          turnComplete: true
        });
        logClientEvent('gemini_live.ask_sent', {
          label: reminder.reminderLabel || 'Gemini 主动提醒',
          promptMode: reminder.promptMode || 'baseline',
          text
        });
        return true;
      }
    } catch (error) {
      appendVisionLog(`Gemini 发送失败：${error.message}`);
      recordRealtimeDebug('gemini_live.browser_direct_send_failed', error.message);
      return false;
    }
  }
  if (!reminder?.socket || reminder.socket.readyState !== WebSocket.OPEN) {
    return false;
  }
  beginGeminiFindSpeechTurn(reminder, event);
  reminder.socket.send(JSON.stringify(event));
  return true;
}

function parseImageDataUrlForClient(value) {
  const match = String(value || '').match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/);
  if (!match) {
    return null;
  }
  return {
    mimeType: match[1],
    data: match[2]
  };
}

function markGeminiPlaybackScheduled(scheduledEndAt, reason) {
  const reminder = appState.geminiReminder;
  if (!reminder || !scheduledEndAt) {
    return;
  }
  reminder.playbackActive = true;
  reminder.playbackUntil = Math.max(
    reminder.playbackUntil || 0,
    scheduledEndAt + GEMINI_ASSISTANT_PLAYBACK_TAIL_MS
  );
  recordRealtimeDebug('gemini.playback_scheduled', {
    reason,
    remainingMs: Math.max(0, reminder.playbackUntil - Date.now())
  });
}

function markGeminiPlaybackEnded(reason) {
  const reminder = appState.geminiReminder;
  if (!reminder) {
    return;
  }
  reminder.playbackUntil = Math.min(reminder.playbackUntil || 0, Date.now());
  window.setTimeout(() => {
    if (appState.geminiReminder === reminder && Date.now() >= (reminder.playbackUntil || 0)) {
      reminder.playbackActive = false;
    }
  }, GEMINI_ASSISTANT_PLAYBACK_TAIL_MS);
  recordRealtimeDebug('gemini.playback_idle', reason);
}

function isGeminiPlaybackActive(reminder = appState.geminiReminder) {
  if (!reminder) {
    return false;
  }
  if (reminder.transport === 'aliyun-realtime') {
    return isAssistantPlaybackActive(appState.realtime);
  }
  return Boolean(reminder.playbackActive || (reminder.playbackUntil && Date.now() < reminder.playbackUntil));
}

function startDebugAudioCapture() {
  const reminder = appState.activeReminder;
  if (!reminder || reminder.audioRecorder || !window.MediaRecorder || !appState.stream) {
    if (!window.MediaRecorder) {
      logClientEvent('debug_audio.unsupported', {});
    }
    return;
  }
  const audioTracks = appState.stream.getAudioTracks();
  if (!audioTracks.length) {
    logClientEvent('debug_audio.no_audio_track', {});
    return;
  }
  try {
    const audioStream = new MediaStream(audioTracks);
    const mimeType = chooseDebugAudioMimeType();
    const recorder = mimeType
      ? new MediaRecorder(audioStream, { mimeType })
      : new MediaRecorder(audioStream);
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        uploadDebugAudioChunk(event.data);
      }
    };
    recorder.onerror = (event) => {
      logClientEvent('debug_audio.error', {
        message: event.error?.message || 'unknown'
      });
    };
    recorder.start(ACTIVE_REMINDER_AUDIO_SLICE_MS);
    reminder.audioRecorder = recorder;
    logClientEvent('debug_audio.started', {
      mimeType: recorder.mimeType || ''
    });
  } catch (error) {
    logClientEvent('debug_audio.start_failed', {
      message: error.message
    });
  }
}

function stopDebugAudioCapture() {
  const recorder = appState.activeReminder?.audioRecorder;
  if (!recorder) {
    return;
  }
  appState.activeReminder.audioRecorder = null;
  try {
    if (recorder.state !== 'inactive') {
      recorder.stop();
    }
  } catch (error) {
    logClientEvent('debug_audio.stop_failed', {
      message: error.message
    });
  }
}

function chooseDebugAudioMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus'
  ];
  return candidates.find((item) => MediaRecorder.isTypeSupported?.(item)) || '';
}

function uploadDebugAudioChunk(blob) {
  fetch('/api/debug-audio', {
    method: 'POST',
    headers: {
      'Content-Type': blob.type || 'application/octet-stream',
      'X-Debug-Label': 'microphone'
    },
    body: blob
  }).catch((error) => {
    logClientEvent('debug_audio.upload_failed', {
      message: error.message
    });
  });
}

async function runActiveReminderTick() {
  const reminder = appState.activeReminder;
  if (!reminder || reminder.inFlight || !appState.realtime?.isReady || !appState.stream) {
    return;
  }
  if (reminder.taskNormalizeInFlight) {
    return;
  }
  if (isManualTranscriptPending(appState.realtime)) {
    if (reminder.frameCount === 1 || reminder.frameCount % 5 === 0) {
      setActiveReminderStatus('主动提醒暂停一瞬：正在等待你刚才那句话的转写。');
    }
    return;
  }
  if (elements.camera.readyState < 2) {
    return;
  }
  const task = getActiveReminderTask();
  if (!task) {
    return;
  }

  reminder.inFlight = true;
  reminder.frameCount += 1;
  if (reminder.mode === 'rtc') {
    try {
      runRtcActiveReminderTick();
    } finally {
      reminder.inFlight = false;
    }
    return;
  }
  if (isSpeedLogicMode(reminder.mode) && reminder.suspendUntil && Date.now() < reminder.suspendUntil) {
    if (reminder.frameCount === 1 || reminder.frameCount % 5 === 0) {
      setActiveReminderStatus('极速主动提醒短暂停顿中，避免连续重复播报。');
    }
    reminder.inFlight = false;
    return;
  }

  const taskSeq = reminder.activeTaskSeq || 0;
  try {
    const imageDataUrl = captureReminderFrame(isSpeedLogicMode(reminder.mode)
      ? ACTIVE_REMINDER_FAST_FRAME_OPTIONS
      : {});
    const result = await apiPost('/api/active-reminder-check', {
      imageDataUrl,
      task,
      frameCount: reminder.frameCount,
      promptMode: canAliReminderUseRealtimeVisualExpression(reminder.mode) ? 'deep_multitask' : 'baseline'
    });
    if (appState.activeReminder !== reminder || (reminder.activeTaskSeq || 0) !== taskSeq || getActiveReminderTask() !== task) {
      logClientEvent('active_reminder.check_ignored', {
        reason: 'stale_task_result',
        mode: reminder.mode || '',
        frameCount: reminder.frameCount,
        task,
        taskSeq,
        currentTaskSeq: reminder.activeTaskSeq || 0,
        currentTask: getActiveReminderTask()
      });
      return;
    }
    const guardedResult = applyReliableActiveReminderEvidenceGuard(reminder, result, task);
    const memoryResult = applyActiveReminderStateMemory(reminder, guardedResult, task, {
      source: 'ali',
      label: aliReminderLabel(reminder.mode),
      frameCount: reminder.frameCount,
      promptMode: result.promptMode || ''
    });
    memoryResult.task = task;
    recordRealtimeDebug('active_reminder.result', {
      frameCount: reminder.frameCount,
      shouldAlert: memoryResult.shouldAlert,
      latencyMs: memoryResult.latencyMs,
      rawText: memoryResult.rawText,
      state: memoryResult.state || '',
      currentState: memoryResult.currentState || '',
      observation: memoryResult.observation || '',
      resultReached: Boolean(memoryResult.resultReached),
      resultText: memoryResult.resultText || '',
      instanceKey: memoryResult.instanceKey || '',
      promptMode: memoryResult.promptMode || '',
      confidence: memoryResult.confidence ?? '',
      evidenceGuard: memoryResult._evidenceGuard || null,
      stateMemory: memoryResult._stateMemory || null
    });
    if (memoryResult.shouldAlert) {
      if (isSpeedLogicMode(reminder.mode)) {
        reminder.speedMissCount = 0;
      }
      handleActiveReminderAlert(memoryResult);
    } else if (memoryResult.provider === 'idle' && (reminder.frameCount === 1 || reminder.frameCount % 10 === 0)) {
      if (isSpeedLogicMode(reminder.mode)) {
        updateSpeedReminderMissState(reminder, task, memoryResult);
      }
      setActiveReminderStatus(`主动提醒运行中：等待你说“看到什么提醒我”。已记录 ${reminder.frameCount} 帧。`);
    } else if (isSpeedLogicMode(reminder.mode) && (reminder.frameCount === 1 || reminder.frameCount % 10 === 0)) {
      updateSpeedReminderMissState(reminder, task, memoryResult);
      setActiveReminderStatus(`${aliReminderLabel(reminder.mode)}运行中：已快筛 ${reminder.frameCount} 帧，最近延迟 ${memoryResult.latencyMs ?? '未知'} 毫秒。`);
    } else if (reminder.frameCount === 1 || reminder.frameCount % 10 === 0) {
      setActiveReminderStatus(`主动提醒运行中：已快筛 ${reminder.frameCount} 帧，最近延迟 ${memoryResult.latencyMs ?? '未知'} 毫秒。`);
    } else if (isSpeedLogicMode(reminder.mode)) {
      updateSpeedReminderMissState(reminder, task, memoryResult);
    }
  } catch (error) {
    reminder.errorCount += 1;
    recordRealtimeDebug('active_reminder.failed', error.message);
    if (reminder.errorCount === 1 || reminder.errorCount % 5 === 0) {
      setActiveReminderStatus(`主动提醒快筛失败：${error.message}`);
    }
  } finally {
    if (appState.activeReminder === reminder) {
      reminder.inFlight = false;
    }
  }
}

function updateSpeedReminderMissState(reminder, task, result) {
  if (!reminder || !isSpeedLogicMode(reminder.mode) || !task) {
    return;
  }
  reminder.speedMissCount += 1;
  if (reminder.speedAlertedTaskKey && reminder.speedMissCount >= 3) {
    logClientEvent('active_reminder.speed_scene_reset', {
      frameCount: reminder.frameCount,
      task,
      latencyMs: result.latencyMs ?? null,
      missCount: reminder.speedMissCount
    });
    reminder.speedAlertedTaskKey = '';
    reminder.speedPendingAlertTaskKey = '';
    reminder.alertedResultKeys = [];
    reminder.speedMissCount = 0;
  }
}

function updateRtcReminderMissState(reminder, task) {
  if (!reminder || reminder.mode !== 'rtc' || !task) {
    return;
  }
  reminder.rtcMissCount += 1;
  if (reminder.rtcAlertedTaskKey && reminder.rtcMissCount >= 3) {
    logClientEvent('rtc_active_reminder.scene_reset', {
      frameCount: reminder.frameCount,
      task,
      missCount: reminder.rtcMissCount
    });
    reminder.rtcAlertedTaskKey = '';
    reminder.rtcPendingAlertTaskKey = '';
    reminder.rtcMissCount = 0;
  }
}

function runRtcActiveReminderTick() {
  const reminder = appState.activeReminder;
  const realtime = appState.realtime;
  const task = getActiveReminderTask();
  if (!reminder || reminder.mode !== 'rtc') {
    return;
  }
  if (reminder.suspendUntil && Date.now() < reminder.suspendUntil) {
    if (reminder.frameCount === 1 || reminder.frameCount % 5 === 0) {
      setActiveReminderStatus('Manual 实验主动提醒已暂停，等待当前说话或播报结束。');
    }
    return;
  }
  if (!task) {
    if (reminder.frameCount === 1 || reminder.frameCount % 5 === 0) {
      setActiveReminderStatus(`Manual 实验主动提醒运行中：等待你说“看到什么提醒我”。已轮询 ${reminder.frameCount} 次。`);
      logClientEvent('rtc_active_reminder.idle', {
        frameCount: reminder.frameCount
      });
    }
    return;
  }
  if (!realtime?.isReady) {
    setActiveReminderStatus('Manual 实验主动提醒等待汇演接通。');
    return;
  }
  if (isManualTranscriptPending(realtime)) {
    logClientEvent('rtc_active_reminder.waiting_manual_transcript', {
      frameCount: reminder.frameCount
    });
    return;
  }
  const now = Date.now();
  if (realtime.lastRtcPollAt && now - realtime.lastRtcPollAt < RTC_ACTIVE_REMINDER_POLL_MIN_GAP_MS) {
    logClientEvent('rtc_active_reminder.waiting_poll_gap', {
      frameCount: reminder.frameCount,
      elapsedMs: now - realtime.lastRtcPollAt
    });
    return;
  }
  if (realtime.responseInProgress || isAssistantPlaybackActive(realtime) || isRealtimeResponseSettling(realtime)) {
    logClientEvent('rtc_active_reminder.waiting', {
      frameCount: reminder.frameCount,
      responseInProgress: Boolean(realtime.responseInProgress),
      assistantPlaybackActive: isAssistantPlaybackActive(realtime),
      responseSettling: isRealtimeResponseSettling(realtime),
      settleRemainingMs: getRealtimeResponseSettleRemainingMs(realtime)
    });
    return;
  }

  reminder.awaitingResponse = true;
  reminder.pendingMessage = '';
  reminder.pendingTask = task;
  reminder.rtcPollInProgress = true;
  reminder.rtcPollText = '';
  appState.latestAssistantText = '';

  if (realtime.mode === 'websocket') {
    sendVideoFrame();
    flushPendingAudio();
    if (!appState.sentFirstAudio) {
      reminder.awaitingResponse = false;
      reminder.rtcPollInProgress = false;
      setActiveReminderStatus('Manual 实验主动提醒等待麦克风缓冲区可提交。');
      logClientEvent('rtc_active_reminder.manual_waiting_audio', {
        mode: realtime.mode,
        frameCount: reminder.frameCount,
        task
      });
      return;
    }
  }

  updateRealtimeSession({
    reason: realtime.mode === 'websocket' ? 'manual active reminder poll' : 'rtc active reminder poll',
    force: true,
    modalities: ['text']
  });

  if (realtime.mode === 'websocket') {
    sendRealtimeEvent({ type: 'input_audio_buffer.commit' });
    appState.sentFirstAudio = false;
  }

  realtime.responseInProgress = true;
  realtime.lastRtcPollAt = Date.now();
  sendRealtimeEvent({ type: 'response.create' });
  setActiveReminderStatus(`Manual 实验主动提醒已轮询 ${reminder.frameCount} 次。`);
  logClientEvent('rtc_active_reminder.response_create', {
    mode: realtime.mode,
    frameCount: reminder.frameCount,
    task
  });
}

function handleActiveReminderAlert(result) {
  const reminder = appState.activeReminder;
  if (!reminder) {
    return;
  }
  const task = getActiveReminderTask();
  if (result.task && result.task !== task) {
    logClientEvent('active_reminder.alert_ignored', {
      reason: 'stale_result_task_mismatch',
      resultTask: result.task,
      currentTask: task,
      frameCount: reminder.frameCount
    });
    return;
  }
  const speedLogicMode = isSpeedLogicMode(reminder.mode);
  if (speedLogicMode) {
    const messageSource = canAliReminderUseRealtimeVisualExpression(reminder.mode)
      ? (result.observation || result.rawText)
      : result.rawText;
    const message = normalizeActiveReminderSpeechText(messageSource) || buildActiveReminderAlertMessage(task);
    const resultKey = buildGeminiReminderResultKey(message, task, result.instanceKey || '');
    const taskConfirmationPending = reminder.pendingMessage === 'speed_task_confirm';
    if ((reminder.pendingMessage || reminder.awaitingResponse) && !taskConfirmationPending) {
      setActiveReminderStatus(`${aliReminderLabel(reminder.mode)}已命中，等待当前 RTC 播报结束。`);
      rollbackActiveReminderStateDelivery(reminder, result.currentState || '', result._deliverySnapshot);
      return;
    }
    if (taskConfirmationPending) {
      cancelSpeedTaskSetupResponse('speed trigger preempts task confirmation');
      reminder.pendingMessage = '';
      reminder.pendingTask = '';
      reminder.awaitingResponse = false;
    }
    if (
      shouldDedupeActiveReminderOccurrences(task)
      && resultKey
      && reminder.alertedResultKeys?.includes(resultKey)
    ) {
      setActiveReminderStatus(`${aliReminderLabel(reminder.mode)}已命中但保持静默：当前结果已提醒过。`);
      logClientEvent('active_reminder.speed_duplicate_suppressed', {
        mode: reminder.mode,
        frameCount: reminder.frameCount,
        task,
        latencyMs: result.latencyMs ?? null,
        message,
        resultKey
      });
      commitActiveReminderStateDelivery(reminder, result.currentState || '');
      return;
    }
    result._activeReminderMessage = message;
    result._activeReminderResultKey = resultKey;
  }
  if (reminder.mode === 'rtc') {
    if (reminder.pendingMessage || reminder.awaitingResponse || reminder.rtcPollInProgress) {
      setActiveReminderStatus('Manual 实验主动提醒已命中，等待当前 RTC 播报结束。');
      return;
    }
    if (reminder.rtcAlertedTaskKey === task) {
      setActiveReminderStatus('Manual 实验主动提醒已命中但保持静默：同一连续场景已提醒过。');
      logClientEvent('rtc_active_reminder.duplicate_suppressed', {
        frameCount: reminder.frameCount,
        task
      });
      return;
    }
  }
  const now = Date.now();
  const cooldownMs = speedLogicMode
    ? SPEED_ACTIVE_REMINDER_ALERT_COOLDOWN_MS
    : ACTIVE_REMINDER_ALERT_COOLDOWN_MS;
  if (now - reminder.lastAlertAt < cooldownMs) {
    setActiveReminderStatus(`主动提醒已触发但处于冷却中：最近延迟 ${result.latencyMs ?? '未知'} 毫秒。`);
    if (speedLogicMode) {
      rollbackActiveReminderStateDelivery(reminder, result.currentState || '', result._deliverySnapshot);
    }
    return;
  }
  reminder.lastAlertAt = now;
  reminder.alertCount += 1;
  const message = result._activeReminderMessage
    || normalizeActiveReminderSpeechText(result.rawText)
    || buildActiveReminderAlertMessage(task);
  const resultKey = result._activeReminderResultKey || '';
  reminder.pendingMessage = speedLogicMode ? 'speed_trigger' : message;
  reminder.pendingTask = task;
  reminder.pendingSpeechText = message;
  reminder.awaitingResponse = false;
  const statusMessage = speedLogicMode
    ? `${aliReminderLabel(reminder.mode)}触发 ${reminder.alertCount} 次：已交给 RTC 自然播报。`
    : `主动提醒触发 ${reminder.alertCount} 次：${message}`;
  setActiveReminderStatus(statusMessage);
  appendVisionLog(speedLogicMode ? `${aliReminderLabel(reminder.mode)}：快筛已命中，交给 RTC 播报。` : `主动提醒：${message}`);
  logClientEvent('active_reminder.alert_queued', {
    mode: appState.realtime?.mode || '',
    alertCount: reminder.alertCount,
    frameCount: reminder.frameCount,
    task: reminder.pendingTask
  });
  if (reminder.mode === 'rtc') {
    reminder.rtcPendingAlertTaskKey = task;
    reminder.rtcResponseCanceled = false;
    reminder.suspendUntil = Date.now() + RTC_ACTIVE_REMINDER_LOCAL_ALERT_PAUSE_MS;
  }
  if (speedLogicMode) {
    if (resultKey && !usesReliableReminderDelivery(reminder)) {
      reminder.alertedResultKeys = [...(reminder.alertedResultKeys || []), resultKey].slice(-20);
    }
    reminder.speedPendingAlertTaskKey = resultKey || task;
    reminder.speedPendingAlertState = result.currentState || '';
    reminder.speedPendingAlertSnapshot = result._deliverySnapshot || null;
    reminder.speedResponseCanceled = false;
    reminder.pendingAlertHadAudio = false;
    reminder.pendingAlertHadText = false;
    reminder.awaitingResponse = false;
    reminder.suspendUntil = Date.now() + SPEED_ACTIVE_REMINDER_LOCAL_ALERT_PAUSE_MS;
    logClientEvent('active_reminder.speed_to_rtc', {
      mode: appState.realtime?.mode || '',
      alertCount: reminder.alertCount,
      latencyMs: result.latencyMs ?? null,
      task,
      message,
      resultKey,
      rawText: result.rawText || '',
      state: result.state || '',
      observation: result.observation || '',
      resultReached: Boolean(result.resultReached),
      resultText: result.resultText || '',
      instanceKey: result.instanceKey || '',
      promptMode: result.promptMode || ''
    });
    maybeRequestActiveReminderResponse();
    return;
  }
  maybeRequestActiveReminderResponse();
}

function buildActiveReminderAlertMessage(taskText) {
  const contract = parseActiveReminderContract(taskText);
  if (contract.speakText && isPositiveActiveReminderResultText(contract.speakText, contract)) {
    return contract.speakText;
  }
  const target = extractActiveReminderTarget(taskText);
  if (target) {
    return `可能看到${target}了，请停下确认。`;
  }
  return '可能看到你要找的目标了，请停下确认。';
}

function normalizeActiveReminderSpeechText(value) {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^[“”"'‘’]+|[“”"'‘’]+$/g, '')
    .replace(/^(?:主动提醒|提醒)(?:结果|播报)?\s*[：:]\s*/i, '')
    .replace(/(?:主动提醒|提醒)(?:已)?完成[。.!！]?$/i, '')
    .trim();
  const compact = text.toUpperCase().replace(/[\s"'“”‘’。．.，,！!？?：:；;、]/g, '');
  if (!text || compact === 'N' || compact === 'NO' || compact === 'Y' || compact === 'YES') {
    return '';
  }
  return text.slice(0, 40);
}

function buildActiveReminderConfirmationMessage(taskText) {
  const contract = parseActiveReminderContract(taskText);
  if (contract.category === 'state_tracking') {
    const condition = contract.condition || contract.speakText || '这个结果';
    return `好的，${condition}会提醒你。`;
  }
  const target = extractActiveReminderTarget(taskText);
  if (target) {
    return `好的，看到${target}会提醒你。`;
  }
  return '好的，会按这个任务提醒你。';
}

function extractActiveReminderTarget(taskText) {
  const contractTarget = extractActiveReminderContractField(taskText, 'target');
  if (contractTarget) {
    return cleanActiveReminderTarget(contractTarget);
  }
  const task = String(taskText || '')
    .replace(/^用户口头主动提醒任务：/, '')
    .replace(/。只在当前画面明确满足这句话时输出 Y，否则输出 N。?$/, '')
    .trim();
  if (!task || task.includes('测试主动提醒')) {
    return '';
  }

  const patterns = [
    /(?:看到|看见|发现|识别到|找到)([^。！？!?，,；;]*?)(?:[，,。！？!?；;]\s*)?(?:的时候|时|后|就|请|帮我|给我|主动|立刻|马上|提醒|提示|告诉|叫我|通知|$)/,
    /(?:出现|有)([^。！？!?，,；;]*?)(?:[，,。！？!?；;]\s*)?(?:的时候|时|后|就|请|帮我|给我|主动|立刻|马上|提醒|提示|告诉|叫我|通知|$)/
  ];
  for (const pattern of patterns) {
    const match = task.match(pattern);
    const target = cleanActiveReminderTarget(match?.[1]);
    if (target) {
      return target;
    }
  }
  return cleanActiveReminderTarget(task);
}

function cleanActiveReminderTarget(value) {
  const target = String(value || '')
    .replace(/^(我的|我|你|帮我|给我|请|如果|下次|再|一旦|镜头里|画面里|视频里|看到|看见|发现|识别到|找到|出现|有)/g, '')
    .replace(/(的时候|时候|时|后|就|请|帮我|给我|主动|立刻|马上|提醒我|提示我|告诉我|通知我|叫我|和我说|跟我说|对我说|说一声|说一下|说下|我讲|跟我讲|告诉一下|报一下|提醒|提示|告诉|通知|叫我|通知)$/g, '')
    .replace(/会$/g, '')
    .replace(/[了啦呢啊哦呀吧嘛]+$/g, '')
    .replace(/[“”"'‘’]/g, '')
    .replace(/[，,。！？!?；;：:、]/g, '')
    .trim();
  if (!target || target.length > 18) {
    return '';
  }
  return target;
}

function normalizeRtcActiveReminderPollResult(text) {
  const raw = String(text || '').trim();
  const compact = raw
    .trim()
    .toUpperCase()
    .replace(/[\s"'“”‘’。．.，,！!？?：:；;、]/g, '');
  if (compact === 'Y' || compact === 'YES') {
    return 'Y';
  }
  const normalized = raw.replace(/\s+/g, '');
  const looksNegative = /(没|没有|未|不|不是|无法|不能|看不清|不确定|下次|会提醒|好的)/.test(normalized);
  const looksPositive = /(看到了|看见了|已经看到|发现了|出现了|识别到了|能看到|有目标|目标出现|我看到.+了|我看见.+了|看到.+了|看见.+了)/.test(normalized);
  if (looksPositive && !looksNegative) {
    return 'Y';
  }
  return 'N';
}

function finalizeRtcActiveReminderPoll() {
  const reminder = appState.activeReminder;
  if (!reminder || reminder.mode !== 'rtc') {
    return;
  }
  const rawText = reminder.rtcPollText || appState.latestAssistantText || '';
  const result = normalizeRtcActiveReminderPollResult(rawText);
  const task = reminder.pendingTask || getActiveReminderTask();

  reminder.awaitingResponse = false;
  reminder.rtcPollInProgress = false;
  reminder.rtcPollText = '';
  reminder.pendingMessage = '';
  reminder.pendingTask = '';
  appState.latestAssistantText = '';

  updateRealtimeSession({
    reason: 'rtc active reminder poll done',
    force: true,
    modalities: ['text', 'audio']
  });

  logClientEvent('rtc_active_reminder.poll_done', {
    mode: appState.realtime?.mode || '',
    frameCount: reminder.frameCount,
    task,
    raw: rawText,
    result
  });

  if (result === 'Y') {
    handleActiveReminderAlert({ latencyMs: null, provider: 'rtc' });
    return;
  }

  updateRtcReminderMissState(reminder, task);
  setActiveReminderStatus(`Manual 实验主动提醒已轮询 ${reminder.frameCount} 次，未触发。`);
}

function getActiveReminderTask() {
  const reminder = appState.activeReminder;
  if (reminder?.taskOverride) {
    return reminder.taskOverride;
  }
  if (isSpeedLogicMode(reminder?.mode)) {
    return '';
  }
  const selectedTask = elements.visionQuestion.value || '';
  if (selectedTask.includes('测试主动提醒')) {
    return selectedTask;
  }
  if (appState.navigationFollow?.route) {
    return selectedTask;
  }
  return '';
}

function extractActiveReminderInstruction(transcript) {
  const raw = String(transcript || '').trim();
  if (!raw) {
    return '';
  }
  const compact = raw.replace(/\s+/g, '');
  if (isLikelyReminderEchoTranscript(compact)) {
    logClientEvent('active_reminder.task_echo_ignored', { transcript: raw });
    return '';
  }
  if (/(为什么|怎么|为何).{0,20}(没|没有|未).{0,8}提醒|(?:刚才|之前|前面).{0,20}(没|没有|未).{0,8}提醒|(?:没|没有|未)提醒我/.test(compact)) {
    return '';
  }
  if (hasExplicitActiveReminderContractModeText(compact)) {
    return normalizeActiveReminderInstructionText(raw);
  }
  if (!hasActiveReminderNotifyActionText(compact)) {
    return '';
  }
  if (!hasActiveReminderTaskTriggerText(compact)) {
    return '';
  }

  const clean = raw
    .replace(/^(好的|好|嗯|啊|呃|那个|请问|麻烦你|你先|接下来|接下去)[，,。.\s]*/g, '')
    .replace(/^(看起来是|这里是|画面里|视频里|镜头里|我看到|我看见)[^。！？!?]*[。！？!?]\s*/g, '');

  const clauseCandidates = splitChineseSpeechClauses(clean)
    .map((item) => item.replace(/^[，,。！？!?\s]*(再来一次|重新来|重新设置|再说一遍|那|然后|接下来)[，,。！？!?\s]*/g, '').trim())
    .filter((item) => (
      item
      && hasActiveReminderNotifyActionText(item)
      && hasActiveReminderTaskTriggerText(item)
      && !/(为什么|怎么|没有提醒|没提醒|不主动提醒)/.test(item.replace(/\s+/g, ''))
    ));
  if (clauseCandidates.length > 0) {
    return normalizeActiveReminderInstructionText(trimActiveReminderInstructionPreface(clauseCandidates[clauseCandidates.length - 1]));
  }

  const chunks = clean
    .split(/(?=(?:看到|看见|发现|识别到|找到|出现|有))/g)
    .map((item) => item.trim())
    .filter(Boolean);
  const candidates = chunks.filter((item) => (
    hasActiveReminderNotifyActionText(item)
    && hasActiveReminderTaskTriggerText(item)
  ));
  if (candidates.length > 0) {
    return normalizeActiveReminderInstructionText(candidates[candidates.length - 1]);
  }

  const matches = Array.from(clean.matchAll(/(看到|看见|发现|识别到|找到|出现|有)[^。！？!?，,；;]*(提醒|提示|告诉|叫我|通知)[^。！？!?，,；;]*/g));
  if (matches.length > 0) {
    return normalizeActiveReminderInstructionText(matches[matches.length - 1][0].trim());
  }
  return normalizeActiveReminderInstructionText(clean.trim());
}

function trimActiveReminderInstructionPreface(value) {
  const text = String(value || '').trim();
  const parts = text.split(/[，,；;]/).map((item) => item.trim()).filter(Boolean);
  const taskParts = parts.filter((item) => {
    const compact = item.replace(/\s+/g, '');
    return hasActiveReminderNotifyActionText(compact)
      && hasActiveReminderTaskTriggerText(compact)
      && !/(为什么|怎么|没有提醒|没提醒|不主动提醒)/.test(compact);
  });
  return taskParts.length ? taskParts[taskParts.length - 1] : text;
}

function isLikelyReminderEchoTranscript(compactTranscript) {
  const compact = String(compactTranscript || '');
  if (!compact) {
    return false;
  }
  const asksAssistantToNotifyUser = /(提醒我|提示我|告诉我|叫我|通知我)/.test(compact);
  if (asksAssistantToNotifyUser) {
    return false;
  }
  return /(我会提醒你|会提醒你|会提醒|已经提醒你|已经提醒|看到了.*提醒你|好的.*提醒你|好.*提醒你)/.test(compact);
}

function normalizeActiveReminderInstructionText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasExplicitActiveReminderContractModeText(value) {
  const compact = String(value || '').replace(/\s+/g, '');
  if (!compact) {
    return false;
  }
  return /(?:第?[一1]类|一类|1类|第一种|按出现|出现模式|出现类|目标出现|以出现为导向|第?[二2]类|二类|2类|第二种|按结果|结果模式|结果类|结果达成|达成模式|状态达成|以结果为导向|第?[三3]类|三类|3类|第三种|按变化|变化模式|变化类|前后变化|比较模式|比较类|以变化为导向)/.test(compact);
}

function inferExplicitActiveReminderContractMode(value) {
  const compact = String(value || '').replace(/\s+/g, '');
  if (/(?:第?[一1]类|一类|1类|第一种|按出现|出现模式|出现类|目标出现|以出现为导向)/.test(compact)) {
    return 'appear';
  }
  if (/(?:第?[二2]类|二类|2类|第二种|按结果|结果模式|结果类|结果达成|达成模式|状态达成|以结果为导向)/.test(compact)) {
    return 'result_reached';
  }
  if (/(?:第?[三3]类|三类|3类|第三种|按变化|变化模式|变化类|前后变化|比较模式|比较类|以变化为导向)/.test(compact)) {
    return 'state_changed';
  }
  return '';
}

function parseExplicitActiveReminderContractInstruction(value) {
  const compact = String(value || '').replace(/\s+/g, '').replace(/[“”"'‘’]/g, '');
  if (!compact || !hasExplicitActiveReminderContractModeText(compact)) {
    return null;
  }
  const mode = inferExplicitActiveReminderContractMode(compact);
  if (!mode) {
    return null;
  }
  const afterMarker = trimExplicitActiveReminderContractMarker(compact);
  const explicitTarget = extractExplicitActiveReminderContractTarget(afterMarker || compact);
  let condition = extractExplicitActiveReminderContractCondition(afterMarker || compact);
  if (!condition) {
    return null;
  }
  if (explicitTarget && !condition.includes(explicitTarget) && !/^(目标|主体|对象)$/.test(condition)) {
    condition = `${explicitTarget}${condition}`;
  }

  if (mode === 'appear') {
    const target = cleanExplicitActiveReminderAppearTarget(explicitTarget || condition);
    if (!target) {
      return null;
    }
    const finalCondition = `画面中出现${target}`;
    return {
      category: 'target_presence',
      mode: 'appear',
      lifecycle: normalizeClientActiveReminderLifecycle('', 'target_presence', 'appear', compact),
      target,
      condition: finalCondition,
      speakText: buildClientActiveReminderSpeakText({
        category: 'target_presence',
        mode: 'appear',
        target,
        condition: finalCondition
      }),
      explicitContract: true
    };
  }

  if (mode === 'state_changed' && !hasActiveReminderChangeTriggerText(condition)) {
    condition = `${condition}发生变化`;
  }
  const stateTarget = explicitTarget || extractActiveReminderStateTarget(`${condition}提醒我`) || '目标状态';
  const target = mode === 'state_changed'
    ? normalizeStateChangedTrackingSubject(stateTarget)
    : stateTarget;
  const finalCondition = mode === 'result_reached'
    ? buildClientActiveReminderStateCondition(`${condition}提醒我`, target)
    : cleanClientActiveReminderContractCondition(condition);
  return {
    category: 'state_tracking',
    mode,
    lifecycle: normalizeClientActiveReminderLifecycle('', 'state_tracking', mode, compact),
    target,
    condition: finalCondition,
    speakText: buildClientActiveReminderSpeakText({
      category: 'state_tracking',
      mode,
      target,
      condition: finalCondition
    }),
    explicitContract: true
  };
}

function trimExplicitActiveReminderContractMarker(value) {
  return String(value || '')
    .replace(/^.*?(?:第?[一1]类|一类|1类|第一种|按出现(?:提醒)?|出现模式|出现类|目标出现|以出现为导向|第?[二2]类|二类|2类|第二种|按结果(?:提醒)?|结果模式|结果类|结果达成|达成模式|状态达成|以结果为导向|第?[三3]类|三类|3类|第三种|按变化(?:提醒)?|变化模式|变化类|前后变化|比较模式|比较类|以变化为导向)/, '')
    .replace(/^(?:任务|合同|模式|提醒|时|的时候|就|是|为|按|：|:|，|,|；|;|。)+/g, '');
}

function extractExplicitActiveReminderContractTarget(value) {
  const compact = String(value || '').replace(/\s+/g, '');
  const match = compact.match(/(?:主体|目标|对象)(?:是|为|:|：)?(.{1,24}?)(?=[，,；;。]*(?:筛|筛选|过滤|条件|结果|观察|看|盯|判断|提醒|提示|告诉|通知|叫你|叫我|会提醒|会告诉|$))/);
  return cleanActiveReminderStateTarget(match?.[1] || '');
}

function extractExplicitActiveReminderContractCondition(value) {
  let text = String(value || '').replace(/\s+/g, '');
  text = text.replace(/(?:主体|目标|对象)(?:是|为|:|：)?.{1,24}?(?=[，,；;。]*(?:筛|筛选|过滤|条件|结果|观察|看|盯|判断))/g, '');
  const conditionMatch = text.match(/(?:筛选?|过滤|观察|看|盯着?|判断|条件(?:是|为|:|：)?|结果(?:是|为|:|：)?)(.{1,80})/);
  if (conditionMatch?.[1]) {
    text = conditionMatch[1];
  }
  return cleanClientActiveReminderContractCondition(text
    .replace(/^(?:任务|合同|模式|提醒|是|为|:|：|，|,|；|;|。)+/g, '')
    .replace(/(?:会)?(?:提醒你|提示你|告诉你|通知你|叫你|和你说|跟你说|提醒我|提示我|告诉我|通知我|叫我|和我说|跟我说|说一声|说一下|说下).*$/g, '')
    .replace(/^(?:筛选?|过滤|观察|看|盯着?|盯|判断|条件|结果)/g, ''));
}

function cleanExplicitActiveReminderAppearTarget(value) {
  return cleanActiveReminderTarget(String(value || '')
    .replace(/(明确)?(出现|可见|露出|出来)$/g, '')
    .replace(/^画面中/, ''));
}

function inferActiveReminderContractMode(text, category = '') {
  if (category === 'target_presence') {
    return 'appear';
  }
  const raw = String(text || '').trim();
  if (raw === 'state_changed' || raw === 'change') {
    return 'state_changed';
  }
  if (raw === 'result_reached' || raw === 'reached' || raw === 'threshold' || raw === 'relation_reached') {
    return 'result_reached';
  }
  const compact = String(text || '').replace(/\s+/g, '');
  if (/(变化|改变|有变化|状态变|一变|变了|换位置|换地方|移动了|挪动了|挪位置|位置变|内容变|(?:从|由).{1,20}(?:变成|变为|到|拿起|拿起来|放下|离开|进入|出来))/.test(compact)) {
    return 'state_changed';
  }
  return 'result_reached';
}

function buildClientActiveReminderSpeakText(contract) {
  const category = contract?.category === 'state_tracking' ? 'state_tracking' : 'target_presence';
  const target = normalizeActiveReminderInstructionText(contract?.target || '');
  const condition = cleanClientActiveReminderContractCondition(contract?.condition || target || '');
  if (category === 'target_presence') {
    return target ? `看到${target}了` : '看到目标了';
  }
  const cleaned = condition
    .replace(/^(当|如果|一旦|等到|下次)/, '')
    .replace(/(的时候|时候|时|后)$/g, '')
    .replace(/^(画面中|当前|现在)/, '')
    .trim();
  if (!cleaned) {
    return target ? `${target}已达到提醒条件` : '已经达到提醒条件';
  }
  if (/(了|着|完成|通过|就绪|到位|接近|快满|不见|消失)$/.test(cleaned)) {
    return cleaned;
  }
  return `${cleaned}了`;
}

function buildClientActiveReminderContractTask(contract) {
  const category = contract?.category === 'state_tracking' ? 'state_tracking' : 'target_presence';
  const mode = category === 'target_presence'
    ? 'appear'
    : inferActiveReminderContractMode(contract?.mode || contract?.condition || '', category);
  const rawTarget = normalizeActiveReminderInstructionText(contract?.target || (category === 'state_tracking' ? '目标状态' : '目标'));
  const target = mode === 'state_changed'
    ? normalizeStateChangedTrackingSubject(rawTarget)
    : rawTarget;
  const condition = cleanClientActiveReminderContractCondition(contract?.condition || target || '任务不明确');
  const lifecycle = normalizeClientActiveReminderLifecycle(contract?.lifecycle, category, mode, contract?.sourceText || '');
  const speakText = normalizeActiveReminderInstructionText(contract?.speakText || '')
    || buildClientActiveReminderSpeakText({ category, mode, target, condition });
  if (category === 'state_tracking') {
    return `任务类型：state_tracking。调度合同：category=state_tracking；mode=${mode}；lifecycle=${lifecycle}；target=${target}；condition=${condition}；speakText=${speakText}。快筛职责：每帧只输出 currentState、resultReached、resultText；未达成、没看到、看不清、不确定或中间状态不得播报。`;
  }
  return `任务类型：target_presence。调度合同：category=target_presence；mode=appear；lifecycle=${lifecycle}；target=${target}；condition=${condition}；speakText=${speakText}。快筛职责：只在目标明确出现时 HIT；未发现、看不清、不确定不得播报。`;
}

function cleanClientActiveReminderContractCondition(value) {
  return normalizeActiveReminderInstructionText(value || '')
    .replace(/(请|就)?(提醒我|提示我|告诉我|通知我|叫我|和我说|跟我说|对我说|说一声|说一下|说下|我讲|跟我讲|告诉一下|报一下)$/g, '')
    .replace(/(会提醒你|会提示你|会告诉你|会通知你|会叫你|会和你说|会跟你说)$/g, '')
    .replace(/(的时候|时候|时|后)$/g, '')
    .trim();
}

function buildActiveReminderTaskFromInstruction(instruction) {
  const normalizedInstruction = normalizeActiveReminderInstructionText(instruction);
  const explicitContract = parseExplicitActiveReminderContractInstruction(normalizedInstruction);
  if (explicitContract) {
    return {
      task: buildClientActiveReminderContractTask(explicitContract),
      target: explicitContract.target,
      explicitContract: true
    };
  }
  const taskType = inferActiveReminderTaskType(normalizedInstruction);
  if (taskType === 'state_tracking') {
    const mode = inferActiveReminderContractMode(normalizedInstruction, 'state_tracking');
    const extractedTarget = extractActiveReminderStateTarget(normalizedInstruction);
    const target = mode === 'state_changed'
      ? normalizeStateChangedTrackingSubject(extractedTarget)
      : extractedTarget;
    const condition = buildClientActiveReminderStateCondition(normalizedInstruction, target);
    const speakText = buildClientActiveReminderSpeakText({
      category: 'state_tracking',
      mode,
      target,
      condition
    });
    return {
      task: buildClientActiveReminderContractTask({
        category: 'state_tracking',
        mode,
        lifecycle: normalizeClientActiveReminderLifecycle('', 'state_tracking', mode, normalizedInstruction),
        target,
        condition,
        speakText
      }),
      target
    };
  }
  const target = extractActiveReminderTarget(instruction);
  if (target) {
    const condition = `画面中出现${target}`;
    const speakText = buildClientActiveReminderSpeakText({
      category: 'target_presence',
      mode: 'appear',
      target,
      condition
    });
    return {
      task: buildClientActiveReminderContractTask({
        category: 'target_presence',
        mode: 'appear',
        lifecycle: normalizeClientActiveReminderLifecycle('', 'target_presence', 'appear', normalizedInstruction),
        sourceText: normalizedInstruction,
        target,
        condition,
        speakText
      }),
      target
    };
  }
  const condition = normalizedInstruction || '任务不明确';
  return {
    task: buildClientActiveReminderContractTask({
      category: 'target_presence',
      mode: 'appear',
      target: '',
      condition,
      speakText: '看到目标了'
    }),
    target: ''
  };
}

function extractActiveReminderStateTarget(instruction) {
  const clean = cleanClientActiveReminderContractCondition(instruction)
    .replace(/^(?:(?:如果|一旦|等到|下次|识别到|看到|看见|发现|找到|当|等|再|请|帮我))+/g, '')
    .replace(/就$/g, '')
    .trim();
  const patterns = [
    /^(?:把|将)(.{1,20}?)(?:移动到|移到|挪到|放到|放上|拿起|放下|打开|开启|关上|关掉|关闭|开始|停止|挡住|让开)/,
    /^(.{1,20}?)(?:从|由).{1,20}?(?:变成|变为|到|拿起|拿起来|放下|离开|进入|出来)/,
    /^(.{1,20}?)(?:换位置|换地方|位置(?:发生)?(?:变了|变化|改变)|移动|挪动|变成|变为|变化|改变|亮了|暗了|灭了|熄了|黑了|开了|关了|一开|一关|一变|亮起来|暗下来|打开|关上|关掉|关闭|开始|停止|停了|停下|停住|停转|快满|满了|接近|靠近|走近|到达|到站|走到|到|离开|进入|出来|过来|出现|没人了|无人了|没有.*了|不见|消失|伸到|放到|放上|覆盖|铺满|翻到|跳到|叫到|轮到|显示完成|完成|通过|就绪|准备好了)/,
    /^(?:打开|开启|关闭|关上|关掉|开|关|启动|停止|拿起|放下|放到|放上)(.{1,20})/
  ];
  for (const pattern of patterns) {
    const match = clean.match(pattern);
    const target = cleanActiveReminderStateTarget(match?.[1] || '');
    if (target) {
      return target;
    }
  }
  return cleanActiveReminderStateTarget(clean);
}

function cleanActiveReminderStateTarget(value) {
  return cleanActiveReminderTarget(value)
    .replace(/有$/g, '')
    .trim();
}

function normalizeStateChangedTrackingSubject(value) {
  let target = cleanActiveReminderStateTarget(String(value || '')
    .replace(/^(?:真正变化的|发生变化的|需要跟踪的|被跟踪的|当前|原来|原先)/g, '')
    .replace(/^(?:我的|你的|您的|用户的)/g, ''));
  if (!target) {
    return '';
  }
  const locatedSubject = target.match(/^.{1,28}?(?:上面|下面|里面|外面|上方|下方|左侧|右侧|左边|右边|前面|后面|旁边|附近|门口|表面|顶部|底部|上|下|里|内|中|旁)的(.{1,24})$/);
  if (locatedSubject?.[1]) {
    target = cleanActiveReminderStateTarget(locatedSubject[1]);
  }
  return target;
}

function buildClientActiveReminderStateCondition(instruction, target = '') {
  const clean = cleanClientActiveReminderContractCondition(instruction);
  const compact = clean.replace(/\s+/g, '');
  if (target && /^(打开|开启|启动|开始|开)/.test(compact)) {
    return `${target}达到开启后的可见状态`;
  }
  if (target && /一开/.test(compact)) {
    return `${target}达到开启后的可见状态`;
  }
  if (target && /^(关闭|关上|关掉|停止|关)/.test(compact)) {
    return `${target}达到关闭后的可见状态`;
  }
  if (target && /一关/.test(compact)) {
    return `${target}达到关闭后的可见状态`;
  }
  return clean || target || '任务不明确';
}

function inferActiveReminderTaskType(instruction) {
  const text = String(instruction || '').replace(/\s+/g, '');
  if (!text) {
    return 'target_presence';
  }
  const explicitMode = inferExplicitActiveReminderContractMode(text);
  if (explicitMode === 'appear') {
    return 'target_presence';
  }
  if (explicitMode === 'result_reached' || explicitMode === 'state_changed') {
    return 'state_tracking';
  }
  if (looksLikeDescribedTargetPresenceInstruction(text)) {
    return 'target_presence';
  }
  if (hasActiveReminderStateTrackingTriggerText(text)) {
    return 'state_tracking';
  }
  return 'target_presence';
}

function setActiveReminderTaskFromInstruction(instruction, meta = {}) {
  const reminder = appState.activeReminder;
  if (!reminder) {
    return false;
  }
  const parsedTask = buildActiveReminderTaskFromInstruction(instruction);
  const task = parsedTask.task;
  const previousTask = reminder.taskOverride || '';
  reminder.taskOverride = task;
  reminder.pendingMessage = '';
  reminder.pendingTask = '';
  reminder.pendingSpeechText = '';
  reminder.awaitingResponse = false;
  reminder.rtcPollInProgress = false;
  reminder.rtcPollText = '';
  if (previousTask !== task) {
    reminder.speedAlertedTaskKey = '';
    reminder.speedPendingAlertTaskKey = '';
    reminder.speedResponseCanceled = false;
    reminder.speedMissCount = 0;
    reminder.rtcAlertedTaskKey = '';
    reminder.rtcPendingAlertTaskKey = '';
    reminder.rtcResponseCanceled = false;
    reminder.rtcMissCount = 0;
    reminder.alertedResultKeys = [];
    reminder.stateMemory = null;
  }
  setActiveReminderStatus('主动提醒任务已更新：按你刚才说的话判断。');
  logClientEvent('active_reminder.task_updated', {
    task,
    instruction,
    target: parsedTask.target,
    source: meta.source || 'transcript',
    inputTranscript: meta.inputTranscript || '',
    outputTranscript: meta.outputTranscript || ''
  });
  if (isSpeedLogicMode(reminder.mode) && !meta.skipConfirmation) {
    maybeConfirmSpeedActiveReminderTask(reminder, task);
  }
  return true;
}

function isAliUnifiedHostSession(reminder = appState.activeReminder) {
  const visual = appState.geminiReminder;
  return Boolean(
    reminder
    && visual?.transport === 'aliyun-realtime'
    && visual.unifiedAssistantMode
  );
}

function getAliUnifiedCurrentMode() {
  const visual = appState.geminiReminder;
  if (visual?.transport === 'aliyun-realtime') {
    const unifiedMode = String(visual.unifiedActiveMode || '').trim();
    if (
      unifiedMode === 'active_reminder'
      || unifiedMode === 'find_object'
      || unifiedMode === 'continuous_narration'
    ) {
      return unifiedMode;
    }
    const visualMode = getGeminiReminderExecutionMode(visual);
    if (visualMode === 'find_object' || visualMode === 'continuous_narration') {
      return visualMode;
    }
  }
  return appState.activeReminder?.taskOverride ? 'active_reminder' : '';
}

function clearAliUnifiedOneShotQuestion(visual, reason = '') {
  if (!visual || visual.transport !== 'aliyun-realtime') {
    return false;
  }
  const hadQuestion = Boolean(
    visual.unifiedOrdinaryQuestion
    || visual.unifiedOneShotQuestionInFlight
    || visual.unifiedOneShotQuestionTimer
  );
  if (visual.unifiedOneShotQuestionTimer) {
    clearTimeout(visual.unifiedOneShotQuestionTimer);
    visual.unifiedOneShotQuestionTimer = null;
  }
  visual.unifiedOrdinaryQuestion = '';
  visual.unifiedOneShotQuestionInFlight = false;
  if (hadQuestion) {
    logClientEvent('ali_unified.one_shot_question_cleared', { reason });
  }
  return hadQuestion;
}

function clearAliUnifiedVisualExecution(reason = '') {
  const visual = appState.geminiReminder;
  if (!visual || visual.transport !== 'aliyun-realtime') {
    return;
  }
  clearAliUnifiedOneShotQuestion(visual, reason || 'ali_unified_clear');
  visual.activeTaskSeq = (visual.activeTaskSeq || 0) + 1;
  clearGeminiReminderTaskForNewInstruction(visual, reason || 'ali_unified_clear');
  visual.findTaskSeq = (visual.findTaskSeq || 0) + 1;
  clearGeminiFindObjectMemory(visual, reason || 'ali_unified_clear');
  clearGeminiContinuousNarrationMemory(visual);
  visual.unifiedActiveMode = '';
  visual.unifiedPendingMode = null;
  visual.unifiedClassifyInFlight = false;
  visual.turnInProgress = false;
  visual.returnToUnifiedAfterAliSpeech = '';
}

function cancelAliUnifiedSpeechForTaskSwitch(reason = '') {
  const realtime = appState.realtime;
  const reminder = appState.activeReminder;
  if (!realtime || !reminder || !isAliUnifiedHostSession(reminder)) {
    return false;
  }
  const hadActiveSpeech = Boolean(
    reminder.pendingMessage
    || reminder.awaitingResponse
    || realtime.responseInProgress
    || isAssistantPlaybackActive(realtime)
  );
  realtime.player?.reset('realtime_response_replaced');
  if (realtime.responseInProgress) {
    sendRealtimeEvent({ type: 'response.cancel' });
  }
  realtime.responseInProgress = false;
  realtime.assistantPlaybackActive = false;
  realtime.assistantPlaybackUntil = 0;
  clearActiveReminderPendingResponse();
  reminder.pendingSpeechText = '';
  appState.latestAssistantText = '';
  logClientEvent('ali_unified.old_speech_cancelled_for_switch', {
    reason,
    hadActiveSpeech
  });
  return hadActiveSpeech;
}

function returnAliUnifiedToDistributor(reason = '') {
  const reminder = appState.activeReminder;
  const visual = appState.geminiReminder;
  if (
    !isAliUnifiedHostSession(reminder)
    || visual?.transport !== 'aliyun-realtime'
  ) {
    return false;
  }
  clearActiveReminderTaskForNewInstruction(
    reminder,
    reason || 'ali_unified_return_to_distributor'
  );
  clearAliUnifiedVisualExecution(
    reason || 'ali_unified_return_to_distributor'
  );
  reminder.taskNormalizeInFlight = false;
  reminder.mode = 'ali_unified';
  visual.unifiedPendingMode = null;
  visual.unifiedActiveMode = '';
  logClientEvent('ali_unified.return_to_distributor', {
    reason,
    activeMode: getAliUnifiedCurrentMode()
  });
  syncSpecialTaskStopControl();
  return true;
}

function sendAliUnifiedSpeech(text, kind = 'say') {
  const reminder = appState.activeReminder;
  const realtime = appState.realtime;
  const speech = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (
    !speech
    || !isAliUnifiedHostSession(reminder)
    || !realtime?.isReady
    || reminder.pendingMessage
    || reminder.awaitingResponse
    || realtime.responseInProgress
    || isAssistantPlaybackActive(realtime)
  ) {
    return false;
  }
  reminder.pendingMessage = kind === 'narrate' ? 'ali_unified_narrate' : 'ali_unified_say';
  reminder.pendingTask = '';
  reminder.pendingSpeechText = speech;
  reminder.awaitingResponse = false;
  const visual = appState.geminiReminder;
  if (visual?.transport === 'aliyun-realtime') {
    visual.turnInProgress = true;
    visual.assistantResponseActive = true;
  }
  maybeRequestActiveReminderResponse();
  logClientEvent('ali_unified.say_queued', { kind, text: speech });
  return true;
}

function requestAliUnifiedOneShotQuestion(question) {
  const reminder = appState.activeReminder;
  const visual = appState.geminiReminder;
  const rawQuestion = String(question || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  const currentMode = getAliUnifiedCurrentMode();
  const modeAllowsQuestion = !currentMode || Boolean(
    visual?.visualAssistantBaseExperiment && currentMode === 'active_reminder'
  );
  if (
    !rawQuestion
    || !isAliUnifiedHostSession(reminder)
    || visual?.transport !== 'aliyun-realtime'
    || !modeAllowsQuestion
    || visual.unifiedPendingMode
    || visual.unifiedClassifyInFlight
    || visual.unifiedOneShotQuestionInFlight
  ) {
    return false;
  }

  visual.unifiedOrdinaryQuestion = rawQuestion;
  visual.unifiedOneShotQuestionInFlight = true;
  visual.turnInProgress = true;
  visual.assistantResponseActive = true;

  const failWithoutQueue = (reason) => {
    if (appState.geminiReminder !== visual) {
      return;
    }
    clearAliUnifiedOneShotQuestion(visual, reason);
    visual.turnInProgress = false;
    visual.assistantResponseActive = false;
    setActiveReminderStatus('这次普通问答没有发出，请重新问一次。');
    logClientEvent('ali_unified.one_shot_question_failed', {
      question: rawQuestion,
      reason
    });
  };

  const requestNow = (allowSettleRetry) => {
    const latestMode = getAliUnifiedCurrentMode();
    const latestModeAllowsQuestion = !latestMode || Boolean(
      visual.visualAssistantBaseExperiment && latestMode === 'active_reminder'
    );
    if (
      appState.activeReminder !== reminder
      || appState.geminiReminder !== visual
      || !visual.unifiedOneShotQuestionInFlight
      || !latestModeAllowsQuestion
      || visual.unifiedPendingMode
    ) {
      failWithoutQueue('state_changed_before_request');
      return;
    }
    const realtime = appState.realtime;
    if (!realtime?.isReady || realtime.responseInProgress || isAssistantPlaybackActive(realtime)) {
      failWithoutQueue('realtime_busy');
      return;
    }
    const settleRemainingMs = getRealtimeResponseSettleRemainingMs(realtime);
    if (allowSettleRetry && settleRemainingMs > 0) {
      visual.unifiedOneShotQuestionTimer = setTimeout(() => {
        visual.unifiedOneShotQuestionTimer = null;
        requestNow(false);
      }, settleRemainingMs + 80);
      logClientEvent('ali_unified.one_shot_question_waiting_for_settle', {
        question: rawQuestion,
        settleRemainingMs
      });
      return;
    }
    if (appState.appVariant === 'aliyun' && !isAliRealtimeVideoExperiment()) {
      const imageData = captureGeminiContinuousNarrationFrame();
      if (!imageData) {
        failWithoutQueue('camera_frame_unavailable');
        return;
      }
      visual.unifiedOneShotQuestionTimer = null;
      logClientEvent('ali_cheap_vision37.ordinary_requested', {
        question: rawQuestion
      });
      requestAliCheapVision37Answer(imageData, 'ordinary_question', rawQuestion)
        .then((result) => {
          const latestMode = getAliUnifiedCurrentMode();
          const stillAllowsQuestion = !latestMode || Boolean(
            visual.visualAssistantBaseExperiment && latestMode === 'active_reminder'
          );
          if (
            appState.activeReminder !== reminder
            || appState.geminiReminder !== visual
            || !visual.unifiedOneShotQuestionInFlight
            || visual.unifiedOrdinaryQuestion !== rawQuestion
            || !stillAllowsQuestion
            || visual.unifiedPendingMode
          ) {
            failWithoutQueue('state_changed_after_vision37');
            return;
          }
          if (!sendAliUnifiedSpeech(result.spokenText, 'say')) {
            failWithoutQueue('vision37_speech_queue_rejected');
            return;
          }
          setActiveReminderStatus('普通问答：3.7 已看图，正在播报答案。');
          logClientEvent('ali_cheap_vision37.ordinary_result_queued', {
            question: rawQuestion,
            model: result.model || '',
            latencyMs: Number(result.latencyMs || 0)
          });
        })
        .catch((error) => {
          failWithoutQueue(`vision37_failed:${String(error?.message || error).slice(0, 100)}`);
        });
      return;
    }
    sendVideoFrame({ force: true });
    if (isAliRealtimeVideoExperiment()) {
      sendRealtimeEvent({ type: 'input_audio_buffer.commit' });
      appState.sentFirstAudio = false;
    }
    if (!requestRealtimeManualResponse('ali_unified_one_shot_question')) {
      failWithoutQueue('response_create_rejected');
      return;
    }
    visual.unifiedOneShotQuestionTimer = null;
    logClientEvent('ali_unified.one_shot_question_requested', {
      question: rawQuestion
    });
  };

  requestNow(true);
  return true;
}

function applyAliUnifiedActiveReminderContract(result, transcript) {
  const reminder = appState.activeReminder;
  const contract = { ...result, action: 'create_task' };
  if (
    !reminder
    || !isAliUnifiedHostSession(reminder)
    || !isExecutableNormalizedActiveReminderContract(contract)
  ) {
    return false;
  }
  cancelAliUnifiedSpeechForTaskSwitch('ali_unified_active_reminder');
  clearAliUnifiedVisualExecution('ali_unified_active_reminder');
  clearActiveReminderTaskForNewInstruction(reminder, 'ali_unified_active_reminder');
  reminder.taskNormalizeInFlight = false;
  reminder.taskOverride = contract.taskText;
  const visual = appState.geminiReminder;
  if (visual?.transport === 'aliyun-realtime') {
    visual.unifiedActiveMode = 'active_reminder';
  }
  setActiveReminderStatus(`纯阿里主动提醒已建立：${contract.condition || contract.target}。`);
  logClientEvent('ali_unified.active_reminder_activated', {
    transcript,
    contractType: contract.contractType || '',
    category: contract.category || '',
    mode: contract.mode || '',
    lifecycle: contract.lifecycle || '',
    target: contract.target || '',
    condition: contract.condition || '',
    confirmationSpeech: result.confirmationSpeech || '',
    task: contract.taskText
  });
  return sendAliUnifiedSpeech(result.confirmationSpeech, 'say');
}

function activateAliUnifiedFindObject(subject, confirmationSpeech) {
  const visual = appState.geminiReminder;
  const reminder = appState.activeReminder;
  if (!visual || visual.transport !== 'aliyun-realtime' || !reminder) {
    return false;
  }
  cancelAliUnifiedSpeechForTaskSwitch('ali_unified_find_object');
  reminder.mode = 'ali_unified';
  clearActiveReminderTaskForNewInstruction(reminder, 'ali_unified_find_object');
  reminder.taskNormalizeInFlight = false;
  activateGeminiUnifiedExecutionMode(visual, 'find_object', { subject });
  return sendAliUnifiedSpeech(confirmationSpeech, 'say');
}

function activateAliUnifiedContinuousNarration(subject, instruction, confirmationSpeech) {
  const visual = appState.geminiReminder;
  const reminder = appState.activeReminder;
  if (!visual || visual.transport !== 'aliyun-realtime' || !reminder) {
    return false;
  }
  cancelAliUnifiedSpeechForTaskSwitch('ali_unified_continuous_narration');
  reminder.mode = 'ali_unified';
  clearActiveReminderTaskForNewInstruction(reminder, 'ali_unified_continuous_narration');
  reminder.taskNormalizeInFlight = false;
  activateGeminiUnifiedExecutionMode(visual, 'continuous_narration', {
    subject,
    instruction: instruction || subject
  });
  return sendAliUnifiedSpeech(confirmationSpeech, 'say');
}

async function executeAliUnifiedStandaloneModule(mode, instruction, options = {}) {
  const reminder = appState.activeReminder;
  const visual = appState.geminiReminder;
  const rawInstruction = String(instruction || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (
    !rawInstruction
    || !isAliUnifiedHostSession(reminder)
    || visual?.transport !== 'aliyun-realtime'
  ) {
    return false;
  }
  if (mode === 'active_reminder') {
    if (isAliCheapDirectFunctionContractExperiment()) {
      const requested = requestAliCheapFunctionContractDecision(rawInstruction);
      logClientEvent('ali_unified.worker_handoff', {
        mode,
        instruction: rawInstruction,
        delegated: requested,
        contractMode: 'ali_cheap_direct_function'
      });
      return requested;
    }
    clearAliUnifiedVisualExecution('ali_unified_handoff_active');
    clearActiveReminderTaskForNewInstruction(reminder, 'ali_unified_handoff_active');
    reminder.taskNormalizeInFlight = false;
    reminder.mode = 'ali_experiment';
    visual.unifiedActiveMode = 'active_reminder';
    const delegated = maybeDelegateSpeedReminderTaskToModel(rawInstruction);
    logClientEvent('ali_unified.worker_handoff', {
      mode,
      instruction: rawInstruction,
      delegated
    });
    return delegated;
  }
  if (!['find_object', 'continuous_narration'].includes(mode)) {
    return false;
  }
  const seq = (visual.unifiedModuleSeq || 0) + 1;
  visual.unifiedModuleSeq = seq;
  visual.unifiedClassifyInFlight = true;
  reminder.taskNormalizeInFlight = true;
  logClientEvent('ali_unified.worker_requested', {
    seq,
    mode,
    instruction: rawInstruction,
    initialInstruction: options.initialInstruction === true
  });
  try {
    const result = await apiPost('/api/unified-visual-module-instruction', {
      mode,
      transcript: rawInstruction,
      initialInstruction: options.initialInstruction === true,
      findTouchConfirmationPending: Boolean(
        mode === 'find_object' && visual.findTouchConfirmationPending
      )
    });
    if (
      appState.activeReminder !== reminder
      || appState.geminiReminder !== visual
      || visual.unifiedModuleSeq !== seq
    ) {
      return false;
    }
    visual.unifiedClassifyInFlight = false;
    reminder.taskNormalizeInFlight = false;
    logClientEvent('ali_unified.worker_result', {
      seq,
      mode,
      action: result.action || '',
      subject: result.subject || '',
      latencyMs: result.latencyMs ?? ''
    });
    if (mode === 'find_object') {
      if (result.action === 'start') {
        return activateAliUnifiedFindObject(result.subject, result.confirmationSpeech);
      }
      if (result.action === 'complete') {
        const completedTarget = visual.findTarget;
        returnAliUnifiedToDistributor('find_user_confirmed_touch');
        setActiveReminderStatus(visual.visualAssistantBaseExperiment
          ? `已经确认摸到${completedTarget}，视觉助手底座继续运行。`
          : `已经确认摸到${completedTarget}，找东西任务已结束并返回任务分发。`);
        return sendAliUnifiedSpeech(visual.visualAssistantBaseExperiment
          ? '找东西已完成。'
          : '找东西已完成，已返回任务选择，可以说新任务。', 'say');
      }
      if (result.action === 'resume') {
        visual.findTouchConfirmationPending = false;
        visual.findTouchConfirmationAskedAt = 0;
        visual.findOcclusionCount = 0;
        visual.findLastSpokenStatus = '';
        visual.findLastSpokenAt = 0;
        visual.inFlight = false;
        return sendAliUnifiedSpeech(result.confirmationSpeech, 'say');
      }
      if (result.action === 'cancel') {
        returnAliUnifiedToDistributor('find_user_cancelled');
        setActiveReminderStatus(visual.visualAssistantBaseExperiment
          ? '找东西已停止，视觉助手底座继续运行。'
          : '找东西已停止并返回任务分发。');
        return sendAliUnifiedSpeech(visual.visualAssistantBaseExperiment
          ? '找东西已停止。'
          : '找东西已停止，已返回任务选择，可以说新任务。', 'say');
      }
      return false;
    }
    if (result.action === 'set') {
      return activateAliUnifiedContinuousNarration(
        result.subject,
        rawInstruction,
        result.confirmationSpeech
      );
    }
    if (result.action === 'cancel') {
      returnAliUnifiedToDistributor('continuous_user_cancelled');
      setActiveReminderStatus(visual.visualAssistantBaseExperiment
        ? '持续播报已停止，视觉助手底座继续运行。'
        : '持续播报已停止并返回任务分发。');
      return sendAliUnifiedSpeech(visual.visualAssistantBaseExperiment
        ? '持续播报已停止。'
        : '持续播报已结束，已返回任务选择，可以说新任务。', 'say');
    }
    return false;
  } catch (error) {
    if (
      appState.activeReminder === reminder
      && appState.geminiReminder === visual
      && visual.unifiedModuleSeq === seq
    ) {
      visual.unifiedClassifyInFlight = false;
      reminder.taskNormalizeInFlight = false;
    }
    logClientEvent('ali_unified.worker_failed', {
      seq,
      mode,
      instruction: rawInstruction,
      error: error.message
    });
    setActiveReminderStatus(`独立模块接收任务失败：${error.message}`);
    sendAliUnifiedSpeech('这次任务没有建立成功，请重新说一次。', 'say');
    return false;
  }
}

async function handleAliUnifiedTranscript(transcript) {
  const reminder = appState.activeReminder;
  const visual = appState.geminiReminder;
  const rawTranscript = String(transcript || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (
    !rawTranscript
    || !isAliUnifiedHostSession(reminder)
    || visual?.transport !== 'aliyun-realtime'
  ) {
    return false;
  }
  let pending = visual.unifiedPendingMode;
  const activeMode = getAliUnifiedCurrentMode();
  const compactTranscript = rawTranscript.replace(/[，,。.!！?？；;：:\s]/g, '');
  const visualAssistantBaseExperiment = Boolean(visual.visualAssistantBaseExperiment);
  const strictSpecialMode = resolveVisualAssistantStrictSpecialModeCue(rawTranscript);
  const requestedMechanicalMode = resolveUnifiedMechanicalModeCue(rawTranscript);
  if (activeMode === 'find_object') {
    if (isExactSingleWordStop(rawTranscript)) {
      const target = String(visual.findTarget || '').trim();
      returnAliUnifiedToDistributor('find_voice_stop');
      setActiveReminderStatus(visualAssistantBaseExperiment
        ? '找东西已停止，视觉助手底座继续运行。'
        : '找东西已停止并返回任务分发。');
      logClientEvent('ali_unified.find_voice_stopped', {
        transcript: rawTranscript,
        target
      });
      sendAliUnifiedSpeech(visualAssistantBaseExperiment
        ? '找东西已停止。'
        : '找东西已停止，已返回任务选择，可以说新任务。', 'say');
      return true;
    }
    logClientEvent('ali_unified.find_voice_ignored_while_active', {
      transcript: rawTranscript
    });
    return true;
  }
  if (activeMode === 'continuous_narration') {
    logClientEvent('ali_unified.continuous_voice_ignored_while_active', {
      transcript: rawTranscript
    });
    return true;
  }
  const prefixPendingAt = Number(visual.continuousNarrationPrefixPendingAt || 0);
  if (prefixPendingAt > 0) {
    visual.continuousNarrationPrefixPendingAt = 0;
    const prefixAgeMs = Date.now() - prefixPendingAt;
    if (hasStandaloneSingleWordStopSegment(rawTranscript)) {
      setActiveReminderStatus('已取消尚未补充完整的持续播报指令。');
      logClientEvent('ali_unified.continuous_prefix_cancelled', {
        transcript: rawTranscript,
        prefixAgeMs
      });
      sendAliUnifiedSpeech('已取消本次持续播报。', 'say');
      return true;
    }
    if (
      prefixAgeMs <= 30000
      && !strictSpecialMode
      && !requestedMechanicalMode
    ) {
      const combinedInstruction = `持续播报${rawTranscript}`;
      logClientEvent('ali_unified.continuous_prefix_completed', {
        transcript: rawTranscript,
        combinedInstruction,
        prefixAgeMs
      });
      return executeAliUnifiedStandaloneModule(
        'continuous_narration',
        combinedInstruction,
        { initialInstruction: true }
      );
    }
    logClientEvent('ali_unified.continuous_prefix_cleared_for_new_instruction', {
      transcript: rawTranscript,
      prefixAgeMs,
      strictSpecialMode,
      requestedMechanicalMode
    });
  }
  if (pending) {
    if (isUnifiedMechanicalConfirmation(rawTranscript, 'confirm')) {
      visual.unifiedPendingMode = null;
      logClientEvent('ali_unified.mechanical_confirm', {
        mode: pending.mode,
        instruction: pending.instruction
      });
      return executeAliUnifiedStandaloneModule(
        pending.mode,
        pending.instruction,
        { initialInstruction: true }
      );
    }
    if (isUnifiedMechanicalConfirmation(rawTranscript, 'reject')) {
      visual.unifiedPendingMode = null;
      if (pending.activeReminderWasSuspended) {
        reminder.suspendUntil = 0;
      }
      logClientEvent('ali_unified.mechanical_reject', {
        mode: pending.mode,
        instruction: pending.instruction
      });
      return sendAliUnifiedSpeech('已取消本次任务。', 'say');
    }
    clearUnifiedPendingCandidateForNewInstruction(visual, rawTranscript, 'ali_transcript');
    pending = null;
  }
  if (visual.unifiedOneShotQuestionInFlight) {
    logClientEvent('ali_unified.command_ignored_during_one_shot_question', {
      transcript: rawTranscript
    });
    return true;
  }
  if (
    strictSpecialMode === 'continuous_narration'
    && isBareContinuousNarrationPrefix(rawTranscript)
    && (!activeMode || activeMode === 'active_reminder')
  ) {
    visual.continuousNarrationPrefixPendingAt = Date.now();
    setActiveReminderStatus('已经听到“持续播报”，等待补充播报内容。');
    logClientEvent('ali_unified.continuous_prefix_waiting', {
      fromMode: activeMode,
      transcript: rawTranscript
    });
    sendAliUnifiedSpeech('请继续说需要播报什么，间隔多久。距离会在苹果端自动加入。', 'say');
    return true;
  }
  if (
    strictSpecialMode
    && !pending
    && (!activeMode || activeMode === 'active_reminder')
  ) {
    logClientEvent('ali_unified.visual_base_strict_handoff', {
      fromMode: activeMode,
      mode: strictSpecialMode,
      instruction: rawTranscript
    });
    return executeAliUnifiedStandaloneModule(
      strictSpecialMode,
      rawTranscript,
      { initialInstruction: true }
    );
  }
  if (
    requestedMechanicalMode === 'ordinary_question'
    && (
      pending
      || (activeMode && !(visualAssistantBaseExperiment && activeMode === 'active_reminder'))
    )
  ) {
    sendAliUnifiedSpeech(
      activeMode ? '请先结束当前任务。' : '请先确认或取消当前任务。',
      'say'
    );
    logClientEvent('ali_unified.one_shot_question_rejected', {
      transcript: rawTranscript,
      activeMode,
      pendingMode: pending?.mode || ''
    });
    return true;
  }
  if (
    (!activeMode || (visualAssistantBaseExperiment && activeMode === 'active_reminder'))
    && requestedMechanicalMode === 'ordinary_question'
  ) {
    if (!requestAliUnifiedOneShotQuestion(rawTranscript)) {
      setActiveReminderStatus('当前不能开始普通问答，请稍后重新问一次。');
      logClientEvent('ali_unified.one_shot_question_rejected', {
        transcript: rawTranscript,
        reason: 'request_not_started'
      });
    }
    return true;
  }
  const mechanicalMode = activeMode
    ? ''
    : requestedMechanicalMode;
  if (mechanicalMode === 'function_contract') {
    logClientEvent('ali_unified.mechanical_route', {
      mode: mechanicalMode,
      instruction: rawTranscript
    });
    return executeAliUnifiedStandaloneModule('active_reminder', rawTranscript, {
      initialInstruction: true
    });
  }
  const seq = (visual.unifiedClassifySeq || 0) + 1;
  visual.unifiedClassifySeq = seq;
  visual.unifiedClassifyInFlight = true;
  reminder.taskNormalizeInFlight = true;
  logClientEvent('ali_unified.classify_requested', {
    seq,
    transcript: rawTranscript,
    activeMode,
    pendingMode: pending?.mode || '',
    pendingSubject: pending?.subject || ''
  });
  try {
    const result = await apiPost('/api/unified-visual-task-classify', {
      transcript: rawTranscript,
      activeMode,
      pendingMode: '',
      pendingSubject: '',
      findTouchConfirmationPending: Boolean(
        activeMode === 'find_object' && visual.findTouchConfirmationPending
      )
    });
    if (
      appState.activeReminder !== reminder
      || appState.geminiReminder !== visual
      || visual.unifiedClassifySeq !== seq
    ) {
      return false;
    }
    visual.unifiedClassifyInFlight = false;
    reminder.taskNormalizeInFlight = false;
    logClientEvent('ali_unified.classify_result', {
      seq,
      transcript: rawTranscript,
      action: result.action || '',
      subject: result.subject || '',
      contractType: result.contractType || '',
      confidence: result.confidence ?? '',
      latencyMs: result.latencyMs ?? ''
    });

    if (mechanicalMode) {
      const expectedAction = mechanicalMode === 'find_object'
        ? 'propose_find_object'
        : 'propose_continuous_narration';
      if (
        result.action !== expectedAction
        || !result.subject
        || !result.confirmationSpeech
      ) {
        sendAliUnifiedSpeech(
          '你是要找东西、持续描述、设置提醒，还是问一下当前画面？',
          'say'
        );
        logClientEvent('ali_unified.mechanical_route_rejected', {
          mode: mechanicalMode,
          instruction: rawTranscript,
          action: result.action || ''
        });
        return true;
      }
    }
    if (result.action === 'ordinary') {
      if (
        visualAssistantBaseExperiment
        && (!activeMode || activeMode === 'active_reminder')
      ) {
        if (!requestAliUnifiedOneShotQuestion(rawTranscript)) {
          sendAliUnifiedSpeech('这次问题没有发出，请重新问一次。', 'say');
        }
        return true;
      }
      sendAliUnifiedSpeech(
        '你是要找东西、持续描述、设置提醒，还是问一下当前画面？',
        'say'
      );
      return true;
    }
    if (result.action === 'propose_find_object' || result.action === 'propose_continuous_narration') {
      const mode = result.action === 'propose_find_object'
        ? 'find_object'
        : 'continuous_narration';
      visual.unifiedPendingMode = null;
      logClientEvent('ali_unified.special_mode_proposal_blocked', {
        mode,
        transcript: rawTranscript,
        subject: result.subject || '',
        reason: 'exact_opening_not_present'
      });
      if (
        visualAssistantBaseExperiment
        && (!activeMode || activeMode === 'active_reminder')
      ) {
        if (!requestAliUnifiedOneShotQuestion(rawTranscript)) {
          sendAliUnifiedSpeech('这次问题没有发出，请重新问一次。', 'say');
        }
        return true;
      }
      sendAliUnifiedSpeech('请重新说一次。', 'say');
      return true;
    }
    if (result.action === 'confirm_pending') {
      visual.unifiedPendingMode = null;
      return sendAliUnifiedSpeech('当前没有等待确认的任务。', 'say');
    }
    if (result.action === 'reject_pending') {
      visual.unifiedPendingMode = null;
      sendAliUnifiedSpeech('已取消本次切换。', 'say');
      return true;
    }
    if (result.action === 'route_active_reminder') {
      if (activeMode && activeMode !== 'active_reminder') {
        sendAliUnifiedSpeech(
          activeMode === 'find_object'
            ? '请先完成或停止找东西。'
            : '请先结束当前任务。',
          'say'
        );
        return true;
      }
      return executeAliUnifiedStandaloneModule('active_reminder', rawTranscript, {
        initialInstruction: true
      });
    }
    if (result.action === 'update_find_object') {
      return executeAliUnifiedStandaloneModule('find_object', rawTranscript);
    }
    if (result.action === 'update_continuous_narration') {
      return executeAliUnifiedStandaloneModule('continuous_narration', rawTranscript);
    }
    if (result.action === 'complete_find_object') {
      if (activeMode !== 'find_object' || !visual.findTarget || !visual.findTouchConfirmationPending) {
        sendAliUnifiedSpeech('当前没有等待确认的触摸结果。', 'say');
        return true;
      }
      return executeAliUnifiedStandaloneModule('find_object', rawTranscript);
    }
    if (result.action === 'resume_find_object') {
      if (activeMode !== 'find_object' || !visual.findTarget || !visual.findTouchConfirmationPending) {
        sendAliUnifiedSpeech('当前没有等待确认的触摸结果。', 'say');
        return true;
      }
      return executeAliUnifiedStandaloneModule('find_object', rawTranscript);
    }
    if (result.action === 'cancel_current') {
      if (activeMode === 'find_object' || activeMode === 'continuous_narration') {
        return executeAliUnifiedStandaloneModule(activeMode, rawTranscript);
      }
      returnAliUnifiedToDistributor('active_user_cancelled');
      setActiveReminderStatus(visualAssistantBaseExperiment
        ? '主动提醒已停止，视觉助手底座继续运行。'
        : '主动提醒已停止并返回任务分发。');
      sendAliUnifiedSpeech(visualAssistantBaseExperiment
        ? '主动提醒已停止。'
        : '主动提醒已结束，已返回任务选择，可以说新任务。', 'say');
      return true;
    }
    return false;
  } catch (error) {
    if (
      appState.activeReminder === reminder
      && appState.geminiReminder === visual
      && visual.unifiedClassifySeq === seq
    ) {
      visual.unifiedClassifyInFlight = false;
      reminder.taskNormalizeInFlight = false;
    }
    logClientEvent('ali_unified.classify_failed', {
      seq,
      transcript: rawTranscript,
      error: error.message
    });
    setActiveReminderStatus(`统一入口分类失败：${error.message}`);
    sendAliUnifiedSpeech('这次没有听明白，请重新说一次。', 'say');
    return false;
  }
}

function updateActiveReminderTaskFromTranscript(transcript) {
  const reminder = appState.activeReminder;
  if (!reminder) {
    return false;
  }
  if (isAliUnifiedHostSession(reminder)) {
    handleAliUnifiedTranscript(transcript);
    return true;
  }
  logClientEvent('active_reminder.transcript_received', {
    transcript,
    mode: reminder.mode || '',
    pendingMessage: reminder.pendingMessage || '',
    awaitingResponse: Boolean(reminder.awaitingResponse),
      assistantPlaybackActive: isAssistantPlaybackActive(appState.realtime)
  });
  const compactTranscript = String(transcript || '').replace(/\s+/g, '');
  if (isLikelyReminderEchoTranscript(compactTranscript)) {
    logClientEvent('active_reminder.task_echo_ignored', { transcript });
    return true;
  }
  if (
    reminder.mode === 'rtc'
    && (reminder.rtcPollInProgress || reminder.awaitingResponse || isAssistantPlaybackActive(appState.realtime))
  ) {
    logClientEvent('active_reminder.task_ignored_during_rtc_response', {
      responseInProgress: Boolean(appState.realtime?.responseInProgress),
      assistantPlaybackActive: isAssistantPlaybackActive(appState.realtime),
      rtcPollInProgress: Boolean(reminder.rtcPollInProgress),
      awaitingResponse: Boolean(reminder.awaitingResponse)
    });
    return true;
  }
  const shouldUseModelTaskSetup = isSpeedLogicMode(reminder.mode);
  const taskTranscript = transcript;
  if (maybeDelegateSpeedReminderTaskToModel(taskTranscript)) {
    return true;
  }
  if (shouldUseModelTaskSetup) {
    logClientEvent('active_reminder.speed_direct_task_blocked', {
      mode: reminder.mode || '',
      reason: 'confirmation_output_required',
      transcript: taskTranscript
    });
    return false;
  }
  const instruction = extractActiveReminderInstruction(taskTranscript);
  if (!instruction) {
    return false;
  }
  return setActiveReminderTaskFromInstruction(instruction, {
    source: 'transcript',
    inputTranscript: taskTranscript
  });
}

function maybeConfirmSpeedActiveReminderTask(reminder, task) {
  if (!reminder || !isSpeedLogicMode(reminder.mode) || reminder.speedConfirmedTaskKey === task) {
    return;
  }
  reminder.speedConfirmedTaskKey = task;
  reminder.pendingMessage = 'speed_task_confirm';
  reminder.pendingTask = task;
  reminder.awaitingResponse = false;
  reminder.speedResponseCanceled = false;
  cancelSpeedTaskSetupResponse('speed task confirmation');
  maybeRequestActiveReminderResponse();
  clearRealtimeManualInputBuffer('speed_task_confirmation_queued');
}

function cancelSpeedTaskSetupResponse(reason) {
  const realtime = appState.realtime;
  if (!realtime || !isSpeedLogicMode(appState.activeReminder?.mode)) {
    return;
  }
  const hadResponse = Boolean(realtime.responseInProgress || isAssistantPlaybackActive(realtime));
  if (realtime.player) {
    realtime.player.reset('speed_task_confirmation_queued');
  }
  if (hadResponse) {
    sendRealtimeEvent({ type: 'response.cancel' });
  }
  realtime.responseInProgress = false;
  realtime.assistantPlaybackActive = false;
  realtime.assistantPlaybackUntil = 0;
  appState.latestAssistantText = '';
  restoreVadAfterAssistant(100);
  logClientEvent('active_reminder.speed_task_response_suppressed', {
    reason,
    hadResponse
  });
}

function maybeRequestActiveReminderResponse() {
  const reminder = appState.activeReminder;
  const realtime = appState.realtime;
  if (!reminder?.pendingMessage || reminder.awaitingResponse || !realtime?.isReady) {
    if (reminder?.pendingMessage) {
      logClientEvent('active_reminder.rtc_not_ready', {
        mode: realtime?.mode || '',
        isReady: Boolean(realtime?.isReady),
        awaitingResponse: Boolean(reminder?.awaitingResponse)
      });
    }
    return;
  }
  if (realtime.responseInProgress || isAssistantPlaybackActive(realtime) || isRealtimeResponseSettling(realtime)) {
    if (
      isSpeedLogicMode(reminder.mode)
      && reminder.pendingMessage === 'speed_trigger'
      && (realtime.responseInProgress || isAssistantPlaybackActive(realtime))
    ) {
      cancelSpeedTaskSetupResponse('speed trigger preempts busy response');
    } else {
    setActiveReminderStatus('主动提醒已触发：等待当前汇演回答结束后播报。');
    logClientEvent('active_reminder.rtc_waiting', {
      mode: realtime.mode,
      responseInProgress: Boolean(realtime.responseInProgress),
      assistantPlaybackActive: isAssistantPlaybackActive(realtime),
      responseSettling: isRealtimeResponseSettling(realtime),
      settleRemainingMs: getRealtimeResponseSettleRemainingMs(realtime)
    });
    if (reminder.mode === 'rtc') {
      logClientEvent('rtc_active_reminder.alert_dropped_busy', {
        alertCount: reminder.alertCount,
        task: reminder.pendingTask || ''
      });
      clearActiveReminderPendingResponse();
      return;
    }
    scheduleActiveReminderResponseRetry(reminder);
    return;
    }
  }

  if (reminder.responseRetryTimer) {
    clearTimeout(reminder.responseRetryTimer);
    reminder.responseRetryTimer = null;
  }
  reminder.awaitingResponse = true;
  if (isSpeedLogicMode(reminder.mode)) {
    reminder.speedResponseCanceled = false;
  }
  if (reminder.mode === 'rtc') {
    reminder.rtcResponseCanceled = false;
  }
  updateRealtimeSession({
    reason: 'active reminder alert',
    force: true
  });
  realtime.responseInProgress = true;
  const responseInstructions = buildRealtimeInstructions();
  const responseEvent = {
    type: 'response.create',
    response: {
      modalities: ['text', 'audio'],
      instructions: responseInstructions
    }
  };
  sendRealtimeEvent(responseEvent);
  logClientEvent('active_reminder.rtc_response_create', {
    mode: realtime.mode,
    alertCount: reminder.alertCount,
    eventChannelOpen: realtime.eventChannel?.readyState || '',
    socketOpen: realtime.socket?.readyState === WebSocket.OPEN,
    pendingMessage: reminder.pendingMessage || '',
    pendingTask: reminder.pendingTask || '',
    pendingSpeechText: reminder.pendingSpeechText || '',
    responseInstructions
  });
  setActiveReminderStatus('主动提醒已交给汇演播报。');
}

function scheduleActiveReminderResponseRetry(reminder) {
  if (!reminder || reminder.responseRetryTimer) {
    return;
  }
  const delayMs = isSpeedLogicMode(reminder.mode) ? 300 : 700;
  reminder.responseRetryTimer = window.setTimeout(() => {
    if (appState.activeReminder !== reminder) {
      return;
    }
    reminder.responseRetryTimer = null;
    maybeRequestActiveReminderResponse();
  }, delayMs);
}

function clearActiveReminderPendingResponse() {
  const reminder = appState.activeReminder;
  if (
    !reminder?.awaitingResponse
    && !reminder?.pendingMessage
    && !reminder?.pendingTask
    && !reminder?.pendingSpeechText
    && !reminder?.responseRetryTimer
    && !reminder?.rtcPollInProgress
  ) {
    return;
  }
  const pendingMessage = reminder.pendingMessage;
  if (reminder.responseRetryTimer) {
    clearTimeout(reminder.responseRetryTimer);
    reminder.responseRetryTimer = null;
  }
  reminder.pendingMessage = '';
  reminder.pendingTask = '';
  reminder.pendingSpeechText = '';
  reminder.awaitingResponse = false;
  reminder.rtcPollInProgress = false;
  reminder.rtcPollText = '';
  reminder.suspendUntil = 0;
  if (pendingMessage === 'speed_trigger') {
    reminder.speedPendingAlertTaskKey = '';
    reminder.speedPendingAlertState = '';
    reminder.speedPendingAlertSnapshot = null;
    reminder.pendingAlertHadAudio = false;
    reminder.pendingAlertHadText = false;
  }
  if (pendingMessage === 'speed_trigger' || pendingMessage === 'speed_task_confirm') {
    reminder.speedResponseCanceled = false;
  }
  if (reminder.mode === 'rtc' && pendingMessage) {
    reminder.rtcPendingAlertTaskKey = '';
    reminder.rtcResponseCanceled = false;
  }
}

function captureReminderFrame(options = {}) {
  const videoWidth = elements.camera.videoWidth || 1280;
  const videoHeight = elements.camera.videoHeight || 720;
  const maxWidth = options.maxWidth || 320;
  const quality = options.quality || 0.45;
  const scale = Math.min(1, maxWidth / videoWidth);
  const width = Math.round(videoWidth * scale);
  const height = Math.round(videoHeight * scale);
  elements.videoFrame.width = width;
  elements.videoFrame.height = height;
  const context = elements.videoFrame.getContext('2d');
  context.drawImage(elements.camera, 0, 0, width, height);
  return elements.videoFrame.toDataURL('image/jpeg', quality);
}

function setActiveReminderStatus(text) {
  if (elements.activeReminderStatus) {
    elements.activeReminderStatus.textContent = text;
  }
}

async function getOutboundVideoStats(peer) {
  const stats = await peer.getStats();
  let outboundVideo = null;
  stats.forEach((report) => {
    if (report.type === 'outbound-rtp' && report.kind === 'video') {
      outboundVideo = report;
    }
  });
  if (!outboundVideo) {
    throw new Error('没有找到 outbound-rtp video 统计。');
  }
  return {
    browserDrawnFrames: appState.videoFrameCount,
    framesSent: outboundVideo.framesSent ?? null,
    bytesSent: outboundVideo.bytesSent ?? null,
    packetsSent: outboundVideo.packetsSent ?? null,
    timestamp: outboundVideo.timestamp
  };
}

function numberDelta(after, before) {
  if (typeof after !== 'number' || typeof before !== 'number') {
    return 0;
  }
  return Math.max(0, after - before);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatCurrentDeviceTimeForPrompt(date = new Date()) {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const pad = (value) => String(value).padStart(2, '0');
  return [
    `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`,
    weekdays[date.getDay()],
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  ].join(' ');
}

function createLowFpsVideoTrack(sourceTrack) {
  const sourceStream = new MediaStream([sourceTrack]);
  const video = document.createElement('video');
  video.srcObject = sourceStream;
  video.muted = true;
  video.playsInline = true;
  video.play();

  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const context = canvas.getContext('2d');
  const drawTimer = setInterval(() => {
    if (video.readyState >= 2) {
      const scale = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
      const width = Math.round(video.videoWidth * scale);
      const height = Math.round(video.videoHeight * scale);
      const x = Math.round((canvas.width - width) / 2);
      const y = Math.round((canvas.height - height) / 2);
      context.fillStyle = '#111827';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(video, x, y, width, height);
      appState.videoFrameCount += 1;
    }
  }, VIDEO_TRACK_DRAW_INTERVAL_MS);

  const track = canvas.captureStream(1).getVideoTracks()[0];
  track._drawTimer = drawTimer;
  return track;
}

function buildRealtimeInstructions() {
  const hasNavigationContext = Boolean(appState.navigationFollow?.route);
  const currentDeviceTime = formatCurrentDeviceTimeForPrompt();
  const activeReminderMessage = appState.activeReminder?.pendingMessage || '';
  const activeReminderTask = appState.activeReminder?.pendingTask || '';
  const activeReminderMode = appState.activeReminder?.mode || '';
  const activeReminderSpeechText = appState.activeReminder?.pendingSpeechText || '';
  const activeReminderTaskSetupTranscript = appState.activeReminder?.pendingTaskSetupTranscript || '';
  const aliUnifiedHost = isAliUnifiedHostSession(appState.activeReminder);
  const aliCheapDirectContract = Boolean(
    aliUnifiedHost && appState.realtime?.directFunctionContractExperiment
  );
  const aliCheapContractConfirmation = aliCheapDirectContract
    ? appState.realtime?.aliCheapContractConfirmation
    : null;
  const aliUnifiedOrdinaryQuestion = aliUnifiedHost
    ? String(appState.geminiReminder?.unifiedOrdinaryQuestion || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 500)
    : '';
  const activeReminderAlertMessage = activeReminderMessage === 'speed_trigger'
    ? (activeReminderSpeechText || buildActiveReminderAlertMessage(activeReminderTask))
    : '';
  const activeReminderConfirmationMessage = activeReminderMessage === 'speed_task_confirm'
    ? buildActiveReminderConfirmationMessage(activeReminderTask)
    : '';
  const speedVisualAnswerMessage = activeReminderMessage === 'speed_visual_answer'
    ? activeReminderSpeechText
    : '';
  const isRtcActiveReminder = appState.activeReminder?.mode === 'rtc';
  const isRtcActiveReminderPoll = isRtcActiveReminder && appState.activeReminder?.rtcPollInProgress;
  const routeState = hasNavigationContext ? JSON.stringify({
    route: appState.route,
    follow: {
      currentStepId: appState.navigationFollow?.currentStepId || '',
      route: appState.navigationFollow?.route || null
    }
  }, null, 2) : '';
  const baseInstructions = [
    hasNavigationContext
      ? '当前开启了导航上下文。只在用户明确提问时结合导航状态回答。'
      : '当前没有开启导航。不要引用路线、终点、路口、门牌、站点或任何历史导航上下文。',
    `当前设备时间：${currentDeviceTime}。用户问日期、星期或时间时，按这个回答。`,
    '连接刚建立时不要主动寒暄、不要自我介绍、不要主动称呼用户。',
    '没有听到用户明确提问或任务指令时保持安静。',
    hasNavigationContext
      ? ''
      : '如果听到手机读屏、系统朗读、页面播报或导航播报声，不要把它当成用户提问。',
    '所有回复和内部播报都使用自然、清晰的中国大陆普通话，语气平稳，音量均匀，语速适中。正常说完整句子，不使用夸张、激动、撒娇、表演式语气，不故意结巴、重复字词或拖长停顿；普通回答、任务确认和提醒结果都遵守。',
    '回答必须简短。',
    '不要编造画面中没有看到或听到的信息。',
    isRtcActiveReminderPoll
      ? `当前处于 WebSocket Manual 实验主动提醒的内部判断轮。只按当前实时指令判断：${activeReminderTask || '还没有实时指令'}。你需要基于刚刚提交的静默视频上下文判断。必须只输出一个字符：画面明确满足指令输出 Y；不满足、不确定、没看清、不是当前任务，全部输出 N。不要输出语气词、解释、标点、寒暄或画面描述。`
      : '',
    isRtcActiveReminder && !isRtcActiveReminderPoll
      ? `当前处于 WebSocket Manual 实验主动提醒模式。只按当前实时指令判断：${activeReminderTask || '还没有实时指令'}。没有内部判断请求时不要主动描述画面。`
      : '',
    aliCheapDirectContract && aliCheapContractConfirmation
      ? `应用层已经机械校验并接收了本轮主动提醒合同。用户原话：“${aliCheapContractConfirmation.transcript || ''}”。合同条件：“${aliCheapContractConfirmation.condition || ''}”。现在只说一句简短自然的确认句，说明以后合同条件成立时会提醒用户。不要调用工具，不要判断当前画面，不要说现在已经看到，不要提前播报提醒结果，不要追加解释。`
      : '',
    aliCheapDirectContract && activeReminderTaskSetupTranscript
      ? `当前是阿里便宜声音实验版的合同决策轮。用户原话：“${activeReminderTaskSetupTranscript}”。先判断这句话是不是条件成立时主动通知的请求。用户明确要求条件成立时主动通知自己，就应提交主动提醒合同，不需要额外说时间限定词或使用固定句式。仅询问当前画面状态、位置或知识，以及仅投诉、明确拒绝或取消提醒，都不构成新增合同授权。用户明确条件通知时，不能因为当前画面已经满足、缺少确认句或模型先说了结果就改成普通问答；没有用户通知请求时也不能自行建立。如果是主动提醒，必须先调用且只调用 ${GEMINI_REMINDER_CONTRACT_TOOL_NAME} 提交完整结构化合同，在应用层返回 accepted 之前绝对不要说确认句，也不要判断当前画面是否已经成立。如果只是询问当前画面、知识问答或普通对话，不要调用工具，直接简短回答一轮；普通问答不得清空原主动提醒。找东西只认“帮我找／给我找”开场，持续播报只认“持续播报”开场，这两类由应用层独立处理，本轮不得用主动提醒合同代替。`
      : '',
    isSpeedLogicMode(activeReminderMode)
      && !aliCheapDirectContract
      && activeReminderTaskSetupTranscript
      ? `当前是${aliReminderLabel(activeReminderMode)}的发任务理解轮。用户刚才说：“${activeReminderTaskSetupTranscript}”。如果这句话是在设置主动提醒任务，包括三类：目标出现、明确终点达成、没有指定终点的任意前后变化。请只用自然口语确认何时提醒，不要判断现在是否已经发生。可以直接沿用用户说的动作或结果，不要朗读后台合同或技术词。只有没有指定任何终点时才按状态变化确认。本轮是提醒条件确认，不是结果播报：只说明条件成立时会提醒，不能说现在已经看到、已经完成，也不能用当前画面答案代替确认句；当前画面即使满足条件，也交给后台快筛在合同建立后判断。不得把看到改成碰到、把接近改成达到或添加用户未要求的条件。不要说没看到，不要追加解释。如果这句话明显只是普通问题，才按画面简短回答，不确认或建立提醒。`
      : '',
    aliUnifiedHost && aliUnifiedOrdinaryQuestion
      ? `当前是统一入口的一次性普通问答。用户本次只问：“${aliUnifiedOrdinaryQuestion}”。只结合当前最新实时画面简短回答这一个问题；忽略此前普通问答的内容，不引用上一次问题或答案。不要确认，不调用或建立任何任务，不持续观察，不启动计时器，不询问模式。回答一次后立即结束本次回答。`
      : '',
    aliUnifiedHost
      && !activeReminderMessage
      && !aliUnifiedOrdinaryQuestion
      && !activeReminderTaskSetupTranscript
      ? (appState.geminiReminder?.visualAssistantBaseExperiment
        ? (aliCheapDirectContract
          ? `当前处于阿里便宜声音合同直签实验版。没有用户提问时保持静默；普通问答只回答一次且不清空现有主动提醒。只有用户确实要求建立或替换主动提醒时才调用 ${GEMINI_REMINDER_CONTRACT_TOOL_NAME}；应用层接收合同后再念确认句，真正触发仍由后台图片快筛机械执行。找东西和持续播报由应用层独立交接，不得自行假装进入。`
          : '当前处于视觉助手底座。没有用户提问时保持静默；用户普通提问时只回答一次且不清空现有主动提醒；用户设置主动提醒时只负责自然确认，真正触发由后台快筛决定。找东西和持续播报由应用层独立交接，不得自行假装进入。')
        : '当前处于统一任务选择，必须保持静默等待应用层分发。不得自行确认任务已经开始，不得自行描述画面；任务类别不明确时只能询问：“你是要找东西、持续描述、设置提醒，还是问一下当前画面？”')
      : '',
    isSpeedLogicMode(activeReminderMode)
      && !aliUnifiedHost
      && !activeReminderMessage
      && !activeReminderTaskSetupTranscript
      ? `当前处于${aliReminderLabel(activeReminderMode)}模式。后台 3.6 负责主动提醒触发判断。你有发任务理解权限：用户设置目标出现、明确终点达成或无指定终点的状态变化任务时，先用自然口语确认何时提醒，可以沿用用户说法，不要说技术合同。不要自行主动提醒；真正提醒必须等待后台快筛结果。用户明确问画面问题时，可以根据实时视频上下文简短回答。`
      : '',
    activeReminderMessage === 'speed_task_confirm'
      ? `${aliReminderLabel(activeReminderMode)}任务刚刚设置。请立刻逐字说：“${activeReminderConfirmationMessage}”只能说这一句。不要判断现在是否看到，不要说没看到，不要追加解释。`
      : '',
    activeReminderMessage === 'speed_trigger' && canAliReminderUseRealtimeVisualExpression(activeReminderMode)
      ? `当前是主动提醒结果播报。应用层已经决定现在需要开口，后台结构化快筛结果是：“${activeReminderAlertMessage}”。不要重新判断是否该提醒；可以结合当前实时画面补充位置、方向、程度或更自然的表达，但不能推翻快筛结果，不能新增结果里没有命中的目标。只说一句自然、短、可执行的中文提醒，不要解释流程，不要说“根据结果”。`
      : '',
    activeReminderMessage === 'speed_trigger' && !canAliReminderUseRealtimeVisualExpression(activeReminderMode)
      ? `当前是主动提醒播报。后台快筛给出的短场景提醒是：“${activeReminderAlertMessage}”。请自然读出这句短提醒。不要判断画面，不要输出 Y/N，不要只说语气词，不要解释。`
      : '',
    activeReminderMessage === 'speed_visual_answer'
      ? `当前是极速视觉追问播报。后台视觉模型已经根据当前画面回答：“${speedVisualAnswerMessage}”。请自然读出这段答案，可以按原意略微口语化。不要自行判断画面，不要说自己看不到画面，不要追加解释。`
      : '',
    activeReminderMessage === 'ali_unified_say'
      ? `当前是纯阿里实时慧眼的应用层固定播报。请立刻逐字说：“${activeReminderSpeechText}”只能说这一句。不要判断画面，不要改写，不要追加解释。`
      : '',
    activeReminderMessage === 'ali_unified_narrate'
      ? `当前是纯阿里实时慧眼的持续播报轮。应用层刚刚提交了最新一张现场图片，播报要求是：“${activeReminderSpeechText}”。只根据这张最新图片和要求说一句精炼、自然、可执行的中文，不要提到提示词、图片、模型或后台，不要寒暄，不要复述要求。每轮只说一句约二十个汉字的中文，只保留最重要的一件事。有可靠目标距离时，把方位和大约几米放在句首，例如“前方约两米有一张桌子”；省略“距离”二字，不把最近障碍距离当成目标距离。没有可靠距离就省略米数，不猜测，不重复重点，不寒暄。`
      : '',
    activeReminderMessage && !isSpeedLogicMode(activeReminderMode)
      ? `主动提醒快筛刚刚触发。当前任务：${activeReminderTask || '未指定'}。如果现在请求你回应，请只说：“${activeReminderMessage}”不要解释，不要追加画面描述。`
      : '',
    hasNavigationContext ? `当前确认目标：${elements.visionQuestion.value}` : '',
    hasNavigationContext ? `当前导航状态：${routeState}` : ''
  ];
  return baseInstructions.filter(Boolean).join('\n');
}

function updateVisionOutput(text) {
  elements.visionOutput.textContent = text;
}

function appendVisionLog(text) {
  const current = elements.visionOutput.textContent || '';
  const next = current && current !== '还没有现场确认结果。'
    ? `${current}\n${text}`
    : text;
  elements.visionOutput.textContent = next;
  elements.visionOutput.scrollTop = elements.visionOutput.scrollHeight;
}

function resetRealtimeDebugLog() {
  appState.realtimeDebugLog = [];
  appState.latestAssistantText = '';
  appState.lastVisionText = '';
  appState.latestUserTranscript = '';
  appState.videoFrameCount = 0;
  recordRealtimeDebug('session.start', {
    page: location.href,
    userAgent: navigator.userAgent,
    time: new Date().toISOString()
  });
}

function recordRealtimeDebug(type, detail) {
  const entry = {
    time: new Date().toISOString(),
    type,
    detail
  };
  appState.realtimeDebugLog.push(entry);
  if (appState.realtimeDebugLog.length > 500) {
    appState.realtimeDebugLog.shift();
  }
}

function summarizeRealtimeEvent(message) {
  const summary = { type: message.type || 'unknown' };
  if (message.event_id) {
    summary.eventId = message.event_id;
  }
  if (message.type === 'response.audio_transcript.delta' || message.type === 'response.text.delta') {
    summary.delta = message.delta || '';
  } else if (message.type === 'response.audio_transcript.done') {
    summary.transcript = message.transcript || '';
  } else if (message.type === 'response.text.done') {
    summary.text = message.text || '';
  } else if (message.type === 'conversation.item.input_audio_transcription.completed') {
    summary.transcript = message.transcript || '';
  } else if (message.type === 'response.function_call_arguments.done') {
    summary.name = message.name || '';
    summary.callId = message.call_id || '';
    summary.arguments = message.arguments || '';
  } else if (message.type === 'error') {
    summary.error = message.error?.message || message.error || message;
  } else if (message.type?.startsWith('response.')) {
    summary.responseId = message.response_id || message.response?.id || '';
  }
  return summary;
}

function summarizeSdp(sdp) {
  const text = String(sdp || '');
  return {
    hasAudio: /\nm=audio /i.test(`\n${text}`),
    hasVideo: /\nm=video /i.test(`\n${text}`),
    hasDataChannel: /\nm=application /i.test(`\n${text}`),
    length: text.length
  };
}

async function copyRealtimeDebugLog() {
  const payload = [
    '实时慧眼本轮日志',
    `导出时间：${new Date().toISOString()}`,
    `摄像头：${JSON.stringify(appState.cameraInfo || {}, null, 2)}`,
    `页面确认结果：${elements.visionOutput.textContent || ''}`,
    '事件日志：',
    JSON.stringify(appState.realtimeDebugLog, null, 2)
  ].join('\n\n');

  try {
    await navigator.clipboard.writeText(payload);
    appendVisionLog('本轮日志已复制到剪贴板。');
  } catch {
    appendVisionLog('复制本轮日志失败：浏览器没有开放剪贴板权限。请长按选择“确认结果”区域里的文本，或换电脑浏览器导出。');
  }
}

function initializeClientApiKey() {
  const saved = localStorage.getItem(CLIENT_API_KEY_STORAGE) || '';
  if (saved && elements.clientApiKey) {
    elements.clientApiKey.value = saved;
  }
  const savedEndpoint = localStorage.getItem(CLIENT_WEBRTC_ENDPOINT_STORAGE) || '';
  if (savedEndpoint && elements.clientWebRtcEndpoint) {
    elements.clientWebRtcEndpoint.value = savedEndpoint;
  }
}

function readClientApiKey() {
  return (elements.clientApiKey?.value || '').trim();
}

function readClientWebRtcEndpoint() {
  return (elements.clientWebRtcEndpoint?.value || '').trim();
}

function shouldUseClientRealtimeOverride() {
  const config = appState.realtimeConfig;
  if (elements.advancedRealtimeConfig?.open) {
    return true;
  }
  return !config?.serverApiKeyConfigured || !config?.webRtcConfigured;
}

function getClientApiKey() {
  return shouldUseClientRealtimeOverride() ? readClientApiKey() : '';
}

function getClientWebRtcEndpoint() {
  return shouldUseClientRealtimeOverride() ? readClientWebRtcEndpoint() : '';
}

function getRealtimeSdpHeaders() {
  const headers = { 'Content-Type': 'application/sdp' };
  const apiKey = getClientApiKey();
  const endpoint = getClientWebRtcEndpoint();
  if (apiKey) {
    headers['X-Client-DashScope-Key'] = apiKey;
  }
  if (endpoint) {
    headers['X-Client-Bailian-Endpoint'] = endpoint;
  }
  return headers;
}

function updateRealtimeConfigStatus(config) {
  if (!elements.realtimeConfigStatus) {
    return;
  }
  if (!config) {
    elements.realtimeConfigStatus.textContent = '暂时无法确认百炼后台配置。';
    elements.realtimeConfigStatus.hidden = false;
    return;
  }
  if (config.serverApiKeyConfigured || config.webSocketConfigured) {
    elements.realtimeConfigStatus.textContent = config.webRtcConfigured
      ? ''
      : 'WebRTC Endpoint 缺失，实时慧眼不可用。';
    elements.realtimeConfigStatus.hidden = Boolean(config.webRtcConfigured);
    return;
  }
  if (!config.serverApiKeyConfigured && !config.webSocketConfigured) {
    elements.realtimeConfigStatus.textContent = '百炼后台还没有配置 Key。需要展开高级调试临时填写 DashScope Key。';
    elements.realtimeConfigStatus.hidden = false;
    return;
  }
  elements.realtimeConfigStatus.textContent = '百炼后台配置不完整，请展开高级调试检查 Key。';
  elements.realtimeConfigStatus.hidden = false;
}

function saveClientApiKey() {
  const apiKey = readClientApiKey();
  const endpoint = readClientWebRtcEndpoint();
  if (!apiKey && !endpoint) {
    appendVisionLog('百炼 Key 和 Endpoint 都为空，没有保存。');
    return;
  }
  if (apiKey) {
    localStorage.setItem(CLIENT_API_KEY_STORAGE, apiKey);
  }
  if (endpoint) {
    localStorage.setItem(CLIENT_WEBRTC_ENDPOINT_STORAGE, endpoint);
  }
  appendVisionLog('已保存到当前手机浏览器。为安全起见，不会在页面上朗读 Key 或 Endpoint 内容。');
}

function clearClientApiKey() {
  localStorage.removeItem(CLIENT_API_KEY_STORAGE);
  localStorage.removeItem(CLIENT_WEBRTC_ENDPOINT_STORAGE);
  if (elements.clientApiKey) {
    elements.clientApiKey.value = '';
  }
  if (elements.clientWebRtcEndpoint) {
    elements.clientWebRtcEndpoint.value = '';
  }
  appendVisionLog('已清除当前手机浏览器保存的百炼 Key 和 Endpoint。');
}

async function apiGet(path) {
  await window.ZzyaiClientAccess?.ready;
  const response = await fetch(path, { headers: { 'Accept': 'application/json' } });
  return readApiResponse(response);
}

async function apiPost(path, body) {
  await window.ZzyaiClientAccess?.ready;
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  return readApiResponse(response);
}

function logClientEvent(name, details = {}) {
  const reminder = appState.geminiReminder || appState.activeReminder;
  const tracedDetails = {
    ...(reminder?.reminderSessionId && details.reminderSessionId === undefined
      ? { reminderSessionId: reminder.reminderSessionId }
      : {}),
    ...(reminder && details.activeTaskSeq === undefined
      ? { activeTaskSeq: reminder.activeTaskSeq || 0 }
      : {}),
    ...details
  };
  fetch('/api/client-log', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name,
      details: tracedDetails,
      timestamp: Date.now()
    }),
    keepalive: true
  }).catch(() => {});
}

function createReminderTraceId(prefix = 'reminder') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function readApiResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

function setPoiStatus(text) {
  if (elements.poiStatus) {
    elements.poiStatus.textContent = text;
  }
}

function extractCoordinate(text) {
  const match = String(text || '').match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  return match ? `${match[1]},${match[2]}` : '';
}

function speak(text, options = {}) {
  const content = String(text || '').replace(/\s+/g, ' ').trim();
  if (!content) {
    return false;
  }
  if (!window.speechSynthesis) {
    options.onError?.({ error: 'speech_synthesis_unavailable' });
    return false;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(content.slice(0, 900));
  utterance.lang = 'zh-CN';
  utterance.rate = 0.95;
  utterance.pitch = 1;
  utterance.volume = 1;
  enterAssistantPlaybackVadGuard('local speech synthesis');
  utterance.onstart = () => {
    if (options.debugLabel) {
      logClientEvent(`${options.debugLabel}.started`, {
        text: content.slice(0, 80)
      });
    }
    options.onStart?.();
  };
  utterance.onend = () => {
    restoreVadAfterAssistant(700);
    if (options.debugLabel) {
      logClientEvent(`${options.debugLabel}.ended`, {});
    }
    options.onEnd?.();
  };
  utterance.onerror = (event) => {
    restoreVadAfterAssistant(700);
    if (options.debugLabel) {
      logClientEvent(`${options.debugLabel}.error`, {
        error: event.error || 'unknown'
      });
    }
    options.onError?.(event);
  };
  try {
    window.speechSynthesis.speak(utterance);
    return true;
  } catch (error) {
    restoreVadAfterAssistant(700);
    if (options.debugLabel) {
      logClientEvent(`${options.debugLabel}.failed`, {
        error: error.message
      });
    }
    options.onError?.({ error: error.message });
    return false;
  }
}

function firstSpeechParagraph(text) {
  return String(text || '').split(/\n\s*\n/).slice(0, 3).join('。');
}

function downsampleFloat32(input, inputRate, outputRate) {
  if (inputRate === outputRate) {
    return input;
  }
  const ratio = inputRate / outputRate;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.floor((i + 1) * ratio);
    let sum = 0;
    let count = 0;
    for (let j = start; j < end && j < input.length; j += 1) {
      sum += input[j];
      count += 1;
    }
    output[i] = count > 0 ? sum / count : 0;
  }
  return output;
}

function floatToPcm16(input) {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output;
}

function concatInt16(chunks, totalLength) {
  const output = new Int16Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function uint8ToBase64(bytes) {
  let binary = '';
  const size = 0x8000;
  for (let i = 0; i < bytes.length; i += size) {
    binary += String.fromCharCode(...bytes.subarray(i, i + size));
  }
  return btoa(binary);
}

function base64ToInt16(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Int16Array(bytes.buffer);
}

function waitForIceGatheringComplete(peer) {
  if (peer.iceGatheringState === 'complete') {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const check = () => {
      if (peer.iceGatheringState === 'complete') {
        peer.removeEventListener('icegatheringstatechange', check);
        resolve();
      }
    };
    peer.addEventListener('icegatheringstatechange', check);
  });
}

class PcmPlayer {
  constructor(audioContext, sampleRate, onPlaybackScheduled = null, onPlaybackIdle = null, monitorChannel = '') {
    this.audioContext = audioContext;
    this.sampleRate = sampleRate;
    this.nextStartTime = 0;
    this.sources = [];
    this.onPlaybackScheduled = onPlaybackScheduled;
    this.onPlaybackIdle = onPlaybackIdle;
    this.generation = 0;
    this.monitorChannel = monitorChannel;
    this.monitorBurstId = 0;
    this.monitorBurstQueued = 0;
    this.monitorBurstEnded = 0;
    this.monitorBurstDurationMs = 0;
    this.monitorBurstStartedAt = 0;
    this.monitorTotalQueued = 0;
    this.monitorTotalDurationMs = 0;
    this.monitorQueuedAtLastModelDone = 0;
    this.audioContext.addEventListener('statechange', () => {
      if (this.sources.length > 0) {
        this.logPlaybackEvent('audio_playback.context_state');
      }
    });
  }

  logPlaybackEvent(name, details = {}) {
    if (!this.monitorChannel) {
      return;
    }
    const owner = this.monitorChannel === 'gemini_live'
      ? appState.geminiReminder
      : appState.activeReminder;
    try {
      logClientEvent(name, {
        reminderSessionId: owner?.reminderSessionId || '',
        activeTaskSeq: owner?.activeTaskSeq || 0,
        channel: this.monitorChannel,
        burstId: this.monitorBurstId,
        queuedChunks: this.monitorBurstQueued,
        endedChunks: this.monitorBurstEnded,
        pendingChunks: this.monitorBurstQueued - this.monitorBurstEnded,
        queuedDurationMs: Math.round(this.monitorBurstDurationMs),
        queueRemainingMs: Math.max(0, Math.round((this.nextStartTime - this.audioContext.currentTime) * 1000)),
        outputAudioState: this.audioContext.state,
        outputAudioTime: this.audioContext.currentTime,
        activeSources: this.sources.length,
        ...details
      });
    } catch {
      // Diagnostics must not affect audio playback.
    }
  }

  logModelDone(textLength = 0) {
    this.logPlaybackEvent('audio_playback.model_done', {
      textLength,
      audioChunksSinceLastModelDone: this.monitorTotalQueued - this.monitorQueuedAtLastModelDone
    });
    this.monitorQueuedAtLastModelDone = this.monitorTotalQueued;
  }

  enqueue(base64) {
    const generation = this.generation;
    const pcm = base64ToInt16(base64);
    if (pcm.length === 0) {
      return 0;
    }
    if (this.sources.length === 0) {
      this.monitorBurstId += 1;
      this.monitorBurstQueued = 0;
      this.monitorBurstEnded = 0;
      this.monitorBurstDurationMs = 0;
      this.monitorBurstStartedAt = Date.now();
    }
    const audioBuffer = this.audioContext.createBuffer(1, pcm.length, this.sampleRate);
    const channel = audioBuffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i += 1) {
      channel[i] = pcm[i] / 32768;
    }

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);
    const startTime = Math.max(this.audioContext.currentTime + 0.04, this.nextStartTime);
    source.start(startTime);
    this.nextStartTime = startTime + audioBuffer.duration;
    const scheduledEndAt = Date.now()
      + Math.max(0, (this.nextStartTime - this.audioContext.currentTime) * 1000);
    this.sources.push(source);
    this.monitorBurstQueued += 1;
    this.monitorTotalQueued += 1;
    this.monitorBurstDurationMs += audioBuffer.duration * 1000;
    this.monitorTotalDurationMs += audioBuffer.duration * 1000;
    if (this.monitorBurstQueued === 1) {
      this.logPlaybackEvent('audio_playback.queue_started');
    }
    if (this.onPlaybackScheduled) {
      this.onPlaybackScheduled(scheduledEndAt);
    }
    source.onended = () => {
      if (generation !== this.generation) {
        return;
      }
      this.monitorBurstEnded += 1;
      this.sources = this.sources.filter((item) => item !== source);
      if (this.sources.length === 0) {
        this.logPlaybackEvent('audio_playback.queue_drained', {
          elapsedMs: Date.now() - this.monitorBurstStartedAt
        });
      }
      if (this.sources.length === 0 && this.onPlaybackIdle) {
        this.onPlaybackIdle();
      }
    };
    return scheduledEndAt;
  }

  reset(reason = 'unspecified') {
    if (this.sources.length > 0) {
      this.logPlaybackEvent('audio_playback.queue_cleared', {
        reason,
        elapsedMs: Date.now() - this.monitorBurstStartedAt
      });
    }
    this.generation += 1;
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // The source may have already ended.
      }
    }
    this.sources = [];
    this.nextStartTime = this.audioContext.currentTime;
    if (this.onPlaybackIdle) {
      this.onPlaybackIdle();
    }
  }
}
