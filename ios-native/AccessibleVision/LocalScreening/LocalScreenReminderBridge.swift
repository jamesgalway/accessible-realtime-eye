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
        subscription = LocalScreenLab.shared.$localReminders.sink { [weak self] enabled in
            self?.publish(enabled)
        }
    }

    private func publish(_ enabled: Bool) {
        webView?.evaluateJavaScript("window.__huiyanSetLocalScreenEnabled?.(\(enabled ? "true" : "false"));")
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
        if type == "state" { publish(LocalScreenLab.shared.localReminders); return }
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
      window.__huiyanSetLocalScreenEnabled = value => { enabled = value === true; };
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
      window.fetch = async (input, init = {}) => {
        const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
        if (!enabled || url.origin !== location.origin || url.pathname !== '/api/active-reminder-check'
            || String(init.method || 'GET').toUpperCase() !== 'POST' || typeof init.body !== 'string') return originalFetch(input, init);
        if (typeof appState === 'undefined' || appState.geminiReminder?.transport !== 'aliyun-realtime') return originalFetch(input, init);
        const body = JSON.parse(init.body);
        const reminder = appState.geminiReminder;
        const taskSeq = reminder.activeTaskSeq || 0;
        const start = performance.now();
        const id = 'local-' + Date.now() + '-' + Math.random().toString(16).slice(2);
        const controller = new AbortController();
        const abort = () => { controller.abort(); post({type:'cancel',id}); };
        const externalSignal = init.signal;
        const owns = () => enabled && appState.geminiReminder === reminder && (reminder.activeTaskSeq || 0) === taskSeq
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
        try {
          // Mechanical projection of the existing accepted contract, never a new
          // contract or a keyword-based decision about the user's intent.
          const fields = String(body.task || '').match(/category=(target_presence|state_tracking)[；;]mode=(appear|result_reached|state_changed)[；;]lifecycle=([^；;]+)[；;]target=([^；;]+)[；;]condition=([^；;]+)[；;]/);
          const prompt = fields
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
          const descriptionStart = performance.now();
          // Only a positive screen invokes Ali. The original server compiler,
          // state/instance parser and application delivery lifecycle stay intact.
          const result = decision === 'Y'
            ? await jsonPost('/api/active-reminder-local-describe', {...body,localDecision:'Y',localScreenLatencyMs:nativeResult.modelLatencyMs})
            : await jsonPost('/api/active-reminder-direct-finalize', {...body,modelText:'N',
              modelLatencyMs:nativeResult.modelLatencyMs,modelProvider:'local-minicpm35b'});
          if (controller.signal.aborted || !owns()) throw new Error('本地筛图结果已过期');
          log('local_screening.result',{frameCount:body.frameCount,task:body.task,latencyMs:performance.now()-start,
            budgetMs:20000,promptChars:prompt.length,systemPrefixReused:true,localDecision:decision,
            localScreenLatencyMs:nativeResult.modelLatencyMs,descriptionLatencyMs:decision === 'Y' ? performance.now()-descriptionStart : 0,
            model:'MiniCPM-V-4.7-35B-A3B',shouldAlert:result.shouldAlert,state:result.state,transport:result.transport});
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
