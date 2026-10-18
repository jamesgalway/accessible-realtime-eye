import XCTest

final class NativeEntryAccessibilityTests: XCTestCase {
    func testNativeGoogleEntriesAndWebContentRemainAccessible() {
        let app = XCUIApplication()
        app.launch()
        let unified = app.buttons["nativeUnifiedAssistantButton"]
        let direct = app.buttons["nativeDirectScreenAssistantButton"]
        let google = app.buttons["nativeBackend-greenCloud"]
        let ali = app.buttons["nativeBackend-aliyun"]
        let assistant = app.buttons["nativeSection-assistant"]
        let navigation = app.buttons["nativeSection-navigation"]
        let teaching = app.buttons["nativeSection-teaching"]
        XCTAssertTrue(unified.waitForExistence(timeout: 20))
        XCTAssertTrue(direct.exists)
        XCTAssertTrue(app.buttons["屏幕共享"].exists)
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 30))
        let enabled = NSPredicate(format: "enabled == true")
        expectation(for: enabled, evaluatedWith: unified)
        expectation(for: enabled, evaluatedWith: direct)
        waitForExpectations(timeout: 30)
        XCTAssertTrue(unified.isHittable)
        XCTAssertTrue(direct.isHittable)
        XCTAssertEqual(app.buttons.matching(NSPredicate(format: "label == %@", "实时慧眼")).count, 1)
        XCTAssertFalse(app.staticTexts["实时慧眼与无障碍导航"].exists)
        XCTAssertFalse(app.webViews.firstMatch.textFields["city"].exists)
        XCTAssertTrue(google.isSelected)
        XCTAssertFalse(ali.isSelected)
        XCTAssertTrue(assistant.isSelected)
        let expected = ["阿里百炼", "Gemini版", "闪光灯", "慧眼", "导航", "教学", "实时慧眼", "直连筛图", "屏幕共享", "结束慧眼"]
        // Exclude the live web page's changing controls from this native order check.
        let ordered = app.buttons.matching(NSPredicate(format: "label IN %@", expected))
            .allElementsBoundByIndex.map { $0.label }
        let positions = expected.compactMap { ordered.firstIndex(of: $0) }
        XCTAssertEqual(positions.count, expected.count)
        XCTAssertEqual(positions, positions.sorted())
        for label in expected {
            let button = app.buttons.matching(NSPredicate(format: "label == %@", label)).firstMatch
            XCTAssertTrue(button.exists, "Missing native button: \(label)")
            if button.isEnabled { XCTAssertTrue(button.isHittable, "Covered native button: \(label)") }
        }
        XCTAssertTrue(app.scrollViews["nativeAppScroll"].exists)
        // Switching the backend must detach the Google controls. No model starts.
        ali.tap()
        XCTAssertTrue(ali.isSelected)
        XCTAssertFalse(google.isSelected)
        XCTAssertTrue(unified.exists)
        XCTAssertFalse(direct.exists)
        XCTAssertTrue(app.buttons["nativeAliVideoAssistantButton"].exists)
        XCTAssertTrue(app.buttons["nativeScreenShareButton"].exists)
        navigation.tap()
        XCTAssertTrue(navigation.isSelected)
        XCTAssertFalse(assistant.isSelected)
        XCTAssertFalse(unified.exists)
        XCTAssertFalse(app.buttons["nativeScreenShareButton"].exists)
        let city = app.webViews.firstMatch.textFields.firstMatch
        XCTAssertTrue(city.waitForExistence(timeout: 30))
        let oldCity = city.value as? String ?? ""
        city.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).tap()
        city.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: oldCity.count) + "NATIVE-CHECK")
        assistant.tap()
        navigation.tap()
        XCTAssertTrue(city.waitForExistence(timeout: 20))
        XCTAssertEqual(city.value as? String, "NATIVE-CHECK", "Changing native sections must preserve the existing route form")
        teaching.tap()
        XCTAssertTrue(teaching.isSelected)
        XCTAssertFalse(navigation.isSelected)
        XCTAssertTrue(ali.isSelected)
        XCTAssertFalse(unified.exists)
        google.tap()
        XCTAssertTrue(google.isSelected)
        XCTAssertTrue(teaching.isSelected)
        assistant.tap()
        XCTAssertTrue(unified.waitForExistence(timeout: 20))
        XCTAssertTrue(direct.exists)
        XCTAssertTrue(app.buttons["nativeScreenShareButton"].exists)
        XCTAssertTrue(app.buttons["nativeEndAssistantButton"].exists)
    }
}
