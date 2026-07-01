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
const DEPLOY_MARKER = 'manual-ws-20260624-1';

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
    realtimeWebRtcConfigured: Boolean(BAILIAN_API_KEY && BAILIAN_WEBRTC_ENDPOINT),
    deployMarker: DEPLOY_MARKER
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
    if (requestUrl.pathname !== '/api/realtime/ws' && requestUrl.pathname !== '/api/ws') {
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
module.exports.createBrowserRealtimeServer = createBrowserRealtimeServer;
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
      deployMarker: DEPLOY_MARKER,
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
      deployMarker: DEPLOY_MARKER,
      webSocketPath: '/api/ws',
      webRtcSdpPath: '/api/realtime/sdp'
    });
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/realtime/sdp') {
    const offerSdp = await readTextBody(req, 1024 * 1024);
    const answerSdp = await exchangeWebRtcSdp(offerSdp, getClientDashScopeKey(req), getClientBailianEndpoint(req));
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
      ? await buildWalkingSummary(data, { origin, destination, city, originPoi: body.originPoi, destinationPoi: body.destinationPoi })
      : await buildTransitSummary(data, { origin, destination, city, destinationCity, originPoi: body.originPoi, destinationPoi: body.destinationPoi });

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

async function exchangeWebRtcSdp(offerSdp, clientApiKey = '', clientEndpoint = '') {
  const apiKey = clientApiKey || BAILIAN_API_KEY;
  const endpoint = clientEndpoint || BAILIAN_WEBRTC_ENDPOINT;
  if (!apiKey) {
    throw httpError(500, '还没有配置 BAILIAN_API_KEY 或 DASHSCOPE_API_KEY。');
  }
  if (!endpoint) {
    throw httpError(500, '还没有配置 BAILIAN_WEBRTC_ENDPOINT。百炼 WebRTC 接入需要官方白名单 Endpoint。');
  }
  if (!offerSdp || !offerSdp.includes('v=0')) {
    throw httpError(400, '没有收到有效的 WebRTC offer SDP。');
  }

  const url = buildWebRtcUrl(endpoint);
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
    const eventType = parseRealtimeEventType(text) || 'unknown';
    const shouldLogEvent =
      clientEventCount === 1 ||
      clientEventCount % 50 === 0 ||
      !eventType.endsWith('.append');
    if (shouldLogEvent) {
      console.log(`[realtime:${connectionId}] client event #${clientEventCount}; type=${eventType}; upstreamOpen=${upstreamOpen}`);
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

function getClientBailianEndpoint(req) {
  const value = req.headers['x-client-bailian-endpoint'];
  const endpoint = Array.isArray(value) ? String(value[0] || '').trim() : String(value || '').trim();
  if (!endpoint) {
    return '';
  }
  return normalizeBailianEndpoint(endpoint);
}

function normalizeBailianEndpoint(endpoint) {
  const candidate = endpoint.startsWith('http://') || endpoint.startsWith('https://')
    ? endpoint
    : `https://${endpoint}`;
  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw httpError(400, '百炼 WebRTC Endpoint 格式不正确。');
  }
  if (url.protocol !== 'https:') {
    throw httpError(400, '百炼 WebRTC Endpoint 必须使用 HTTPS。');
  }
  if (!url.hostname.endsWith('.maas.aliyuncs.com')) {
    throw httpError(400, '百炼 WebRTC Endpoint 必须是阿里云 maas.aliyuncs.com 域名。');
  }
  url.hostname = normalizeBailianWebRtcHostname(url.hostname);
  return `${url.hostname}${url.pathname && url.pathname !== '/' ? url.pathname : ''}`;
}

function normalizeBailianWebRtcHostname(hostname) {
  // Aliyun support confirmed the WebRTC workspace endpoint may omit the earlier "llm-" prefix.
  return hostname.startsWith('llm-ws-') ? hostname.replace(/^llm-/, '') : hostname;
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

function buildWebRtcUrl(endpoint = BAILIAN_WEBRTC_ENDPOINT) {
  const trimmed = endpoint.trim();
  const endpointUrl = trimmed.startsWith('http://') || trimmed.startsWith('https://')
    ? trimmed
    : `https://${trimmed}`;
  const url = new URL(endpointUrl);
  url.hostname = normalizeBailianWebRtcHostname(url.hostname);
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

async function buildTransitSummary(data, request) {
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
      const steps = await enrichWalkingStepsWithRoadAnchors(normalizeArray(walking.steps).map(simplifyWalkingStep));
      lines.push(`步行段 ${index + 1}：约 ${formatMeters(walking.distance)}。`);
      for (const step of steps.slice(0, 6)) {
        lines.push(`  - ${step.instruction || step.fallback}`);
      }
      segments.push({
        type: 'walk',
        distance: Number(walking.distance || 0),
        steps,
        origin: normalizeCoordinate(walking.origin),
        destination: normalizeCoordinate(walking.destination),
        role: ''
      });
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

  const transitPlan = await buildTransitThreePartPlan(segments, request);

  const facts = buildBaseFacts('transit', request, {
    routeDistance: Number(chosen.distance || 0),
    routeDuration: Number(chosen.duration || 0),
    segments,
    transitPlan
  });

  return {
    summaryText: lines.join('\n'),
    ...await buildAccessibleNavigationResult(facts),
    facts
  };
}

async function buildTransitThreePartPlan(segments, request) {
  const vehicleEntries = segments
    .map((segment, index) => ({ segment, index }))
    .filter((entry) => entry.segment.type === 'vehicle');
  if (!vehicleEntries.length) {
    return {
      available: false,
      reason: 'no_vehicle_segment',
      originalSegments: segments
    };
  }

  const firstVehicleIndex = vehicleEntries[0].index;
  const lastVehicleIndex = vehicleEntries[vehicleEntries.length - 1].index;
  const initialWalk = segments.find((segment, index) => segment.type === 'walk' && index < firstVehicleIndex) || null;
  const finalWalk = [...segments].reverse().find((segment, reverseIndex) => {
    const index = segments.length - 1 - reverseIndex;
    return segment.type === 'walk' && index > lastVehicleIndex;
  }) || null;
  const transferWalks = segments
    .map((segment, index) => ({ ...segment, segmentIndex: index }))
    .filter((segment) => segment.type === 'walk' && segment.segmentIndex > firstVehicleIndex && segment.segmentIndex < lastVehicleIndex);

  const vehicles = vehicleEntries.map((entry) => ({ ...entry.segment, segmentIndex: entry.index }));
  const boardingStop = vehicles[0]?.departureStop || {};
  const arrivalStop = vehicles[vehicles.length - 1]?.arrivalStop || {};
  const finalExitHint = extractMetroExitHintFromPoi(request.destinationPoi);
  const finalExitResolution = finalExitHint
    ? await resolveMetroExitPoi(finalExitHint, request)
    : { hint: null, poi: null, locked: false, reason: 'no_exit_hint' };

  let finalWalkForRender = finalWalk;
  let finalWalkSource = finalWalk ? 'amap_transit_segment' : 'missing';
  const finalExitCoordinate = getPoiNavigationCoordinate(finalExitResolution.poi);
  if (finalExitCoordinate && request.destination) {
    try {
      const replannedFinalWalk = await fetchWalkingLeg(finalExitCoordinate, request.destination);
      if (replannedFinalWalk?.steps?.length) {
        finalWalkForRender = {
          ...replannedFinalWalk,
          type: 'walk',
          role: 'final',
          origin: finalExitCoordinate,
          destination: request.destination,
          source: 'exit_replanned'
        };
        finalWalkSource = 'exit_replanned';
      }
    } catch (error) {
      finalExitResolution.walkReplanError = error.message || String(error);
    }
  }

  return {
    available: true,
    initialWalk: initialWalk ? { ...initialWalk, role: 'initial' } : null,
    vehicles,
    transferWalks,
    finalWalk: finalWalkForRender ? { ...finalWalkForRender, role: 'final' } : null,
    boardingStop,
    arrivalStop,
    finalExit: finalExitResolution,
    finalWalkSource
  };
}

function extractMetroExitHintFromPoi(poi) {
  if (!poi) {
    return null;
  }
  const text = [poi.address, poi.name].map(normalizeTextValue).filter(Boolean).join(' ');
  if (!text) {
    return null;
  }
  const matches = [...text.matchAll(/(?:^|[（(，,；;\s])([^（）()，,；;\s]{1,20}?)(?:地铁站|站)\s*([0-9一二三四五六七八九十两]+号口)/g)];
  if (!matches.length) {
    return null;
  }
  const match = matches[matches.length - 1];
  const stationName = normalizeMetroStationName(match[1]);
  const exitName = normalizeExitName(match[2]);
  if (!stationName || !exitName) {
    return null;
  }
  return {
    stationName,
    exitName,
    keyword: `${stationName}地铁站${exitName}`,
    sourceText: match[0].trim()
  };
}

function normalizeMetroStationName(value) {
  return normalizeTextValue(value)
    .replace(/[（(].*$/, '')
    .replace(/地铁站$/, '')
    .replace(/站$/, '')
    .trim();
}

function normalizeExitName(value) {
  const text = normalizeTextValue(value).trim();
  const match = text.match(/([0-9一二三四五六七八九十两]+)号口/);
  if (!match) {
    return text;
  }
  const numberText = normalizeChineseNumber(match[1]);
  return `${numberText}号口`;
}

function normalizeChineseNumber(value) {
  const text = normalizeTextValue(value);
  if (/^\d+$/.test(text)) {
    return text;
  }
  const digits = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9
  };
  if (text === '十') {
    return '10';
  }
  const tenMatch = text.match(/^十([一二两三四五六七八九])$/);
  if (tenMatch) {
    return String(10 + digits[tenMatch[1]]);
  }
  const compoundMatch = text.match(/^([一二两三四五六七八九])十([一二两三四五六七八九])?$/);
  if (compoundMatch) {
    return String(digits[compoundMatch[1]] * 10 + (compoundMatch[2] ? digits[compoundMatch[2]] : 0));
  }
  return String(digits[text] || text);
}

async function resolveMetroExitPoi(hint, request) {
  const result = {
    hint,
    poi: null,
    locked: false,
    reason: ''
  };
  try {
    const data = await callAmap('/v3/place/text', {
      keywords: hint.keyword,
      city: request.destinationCity || request.city || '上海',
      citylimit: 'true',
      offset: '10',
      page: '1',
      extensions: 'all'
    });
    const pois = Array.isArray(data.pois) ? data.pois.map(simplifyPoi) : [];
    result.candidates = pois.slice(0, 5).map((poi) => ({
      name: poi.name,
      address: poi.address,
      location: poi.location,
      entrLocation: poi.entrLocation
    }));
    const selected = chooseMetroExitPoi(pois, hint);
    if (!selected) {
      result.reason = 'exit_poi_not_found';
      return result;
    }
    result.poi = selected;
    result.locked = Boolean(getPoiNavigationCoordinate(selected));
    result.reason = result.locked ? 'exit_poi_locked' : 'exit_poi_without_coordinate';
    return result;
  } catch (error) {
    result.reason = 'exit_poi_search_failed';
    result.error = error.message || String(error);
    return result;
  }
}

function chooseMetroExitPoi(pois, hint) {
  const exitNumber = normalizeExitName(hint.exitName).replace('号口', '');
  const scored = pois
    .map((poi, index) => {
      const text = `${normalizeTextValue(poi.name)} ${normalizeTextValue(poi.address)} ${normalizeTextValue(poi.type)}`;
      let score = 0;
      if (text.includes(hint.stationName)) score += 4;
      if (text.includes(hint.exitName)) score += 5;
      if (new RegExp(`${exitNumber}\\s*号?口`).test(text)) score += 4;
      if (/地铁|轨道交通|出入口|地铁站/.test(text)) score += 2;
      if (getPoiNavigationCoordinate(poi)) score += 2;
      return { poi, score, index };
    })
    .filter((item) => item.score >= 7)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  return scored[0]?.poi || null;
}

function getPoiNavigationCoordinate(poi) {
  return normalizeCoordinate(poi?.entrLocation) || normalizeCoordinate(poi?.location);
}

async function fetchWalkingLeg(origin, destination) {
  const data = await callAmap('/v3/direction/walking', { origin, destination });
  const paths = data.route?.paths || [];
  if (!Array.isArray(paths) || !paths.length) {
    return null;
  }
  const chosen = paths[0];
  const steps = await enrichWalkingStepsWithRoadAnchors(normalizeArray(chosen.steps).map(simplifyWalkingStep));
  return {
    distance: Number(chosen.distance || 0),
    duration: Number(chosen.duration || 0),
    steps
  };
}

async function buildWalkingSummary(data, request) {
  const paths = data.route?.paths || [];
  if (!Array.isArray(paths) || paths.length === 0) {
    return {
      summaryText: '高德没有返回可用的步行路线。',
      facts: buildBaseFacts('walking', request, { unresolved: true, reason: 'no_walking_route' })
    };
  }

  const chosen = paths[0];
  const steps = await enrichWalkingStepsWithRoadAnchors(normalizeArray(chosen.steps).map(simplifyWalkingStep));
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
    ...await buildAccessibleNavigationResult(facts),
    facts
  };
}

async function buildAccessibleNavigationScript(facts) {
  const result = await buildAccessibleNavigationResult(facts);
  return result.accessibleScript;
}

async function buildAccessibleNavigationResult(facts) {
  const lines = [
    '执行路线：'
  ];
  const collector = createRouteStepCollector(facts);

  if (facts.mode === 'transit') {
    const transitPlan = facts.transitPlan;
    if (transitPlan?.available) {
      lines.push('总流程：三段体。第一段到上车站，第二段乘车和换乘，第三段从下车站指定出口到目的地。');
      lines.push('');

      lines.push('第一段：从起点到上车地铁站。');
      if (transitPlan.initialWalk?.steps?.length) {
        const firstWalkFacts = buildTransitWalkFacts(facts, {
          origin: facts.origin,
          originPoi: facts.originPoi,
          destination: getStopCoordinate(transitPlan.boardingStop) || transitPlan.initialWalk.destination || '',
          destinationPoi: buildStopPoi(transitPlan.boardingStop, '上车站')
        });
        lines.push(...await renderAccessibleWalkLeg(transitPlan.initialWalk.steps || [], '第一段步行', transitPlan.initialWalk.distance, firstWalkFacts, {
          collector,
          legIndex: 0,
          legLabel: '第一段步行'
        }));
      } else {
        lines.push('第一段步行：高德没有返回可拆分步行段；到上车站附近后，用站名和现场导向确认入口。');
      }
      lines.push('');

      lines.push('第二段：地铁乘车和换乘。');
      lines.push(...renderAccessibleTransitRideSection(transitPlan));
      lines.push('');

      lines.push('第三段：从下车站指定出口到目的地。');
      lines.push(...renderFinalExitLockLines(transitPlan));
      if (transitPlan.finalWalk?.steps?.length) {
        const finalOriginPoi = transitPlan.finalExit?.locked
          ? transitPlan.finalExit.poi
          : buildStopPoi(transitPlan.arrivalStop, '下车站');
        const finalWalkFacts = buildTransitWalkFacts(facts, {
          origin: getPoiNavigationCoordinate(finalOriginPoi) || getStopCoordinate(transitPlan.arrivalStop) || transitPlan.finalWalk.origin || '',
          originPoi: finalOriginPoi,
          destination: facts.destination,
          destinationPoi: facts.destinationPoi
        });
        lines.push(...await renderAccessibleWalkLeg(transitPlan.finalWalk.steps || [], '第三段步行', transitPlan.finalWalk.distance, finalWalkFacts, {
          collector,
          legIndex: 2,
          legLabel: '第三段步行'
        }));
      } else {
        lines.push('第三段步行：高德没有返回下车后步行细节；到站后先按站内导向确认出口，再用慧眼确认目的地入口。');
      }
    } else {
      lines.push('总流程：先完成起点到上车站的步行段，再乘车，最后完成下车站到目的地的步行段。');
      lines.push('公交站提醒：站名不等于站杆所在马路一侧。当前如果没有单独站杆路侧坐标，不能直接说“沿左边/右边就能找到站”。');
      lines.push('');

      for (const [index, segment] of (facts.segments || []).entries()) {
        if (segment.type === 'walk') {
          lines.push(...await renderAccessibleWalkLeg(segment.steps || [], `步行段 ${index + 1}`, segment.distance, facts, {
            collector,
            legIndex: index,
            legLabel: `步行段 ${index + 1}`
          }));
        } else if (segment.type === 'vehicle') {
          lines.push(...renderAccessibleVehicleLeg(segment, `乘车段 ${index + 1}`));
        }
        lines.push('');
      }
    }
  } else if (facts.mode === 'walking') {
    lines.push(...await renderAccessibleWalkLeg(facts.walkingSteps || [], '全程步行段', facts.routeDistance, facts, {
      collector,
      legIndex: 0,
      legLabel: '全程步行段'
    }));
  } else {
    lines.push('当前路线类型不是步行或公交，暂时无法转换成上海步行导航稿。');
  }

  lines.push('终点确认：到门牌、站牌或入口标识附近后，用慧眼确认最终门口。');
  return {
    accessibleScript: lines.join('\n'),
    structuredRoute: collector.route
  };
}

function renderAccessibleVehicleLeg(segment, label) {
  const departure = segment.departureStop?.name || '未知上车站';
  const arrival = segment.arrivalStop?.name || '未知下车站';
  const name = segment.name || '未知线路';
  const viaNum = Number(segment.viaNum || 0);
  return [
    `${label}：乘坐 ${name}。`,
    `上车站：${departure}。当前只锁定站名，未锁定站杆在马路哪一侧；到站附近必须用站牌或现场声音确认。`,
    `下车站：${arrival}。途经约 ${viaNum} 个中间站后下车。`,
    '下车后不要立刻按东西南北走，先确认自己站在道路哪一侧，再进入下一段步行。'
  ];
}

function renderAccessibleTransitRideSection(transitPlan) {
  const lines = [];
  const vehicles = transitPlan.vehicles || [];
  if (!vehicles.length) {
    return ['高德没有返回可用乘车段。'];
  }
  vehicles.forEach((segment, index) => {
    const departure = segment.departureStop?.name || '未知上车站';
    const arrival = segment.arrivalStop?.name || '未知下车站';
    const name = segment.name || '未知线路';
    const viaNum = Number(segment.viaNum || 0);
    const viaStops = (segment.viaStops || []).map((stop) => stop.name).filter(Boolean);
    lines.push(`${index + 1}. 乘坐 ${name}，从 ${departure} 上车，到 ${arrival} 下车，途经约 ${viaNum} 个中间站。`);
    if (viaStops.length) {
      lines.push(`   途经站：${viaStops.join('、')}。`);
    }
    const transferWalk = (transitPlan.transferWalks || [])[index];
    const nextVehicle = vehicles[index + 1];
    if (nextVehicle) {
      const transferDistance = transferWalk ? formatMeters(transferWalk.distance) : '距离未知';
      const nextName = nextVehicle.name || '下一条线路';
      const nextDeparture = nextVehicle.departureStop?.name || arrival;
      lines.push(`   在 ${arrival} 换乘 ${nextName}；站内换乘步行约 ${transferDistance}，跟随站内导向到 ${nextDeparture} 的站台。`);
    }
  });
  const finalArrival = vehicles[vehicles.length - 1]?.arrivalStop?.name || '';
  if (finalArrival) {
    lines.push(`到 ${finalArrival} 下车后，先按站内导向找出口；不要把站厅中心点当成第三段起点。`);
  }
  return lines;
}

function renderFinalExitLockLines(transitPlan) {
  const lines = [];
  const exit = transitPlan.finalExit;
  if (exit?.locked && exit.poi) {
    const hintText = exit.hint ? `${exit.hint.stationName}站${exit.hint.exitName}` : exit.poi.name;
    lines.push(`已锁定出站口：高德目的地提示使用 ${hintText}；第三段以这个出口作为起点。`);
    lines.push('出站后先站在口外面对马路，再按下面的步行段走。');
    if (transitPlan.finalWalkSource === 'exit_replanned') {
      lines.push('第三段步行已按这个出口坐标重新规划，不使用站厅中心点。');
    }
  } else if (exit?.hint) {
    lines.push(`目的地信息提示 ${exit.hint.stationName}站${exit.hint.exitName}，但当前没有锁定到可用出口坐标。`);
    lines.push('第三段暂用高德原始下车后步行段；到站后先按站内导向确认出口。');
  } else {
    lines.push('当前目的地信息没有明确出站口；第三段暂用高德原始下车后步行段。');
  }
  return lines;
}

function buildTransitWalkFacts(facts, overrides = {}) {
  return {
    ...facts,
    ...overrides,
    mode: 'walking'
  };
}

function getStopCoordinate(stop) {
  return normalizeCoordinate(stop?.location);
}

function buildStopPoi(stop, fallbackName) {
  const name = normalizeTextValue(stop?.name) || fallbackName || '站点';
  const location = getStopCoordinate(stop);
  return {
    id: normalizeTextValue(stop?.id),
    name,
    type: 'transit_stop',
    address: name,
    streetNumber: '',
    streetNumberParity: '',
    location,
    entrLocation: location,
    exitLocation: '',
    adname: '',
    cityname: '',
    pname: '',
    tel: ''
  };
}

function createRouteStepCollector(facts) {
  return {
    route: {
      schemaVersion: 1,
      provider: facts.provider || 'amap',
      mode: facts.mode || '',
      coordinateSystem: 'GCJ-02',
      generatedAt: facts.generatedAt || new Date().toISOString(),
      routeDistanceMeters: Number(facts.routeDistance || 0),
      routeDurationSeconds: Number(facts.routeDuration || 0),
      origin: {
        location: facts.origin || '',
        name: facts.originPoi?.name || ''
      },
      destination: {
        location: facts.destination || '',
        name: facts.destinationPoi?.name || '',
        entrLocation: facts.destinationPoi?.entrLocation || '',
        address: facts.destinationPoi?.address || ''
      },
      principle: 'GPS播报消费无障碍路线；polyline只作为同源定位骨架，不重新生成路线。',
      followSteps: []
    }
  };
}

function addStructuredWalkStep(options, input) {
  const collector = options?.collector;
  if (!collector?.route?.followSteps || !Array.isArray(input?.sourceStepIndexes)) {
    return;
  }
  const sourceIndexes = input.sourceStepIndexes
    .filter((index) => Number.isInteger(index) && index >= 0)
    .filter((index, position, array) => array.indexOf(index) === position);
  if (!sourceIndexes.length) {
    return;
  }
  const sourceSteps = sourceIndexes.map((index) => input.steps?.[index]).filter(Boolean);
  const polyline = combineStepPolylines(sourceSteps);
  const endpoints = getPolylineEndpoints(polyline);
  const distanceMeters = input.distanceMeters !== undefined
    ? Number(input.distanceMeters || 0)
    : sourceSteps.reduce((sum, step) => sum + Number(step?.distance || 0), 0);
  const followStep = {
    id: `${options.legLabel || 'walk'}-${collector.route.followSteps.length + 1}`,
    kind: input.kind || 'walk',
    legIndex: Number(options.legIndex || 0),
    legLabel: options.legLabel || '',
    lineNumber: input.lineNumber || 0,
    sourceStepIndexes: sourceIndexes,
    sourceStepCount: sourceSteps.length,
    roadName: normalizeTextValue(input.roadName),
    targetRoadName: normalizeTextValue(input.targetRoadName),
    roadSide: normalizeSideValue(input.roadSide),
    nextRoadSide: normalizeSideValue(input.nextRoadSide),
    distanceMeters,
    polyline,
    startLocation: endpoints.start,
    endLocation: endpoints.end,
    turnPoint: normalizeCoordinate(input.turnPoint) || '',
    turnDirection: input.turnDirection || '',
    turnSize: input.turnSize || '',
    crossingCount: Number.isFinite(Number(input.crossingCount)) ? Number(input.crossingCount) : 0,
    crossingRoads: Array.isArray(input.crossingRoads) ? input.crossingRoads.filter(Boolean) : [],
    destinationSide: normalizeSideValue(input.destinationSide),
    spokenText: input.spokenText || '',
    announce: buildDefaultAnnouncement(input.kind || 'walk')
  };
  collector.route.followSteps.push(followStep);
}

function buildDefaultAnnouncement(kind) {
  if (kind === 'turn') {
    return {
      onEnter: false,
      beforeTurnMeters: [30, 15, 5],
      arrivalMeters: 0
    };
  }
  if (kind === 'finalApproach') {
    return {
      onEnter: true,
      beforeTurnMeters: [],
      arrivalMeters: 20
    };
  }
  return {
    onEnter: true,
    beforeTurnMeters: [],
    arrivalMeters: 0
  };
}

function normalizeSideValue(side) {
  return side === 'left' || side === 'right' ? side : '';
}

function combineStepPolylines(steps) {
  const points = [];
  for (const step of steps) {
    for (const point of String(step?.polyline || '').split(';').filter(Boolean)) {
      if (point && points[points.length - 1] !== point) {
        points.push(point);
      }
    }
  }
  return points.join(';');
}

function getPolylineEndpoints(polyline) {
  const points = String(polyline || '').split(';').filter(Boolean);
  return {
    start: points[0] || '',
    end: points[points.length - 1] || ''
  };
}

function getTurnPointFromSteps(step, nextStep) {
  const currentEnd = getPolylineEndpoints(step?.polyline).end;
  const nextStart = getPolylineEndpoints(nextStep?.polyline).start;
  return currentEnd || nextStart || '';
}

function inferTurnSizeFromText(text, currentSide, turnDirection) {
  if (/大转弯/.test(text)) {
    return 'big';
  }
  if (/小转弯/.test(text)) {
    return 'small';
  }
  if (currentSide && turnDirection) {
    return currentSide === turnDirection ? 'small' : 'big';
  }
  return '';
}

function inferCrossingCountFromText(text) {
  const matches = String(text || '').match(/过[^，。；：]*一次/g);
  return matches ? matches.length : 0;
}

function getCrossingRoadNames(step, currentRoad, targetRoad = '', futureRoadName = '') {
  return uniqueRoadNames(step?.inferredCrossRoads || [])
    .filter((road) => !sameRoadName(road, currentRoad))
    .filter((road) => !sameRoadName(road, targetRoad))
    .filter((road) => !sameRoadName(road, futureRoadName));
}

async function renderAccessibleWalkLeg(steps, label, distance, facts = {}, options = {}) {
  const lines = [
    `${label}，约 ${formatMeters(distance || sumStepDistance(steps))}。`
  ];

  if (!steps.length) {
    lines.push('地图没有返回可拆分的小步，无法生成步行动作脚本。');
    return lines;
  }

  const routeState = initWalkingRouteState(steps, facts);
  const destinationSideEvidence = await inferDestinationSideForRoute(facts, steps);
  routeState.destinationSide = destinationSideEvidence.side || '';
  let lineNumber = 1;

  if (routeState.startLines.length) {
    for (const [startLineIndex, line] of routeState.startLines.entries()) {
      lines.push(`${lineNumber}. ${line}`);
      addStructuredWalkStep(options, {
        kind: startLineIndex === 0 ? 'startConnector' : 'walk',
        lineNumber,
        spokenText: line,
        steps,
        sourceStepIndexes: [startLineIndex === 0 ? 0 : 1],
        roadName: startLineIndex === 0 ? routeState.currentRoad : normalizeTextValue(steps[1]?.road) || routeState.currentRoad,
        roadSide: startLineIndex === 0 ? '' : routeState.currentSide,
        distanceMeters: Number(steps[startLineIndex === 0 ? 0 : 1]?.distance || 0)
      });
      lineNumber += 1;
    }
  }

  for (let index = routeState.nextStepIndex; index < steps.length; index += 1) {
    const step = steps[index];
    const nextStep = steps[index + 1];
    const road = normalizeTextValue(step.road);
    if (road) {
      routeState.currentRoad = road;
      if (routeState.destinationSide && isFinalRoad(road, facts, steps)) {
        routeState.currentSide = routeState.destinationSide;
      }
    }

    if (road && step.distance > 0 && index !== routeState.walkAlreadyRenderedIndex) {
      const nextRoadName = normalizeTextValue(nextStep?.road);
      const targetText = nextRoadName ? buildRoadJunctionText(road, nextRoadName) : '';
      const futureRoadName = findNextNamedRoad(steps, index + 1);
      const crossText = buildCrossingRoadText(step, road, nextRoadName, futureRoadName);
      const destinationText = routeState.destinationName ? `，到${routeState.destinationName}附近` : '，到目的地附近';
      const arrivalText = isArrivalStep(step) ? destinationText : '';
      const sideText = routeState.currentSide ? `${road}${roadSideText(routeState.currentSide)}` : road;
      const spokenText = `沿${sideText}走约 ${formatMeters(step.distance)}${crossText}${targetText}${arrivalText}。`;
      lines.push(`${lineNumber}. ${spokenText}`);
      const crossingRoads = getCrossingRoadNames(step, road, nextRoadName, futureRoadName);
      addStructuredWalkStep(options, {
        kind: isArrivalStep(step) ? 'finalApproach' : 'walk',
        lineNumber,
        spokenText,
        steps,
        sourceStepIndexes: [index],
        roadName: road,
        roadSide: routeState.currentSide || '',
        distanceMeters: step.distance,
        crossingRoads,
        crossingCount: crossingRoads.length,
        destinationSide: isArrivalStep(step) ? routeState.destinationSide : ''
      });
      lineNumber += 1;
    } else if (!road && step.distance > 0 && index !== routeState.walkAlreadyRenderedIndex) {
      const futureRoadName = findNextNamedRoad(steps, index + 1);
      const inferredText = describeInferredRoadStep(step, routeState, nextStep, futureRoadName);
      if (inferredText) {
        lines.push(`${lineNumber}. ${inferredText}`);
        const currentRoad = routeState.currentRoad || inferMainRoadByNearestDistance(step) || '未标路名连接段';
        const crossingRoads = getCrossingRoadNames(step, currentRoad, getLastInferredRoad(step), futureRoadName);
        addStructuredWalkStep(options, {
          kind: 'walk',
          lineNumber,
          spokenText: inferredText,
          steps,
          sourceStepIndexes: [index],
          roadName: currentRoad,
          roadSide: routeState.currentSide || '',
          distanceMeters: step.distance,
          crossingRoads,
          crossingCount: crossingRoads.length
        });
        lineNumber += 1;
        const lastRoad = getLastInferredRoad(step);
        const nextRoadForApproach = normalizeTextValue(nextStep?.road);
        if (lastRoad && !sameRoadName(lastRoad, nextRoadForApproach)) {
          routeState.approachRoad = lastRoad;
        }
      }
    }

    const turnDirection = getTurnDirection(step, nextStep);
    const targetRoad = normalizeTextValue(nextStep?.road);
    if (turnDirection && targetRoad) {
      const preferredTargetSide = routeState.destinationSide && isFinalRoad(targetRoad, facts, steps)
        ? routeState.destinationSide
        : inferPreferredSideForRoad(steps, index + 1);
      const currentForNamedTurn = routeState.currentRoad || road || routeState.approachRoad || '未命名通道';
      const turn = describeSideAwareTurn(currentForNamedTurn, targetRoad, routeState.currentSide, turnDirection, preferredTargetSide);
      lines.push(`${lineNumber}. ${turn.text}`);
      addStructuredWalkStep(options, {
        kind: 'turn',
        lineNumber,
        spokenText: turn.text,
        steps,
        sourceStepIndexes: [index, index + 1],
        roadName: currentForNamedTurn,
        targetRoadName: targetRoad,
        roadSide: routeState.currentSide || '',
        nextRoadSide: turn.nextSide || '',
        turnDirection,
        turnSize: inferTurnSizeFromText(turn.text, routeState.currentSide, turnDirection),
        turnPoint: getTurnPointFromSteps(step, nextStep),
        distanceMeters: 0,
        crossingCount: inferCrossingCountFromText(turn.text)
      });
      lineNumber += 1;
      routeState.currentRoad = targetRoad;
      routeState.currentSide = turn.nextSide || routeState.currentSide;
      routeState.approachRoad = '';
    } else if (turnDirection && nextStep && !targetRoad) {
      const currentForUnnamedTurnSource = road ? 'step' : routeState.currentRoad ? 'state' : routeState.approachRoad ? 'approach' : 'unnamed';
      const currentForUnnamedTurn = road || routeState.currentRoad || routeState.approachRoad || '未命名通道';
      if (isTerminalUnnamedApproach(steps, index + 1)) {
        const terminalText = describeTerminalUnnamedApproach(currentForUnnamedTurn, routeState.currentSide, turnDirection, steps.slice(index + 1), routeState.destinationName);
        lines.push(`${lineNumber}. ${terminalText}`);
        const remainingIndexes = steps.slice(index + 1).map((_, offset) => index + 1 + offset);
        addStructuredWalkStep(options, {
          kind: 'finalApproach',
          lineNumber,
          spokenText: terminalText,
          steps,
          sourceStepIndexes: [index, ...remainingIndexes],
          roadName: currentForUnnamedTurn,
          roadSide: routeState.currentSide || '',
          distanceMeters: steps.slice(index + 1).reduce((sum, item) => sum + Number(item?.distance || 0), 0),
          turnDirection,
          turnSize: inferTurnSizeFromText(terminalText, routeState.currentSide, turnDirection),
          turnPoint: getTurnPointFromSteps(step, nextStep),
          destinationSide: routeState.destinationSide
        });
        lineNumber += 1;
        break;
      }
      const continuedCurrentRoad = inferContinuedCurrentRoad(nextStep, currentForUnnamedTurn);
      const recoveredTargetRoad = continuedCurrentRoad || inferRecoveredTargetRoad(nextStep, steps[index + 2], currentForUnnamedTurn);
      const connectorTargetRoad = findNextNamedRoad(steps, index + 1);
      const unnamedTurn = continuedCurrentRoad
        ? describeTurnWithUnnamedContinuation(currentForUnnamedTurn, routeState.currentSide, turnDirection, currentForUnnamedTurnSource)
        : recoveredTargetRoad
        ? describeTurnIntoRecoveredRoad(currentForUnnamedTurn, recoveredTargetRoad, routeState.currentSide, turnDirection)
        : describeTurnIntoUnnamedPath(currentForUnnamedTurn, routeState.currentSide, turnDirection, connectorTargetRoad);
      lines.push(`${lineNumber}. ${unnamedTurn.text}`);
      addStructuredWalkStep(options, {
        kind: 'turn',
        lineNumber,
        spokenText: unnamedTurn.text,
        steps,
        sourceStepIndexes: [index, index + 1],
        roadName: currentForUnnamedTurn,
        targetRoadName: recoveredTargetRoad || continuedCurrentRoad || connectorTargetRoad || '未标路名连接段',
        roadSide: routeState.currentSide || '',
        nextRoadSide: unnamedTurn.nextSide || '',
        turnDirection,
        turnSize: inferTurnSizeFromText(unnamedTurn.text, routeState.currentSide, turnDirection),
        turnPoint: getTurnPointFromSteps(step, nextStep),
        distanceMeters: 0,
        crossingCount: inferCrossingCountFromText(unnamedTurn.text)
      });
      lineNumber += 1;
      routeState.unnamedFromRoad = recoveredTargetRoad ? '' : (currentForUnnamedTurn === '未命名通道' ? '' : currentForUnnamedTurn);
      routeState.currentRoad = recoveredTargetRoad || continuedCurrentRoad || '未标路名连接段';
      routeState.currentSide = unnamedTurn.nextSide || '';
      routeState.approachRoad = '';
    } else if (isArrivalStep(step) && !road) {
      const destinationText = routeState.destinationName ? `到${routeState.destinationName}附近` : '到目的地附近';
      const finalText = describeFinalApproach(step, routeState.currentRoad, routeState.currentSide, destinationText);
      lines.push(`${lineNumber}. ${finalText}`);
      addStructuredWalkStep(options, {
        kind: 'finalApproach',
        lineNumber,
        spokenText: finalText,
        steps,
        sourceStepIndexes: [index],
        roadName: routeState.currentRoad || '未标路名连接段',
        roadSide: routeState.currentSide || '',
        distanceMeters: step.distance,
        destinationSide: routeState.destinationSide
      });
      lineNumber += 1;
    }
  }

  const finalDestinationEvidence = buildDestinationEvidence(
    facts.destinationPoi,
    destinationSideEvidence,
    getFinalRoadStep(steps)
  );
  if (finalDestinationEvidence) {
    lines.push(`${lineNumber}. 终点锚点：${finalDestinationEvidence}`);
  }

  return lines;
}

function initWalkingRouteState(steps, facts = {}) {
  const state = {
    currentRoad: '',
    currentSide: '',
    approachRoad: '',
    unnamedFromRoad: '',
    destinationName: facts.destinationPoi?.name || '',
    nextStepIndex: 0,
    walkAlreadyRenderedIndex: -1,
    startLines: []
  };
  const first = steps[0];
  const second = steps[1];
  if (!first || !second || normalizeTextValue(first.road)) {
    return state;
  }
  const direction = getTurnDirection(first, second);
  if (!direction) {
    return state;
  }
  const connectorDistance = formatMeters(first.distance);
  const knownFacingRoad = normalizeTextValue(facts.originPoi?.knownFacingRoad);
  const secondRoad = normalizeTextValue(second.road) || knownFacingRoad;
  if (!secondRoad) {
    return state;
  }
  const side = direction;
  state.currentRoad = secondRoad;
  const nextRoad = normalizeTextValue(steps[2]?.road);
  const targetText = nextRoad ? buildRoadJunctionText(state.currentRoad, nextRoad) : '';
  state.currentSide = side;
  state.nextStepIndex = 1;
  state.walkAlreadyRenderedIndex = normalizeTextValue(second.road) ? 1 : -1;
  state.startLines = [
    `从出入口先走到路边，约 ${connectorDistance}。`,
    normalizeTextValue(second.road)
      ? `到路边后，面对${state.currentRoad}，往${direction === 'left' ? '左' : '右'}走；沿${state.currentRoad}${roadSideText(side)}走约 ${formatMeters(second.distance)}${targetText}。`
      : `到路边后，面对${state.currentRoad}，往${direction === 'left' ? '左' : '右'}走。`
  ];
  return state;
}

function getTurnDirection(step, nextStep = null) {
  const geometryDirection = inferTurnDirectionFromPolyline(step?.polyline, nextStep?.polyline);
  if (geometryDirection) {
    return geometryDirection;
  }
  const text = `${normalizeTextValue(step?.action)} ${normalizeTextValue(step?.assistantAction)} ${normalizeTextValue(step?.instruction)}`;
  if (/左转|向左/.test(text)) {
    return 'left';
  }
  if (/右转|向右/.test(text)) {
    return 'right';
  }
  return '';
}

function inferTurnDirectionFromPolyline(currentPolyline, nextPolyline) {
  const currentVector = getPolylineEndVector(currentPolyline);
  const nextVector = getPolylineStartVector(nextPolyline);
  if (!currentVector || !nextVector) {
    return '';
  }
  const cross = currentVector.x * nextVector.y - currentVector.y * nextVector.x;
  const dot = currentVector.x * nextVector.x + currentVector.y * nextVector.y;
  const angle = Math.atan2(cross, dot) * 180 / Math.PI;
  if (Math.abs(angle) < 25 || Math.abs(angle) > 155) {
    return '';
  }
  return angle > 0 ? 'left' : 'right';
}

function getPolylineEndVector(polyline) {
  const points = parsePolylinePoints(polyline);
  for (let index = points.length - 1; index > 0; index -= 1) {
    const vector = vectorBetween(points[index - 1], points[index]);
    if (vector) {
      return vector;
    }
  }
  return null;
}

function getPolylineStartVector(polyline) {
  const points = parsePolylinePoints(polyline);
  for (let index = 0; index < points.length - 1; index += 1) {
    const vector = vectorBetween(points[index], points[index + 1]);
    if (vector) {
      return vector;
    }
  }
  return null;
}

function parsePolylinePoints(polyline) {
  return String(polyline || '')
    .split(';')
    .map(parseLngLat)
    .filter(Boolean);
}

function vectorBetween(start, end) {
  if (!start || !end) {
    return null;
  }
  const x = end.x - start.x;
  const y = end.y - start.y;
  const length = Math.sqrt(x * x + y * y);
  if (length < 1) {
    return null;
  }
  return { x: x / length, y: y / length };
}

function inferPreferredSideForRoad(steps, roadStepIndex) {
  for (let index = roadStepIndex; index < steps.length; index += 1) {
    const step = steps[index];
    if (!normalizeTextValue(step?.road)) {
      continue;
    }
    const turnDirection = getTurnDirection(step, steps[index + 1]);
    if (turnDirection && normalizeTextValue(steps[index + 1]?.road)) {
      return turnDirection;
    }
  }
  return '';
}

function describeSideAwareTurn(currentRoad, targetRoad, currentSide, turnDirection, preferredTargetSide = '') {
  const turnText = turnDirection === 'left' ? '左手' : '右手';
  const plainTurnText = turnDirection === 'left' ? '左转' : '右转';
  const geometryTargetSide = turnDirection === 'left' ? 'left' : 'right';
  const locationText = formatTurnLocation(currentRoad, targetRoad);
  const currentCrossingObject = formatCrossingObject(currentRoad);
  if (!currentSide) {
    return {
      text: `${turnText}转弯，也就是${plainTurnText}进入${targetRoad}；转过去后先按${targetRoad}${roadSideText(geometryTargetSide)}走。当前没有锁定你在${currentRoad}哪一侧，路口先停下确认过街。`,
      nextSide: geometryTargetSide
    };
  }
  const sameSideTurn = currentSide === turnDirection;
  if (preferredTargetSide) {
    if (sameSideTurn) {
      if (preferredTargetSide === currentSide) {
        return {
          text: `${locationText}，${turnText}小转弯，${plainTurnText}进入${targetRoad}；转过去后沿${targetRoad}${roadSideText(preferredTargetSide)}走。`,
          nextSide: preferredTargetSide
        };
      }
      return {
        text: `${locationText}，${turnText}小转弯，${plainTurnText}进入${targetRoad}；进入后过${targetRoad}一次，到${targetRoad}${roadSideText(preferredTargetSide)}继续走。`,
        nextSide: preferredTargetSide
      };
    }
    if (preferredTargetSide === geometryTargetSide) {
      return {
        text: `${locationText}，${turnText}大转弯，${plainTurnText}进入${targetRoad}：先只过${currentCrossingObject}一次马路，过完后沿${targetRoad}${roadSideText(preferredTargetSide)}走。`,
        nextSide: preferredTargetSide
      };
    }
    return {
      text: `${locationText}，${turnText}大转弯，${plainTurnText}进入${targetRoad}：先过${currentCrossingObject}一次，再过${targetRoad}一次，过完后沿${targetRoad}${roadSideText(preferredTargetSide)}走。`,
      nextSide: preferredTargetSide
    };
  }
  if (sameSideTurn) {
    return {
      text: `${locationText}，${turnText}小转弯，${plainTurnText}进入${targetRoad}；转过去后沿${targetRoad}${roadSideText(currentSide)}走。`,
      nextSide: currentSide
    };
  }
  return {
    text: `${locationText}，${turnText}大转弯，${plainTurnText}进入${targetRoad}：先过${currentCrossingObject}一次，过完后沿${targetRoad}${roadSideText(geometryTargetSide)}走。`,
    nextSide: geometryTargetSide
  };
}

function formatTurnLocation(currentRoad, targetRoad) {
  if (!currentRoad || currentRoad === '未命名通道' || currentRoad === '未标路名连接段') {
    return `在这段未标路名连接段尽头`;
  }
  if (sameRoadName(currentRoad, targetRoad)) {
    return `在${currentRoad}前方路口`;
  }
  return `在${currentRoad}和${targetRoad}路口`;
}

function formatCrossingObject(road) {
  if (!road || road === '未命名通道' || road === '未标路名连接段') {
    return '当前连接段';
  }
  return road;
}

function describeTurnIntoUnnamedPath(currentRoad, currentSide, turnDirection, connectorTargetRoad = '') {
  const turnInfo = describeUnnamedTurnGeometry(currentRoad, currentSide, turnDirection);
  const plainTurnText = turnDirection === 'left' ? '左转' : '右转';
  const connectorName = connectorTargetRoad ? `通往${connectorTargetRoad}的未标路名连接段` : '未标路名连接段';
  const sideText = turnInfo.nextSide ? `，转过去后沿${connectorName}${roadSideText(turnInfo.nextSide)}走` : '';
  if (currentRoad === '未命名通道') {
    return {
      text: `在这段未标路名的小路尽头，${turnInfo.text}${sideText}。`,
      nextSide: turnInfo.nextSide
    };
  }
  return {
    text: `在${currentRoad}这一段尽头，${turnInfo.text}${sideText}。`,
    nextSide: turnInfo.nextSide
  };
}

function describeTurnWithUnnamedContinuation(currentRoad, currentSide, turnDirection, source = 'state') {
  const turnInfo = describeUnnamedTurnGeometry(currentRoad, currentSide, turnDirection);
  const sideText = turnInfo.nextSide ? `，转过去后沿${currentRoad}${roadSideText(turnInfo.nextSide)}附近继续走` : '';
  if (source === 'approach') {
    return {
      text: `走到${currentRoad}附近后，${turnInfo.text}${sideText}。`,
      nextSide: turnInfo.nextSide
    };
  }
  return {
    text: `在${currentRoad}这一段尽头，${turnInfo.text}${sideText}。`,
    nextSide: turnInfo.nextSide
  };
}

function describeTurnIntoRecoveredRoad(currentRoad, recoveredRoad, currentSide, turnDirection) {
  const turnInfo = describeUnnamedTurnGeometry(currentRoad, currentSide, turnDirection);
  const sideText = turnInfo.nextSide ? `，转过去后沿${recoveredRoad}${roadSideText(turnInfo.nextSide)}走` : '';
  if (currentRoad === '未命名通道') {
    return {
      text: `在这段未标路名的小路尽头，${turnInfo.text}进入${recoveredRoad}${sideText}。`,
      nextSide: turnInfo.nextSide
    };
  }
  return {
    text: `在${currentRoad}这一段尽头，${turnInfo.text}进入${recoveredRoad}${sideText}。`,
    nextSide: turnInfo.nextSide
  };
}

function describeUnnamedTurnGeometry(currentRoad, currentSide, turnDirection) {
  const turnHand = turnDirection === 'left' ? '左手' : '右手';
  const plainTurnText = turnDirection === 'left' ? '左转' : '右转';
  const nextSide = turnDirection === 'left' ? 'left' : 'right';
  if (!currentSide || currentRoad === '未命名通道') {
    return {
      text: `${turnHand}转弯，也就是${plainTurnText}`,
      nextSide
    };
  }
  if (currentSide === turnDirection) {
    return {
      text: `${turnHand}小转弯，也就是${plainTurnText}，不用主动过${currentRoad}`,
      nextSide
    };
  }
  return {
    text: `${turnHand}大转弯，也就是${plainTurnText}：先过${currentRoad}一次，再按${plainTurnText}方向进入下一段`,
    nextSide
  };
}

function inferContinuedCurrentRoad(step, currentRoad) {
  if (!currentRoad || currentRoad === '未命名通道') {
    return '';
  }
  const inferredRoads = uniqueRoadNames(step?.inferredRoads || []);
  if (!inferredRoads.length) {
    return '';
  }
  return inferredRoads.every((road) => sameRoadName(road, currentRoad)) ? currentRoad : '';
}

function inferRecoveredTargetRoad(step, followingStep, currentRoad) {
  const nearestMainRoad = inferMainRoadByNearestDistance(step);
  const followingRoad = normalizeTextValue(followingStep?.road);
  if (nearestMainRoad && !sameRoadName(nearestMainRoad, currentRoad) && !sameRoadName(nearestMainRoad, followingRoad)) {
    return nearestMainRoad;
  }
  const inferredRoads = uniqueRoadNames(step?.inferredRoads || []);
  if (!inferredRoads.length) {
    return '';
  }
  const filtered = inferredRoads.filter((road) => !sameRoadName(road, currentRoad));
  if (filtered.length !== 1) {
    return '';
  }
  const lastRoad = filtered[filtered.length - 1] || '';
  if (!lastRoad) {
    return '';
  }
  if (sameRoadName(lastRoad, followingRoad)) {
    return '';
  }
  const followingInferredRoads = Array.isArray(followingStep?.inferredRoads) ? followingStep.inferredRoads.filter(Boolean) : [];
  const supportedByFollowing =
    sameRoadName(lastRoad, followingRoad) ||
    followingInferredRoads.some((road) => sameRoadName(road, lastRoad));
  return supportedByFollowing ? lastRoad : '';
}

function buildRoadJunctionText(currentRoad, nextRoad) {
  if (sameRoadName(currentRoad, nextRoad)) {
    return `，走到${currentRoad}前方路口`;
  }
  const simplifiedNextRoad = nextRoad.replace(/辅路$/, '');
  if (simplifiedNextRoad && simplifiedNextRoad !== nextRoad) {
    return `，到${simplifiedNextRoad}附近，也就是${currentRoad}和${nextRoad}路口`;
  }
  return `，走到${currentRoad}和${nextRoad}路口`;
}

function describeInferredRoadStep(step, routeState, nextStep = null, futureRoadName = '') {
  const rawInferredRoads = uniqueRoadNames(step.inferredRoads || []);
  const mainRoad = inferMainRoadByNearestDistance(step);
  const nextRoad = normalizeTextValue(nextStep?.road);
  const inferredRoads = routeState.currentRoad
    ? rawInferredRoads
    : rawInferredRoads.filter((road) => !sameRoadName(road, routeState.unnamedFromRoad));
  const anchors = Array.isArray(step.inferredAnchors) ? step.inferredAnchors.filter(Boolean) : [];
  const currentRoad = routeState.currentRoad || '';
  const motionText = describeRawMapMotion(step);
  if (!currentRoad && !inferredRoads.length) {
    const anchorTextOnly = anchors.length ? `，经过${anchors.slice(0, 2).join('、')}附近` : '';
    return `接上一步转弯后，${motionText}；这一段没有写路名，路侧未锁定${anchorTextOnly}。`;
  }
  const startRoad = currentRoad || '未命名通道';
  const lastRoad = inferredRoads[inferredRoads.length - 1] || startRoad;
  if (mainRoad && !sameRoadName(mainRoad, startRoad) && !sameRoadName(mainRoad, nextRoad)) {
    const crossText = buildCrossingRoadText(step, mainRoad, lastRoad, futureRoadName);
    const anchorText = anchors.length ? `，经过${anchors.slice(0, 2).join('、')}附近` : '';
    const side = routeState.currentSide || '';
    const sideText = side ? roadSideText(side) : '';
    return `沿${mainRoad}${sideText}，${motionText}${crossText}${anchorText}，走到${mainRoad}靠近${lastRoad && !sameRoadName(lastRoad, mainRoad) ? lastRoad : '下一路口'}的位置。`;
  }
  const isMultiRoadConnector = inferredRoads.some((road) => !sameRoadName(road, startRoad));
  const sideText = routeState.currentSide ? roadSideText(routeState.currentSide) : '';
  if (isMultiRoadConnector) {
    const nearbyRoads = inferredRoads.filter((road) => !sameRoadName(road, startRoad));
    const roadChainText = nearbyRoads.length ? `；沿线接近${nearbyRoads.join('、')}` : '';
    const crossText = buildCrossingRoadText(step, startRoad, lastRoad, futureRoadName);
    const anchorText = anchors.length ? `，经过${anchors.slice(0, 2).join('、')}附近` : '';
    const endText = lastRoad && lastRoad !== startRoad ? `，走到${lastRoad}附近` : '';
    const sidePrefix = sideText ? `沿${startRoad}${sideText}` : `沿${startRoad}`;
    return `${sidePrefix}，${motionText}${crossText}${roadChainText}${anchorText}${endText}。`;
  }
  const roadPart = sideText ? `${startRoad}${sideText}` : `${startRoad}，路侧未锁定`;
  const crossText = buildCrossingRoadText(step, startRoad, lastRoad, futureRoadName);
  const anchorText = anchors.length ? `，经过${anchors.slice(0, 2).join('、')}附近` : '';
  const endText = lastRoad && lastRoad !== startRoad ? `，到${lastRoad}附近` : '';
  return `沿${roadPart}方向走约 ${formatMeters(step.distance)}${crossText}${anchorText}${endText}。`;
}

function buildCrossingRoadText(step, currentRoad, targetRoad = '', futureRoadName = '') {
  const roads = uniqueRoadNames(step?.inferredCrossRoads || [])
    .filter((road) => !sameRoadName(road, currentRoad))
    .filter((road) => !sameRoadName(road, targetRoad))
    .filter((road) => !sameRoadName(road, futureRoadName));
  if (!roads.length) {
    return '';
  }
  return `，穿过${roads.slice(0, 3).join('、')}`;
}

function findNextNamedRoad(steps, startIndex, maxLookahead = 3) {
  const end = Math.min(steps.length, startIndex + maxLookahead);
  for (let index = startIndex; index < end; index += 1) {
    const road = normalizeTextValue(steps[index]?.road);
    if (road) {
      return road;
    }
  }
  return '';
}

function getInferredCrossingRoads(inferredRoads, startRoad, lastRoad) {
  const roads = Array.isArray(inferredRoads) ? inferredRoads.filter(Boolean) : [];
  return roads
    .filter((road) => !sameRoadName(road, startRoad) && !sameRoadName(road, lastRoad))
    .filter((road, index, array) => array.findIndex((item) => sameRoadName(item, road)) === index);
}

function getLastInferredRoad(step) {
  const mainRoad = inferMainRoadByNearestDistance(step);
  if (mainRoad) {
    return mainRoad;
  }
  const inferredRoads = uniqueRoadNames(step.inferredRoads || []);
  return inferredRoads[inferredRoads.length - 1] || '';
}

function inferMainRoadByNearestDistance(step) {
  const samples = Array.isArray(step?.nearestRoadSamples) ? step.nearestRoadSamples : [];
  const valid = samples.filter((sample) =>
    sample?.road &&
    Number.isFinite(Number(sample.distance)) &&
    Number(sample.distance) <= 12
  );
  if (valid.length < 3) {
    return '';
  }
  const stats = new Map();
  for (const sample of valid) {
    const road = normalizeRoadBase(sample.road);
    if (!road) {
      continue;
    }
    const current = stats.get(road) || { road, count: 0, totalDistance: 0, lateCount: 0 };
    current.count += 1;
    current.totalDistance += Number(sample.distance);
    if (Number(sample.progress) >= 0.35) {
      current.lateCount += 1;
    }
    stats.set(road, current);
  }
  const ranked = [...stats.values()]
    .sort((a, b) => b.count - a.count || (a.totalDistance / a.count) - (b.totalDistance / b.count));
  const best = ranked[0];
  if (!best) {
    return '';
  }
  const coverage = best.count / valid.length;
  const averageDistance = best.totalDistance / best.count;
  if (coverage >= 0.55 && averageDistance <= 8 && best.lateCount >= 2) {
    return best.road;
  }
  return '';
}

function isTerminalUnnamedApproach(steps, startIndex) {
  const remaining = steps.slice(startIndex);
  if (remaining.length < 2 || remaining.length > 6) {
    return false;
  }
  if (!remaining.every((step) => !normalizeTextValue(step?.road))) {
    return false;
  }
  const totalDistance = remaining.reduce((sum, step) => sum + Number(step?.distance || 0), 0);
  return totalDistance > 0 && totalDistance <= 300;
}

function describeTerminalUnnamedApproach(currentRoad, currentSide, turnDirection, remainingSteps, destinationName) {
  const turnInfo = describeUnnamedTurnGeometry(currentRoad, currentSide, turnDirection);
  const totalDistance = remainingSteps.reduce((sum, step) => sum + Number(step?.distance || 0), 0);
  const stepText = remainingSteps
    .map((step, index) => {
      const motion = describeRawMapMotion(step);
      const nextTurn = index < remainingSteps.length - 1 ? getTurnDirection(step, remainingSteps[index + 1]) : '';
      const turnAfter = nextTurn ? `后${nextTurn === 'left' ? '左转' : '右转'}` : '';
      return `${motion}${turnAfter}`;
    })
    .join('，');
  const destinationText = destinationName ? `，最后到${destinationName}附近` : '，最后到目的地附近';
  const roadText = currentRoad && currentRoad !== '未命名通道' ? `离开${currentRoad}` : '离开当前小路';
  return `在${currentRoad}这一段尽头，${turnInfo.text}，${roadText}，进入目的地入口附近的小路；后面连续约 ${formatMeters(totalDistance)} 都没有写路名，按顺序走：${stepText}${destinationText}。`;
}

function uniqueRoadNames(roads) {
  const result = [];
  for (const road of Array.isArray(roads) ? roads : []) {
    const name = normalizeTextValue(road);
    if (name && !result.some((item) => sameRoadName(item, name))) {
      result.push(name);
    }
  }
  return result;
}

function describeRawMapMotion(step) {
  const orientation = normalizeTextValue(step?.orientation);
  const distanceText = formatMeters(step?.distance || 0);
  if (orientation) {
    return `向${orientation}走约 ${distanceText}`;
  }
  return `走约 ${distanceText}`;
}

function roadSideText(side) {
  return side === 'left' ? '左侧' : side === 'right' ? '右侧' : '';
}

function isArrivalStep(step) {
  const text = `${normalizeTextValue(step?.action)} ${normalizeTextValue(step?.assistantAction)} ${normalizeTextValue(step?.instruction)}`;
  return /到达/.test(text);
}

function describeFinalApproach(step, currentRoad, currentSide, destinationText) {
  const road = normalizeTextValue(step.road) || currentRoad || '当前道路';
  const side = currentSide ? roadSideText(currentSide) : '';
  const sidePart = side ? `${road}${side}` : road;
  return `沿${sidePart}最后走约 ${formatMeters(step.distance)}，${destinationText}。`;
}

function buildDestinationEvidence(destinationPoi, destinationSideEvidence = {}, finalRoadStep = null) {
  if (!destinationPoi) {
    return '';
  }
  const name = normalizeTextValue(destinationPoi.name);
  const address = normalizeTextValue(destinationPoi.address);
  const streetNumber = destinationPoi.streetNumber || extractStreetNumberFromAddress(address);
  if (!streetNumber) {
    return '';
  }
  const parityText = Number(streetNumber) % 2 === 0 ? '双号' : '单号';
  const targetText = name ? `${name}` : '终点';
  const addressText = address ? `地址写作${address}` : `门牌号是${streetNumber}号`;
  const finalRoad = normalizeRoadBase(finalRoadStep?.road);
  const side = destinationSideEvidence.side || '';
  const evidenceText = Array.isArray(destinationSideEvidence.evidenceText)
    ? destinationSideEvidence.evidenceText.filter(Boolean).slice(0, 3).join('；')
    : '';
  if (side && finalRoad) {
    const reasonText = evidenceText ? `，依据：${evidenceText}` : '';
    return `${targetText}${addressText}，按门牌属于${parityText}侧；本次锁定在${finalRoad}${roadSideText(side)}${reasonText}。`;
  }
  return `${targetText}${addressText}，按门牌属于${parityText}侧；当前缺少足够同路段锚点，终点在道路左侧还是右侧不强行判断。`;
}

async function inferDestinationSideForRoute(facts, steps) {
  const destinationPoi = facts.destinationPoi;
  if (!destinationPoi) {
    return emptySideEvidence();
  }
  const address = normalizeTextValue(destinationPoi.address);
  const streetNumber = destinationPoi.streetNumber || extractStreetNumberFromAddress(address);
  if (!streetNumber) {
    return emptySideEvidence();
  }
  const finalRoadStep = getFinalRoadStep(steps);
  if (!finalRoadStep) {
    return emptySideEvidence();
  }
  const finalRoad = normalizeRoadBase(finalRoadStep.road);
  const addressRoad = extractAddressRoadName(address);
  if (addressRoad && finalRoad && !sameRoadName(addressRoad, finalRoad)) {
    return emptySideEvidence();
  }
  const parity = Number(streetNumber) % 2 === 0 ? 'even' : 'odd';
  const votes = [];
  addCoordinateSideVotes(votes, destinationPoi, finalRoadStep);

  const nearbyParityEvidence = await inferNearbyParitySide(finalRoad, finalRoadStep, destinationPoi, parity);
  for (const vote of nearbyParityEvidence.votes) {
    votes.push(vote);
  }

  return chooseSideFromEvidence(votes);
}

function emptySideEvidence() {
  return {
    side: '',
    confidence: 'none',
    evidenceText: []
  };
}

function addCoordinateSideVotes(votes, destinationPoi, finalRoadStep) {
  const entrance = normalizeCoordinate(destinationPoi.entrLocation);
  const location = normalizeCoordinate(destinationPoi.location);
  const candidates = [
    { label: '入口坐标', location: entrance, baseWeight: 2.5 },
    { label: 'POI坐标', location, baseWeight: 2 }
  ].filter((item, index, array) => item.location && array.findIndex((candidate) => candidate.location === item.location) === index);

  for (const candidate of candidates) {
    const sideResult = pointSideRelativeToPolyline(candidate.location, finalRoadStep.polyline);
    if (!sideResult.side || sideResult.distanceMeters > 120) {
      continue;
    }
    const clearOffsetWeight = sideResult.distanceMeters >= 4 ? candidate.baseWeight : candidate.baseWeight - 1;
    if (clearOffsetWeight <= 0) {
      continue;
    }
    votes.push({
      side: sideResult.side,
      weight: clearOffsetWeight,
      text: `${candidate.label}在最后一段路的${roadSideText(sideResult.side)}`
    });
  }
}

async function inferNearbyParitySide(finalRoad, finalRoadStep, destinationPoi, targetParity) {
  const location = normalizeCoordinate(destinationPoi.entrLocation) || normalizeCoordinate(destinationPoi.location);
  const destinationNumber = Number(destinationPoi.streetNumber || extractStreetNumberFromAddress(destinationPoi.address));
  if (!location || !finalRoad || !finalRoadStep?.polyline) {
    return { votes: [] };
  }

  try {
    const data = await callAmap('/v3/place/around', {
      location,
      radius: '500',
      offset: '25',
      page: '1',
      extensions: 'all'
    });
    const pois = Array.isArray(data.pois) ? data.pois.map(simplifyPoi) : [];
    const anchors = [];
    const seen = new Set();
    for (const poi of pois) {
      const address = normalizeTextValue(poi.address);
      const road = extractAddressRoadName(address);
      const number = poi.streetNumber || extractStreetNumberFromAddress(address);
      const anchorLocation = normalizeCoordinate(poi.entrLocation) || normalizeCoordinate(poi.location);
      if (!number || !anchorLocation || !sameRoadName(road, finalRoad)) {
        continue;
      }
      if (destinationNumber && Number(number) === destinationNumber) {
        continue;
      }
      const sideResult = pointSideRelativeToPolyline(anchorLocation, finalRoadStep.polyline);
      if (!sideResult.side || sideResult.distanceMeters > 160) {
        continue;
      }
      const key = `${number}:${sideResult.side}:${anchorLocation}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      anchors.push({
        number: Number(number),
        parity: Number(number) % 2 === 0 ? 'even' : 'odd',
        side: sideResult.side,
        name: normalizeTextValue(poi.name)
      });
    }

    const votes = [];
    const support = { left: 0, right: 0 };
    const examples = { left: [], right: [] };
    for (const anchor of anchors) {
      const impliedTargetSide = anchor.parity === targetParity
        ? anchor.side
        : oppositeSide(anchor.side);
      if (!impliedTargetSide) {
        continue;
      }
      support[impliedTargetSide] += 1;
      if (examples[impliedTargetSide].length < 2) {
        examples[impliedTargetSide].push(`${anchor.number}号${roadSideText(anchor.side)}`);
      }
    }

    for (const side of ['left', 'right']) {
      if (support[side] > 0) {
        votes.push({
          side,
          weight: Math.min(3, support[side]),
          text: `附近同路段门牌锚点推断${roadSideText(side)}，样本：${examples[side].join('、')}`
        });
      }
    }
    return { votes };
  } catch {
    return { votes: [] };
  }
}

function chooseSideFromEvidence(votes) {
  const cleanVotes = votes.filter((vote) => vote?.side && vote.weight > 0);
  if (!cleanVotes.length) {
    return emptySideEvidence();
  }
  const scores = { left: 0, right: 0 };
  const evidenceBySide = { left: [], right: [] };
  for (const vote of cleanVotes) {
    scores[vote.side] += vote.weight;
    evidenceBySide[vote.side].push(vote.text);
  }
  const side = scores.left >= scores.right ? 'left' : 'right';
  const other = side === 'left' ? 'right' : 'left';
  if (scores[side] < 2 || scores[side] < scores[other] + 0.75) {
    return {
      side: '',
      confidence: 'conflict',
      evidenceText: [
        ...evidenceBySide.left.map((item) => `左侧证据：${item}`),
        ...evidenceBySide.right.map((item) => `右侧证据：${item}`)
      ]
    };
  }
  return {
    side,
    confidence: scores[side] >= 4 ? 'strong' : 'medium',
    evidenceText: evidenceBySide[side]
  };
}

function oppositeSide(side) {
  if (side === 'left') {
    return 'right';
  }
  if (side === 'right') {
    return 'left';
  }
  return '';
}

function getFinalRoadStep(steps) {
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    if (normalizeTextValue(steps[index]?.road)) {
      return steps[index];
    }
  }
  return null;
}

function isFinalRoad(road, facts, steps) {
  const finalRoadStep = getFinalRoadStep(steps);
  if (!finalRoadStep) {
    return false;
  }
  return sameRoadName(road, finalRoadStep.road);
}

function extractAddressRoadName(address) {
  const text = normalizeTextValue(address);
  const match = text.match(/([\u4e00-\u9fa5A-Za-z0-9]+(?:路|街|大道|巷|弄))\s*\d{1,5}(?:[-－]\d+)?\s*号/);
  return match ? normalizeRoadBase(match[1]) : '';
}

function normalizeRoadBase(road) {
  return normalizeTextValue(road)
    .replace(/辅路$/, '')
    .replace(/主路$/, '')
    .trim();
}

function sameRoadName(left, right) {
  const a = normalizeRoadBase(left);
  const b = normalizeRoadBase(right);
  return Boolean(a && b && a === b);
}

function describeAccessibleTurn(step) {
  const actionText = `${step.action || ''} ${step.assistantAction || ''} ${step.instruction || ''}`;
  if (/左转|向左/.test(actionText)) {
    return '左手转弯';
  }
  if (/右转|向右/.test(actionText)) {
    return '右手转弯';
  }
  if (/调头|掉头/.test(actionText)) {
    return '掉头；现场必须确认是否安全，不能直接执行';
  }
  if (/到达/.test(actionText)) {
    return '接近目的地';
  }
  if (/直行|向前|继续/.test(actionText)) {
    return '继续直行';
  }
  return '继续前进';
}

function describeCrossingUncertainty(step) {
  const text = `${step.action || ''} ${step.assistantAction || ''} ${step.instruction || ''}`;
  if (/过马路|人行横道|斑马线|通过/.test(text)) {
    return '地图提示可能涉及过街；但过几次、过完后沿哪一侧继续尚未锁定，现场必须停下确认。';
  }
  return '地图这一步没有明确要求过马路；默认不要主动过马路。';
}

async function enrichWalkingStepsWithRoadAnchors(steps) {
  const enriched = [];
  let regeoCalls = 0;
  for (const step of steps) {
    const copy = { ...step };
    const stepRoad = normalizeTextValue(copy.road);
    const shouldRecoverRoadNames = !stepRoad && copy.distance >= 80;
    const shouldRecoverCrossRoads = copy.distance >= 120;
    if ((shouldRecoverRoadNames || shouldRecoverCrossRoads) && copy.polyline && regeoCalls < 12) {
      const samples = samplePolylinePointsWithProgress(copy.polyline, 7);
      const roadNames = [];
      const crossRoadNames = [];
      const nearestRoadSamples = [];
      const anchors = [];
      for (const sample of samples) {
        if (regeoCalls >= 12) {
          break;
        }
        regeoCalls += 1;
        try {
          const data = await callAmap('/v3/geocode/regeo', {
            location: sample.location,
            extensions: 'all',
            radius: '100'
          });
          const roadName = normalizeTextValue(data.regeocode?.roads?.[0]?.name);
          const roadDistance = Number(data.regeocode?.roads?.[0]?.distance);
          if (roadName && Number.isFinite(roadDistance)) {
            nearestRoadSamples.push({
              road: roadName,
              distance: roadDistance,
              progress: sample.progress
            });
          }
          if (shouldRecoverRoadNames && roadName && !roadNames.includes(roadName)) {
            roadNames.push(roadName);
          }
          for (const crossRoad of extractCrossRoadNames(data.regeocode, stepRoad || roadName)) {
            if (sample.progress > 0.08 && sample.progress < 0.92 && !crossRoadNames.some((item) => sameRoadName(item, crossRoad))) {
              crossRoadNames.push(crossRoad);
            }
          }
          const nearestPoi = Array.isArray(data.regeocode?.pois) ? data.regeocode.pois[0] : null;
          const poiName = sample.progress >= 0.35 ? normalizeTextValue(nearestPoi?.name) : '';
          const poiDistance = Number(nearestPoi?.distance);
          if (shouldRecoverRoadNames && poiName && Number.isFinite(poiDistance) && poiDistance <= 60 && !anchors.includes(poiName)) {
            anchors.push(poiName);
          }
        } catch {
          // Keep the raw walking step if reverse geocoding fails.
        }
      }
      copy.inferredRoads = roadNames;
      copy.inferredAnchors = anchors;
      copy.inferredCrossRoads = crossRoadNames;
      copy.nearestRoadSamples = nearestRoadSamples;
    }
    enriched.push(copy);
  }
  return enriched;
}

function extractCrossRoadNames(regeocode, currentRoad) {
  const result = [];
  const intersections = Array.isArray(regeocode?.roadinters) ? regeocode.roadinters : [];
  for (const item of intersections) {
    const distance = Number(item.distance ?? item.dist ?? 9999);
    if (Number.isFinite(distance) && distance > 35) {
      continue;
    }
    const names = [
      item.first_name,
      item.second_name,
      item.first_road_name,
      item.second_road_name,
      item.name
    ].map(normalizeTextValue).filter(Boolean);
    for (const name of names) {
      if (!sameRoadName(name, currentRoad) && !result.some((road) => sameRoadName(road, name))) {
        result.push(name);
      }
    }
  }
  return result;
}

function samplePolylinePoints(polyline, maxCount) {
  return samplePolylinePointsWithProgress(polyline, maxCount).map((sample) => sample.location);
}

function samplePolylinePointsWithProgress(polyline, maxCount) {
  const points = String(polyline || '')
    .split(';')
    .map((item) => normalizeCoordinate(item))
    .filter(Boolean);
  if (!points.length) {
    return [];
  }
  if (points.length <= maxCount) {
    const denominator = Math.max(1, points.length - 1);
    return points.map((location, index) => ({
      location,
      progress: index / denominator
    }));
  }
  const count = Math.max(2, Number(maxCount || 3));
  const indexes = Array.from({ length: count }, (_, index) => Math.round(index * (points.length - 1) / (count - 1)));
  const uniqueIndexes = [...new Set(indexes)].filter((index) => points[index]);
  return uniqueIndexes.map((index) => ({
    location: points[index],
    progress: index / (points.length - 1)
  }));
}

function pointSideRelativeToPolyline(point, polyline) {
  const target = parseLngLat(point);
  const points = String(polyline || '')
    .split(';')
    .map(parseLngLat)
    .filter(Boolean);
  if (!target || points.length < 2) {
    return { side: '', distanceMeters: Infinity };
  }

  let best = null;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const projection = projectPointOnSegment(target, start, end);
    if (!best || projection.distanceMeters < best.distanceMeters) {
      const cross = (end.x - start.x) * (target.y - start.y) - (end.y - start.y) * (target.x - start.x);
      best = {
        side: cross > 0 ? 'left' : cross < 0 ? 'right' : '',
        distanceMeters: projection.distanceMeters
      };
    }
  }
  return best || { side: '', distanceMeters: Infinity };
}

function parseLngLat(value) {
  const coordinate = normalizeCoordinate(value);
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

function projectPointOnSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return {
      distanceMeters: distanceMeters(point, start)
    };
  }
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  const projected = {
    x: start.x + t * dx,
    y: start.y + t * dy
  };
  return {
    distanceMeters: distanceMeters(point, projected)
  };
}

function distanceMeters(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function sumStepDistance(steps) {
  return steps.reduce((sum, step) => sum + Number(step.distance || 0), 0);
}

function buildBaseFacts(mode, request, extra) {
  return {
    provider: 'amap',
    mode,
    generatedAt: new Date().toISOString(),
    coordinateSystem: '高德 Web 服务默认使用 GCJ-02 坐标；浏览器定位可能不是同一坐标系，精确路侧测试前需要校准。',
    origin: request.origin,
    destination: request.destination,
    originPoi: request.originPoi || null,
    destinationPoi: request.destinationPoi || null,
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
  const address = normalizeTextValue(poi.address);
  const streetNumber = extractStreetNumberFromAddress(address);
  return {
    id: poi.id || '',
    name: poi.name || '',
    type: poi.type || '',
    address,
    streetNumber,
    streetNumberParity: streetNumber ? (Number(streetNumber) % 2 === 0 ? 'even' : 'odd') : '',
    location: poi.location || '',
    adname: poi.adname || '',
    cityname: poi.cityname || '',
    pname: poi.pname || '',
    entrLocation: normalizeTextValue(poi.entr_location),
    exitLocation: normalizeTextValue(poi.exit_location),
    tel: normalizeTextValue(poi.tel)
  };
}

function extractStreetNumberFromAddress(address) {
  const text = normalizeTextValue(address);
  if (!text) {
    return '';
  }
  const candidates = [...text.matchAll(/(\d{1,5})(?:[-－]\d+)?\s*号(?!线|口|楼|室|房)/g)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isInteger(value) && value > 0);
  if (!candidates.length) {
    return '';
  }
  return String(candidates[0]);
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
