'use strict';

const AUDIO_INPUT_RATE = 16000;
const AUDIO_OUTPUT_RATE = 24000;
const AUDIO_SEND_BYTES = 3200;
const VIDEO_FRAME_INTERVAL_MS = 3000;
const VIDEO_TRACK_DRAW_INTERVAL_MS = 1000;
const CLIENT_API_KEY_STORAGE = 'accessibleNav.dashscopeKey';
const CLIENT_WEBRTC_ENDPOINT_STORAGE = 'accessibleNav.webrtcEndpoint';

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
  videoFrameCount: 0
};

const elements = {
  health: document.querySelector('#health'),
  city: document.querySelector('#city'),
  origin: document.querySelector('#origin'),
  destination: document.querySelector('#destination'),
  mode: document.querySelector('#mode'),
  poiResults: document.querySelector('#poi-results'),
  manualRoute: document.querySelector('#manual-route'),
  routeOutput: document.querySelector('#route-output'),
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
  copyRealtimeLog: document.querySelector('#copy-realtime-log')
};

document.querySelector('#use-location').addEventListener('click', useCurrentLocation);
document.querySelector('#search-origin').addEventListener('click', () => searchPoi('origin'));
document.querySelector('#search-destination').addEventListener('click', () => searchPoi('destination'));
document.querySelector('#plan-route').addEventListener('click', planRoute);
document.querySelector('#load-manual-route').addEventListener('click', loadManualRoute);
document.querySelector('#speak-route').addEventListener('click', () => speak(elements.routeOutput.textContent));
document.querySelector('#start-realtime').addEventListener('click', startRealtime);
document.querySelector('#send-context').addEventListener('click', sendRealtimeContext);
document.querySelector('#stop-realtime').addEventListener('click', stopRealtime);
document.querySelector('#speak-vision').addEventListener('click', () => speak(appState.lastVisionText || elements.visionOutput.textContent));
document.querySelector('#save-client-key').addEventListener('click', saveClientApiKey);
document.querySelector('#clear-client-key').addEventListener('click', clearClientApiKey);
document.querySelector('#copy-realtime-log').addEventListener('click', copyRealtimeDebugLog);

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
      '当前 Vercel 部署不使用 WebSocket 长连接。',
      data.realtimeWebRtcConfigured ? 'WebRTC Endpoint 已配置，手机端无需填写 Endpoint。' : 'WebRTC Endpoint 未配置，需展开高级调试填写白名单 Endpoint。'
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
  title.textContent = `搜索结果：请选择一个作为${kind === 'origin' ? '起点' : '终点'}`;
  elements.poiResults.append(title);

  for (const poi of pois) {
    const item = document.createElement('article');
    item.className = 'result-item';

    const text = document.createElement('p');
    const address = poi.address || poi.adname || '地址未返回';
    const entrance = poi.entrLocation ? `，入口坐标 ${poi.entrLocation}` : '';
    text.textContent = `${poi.name}，${address}，坐标 ${poi.location}${entrance}`;

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `设为${kind === 'origin' ? '起点' : '终点'}：${poi.name}`;
    button.addEventListener('click', () => setSelectedPoi(kind, poi));

    item.append(text, button);
    elements.poiResults.append(item);
  }
}

function setSelectedPoi(kind, poi) {
  if (kind === 'origin') {
    appState.origin = poi;
    elements.origin.value = `${poi.name}：${poi.location}`;
  } else {
    appState.destination = poi;
    elements.destination.value = `${poi.name}：${poi.location}`;
  }
  setPoiStatus(`已设置${kind === 'origin' ? '起点' : '终点'}：${poi.name}，坐标 ${poi.location}`);
}

async function planRoute() {
  const city = elements.city.value.trim() || '上海';
  const origin = appState.origin?.location || extractCoordinate(elements.origin.value);
  const destination = appState.destination?.location || extractCoordinate(elements.destination.value);

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
      mode: elements.mode.value
    });

    appState.route = {
      provider: data.provider,
      mode: data.mode,
      originPoi: appState.origin,
      destinationPoi: appState.destination,
      request: data.request,
      facts: data.facts,
      summaryText: data.summaryText
    };

    const text = [
      '路线已生成。',
      '',
      `起点：${appState.origin?.name || origin}`,
      `终点：${appState.destination?.name || destination}`,
      '',
      data.summaryText,
      '',
      '规则提醒：这一版先锁地图事实。左边、右边、过街次数，需要在后续版本用统一坐标和物理推理补齐，不能由模型猜。'
    ].join('\n');

    elements.routeOutput.textContent = text;
    speak(firstSpeechParagraph(text));
    sendRealtimeContext({ quiet: true });
  } catch (error) {
    elements.routeOutput.textContent = `路线规划失败：${error.message}`;
    speak(`路线规划失败：${error.message}`);
  }
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

async function getRealtimeMediaStream() {
  const audio = {
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
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
  const audioState = audioTrack ? '麦克风已拿到' : '没有拿到麦克风';
  appState.cameraInfo = { facingMode, facingText, width, height, frameRate, label, audioState };
  appendVisionLog(`摄像头自检：当前是${facingText}，分辨率 ${width}x${height}，帧率 ${frameRate}，设备名：${label}；${audioState}。`);
  if (facingMode !== 'environment') {
    appendVisionLog('提醒：当前没有确认拿到后置摄像头，现场描述可能和你面前环境不一致。');
  }
  recordRealtimeDebug('media.settings', appState.cameraInfo);
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
  const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/realtime/ws`);
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

  await realtime.audioContext.audioWorklet.addModule('/audio-worklet.js');
  realtime.audioSource = realtime.audioContext.createMediaStreamSource(appState.stream);
  realtime.audioProcessor = new AudioWorkletNode(realtime.audioContext, 'pcm-capture');
  realtime.audioSilenceGain = realtime.audioContext.createGain();
  realtime.audioSilenceGain.gain.value = 0;

  realtime.audioProcessor.port.onmessage = (event) => {
    const pcm = floatToPcm16(downsampleFloat32(event.data, realtime.audioContext.sampleRate, AUDIO_INPUT_RATE));
    queueAudioChunk(pcm);
  };

  realtime.audioSource.connect(realtime.audioProcessor);
  realtime.audioProcessor.connect(realtime.audioSilenceGain);
  realtime.audioSilenceGain.connect(realtime.audioContext.destination);

  realtime.videoTimer = setInterval(sendVideoFrame, VIDEO_FRAME_INTERVAL_MS);
  appendVisionLog('音频和视频流已经开始发送。你可以像视频通话一样直接说话。');
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
  if (config.webRtcConfigured) {
    elements.realtimeMode.value = 'webrtc';
  }
}

function resolveRealtimeMode(config) {
  const requested = elements.realtimeMode.value;
  if (requested === 'websocket') {
    throw new Error('当前 Vercel 部署不能稳定承载 WebSocket 长连接，请先使用 WebRTC，并确认 Key 和 Endpoint 属于同一个百炼业务空间。');
  }
  return requested;
}

function ensureRealtimeCanStart(mode, config) {
  const hasServerKey = Boolean(config.serverApiKeyConfigured || config.webSocketConfigured);
  const hasServerEndpoint = Boolean(config.webRtcConfigured);
  const hasClientKey = Boolean(readClientApiKey());
  const hasClientEndpoint = Boolean(readClientWebRtcEndpoint());
  if (mode === 'webrtc' && !hasClientKey && !hasServerKey) {
    throw new Error('服务端没有保存百炼 Key。请展开高级调试，临时填写并保存百炼 DashScope Key。');
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

function sendRealtimeContext(options = {}) {
  const realtime = appState.realtime;
  if (!realtime || !realtime.isReady) {
    if (!options.quiet) {
      appendVisionLog('实时慧眼还没有接通，暂时不能发送上下文。');
    }
    return;
  }

  const event = {
    type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
      voice: appState.realtime?.voice || appState.realtimeConfig?.voice || 'Tina',
      input_audio_format: 'pcm',
      output_audio_format: 'pcm',
      turn_detection: {
        type: 'server_vad',
        threshold: 0.5,
        silence_duration_ms: 500,
        create_response: true
      },
      instructions: buildRealtimeInstructions()
    }
  };
  sendRealtimeEvent(event);
  recordRealtimeDebug('client.session.update', {
    modalities: event.session.modalities,
    voice: event.session.voice,
    turnDetection: event.session.turn_detection?.type || 'none',
    target: elements.visionQuestion.value
  });

  if (!options.quiet) {
    appendVisionLog('已把当前导航上下文发送给实时模型。你现在可以直接问：我是不是到门口了，站牌是不是这个，入口在哪边。');
  }
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
    appState.realtime.player.enqueue(message.delta);
    return;
  }

  if (message.type === 'response.audio_transcript.delta' || message.type === 'response.text.delta') {
    appState.latestAssistantText += message.delta || '';
    appState.lastVisionText = appState.latestAssistantText;
    updateVisionOutput(`模型：${appState.latestAssistantText}`);
    return;
  }

  if (message.type === 'response.audio_transcript.done' || message.type === 'response.text.done') {
    const text = message.transcript || message.text || appState.latestAssistantText;
    if (text) {
      appState.lastVisionText = text;
      updateVisionOutput(`模型：${text}`);
    }
    appState.latestAssistantText = '';
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

  const text = JSON.stringify(event);
  if (realtime.mode === 'websocket' && realtime.socket?.readyState === WebSocket.OPEN) {
    realtime.socket.send(text);
  } else if (realtime.mode === 'webrtc' && realtime.eventChannel?.readyState === 'open') {
    realtime.eventChannel.send(text);
  }
}

function queueAudioChunk(pcm) {
  if (!appState.realtime?.isReady || appState.realtime.mode !== 'websocket') {
    return;
  }

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

function sendVideoFrame() {
  if (!appState.realtime?.isReady || !appState.sentFirstAudio || !appState.stream) {
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

  sendRealtimeEvent({
    type: 'input_image_buffer.append',
    image
  });
}

function startVideoStatsPolling(peer) {
  const realtime = appState.realtime;
  if (!realtime || realtime.mode !== 'webrtc') {
    return;
  }

  realtime.statsTimer = setInterval(async () => {
    try {
      const stats = await peer.getStats();
      let outboundVideo = null;
      stats.forEach((report) => {
        if (report.type === 'outbound-rtp' && report.kind === 'video') {
          outboundVideo = report;
        }
      });
      if (!outboundVideo) {
        recordRealtimeDebug('webrtc.video_stats.missing', '没有找到 outbound-rtp video 统计。');
        return;
      }

      const summary = {
        browserDrawnFrames: appState.videoFrameCount,
        framesSent: outboundVideo.framesSent ?? null,
        bytesSent: outboundVideo.bytesSent ?? null,
        packetsSent: outboundVideo.packetsSent ?? null,
        timestamp: outboundVideo.timestamp
      };
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
  const routeState = appState.route ? JSON.stringify(appState.route, null, 2) : '尚未生成路线。';
  return [
    '你是给视障者张振宇使用的实时视频通话式导航助手。',
    '你正在接收手机摄像头画面、麦克风语音和导航状态。',
    '必须像真人视频协助一样回答，但只能依据地图状态和画面中确实能看到或听到的信息。',
    '必须明确区分“画面里确实看见”和“根据语音或导航状态推测”。不能把推测说成看见。',
    '如果没有收到清晰画面、画面太晃、摄像头方向不对、或只听到语音没有看到对应物体，必须直接说：我现在看不清，不能确认。',
    '不能编造门牌、站牌、入口、左右侧、过街次数。',
    '如果看不清、地图和画面冲突、或者不能确认安全过街，必须直接说不确定，并给安全的下一步，例如原地慢慢扫视、退回路边、询问工作人员。',
    '回答要短，适合语音播报。优先说行动，不要泛泛描述画面。',
    '重点输出：是否看到目标、看到的目标类型、目标在前方/左前方/右前方、下一步动作、是否需要现场确认。',
    `当前确认目标：${elements.visionQuestion.value}`,
    `当前导航状态：${routeState}`
  ].join('\n');
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
  if (config.serverApiKeyConfigured && config.webRtcConfigured) {
    elements.realtimeConfigStatus.textContent = '百炼后台已配置 Key 和 WebRTC Endpoint。手机端无需填写，直接点“开始实时慧眼”。';
    return;
  }
  if (!config.serverApiKeyConfigured && !config.webRtcConfigured) {
    elements.realtimeConfigStatus.textContent = '百炼后台还没有配置 Key 和 Endpoint。需要展开高级调试临时填写。';
    return;
  }
  elements.realtimeConfigStatus.textContent = config.serverApiKeyConfigured
    ? '百炼后台已有 Key，但缺少 WebRTC Endpoint。需要展开高级调试临时填写 Endpoint。'
    : '百炼后台已有 WebRTC Endpoint，但缺少 Key。需要展开高级调试临时填写 Key。';
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
  elements.poiResults.textContent = text;
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
