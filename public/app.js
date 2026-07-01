'use strict';

const AUDIO_INPUT_RATE = 16000;
const AUDIO_OUTPUT_RATE = 24000;
const AUDIO_SEND_BYTES = 3200;
const VIDEO_FRAME_INTERVAL_MS = 1000;
const VIDEO_TRACK_DRAW_INTERVAL_MS = 1000;
const SILENT_VIDEO_CHECK_MS = 10000;
const MANUAL_LOCAL_VAD_START_RMS = 0.018;
const MANUAL_LOCAL_VAD_END_RMS = 0.010;
const MANUAL_LOCAL_VAD_END_MS = 900;
const MANUAL_LOCAL_VAD_MIN_AUDIO_MS = 500;
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
  realtimeDebugLog: [],
  cameraInfo: null,
  videoFrameCount: 0,
  assistantMicMuteTimer: null,
  assistantVadRestoreTimer: null,
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
  advancedRealtimeConfig: document.querySelector('#advanced-realtime-config'),
  clientApiKey: document.querySelector('#client-api-key'),
  clientWebRtcEndpoint: document.querySelector('#client-webrtc-endpoint'),
  visionQuestion: document.querySelector('#vision-question'),
  strongEchoGuard: document.querySelector('#strong-echo-guard'),
  checkSilentVideo: document.querySelector('#check-silent-video'),
  commitSilentContext: document.querySelector('#commit-silent-context'),
  commitAndRespond: document.querySelector('#commit-and-respond'),
  copyRealtimeLog: document.querySelector('#copy-realtime-log'),
  startFollow: document.querySelector('#start-follow'),
  stopFollow: document.querySelector('#stop-follow')
};

document.querySelector('#use-location').addEventListener('click', useCurrentLocation);
document.querySelector('#search-origin').addEventListener('click', () => searchPoi('origin'));
document.querySelector('#search-destination').addEventListener('click', () => searchPoi('destination'));
document.querySelector('#plan-route').addEventListener('click', planRoute);
document.querySelector('#load-manual-route').addEventListener('click', loadManualRoute);
document.querySelector('#speak-route').addEventListener('click', () => speak(elements.routeOutput.textContent));
document.querySelector('#start-follow').addEventListener('click', startNavigationFollow);
document.querySelector('#stop-follow').addEventListener('click', stopNavigationFollow);
document.querySelector('#start-realtime').addEventListener('click', startRealtime);
document.querySelector('#send-context').addEventListener('click', sendRealtimeContext);
document.querySelector('#stop-realtime').addEventListener('click', stopRealtime);
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
    appState.realtimeConfig = {
      model: data.realtimeModel,
      voice: data.realtimeVoice,
      webSocketConfigured: data.realtimeWebSocketConfigured,
      webRtcConfigured: data.realtimeWebRtcConfigured,
      serverApiKeyConfigured: data.bailianConfigured,
      clientApiKeySupported: data.clientApiKeySupported
    };
    selectRecommendedRealtimeMode(appState.realtimeConfig);
    updateRealtimeConfigStatus(appState.realtimeConfig);
    const parts = [
      '后端已启动。',
      data.amapConfigured ? '高德 Key 已配置。' : '高德 Key 未配置，暂时不能真实规划路线。',
      data.bailianConfigured ? '服务端百炼 Key 已配置，手机端无需填写 Key。' : '服务端百炼 Key 未配置，可展开高级调试临时填写 Key。',
      data.realtimeWebRtcConfigured ? 'WebRTC Endpoint 已配置，演示默认使用 WebRTC。' : 'WebRTC Endpoint 未配置，实时慧眼演示不可用。',
      data.realtimeWebSocketConfigured ? 'WebSocket Manual 可用于静默上下文诊断。' : 'WebSocket Manual 当前不可用。'
    ];
    elements.health.textContent = parts.join('');
  } catch (error) {
    elements.health.textContent = `后端状态检查失败：${error.message}`;
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
    const data = await apiPost('/api/route', {
      origin,
      destination,
      city,
      destinationCity: city,
      mode: elements.mode.value,
      originPoi: appState.origin,
      destinationPoi: appState.destination
    });

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
    currentStepId: '',
    announcedStepIds: new Set(),
    announcedTurnThresholds: new Set(),
    offRouteCount: 0,
    lastOffRouteSpeechAt: 0
  };

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
}

function stopNavigationFollow() {
  const follow = appState.navigationFollow;
  if (follow?.watchId !== undefined && follow?.watchId !== null) {
    navigator.geolocation.clearWatch(follow.watchId);
  }
  appState.navigationFollow = null;
  updateFollowOutput('GPS 跟随已停止。');
}

function handleFollowError(error) {
  const message = error?.message || '定位失败。';
  updateFollowOutput(`GPS 跟随定位失败：${message}`);
  speak(`定位失败：${message}`);
}

function handleFollowPosition(position) {
  const follow = appState.navigationFollow;
  const steps = follow?.route?.followSteps || [];
  if (!follow || !steps.length) {
    return;
  }

  const location = `${position.coords.longitude},${position.coords.latitude}`;
  const accuracy = Number(position.coords.accuracy || 0);
  const match = matchLocationToFollowSteps(location, steps);
  if (!match) {
    updateFollowOutput(`当前位置：${location}。暂时无法匹配到路线。定位精度约 ${formatFollowMeters(accuracy)}。`);
    return;
  }

  const threshold = Math.max(FOLLOW_ROUTE_MATCH_METERS, accuracy + 25);
  if (match.distanceMeters > threshold) {
    follow.offRouteCount += 1;
    const text = `当前位置离规划路线约 ${formatFollowMeters(match.distanceMeters)}，定位精度约 ${formatFollowMeters(accuracy)}。可能偏离路线，请先停下确认。`;
    updateFollowOutput(text);
    const now = Date.now();
    if (follow.offRouteCount >= FOLLOW_OFF_ROUTE_LIMIT && now - follow.lastOffRouteSpeechAt > 20000) {
      follow.lastOffRouteSpeechAt = now;
      speak('可能偏离路线，请先停下确认。');
    }
    return;
  }

  follow.offRouteCount = 0;
  const currentStep = match.step;
  if (currentStep.id !== follow.currentStepId) {
    follow.currentStepId = currentStep.id;
    if (currentStep.announce?.onEnter && currentStep.spokenText && !follow.announcedStepIds.has(currentStep.id)) {
      follow.announcedStepIds.add(currentStep.id);
      speak(currentStep.spokenText);
    }
  }

  const nextTurn = findNextTurnStep(steps, match.stepIndex);
  const turnDistance = nextTurn?.turnPoint ? distanceBetweenCoordinates(location, nextTurn.turnPoint) : Infinity;
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
  if (appState.realtime) {
    appendVisionLog('实时慧眼已经在运行。');
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    appendVisionLog('这个浏览器不支持摄像头和麦克风调用。');
    return;
  }

  try {
    resetRealtimeDebugLog();
    const config = await getRealtimeConfig();
    const mode = resolveRealtimeMode(config);
    ensureRealtimeCanStart(mode, config);
    appendVisionLog(`正在启动${mode === 'webrtc' ? 'WebRTC 通话' : 'WebSocket 实时流'}，请允许摄像头和麦克风。`);

    appState.stream = await getRealtimeMediaStream();
    elements.camera.srcObject = appState.stream;
    await elements.camera.play();
    reportCameraSettings(appState.stream);

    if (mode === 'webrtc') {
      await startWebRtcRealtime();
    } else {
      await startWebSocketRealtime();
    }
  } catch (error) {
    appendVisionLog(`实时慧眼启动失败：${formatRealtimeStartError(error.message)}`);
    stopRealtime();
  }
}

async function startWebSocketRealtime() {
  const config = appState.realtimeConfig || await getRealtimeConfig();
  const webSocketPath = config.webSocketPath || '/api/ws';
  const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}${webSocketPath}`);
  const audioContext = new AudioContext();
  const player = new PcmPlayer(audioContext, AUDIO_OUTPUT_RATE);

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
    localVadAutoCommitTimer: null,
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
  appendVisionLog('WebSocket Manual 已启动：真实麦克风环境声和低频视频帧正在持续发送。你可以按真实场景正常说话；页面会在检测到你说完后自动提交本轮音视频并请求模型回答。实验按钮只用于诊断。');
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

function stopRealtime() {
  const realtime = appState.realtime;

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
    realtime.player.reset();
  }
  if (realtime?.socket && realtime.socket.readyState <= WebSocket.OPEN) {
    realtime.socket.close();
  }
  if (realtime?.peer) {
    realtime.peer.close();
  }
  if (realtime?.audioContext && realtime.audioContext.state !== 'closed') {
    realtime.audioContext.close();
  }
  if (appState.stream) {
    for (const track of appState.stream.getTracks()) {
      track.stop();
    }
  }

  appState.stream = null;
  appState.realtime = null;
  appState.pendingAudio = [];
  appState.pendingAudioBytes = 0;
  appState.sentFirstAudio = false;
  appState.videoFrameCount = 0;
  elements.camera.srcObject = null;
}

function setLocalMicrophoneEnabled(enabled, reason = '') {
  if (!appState.stream) {
    return;
  }
  for (const track of appState.stream.getAudioTracks()) {
    track.enabled = enabled;
  }
  recordRealtimeDebug(enabled ? 'mic.enabled' : 'mic.disabled', reason);
}

function muteMicrophoneWhileAssistantSpeaks(reason) {
  enterAssistantPlaybackVadGuard(reason);
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

function releaseMicrophoneAfterAssistant(delayMs = 900) {
  if (appState.assistantMicMuteTimer) {
    clearTimeout(appState.assistantMicMuteTimer);
  }
  restoreVadAfterAssistant(delayMs + 500);
  appState.assistantMicMuteTimer = setTimeout(() => {
    setLocalMicrophoneEnabled(true, 'assistant response ended');
    appState.assistantMicMuteTimer = null;
  }, delayMs);
}

function enterAssistantPlaybackVadGuard(reason) {
  if (appState.assistantVadRestoreTimer) {
    clearTimeout(appState.assistantVadRestoreTimer);
    appState.assistantVadRestoreTimer = null;
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
    updateRealtimeSession({
      vadProfile: DEFAULT_VAD_PROFILE,
      reason: 'assistant tail ended'
    });
    appState.assistantVadRestoreTimer = null;
  }, delayMs);
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
    modalities: ['text', 'audio'],
    voice: appState.realtime?.voice || appState.realtimeConfig?.voice || 'Tina',
    input_audio_format: 'pcm',
    output_audio_format: 'pcm',
    turn_detection: isManualWebSocket ? null : vadProfile,
    enable_search: true,
    search_options: {
      enable_source: true
    },
    instructions: buildRealtimeInstructions()
  };

  if (!isManualWebSocket) {
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
    manualMode: isManualWebSocket,
    reason: options.reason || '',
    target: elements.visionQuestion.value
  });
}

async function handleRealtimeServerEvent(message) {
  recordRealtimeDebug('server.event', summarizeRealtimeEvent(message));
  if (message.type === 'proxy.need_key') {
    appendVisionLog(message.message || '请先填写并保存百炼 Key，然后重新开始实时慧眼。');
    return;
  }

  if (message.type === 'proxy.ready') {
    appState.realtime.isReady = true;
    sendRealtimeContext({ quiet: true });
    await activateWebSocketStreams();
    appendVisionLog(`百炼实时模型已连接：${message.model}。你可以直接说话。`);
    return;
  }

  if (message.type === 'proxy.error') {
    appendVisionLog(message.message || '实时代理返回错误。');
    return;
  }

  if (message.type === 'proxy.closed') {
    appendVisionLog(`百炼实时连接关闭：${message.code || ''} ${message.reason || ''}`.trim());
    return;
  }

  if (message.type === 'response.audio.delta' && message.delta && appState.realtime?.player) {
    muteMicrophoneWhileAssistantSpeaks('assistant audio delta');
    appState.realtime.player.enqueue(message.delta);
    return;
  }

  if (message.type === 'response.audio_transcript.delta' || message.type === 'response.text.delta') {
    muteMicrophoneWhileAssistantSpeaks(message.type);
    appState.latestAssistantText += message.delta || '';
    appState.lastVisionText = appState.latestAssistantText;
    recordRealtimeDebug('assistant.partial_text', appState.latestAssistantText);
    return;
  }

  if (message.type === 'response.audio_transcript.done' || message.type === 'response.text.done') {
    const text = message.transcript || message.text || appState.latestAssistantText;
    if (text) {
      appState.lastVisionText = text;
      updateVisionOutput(`模型：${text}`);
    }
    appState.latestAssistantText = '';
    releaseMicrophoneAfterAssistant();
    return;
  }

  if (message.type === 'response.done' || message.type === 'response.audio.done') {
    releaseMicrophoneAfterAssistant();
    return;
  }

  if (message.type === 'conversation.item.input_audio_transcription.completed' && message.transcript) {
    appendVisionLog(`你说：${message.transcript}`);
    return;
  }

  if (message.type === 'input_audio_buffer.speech_started' && appState.realtime?.player) {
    appState.realtime.player.reset();
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
  if (realtime.localVadAutoCommitTimer) {
    clearTimeout(realtime.localVadAutoCommitTimer);
    realtime.localVadAutoCommitTimer = null;
  }
  updateRealtimeSession({
    reason: options.requestResponse ? 'manual response request' : 'manual context commit',
    force: true
  });
  sendRealtimeEvent({ type: 'input_audio_buffer.commit' });
  recordRealtimeDebug('client.manual.commit', {
    requestResponse: Boolean(options.requestResponse),
    trigger: options.trigger || 'button',
    mode: 'audio_image_commit',
    videoFramesDrawn: appState.videoFrameCount,
    sentAudioThisTurn: hadAudioForThisCommit
  });
  appState.sentFirstAudio = false;

  if (options.requestResponse) {
    appState.latestAssistantText = '';
    sendRealtimeEvent({
      type: 'response.create'
    });
    appendVisionLog('已按 Manual 模式提交真实麦克风音频和图像缓冲区，并请求模型根据刚才画面回答。');
  } else {
    appendVisionLog('已按 Manual 模式提交真实麦克风音频和图像缓冲区，暂不请求模型回答。');
  }
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
  updateManualLocalVad(frame);
  const downsampled = downsampleFloat32(frame, inputRate, AUDIO_INPUT_RATE);
  const pcm = floatToPcm16(downsampled);
  queueAudioChunk(pcm);
}

function updateManualLocalVad(frame) {
  const realtime = appState.realtime;
  if (!realtime || realtime.mode !== 'websocket' || !realtime.isReady) {
    return;
  }
  if (appState.assistantMicMuteTimer) {
    return;
  }

  let sumSquares = 0;
  for (let i = 0; i < frame.length; i += 1) {
    sumSquares += frame[i] * frame[i];
  }
  const rms = Math.sqrt(sumSquares / frame.length);
  const now = Date.now();

  if (!realtime.localVadSpeaking && rms >= MANUAL_LOCAL_VAD_START_RMS) {
    realtime.localVadSpeaking = true;
    realtime.localVadStartedAt = now;
    realtime.localVadLastVoiceAt = now;
    recordRealtimeDebug('manual.local_vad.speech_started', { rms });
    return;
  }

  if (!realtime.localVadSpeaking) {
    return;
  }

  if (rms >= MANUAL_LOCAL_VAD_END_RMS) {
    realtime.localVadLastVoiceAt = now;
    return;
  }

  const voiceDuration = now - realtime.localVadStartedAt;
  const silenceDuration = now - realtime.localVadLastVoiceAt;
  if (voiceDuration < MANUAL_LOCAL_VAD_MIN_AUDIO_MS || silenceDuration < MANUAL_LOCAL_VAD_END_MS) {
    return;
  }

  if (realtime.localVadAutoCommitTimer) {
    return;
  }
  realtime.localVadAutoCommitTimer = setTimeout(() => {
    realtime.localVadAutoCommitTimer = null;
    recordRealtimeDebug('manual.local_vad.speech_ended', {
      voiceDuration,
      silenceDuration
    });
    commitRealtimeManualBuffer({ requestResponse: true, trigger: 'local_vad' });
  }, 0);
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

function sendVideoFrame() {
  if (!appState.realtime?.isReady || !appState.stream) {
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
  const hasRoute = Boolean(appState.route);
  const routeState = hasRoute ? JSON.stringify(appState.route, null, 2) : '尚未生成路线。';
  const baseInstructions = [
    hasRoute
      ? '你是给视障者张振宇使用的带导航任务的实时慧眼现场确认助手。'
      : '你是给视障者张振宇使用的实时慧眼助手。',
    '你正在接收手机摄像头画面、麦克风语音和导航状态。',
    '回答要短，适合语音播报。',
    '不要编造画面中没有看到或听到的信息。',
    hasRoute
      ? '当前已开启导航上下文，请优先结合当前路线任务回答用户问题。'
      : '',
    hasRoute ? `当前确认目标：${elements.visionQuestion.value}` : '',
    hasRoute ? `当前导航状态：${routeState}` : ''
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
    return;
  }
  if (config.serverApiKeyConfigured || config.webSocketConfigured) {
    elements.realtimeConfigStatus.textContent = config.webRtcConfigured
      ? '百炼后台已配置 Key 和 WebRTC Endpoint。大会演示版默认使用 WebRTC 通话；WebSocket Manual 暂停用于诊断。'
      : '百炼后台已配置 Key，但 WebRTC Endpoint 缺失；大会演示实时慧眼不可用。';
    return;
  }
  if (!config.serverApiKeyConfigured && !config.webSocketConfigured) {
    elements.realtimeConfigStatus.textContent = '百炼后台还没有配置 Key。需要展开高级调试临时填写 DashScope Key。';
    return;
  }
  elements.realtimeConfigStatus.textContent = '百炼后台配置不完整，请展开高级调试检查 Key。';
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
  const response = await fetch(path, { headers: { 'Accept': 'application/json' } });
  return readApiResponse(response);
}

async function apiPost(path, body) {
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

function speak(text) {
  const content = String(text || '').replace(/\s+/g, ' ').trim();
  if (!content) {
    return;
  }
  if (!window.speechSynthesis) {
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(content.slice(0, 900));
  utterance.lang = 'zh-CN';
  utterance.rate = 0.95;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
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
  constructor(audioContext, sampleRate) {
    this.audioContext = audioContext;
    this.sampleRate = sampleRate;
    this.nextStartTime = 0;
    this.sources = [];
  }

  enqueue(base64) {
    const pcm = base64ToInt16(base64);
    if (pcm.length === 0) {
      return;
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
    this.sources.push(source);
    source.onended = () => {
      this.sources = this.sources.filter((item) => item !== source);
    };
  }

  reset() {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // The source may have already ended.
      }
    }
    this.sources = [];
    this.nextStartTime = this.audioContext.currentTime;
  }
}
