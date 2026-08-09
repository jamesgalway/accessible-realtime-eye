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
        let safeCropWidth = cropped.extent…5730 tokens truncated…ice.lockForConfiguration()
            defer { device.unlockForConfiguration() }
            if enabled, device.isTorchModeSupported(.on) {
                try device.setTorchModeOn(level: 1)
            } else {
                device.torchMode = .off
            }
            isEnabled = enabled && device.torchMode == .on
            errorMessage = ""
        } catch {
            isEnabled = false
            errorMessage = "闪光灯切换失败。"
        }
    }
}
