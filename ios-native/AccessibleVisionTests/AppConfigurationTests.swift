import XCTest
@testable import AccessibleVision

final class AppConfigurationTests: XCTestCase {
    func testNativeTaskModesRemainExclusive() {
        let modes: Set<NativeTaskMode> = [
            .idle,
            .activeReminder,
            .findObject,
            .continuousNarration,
            .navigationSiteAssist
        ]
        XCTAssertEqual(modes.count, 5)
    }
}

