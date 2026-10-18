/* Native browser-media compatibility for the isolated screen sharing context.
 * This file contains no reminder/narration policy. All task code is the verified
 * production app.js, loaded after this environment in its own JSContext. */
(function (root) {
  'use strict';
  root.window = root;
  root.self = root;
  const host = (op, data = {}) => JSON.parse(_screenHost(JSON.stringify({ op, ...data })) || 'null');
  let nextID = 0;
  const pending = new Map(), timers = new Map(), sockets = new Map(), sources = new Map(), speeches = new Map();
  const uid = () => ++nextID;
  root.__screenHostCall = host;
  class Events {
    constructor() { this.listeners = new Map(); }
    addEventListener(name, fn, options) {
      const list = this.listeners.get(name) || [];
      list.push({ fn, once: !!options?.once }); this.listeners.set(name, list);
    }
    removeEventListener(name, fn) { this.listeners.set(name, (this.listeners.get(name) || []).filter(x => x.fn !== fn)); }
    dispatchEvent(event) {
      event.target = this;
      this['on' + event.type]?.(event);
      for (const item of [...(this.listeners.get(event.type) || [])]) {
        if (item.once) this.removeEventListener(event.type, item.fn);
        item.fn(event);
      }
      return true;
    }
  }
  root.Event = class { constructor(type) { this.type = type; } };
  root.EventTarget = Events;
  root.setTimeout = (fn, ms = 0, ...args) => { const id = uid(); timers.set(id, { fn, args }); host('timer', { id, ms, repeat: false }); return id; };
  root.setInterval = (fn, ms = 0, ...args) => { const id = uid(); timers.set(id, { fn, args, repeat: true }); host('timer', { id, ms, repeat: true }); return id; };
  root.clearInterval = root.clearTimeout = id => { timers.delete(id); host('cancelTimer', { id }); };
  root.performance = { now: () => host('clock') * 1000 };
  root.atob = value => host('decodeBase64', { value });
  root.btoa = value => host('encodeBase64', { value });
  root.console = { log() {}, info() {}, debug() {}, warn() {}, error() {} };
  root.crypto = { randomUUID: () => host('uuid'), getRandomValues: bytes => { bytes.set(host('random', { length: bytes.length })); return bytes; } };
  root.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; this.rate = 1; } };
  root.speechSynthesis = {
    speaking: false,
    speak(utterance) { const id = uid(); speeches.set(id, utterance); host('speech', { id, text: utterance.text, rate: utterance.rate }); },
    cancel() { speeches.clear(); this.speaking = false; host('speechCancel'); }
  };
  root.AbortController = class {
    constructor() { this.signal = new Events(); this.signal.aborted = false; }
    abort() { if (!this.signal.aborted) { this.signal.aborted = true; this.signal.dispatchEvent({ type: 'abort' }); } }
  };
  root.Headers = class {
    constructor(input = {}) { this.map = new Map(input instanceof root.Headers ? input.entries() : Array.isArray(input) ? input : Object.entries(input)); }
    set(k, v) { this.map.set(String(k).toLowerCase(), String(v)); }
    append(k, v) { this.set(k, this.has(k) ? this.get(k) + ', ' + v : v); }
    get(k) { for (const [key, value] of this.map) if (key.toLowerCase() === k.toLowerCase()) return value; return null; }
    has(k) { return this.get(k) !== null; }
    delete(k) { for (const key of this.map.keys()) if (key.toLowerCase() === k.toLowerCase()) this.map.delete(key); }
    entries() { return this.map.entries(); }
    keys() { return this.map.keys(); }
    forEach(fn) { this.map.forEach((v, k) => fn(v, k, this)); }
    [Symbol.iterator]() { return this.entries(); }
  };
  root.URLSearchParams = class {
    constructor(input = '') { this.items = typeof input === 'string' ? input.replace(/^\?/, '').split('&').filter(Boolean).map(p => { const i = p.indexOf('='); return i < 0 ? [decodeURIComponent(p), ''] : [decodeURIComponent(p.slice(0, i)), decodeURIComponent(p.slice(i + 1))]; }) : Object.entries(input); }
    get(k) { return this.items.find(p => p[0] === k)?.[1] ?? null; }
    has(k) { return this.items.some(p => p[0] === k); }
    delete(k) { this.items = this.items.filter(p => p[0] !== k); }
    append(k, v) { this.items.push([k, String(v)]); }
    set(k, v) { this.delete(k); this.append(k, v); }
    toString() { return this.items.map(([k,v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&'); }
    [Symbol.iterator]() { return this.items[Symbol.iterator](); }
  };
  root.URL = class {
    constructor(value, base) {
      const parsed = host('url', { value: String(value), base: base ? String(base) : '' });
      if (!parsed) throw new TypeError('Invalid URL');
      Object.assign(this, parsed); this.searchParams = new root.URLSearchParams(parsed.search);
    }
    get protocol() { return this._protocol; }
    set protocol(value) {
      const scheme = String(value).match(/^([a-z][a-z0-9+.-]*):?$/i);
      if (scheme) this._protocol = scheme[1].toLowerCase() + ':';
    }
    get origin() { return this.protocol + '//' + this.host; }
    get href() { return this.toString(); }
    get search() { const value = this.searchParams?.toString(); return value ? '?' + value : ''; }
    set search(value) { this.searchParams = new root.URLSearchParams(value); }
    toString() { return this.protocol + '//' + this.host + this.pathname + this.search + (this.hash || ''); }
  };
  root.location = new root.URL(__screenBaseURL);
  root.isSecureContext = true;
  root.TextEncoder = class { encode(value) { return Uint8Array.from(host('utf8Encode', { value: String(value) })); } };
  root.TextDecoder = class { decode(value) { return host('utf8Decode', { value: Array.from(new Uint8Array(value?.buffer || value || [], value?.byteOffset || 0, value?.byteLength)) }); } };
  root.Blob = class {
    constructor(parts = [], options = {}) { this.parts = parts; this.type = options.type || ''; }
    async text() { return this.parts.map(p => typeof p === 'string' ? p : new root.TextDecoder().decode(p)).join(''); }
    async arrayBuffer() { return new root.TextEncoder().encode(await this.text()).buffer; }
  };
  root.Response = class {
    constructor(body = '', init = {}) { this.bodyText = String(body); this.status = init.status || 200; this.ok = this.status >= 200 && this.status < 300; this.headers = new root.Headers(init.headers); }
    async text() { return this.bodyText; }
    async json() { return JSON.parse(this.bodyText); }
    clone() { return new root.Response(this.bodyText, { status: this.status, headers: this.headers }); }
  };
  root.fetch = (input, init = {}) => new Promise((resolve, reject) => {
    if (init.signal?.aborted) { reject(new Error('Aborted')); return; }
    const id = uid();
    const abort = () => { pending.delete(id); host('cancelFetch', { id }); reject(new Error('Aborted')); };
    init.signal?.addEventListener('abort', abort, { once: true });
    pending.set(id, { resolve, reject, cleanup: () => init.signal?.removeEventListener('abort', abort) });
    host('fetch', { id, url: String(input?.url || input), method: init.method || 'GET', headers: Object.fromEntries(new root.Headers(init.headers)), body: init.body || null });
  });
  root.WebSocket = class extends Events {
    static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
    constructor(url) {
      super(); this.id = uid(); this.readyState = 0; this.url = String(url); sockets.set(this.id, this);
      // Browser socket events occur after callers attach their handlers.
      root.setTimeout(() => { if (this.readyState === 0) host('socket', { id: this.id, url: this.url }); }, 0);
    }
    send(data) { if (this.readyState !== 1) throw new Error('Socket is not open'); host('socketSend', { id: this.id, data: String(data) }); }
    close() { if (this.readyState >= 2) return; this.readyState = 2; host('socketClose', { id: this.id }); }
  };
  const store = new Map();
  root.localStorage = { getItem: k => store.get(k) || null, setItem: (k,v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  class Track extends Events {
    constructor(kind) { super(); this.kind = kind; this.enabled = true; this.readyState = 'live'; this.label = 'Screen sharing'; }
    stop() { this.readyState = 'ended'; }
    getSettings() { return this.kind === 'video' ? { width: 768, height: 1365, frameRate: 1 } : { sampleRate: 16000, channelCount: 1 }; }
  }
  root.MediaStream = class {
    constructor(tracks = []) { this.tracks = tracks; }
    getTracks() { return this.tracks; } getVideoTracks() { return this.tracks.filter(t => t.kind === 'video'); }
    getAudioTracks() { return this.tracks.filter(t => t.kind === 'audio'); }
    get active() { return this.tracks.some(t => t.readyState === 'live'); }
  };
  root.navigator = { userAgent: 'Huiyan-iOS-ScreenShare', mediaDevices: { getUserMedia: async () => {
    if (!host('hasFrame')) throw new Error('请先开始系统屏幕共享。');
    return new root.MediaStream([new Track('video'), new Track('audio')]);
  } } };
  class Element extends Events {
    constructor(id = '') { super(); this.id = id; this.value = ''; this.textContent = ''; this.hidden = false; this.disabled = false; this.checked = false; this.style = {}; this.dataset = {}; this.options = []; this.classList = { add() {}, remove() {}, toggle() {} }; }
    setAttribute(k,v) { if (k === 'hidden') this.hidden = true; else this[k] = v; }
    removeAttribute(k) { if (k === 'hidden') this.hidden = false; else delete this[k]; }
    toggleAttribute(k,v) { if (v) this.setAttribute(k, ''); else this.removeAttribute(k); }
    getAttribute(k) { return this[k] ?? null; }
    get readyState() { return host('hasFrame') ? 4 : 0; }
    get videoWidth() { return host('frameSize')?.width || 0; }
    get videoHeight() { return host('frameSize')?.height || 0; }
    play() { return Promise.resolve(); } pause() {} focus() {} prepend() {} append() {} replaceChildren() {} remove() {}
    getContext() { return { drawImage() {} }; }
    toDataURL(type, quality) { return host('capture', { width: this.width || 768, quality: quality || 0.6 }); }
  }
  const elements = new Map();
  root.document = {
    querySelector(selector) { if (!elements.has(selector)) elements.set(selector, new Element(selector)); return elements.get(selector); },
    querySelectorAll() { return []; }, createElement: name => new Element(name),
    addEventListener() {}, body: new Element('body')
  };
  root.document.querySelector('#realtime-mode').value = 'websocket';
  root.ZzyaiClientAccess = { profile: 'native', ready: Promise.resolve() };
  root.__ACCESSIBLE_VISION_NATIVE_IOS__ = true;
  root.AudioContext = class extends Events {
    constructor(options = {}) { super(); this.id = uid(); this.sampleRate = options.sampleRate || 16000; this.state = 'running'; this.destination = {}; }
    get currentTime() { return host('clock'); }
    async resume() { this.state = 'running'; }
    async close() { this.state = 'closed'; host('audioReset', { context: this.id }); }
    createBuffer(channels, length, rate) { const data = new Float32Array(length); return { duration: length / rate, rate, data, getChannelData: () => data }; }
    createBufferSource() {
      const context = this, id = uid();
      const source = { connect() {}, disconnect() {}, buffer: null, onended: null,
        start(at) {
          const pcm = new Int16Array(source.buffer.data.length);
          for (let i = 0; i < pcm.length; i++) pcm[i] = Math.max(-32768, Math.min(32767, Math.round(source.buffer.data[i] * 32768)));
          const bytes = new Uint8Array(pcm.buffer); let binary = '';
          for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
          sources.set(id, source);
          host('audio', { id, context: context.id, data: btoa(binary), rate: source.buffer.rate, delay: Math.max(0, at - context.currentTime) });
        },
        stop() { sources.delete(id); host('audioReset', { context: context.id }); }
      };
      return source;
    }
  };
  root.__screenEvent = event => {
    if (event.kind === 'timer') { const item = timers.get(event.id); if (!item) return; if (!item.repeat) timers.delete(event.id); item.fn(...item.args); }
    else if (event.kind === 'fetch') { const item = pending.get(event.id); if (!item) return; pending.delete(event.id); item.cleanup(); event.error ? item.reject(new Error(event.error)) : item.resolve(new root.Response(event.body, event)); }
    else if (event.kind === 'socket') { const socket = sockets.get(event.id); if (!socket) return; if (event.type === 'open') socket.readyState = 1; if (event.type === 'close') { socket.readyState = 3; sockets.delete(event.id); } socket.dispatchEvent(event); }
    else if (event.kind === 'audioEnded') { const source = sources.get(event.id); sources.delete(event.id); source?.onended?.(); }
    else if (event.kind === 'speech') { const speech = speeches.get(event.id); if (!speech) return; root.speechSynthesis.speaking = event.type === 'start'; if (event.type === 'end') speeches.delete(event.id); speech['on' + event.type]?.(); }
    else if (event.kind === 'pcm') root.__screenInput?.(event.data);
    else if (event.kind === 'network') root.__screenNetworkEvent?.(event.details);
  };
})(globalThis);
