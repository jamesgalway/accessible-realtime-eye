import ARKit
import AVFoundation
import CoreImage
import Foundation
import ImageIO
import UIKit

struct NativeVisionFramePacket: Encodable {
    let frameId: Int
    let capturedAtMs: Int64
    let imageDataUrl: String
    let width: Int
    let height: Int
    let lidarAvailable: Bool
    let depthGridWidth: Int
    let depthGridHeight: Int
    let depthGrid: [Float?]
    let cameraIntrinsics: CameraIntrinsics

    struct CameraIntrinsics: Encodable {
        let fx: Float
        let fy: Float
        let cx: Float
        let cy: Float
        let sourceWidth: Float
        let sourceHeight: Float
    }
}

final class NativeCameraService: NSObject, ObservableObject, ARSessionDelegate {
    let session = ARSession()

    @Published private(set) var isRunning = false
    @Published private(set) var torchEnabled = false
    @Published private(set) var lidarAvailable = false
    @Published private(set) var centerDistanceMeters: Float?
    @Published private(set) var statusText = "尚未启动摄像头。"

    var onFramePacket: ((NativeVisionFramePacket) -> Void)?

    private let frameQueue = DispatchQueue(label: "com.zzypiano.accessiblevision.frames")
    private let frameLock = NSLock()
    private var latestFrame: ARFrame?
    private var viewportSize = CGSize(width: 512, height: 910)
    private let ciContext = CIContext(options: [.cacheIntermediates: false])
    private var lastPacketTime: TimeInterval = 0
    private var nextFrameId = 1

    private static let packetInterval: TimeInterval = 1.0 / 3.0
    private static let outputWidth: CGFloat = 512
    private static let outputAspectRatio: CGFloat = 9.0 / 16.0
    private static let depthGridWidth = 24
    private static let depthGridHeight = 42

    override init() {
        super.init()
        session.delegateQueue = frameQueue
        session.delegate = self
    }

    func start() {
        guard !isRunning else { return }
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
        lidarAvailable = false
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

    func jpegData(maxWidth: CGFloat = 512, quality: CGFloat = 0.60) -> Data? {
        frameLock.lock()
        let frame = latestFrame
        frameLock.unlock()
        guard let frame else { return nil }
        return makePortraitJPEG(from: frame, maxWidth: maxWidth, quality: quality)?.data
    }

    func depthMeters(atPortraitNormalized point: CGPoint) -> Float? {
        frameLock.lock()
        let frame = latestFrame
        let viewSize = viewportSize
        frameLock.unlock()
        guard let frame else { return nil }
        return depthMeters(frame: frame, atPortraitNormalized: point, viewportSize: viewSize)
    }

    func session(_ session: ARSession, didUpdate frame: ARFrame) {
        frameLock.lock()
        latestFrame = frame
        frameLock.unlock()

        let hasDepth = frame.smoothedSceneDepth != nil || frame.sceneDepth != nil
        let packetViewport = Self.packetViewportSize
        let centerDepth = depthMeters(
            frame: frame,
            atPortraitNormalized: CGPoint(x: 0.5, y: 0.5),
            viewportSize: packetViewport
        )
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.lidarAvailable = hasDepth
            self.centerDistanceMeters = centerDepth
            if self.isRunning {
                self.statusText = hasDepth
                    ? "后置主摄像头和 LiDAR 正在运行。"
                    : "后置主摄像头正在运行；当前设备没有提供 LiDAR 深度。"
            }
        }

        let now = ProcessInfo.processInfo.systemUptime
        guard now - lastPacketTime >= Self.packetInterval else { return }
        lastPacketTime = now
        guard let packet = makeFramePacket(from: frame, hasDepth: hasDepth) else { return }
        onFramePacket?(packet)
    }

    private func startAuthorizedSession() {
        guard ARWorldTrackingConfiguration.isSupported else {
            statusText = "这台设备不支持原生空间相机。"
            return
        }
        let configuration = ARWorldTrackingConfiguration()
        configuration.worldAlignment = .gravity
        configuration.isAutoFocusEnabled = true
        configuration.environmentTexturing = .none
        configuration.planeDetection = []
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
            ? "后置主摄像头和 LiDAR 正在启动。"
            : "后置主摄像头正在启动；这台设备不支持 LiDAR。"
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

    private func makeFramePacket(from frame: ARFrame, hasDepth: Bool) -> NativeVisionFramePacket? {
        guard let jpeg = makePortraitJPEG(from: frame, maxWidth: Self.outputWidth, quality: 0.60) else {
            return nil
        }
        let frameId = nextFrameId
        nextFrameId += 1
        let depthGrid = makeDepthGrid(
            from: frame,
            columns: Self.depthGridWidth,
            rows: Self.depthGridHeight,
            viewportSize: CGSize(width: jpeg.width, height: jpeg.height)
        )
        let intrinsics = frame.camera.intrinsics
        let resolution = frame.camera.imageResolution
        return NativeVisionFramePacket(
            frameId: frameId,
            capturedAtMs: Int64((Date().timeIntervalSince1970 * 1000).rounded()),
            imageDataUrl: "data:image/jpeg;base64,\(jpeg.data.base64EncodedString())",
            width: jpeg.width,
            height: jpeg.height,
            lidarAvailable: hasDepth && depthGrid.contains(where: { $0 != nil }),
            depthGridWidth: Self.depthGridWidth,
            depthGridHeight: Self.depthGridHeight,
            depthGrid: depthGrid,
            cameraIntrinsics: .init(
                fx: intrinsics.columns.0.x,
                fy: intrinsics.columns.1.y,
                cx: intrinsics.columns.2.x,
                cy: intrinsics.columns.2.y,
                sourceWidth: Float(resolution.width),
                sourceHeight: Float(resolution.height)
            )
        )
    }

    private func makePortraitJPEG(
        from frame: ARFrame,
        maxWidth: CGFloat,
        quality: CGFloat
    ) -> (data: Data, width: Int, height: Int)? {
        let portrait = CIImage(cvPixelBuffer: frame.capturedImage).oriented(.right)
        let targetCropWidth = min(portrait.extent.width, portrait.extent.height * Self.outputAspectRatio)
        let cropRect = CGRect(
            x: portrait.extent.midX - targetCropWidth / 2,
            y: portrait.extent.minY,
            width: targetCropWidth,
            height: portrait.extent.height
        ).integral
        let cropped = portrait.cropped(to: cropRect)
        var safeCropWidth = cropped.extent.width
        if safeCropWidth < CGFloat(1) {
            safeCropWidth = CGFloat(1)
        }
        var scale = maxWidth / safeCropWidth
        if scale > 1 {
            scale = 1
        }
        let resized = cropped
            .transformed(by: CGAffineTransform(translationX: -cropped.extent.minX, y: -cropped.extent.minY))
            .transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        guard let cgImage = ciContext.createCGImage(resized, from: resized.extent) else {
            return nil
        }
        guard let data = UIImage(cgImage: cgImage).jpegData(compressionQuality: quality) else {
            return nil
        }
        return (data, cgImage.width, cgImage.height)
    }

    private func depthMeters(
        frame: ARFrame,
        atPortraitNormalized point: CGPoint,
        viewportSize: CGSize
    ) -> Float? {
        guard
            viewportSize.width > 0,
            viewportSize.height > 0,
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
            viewportSize: viewportSize
        ).inverted()
        let imagePoint = viewPoint.applying(imageTransform)
        return Self.withLockedDepth(depth) { locked in
            Self.medianDepth(locked: locked, normalizedImagePoint: imagePoint)
        }
    }

    private func makeDepthGrid(
        from frame: ARFrame,
        columns: Int,
        rows: Int,
        viewportSize: CGSize
    ) -> [Float?] {
        guard let depth = frame.smoothedSceneDepth ?? frame.sceneDepth else {
            return Array(repeating: nil, count: columns * rows)
        }
        let imageTransform = frame.displayTransform(
            for: .portrait,
            viewportSize: viewportSize
        ).inverted()
        return Self.withLockedDepth(depth) { locked in
            var values: [Float?] = []
            values.reserveCapacity(columns * rows)
            for row in 0..<rows {
                for column in 0..<columns {
                    let viewPoint = CGPoint(
                        x: (CGFloat(column) + 0.5) / CGFloat(columns),
                        y: (CGFloat(row) + 0.5) / CGFloat(rows)
                    )
                    values.append(Self.medianDepth(
                        locked: locked,
                        normalizedImagePoint: viewPoint.applying(imageTransform)
                    ))
                }
            }
            return values
        }
    }

    private struct LockedDepth {
        let width: Int
        let height: Int
        let depthStride: Int
        let depthValues: UnsafeMutablePointer<Float32>
        let confidenceBase: UnsafeMutableRawPointer?
        let confidenceStride: Int
    }

    private static func withLockedDepth<T>(
        _ depth: ARDepthData,
        body: (LockedDepth) -> T
    ) -> T {
        let depthMap = depth.depthMap
        let confidenceMap = depth.confidenceMap
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
        let locked = LockedDepth(
            width: CVPixelBufferGetWidth(depthMap),
            height: CVPixelBufferGetHeight(depthMap),
            depthStride: CVPixelBufferGetBytesPerRow(depthMap) / MemoryLayout<Float32>.stride,
            depthValues: CVPixelBufferGetBaseAddress(depthMap)!.assumingMemoryBound(to: Float32.self),
            confidenceBase: confidenceMap.flatMap(CVPixelBufferGetBaseAddress),
            confidenceStride: confidenceMap.map(CVPixelBufferGetBytesPerRow) ?? 0
        )
        return body(locked)
    }

    private static func medianDepth(
        locked: LockedDepth,
        normalizedImagePoint: CGPoint
    ) -> Float? {
        let centerX = Int((min(max(normalizedImagePoint.x, 0), 1) * CGFloat(locked.width - 1)).rounded())
        let centerY = Int((min(max(normalizedImagePoint.y, 0), 1) * CGFloat(locked.height - 1)).rounded())
        var samples: [Float] = []
        for y in max(0, centerY - 2)...min(locked.height - 1, centerY + 2) {
            for x in max(0, centerX - 2)...min(locked.width - 1, centerX + 2) {
                if let confidenceBase = locked.confidenceBase {
                    let confidence = confidenceBase
                        .advanced(by: y * locked.confidenceStride + x)
                        .assumingMemoryBound(to: UInt8.self)
                        .pointee
                    if confidence < UInt8(ARConfidenceLevel.medium.rawValue) { continue }
                }
                let value = locked.depthValues[y * locked.depthStride + x]
                if value.isFinite, value > 0.05, value < 8 {
                    samples.append(value)
                }
            }
        }
        guard samples.count >= 3 else { return nil }
        samples.sort()
        return samples[samples.count / 2]
    }

    private static var packetViewportSize: CGSize {
        CGSize(width: outputWidth, height: outputWidth / outputAspectRatio)
    }
}
