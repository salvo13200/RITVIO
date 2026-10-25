import XCTest

/// WKWebView gestures -> Capacitor -> native queue and AVPlayer.
/// Debug fixtures use original tones, never real-provider acceptance evidence.
final class FoundationUITests: XCTestCase {
    func testListeningInterfaceAndNativeQueue() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--ritvio-ui-check", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        let settings = app.webViews.buttons.matching(NSPredicate(format: "label == %@ OR label == %@", "Settings", "Impostazioni")).firstMatch
        XCTAssertTrue(settings.waitForExistence(timeout: 45)); settings.tap()
        chooseLanguage(app, "English"); button(app, "Done").tap()
        let resume = button(app, "Open player: After the rain")
        XCTAssertTrue(resume.waitForExistence(timeout: 30))
        XCTAssertTrue(button(app, "Play").waitForExistence(timeout: 15))
        capture(app, "ios4-home-native-fixture"); resume.tap()
        let slider = app.webViews.sliders["Playback position"]
        XCTAssertTrue(slider.waitForExistence(timeout: 10))
        let queue = button(app, "Queue"), origin = queue.frame
        app.swipeUp()
        XCTAssertEqual(queue.frame.minY, origin.minY, accuracy: 2, "Expanded player must not scroll")
        XCTAssertFalse(app.webViews.sliders["Volume"].exists)
        // XCTest's native-slider helper has no scrubber coordinates for a WKWebView range.
        // Exercise the real touch path instead, then read the native-backed time value.
        let start = slider.coordinate(withNormalizedOffset: CGVector(dx: 24.0 / 90.0, dy: 0.5))
        let finish = slider.coordinate(withNormalizedOffset: CGVector(dx: 0.6, dy: 0.5))
        start.press(forDuration: 0.15, thenDragTo: finish)
        let sought = NSPredicate { _, _ in String(describing: slider.value ?? "").contains("0:5") }
        expectation(for: sought, evaluatedWith: app); waitForExpectations(timeout: 10)
        XCTAssertTrue(button(app, "Play").waitForExistence(timeout: 10), "Seeking while paused must stay paused")
        capture(app, "ios4-player-native-fixture")
        XCUIDevice.shared.orientation = .landscapeLeft
        let landscape = NSPredicate { _, _ in app.frame.width > app.frame.height }
        expectation(for: landscape, evaluatedWith: app); waitForExpectations(timeout: 10)
        XCTAssertTrue(button(app, "Next song").isHittable)
        capture(app, "ios4-player-landscape-native-fixture")
        XCUIDevice.shared.orientation = .portrait
        queue.tap()
        let slow = button(app, "Reorder: Slow motion"), night = button(app, "Reorder: Night swim")
        XCTAssertTrue(slow.waitForExistence(timeout: 10)); XCTAssertTrue(night.isHittable)
        slow.tap(); XCTAssertTrue(button(app, "Move down").waitForExistence(timeout: 10))
        capture(app, "ios4-queue-song-actions"); button(app, "Cancel").tap()
        let closedMenu = NSPredicate { _, _ in !self.button(app, "Cancel").exists }
        expectation(for: closedMenu, evaluatedWith: app); waitForExpectations(timeout: 10)
        XCTAssertTrue(button(app, "Reorder: Night swim").waitForExistence(timeout: 10), "Queue controls must return to the native accessibility tree after dismissing the menu")
        // Repeat the transition: one successful tree refresh must not hide an intermittent regression.
        slow.tap(); XCTAssertTrue(button(app, "Move down").waitForExistence(timeout: 10)); button(app, "Cancel").tap()
        expectation(for: closedMenu, evaluatedWith: app); waitForExpectations(timeout: 10)
        XCTAssertTrue(button(app, "Reorder: Night swim").waitForExistence(timeout: 10))
        night.press(forDuration: 0.25, thenDragTo: slow)
        let reordered = NSPredicate { _, _ in
            let first = app.webViews.buttons["Reorder: Night swim"], second = app.webViews.buttons["Reorder: Slow motion"]
            return first.exists && second.exists && first.frame.minY < second.frame.minY
        }
        expectation(for: reordered, evaluatedWith: app); waitForExpectations(timeout: 10)
        capture(app, "ios4-queue-reordered-native")
        button(app, "Done").tap(); button(app, "Play").tap()
        XCTAssertTrue(button(app, "Pause").waitForExistence(timeout: 15))
        button(app, "Next song").tap()
        XCTAssertTrue(app.webViews.staticTexts["Night swim"].waitForExistence(timeout: 15), "Next must follow the reordered native queue")
        XCTAssertTrue(button(app, "Pause").waitForExistence(timeout: 15)); button(app, "Pause").tap()
        XCTAssertTrue(button(app, "Play").waitForExistence(timeout: 15))
        capture(app, "ios4-player-after-reordered-next")
        button(app, "Close player").tap(); button(app, "Search").tap()
        let field = app.webViews.searchFields["Songs or artists"]
        XCTAssertTrue(field.waitForExistence(timeout: 10)); field.tap(); field.typeText("luna\n")
        XCTAssertTrue(button(app, "More options: Slow motion").waitForExistence(timeout: 10))
        capture(app, "ios4-search-native-fixture")
        button(app, "More options: Slow motion").tap(); button(app, "Add to queue").tap()
        XCTAssertTrue(app.webViews.staticTexts["Added to queue"].waitForExistence(timeout: 10))
        button(app, "Clear search").tap(); field.typeText("offline\n")
        XCTAssertTrue(app.webViews.staticTexts["Search could not complete. Check your connection and try again."].waitForExistence(timeout: 10))
        XCTAssertFalse(app.webViews.staticTexts["Added to queue"].exists, "New search must dismiss superseded queue feedback")
        XCTAssertTrue(button(app, "Try again").isHittable)
        capture(app, "ios4-search-recoverable-error")
        button(app, "Clear search").tap(); field.typeText("empty\n")
        XCTAssertTrue(app.webViews.staticTexts["No songs found"].waitForExistence(timeout: 10))
        button(app, "Settings").tap()
        XCTAssertTrue(app.webViews.staticTexts["IOS-4"].waitForExistence(timeout: 10))
        let done = button(app, "Done"), headerTop = done.frame.minY
        XCTAssertGreaterThanOrEqual(headerTop, app.frame.height > 800 ? 44 : 16, "Settings must remain below the portrait system region after keyboard dismissal")
        let motion = app.webViews.switches["Reduce motion"]
        XCTAssertTrue(motion.waitForExistence(timeout: 10)); XCTAssertEqual(String(describing: motion.value ?? ""), "0")
        capture(app, "ios4-settings")
        motion.tap(); XCTAssertEqual(String(describing: motion.value ?? ""), "1")
        capture(app, "ios4-settings-motion-on")
        motion.tap(); XCTAssertEqual(String(describing: motion.value ?? ""), "0")
        let sources = app.webViews.staticTexts["Music sources"]
        for _ in 0..<4 { if sources.isHittable { break }; app.swipeUp() }
        XCTAssertTrue(sources.isHittable, "Settings content must retain its own scrolling")
        XCTAssertEqual(done.frame.minY, headerTop, accuracy: 2, "Settings header must stay fixed")
        capture(app, "ios4-settings-sources")
        // WKWebView can report a partially clipped row as hittable even when its
        // centre is behind the fixed header. Bring the entire control below it.
        let italian = app.webViews.switches["Italiano"]
        for _ in 0..<4 { if italian.exists && italian.frame.minY >= done.frame.maxY { break }; app.swipeDown() }
        XCTAssertGreaterThanOrEqual(italian.frame.minY, done.frame.maxY)
        chooseLanguage(app, "Italiano"); button(app, "Fine").tap()
        app.terminate(); app.launch()
        XCTAssertTrue(app.webViews.staticTexts["Il tuo ascolto"].waitForExistence(timeout: 35))
        button(app, "Impostazioni").tap(); chooseLanguage(app, "English"); button(app, "Done").tap()
        capture(app, "ios4-language-persisted-and-restored")
        app.terminate(); app.launchArguments.append("--ritvio-ui-empty"); app.launch()
        XCTAssertTrue(app.webViews.staticTexts["Your next listen starts here"].waitForExistence(timeout: 35))
        capture(app, "ios4-first-listen-empty")
    }
    private func button(_ app: XCUIApplication, _ label: String) -> XCUIElement { app.webViews.buttons.matching(identifier: label).firstMatch }
    private func chooseLanguage(_ app: XCUIApplication, _ label: String) {
        let choice = app.webViews.switches[label]
        XCTAssertTrue(choice.waitForExistence(timeout: 10)); choice.tap()
        let selected = NSPredicate { _, _ in String(describing: choice.value ?? "") == "1" }
        expectation(for: selected, evaluatedWith: app); waitForExpectations(timeout: 10)
    }
    private func capture(_ app: XCUIApplication, _ name: String) {
        Thread.sleep(forTimeInterval: name.contains("landscape") ? 1.0 : 0.35)
        // A full-screen capture avoids app.screenshot's transformed-window ROI in landscape.
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot()); attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
    override func tearDownWithError() throws {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot()); attachment.name = "ios4-final-state"; attachment.lifetime = .keepAlways; add(attachment)
    }
}
