import XCTest

final class NativeEntryAccessibilityTests: XCTestCase {
    func testNativeGoogleEntriesAndWebContentRemainAccessible() {
        let app = XCUIApplication()
        app.launch()
        let unified = app.buttons["nativeUnifiedAssistantButton"]
        let direct = app.buttons["nativeDirectScreenAssistantButton"]
        XCTAssertTrue(unified.waitForExistence(timeout: 20))
        XCTAssertTrue(direct.exists)
        XCTAssertTrue(app.buttons["屏幕共享"].exists)
        XCTAssertTrue(unified.isHittable)
        XCTAssertTrue(direct.isHittable)
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 30))
        let enabled = NSPredicate(format: "enabled == true")
        expectation(for: enabled, evaluatedWith: unified)
        expectation(for: enabled, evaluatedWith: direct)
        waitForExpectations(timeout: 30)
        XCTAssertEqual(app.buttons.matching(NSPredicate(format: "label == %@", "实时慧眼")).count, 1)
        XCTAssertFalse(app.staticTexts["实时慧眼与无障碍导航"].exists)
        XCTAssertTrue(app.webViews.firstMatch.textFields.firstMatch.exists)
        let ordered = app.buttons.allElementsBoundByIndex.map { $0.label }
        let expected = ["阿里百炼", "Gemini版", "教学", "屏幕共享", "实时慧眼", "直连筛图"]
        let positions = expected.compactMap { ordered.firstIndex(of: $0) }
        XCTAssertEqual(positions.count, expected.count)
        XCTAssertEqual(positions, positions.sorted())
        // Switching the backend must detach the Google controls. No model starts.
        app.buttons["阿里百炼"].tap()
        XCTAssertTrue(unified.exists)
        XCTAssertFalse(direct.exists)
        XCTAssertTrue(app.buttons["nativeAliVideoAssistantButton"].exists)
        XCTAssertTrue(app.buttons["nativeScreenShareButton"].exists)
        app.buttons["教学"].tap()
        XCTAssertTrue(unified.exists)
        XCTAssertTrue(app.buttons["nativeScreenShareButton"].exists)
        app.buttons["Gemini版"].tap()
        XCTAssertTrue(unified.waitForExistence(timeout: 20))
        XCTAssertTrue(direct.exists)
    }
}
