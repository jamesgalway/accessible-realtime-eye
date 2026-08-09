import Foundation

enum NativeVisionBridgeScript {
    static let source = #"""
    (() => {
      if (window.__ACCESSIBLE_VISION_NATIVE_BRIDGE_INSTALLED__) return;
      window.__ACCESSIBLE_VISION_NATIVE_BRIDGE_INSTALLED__ = true;

      const state = {
        latest: null,
        frames: new Map(),
        frameOrder: [],
        captureRecords: [],
        canvas: document.createElement('canvas'),
        context: null,
        imageReady: false,
        nativeStream: null,
        findSessions: new Map(),
        lastNativeDepthAt: 0,
        runtimeHooksInstalled: false
      };
      state.canvas.width = 288;
      state.canvas.height = 512;
      state.context = state.canvas.getContext('2d', { alpha: false });

      const postNative = (message) => {
        try {
          window.webkit?.messageHandlers?.nativeVision?.postMessage(message);
        } catch (_) {}
      };

      const rememberFrame = (packet) => {
        state.frames.set(packet.frameId, packet);
        state.frameOrder.push(packet.frameId);
        while (state.frameOrder.length > 12) {
          state.frames.delete(state.frameOrder.shift());
        }
      };

      window.__accessibleVisionReceiveFrame = (packet) => {
        if (!packet || !packet.frameId || !packet.imageDataUrl) return;
        state.latest = packet;
        rememberFrame(packet);
        const image = new Image();
        image.onload = () => {
          if (!state.latest || state.latest.frameId !== packet.frameId) return;
          const width = Math.max(1, Number(packet.width || image.naturalWidth || 288));
          const height = Math.max(1, Number(packet.height || image.naturalHeight || 512));
          if (state.canvas.width !== width || state.canvas.height !== height) {
            state.canvas.width = width;
            state.canvas.height = height;
            state.context = state.canvas.getContext('2d', { alpha: false });
          }
          state.context.drawImage(image, 0, 0, width, height);
          state.imageReady = true;
        };
        image.src = packet.imageDataUrl;
      };

      const waitForNativeFrame = async (timeoutMs = 7000) => {
        const startedAt = Date.now();
        while (!state.imageReady && Date.now() - startedAt < timeoutMs) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        return state.imageReady;
      };

      const originalGetUserMedia = navigator.mediaDevices?.getUserMedia
        ? navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
        : null;
      if (originalGetUserMedia) {
        navigator.mediaDevices.getUserMedia = async (constraints = {}) => {
          const wantsVideo = Boolean(constraints?.video);
          if (!wantsVideo || typeof state.canvas.captureStream !== 'function') {
            return originalGetUserMedia(constraints);
          }
          let audioStream = null;
          try {
            if (constraints?.audio) {
              audioStream = await originalGetUserMedia({ audio: constraints.audio, video: false });
            }
            const ready = await waitForNativeFrame();
            if (!ready) throw new Error('native_camera_timeout');
            if (!state.nativeStream || !state.nativeStream.active) {
              state.nativeStream = state.canvas.captureStream(3);
            }
            const tracks = [
              ...state.nativeStream.getVideoTracks(),
              ...(audioStream?.getAudioTracks?.() || [])
            ];
            postNative({ type: 'nativeStreamStarted' });
            return new MediaStream(tracks);
          } catch (error) {
            audioStream?.getTracks?.().forEach((track) => track.stop());
            postNative({ type: 'fallbackWebCamera', reason: String(error?.message || error) });
            await new Promise((resolve) => setTimeout(resolve, 350));
            return originalGetUserMedia(constraints);
          }
        };
      }

      const rememberCapture = (dataUrl, frameId) => {
        if (!dataUrl || !frameId) return;
        state.captureRecords.push({ dataUrl, frameId });
        if (state.captureRecords.length > 10) state.captureRecords.shift();
      };

      const frameIdForCapture = (dataUrl) => {
        for (let index = state.captureRecords.length - 1; index >= 0; index -= 1) {
          if (state.captureRecords[index].dataUrl === dataUrl) {
            return state.captureRecords[index].frameId;
          }
        }
        return state.latest?.frameId || 0;
      };

      const captureNativeFrame = (options = {}) => {
        if (!state.imageReady || !state.latest) return '';
        const maxWidth = Math.max(1, Number(options.maxWidth || 512));
        const quality = Math.min(0.92, Math.max(0.35, Number(options.quality || 0.60)));
        const scale = Math.min(1, maxWidth / Math.max(1, state.canvas.width));
        const width = Math.max(1, Math.round(state.canvas.width * scale));
        const height = Math.max(1, Math.round(state.canvas.height * scale));
        const output = document.createElement('canvas');
        output.width = width;
        output.height = height;
        const context = output.getContext('2d', { alpha: false });
        context.drawImage(state.canvas, 0, 0, width, height);
        const dataUrl = output.toDataURL('image/jpeg', quality);
        rememberCapture(dataUrl, state.latest.frameId);
        return dataUrl;
      };

      const validDepthValues = (values) => values
        .map(Number)
        .filter((value) => Number.isFinite(value) && value > 0.05 && value < 8)
        .sort((left, right) => left - right);

      const percentile = (values, fraction) => {
        const sorted = validDepthValues(values);
        if (!sorted.length) return null;
        const index = Math.min(
          sorted.length - 1,
          Math.floor((sorted.length - 1) * Math.max(0, Math.min(1, fraction)))
        );
        return sorted[index];
      };

      const sampleTargetDepth = (packet, targetX, targetY) => {
        const width = Number(packet?.depthGridWidth || 0);
        const height = Number(packet?.depthGridHeight || 0);
        const grid = packet?.depthGrid;
        if (
          !packet?.lidarAvailable
          || !Array.isArray(grid)
          || grid.length !== width * height
          || !Number.isFinite(Number(targetX))
          || !Number.isFinite(Number(targetY))
        ) return null;
        const centerX = Math.round(Math.max(0, Math.min(1, Number(targetX))) * (width - 1));
        const centerY = Math.round(Math.max(0, Math.min(1, Number(targetY))) * (height - 1));
        const samples = [];
        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            const x = Math.max(0, Math.min(width - 1, centerX + offsetX));
            const y = Math.max(0, Math.min(height - 1, centerY + offsetY));
            samples.push(grid[(y * width) + x]);
          }
        }
        const sorted = validDepthValues(samples);
        if (sorted.length < 3) return null;
        const meters = sorted[Math.floor(sorted.length / 2)];
        const low = sorted[Math.floor((sorted.length - 1) * 0.1)];
        const high = sorted[Math.ceil((sorted.length - 1) * 0.9)];
        const spread = Math.max(0, high - low) / Math.max(0.1, meters);
        const confidence = Math.max(0, Math.min(1, 1 - spread));
        if (confidence < 0.40) return null;
        return { meters, confidence, sampleCount: sorted.length };
      };

      const summarizeDepth = (packet) => {
        const width = Number(packet?.depthGridWidth || 0);
        const height = Number(packet?.depthGridHeight || 0);
        const grid = packet?.depthGrid;
        if (
          !packet?.lidarAvailable
          || width < 8
          || height < 8
          || !Array.isArray(grid)
          || grid.length !== width * height
        ) return null;
        const rowNames = ['upper', 'middle', 'lower'];
        const columnNames = ['left', 'center', 'right'];
        const zones = [];
        for (let row = 0; row < 3; row += 1) {
          const startY = Math.floor((row * height) / 3);
          const endY = Math.floor(((row + 1) * height) / 3);
          for (let column = 0; column < 3; column += 1) {
            const startX = Math.floor((column * width) / 3);
            const endX = Math.floor(((column + 1) * width) / 3);
            const values = [];
            for (let y = startY; y < endY; y += 1) {
              for (let x = startX; x < endX; x += 1) {
                values.push(grid[(y * width) + x]);
              }
            }
            const representative = percentile(values, 0.25);
            if (Number.isFinite(representative)) {
              zones.push({
                row: rowNames[row],
                column: columnNames[column],
                approximateMeters: Number(representative.toFixed(1))
              });
            }
          }
        }
        const overallNearM = percentile(grid, 0.10);
        if (!Number.isFinite(overallNearM) || zones.length < 3) return null;
        return {
          layout: '3x3',
          method: 'apple_lidar_synchronized_depth',
          approximate: true,
          overallNearM: Number(overallNearM.toFixed(1)),
          zones
        };
      };

      const findDirectionForZone = (zone) => ({
        left: 'walk_left',
        center: 'walk_forward',
        right: 'walk_right'
      }[String(zone || '')] || '');

      const applyNativeFindDepth = (result, packet, body) => {
        if (!result || !packet?.lidarAvailable) return result;
        if (String(result.visible || '') !== 'yes' || String(result.hand || '') !== 'missing') {
          return result;
        }
        const status = String(result.status || 'uncertain');
        const eligible = new Set([
          'walk_left', 'walk_right', 'walk_forward', 'hand_missing', 'target_visible', 'uncertain'
        ]);
        if (!eligible.has(status)) return result;
        const sample = sampleTargetDepth(packet, result.targetX, result.targetY);
        if (!sample) return result;
        const key = `${String(body?.reminderSessionId || '')}:${String(body?.target || '')}`;
        const previous = state.findSessions.get(key) || { near: false };
        let near = Boolean(previous.near);
        if (near && sample.meters >= 1.10) near = false;
        if (!near && sample.meters <= 0.85) near = true;
        state.findSessions.set(key, { near, updatedAt: Date.now() });
        const direction = findDirectionForZone(result.zone);
        const replacementStatus = near ? 'hand_missing' : direction;
        if (!replacementStatus) return result;
        const adjusted = {
          ...result,
          status: replacementStatus,
          nativeLidar: {
            available: true,
            source: 'apple_lidar',
            targetDepthM: Number(sample.meters.toFixed(3)),
            confidence: Number(sample.confidence.toFixed(3)),
            sampleCount: sample.sampleCount,
            nearPhaseLatched: near,
            nearThresholdM: 0.85,
            releaseThresholdM: 1.10,
            originalStatus: status,
            decision: near ? 'allow_hand_phase' : 'keep_approach_phase',
            frameId: packet.frameId
          }
        };
        if (typeof window.logClientEvent === 'function') {
          window.logClientEvent('native_lidar.find_decision', {
            target: String(body?.target || ''),
            frameCount: Number(body?.frameCount || 0),
            originalStatus: status,
            status: adjusted.status,
            zone: String(result.zone || ''),
            targetDepthM: adjusted.nativeLidar.targetDepthM,
            confidence: adjusted.nativeLidar.confidence,
            nearPhaseLatched: near,
            nativeFrameId: packet.frameId
          });
        }
        return adjusted;
      };

      const jsonResponse = (data, response = null) => {
        const headers = new Headers(response?.headers || {});
        headers.set('Content-Type', 'application/json; charset=utf-8');
        headers.delete('Content-Length');
        headers.delete('Content-Encoding');
        return new Response(JSON.stringify(data), {
          status: response?.status || 200,
          statusText: response?.statusText || 'OK',
          headers
        });
      };

      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input, init = {}) => {
        const url = typeof input === 'string' ? input : String(input?.url || '');
        const path = (() => {
          try { return new URL(url, location.href).pathname; } catch (_) { return url; }
        })();
        let body = null;
        if (typeof init?.body === 'string') {
          try { body = JSON.parse(init.body); } catch (_) {}
        }

        if (path === '/api/continuous-narration-depth') {
          const summary = summarizeDepth(state.latest);
          if (summary) {
            state.lastNativeDepthAt = Date.now();
            if (typeof window.logClientEvent === 'function') {
              window.logClientEvent('native_lidar.continuous_depth', {
                available: true,
                overallNearM: summary.overallNearM,
                nativeFrameId: state.latest.frameId
              });
            }
            return jsonResponse({
              ok: true,
              available: true,
              approximate: true,
              unit: 'meter',
              source: 'apple_lidar',
              summary,
              latencyMs: 0,
              modelLatencyMs: 0
            });
          }
        }

        const response = await originalFetch(input, init);
        const findPaths = new Set([
          '/api/find-object-check',
          '/api/find-object-live-check',
          '/api/find-object-direct-finalize'
        ]);
        if (!findPaths.has(path) || !response.ok || !body) return response;
        try {
          const result = await response.clone().json();
          const frameId = frameIdForCapture(body.imageDataUrl);
          const packet = state.frames.get(frameId) || state.latest;
          return jsonResponse(applyNativeFindDepth(result, packet, body), response);
        } catch (_) {
          return response;
        }
      };

      window.__accessibleVisionEnableRuntimeHooks = () => {
        if (state.runtimeHooksInstalled) return;
        state.runtimeHooksInstalled = true;
        if (typeof window.captureReminderFrame === 'function') {
          const originalCaptureReminderFrame = window.captureReminderFrame;
          window.captureReminderFrame = function(options = {}) {
            const nativeCapture = captureNativeFrame(options);
            return nativeCapture || originalCaptureReminderFrame.apply(this, arguments);
          };
        }
        if (typeof window.sendGeminiLiveEvent === 'function') {
          const originalSendGeminiLiveEvent = window.sendGeminiLiveEvent;
          window.sendGeminiLiveEvent = function(event) {
            if (
              event
              && typeof event.text === 'string'
              && Date.now() - state.lastNativeDepthAt < 15000
            ) {
              event = {
                ...event,
                text: event.text
                  .replace('视觉估距素材：', '苹果LiDAR同步测距素材：')
                  .replace(
                    '这是单摄像头粗略估算，不是雷达；只能结合本次画面使用“大约”或“左右”，不得精确到厘米，不确定时不要说距离。',
                    '距离来自本次画面同步的苹果雷达；使用“大约”或“左右”播报，不确定时不要说距离。'
                  )
              };
            }
            return originalSendGeminiLiveEvent.call(this, event);
          };
        }
        postNative({ type: 'runtimeHooksInstalled' });
      };

      postNative({ type: 'bridgeInstalled' });
    })();
    """#
}
