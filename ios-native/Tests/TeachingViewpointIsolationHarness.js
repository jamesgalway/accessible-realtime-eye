'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const services = path.join(__dirname, '..', 'AccessibleVision', 'Services');
const findPath = path.join(services, 'NativeFindAnchorTracker.swift');
const teachingPath = path.join(services, 'TeachingViewpointAnchorTracker.swift');
const cameraPath = path.join(services, 'NativeCameraService.swift');
const bridgePath = path.join(services, 'TeachingViewpointBridge.swift');
const webViewPath = path.join(__dirname, '..', 'AccessibleVision', 'Views', 'GreenCloudWebView.swift');
const findSource = fs.readFileSync(findPath, 'utf8');
const teachingSource = fs.readFileSync(teachingPath, 'utf8');
const cameraSource = fs.readFileSync(cameraPath, 'utf8');
const bridgeSource = fs.readFileSync(bridgePath, 'utf8');
const webViewSource = fs.readFileSync(webViewPath, 'utf8');

const findHash = crypto.createHash('sha256')
  .update(findSource.replace(/\r\n/g, '\n'))
  .digest('hex');
assert.equal(
  findHash,
  'c9b0d09a92e69b8e86ee02ec4c666ae6477dccad2a41807156379a34adaa123a',
  'the frozen find-object anchor tracker must not change while adding teaching support'
);

assert.match(teachingSource, /final class TeachingViewpointAnchorTracker/);
assert.doesNotMatch(teachingSource, /final class NativeFindTracker/);
assert.match(teachingSource, /teaching-viewpoint-reference/);
assert.doesNotMatch(teachingSource, /native-find-target/);
assert.match(teachingSource, /teaching_viewpoint_world_anchor/);
assert.match(teachingSource, /taskBatchId/);
assert.match(teachingSource, /viewpointPlanId/);
assert.match(teachingSource, /cameraForward/);
assert.match(teachingSource, /cameraUp/);
assert.match(teachingSource, /seedCameraWorld/);
assert.match(teachingSource, /seedCameraForward/);
assert.match(teachingSource, /seedCameraUp/);
assert.match(teachingSource, /seedMeters/);
assert.match(teachingSource, /seedCapturedAt/);
assert.match(teachingSource, /func stop\(\)/);

assert.match(findSource, /final class NativeFindTracker/);
assert.match(cameraSource, /let findTracker = NativeFindTracker\(\)/);
assert.match(cameraSource, /let teachingViewpointTracker = TeachingViewpointAnchorTracker\(\)/);
assert.match(cameraSource, /findTracker\.process\(frame, packet: packet\)/);
assert.match(cameraSource, /teachingViewpointTracker\.process\(frame, packet: packet\)/);
assert.match(bridgeSource, /final class TeachingViewpointBridge/);
assert.match(bridgeSource, /sessionId/);
assert.match(bridgeSource, /taskBatchId/);
assert.match(bridgeSource, /viewpointPlanId/);
assert.match(webViewSource, /name: "teachingViewpoint"/);
assert.match(webViewSource, /teachingViewpoint\.stop\(\)/);

console.log('Teaching viewpoint isolation tests passed.');
