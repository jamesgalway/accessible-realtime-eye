import SwiftUI
import WebKit

/// Native controls mirror and activate the existing provider page buttons.
/// They do not select models, create sessions, or implement task behavior.
final class NativeAssistantEntryController: ObservableObject {
    enum Entry: String { case unified, directScreen, googleVoice, aliVideo, stop }
    @Published private(set) var unifiedAvailable = false
    @Published private(set) var directScreenAvailable = false
    @Published private(set) var googleVoiceAvailable = false
    @Published private(set) var aliVideoAvailable = false
    @Published private(set) var stopAvailable = false
    @Published private(set) var status = ""
    private weak var webView: WKWebView?
    private var identity = UUID()
    private var pendingEntry: (Entry, String)?

    func startWhenReady(_ entry: Entry, backend: AssistantBackend) {
        pendingEntry = (entry, backend.baseURL.host ?? "")
    }

    func cancelPending() { pendingEntry = nil }

    func attach(_ view: WKWebView) {
        guard webView !== view else { return }
        webView = view
        identity = UUID()
        clearAvailability()
    }

    func detach(_ view: WKWebView) {
        guard webView === view else { return }
        webView = nil
        identity = UUID()
        clearAvailability()
    }

    private func clearAvailability() {
        let ticket = identity
        DispatchQueue.main.async { [weak self] in
            guard let self, self.identity == ticket else { return }
            self.unifiedAvailable = false
            self.directScreenAvailable = false
            self.googleVoiceAvailable = false
            self.aliVideoAvailable = false
            self.stopAvailable = false
            self.status = ""
        }
    }

    func receive(_ message: WKScriptMessage, in view: WKWebView) {
        guard webView === view, message.frameInfo.isMainFrame,
              message.frameInfo.securityOrigin.protocol == "https",
              message.frameInfo.securityOrigin.host == view.url?.host,
              let body = message.body as? [String: Bool] else { return }
        unifiedAvailable = body["unified"] == true
        directScreenAvailable = body["directScreen"] == true
        googleVoiceAvailable = body["googleVoice"] == true
        aliVideoAvailable = body["aliVideo"] == true
        stopAvailable = body["stop"] == true
        if let pending = pendingEntry, view.url?.host == pending.1,
           available(pending.0) {
            pendingEntry = nil
            activate(pending.0, in: view)
        }
    }

    private func available(_ entry: Entry) -> Bool {
        switch entry {
        case .unified: return unifiedAvailable
        case .directScreen: return directScreenAvailable
        case .googleVoice: return googleVoiceAvailable
        case .aliVideo: return aliVideoAvailable
        case .stop: return stopAvailable
        }
    }

    func start(_ entry: Entry, backend: AssistantBackend) {
        guard let view = webView, view.url?.host == backend.baseURL.host else {
            startWhenReady(entry, backend: backend)
            return
        }
        activate(entry, in: view)
    }

    private func activate(_ entry: Entry, in view: WKWebView) {
        let ticket = identity
        view.callAsyncJavaScript(
            "return window.__accessibleVisionActivateNativeEntry?.(entry) === true;",
            arguments: ["entry": entry.rawValue], in: nil, in: .page
        ) { [weak self, weak view] result in
            guard let self, let view, self.identity == ticket, self.webView === view else { return }
            switch result {
            case .success(let value) where value as? Bool == true: self.status = ""
            default: self.status = "这个入口尚未准备好，请稍后重试。"
            }
        }
    }

    static let script = #"""
    (() => {
      const handler = window.webkit?.messageHandlers?.nativeAssistantEntries;
      if (!handler || window.__accessibleVisionActivateNativeEntry) return;
      const aliyun = window.__ACCESSIBLE_VISION_BACKEND__ === 'aliyun';
      const ids = {
        unified: aliyun ? 'start-aliyun-unified-visual-assistant' : 'start-unified-visual-assistant',
        directScreen: aliyun ? null : 'start-browser-direct-unified-assistant',
        googleVoice: aliyun ? 'start-unified-visual-assistant' : null,
        aliVideo: aliyun ? 'start-aliyun-cheap-unified-visual-assistant' : null,
        stop: 'stop-realtime'
      };
      let lastState = '';
      function publish() {
        const state = {};
        for (const [name, id] of Object.entries(ids)) {
          const button = id ? document.getElementById(id) : null;
          state[name] = !!button && !button.hidden && !button.disabled;
        }
        const encoded = JSON.stringify(state);
        if (encoded !== lastState) { lastState = encoded; handler.postMessage(state); }
      }
      window.__accessibleVisionActivateNativeEntry = entry => {
        const button = ids[entry] ? document.getElementById(ids[entry]) : null;
        if (!button || button.hidden || button.disabled) return false;
        button.click();
        return true;
      };
      // Move the assistant controls to the native toolbar. Their original DOM
      // nodes, listeners, disabled/hidden state, and task implementations remain.
      const style = document.createElement('style');
      style.textContent = Object.values(ids).filter(Boolean).map(id => '#' + id).join(',') + '{display:none!important}'
        + (aliyun ? '#start-browser-direct-unified-assistant{display:none!important}' : '')
        + 'body>.hero{padding:0!important;background:none!important;border:0!important;box-shadow:none!important}'
        + 'body>.hero>h1,body>.hero>p,body>.footer,.camera-panel>h2,.camera-panel>.hint,#teaching-entry{display:none!important}'
        + 'html[data-native-section="assistant"] [data-native-navigation-panel]{display:none!important}'
        + 'html[data-native-section="navigation"] .camera-panel{display:none!important}';
      document.head.appendChild(style);
      document.documentElement.dataset.nativeSection = window.__ACCESSIBLE_VISION_SECTION__ === 'navigation' ? 'navigation' : 'assistant';
      for (const id of ['route-title','manual-route-title','route-output-title']) {
        const panel = document.getElementById(id)?.closest('section');
        if (panel) panel.dataset.nativeNavigationPanel = '';
      }
      const diagnostics = document.getElementById('copy-realtime-log')?.closest('details');
      if (diagnostics) {
        const summary = diagnostics.querySelector('summary');
        if (summary) summary.textContent = '诊断工具';
        diagnostics.open = false;
        const echoControl = document.getElementById('strong-echo-guard')?.closest('label');
        const camera = document.getElementById('camera');
        // Reparent the original controls before any session starts. Keep their
        // IDs, listeners, checkbox values and media references; never clone.
        if (echoControl) diagnostics.appendChild(echoControl);
        if (camera) diagnostics.appendChild(camera);
      }
      new MutationObserver(publish).observe(document.documentElement, {
        subtree: true, attributes: true, attributeFilter: ['hidden', 'disabled']
      });
      Promise.resolve(window.ZzyaiClientAccess?.ready).then(publish);
      publish();
    })();
    """#

    // Presentation only: preserve course, progress, error and interaction text.
    // Static expert descriptions are also detached from their button hints.
    static let presentationScript = #"""
    (() => {
      if (!window.webkit?.messageHandlers?.nativeVision) return;
      const style = document.createElement('style');
      style.textContent = '#main-content>header>p:not([id]),#expert-buttons>p,#teaching-preparation-choice>p,#teaching-instructions,#teaching-live-transport-help{display:none!important}';
      document.head.appendChild(style);
      for (const button of document.querySelectorAll('#expert-buttons [data-expert-profile-id]')) {
        button.removeAttribute('aria-describedby');
      }
      document.getElementById('teaching-live-transport')?.removeAttribute('aria-describedby');
    })();
    """#
}
