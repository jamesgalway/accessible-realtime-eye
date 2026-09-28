'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const posts = [];
const dispatched = [];
const context = {
  console,
  Date,
  Math,
  Set,
  CustomEvent: class CustomEvent {
    constructor(type, options) {
      this.type = type;
      this.detail = options.detail;
    }
  }
};
context.window = context;
context.globalThis = context;
context.dispatchEvent = (event) => dispatched.push(event);
context.webkit = {
  messageHandlers: {
    teachingViewpoint: {
      postMessage: (message) => posts.push(message)
    }
  }
};
vm.createContext(context);
const runtime = fs.readFileSync(path.join(
  __dirname,
  '..',
  'AccessibleVision',
  'Services',
  'TeachingViewpointRuntime.js'
), 'utf8');
vm.runInContext(runtime, context);

const guard = context.ZzyaiTeachingViewpointGuard;
assert.equal(guard.available, true);
const events = [];
guard.subscribe((event) => events.push(event));
const binding = guard.begin({
  sessionId: 'session-1',
  taskBatchId: 'batch-1',
  viewpointPlanId: 'plan-1',
  policy: {
    safeFrame: { minX: 0.1, maxX: 0.9, minY: 0.1, maxY: 0.9 },
    noticeProjectionShift: 0.05,
    maxProjectionShift: 0.25,
    maxCameraTranslationMeters: 0.5,
    maxDistanceChangeRatio: 0.5,
    failureSamples: 2
  }
});
assert.equal(posts.at(-1).type, 'begin');
assert.equal(binding.taskBatchId, 'batch-1');

assert.throws(
  () => guard.seed({ box: [0.4, 0.4, 0.2, 0.2] }),
  /exact native frameId/
);
guard.seed({ box: [0.4, 0.4, 0.2, 0.2], frameId: 7 });
assert.equal(posts.at(-1).type, 'seed');
assert.equal(posts.at(-1).frameId, 7);

const nativeBinding = {
  token: posts.at(-1).token,
  sessionId: 'session-1',
  taskBatchId: 'batch-1',
  viewpointPlanId: 'plan-1',
  seedFrameId: 7
};
context.__teachingViewpointObservation({
  ...nativeBinding,
  valid: false,
  anchorReady: true,
  reason: 'anchor_created',
  seedCameraWorld: [0, 0, 0],
  seedCameraForward: [0, 0, -1],
  seedCameraUp: [0, 1, 0],
  seedMeters: 1,
  seedProjectionX: 0.5,
  seedProjectionY: 0.5,
  seedCapturedAt: Date.now()
});
assert.equal(events.at(-1).state, 'reference_locked');
context.__teachingViewpointObservation({
  ...nativeBinding,
  valid: true,
  x: 0.5,
  y: 0.5,
  meters: 1,
  onScreen: true,
  inFront: true,
  cameraWorld: [0, 0, 0],
  cameraForward: [0, 0, -1],
  cameraUp: [0, 1, 0]
});
assert.equal(events.at(-1).state, 'stable');

context.__teachingViewpointObservation({
  ...nativeBinding,
  valid: true,
  x: 0.58,
  y: 0.5,
  meters: 1,
  onScreen: true,
  inFront: true,
  cameraWorld: [0.02, 0, 0],
  cameraForward: [0, 0, -1],
  cameraUp: [0, 1, 0]
});
assert.equal(events.at(-1).state, 'changed_but_usable');
const changedEventCount = events.length;
context.__teachingViewpointObservation({
  ...nativeBinding,
  valid: true,
  x: 0.58,
  y: 0.5,
  meters: 1,
  onScreen: true,
  inFront: true,
  cameraWorld: [0.02, 0, 0],
  cameraForward: [0, 0, -1],
  cameraUp: [0, 1, 0]
});
assert.equal(events.length, changedEventCount, 'unchanged usable drift must not flood events');

context.__teachingViewpointObservation({
  ...nativeBinding,
  valid: true,
  x: 0.5,
  y: 0.5,
  meters: 1,
  onScreen: true,
  inFront: true,
  cameraWorld: [0, 0, 0],
  cameraForward: [1, 0, 0],
  cameraUp: [0, 1, 0]
});
assert.equal(events.at(-1).state, 'needs_correction');
assert.equal(events.at(-1).reason, 'camera_orientation_exceeded_viewpoint_tolerance');

guard.stop('rotation_test_complete');
guard.begin({
  sessionId: 'session-1',
  taskBatchId: 'batch-1',
  viewpointPlanId: 'plan-1',
  policy: { failureSamples: 1 }
});
guard.seed({ box: [0.4, 0.4, 0.2, 0.2], frameId: 8 });
const secondNativeBinding = {
  token: posts.at(-1).token,
  sessionId: 'session-1',
  taskBatchId: 'batch-1',
  viewpointPlanId: 'plan-1',
  seedFrameId: 8
};
context.__teachingViewpointObservation({
  ...secondNativeBinding,
  valid: false,
  anchorReady: true,
  reason: 'anchor_created',
  seedCameraWorld: [0, 0, 0],
  seedCameraForward: [0, 0, -1],
  seedCameraUp: [0, 1, 0],
  seedMeters: 1,
  seedProjectionX: 0.5,
  seedProjectionY: 0.5,
  seedCapturedAt: Date.now()
});
context.__teachingViewpointObservation({
  ...secondNativeBinding,
  valid: true,
  x: 0.5,
  y: 0.5,
  meters: 1,
  onScreen: true,
  inFront: true,
  cameraWorld: [0, 0, 0],
  cameraForward: [0, 0, -1],
  cameraUp: [0, 1, 0]
});

context.__teachingViewpointObservation({
  ...secondNativeBinding,
  valid: true,
  x: 1.1,
  y: 0.5,
  meters: 1,
  onScreen: false,
  inFront: true,
  cameraWorld: [0.1, 0, 0],
  cameraForward: [0, 0, -1],
  cameraUp: [0, 1, 0]
});
assert.equal(events.at(-1).state, 'needs_correction');
assert.equal(events.at(-1).causeType, 'required_content_left_frame');
assert.ok(dispatched.some((event) => event.type === 'zzyai-teaching-viewpoint'));

guard.stop('safe_frame_test_complete');
guard.begin({
  sessionId: 'session-envelope',
  taskBatchId: 'batch-envelope',
  viewpointPlanId: 'plan-envelope',
  policy: { maxAngularDeltaDegrees: 1000 }
});
guard.seed({ box: [0.4, 0.4, 0.2, 0.2], frameId: 9 });
const envelopeBinding = {
  token: posts.at(-1).token,
  sessionId: 'session-envelope',
  taskBatchId: 'batch-envelope',
  viewpointPlanId: 'plan-envelope',
  seedFrameId: 9
};
context.__teachingViewpointObservation({
  ...envelopeBinding,
  valid: false,
  anchorReady: true,
  reason: 'anchor_created',
  seedCameraWorld: [0, 0, 0],
  seedCameraForward: [0, 0, -1],
  seedCameraUp: [0, 1, 0],
  seedMeters: 1,
  seedProjectionX: 0.5,
  seedProjectionY: 0.5,
  seedCapturedAt: Date.now()
});
context.__teachingViewpointObservation({
  ...envelopeBinding,
  valid: true,
  x: 0.5,
  y: 0.5,
  meters: 1,
  onScreen: true,
  inFront: true,
  cameraWorld: [0, 0, 0],
  cameraForward: [0, 0, -1],
  cameraUp: [0, 1, 0]
});
context.__teachingViewpointObservation({
  ...envelopeBinding,
  valid: true,
  x: 0.5,
  y: 0.5,
  meters: 1,
  onScreen: true,
  inFront: true,
  cameraWorld: [0, 0, 0],
  cameraForward: [0.5, 0, -0.8660254],
  cameraUp: [0, 1, 0]
});
assert.equal(events.at(-1).state, 'needs_correction');
assert.equal(events.at(-1).reason, 'camera_orientation_exceeded_viewpoint_tolerance');

guard.stop('test_complete');
assert.equal(posts.at(-1).type, 'stop');
assert.equal(guard.currentBinding(), null);

console.log('Teaching viewpoint runtime tests passed.');
