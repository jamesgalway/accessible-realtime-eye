const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class MockTrack {
  constructor(kind) {
    this.kind = kind;
    this.readyState = 'live';
  }
  stop() {
    this.readyState = 'ended';
  }
}

class MockMediaStream {
  constructor(tracks = []) {
    this.tracks = tracks;
    this.active = true;
  }
  getTracks() { return this.tracks; }
  getVideoTracks() { return this.tracks.filter((track) => track.kind === 'video'); }
  getAudioTracks() { return this.tracks.filter((track) => track.kind === 'audio'); }
}

class MockCanvas {
  constructor() {
    this.width = 0;
    this.height = 0;
  }
  getContext() {
    return { drawImage() {} };
  }
  captureStream() {
    return new MockMediaStream([new MockTrack('video')]);
  }
  toDataURL() {
    return `data:image/jpeg;base64,native-${this.width}x${this.height}`;
  }
}

class MockImage {
  constructor() {
    this.onload = null;
    this.naturalWidth = 512;
    this.naturalHeight = 910;
  }
  set src(value) {
    this.value = value;
    if (this.onload) this.onload();
  }
}

global.window = global;
global.location = { href: 'https://gemini-eye.zzypiano401402.xyz/' };
global.__ACCESSIBLE_VISION_BACKEND__ = 'greenCloud';
global.document = {
  createElement(name) {
    if (name === 'canvas') return new MockCanvas();
    throw new Error(`Unexpected element ${name}`);
  }
};
global.Image = MockImage;
global.MediaStream = MockMediaStream;
global.navigator = {
  mediaDevices: {
    async getUserMedia(constraints) {
      return new MockMediaStream(constraints.audio ? [new MockTrack('audio')] : []);
    }
  }
};
global.webkit = {
  messageHandlers: {
    nativeVision: { postMessage() {} }
  }
};

let findResult = null;
let networkDepthRequests = 0;
const findRequestBodies = [];
global.fetch = async (input, init = {}) => {
  const path = new URL(typeof input === 'string' ? input : input.url, location.href).pathname;
  if (path === '/api/client-log') {
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }
  if (path === '/api/continuous-narration-depth') {
    networkDepthRequests += 1;
    return new Response(JSON.stringify({ ok: true, available: false }), { status: 200 });
  }
  if (path.startsWith('/api/find-object')) {
    findRequestBodies.push(JSON.parse(init.body || '{}'));
    return new Response(JSON.stringify(findResult), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};

global.captureReminderFrame = () => 'data:image/jpeg;base64,web-fallback';
let lastLiveEvent = null;
global.sendGeminiLiveEvent = (event) => {
  lastLiveEvent = event;
  return true;
};
global.logClientEvent = () => {};

const swift = fs.readFileSync(
  'ios-native/AccessibleVision/Services/NativeVisionBridgeScript.swift',
  'utf8'
);
const match = swift.match(/static let source = #"""\r?\n([\s\S]*?)\r?\n    """#/);
assert.ok(match, 'Bridge JavaScript must be embedded in the Swift source.');
const source = match[1]
  .split(/\r?\n/)
  .map((line) => line.startsWith('    ') ? line.slice(4) : line)
  .join('\n');
vm.runInThisContext(source, { filename: 'NativeVisionBridge.js' });
window.__accessibleVisionEnableRuntimeHooks();

function packet(frameId, meters, lidarAvailable = true) {
  return {
    frameId,
    capturedAtMs: Date.now(),
    imageDataUrl: `data:image/jpeg;base64,frame-${frameId}`,
    width: 512,
    height: 910,
    lidarAvailable,
    depthGridWidth: 24,
    depthGridHeight: 42,
    depthGrid: Array(24 * 42).fill(meters),
    cameraIntrinsics: {
      fx: 1000, fy: 1000, cx: 720, cy: 960, sourceWidth: 1440, sourceHeight: 1920
    }
  };
}

async function run() {
  window.__accessibleVisionReceiveFrame(packet(1, 0.70));
  const nearImage = captureReminderFrame({ maxWidth: 512, quality: 0.55 });
  assert.match(nearImage, /^data:image\/jpeg;base64,native-/);
  findResult = {
    ok: true,
    status: 'walk_forward',
    visible: 'yes',
    hand: 'missing',
    zone: 'center',
    targetX: 0.5,
    targetY: 0.5,
    confidence: 0.9
  };
  let response = await fetch('/api/find-object-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageDataUrl: nearImage,
      target: 'test target',
      frameCount: 1,
      reminderSessionId: 'test-session'
    })
  });
  let result = await response.json();
  assert.equal(result.status, 'hand_missing');
  assert.equal(result.nativeLidar.decision, 'allow_hand_phase');
  assert.equal(result.nativeLidar.frameId, 1);
  assert.equal(findRequestBodies.at(-1).nativeFindDepthPolicy, 'apple_lidar_only_v1');

  window.__accessibleVisionReceiveFrame(packet(2, 1.50));
  const farImage = captureReminderFrame({ maxWidth: 512, quality: 0.55 });
  findResult = {
    ok: true,
    status: 'hand_missing',
    visible: 'yes',
    hand: 'missing',
    zone: 'right',
    targetX: 0.82,
    targetY: 0.5,
    confidence: 0.9
  };
  response = await fetch('/api/find-object-live-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageDataUrl: farImage,
      target: 'test target',
      frameCount: 2,
      reminderSessionId: 'test-session'
    })
  });
  result = await response.json();
  assert.equal(result.status, 'walk_right');
  assert.equal(result.nativeLidar.decision, 'keep_approach_phase');
  assert.equal(result.nativeLidar.frameId, 2);
  assert.equal(findRequestBodies.at(-1).nativeFindDepthPolicy, 'apple_lidar_only_v1');

  window.__ACCESSIBLE_VISION_BACKEND__ = 'aliyun';
  await fetch('/api/find-object-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageDataUrl: farImage,
      target: 'test target',
      frameCount: 3,
      reminderSessionId: 'aliyun-test-session'
    })
  });
  assert.equal(findRequestBodies.at(-1).nativeFindDepthPolicy, undefined);
  window.__ACCESSIBLE_VISION_BACKEND__ = 'greenCloud';

  response = await fetch('/api/continuous-narration-depth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageDataUrl: farImage })
  });
  result = await response.json();
  assert.equal(result.available, true);
  assert.equal(result.source, 'apple_lidar');
  assert.equal(result.summary.zones.length, 9);
  assert.equal(networkDepthRequests, 0);

  sendGeminiLiveEvent({
    type: 'ask',
    text: '[NARRATE]视觉估距素材：中央约1.5米。这是单摄像头粗略估算，不是雷达；只能结合本次画面使用“大约”或“左右”，不得精确到厘米，不确定时不要说距离。'
  });
  assert.match(lastLiveEvent.text, /苹果LiDAR同步测距素材/);
  assert.match(lastLiveEvent.text, /苹果雷达/);
  assert.doesNotMatch(lastLiveEvent.text, /不是雷达/);

  window.__accessibleVisionReceiveFrame(packet(3, 1.20, false));
  response = await fetch('/api/continuous-narration-depth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageDataUrl: farImage })
  });
  result = await response.json();
  assert.equal(result.available, false);
  assert.equal(result.source, 'apple_lidar');
  assert.equal(result.reason, 'native_lidar_unavailable');
  assert.equal(networkDepthRequests, 0);

  console.log('Native vision bridge harness: 18/18 PASS');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
