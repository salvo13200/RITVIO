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
        captureCurrent(app, "foundation-language-english")
        XCTAssertTrue(app.webViews.staticTexts["Native bridge ready"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.webViews.staticTexts["IOS-2"].exists)
        XCTAssertTrue(app.webViews.staticTexts["Included in this app"].exists)
        capture(app, "foundation-english")

        app.webViews.buttons["Check connection"].tap()
        XCTAssertTrue(app.webViews.staticTexts["Connection verified"].waitForExistence(timeout: 10))
        capture(app, "foundation-round-trip")

        tap(app, "Use device language")
        captureCurrent(app, "foundation-language-system")
        tap(app, "Italiano")
        XCTAssertTrue(app.webViews.staticTexts["Build tecnica iOS"].waitForExistence(timeout: 10))
        captureCurrent(app, "foundation-language-italian")
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
        let brand = app.webViews.staticTexts["RITVIO"]
        for _ in 0..<10 {
            if brand.isHittable { break }
            app.swipeDown()
        }
        XCTAssertTrue(brand.isHittable, "The capture must include the top of the page")
        captureCurrent(app, name)
    }

    private func captureCurrent(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func tap(_ app: XCUIApplication, _ name: String) {
        // WebKit exposes aria-pressed language choices as native switches.
        let button = app.webViews.switches[name]
        for _ in 0..<8 {
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
