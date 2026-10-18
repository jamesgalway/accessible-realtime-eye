'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const resources = path.join(root, 'AccessibleVision/ScreenShare/Resources');
const environment = fs.readFileSync(path.join(root, 'AccessibleVision/ScreenShare/ScreenRuntimeEnvironment.js'), 'utf8');
let checks = 0;
process.on('uncaughtException', error => { console.error(error.name + ': ' + error.message); process.exit(1); });
const check = (value, label) => { assert.ok(value, label); checks++; };
const flush = () => new Promise(resolve => setImmediate(resolve));

function runtime(backend, adapter = true, googleRoute = 'direct') {
  const commands = [], nativeTimers = new Map();
  let context;
  function event(value) { context.__screenEvent(value); }
  const host = input => {
    const m = JSON.parse(input); commands.push(m);
    let value = null;
    switch (m.op) {
      case 'clock': value = performance.now() / 1000; break;
      case 'hasFrame': value = true; break;
      case 'frameSize': value = { width: 576, height: 1024 }; break;
      case 'capture': value = 'data:image/jpeg;base64,c2NyZWVu'; break;
      case 'encodeBase64': value = Buffer.from(m.value, 'latin1').toString('base64'); break;
      case 'decodeBase64': value = Buffer.from(m.value, 'base64').toString('latin1'); break;
      case 'utf8Encode': value = [...Buffer.from(m.value, 'utf8')]; break;
      case 'utf8Decode': value = Buffer.from(m.value).toString('utf8'); break;
      case 'uuid': value = crypto.randomUUID(); break;
      case 'random': value = [...crypto.randomBytes(m.length)]; break;
      case 'url': { const u = new URL(m.value, m.base || undefined); value = { protocol: u.protocol, host: u.host, hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash }; break; }
      case 'timer': {
        const timer = (m.repeat ? setInterval : setTimeout)(() => event({ kind: 'timer', id: m.id }), Math.max(1, m.ms));
        timer.unref(); nativeTimers.set(m.id, timer); break;
      }
      case 'cancelTimer': clearTimeout(nativeTimers.get(m.id)); nativeTimers.delete(m.id); break;
      case 'fetch': setImmediate(() => {
        const health = { ok: true, appVariant: backend === 'aliyun' ? 'aliyun' : 'greencloud-gemini', geminiConfigured: true, realtimeWebSocketConfigured: true, bailianConfigured: true };
        const body = m.url.includes('/api/health') ? health
          : m.url.includes('/api/realtime/config') ? { webSocketConfigured: true, serverApiKeyConfigured: true }
          : m.url.includes('/api/gemini-browser-config') ? { configured: true, apiKey: 'test-only-key', model: 'gemini-3.8-live', voice: 'Zephyr', transport: googleRoute === 'relay' ? 'server-proxy' : 'browser-direct' }
          : m.url.includes('/api/web-search') ? { results: [{ title: 'verified title', snippet: 'verified snippet', url: 'https://example.test/source' }] }
          : m.url.includes('generateContent') ? { candidates: [{ content: { parts: [{ text: 'verified response' }] } }] } : { ok: true };
        event({ kind: 'fetch', id: m.id, status: 200, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
      }); break;
      case 'socket': setImmediate(() => {
        check(new URL(m.url).protocol === 'wss:', 'native socket receives a valid secure WebSocket URL');
        event({ kind: 'socket', id: m.id, type: 'open' });
        if (m.url.includes('/api/ws')) event({ kind: 'socket', id: m.id, type: 'message', data: '{"type":"proxy.ready","model":"test"}' });
        if (m.url.includes('/api/gemini-live/ws')) event({ kind: 'socket', id: m.id, type: 'message', data: '{"type":"gemini.ready","model":"gemini-3.8-live","voice":"Zephyr"}' });
      }); break;
      case 'socketSend': if (JSON.parse(m.data).setup) setImmediate(() => event({ kind: 'socket', id: m.id, type: 'message', data: '{"setupComplete":{}}' })); break;
      case 'socketClose': setImmediate(() => event({ kind: 'socket', id: m.id, type: 'close', code: 1000 })); break;
    }
    return JSON.stringify(value);
  };
  context = vm.createContext({ _screenHost: host, __screenBaseURL: 'https://example.test/', __screenBackend: backend, __screenGoogleRoute: googleRoute });
  const run = source => vm.runInContext(source, context);
  run(environment);
  run(fs.readFileSync(path.join(resources, 'screen-google-sdk.js'), 'utf8'));
  if (adapter) run(fs.readFileSync(path.join(resources, backend + '-screen-runtime.js'), 'utf8'));
  else {
    run(fs.readFileSync(path.join(root, 'ScreenShareSources', backend + '-live-web-search.js'), 'utf8'));
    run(fs.readFileSync(path.join(root, 'ScreenShareSources', backend + '-app.js'), 'utf8').replaceAll('import(GEMINI_BROWSER_SDK_URL)', 'Promise.resolve(HuiyanGoogleSDK)'));
  }
  return { context, run, commands, event, close: () => { nativeTimers.forEach(clearTimeout); nativeTimers.clear(); } };
}

(async () => {
  for (const backend of ['aliyun', 'greencloud']) {
    const candidate = runtime(backend), baseline = runtime(backend, false);
    try {
      await flush();
      for (const expression of ['buildGeminiUnifiedSystemInstruction()', 'buildGeminiReminderContractToolDeclaration()', 'buildGeminiContinuousNarrationSystemInstruction()', 'HuiyanWebSearch.declaration()']) {
        assert.equal(candidate.run('JSON.stringify(' + expression + ')'), baseline.run('JSON.stringify(' + expression + ')'), backend + ' task and search rules unchanged'); checks++;
      }
      check(candidate.run("validateGeminiUnifiedModeCommand({action:'propose_find_object',subject:'test'}).ok") === false, 'screen find capability excluded');
      check(candidate.run("validateGeminiUnifiedModeCommand({action:'propose_continuous_narration',subject:'test'}).ok") === true, 'narration capability retained');
      check(candidate.run('resolvePlatformContinuousNarrationDepthRequested()') === false, 'no radar');
      candidate.run('globalThis.idleCalls = 0; globalThis.player = new PcmPlayer(new AudioContext({sampleRate:24000}),24000,null,()=>idleCalls++);');
      candidate.run("player.enqueue('" + Buffer.alloc(4800).toString('base64') + "')");
      const queued = candidate.commands.filter(x => x.op === 'audio').at(-1);
      check(queued?.rate === 24000 && queued.data.length > 0, 'real PCM transferred to native output');
      check(candidate.run('idleCalls') === 0, 'enqueue is not playback completion');
      candidate.event({ kind: 'audioEnded', id: queued.id });
      check(candidate.run('idleCalls') === 1, 'native playback completion releases original player');
      candidate.run("player.enqueue('" + Buffer.alloc(4800).toString('base64') + "'); player.reset('test');");
      const old = candidate.commands.filter(x => x.op === 'audio').at(-1);
      const idle = candidate.run('idleCalls');
      candidate.event({ kind: 'audioEnded', id: old.id });
      check(candidate.run('idleCalls') === idle, 'old audio cannot complete a new generation');
      await candidate.run('globalThis.ai = new HuiyanGoogleSDK.GoogleGenAI({apiKey:"test-only-key"}); ai.models.generateContent({model:"test",contents:"test"}).then(x=>globalThis.result=x.text)');
      check(candidate.run('result') === 'verified response', 'real Google SDK REST works on native fetch facade');
      await candidate.run('ai.live.connect({model:"test",config:{responseModalities:["AUDIO"]},callbacks:{onmessage:()=>{}}}).then(x=>globalThis.session=x)');
      check(candidate.commands.some(x => x.op === 'socketSend' && JSON.parse(x.data).setup), 'real SDK Live handshake preserved');
      candidate.run('session.close()');
      await flush();
      check(candidate.run('typeof HuiyanWebSearch.createController') === 'function', 'search controller available');
      await candidate.run('__screenCommand("start")');
      await flush(); await flush();
      check(candidate.run('__screenSnapshot().connected') === true, backend + ' original entry starts through native adapter');
      if (backend === 'greencloud') {
        check(candidate.commands.some(x => x.op === 'fetch' && x.url === '/api/gemini-browser-config?directScreen=1'), 'Google uses the original authorized direct-screen configuration');
        check(candidate.run('appState.geminiReminder.activeScreenTransport') === 'browser_direct_generate_content', 'Google screening uses the original direct route');
        check(candidate.run('appState.geminiReminder.transport') === 'browser-direct', 'Google live uses direct SDK connection');
        await baseline.run('(async()=>{await checkHealth(); await startBrowserDirectUnifiedAssistant();})()');
        await flush(); await flush();
        const originalSetup=baseline.commands.filter(x => x.op === 'socketSend' && JSON.parse(x.data).setup).at(-1);
        const screenSetup=candidate.commands.filter(x => x.op === 'socketSend' && JSON.parse(x.data).setup).at(-1);
        assert.deepEqual(JSON.parse(screenSetup.data),JSON.parse(originalSetup.data),'screen and original Huiyan direct SDK setup are identical'); checks++;
        assert.equal(candidate.commands.filter(x => x.op === 'socket').at(-1).url,baseline.commands.filter(x => x.op === 'socket').at(-1).url,'screen and original Huiyan direct WSS addresses are identical'); checks++;
      } else {
        check(candidate.run('isAliRealtimeVideoExperiment()') === true, 'Ali uses original continuous realtime video entry');
        const beforeFrames = candidate.commands.filter(x => x.op === 'socketSend' && JSON.parse(x.data).type === 'input_image_buffer.append').length;
        candidate.run('sendVideoFrame()');
        const afterFrames = candidate.commands.filter(x => x.op === 'socketSend' && JSON.parse(x.data).type === 'input_image_buffer.append').length;
        check(afterFrames === beforeFrames + 1, 'Ali sends the native screen using the existing realtime image protocol');
        const socketMessages = candidate.commands.filter(x => x.op === 'socketSend').map(x => JSON.parse(x.data));
        check(socketMessages.findIndex(x => x.type === 'input_audio_buffer.append') < socketMessages.findIndex(x => x.type === 'input_image_buffer.append'), 'existing Ali PCM-before-image requirement retained');
      }
      check(candidate.run('!!(appState.realtime?.audioProcessor || appState.geminiReminder?.audioProcessor)'), 'native microphone attaches to original input handler');
      const audioBefore = candidate.commands.filter(x => x.op === 'socketSend').length;
      candidate.event({ kind: 'pcm', data: Buffer.alloc(6400).toString('base64') });
      check(candidate.commands.filter(x => x.op === 'socketSend').length > audioBefore, 'native microphone reaches actual live transport');
      candidate.run('globalThis.searchReply = null; globalThis.searchController = HuiyanWebSearch.createController({session:{sendToolResponse:x=>{searchReply=x}},isCurrent:()=>true}); searchController.handle({toolCall:{functionCalls:[{id:"search-test",name:"search_web",args:{query:"test"}}]}})');
      await flush(); await flush();
      check(candidate.run('searchReply.functionResponses[0].response.results[0].snippet') === 'verified snippet', 'real search request and result delivery works through native fetch');
      check(candidate.commands.some(x => x.op === 'fetch' && x.url === '/api/web-search'), 'search uses original server endpoint');
      candidate.run('searchController.close(); __screenCommand("stop")');
      await flush();
      const stoppedAt = candidate.commands.filter(x => x.op === 'socketSend').length;
      candidate.event({ kind: 'pcm', data: Buffer.alloc(6400).toString('base64') });
      check(candidate.commands.filter(x => x.op === 'socketSend').length === stoppedAt, 'stopped entry discards native microphone input');
    } finally { candidate.close(); baseline.close(); }
  }
  const relay = runtime('greencloud', true, 'relay');
  try {
    await relay.run('__screenCommand("start")');
    await flush(); await flush();
    check(relay.run('__screenSnapshot().connected') === true, 'Google relay original entry connects');
    check(relay.run('appState.geminiReminder.transport') === 'server-proxy', 'relay uses original Google server transport');
    check(relay.commands.some(x => x.op === 'socket' && x.url.includes('example.test/api/gemini-live/ws?contract=1&replace=1&visualBase=1')), 'relay opens existing Huiyan gateway');
    check(!relay.commands.some(x => x.op === 'socket' && x.url.includes('googleapis.com')), 'relay does not open phone Google direct socket');
    check(!relay.commands.some(x => x.op === 'fetch' && x.url.includes('directScreen=1')), 'relay does not request direct-screen configuration');
    const before = relay.commands.filter(x => x.op === 'socketSend').length;
    relay.event({kind:'pcm',data:Buffer.alloc(6400).toString('base64')});
    check(relay.commands.filter(x => x.op === 'socketSend').length > before, 'relay receives native microphone using existing handler');
    relay.run('sendGeminiVideoFrame()');
    check(relay.commands.some(x => x.op === 'socketSend' && JSON.parse(x.data).type === 'video' && JSON.parse(x.data).data === 'c2NyZWVu'), 'relay sends actual screen capture through original video protocol');
    const socket=relay.commands.find(x => x.op === 'socket' && x.url.includes('/api/gemini-live/ws'));
    relay.event({kind:'socket',id:socket.id,type:'message',data:JSON.stringify({type:'gemini.message',audioParts:[{data:Buffer.alloc(4800).toString('base64'),mimeType:'audio/pcm;rate=24000'}]})});
    const audio=relay.commands.filter(x => x.op === 'audio').at(-1);
    check(audio?.rate === 24000, 'relay model audio reaches existing PCM player and native output');
    relay.event({kind:'audioEnded',id:audio.id});
    check(relay.run('appState.geminiReminder.player.sources.length') === 0, 'relay native completion drains original audio queue');
    relay.run('__screenCommand("stop")');
    await flush();
    const stopped = relay.commands.filter(x => x.op === 'socketSend').length;
    relay.event({kind:'pcm',data:Buffer.alloc(6400).toString('base64')});
    check(relay.commands.filter(x => x.op === 'socketSend').length === stopped, 'relay stops microphone after release');
  } finally { relay.close(); }
  console.log('Screen sharing runtime:', checks, 'behavior checks passed; no live model calls.');
})().catch(error => { console.error(error); process.exitCode = 1; });
