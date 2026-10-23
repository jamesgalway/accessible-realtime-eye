import Combine
import WebKit
import UIKit

@MainActor
final class LocalScreenReminderBridge {
    private let origin: URL
    private weak var webView: WKWebView?
    private var subscription: AnyCancellable?
    private var generation = UUID()
    private var requests = Set<String>()

    init(origin: URL) { self.origin = origin }

    func attach(_ view: WKWebView) {
        guard webView !== view else { return }
        webView = view
        subscription = Publishers.CombineLatest(LocalScreenLab.shared.$localReminders, LocalScreenLab.shared.$reminderVoice).sink { [weak self] enabled, voice in
            self?.publish(enabled, voice:voice)
        }
    }

    private func publish(_ enabled: Bool, voice: LocalReminderVoice) {
        webView?.evaluateJavaScript("window.__huiyanSetLocalScreenEnabled?.(\(enabled ? "true" : "false"), '\(voice.rawValue)');")
    }

    func cancel() {
        generation = UUID(); requests.removeAll()
        LocalScreenLab.shared.cancelReminder()
    }

    func detach() {
        cancel(); subscription = nil; webView = nil
    }

    func receive(_ message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame,
              origin.host == AssistantBackend.aliyun.baseURL.host,
              message.frameInfo.securityOrigin.protocol == "https",
              message.frameInfo.securityOrigin.host == origin.host,
              let view = webView, view.url?.host == origin.host,
              ["/", "/index.html"].contains(view.url?.path ?? ""),
              let body = message.body as? [String:Any] else { return }
        let type = body["type"] as? String ?? ""
        if type == "state" { publish(LocalScreenLab.shared.localReminders, voice:LocalScreenLab.shared.reminderVoice); return }
        if type == "cancel" {
            if let id = body["id"] as? String, requests.remove(id) != nil { LocalScreenLab.shared.cancelReminder() }
            return
        }
        guard type == "screen", let id = body["id"] as? String, id.count <= 80,
              let image = body["imageDataUrl"] as? String, image.hasPrefix("data:image/jpeg;base64,"), image.count <= 2_000_000,
              let prompt = body["prompt"] as? String, !prompt.isEmpty, prompt.count <= 20_000,
              let task = body["task"] as? String, task.count <= 1200,
              let jpeg = Data(base64Encoded:String(image.dropFirst("data:image/jpeg;base64,".count))) else { return }
        let elapsed = min(60_000, max(0, (body["elapsedMs"] as? NSNumber)?.doubleValue ?? 0))
        let capturedAt = ProcessInfo.processInfo.systemUptime - elapsed / 1000
        let ticket = generation
        requests.insert(id)
        Task {
            var response: [String:Any] = ["id":id]
            do {
                let result = try await LocalScreenLab.shared.reminder(jpeg:jpeg,prompt:prompt,task:task,capturedAt:capturedAt,requestID:id)
                response["modelText"] = result.rawText
                response["modelLatencyMs"] = result.totalMs
                response["withinBudget"] = result.withinBudget
                response["model"] = result.modelName
            } catch { response["error"] = error.localizedDescription }
            guard generation == ticket, requests.remove(id) != nil, self.webView === view,
                  UIApplication.shared.applicationState == .active else { return }
            view.callAsyncJavaScript("window.__huiyanLocalScreenReply?.(reply);", arguments:["reply":response],in:nil,in:.page,completionHandler:nil)
        }
    }

    static let script = #"""
    (() => {
      if (window.__ACCESSIBLE_VISION_BACKEND__ !== 'aliyun' || window.__ACCESSIBLE_VISION_SECTION__ !== 'assistant'
          || !['/', '/index.html'].includes(location.pathname) || window.__huiyanLocalScreenInstalled) return;
      window.__huiyanLocalScreenInstalled = true;
      const bridge = window.webkit?.messageHandlers?.nativeLocalScreen;
      if (!bridge || typeof fetch !== 'function') return;
      const originalFetch = window.fetch.bind(window);
      const pending = new Map();
      let enabled = false;
      let selectedVoice = 'aliyun';
      window.__huiyanSetLocalScreenEnabled = (value, voice = 'aliyun') => {
        enabled = value === true;
        selectedVoice = voice === 'google' ? 'google' : 'aliyun';
        window.__huiyanConditionalLiveSelect?.(enabled && selectedVoice === 'google');
      };
      window.__huiyanLocalScreenReply = reply => {
        const entry = pending.get(reply.id);
        if (!entry) return;
        pending.delete(reply.id);
        if (reply.error) entry.reject(new Error(reply.error)); else entry.resolve(reply);
      };
      const post = message => bridge.postMessage(message);
      const log = (event, detail) => {
        if (typeof logClientEvent === 'function') logClientEvent(event, detail);
      };
      // A contract decision may speak before submitting its tool. Hold only this
      // local Ali decision turn until the existing tool/recovery path settles.
      // Ordinary answers are released unchanged; accepted contracts use the one
      // existing confirmation. No extra classification or model request.
      let aliDecisionGateInstalled = false;
      function installAliDecisionGate() {
        if (aliDecisionGateInstalled || typeof handleRealtimeServerEvent !== 'function'
            || typeof startSpeedReminderTaskNormalizeFromConfirmation !== 'function') return;
        aliDecisionGateInstalled = true;
        const originalEvent = handleRealtimeServerEvent;
        const originalNormalize = startSpeedReminderTaskNormalizeFromConfirmation;
        let staged = null, recovering = null;
        const valid = q => q && enabled && selectedVoice === 'aliyun'
          && appState.realtime === q.realtime && appState.activeReminder === q.reminder
          && q.realtime.aliCheapContractCandidateSeq === q.seq
          && q.reminder.activeTaskSeq === q.taskSeq;
        const release = async q => {
          if (!valid(q)) return;
          log('local_screening.ali_decision_released',{candidateSeq:q.seq,events:q.messages.length});
          for (const message of q.messages) {
            if (!valid(q)) break;
            await originalEvent(message);
          }
        };
        startSpeedReminderTaskNormalizeFromConfirmation = async function(input, output, options = {}) {
          const q = options.confirmOnAccepted ? recovering : null;
          if (q) recovering = null;
          const accepted = await originalNormalize(input, output, options);
          if (q && !accepted) await release(q);
          if (q && accepted) log('local_screening.ali_decision_discarded',{candidateSeq:q.seq,reason:'recovered_contract'});
          return accepted;
        };
        handleRealtimeServerEvent = async function(message) {
          if (staged && !valid(staged)) staged = null;
          if (recovering && !valid(recovering)) recovering = null;
          if (['proxy.error','proxy.closed'].includes(message.type)) { staged = null; recovering = null; }
          const r = appState.activeReminder, rt = appState.realtime;
          if (rt?.suppressAssistantOutputUntilManualCommit) { staged = null; recovering = null; }
          const decision = enabled && selectedVoice === 'aliyun'
            && !rt?.suppressAssistantOutputUntilManualCommit
            && isAliCheapDirectFunctionContractExperiment()
            && ((r?.pendingTaskSetupTranscript && !rt?.aliCheapContractConfirmationInFlight)
              || rt?.pendingAliCheapToolResult);
          const output = ['response.audio.delta','response.audio_transcript.delta','response.audio_transcript.done',
            'response.text.delta','response.text.done','response.audio.done'].includes(message.type);
          if (decision && output) {
            staged ||= {realtime:rt,reminder:r,seq:rt.aliCheapContractCandidateSeq,
              taskSeq:r.activeTaskSeq,messages:[]};
            staged.messages.push(message);
            return;
          }
          if (message.type === 'response.function_call_arguments.done') {
            const result = await originalEvent(message);
            if (staged && rt?.pendingAliCheapToolResult) {
              log('local_screening.ali_decision_discarded',{candidateSeq:staged.seq,reason:'contract_tool'});
              staged = null;
            }
            return result;
          }
          if (message.type === 'response.done' && staged) {
            const q = staged; staged = null;
            if (valid(q) && !rt?.pendingAliCheapToolResult
                && hasGeminiActiveReminderIntent(r.pendingTaskSetupTranscript, '')) {
              q.messages.push(message); recovering = q;
            } else if (!rt?.pendingAliCheapToolResult) await release(q);
          }
          return originalEvent(message);
        };
      }
      installAliDecisionGate();
      window.fetch = async (input, init = {}) => {
        installAliDecisionGate();
        const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
        if (enabled && selectedVoice !== 'aliyun' && url.origin === location.origin && url.pathname === '/api/gemini-browser-config') {
          const response = await originalFetch(input, init);
          if (response.ok) {
            const config = await response.clone().json();
            if (config.transport !== 'browser-direct') throw new Error('1B谷歌声音实验需要手机直连，请检查原生权限和直连配置。');
            window.__huiyanConditionalLiveInstall();
            log('local_screening.google_direct_config',{transport:config.transport,model:config.model,voice:config.voice});
          }
          return response;
        }
        if (!enabled || url.origin !== location.origin || url.pathname !== '/api/active-reminder-check'
            || String(init.method || 'GET').toUpperCase() !== 'POST' || typeof init.body !== 'string') return originalFetch(input, init);
        const expectedTransport = selectedVoice !== 'aliyun' ? 'browser-direct' : 'aliyun-realtime';
        if (typeof appState === 'undefined' || appState.geminiReminder?.transport !== expectedTransport) return originalFetch(input, init);
        const body = JSON.parse(init.body);
        const reminder = appState.geminiReminder;
        const taskSeq = reminder.activeTaskSeq || 0;
        const voice = selectedVoice;
        const start = performance.now();
        const id = 'local-' + Date.now() + '-' + Math.random().toString(16).slice(2);
        const controller = new AbortController();
        const abort = () => { controller.abort(); post({type:'cancel',id}); };
        const externalSignal = init.signal;
        const owns = () => enabled && selectedVoice === voice && reminder.transport === expectedTransport
          && appState.geminiReminder === reminder && (reminder.activeTaskSeq || 0) === taskSeq
          && reminder.isReady !== false && !(typeof document !== 'undefined' && document.hidden);
        const timer = setTimeout(abort, 20000);
        const ownerWatch = setInterval(() => {
          if (!owns()) abort();
        },200);
        externalSignal?.addEventListener('abort', abort, {once:true});
        if (externalSignal?.aborted) abort();
        const jsonPost = async (path, payload) => {
          const response = await originalFetch(path, {...init, body:JSON.stringify(payload), signal:controller.signal});
          if (!response.ok) throw new Error((await response.json()).error || '本地筛图资料处理失败');
          return response.json();
        };
        const googleReview = async localMs => {
          if (typeof window.__huiyanConditionalLiveReview === 'function') {
            return window.__huiyanConditionalLiveReview({body,reminder,owns,signal:controller.signal,localMs});
          }
          throw new Error('谷歌Live看图播报实验尚未安装。');
        };
        try {
          // Mechanical projection of the existing accepted contract, never a new
          // contract or a keyword-based decision about the user's intent.
          const fields = String(body.task || '').match(/category=(target_presence|state_tracking)[；;]mode=(appear|result_reached|state_changed)[；;]lifecycle=([^；;]+)[；;]target=([^；;]+)[；;]condition=([^；;]+)[；;]/);
          let prompt = fields
            ? '主体：' + fields[4] + '\n' + (fields[2] === 'state_changed'
              ? '核验可观察性：当前图能可靠观察以下状态维度：' + fields[5]
              : '核验条件：' + fields[5])
            : '核验条件：' + body.task;
          if (controller.signal.aborted) throw new Error('本地筛图超过20秒或已经取消');
          const nativeResult = await new Promise((resolve,reject) => {
            const onAbort = () => { pending.delete(id); reject(new Error('本地筛图超过20秒或已经取消')); };
            controller.signal.addEventListener('abort',onAbort,{once:true});
            pending.set(id,{resolve:value => { controller.signal.removeEventListener('abort',onAbort); resolve(value); },
              reject:error => { controller.signal.removeEventListener('abort',onAbort); reject(error); }});
            post({type:'screen',id,imageDataUrl:body.imageDataUrl,task:body.task,prompt,elapsedMs:performance.now()-start});
          });
          if (!nativeResult.withinBudget || controller.signal.aborted || !owns()) throw new Error('本地筛图超过20秒或已经取消');
          const decision = String(nativeResult.modelText || '').trim();
          if (!['Y','N'].includes(decision)) throw new Error('本地筛图未返回有效的是或否');
          const localModel = nativeResult.model === 'MiniCPM-V-4.7-1B' ? nativeResult.model : 'MiniCPM-V-4.7-35B-A3B';
          const descriptionStart = performance.now();
          // Only a positive screen invokes the selected provider. The original server compiler,
          // state/instance parser and application delivery lifecycle stay intact.
          const result = decision === 'Y'
            ? voice === 'google'
              ? await googleReview(nativeResult.modelLatencyMs)
              : await jsonPost('/api/active-reminder-local-describe', {...body,localDecision:'Y',localScreenLatencyMs:nativeResult.modelLatencyMs,localScreenModel:localModel})
            : await jsonPost('/api/active-reminder-direct-finalize', {...body,modelText:'N',
              modelLatencyMs:nativeResult.modelLatencyMs,modelProvider:localModel === 'MiniCPM-V-4.7-1B' ? 'local-minicpm1b' : 'local-minicpm35b'});
          if ((controller.signal.aborted || !owns()) && !(result.liveReviewHandled && result.liveSpoke)) throw new Error('本地筛图结果已过期');
          log('local_screening.result',{frameCount:body.frameCount,task:body.task,latencyMs:performance.now()-start,
            budgetMs:20000,promptChars:prompt.length,systemPrefixReused:true,localDecision:decision,
            localScreenLatencyMs:nativeResult.modelLatencyMs,descriptionLatencyMs:decision === 'Y' ? performance.now()-descriptionStart : 0,
            model:localModel,voice,liveTransport:reminder.transport,shouldAlert:result.shouldAlert,state:result.state,transport:result.transport});
          return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
        } catch (error) {
          log('local_screening.failed',{frameCount:body.frameCount,task:body.task,error:String(error.message || error),latencyMs:performance.now()-start});
          throw error;
        } finally {
          clearTimeout(timer); clearInterval(ownerWatch); pending.delete(id); externalSignal?.removeEventListener('abort',abort);
        }
      };
      post({type:'state'});
    })();
    """#
}
