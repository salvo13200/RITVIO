import XCTest

final class FoundationUITests: XCTestCase {
    func testNativeBridgeAndLanguagePersistence() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        // The preference may survive an earlier test run; select English first.
        let english = app.webViews.switches["English"]
        XCTAssertTrue(english.waitForExistence(timeout: 45))
        tap(app, "English")
        XCTAssertTrue(app.webViews.staticTexts["Native bridge ready"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.webViews.staticTexts["IOS-1"].exists)
        XCTAssertTrue(app.webViews.staticTexts["Included in this app"].exists)
        capture(app, "foundation-english")

        app.webViews.buttons["Check connection"].tap()
        XCTAssertTrue(app.webViews.staticTexts["Connection verified"].waitForExistence(timeout: 10))
        capture(app, "foundation-round-trip")

        tap(app, "Italiano")
        XCTAssertTrue(app.webViews.staticTexts["Build tecnica iOS"].waitForExistence(timeout: 10))
        app.terminate()
        app.launch()
        XCTAssertTrue(app.webViews.staticTexts["Build tecnica iOS"].waitForExistence(timeout: 30))
        XCTAssertTrue(app.webViews.staticTexts["Bridge nativo pronto"].waitForExistence(timeout: 10))
        capture(app, "foundation-persisted-italian")

        tap(app, "English")
        XCTAssertTrue(app.webViews.staticTexts["iOS technical build"].waitForExistence(timeout: 10))
        app.swipeDown()
    }

    private func capture(_ app: XCUIApplication, _ name: String) {
        for _ in 0..<3 { app.swipeDown() }
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func tap(_ app: XCUIApplication, _ name: String) {
        // WebKit exposes aria-pressed language choices as native switches.
        let button = app.webViews.switches[name]
        for _ in 0..<5 {
            if button.isHittable { break }
            app.swipeUp()
        }
        XCTAssertTrue(button.isHittable, "Button is not reachable: \(name)")
        button.tap()
    }

    override func tearDownWithError() throws {
        let screenshot = XCTAttachment(screenshot: XCUIApplication().screenshot())
        screenshot.name = "foundation-final-state"
        screenshot.lifetime = .keepAlways
        add(screenshot)
    }
}
