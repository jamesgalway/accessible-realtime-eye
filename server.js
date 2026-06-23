'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { URL } = require('node:url');
const WebSocket = require('ws');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');

loadEnv(path.join(ROOT, '.env'));

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const AMAP_KEY = process.env.AMAP_KEY || '';
const BAILIAN_API_KEY = process.env.BAILIAN_API_KEY || process.env.DASHSCOPE_API_KEY || '';
const BAILIAN_BASE_URL = (process.env.BAILIAN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/$/, '');
const BAILIAN_VISION_MODEL = process.env.BAILIAN_VISION_MODEL || 'qwen-vl-plus';
const BAILIAN_REALTIME_MODEL = process.env.BAILIAN_REALTIME_MODEL || 'qwen3.5-omni-plus-realtime';
const BAILIAN_REALTIME_REGION = process.env.BAILIAN_REALTIME_REGION === 'intl' ? 'intl' : 'cn';
const BAILIAN_REALTIME_VOICE = process.env.BAILIAN_REALTIME_VOICE || 'Tina';
const BAILIAN_WEBRTC_ENDPOINT = process.env.BAILIAN_WEBRTC_ENDPOINT || '';
const AMAP_MIN_INTERVAL_MS = Number(process.env.AMAP_MIN_INTERVAL_MS || 450);

let amapQueue;

if (process.argv.includes('--check')) {
  const requiredFiles = [
    'server.js',
    'public/index.html',
    'public/app.js',
    'public/styles.css',
    'README.md',
    'docs/workflow.md'
  ];
  const result = {
    ok: true,
    node: process.version,
    root: ROOT,
    requiredFiles: requiredFiles.map((file) => ({
      file,
      exists: fs.existsSync(path.join(ROOT, file))
    })),
    amapConfigured: Boolean(AMAP_KEY),
    bailianConfigured: Boolean(BAILIAN_API_KEY),
    realtimeWebSocketConfigured: Boolean(BAILIAN_API_KEY),
    realtimeWebRtcConfigured: Boolean(BAILIAN_API_KEY && BAILIAN_WEBRTC_ENDPOINT)
  };
  result.ok = result.requiredFiles.every((item) => item.exists);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

async function handleHttpRequest(req, res) {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (requestUrl.pathname.startsWith('/api/')) {
      await handleApi(req, res, requestUrl);
      return;
    }

    await serveStatic(req, res, requestUrl.pathname);
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      ok: false,
      error: error.message || '服务器内部错误'
    });
  }
}

async function handleApiRequest(req, res) {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    await handleApi(req, res, requestUrl);
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      ok: false,
      error: error.message || '服务器内部错误'
    });
  }
}

function createHttpServer() {
  const server = http.createServer(handleHttpRequest);
  const browserRealtimeServer = createBrowserRealtimeServer();

  server.on('upgrade', (req, socket, head) => {
    const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (requestUrl.pathname !== '/api/realtime/ws') {
      socket.destroy();
      return;
    }

    browserRealtimeServer.handleUpgrade(req, socket, head, (browserSocket) => {
      browserRealtimeServer.emit('connection', browserSocket, req);
    });
  });

  return server;
}

function createBrowserRealtimeServer() {
  const browserRealtimeServer = new WebSocket.Server({ noServer: true, maxPayload: 900 * 1024 });
  browserRealtimeServer.on('connection', (browserSocket) => {
    createRealtimeProxy(browserSocket);
  });
  return browserRealtimeServer;
}

function startServer() {
  const server = createHttpServer();
  server.listen(PORT, HOST, () => {
    console.log(`Accessible navigation prototype is running on http://${HOST}:${PORT}`);
  });
  return server;
}

function handleWebSocketUpgrade(req, socket, head = Buffer.alloc(0)) {
  const browserRealtimeServer = createBrowserRealtimeServer();
  browserRealtimeServer.handleUpgrade(req, socket, head, (browserSocket) => {
    browserRealtimeServer.emit('connection', browserSocket, req);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = handleHttpRequest;
module.exports.createHttpServer = createHttpServer;
module.exports.createRealtimeProxy = createRealtimeProxy;
module.exports.handleApiRequest = handleApiRequest;
module.exports.handleHttpRequest = handleHttpRequest;
module.exports.handleWebSocketUpgrade = handleWebSocketUpgrade;
module.exports.startServer = startServer;

async function handleApi(req, res, requestUrl) {
  if (req.method === 'GET' && requestUrl.pathname === '/api/health') {
    sendJson(res, 200, {
      ok: true,
      amapConfigured: Boolean(AMAP_KEY),
      bailianConfigured: Boolean(BAILIAN_API_KEY),
      amapRequestsAreSerial: true,
      amapMinIntervalMs: AMAP_MIN_INTERVAL_MS,
      bailianVisionModel: BAILIAN_VISION_MODEL,
      realtimeWebSocketConfigured: Boolean(BAILIAN_API_KEY),
      realtimeWebRtcConfigured: Boolean(BAILIAN_WEBRTC_ENDPOINT),
      realtimeModel: BAILIAN_REALTIME_MODEL,
      realtimeRegion: BAILIAN_REALTIME_REGION,
      realtimeVoice: BAILIAN_REALTIME_VOICE,
      clientApiKeySupported: true,
      note: '高德 Key 只在后端使用。百炼 Key 可由后端环境变量提供，也可由测试手机临时发送给代理。'
    });
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/realtime/config') {
    sendJson(res, 200, {
      ok: true,
      webSocketConfigured: Boolean(BAILIAN_API_KEY),
      webRtcConfigured: Boolean(BAILIAN_WEBRTC_ENDPOINT),
      serverApiKeyConfigured: Boolean(BAILIAN_API_KEY),
      clientApiKeySupported: true,
      model: BAILIAN_REALTIME_MODEL,
      region: BAILIAN_REALTIME_REGION,
      voice: BAILIAN_REALTIME_VOICE,
      webSocketPath: '/api/realtime/ws',
      webRtcSdpPath: '/api/realtime/sdp'
    });
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/realtime/sdp') {
    const offerSdp = await readTextBody(req, 1024 * 1024);
    const answerSdp = await exchangeWebRtcSdp(offerSdp, getClientDashScopeKey(req));
    res.writeHead(200, {
      'Content-Type': 'application/sdp; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(answerSdp);
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/poi') {
    const keyword = (requestUrl.searchParams.get('keyword') || '').trim();
    const city = (requestUrl.searchParams.get('city') || '上海').trim();
    if (!keyword) {
      throw httpError(400, '请先输入要搜索的地点。');
    }
    const data = await callAmap('/v3/place/text', {
      keywords: keyword,
      city,
      citylimit: 'true',
      offset: '10',
      page: '1',
      extensions: 'all'
    });
    sendJson(res, 200, {
      ok: true,
      provider: 'amap',
      city,
      keyword,
      pois: Array.isArray(data.pois) ? data.pois.map(simplifyPoi) : []
    });
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/route') {
    const body = await readJsonBody(req);
    const mode = body.mode === 'walking' ? 'walking' : 'transit';
    const origin = normalizeCoordinate(body.origin);
    const destination = normalizeCoordinate(body.destination);
    const city = (body.city || '上海').trim();
    const destinationCity = (body.destinationCity || city).trim();

    if (!origin || !destination) {
      throw httpError(400, '路线规划需要高德坐标，格式是 经度,纬度。请先用地点搜索选择起点和终点。');
    }

    const data = mode === 'walking'
      ? await callAmap('/v3/direction/walking', { origin, destination })
      : await callAmap('/v3/direction/transit/integrated', {
        origin,
        destination,
        city,
        destinationcity: destinationCity,
        extensions: 'all',
        strategy: '0'
      });

    const summary = mode === 'walking'
      ? buildWalkingSummary(data, { origin, destination, city })
      : buildTransitSummary(data, { origin, destination, city, destinationCity });

    sendJson(res, 200, {
      ok: true,
      provider: 'amap',
      mode,
      request: { origin, destination, city, destinationCity },
      ...summary
    });
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/vision-check') {
    const body = await readJsonBody(req, 8 * 1024 * 1024);
    const result = await runVisionCheck(body);
    sendJson(res, 200, result);
    return;
  }

  throw httpError(404, '没有这个接口。');
}

async function callAmap(endpoint, params) {
  if (!AMAP_KEY) {
    throw httpError(500, '还没有配置 AMAP_KEY。请复制 .env.example 为 .env，并填入高德 Web 服务 Key。');
  }

  const url = new URL(`https://restapi.amap.com${endpoint}`);
  for (const [key, value] of Object.entries({ ...params, key: AMAP_KEY })) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  }

  return amapQueue.run(async () => {
    const response = await fetchWithTimeout(url, { method: 'GET' }, 15000);
    const data = await response.json();

    if (!response.ok) {
      throw httpError(response.status, `高德接口 HTTP 错误：${response.status}`);
    }
    if (data.status && data.status !== '1') {
      throw httpError(502, `高德接口返回失败：${data.info || data.infocode || '未知错误'}`);
    }

    return data;
  });
}

async function exchangeWebRtcSdp(offerSdp, clientApiKey = '') {
  const apiKey = clientApiKey || BAILIAN_API_KEY;
  if (!apiKey) {
    throw httpError(500, '还没有配置 BAILIAN_API_KEY 或 DASHSCOPE_API_KEY。');
  }
  if (!BAILIAN_WEBRTC_ENDPOINT) {
    throw httpError(500, '还没有配置 BAILIAN_WEBRTC_ENDPOINT。百炼 WebRTC 接入需要官方白名单 Endpoint。');
  }
  if (!offerSdp || !offerSdp.includes('v=0')) {
    throw httpError(400, '没有收到有效的 WebRTC offer SDP。');
  }

  const url = buildWebRtcUrl();
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/sdp'
    },
    body: offerSdp
  }, 30000);

  const answer = await response.text();
  if (!response.ok) {
    throw httpError(response.status, `百炼 WebRTC SDP 交换失败：${answer || response.status}`);
  }
  return answer;
}

function createRealtimeProxy(browserSocket) {
  const upstreamUrl = buildRealtimeWebSocketUrl();
  const pendingMessages = [];
  const connectionId = Math.random().toString(36).slice(2, 8);
  const startedAt = Date.now();
  let apiKey = BAILIAN_API_KEY;
  let upstream = null;
  let upstreamOpen = false;
  let closed = false;
  let clientEventCount = 0;
  let upstreamMessageCount = 0;

  console.log(`[realtime:${connectionId}] browser connected; serverKey=${apiKey ? 'yes' : 'no'}`);

  const closeBoth = () => {
    if (closed) {
      return;
    }
    closed = true;
    console.log(`[realtime:${connectionId}] closed after ${Date.now() - startedAt}ms; clientEvents=${clientEventCount}; upstreamMessages=${upstreamMessageCount}`);
    if (browserSocket.readyState === WebSocket.OPEN) {
      browserSocket.close();
    }
    if (upstream && (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING)) {
      upstream.close();
    }
  };

  const openUpstream = () => {
    if (closed || upstream || !apiKey) {
      return;
    }

    const upstreamStartedAt = Date.now();
    console.log(`[realtime:${connectionId}] opening upstream; pending=${pendingMessages.length}`);

    upstream = new WebSocket(upstreamUrl, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      perMessageDeflate: false,
      maxPayload: 8 * 1024 * 1024
    });

    upstream.on('open', () => {
      upstreamOpen = true;
      console.log(`[realtime:${connectionId}] upstream ready in ${Date.now() - upstreamStartedAt}ms; pending=${pendingMessages.length}`);
      safeSend(browserSocket, {
        type: 'proxy.ready',
        model: BAILIAN_REALTIME_MODEL,
        voice: BAILIAN_REALTIME_VOICE,
        transport: 'websocket'
      });
      while (pendingMessages.length > 0 && upstream.readyState === WebSocket.OPEN) {
        upstream.send(pendingMessages.shift());
      }
    });

    upstream.on('message', (message) => {
      upstreamMessageCount += 1;
      if (upstreamMessageCount === 1 || upstreamMessageCount % 50 === 0) {
        const type = parseRealtimeEventType(message.toString()) || 'unknown';
        console.log(`[realtime:${connectionId}] upstream message #${upstreamMessageCount}; type=${type}`);
      }
      if (browserSocket.readyState === WebSocket.OPEN) {
        browserSocket.send(message.toString());
      }
    });

    upstream.on('error', (error) => {
      console.log(`[realtime:${connectionId}] upstream error: ${error.message}`);
      safeSend(browserSocket, {
        type: 'proxy.error',
        message: `百炼实时连接错误：${error.message}`
      });
    });

    upstream.on('close', (code, reason) => {
      console.log(`[realtime:${connectionId}] upstream closed; code=${code}; reason=${reason.toString()}`);
      safeSend(browserSocket, {
        type: 'proxy.closed',
        code,
        reason: reason.toString()
      });
      closeBoth();
    });
  };

  if (apiKey) {
    openUpstream();
  } else {
    safeSend(browserSocket, {
      type: 'proxy.need_key',
      message: '服务端没有百炼 Key。请在手机页面填写并保存百炼 DashScope Key，然后重新开始实时慧眼。'
    });
  }

  browserSocket.on('message', (message) => {
    const text = message.toString();
    const authApiKey = parseProxyAuthApiKey(text);
    if (authApiKey) {
      apiKey = authApiKey;
      console.log(`[realtime:${connectionId}] client key received; length=${authApiKey.length}`);
      openUpstream();
      return;
    }

    if (!isAllowedRealtimeClientEvent(text)) {
      console.log(`[realtime:${connectionId}] blocked client event`);
      safeSend(browserSocket, {
        type: 'proxy.error',
        message: '收到不允许转发的实时事件。'
      });
      return;
    }
    clientEventCount += 1;
    if (clientEventCount === 1 || clientEventCount % 50 === 0) {
      console.log(`[realtime:${connectionId}] client event #${clientEventCount}; type=${parseRealtimeEventType(text) || 'unknown'}; upstreamOpen=${upstreamOpen}`);
    }
    if (!apiKey) {
      safeSend(browserSocket, {
        type: 'proxy.need_key',
        message: '缺少百炼 Key，实时事件还没有转发。'
      });
      return;
    }
    if (upstreamOpen && upstream?.readyState === WebSocket.OPEN) {
      upstream.send(text);
    } else {
      pendingMessages.push(text);
    }
  });

  browserSocket.on('error', () => closeBoth());
  browserSocket.on('close', () => closeBoth());
}

function getClientDashScopeKey(req) {
  const value = req.headers['x-client-dashscope-key'];
  return Array.isArray(value) ? String(value[0] || '').trim() : String(value || '').trim();
}

function parseProxyAuthApiKey(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return '';
  }
  if (data?.type !== 'proxy.auth') {
    return '';
  }
  return typeof data.apiKey === 'string' ? data.apiKey.trim() : '';
}

function parseRealtimeEventType(text) {
  try {
    const data = JSON.parse(text);
    return typeof data?.type === 'string' ? data.type : '';
  } catch {
    return '';
  }
}

function isAllowedRealtimeClientEvent(text) {
  if (text.length > 850 * 1024) {
    return false;
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return false;
  }

  const allowedTypes = new Set([
    'session.update',
    'input_audio_buffer.append',
    'input_audio_buffer.commit',
    'input_image_buffer.append',
    'response.create',
    'response.cancel',
    'conversation.item.create',
    'conversation.item.truncate'
  ]);
  return data && allowedTypes.has(data.type);
}

function safeSend(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function buildRealtimeWebSocketUrl() {
  const base = BAILIAN_REALTIME_REGION === 'intl'
    ? 'wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime'
    : 'wss://dashscope.aliyuncs.com/api-ws/v1/realtime';
  const url = new URL(base);
  url.searchParams.set('model', BAILIAN_REALTIME_MODEL);
  return url.toString();
}

function buildWebRtcUrl() {
  const trimmed = BAILIAN_WEBRTC_ENDPOINT.trim();
  const endpoint = trimmed.startsWith('http://') || trimmed.startsWith('https://')
    ? trimmed
    : `https://${trimmed}`;
  const url = new URL(endpoint);
  if (!url.pathname || url.pathname === '/') {
    url.pathname = '/api/v1/webrtc/realtime';
  }
  url.searchParams.set('model', BAILIAN_REALTIME_MODEL);
  return url.toString();
}

async function runVisionCheck(body) {
  const imageDataUrl = typeof body.imageDataUrl === 'string' ? body.imageDataUrl : '';
  const question = String(body.question || '请确认我是否已经到达目标附近，并告诉我下一步怎么走。').trim();
  const navigationState = body.navigationState || {};

  if (!imageDataUrl.startsWith('data:image/')) {
    throw httpError(400, '没有收到有效图片。请先打开摄像头并拍一帧。');
  }

  const prompt = [
    '你是给视障者使用的现场导航确认助手。',
    '你必须同时参考地图导航状态和当前图片，但不能编造看不见的内容。',
    '请重点判断：是否看到目标、看到的是站牌/门牌/入口/路口/无关物体、目标大概在前方/左前方/右前方/身后、下一步应该停下/继续走/慢慢扫视/转身/询问路人。',
    '如果地图和图片冲突，必须明确说“冲突”，不要强行给确定结论。',
    '回答要短，适合直接语音播报。',
    '请优先输出 JSON，字段为 seen、target_type、direction、action、confidence、reason。',
    '',
    `用户问题：${question}`,
    '',
    `导航状态：${JSON.stringify(navigationState, null, 2)}`
  ].join('\n');

  if (!BAILIAN_API_KEY) {
    return {
      ok: true,
      provider: 'demo',
      configured: false,
      spokenText: '演示模式：还没有配置百炼 Key。真实测试时，我会结合当前图片和导航状态判断是否看到站牌、门牌或入口。',
      rawText: '演示模式：未调用模型。',
      parsed: {
        seen: 'unknown',
        target_type: '未调用模型',
        direction: 'unknown',
        action: '配置百炼 Key 后再测试摄像头确认。',
        confidence: 0,
        reason: 'BAILIAN_API_KEY 或 DASHSCOPE_API_KEY 未配置。'
      }
    };
  }

  const response = await fetchWithTimeout(`${BAILIAN_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${BAILIAN_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: BAILIAN_VISION_MODEL,
      messages: [
        {
          role: 'system',
          content: '你是严谨的视障导航现场确认助手。不要猜测，不要给危险过街指令。'
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageDataUrl } }
          ]
        }
      ],
      temperature: 0.1
    })
  }, 30000);

  const data = await response.json();
  if (!response.ok) {
    throw httpError(response.status, `百炼接口 HTTP 错误：${data.error?.message || response.status}`);
  }

  const rawText = data.choices?.[0]?.message?.content || '';
  const parsed = tryParseJsonObject(rawText);
  const spokenText = parsed
    ? formatVisionSpeech(parsed)
    : rawText.replace(/\s+/g, ' ').trim();

  return {
    ok: true,
    provider: 'bailian',
    configured: true,
    model: BAILIAN_VISION_MODEL,
    spokenText,
    rawText,
    parsed
  };
}

function buildTransitSummary(data, request) {
  const transits = data.route?.transits || [];
  if (!Array.isArray(transits) || transits.length === 0) {
    return {
      summaryText: '高德没有返回可用的公交方案。',
      facts: buildBaseFacts('transit', request, { unresolved: true, reason: 'no_transit_route' })
    };
  }

  const chosen = transits[0];
  const lines = [];
  const segments = [];

  lines.push(`公交方案：总距离约 ${formatMeters(chosen.distance)}，预计 ${formatDuration(chosen.duration)}。`);

  for (const [index, segment] of (chosen.segments || []).entries()) {
    const walking = segment.walking;
    if (walking && Number(walking.distance || 0) > 0) {
      const steps = normalizeArray(walking.steps).map(simplifyWalkingStep);
      lines.push(`步行段 ${index + 1}：约 ${formatMeters(walking.distance)}。`);
      for (const step of steps.slice(0, 6)) {
        lines.push(`  - ${step.instruction || step.fallback}`);
      }
      segments.push({ type: 'walk', distance: Number(walking.distance || 0), steps });
    }

    const buslines = normalizeArray(segment.bus?.buslines);
    for (const busline of buslines) {
      const name = busline.name || '未知线路';
      const departure = simplifyStop(busline.departure_stop);
      const arrival = simplifyStop(busline.arrival_stop);
      const viaNum = Number(busline.via_num || 0);
      lines.push(`乘车段 ${index + 1}：${name}，从 ${departure.name || '未知上车站'} 上车，到 ${arrival.name || '未知下车站'} 下车，途经约 ${viaNum} 个中间站。`);
      segments.push({
        type: 'vehicle',
        name,
        vehicleType: busline.type || '',
        departureStop: departure,
        arrivalStop: arrival,
        viaNum,
        viaStops: normalizeArray(busline.via_stops).map(simplifyStop)
      });
    }
  }

  const facts = buildBaseFacts('transit', request, {
    routeDistance: Number(chosen.distance || 0),
    routeDuration: Number(chosen.duration || 0),
    segments
  });

  return {
    summaryText: lines.join('\n'),
    facts
  };
}

function buildWalkingSummary(data, request) {
  const paths = data.route?.paths || [];
  if (!Array.isArray(paths) || paths.length === 0) {
    return {
      summaryText: '高德没有返回可用的步行路线。',
      facts: buildBaseFacts('walking', request, { unresolved: true, reason: 'no_walking_route' })
    };
  }

  const chosen = paths[0];
  const steps = normalizeArray(chosen.steps).map(simplifyWalkingStep);
  const lines = [
    `步行方案：总距离约 ${formatMeters(chosen.distance)}，预计 ${formatDuration(chosen.duration)}。`
  ];

  steps.forEach((step, index) => {
    lines.push(`${index + 1}. ${step.instruction || step.fallback}`);
  });

  const facts = buildBaseFacts('walking', request, {
    routeDistance: Number(chosen.distance || 0),
    routeDuration: Number(chosen.duration || 0),
    walkingSteps: steps
  });

  return {
    summaryText: lines.join('\n'),
    facts
  };
}

function buildBaseFacts(mode, request, extra) {
  return {
    provider: 'amap',
    mode,
    generatedAt: new Date().toISOString(),
    coordinateSystem: '高德 Web 服务默认使用 GCJ-02 坐标；浏览器定位可能不是同一坐标系，精确路侧测试前需要校准。',
    origin: request.origin,
    destination: request.destination,
    city: request.city,
    destinationCity: request.destinationCity || request.city,
    navigationRules: {
      doNotGuess: true,
      keepPoiPointAndRoadTouchPointSeparate: true,
      keepStopNameAndCurbsideStopPointSeparate: true,
      ifMapAndCameraConflictSayConflict: true,
      doNotGiveUnverifiedCrossingInstruction: true
    },
    ...extra
  };
}

function simplifyPoi(poi) {
  return {
    id: poi.id || '',
    name: poi.name || '',
    type: poi.type || '',
    address: normalizeTextValue(poi.address),
    location: poi.location || '',
    adname: poi.adname || '',
    cityname: poi.cityname || '',
    pname: poi.pname || '',
    entrLocation: normalizeTextValue(poi.entr_location),
    exitLocation: normalizeTextValue(poi.exit_location),
    tel: normalizeTextValue(poi.tel)
  };
}

function simplifyStop(stop) {
  if (!stop) {
    return {};
  }
  return {
    id: stop.id || '',
    name: stop.name || '',
    location: stop.location || ''
  };
}

function simplifyWalkingStep(step) {
  const road = step.road || '';
  const distance = step.distance || '';
  return {
    instruction: step.instruction || '',
    road,
    distance: Number(distance || 0),
    orientation: step.orientation || '',
    action: step.action || '',
    assistantAction: step.assistant_action || '',
    polyline: step.polyline || '',
    fallback: road ? `沿 ${road} 走约 ${formatMeters(distance)}` : `继续步行约 ${formatMeters(distance)}`
  };
}

function formatVisionSpeech(parsed) {
  const parts = [];
  if (parsed.seen !== undefined) {
    parts.push(`看到情况：${parsed.seen}`);
  }
  if (parsed.target_type) {
    parts.push(`目标类型：${parsed.target_type}`);
  }
  if (parsed.direction) {
    parts.push(`方向：${parsed.direction}`);
  }
  if (parsed.action) {
    parts.push(`下一步：${parsed.action}`);
  }
  if (parsed.reason) {
    parts.push(`依据：${parsed.reason}`);
  }
  return parts.join('。');
}

function tryParseJsonObject(text) {
  if (!text || typeof text !== 'string') {
    return null;
  }
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeCoordinate(value) {
  const text = String(value || '').trim();
  const match = text.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!match) {
    return '';
  }
  return `${match[1]},${match[2]}`;
}

function normalizeTextValue(value) {
  if (Array.isArray(value)) {
    return value.join('、');
  }
  if (value === undefined || value === null || value === '[]') {
    return '';
  }
  return String(value);
}

function normalizeArray(value) {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function formatMeters(value) {
  const meters = Number(value || 0);
  if (!Number.isFinite(meters) || meters <= 0) {
    return '0 米';
  }
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} 公里`;
  }
  return `${Math.round(meters)} 米`;
}

function formatDuration(value) {
  const seconds = Number(value || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '时间未知';
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `约 ${minutes} 分钟`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `约 ${hours} 小时 ${rest} 分钟`;
}

async function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    throw httpError(405, '只支持 GET。');
  }

  const publicRoot = path.resolve(PUBLIC_DIR);
  const relativePath = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.replace(/^\/+/, ''));
  const filePath = path.resolve(publicRoot, relativePath);

  if (!filePath.startsWith(publicRoot)) {
    throw httpError(403, '拒绝访问。');
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw httpError(404, '文件不存在。');
  }

  res.writeHead(200, {
    'Content-Type': contentTypeFor(filePath),
    'Cache-Control': 'no-store'
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg'
  }[ext] || 'application/octet-stream';
}

async function readJsonBody(req, maxBytes = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      throw httpError(413, '请求内容太大。');
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw httpError(400, '请求 JSON 格式不正确。');
  }
}

async function readTextBody(req, maxBytes = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      throw httpError(413, '请求内容太大。');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload, null, 2));
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) {
      continue;
    }
    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

class SerialQueue {
  constructor(minIntervalMs) {
    this.minIntervalMs = Math.max(0, Number(minIntervalMs || 0));
    this.lastRunAt = 0;
    this.tail = Promise.resolve();
  }

  run(task) {
    const next = this.tail.then(async () => {
      const waitMs = Math.max(0, this.minIntervalMs - (Date.now() - this.lastRunAt));
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
      try {
        return await task();
      } finally {
        this.lastRunAt = Date.now();
      }
    });
    this.tail = next.catch(() => {});
    return next;
  }
}

amapQueue = new SerialQueue(AMAP_MIN_INTERVAL_MS);
