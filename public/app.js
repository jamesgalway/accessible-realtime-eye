'use strict';

const AUDIO_INPUT_RATE = 16000;
const AUDIO_OUTPUT_RATE = 24000;
const AUDIO_SEND_BYTES = 3200;
const VIDEO_FRAME_INTERVAL_MS = 1000;
const CLIENT_API_KEY_STORAGE = 'accessibleNav.dashscopeKey';

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
  latestAssistantText: ''
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
  clientApiKey: document.querySelector('#client-api-key'),
  visionQuestion: document.querySelector('#vision-question')
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

initializeClientApiKey();
checkHealth();

async function checkHealth() {
  try {
    const data = await apiGet('/api/health');
    appState.realtimeConfig = {
      model: data.realtimeModel,
      voice: data.realtimeVoice
    };
    const parts = [
      '后端已启动。',
      data.amapConfigured ? '高德 Key 已配置。' : '高德 Key 未配置，暂时不能真实规划路线。',
      data.bailianConfigured ? '服务端百炼 Key 已配置。' : '服务端百炼 Key 未配置，可在手机页临时填写 Key 测试实时慧眼。',
      data.realtimeWebSocketConfigured ? 'WebSocket 实时流可用。' : 'WebSocket 实时流需要手机临时 Key 或服务端 Key。',
      data.realtimeWebRtcConfigured ? 'WebRTC 通话 Endpoint 已配置。' : 'WebRTC 通话 Endpoint 未配置，需百炼白名单。'
    ];
    elements.health.textContent = parts.join('');
  } catch (error) {
    elements.health.textContent = `后端状态检查失败：${error.message}`;
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

async function startRealtime() {
  if (appState.realtime) {
    appendVisionLog('实时慧眼已经在运行。');
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    appendVisionLog('这个浏览器不支持摄像头和麦克风调用。');
    return;
  }

  const mode = elements.realtimeMode.value;
  appendVisionLog(`正在启动${mode === 'webrtc' ? 'WebRTC 通话' : 'WebSocket 实时流'}，请允许摄像头和麦克风。`);

  try {
    appState.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    elements.camera.srcObject = appState.stream;
    await elements.camera.play();

    if (mode === 'webrtc') {
      await startWebRtcRealtime();
    } else {
      await startWebSocketRealtime();
    }
  } catch (error) {
    appendVisionLog(`实时慧眼启动失败：${error.message}`);
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
  const config = await apiGet('/api/realtime/config');
  appState.realtimeConfig = config;
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

  peer.ontrack = (event) => {
    elements.remoteAudio.srcObject = event.streams[0];
  };

  peer.ondatachannel = (event) => {
    attachRealtimeDataChannel(event.channel);
  };

  outboundChannel.onopen = () => {
    appState.realtime.eventChannel = outboundChannel;
    appState.realtime.isReady = true;
    sendRealtimeContext({ quiet: true });
    appendVisionLog('WebRTC 通话已接通。你可以直接说话。');
  };

  outboundChannel.onmessage = (event) => {
    const message = JSON.parse(event.data);
    handleRealtimeServerEvent(message);
  };
  outboundChannel.onerror = () => appendVisionLog('WebRTC 事件通道出错。');
  outboundChannel.onclose = () => appendVisionLog('WebRTC 事件通道已关闭。');

  appState.realtime = {
    mode: 'webrtc',
    peer,
    eventChannel: outboundChannel,
    canvasTrack,
    voice: config.voice,
    isReady: false
  };

  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  await waitForIceGatheringComplete(peer);

  const response = await fetch('/api/realtime/sdp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/sdp',
      'X-Client-DashScope-Key': getClientApiKey()
    },
    body: peer.localDescription.sdp
  });
  const answerSdp = await response.text();
  if (!response.ok) {
    throw new Error(answerSdp || `HTTP ${response.status}`);
  }
  await peer.setRemoteDescription({ type: 'answer', sdp: answerSdp });
}

function attachRealtimeDataChannel(channel) {
  channel.onopen = () => {
    if (appState.realtime?.mode === 'webrtc' && !appState.realtime.eventChannel) {
      appState.realtime.eventChannel = channel;
      appState.realtime.isReady = true;
      sendRealtimeContext({ quiet: true });
    }
  };
  channel.onmessage = (event) => {
    const message = JSON.parse(event.data);
    handleRealtimeServerEvent(message);
  };
  channel.onerror = () => appendVisionLog(`WebRTC 数据通道出错：${channel.label || '未命名通道'}`);
  channel.onclose = () => appendVisionLog(`WebRTC 数据通道已关闭：${channel.label || '未命名通道'}`);
}

function stopRealtime() {
  const realtime = appState.realtime;

  if (realtime?.videoTimer) {
    clearInterval(realtime.videoTimer);
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
        type: 'semantic_vad',
        threshold: 0.5,
        silence_duration_ms: 800
      },
      instructions: buildRealtimeInstructions()
    }
  };
  sendRealtimeEvent(event);

  if (!options.quiet) {
    appendVisionLog('已把当前导航上下文发送给实时模型。你现在可以直接问：我是不是到门口了，站牌是不是这个，入口在哪边。');
  }
}

async function handleRealtimeServerEvent(message) {
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
  const maxWidth = 640;
  const scale = Math.min(1, maxWidth / videoWidth);
  const width = Math.round(videoWidth * scale);
  const height = Math.round(videoHeight * scale);

  elements.videoFrame.width = width;
  elements.videoFrame.height = height;
  const context = elements.videoFrame.getContext('2d');
  context.drawImage(elements.camera, 0, 0, width, height);
  const image = elements.videoFrame.toDataURL('image/jpeg', 0.68).replace(/^data:image\/jpeg;base64,/, '');

  sendRealtimeEvent({
    type: 'input_image_buffer.append',
    image
  });
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
  setInterval(() => {
    if (video.readyState >= 2) {
      const scale = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
      const width = Math.round(video.videoWidth * scale);
      const height = Math.round(video.videoHeight * scale);
      const x = Math.round((canvas.width - width) / 2);
      const y = Math.round((canvas.height - height) / 2);
      context.fillStyle = '#111827';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(video, x, y, width, height);
    }
  }, VIDEO_FRAME_INTERVAL_MS);

  return canvas.captureStream(1).getVideoTracks()[0];
}

function buildRealtimeInstructions() {
  const routeState = appState.route ? JSON.stringify(appState.route, null, 2) : '尚未生成路线。';
  return [
    '你是给视障者张振宇使用的实时视频通话式导航助手。',
    '你正在接收手机摄像头画面、麦克风语音和导航状态。',
    '必须像真人视频协助一样回答，但只能依据地图状态和画面中确实能看到或听到的信息。',
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

function initializeClientApiKey() {
  const saved = localStorage.getItem(CLIENT_API_KEY_STORAGE) || '';
  if (saved && elements.clientApiKey) {
    elements.clientApiKey.value = saved;
  }
}

function getClientApiKey() {
  return (elements.clientApiKey?.value || '').trim();
}

function saveClientApiKey() {
  const apiKey = getClientApiKey();
  if (!apiKey) {
    appendVisionLog('百炼 Key 为空，没有保存。');
    return;
  }
  localStorage.setItem(CLIENT_API_KEY_STORAGE, apiKey);
  appendVisionLog('已保存到当前手机浏览器。为安全起见，不会在页面上朗读 Key 内容。');
}

function clearClientApiKey() {
  localStorage.removeItem(CLIENT_API_KEY_STORAGE);
  if (elements.clientApiKey) {
    elements.clientApiKey.value = '';
  }
  appendVisionLog('已清除当前手机浏览器保存的百炼 Key。');
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
