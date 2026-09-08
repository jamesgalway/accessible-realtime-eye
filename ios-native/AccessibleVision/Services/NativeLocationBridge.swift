import CoreLocation
import UIKit
import WebKit

// Web navigation still owns route planning. This bridge supplies only device locations.
final class NativeLocationBridge: NSObject, CLLocationManagerDelegate {
    private struct Request {
        let watch: Bool
        let highAccuracy: Bool
    }
    private var manager: CLLocationManager?
    private var requests: [String: Request] = [:]
    private weak var webView: WKWebView?
    private let origin: URL
    private var observers: [NSObjectProtocol] = []

    init(origin: URL) {
        self.origin = origin
        super.init()
        observers.append(NotificationCenter.default.addObserver(
            forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main
        ) { [weak self] _ in self?.manager?.stopUpdatingLocation() })
        observers.append(NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
        ) { [weak self] _ in self?.updateAuthorization() })
    }

    deinit {
        observers.forEach { NotificationCenter.default.removeObserver($0) }
        manager?.stopUpdatingLocation()
    }

    func stop() {
        requests.removeAll()
        manager?.stopUpdatingLocation()
        webView = nil
    }

    func receive(_ message: WKScriptMessage, in webView: WKWebView) {
        guard message.frameInfo.isMainFrame,
              message.frameInfo.securityOrigin.protocol == origin.scheme,
              message.frameInfo.securityOrigin.host == origin.host,
              (message.frameInfo.securityOrigin.port == 0 ? 443 : message.frameInfo.securityOrigin.port) == (origin.port ?? 443),
              let body = message.body as? [String: Any],
              let id = body["id"] as? String,
              let type = body["type"] as? String else { return }
        self.webView = webView
        if type == "clear" {
            requests.removeValue(forKey: id)
            updateAccuracy()
            return
        }
        guard type == "get" || type == "watch" else { return }
        requests[id] = Request(watch: type == "watch", highAccuracy: body["highAccuracy"] as? Bool ?? false)
        if manager == nil {
            let instance = CLLocationManager()
            manager = instance
            instance.delegate = self
            instance.distanceFilter = kCLDistanceFilterNone
        }
        updateAuthorization()
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        updateAuthorization()
    }

    private func updateAuthorization() {
        guard !requests.isEmpty, let manager,
              UIApplication.shared.applicationState == .active else { return }
        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways:
            for id in requests.keys { deliver(["id": id, "ready": true]) }
            updateAccuracy()
            manager.startUpdatingLocation()
        case .denied, .restricted:
            failAll(code: 1, message: "定位权限未允许。请在 iPhone 设置中为实时慧眼允许使用 App 期间定位，并开启精确位置。")
        @unknown default:
            failAll(code: 2, message: "暂时无法取得系统定位状态。")
        }
    }

    private func updateAccuracy() {
        manager?.desiredAccuracy = requests.values.contains(where: { $0.highAccuracy })
            ? kCLLocationAccuracyBest : kCLLocationAccuracyHundredMeters
        if requests.isEmpty { manager?.stopUpdatingLocation() }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last, location.horizontalAccuracy >= 0,
              abs(location.timestamp.timeIntervalSinceNow) < 15,
              UIApplication.shared.applicationState == .active else { return }
        let coords: [String: Any] = [
            "latitude": location.coordinate.latitude,
            "longitude": location.coordinate.longitude,
            "accuracy": location.horizontalAccuracy,
            "altitude": location.verticalAccuracy >= 0 ? location.altitude as Any : NSNull(),
            "altitudeAccuracy": location.verticalAccuracy >= 0 ? location.verticalAccuracy as Any : NSNull(),
            "heading": location.course >= 0 ? location.course as Any : NSNull(),
            "speed": location.speed >= 0 ? location.speed as Any : NSNull()
        ]
        let position: [String: Any] = ["coords": coords, "timestamp": location.timestamp.timeIntervalSince1970 * 1000]
        for (id, request) in Array(requests) {
            deliver(["id": id, "position": position])
            if !request.watch { requests.removeValue(forKey: id) }
        }
        updateAccuracy()
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // A transient missing fix should remain pending until the caller's timeout.
        if let error = error as? CLError, error.code == .locationUnknown { return }
        let denied = (error as? CLError)?.code == .denied
        failAll(code: denied ? 1 : 2, message: denied
            ? "系统定位不可用，请检查 iPhone 的定位服务及实时慧眼定位权限。"
            : "暂时无法取得当前位置，请稍后重试。")
    }

    private func failAll(code: Int, message: String) {
        for id in requests.keys { deliver(["id": id, "error": ["code": code, "message": message]]) }
        requests.removeAll()
        manager?.stopUpdatingLocation()
    }

    private func deliver(_ payload: [String: Any]) {
        guard let webView, let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        webView.evaluateJavaScript("window.__accessibleVisionLocationResult?.(\(json));")
    }

    static let script = #"""
    (() => {
      const handler = window.webkit?.messageHandlers?.nativeLocation;
      if (!handler || window.__accessibleVisionLocationInstalled) return;
      let nextId = 1;
      const pending = new Map();
      const post = body => handler.postMessage(body);
      const error = (code, message) => ({code, message, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3});
      const clear = id => {
        id = String(id);
        const item = pending.get(id);
        if (!item) return;
        clearTimeout(item.timer);
        pending.delete(id);
        post({type: 'clear', id});
      };
      const arm = (id, item) => {
        clearTimeout(item.timer);
        if (!Number.isFinite(item.timeout)) return;
        item.timer = setTimeout(() => {
          if (!pending.has(id)) return;
          if (!item.watch) clear(id);
          item.failure?.(error(3, '定位超时，请确认定位服务开启并到信号较好的位置重试。'));
        }, item.timeout);
      };
      const request = (watch, success, failure, options = {}) => {
        if (typeof success !== 'function') throw new TypeError('A location callback is required');
        const id = String(nextId++);
        const timeout = options.timeout == null ? Infinity : Math.max(0, Number(options.timeout) || 0);
        const item = {watch, success, failure: typeof failure === 'function' ? failure : null, timeout, timer: null, ready: false};
        pending.set(id, item);
        try { post({type: watch ? 'watch' : 'get', id, highAccuracy: !!options.enableHighAccuracy}); }
        catch (_) { pending.delete(id); setTimeout(() => item.failure?.(error(2, '无法连接系统定位服务。')), 0); }
        return Number(id);
      };
      window.__accessibleVisionLocationResult = payload => {
        const id = String(payload.id), item = pending.get(id);
        if (!item) return;
        if (payload.ready) {
          if (!item.ready) { item.ready = true; arm(id, item); }
          return;
        }
        if (payload.error) {
          clear(id);
          item.failure?.(error(payload.error.code, payload.error.message));
          return;
        }
        if (!payload.position) return;
        if (item.watch) arm(id, item); else clear(id);
        item.success(payload.position);
      };
      const geolocation = {
        getCurrentPosition: (success, failure, options) => { request(false, success, failure, options); },
        watchPosition: (success, failure, options) => request(true, success, failure, options),
        clearWatch: clear
      };
      Object.defineProperty(navigator, 'geolocation', {configurable: true, value: geolocation});
      window.addEventListener('pagehide', () => Array.from(pending.keys()).forEach(clear));
      window.__accessibleVisionLocationInstalled = true;
    })();
    """#
}
