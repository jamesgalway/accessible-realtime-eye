'use strict';

(() => {
  if (window.__teachingViewpointRuntimeInstalled) return;
  const handler = window.webkit?.messageHandlers?.teachingViewpoint;
  if (!handler) return;
  window.__teachingViewpointRuntimeInstalled = true;

  const listeners = new Set();
  let active = null;
  let baseline = null;
  let badSamples = 0;
  let lastState = '';

  const number = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
  const post = (body) => handler.postMessage(body);
  const token = () => globalThis.crypto?.randomUUID?.()
    || `teaching-viewpoint:${Date.now()}:${Math.random().toString(16).slice(2)}`;

  function normalizePolicy(input = {}) {
    const safeFrame = input.safeFrame || {};
    const policy = {
      minX: clamp(number(safeFrame.minX, 0.10), 0.05, 0.25),
      maxX: clamp(number(safeFrame.maxX, 0.90), 0.75, 0.95),
      minY: clamp(number(safeFrame.minY, 0.10), 0.05, 0.25),
      maxY: clamp(number(safeFrame.maxY, 0.90), 0.75, 0.95),
      noticeProjectionShift: clamp(number(input.noticeProjectionShift, 0.08), 0.03, 0.15),
      maxProjectionShift: clamp(number(input.maxProjectionShift, 0.22), 0.10, 0.35),
      maxCameraTranslationMeters: clamp(number(input.maxCameraTranslationMeters, 0.35), 0.10, 0.60),
      maxDistanceChangeRatio: clamp(number(input.maxDistanceChangeRatio, 0.35), 0.15, 0.60),
      maxAngularDeltaDegrees: clamp(number(input.maxAngularDeltaDegrees, 12), 5, 25),
      failureSamples: Math.round(clamp(number(input.failureSamples, 3), 2, 5))
    };
    policy.noticeProjectionShift = Math.min(policy.noticeProjectionShift, policy.maxProjectionShift);
    return policy;
  }

  function normalizeBox(box) {
    if (!Array.isArray(box) || box.length !== 4) return null;
    const values = box.map(Number);
    if (!values.every(Number.isFinite)) return null;
    const [x, y, width, height] = values;
    if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1 || y + height > 1) {
      return null;
    }
    return values;
  }

  function bindingMatches(payload) {
    return Boolean(active
      && payload?.token === active.token
      && payload?.sessionId === active.sessionId
      && payload?.taskBatchId === active.taskBatchId
      && payload?.viewpointPlanId === active.viewpointPlanId);
  }

  function emit(state, details = {}) {
    if (!active) return;
    const event = {
      state,
      sessionId: active.sessionId,
      taskBatchId: active.taskBatchId,
      viewpointPlanId: active.viewpointPlanId,
      token: active.token,
      at: Date.now(),
      ...details
    };
    if (state !== lastState) {
      lastState = state;
      listeners.forEach((listener) => {
        try { listener(event); } catch (_) {}
      });
      window.dispatchEvent(new CustomEvent('zzyai-teaching-viewpoint', { detail: event }));
    }
  }

  function stop(reason = 'stopped') {
    if (active) {
      post({ type: 'stop', token: active.token, reason });
    }
    active = null;
    baseline = null;
    badSamples = 0;
    lastState = '';
  }

  function begin(input = {}) {
    const sessionId = String(input.sessionId || '');
    const taskBatchId = String(input.taskBatchId || '');
    const viewpointPlanId = String(input.viewpointPlanId || '');
    if (!sessionId || !taskBatchId || !viewpointPlanId) {
      throw new Error('teaching viewpoint binding is incomplete');
    }
    stop('replaced');
    active = {
      token: token(),
      sessionId,
      taskBatchId,
      viewpointPlanId,
      policy: normalizePolicy(input.policy)
    };
    post({
      type: 'begin',
      token: active.token,
      sessionId,
      taskBatchId,
      viewpointPlanId
    });
    emit('waiting_for_reference');
    return { ...active };
  }

  function seed(input = {}) {
    if (!active) throw new Error('teaching viewpoint guard is not active');
    const box = normalizeBox(input.box);
    if (!box) throw new Error('teaching viewpoint reference box is invalid');
    const frameId = Number(input.frameId);
    if (!Number.isInteger(frameId) || frameId <= 0) {
      throw new Error('teaching viewpoint reference box requires its exact native frameId');
    }
    post({
      type: 'seed',
      token: active.token,
      sessionId: active.sessionId,
      taskBatchId: active.taskBatchId,
      viewpointPlanId: active.viewpointPlanId,
      frameId,
      box
    });
    emit('locking_reference', { frameId });
    return true;
  }

  function cameraDisplacement(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== 3 || right.length !== 3) {
      return null;
    }
    const values = left.map((value, index) => Number(value) - Number(right[index]));
    if (!values.every(Number.isFinite)) return null;
    return Math.hypot(...values);
  }

  function vectorAngleDegrees(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== 3 || right.length !== 3) {
      return null;
    }
    const a = left.map(Number);
    const b = right.map(Number);
    if (!a.every(Number.isFinite) || !b.every(Number.isFinite)) return null;
    const leftLength = Math.hypot(...a);
    const rightLength = Math.hypot(...b);
    if (leftLength <= 0 || rightLength <= 0) return null;
    const cosine = clamp(
      (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (leftLength * rightLength),
      -1,
      1
    );
    return Math.acos(cosine) * 180 / Math.PI;
  }

  function seedBaseline(payload) {
    const x = Number(payload.seedProjectionX);
    const y = Number(payload.seedProjectionY);
    const meters = Number(payload.seedMeters);
    const capturedAt = Number(payload.seedCapturedAt);
    const frameId = Number(payload.seedFrameId);
    const cameraWorld = payload.seedCameraWorld;
    const cameraForward = payload.seedCameraForward;
    const cameraUp = payload.seedCameraUp;
    const vectorValid = (value) => Array.isArray(value)
      && value.length === 3
      && value.map(Number).every(Number.isFinite);
    if (!Number.isInteger(frameId) || frameId <= 0
        || !Number.isFinite(x) || x < 0 || x > 1
        || !Number.isFinite(y) || y < 0 || y > 1
        || !Number.isFinite(meters) || meters <= 0
        || !Number.isFinite(capturedAt) || capturedAt <= 0
        || !vectorValid(cameraWorld)
        || !vectorValid(cameraForward)
        || !vectorValid(cameraUp)) {
      return null;
    }
    return {
      x,
      y,
      meters,
      cameraWorld: cameraWorld.map(Number),
      cameraForward: cameraForward.map(Number),
      cameraUp: cameraUp.map(Number),
      frameId,
      capturedAt
    };
  }

  function classify(payload) {
    if (!payload.valid) {
      if (payload.anchorReady) {
        baseline = seedBaseline(payload);
        if (!baseline) {
          emit('needs_correction', {
            causeType: 'framing_changed',
            reason: 'seed_frame_camera_truth_missing',
            instruction: '无法把机位锁定到模型刚才看到的精确画面，请重新确认本步骤机位。',
            nativeEvidence: payload
          });
          return;
        }
        emit('reference_locked', {
          seedFrameId: baseline.frameId,
          seedCapturedAt: baseline.capturedAt,
          nativeEvidence: payload
        });
        return;
      }
      badSamples += 1;
      if (payload.lost || badSamples >= active.policy.failureSamples) {
        emit('needs_correction', {
          causeType: payload.reason === 'camera_tracking_limited' ? 'camera_moved' : 'framing_changed',
          reason: String(payload.reason || 'native_viewpoint_unavailable'),
          instruction: '当前机位已经无法可靠支持后续判断，请调整手机，让本步骤要求的内容重新进入画面。',
          nativeEvidence: payload
        });
      }
      return;
    }
    badSamples = 0;
    if (!baseline) {
      emit('needs_correction', {
        causeType: 'framing_changed',
        reason: 'seed_frame_baseline_not_established',
        instruction: '当前观察没有绑定模型确认时的精确机位，请重新确认本步骤机位。',
        nativeEvidence: payload
      });
      return;
    }

    const x = Number(payload.x);
    const y = Number(payload.y);
    const meters = Number(payload.meters);
    const projectionShift = Math.hypot(x - baseline.x, y - baseline.y);
    const translation = cameraDisplacement(payload.cameraWorld, baseline.cameraWorld);
    const forwardAngle = vectorAngleDegrees(payload.cameraForward, baseline.cameraForward);
    const upAngle = vectorAngleDegrees(payload.cameraUp, baseline.cameraUp);
    const angularDeltaDegrees = Math.max(forwardAngle || 0, upAngle || 0);
    const distanceRatio = baseline.meters > 0 ? Math.abs(meters - baseline.meters) / baseline.meters : 0;
    const policy = active.policy;
    const outsideSafeFrame = !payload.onScreen || !payload.inFront
      || x < policy.minX || x > policy.maxX || y < policy.minY || y > policy.maxY;
    const materiallyChanged = outsideSafeFrame
      || projectionShift > policy.maxProjectionShift
      || (translation !== null && translation > policy.maxCameraTranslationMeters)
      || distanceRatio > policy.maxDistanceChangeRatio
      || angularDeltaDegrees > policy.maxAngularDeltaDegrees;
    const details = {
      projectionShift,
      cameraTranslationMeters: translation,
      distanceChangeRatio: distanceRatio,
      angularDeltaDegrees,
      nativeEvidence: payload
    };
    if (materiallyChanged) {
      emit('needs_correction', {
        ...details,
        causeType: outsideSafeFrame ? 'required_content_left_frame' : 'camera_moved',
        reason: outsideSafeFrame
          ? 'locked_reference_left_safe_frame'
          : angularDeltaDegrees > policy.maxAngularDeltaDegrees
            ? 'camera_orientation_exceeded_viewpoint_tolerance'
            : 'camera_pose_exceeded_viewpoint_tolerance',
        instruction: '机位变化已经影响后续判断，请调整手机，让本步骤要求的内容重新进入原来的有效取景范围。'
      });
      return;
    }
    if (projectionShift > policy.noticeProjectionShift) {
      emit('changed_but_usable', {
        ...details,
        causeType: 'framing_changed',
        reason: 'viewpoint_changed_but_remains_reliable'
      });
      return;
    }
    emit('stable', details);
  }

  window.__teachingViewpointFrame = (packet) => {
    // Frames are deliberately not used as a fallback for seeding. The model's
    // referenceBox must name the exact native frameId it observed.
    void packet;
  };

  window.__teachingViewpointObservation = (payload) => {
    if (!bindingMatches(payload)) return;
    classify(payload);
  };

  window.ZzyaiTeachingViewpointGuard = Object.freeze({
    available: true,
    begin,
    seed,
    stop,
    subscribe(listener) {
      if (typeof listener !== 'function') throw new Error('viewpoint listener must be a function');
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    currentBinding() {
      return active ? {
        sessionId: active.sessionId,
        taskBatchId: active.taskBatchId,
        viewpointPlanId: active.viewpointPlanId
      } : null;
    }
  });
})();
