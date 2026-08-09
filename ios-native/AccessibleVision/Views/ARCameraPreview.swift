import ARKit
import SwiftUI

struct ARCameraPreview: UIViewRepresentable {
    let camera: NativeCameraService

    func makeUIView(context: Context) -> ARSCNView {
        let view = ARSCNView(frame: .zero)
        view.session = camera.session
        view.scene = SCNScene()
        view.automaticallyUpdatesLighting = false
        view.accessibilityElementsHidden = true
        return view
    }

    func updateUIView(_ view: ARSCNView, context: Context) {
        camera.updateViewportSize(view.bounds.size)
    }
}

