import ARKit
import AVFoundation
import CoreImage
import Foundation
import ImageIO
import UIKit

final class NativeCameraService: NSObject, ObservableObject, ARSessionDelegate {
    let session = ARSession()

    @Published private(set) var isRunning = false
    @Published private(set) var torchEnabled = false
    @Published private(set) var lidarAvailable = false
    @Published private(set) var centerDistanceMeters: Float?
    @Published private(set) var statusText = "尚未启动摄像头。"

    private let frameQueue = DispatchQueue(label: "com.zzypiano.accessiblevision.frames")
    private let frameLock = NSLock()
    private var latestFrame: ARFrame?
    private var viewportSize: CGSize = .zero
    private let ciContext = CIContext(options: [.cacheIntermediates: false])

    override init() {
        super.init()
        session.delegateQueue = frameQueue
        session.delegate = self
    }

    func start() {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            startAuthorizedSession()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                DispatchQueue.main.async {
                    if granted {
                        self?.startAuthorizedSession()
                    } else {
                        self?.statusText = "没有取得摄像头权限。"
                    }
                }
            }
        default:
            statusText = "摄像头权限已关闭，请到系统设置中允许实时慧眼使用摄像头。"
        }
    }

    func stop() {
        setTorch(enabled: false)
        session.pause()
        frameLock.lock()
        latestFrame = nil
        frameLock.unlock()
        isRunning = false
        centerDistanceMeters = nil
        statusText = "摄像头已停止。"
    }

    func updateViewportSize(_ size: CGSize) {
        guard size.width > 0, size.height > 0 else { return }
        frameLock.lock()
        viewportSize = size
        frameLock.unlock()
    }

    func toggleTorch() {
        setTorch(enabled: !torchEnabled)
    }

    func jpegData(maxDimension: CGFloat = 512, quality: CGFloat = 0.55) -> Data? {
        frameLock.lock()
        let frame = latestFrame
        frameLock.unlock()
        guard let frame else { return nil }

        let source = CIImage(cvPixelBuffer: frame.capturedImage)
            .oriented(.right)
        let extent = source.extent
        let scale = min(1, maxDimension / max(extent.width, extent.height))
        let resized = source.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        guard let cgImage = ciContext.createCGImage(resized, from: resized.extent) else {
            return nil
        }
        return UIImage(cgImage: cgImage).jpegData(compressionQuality: quality)
    }

    func depthMeters(atPortraitNormalized point: CGPoint) -> Float? {
        frameLock.lock()
        let frame = latestFrame
        let viewSize = viewportSize
        frameLock.unlock()
        guard
            let frame,
            viewSize.width > 0,
            viewSize.height > 0,
            let depth = frame.smoothedSceneDepth ?? frame.sceneDepth
        else {
            return nil
        }

        let viewPoint = CGPoint(
            x: min(max(point.x, 0), 1),
            y: min(max(point.y, 0), 1)
        )
        let imageTransform = frame.displayTransform(
            for: .portrait,
            viewportSize: viewSize
        ).inverted()
        let imagePoint = viewPoint.applying(imageTransform)
        return Self.medianDepth(
            depthMap: depth.depthMap,
            confidenceMap: depth.confidenceMap,
            normalizedImagePoint: imagePoint
        )
    }

    func session(_ session: ARSession, didUpdate frame: ARFrame) {
        frameLock.lock()
        latestFrame = frame
        frameLock.unlock()

        let hasDepth = frame.smoothedSceneDepth != nil || frame.sceneDepth != nil
        let centerDepth = depthMeters(atPortraitNormalized: CGPoint(x: 0.5, y: 0.5))
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.lidarAvailable = hasDepth
            self.centerDistanceMeters = centerDepth
            if self.isRunning {
                self.statusText = hasDepth
                    ? "后置摄像头和 LiDAR 正在运行。"
                    : "后置摄像头正在运行；当前设备没有提供 LiDAR 深度。"
            }
        }
    }

    private func startAuthorizedSession() {
        guard ARWorldTrackingConfiguration.isSupported else {
            statusText = "这台设备不支持原生空间相机。"
            return
        }
        let configuration = ARWorldTrackingConfiguration()
        configuration.worldAlignment = .gravity
        if ARWorldTrackingConfiguration.supportsFrameSemantics(.smoothedSceneDepth) {
            configuration.frameSemantics.insert(.smoothedSceneDepth)
        } else if ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) {
            configuration.frameSemantics.insert(.sceneDepth)
        }
        session.run(configuration, options: [.resetTracking, .removeExistingAnchors])
        lidarAvailable = configuration.frameSemantics.contains(.smoothedSceneDepth)
            || configuration.frameSemantics.contains(.sceneDepth)
        isRunning = true
        statusText = lidarAvailable
            ? "后置摄像头和 LiDAR 正在启动。"
            : "后置摄像头正在启动；这台设备不支持 LiDAR。"
    }

    private func setTorch(enabled: Bool) {
        guard let device = AVCaptureDevice.default(
            .builtInWideAngleCamera,
            for: .video,
            position: .back
        ), device.hasTorch else {
            torchEnabled = false
            statusText = "这台设备没有可用的后置闪光灯。"
            return
        }
        do {
            try device.lockForConfiguration()
            defer { device.unlockForConfiguration() }
            if enabled, device.isTorchModeSupported(.on) {
                try device.setTorchModeOn(level: 1)
            } else {
                device.torchMode = .off
            }
            torchEnabled = enabled && device.torchMode == .on
        } catch {
            torchEnabled = false
            statusText = "闪光灯切换失败：\(error.localizedDescription)"
        }
    }

    private static func medianDepth(
        depthMap: CVPixelBuffer,
        confidenceMap: CVPixelBuffer?,
        normalizedImagePoint: CGPoint
    ) -> Float? {
        CVPixelBufferLockBaseAddress(depthMap, .readOnly)
        if let confidenceMap {
            CVPixelBufferLockBaseAddress(confidenceMap, .readOnly)
        }
        defer {
            CVPixelBufferUnlockBaseAddress(depthMap, .readOnly)
            if let confidenceMap {
                CVPixelBufferUnlockBaseAddress(confidenceMap, .readOnly)
            }
        }

        guard let depthBase = CVPixelBufferGetBaseAddress(depthMap) else { return nil }
        let width = CVPixelBufferGetWidth(depthMap)
        let height = CVPixelBufferGetHeight(depthMap)
        let depthStride = CVPixelBufferGetBytesPerRow(depthMap) / MemoryLayout<Float32>.stride
        let depthValues = depthBase.assumingMemoryBound(to: Float32.self)
        let confidenceBase = confidenceMap.flatMap(CVPixelBufferGetBaseAddress)
        let confidenceStride = confidenceMap.map(CVPixelBufferGetBytesPerRow) ?? 0

        let centerX = Int((min(max(normalizedImagePoint.x, 0), 1) * CGFloat(width - 1)).rounded())
        let centerY = Int((min(max(normalizedImagePoint.y, 0), 1) * CGFloat(height - 1)).rounded())
        var samples: [Float] = []
        for y in max(0, centerY - 2)...min(height - 1, centerY + 2) {
            for x in max(0, centerX - 2)...min(width - 1, centerX + 2) {
                if let confidenceBase {
                    let confidence = confidenceBase
                        .advanced(by: y * confidenceStride + x)
                        .assumingMemoryBound(to: UInt8.self)
                        .pointee
                    if confidence < UInt8(ARConfidenceLevel.medium.rawValue) { continue }
                }
                let value = depthValues[y * depthStride + x]
                if value.isFinite, value > 0.05, value < 20 {
                    samples.append(value)
                }
            }
        }
        guard !samples.isEmpty else { return nil }
        samples.sort()
        return samples[samples.count / 2]
    }
}
