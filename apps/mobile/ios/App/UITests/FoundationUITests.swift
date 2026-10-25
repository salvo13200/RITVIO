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
        capture(app, "ios4-home-native-fixture"); resume.tap()
        let slider = app.webViews.sliders["Playback position"]
        XCTAssertTrue(slider.waitForExistence(timeout: 10))
        let queue = button(app, "Queue"), origin = queue.frame
        app.swipeUp()
        XCTAssertEqual(queue.frame.minY, origin.minY, accuracy: 2, "Expanded player must not scroll")
        XCTAssertFalse(app.webViews.sliders["Volume"].exists)
        slider.adjust(toNormalizedSliderPosition: 0.6)
        XCTAssertTrue(button(app, "Play").waitForExistence(timeout: 10), "Seeking while paused must stay paused")
        capture(app, "ios4-player-native-fixture"); queue.tap()
        let slow = button(app, "Reorder: Slow motion"), night = button(app, "Reorder: Night swim")
        XCTAssertTrue(slow.waitForExistence(timeout: 10)); XCTAssertTrue(night.isHittable)
        night.press(forDuration: 0.25, thenDragTo: slow)
        let reordered = NSPredicate { _, _ in
            let first = app.webViews.buttons["Reorder: Night swim"], second = app.webViews.buttons["Reorder: Slow motion"]
            return first.exists && second.exists && first.frame.minY < second.frame.minY
        }
        expectation(for: reordered, evaluatedWith: app); waitForExpectations(timeout: 10)
        capture(app, "ios4-queue-reordered-native")
        button(app, "Done").tap(); button(app, "Next song").tap()
        XCTAssertTrue(app.webViews.staticTexts["Night swim"].waitForExistence(timeout: 15), "Next must follow the reordered native queue")
        XCTAssertTrue(button(app, "Pause").waitForExistence(timeout: 15)); button(app, "Pause").tap()
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
        capture(app, "ios4-search-recoverable-error")
        button(app, "Clear search").tap(); field.typeText("empty\n")
        XCTAssertTrue(app.webViews.staticTexts["No songs found"].waitForExistence(timeout: 10))
        button(app, "Settings").tap(); capture(app, "ios4-settings")
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
    }
    private func capture(_ app: XCUIApplication, _ name: String) {
        Thread.sleep(forTimeInterval: 0.35)
        let attachment = XCTAttachment(screenshot: app.screenshot()); attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
    override func tearDownWithError() throws {
        let attachment = XCTAttachment(screenshot: XCUIApplication().screenshot()); attachment.name = "ios4-final-state"; attachment.lifetime = .keepAlways; add(attachment)
    }
}
