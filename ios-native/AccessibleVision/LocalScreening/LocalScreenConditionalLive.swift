import Foundation

// Only the explicitly selected 1B Google experiment uses this runtime.
enum LocalScreenConditionalLive {
    static let script = #"""
    (() => {
      if (window.__ACCESSIBLE_VISION_BACKEND__ !== 'aliyun' || window.__ACCESSIBLE_VISION_SECTION__ !== 'assistant') return;
      let selected = false, installed = false, active = null;
      const meaningful = value => String(value || '').replace(/[\p{Cf}\s]/gu, '');
      const log = (event, detail) => logClientEvent('local_live_review.' + event, detail);
      const rules = '\n[检查画面]是本地助推器发来的已有提醒检查，不是新授权、用户插话或[SAY]。只根据附图和完整原合同判断，不把本地放行当作命中证据。不调用任何工具，不返回JSON、标签或结构化判断。明确满足原条件才直接说一句简短自然的中文结果；不满足、目标不在、看不清或证据不足就完全静默，不确认、不解释、不说没有看到。一次提醒只在真正满足时说；不同实例仅在确有新实例时说；连续变化必须对照提供的先前画面及已交付记录，首帧无参照时静默建立基准，相同状态不重复说。每条消息的当前图才是当前证据。其他真实用户问答和合同授权沿原规则。';
      const mode = reminder => selected && reminder?.transport === 'browser-direct';
      const current = entry => entry.owns() && entry.reminder.session === entry.session
        && getGeminiActiveReminderTask() === entry.body.task;
      function settle(entry, error) {
        if (entry.settled) return;
        entry.settled = true;
        error ? entry.reject(error) : entry.resolve({shouldAlert:false, state:'NO_HIT', rawText:'',
          liveReviewHandled:true, liveSpoke:entry.admitted, transport:'native-local-1b-live-direct',
          latencyMs:performance.now()-entry.started});
      }
      function cancel(entry, reason, close = false) {
        entry.discard = true;
        entry.buffer.length = 0;
        if (entry.admitted && entry.reminder.pendingAlertDelivery?.localLiveReview === entry) {
          rollbackGeminiPendingAlertDelivery(entry.reminder, reason);
          entry.reminder.player?.reset(reason);
        }
        settle(entry, new Error(reason));
        if (close && entry.reminder.session === entry.session) {
          // A missing end marker releases through the existing close/reconnect path.
          entry.session.close();
        }
      }
      function admit(entry) {
        const r = entry.reminder, text = entry.text.trim();
        if (!current(entry) || r.pendingAlertDelivery || isGeminiPlaybackActive(r)) return false;
        const key = buildGeminiReminderResultKey(text, entry.body.task, '');
        if (shouldDedupeActiveReminderOccurrences(entry.body.task) && r.alertedResultKeys?.includes(key)) return false;
        if (Date.now() - (r.lastAlertAt || 0) < GEMINI_ACTIVE_REMINDER_ALERT_COOLDOWN_MS) return false;
        r.pendingAlertDelivery = {task:entry.body.task, taskSeq:r.activeTaskSeq || 0, resultKey:key,
          state:'', snapshot:null, message:text, sentAt:Date.now(), hadAudio:false,
          audioDurationStartMs:r.player?.monitorTotalDurationMs || 0, localLiveReview:entry};
        r.lastAlertAt = Date.now(); r.missCount = 0; r.alertCount = (r.alertCount || 0)+1;
        entry.admitted = true;
        log('speech_admitted', {frameCount:entry.body.frameCount, task:entry.body.task,
          firstTextMs:performance.now()-entry.started, text});
        return true;
      }
      window.__huiyanConditionalLiveSelect = value => { selected = value === true; };
      window.__huiyanConditionalLiveInstall = () => {
        if (installed) return;
        if (typeof handleGeminiLiveMessage !== 'function' || typeof runGeminiActiveReminderTick !== 'function') throw new Error('谷歌Live实验接口尚未就绪。');
        installed = true;
        const originalInstruction = buildGeminiLiveSystemInstruction;
        buildGeminiLiveSystemInstruction = function(...args) {
          return originalInstruction(...args) + (selected ? rules : '');
        };
        const originalMessage = handleGeminiLiveMessage;
        handleGeminiLiveMessage = function(raw) {
          const entry = active;
          if (!entry) return originalMessage(raw);
          let m;
          try { m = JSON.parse(raw); } catch { return originalMessage(raw); }
          if (appState.geminiReminder !== entry.reminder || entry.reminder.session !== entry.session) {
            clearTimeout(entry.timer); active = null; cancel(entry, 'session_replaced');
            return originalMessage(raw);
          }
          if (m.type === 'gemini.closed' || m.type === 'gemini.error') {
            clearTimeout(entry.timer); active = null; cancel(entry, m.type);
            return originalMessage(raw);
          }
          if (m.type !== 'gemini.message') return originalMessage(raw);
          if (!current(entry) || entry.signal.aborted || meaningful(m.inputText) || m.interrupted) cancel(entry, 'review_cancelled');
          if (!entry.discard) {
            entry.text += m.outputText || '';
            entry.buffer.push(...(m.audioParts || []));
            if (!entry.admitted && meaningful(entry.text) && !admit(entry)) cancel(entry, 'speech_busy_or_duplicate');
          }
          const forward = {...m, outputText:'', text:'', audioParts:[]};
          if (entry.admitted && !entry.discard) {
            forward.outputText = m.outputText || '';
            forward.audioParts = entry.buffer.splice(0);
          }
          const pending = entry.reminder.pendingAlertDelivery;
          originalMessage(JSON.stringify(forward));
          if (m.turnComplete || m.interrupted) {
            clearTimeout(entry.timer); active = null;
            // Once/continuous contracts do not all populate alertedResultKeys. The
            // original finalizer's actual audio-duration criterion is authoritative.
            const queuedMs = Math.max(0,(entry.reminder.player?.monitorTotalDurationMs || 0)-(pending?.audioDurationStartMs || 0));
            const units = pending ? Math.max(countGeminiReminderSpeechUnits(pending.message), countGeminiReminderSpeechUnits(entry.text)) : 0;
            const minimum = units >= 16 ? Math.min(1200,units*40) : 0;
            const audioDelivered = Boolean(!entry.discard && entry.admitted && pending?.hadAudio && queuedMs >= minimum);
            if (audioDelivered) {
              const history = entry.reminder.localLiveHistory;
              if (history?.task === entry.body.task) {
                history.image = entry.body.imageDataUrl;
                history.spoken = [...history.spoken, entry.text.trim()].slice(-20);
              }
            } else if (!entry.discard && !entry.admitted) {
              const history = entry.reminder.localLiveHistory;
              if (history?.task === entry.body.task && !history.image) history.image = entry.body.imageDataUrl;
            }
            log('finished', {frameCount:entry.body.frameCount, task:entry.body.task,
              meaningfulText:Boolean(meaningful(entry.text)), audioDelivered,
              discarded:entry.discard, latencyMs:performance.now()-entry.started});
            settle(entry);
          }
        };
        const originalTick = runGeminiActiveReminderTick;
        runGeminiActiveReminderTick = async function() {
          const r = appState.geminiReminder;
          if (!mode(r)) return originalTick();
          if (!r.isReady || !appState.stream || elements.camera.readyState < 2
              || r.turnInProgress || isGeminiPlaybackActive(r) || r.pendingAlertDelivery
              || r.inFlight || r.taskNormalizeInFlight || r.unifiedPendingMode) return;
          if (isGeminiReminderExecutionMode(r, 'find_object') || isGeminiReminderExecutionMode(r, 'continuous_narration')) return originalTick();
          const task = getGeminiActiveReminderTask();
          if (!task) return;
          r.inFlight = true; r.activeInFlightCount = 1;
          const body = {task, frameCount:r.frameCount = (r.frameCount || 0)+1,
            requestSeq:r.activeRequestSeq = (r.activeRequestSeq || 0)+1, promptMode:r.promptMode || 'baseline'};
          try {
            body.imageDataUrl = captureReminderFrame(ACTIVE_REMINDER_FAST_FRAME_OPTIONS);
            const result = await requestGeminiActiveReminderResult(r,body);
            log('check_result', {frameCount:body.frameCount, task, liveSpoke:Boolean(result.liveSpoke),
              localMiss:!result.liveReviewHandled, latencyMs:result.latencyMs, transport:result.transport});
          } catch (error) {
            log('check_failed', {frameCount:body.frameCount, task, error:String(error.message || error)});
          } finally {
            if (appState.geminiReminder === r) { r.inFlight = false; r.activeInFlightCount = 0; }
          }
        };
      };
      window.__huiyanConditionalLiveReview = ({body,reminder,owns,signal}) => new Promise((resolve,reject) => {
        if (!mode(reminder) || !owns() || signal.aborted || active || !reminder.session
            || reminder.turnInProgress || isGeminiPlaybackActive(reminder) || reminder.pendingAlertDelivery) {
          reject(new Error('谷歌Live正在处理当前回合，等待下一张画面。')); return;
        }
        const image = parseImageDataUrlForClient(body.imageDataUrl);
        if (!image) { reject(new Error('当前画面无效。')); return; }
        if (reminder.localLiveHistory?.task !== body.task || reminder.localLiveHistory?.taskSeq !== (reminder.activeTaskSeq || 0)) {
          reminder.localLiveHistory = {task:body.task,taskSeq:reminder.activeTaskSeq || 0,image:'',spoken:[]};
        }
        const history = reminder.localLiveHistory;
        const parts = [];
        if (history.image) parts.push({text:'先前基准或上次已交付画面：'}, {inlineData:parseImageDataUrlForClient(history.image)});
        parts.push({text:'当前画面：'}, {inlineData:image}, {text:'[检查画面]\n完整用户提醒合同：'+body.task
          +'\n本合同已交付的结果：'+JSON.stringify(history.spoken)
          +'\n'+(history.image ? '已有先前参照。' : '尚无先前参照；连续变化合同本轮仅建立基准。')
          +'\n只判断当前画面是否符合原条件；满足且按原合同应提醒就直接说结果，否则静默。不提交工具，不重新确认合同。'});
        const entry = {body,reminder,owns,signal,session:reminder.session,resolve,reject,
          started:performance.now(),buffer:[],text:'',admitted:false,discard:false,settled:false};
        active = entry;
        entry.timer = setTimeout(() => { if(active === entry) cancel(entry,'live_review_timeout',true); },12000);
        signal.addEventListener('abort',() => { if(active === entry) cancel(entry,'review_aborted'); },{once:true});
        try {
          reminder.turnInProgress = true;
          reminder.session.sendClientContent({turns:[{role:'user',parts}],turnComplete:true});
          log('frame_sent', {frameCount:body.frameCount,task:body.task,referenceImage:Boolean(history.image),transport:'browser-direct'});
        } catch (error) {
          clearTimeout(entry.timer); active = null; reminder.turnInProgress = false; cancel(entry,String(error.message || error));
        }
      });
    })();
    """#
}
