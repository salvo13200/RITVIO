import XCTest

/// WKWebView gestures -> Capacitor -> native queue and AVPlayer.
/// Debug fixtures use original tones, never real-provider acceptance evidence.
final class FoundationUITests: XCTestCase {
    func testLibraryPersistenceAndPersonalArtwork() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--ritvio-ui-check", "--ritvio-ui-library-reset", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        let settings = app.webViews.buttons.matching(NSPredicate(format:"label == %@ OR label == %@", "Settings", "Impostazioni")).firstMatch
        XCTAssertTrue(settings.waitForExistence(timeout:45)); settings.tap(); chooseLanguage(app,"English"); button(app,"Done").tap()
        wait(app) { !self.button(app,"Done").exists }
        XCTAssertTrue(button(app,"Library").waitForExistence(timeout:15)); button(app,"Library").tap()
        XCTAssertTrue(app.webViews.staticTexts["Your playlists"].waitForExistence(timeout:10)); capture(app,"ios5-library-empty")
        button(app,"Home").tap()
        let resume = button(app,"Open player: After the rain")
        XCTAssertTrue(resume.waitForExistence(timeout:30)); resume.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:0.5)).tap()
        let like = app.webViews.descendants(matching:.any).matching(identifier:"Like song").firstMatch
        XCTAssertTrue(like.waitForExistence(timeout:10)); like.tap()
        XCTAssertTrue(app.webViews.descendants(matching:.any).matching(identifier:"Unlike song").firstMatch.waitForExistence(timeout:10))
        capture(app,"ios5-player-liked")
        button(app,"More options").tap(); button(app,"Add to playlist").tap(); button(app,"Create playlist").tap()
        let name = app.webViews.textFields["Name"]
        XCTAssertTrue(name.waitForExistence(timeout:10)); name.tap(); name.typeText("Native mix")
        capture(app,"ios5-playlist-create"); button(app,"Save").tap()
        XCTAssertTrue(button(app,"Close player").waitForExistence(timeout:10)); button(app,"Close player").tap()
        button(app,"Search").tap()
        let search = app.webViews.searchFields["Songs or artists"]
        XCTAssertTrue(search.waitForExistence(timeout:10)); search.tap(); search.typeText("luna\n")
        XCTAssertTrue(button(app,"More options: Slow motion").waitForExistence(timeout:10)); button(app,"More options: Slow motion").tap(); button(app,"Add to playlist").tap()
        let target = app.webViews.buttons.matching(NSPredicate(format:"label CONTAINS %@", "Native mix")).firstMatch
        XCTAssertTrue(target.waitForExistence(timeout:10)); target.tap()
        wait(app) { !self.button(app,"Create playlist").exists }
        button(app,"Library").tap()
        XCTAssertTrue(button(app,"Native mix, 2 songs").waitForExistence(timeout:10)); button(app,"Native mix, 2 songs").tap()
        XCTAssertTrue(button(app,"Reorder: Slow motion").waitForExistence(timeout:10))
        let slow = button(app,"Reorder: Slow motion"), rain = button(app,"Reorder: After the rain")
        slow.press(forDuration:0.25, thenDragTo:rain)
        wait(app) { slow.frame.minY < rain.frame.minY }
        capture(app,"ios5-playlist-detail")
        button(app,"Play collection").tap()
        XCTAssertTrue(button(app,"Open player: Slow motion").waitForExistence(timeout:15)); button(app,"Open player: Slow motion").tap()
        XCTAssertTrue(button(app,"Pause").waitForExistence(timeout:15)); button(app,"Next song").tap()
        XCTAssertTrue(app.webViews.staticTexts["After the rain"].waitForExistence(timeout:15)); button(app,"Pause").tap(); button(app,"Close player").tap()
        button(app,"Back to library").tap(); button(app,"Playlist options: Native mix").tap(); button(app,"Edit details").tap()
        XCTAssertTrue(name.waitForExistence(timeout:10)); replace(name, with:"Native mix updated")
        capture(app,"ios5-playlist-edit"); button(app,"Save").tap()
        XCTAssertTrue(button(app,"Native mix updated, 2 songs").waitForExistence(timeout:10))
        button(app,"Open player: After the rain").tap(); button(app,"Queue").tap(); button(app,"Save queue as playlist").tap()
        XCTAssertTrue(name.waitForExistence(timeout:10)); name.tap(); name.typeText("Queued mix"); button(app,"Save").tap()
        XCTAssertTrue(button(app,"Play: After the rain").waitForExistence(timeout:10)); XCTAssertTrue(button(app,"Done").exists); capture(app,"ios5-queue-saved")
        button(app,"Done").tap(); button(app,"Close player").tap()
        app.terminate(); app.launchArguments.removeAll { $0 == "--ritvio-ui-library-reset" }; app.launch()
        XCTAssertTrue(button(app,"Library").waitForExistence(timeout:35)); button(app,"Library").tap()
        XCTAssertTrue(button(app,"Native mix updated, 2 songs").waitForExistence(timeout:10)); XCTAssertTrue(button(app,"Queued mix, 2 songs").exists)
        capture(app,"ios5-library-restarted")
        button(app,"Recently played").tap(); XCTAssertTrue(button(app,"Play: After the rain").waitForExistence(timeout:10)); capture(app,"ios5-library-history"); button(app,"Back to library").tap()
        button(app,"Play").tap(); XCTAssertTrue(button(app,"Pause").waitForExistence(timeout:15))
        button(app,"Playlist options: Queued mix").tap(); button(app,"Choose playlist photo").tap()
        let cancelPhoto = app.buttons.matching(identifier:"Cancel").firstMatch
        XCTAssertTrue(cancelPhoto.waitForExistence(timeout:20)); capture(app,"ios5-library-photo-picker"); cancelPhoto.tap()
        XCTAssertTrue(button(app,"Pause").waitForExistence(timeout:15), "Cancelling the system photo picker must preserve the native playback intent")
        button(app,"Pause").tap(); capture(app,"ios5-library-photo-cancelled")
        button(app,"Playlist options: Native mix updated").tap(); button(app,"Delete playlist").tap()
        capture(app,"ios5-library-delete"); button(app,"Delete").tap()
        wait(app) { !self.button(app,"Native mix updated, 2 songs").exists }
        XCTAssertTrue(button(app,"Queued mix, 2 songs").exists)
        app.terminate(); app.launchArguments.append(contentsOf:["--ritvio-ui-library-reset","--ritvio-ui-library-seed"]); app.launch()
        XCTAssertTrue(button(app,"Library").waitForExistence(timeout:35)); button(app,"Library").tap()
        XCTAssertTrue(button(app,"Night drive, 18 songs").waitForExistence(timeout:10))
        if button(app,"Grid view").exists { button(app,"Grid view").tap() }
        capture(app,"ios5-library-grid"); button(app,"List view").tap(); capture(app,"ios5-library-list")
        let likedCollection = app.webViews.buttons.matching(NSPredicate(format:"label BEGINSWITH %@", "Liked songs")).firstMatch
        likedCollection.tap(); XCTAssertTrue(button(app,"Play: Golden hour").waitForExistence(timeout:10)); capture(app,"ios5-liked-songs")
    }
    private func wait(_ app: XCUIApplication, until condition: @escaping () -> Bool) {
        expectation(for:NSPredicate { _, _ in condition() }, evaluatedWith:app); waitForExpectations(timeout:15)
    }
    private func replace(_ field: XCUIElement, with value: String) {
        let old = String(describing:field.value ?? "")
        field.coordinate(withNormalizedOffset:CGVector(dx:0.95,dy:0.5)).tap()
        field.typeText(String(repeating:XCUIKeyboardKey.delete.rawValue,count:old.count)); field.typeText(value)
        XCTAssertEqual(String(describing:field.value ?? ""),value)
    }
    func testListeningInterfaceAndNativeQueue() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--ritvio-ui-check", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        let settings = app.webViews.buttons.matching(NSPredicate(format: "label == %@ OR label == %@", "Settings", "Impostazioni")).firstMatch
        XCTAssertTrue(settings.waitForExistence(timeout: 45)); settings.tap()
        chooseLanguage(app, "English"); button(app, "Done").tap()
        expectation(for: NSPredicate { _, _ in !self.button(app, "Done").exists }, evaluatedWith: app); waitForExpectations(timeout: 10)
        let resume = button(app, "Open player: After the rain")
        XCTAssertTrue(resume.waitForExistence(timeout: 30))
        XCTAssertTrue(button(app, "Play").waitForExistence(timeout: 15))
        capture(app, "ios4-home-native-fixture"); resume.coordinate(withNormalizedOffset: CGVector(dx:0.5,dy:0.5)).tap()
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
        XCTAssertTrue(app.webViews.staticTexts["IOS-5"].waitForExistence(timeout: 10))
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
