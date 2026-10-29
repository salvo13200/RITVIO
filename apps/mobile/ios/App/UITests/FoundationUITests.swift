import XCTest

/// WKWebView gestures -> Capacitor -> native queue and AVPlayer.
/// Debug fixtures use original tones, never real-provider acceptance evidence.
final class FoundationUITests: XCTestCase {
    func testCatalogAlbumArtistAndSavedResources() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--ritvio-ui-check", "--ritvio-ui-library-reset", "-ritvio.language.preference", "en", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        XCTAssertTrue(button(app,"Open player: After the rain").waitForExistence(timeout:90), "Original media fixture must finish seeding before Catalog starts")
        button(app,"Search").tap()
        let field = app.webViews.searchFields["Songs, albums or artists"]
        XCTAssertTrue(field.waitForExistence(timeout:15)); field.tap(); field.typeText("luna\n")
        XCTAssertTrue(button(app,"Open artist: Luna Vale").waitForExistence(timeout:15)); capture(app,"ios-catalog-search-all")
        button(app,"Albums").tap()
        let album = button(app,"Open album: Night scenes")
        XCTAssertTrue(album.waitForExistence(timeout:10)); reveal(app,album); tapCenter(album)
        XCTAssertTrue(app.webViews.staticTexts["Night scenes"].waitForExistence(timeout:15))
        XCTAssertTrue(app.webViews.staticTexts["Unavailable interlude"].waitForExistence(timeout:10)); capture(app,"ios-catalog-album-b")
        let save = button(app,"Save")
        reveal(app,save); tapCenter(save)
        XCTAssertTrue(button(app,"Saved").waitForExistence(timeout:10))
        let artist = button(app,"Luna Vale")
        reveal(app,artist); tapCenter(artist)
        XCTAssertTrue(app.webViews.staticTexts["Luna Vale"].waitForExistence(timeout:10))
        XCTAssertTrue(button(app,"Save").waitForExistence(timeout:10)); reveal(app,button(app,"Save")); tapCenter(button(app,"Save"))
        XCTAssertTrue(button(app,"Saved").waitForExistence(timeout:10)); capture(app,"ios-catalog-artist-discography")
        // Native WebKit history must return to the album without replacing the queue.
        tapCenter(button(app,"Back")); XCTAssertTrue(app.webViews.staticTexts["Night scenes"].waitForExistence(timeout:10))
        tapCenter(button(app,"Back")); XCTAssertTrue(field.waitForExistence(timeout:10)); XCTAssertTrue((field.value as? String)?.contains("luna") == true)
        XCTAssertTrue(button(app,"Open player: After the rain").exists)
        app.terminate(); app.launchArguments.removeAll { $0 == "--ritvio-ui-library-reset" }; app.launch()
        XCTAssertTrue(button(app,"Library").waitForExistence(timeout:35)); button(app,"Library").tap()
        XCTAssertTrue(button(app,"Open album: Night scenes").waitForExistence(timeout:15))
        XCTAssertTrue(button(app,"Open artist: Luna Vale").waitForExistence(timeout:10))
        capture(app,"ios-catalog-saved-resources"); reveal(app,button(app,"Open artist: Luna Vale")); capture(app,"ios-catalog-saved-artists"); reveal(app,button(app,"Open album: Night scenes"))
        tapCenter(button(app,"Open album: Night scenes")); XCTAssertTrue(button(app,"Saved").waitForExistence(timeout:10))
        tapCenter(button(app,"Open player: After the rain"))
        XCTAssertTrue(button(app,"Close player").waitForExistence(timeout:10)); capture(app,"ios-catalog-current-player")
        button(app,"Close player").tap(); XCTAssertTrue(button(app,"Saved").waitForExistence(timeout:10))
        if app.frame.height > 800 {
            // Keep the accessibility-size captures above. Add an independent
            // normal-size pass on the tall iPhone for the portrait design comp;
            // this launch-domain override does not alter the simulator setting.
            app.terminate()
            app.launchArguments.append(contentsOf:["-UIPreferredContentSizeCategoryName","UICTContentSizeCategoryL"])
            app.launch()
            XCTAssertTrue(button(app,"Open player: After the rain").waitForExistence(timeout:90), "Original media fixture must finish seeding before Catalog starts")
            button(app,"Search").tap()
            let standardSearch = app.webViews.searchFields["Songs, albums or artists"]
            XCTAssertTrue(standardSearch.waitForExistence(timeout:10)); standardSearch.tap(); standardSearch.typeText("luna\n")
            XCTAssertTrue(button(app,"Open artist: Luna Vale").waitForExistence(timeout:15)); capture(app,"ios-catalog-search-standard")
            button(app,"Library").tap()
            let savedAlbum = button(app,"Open album: Night scenes")
            reveal(app,savedAlbum); tapCenter(savedAlbum)
            XCTAssertTrue(button(app,"Saved").waitForExistence(timeout:10)); capture(app,"ios-catalog-album-standard")
            let standardArtist = button(app,"Luna Vale")
            reveal(app,standardArtist); tapCenter(standardArtist)
            XCTAssertTrue(button(app,"Saved").waitForExistence(timeout:10)); capture(app,"ios-catalog-artist-standard")
        }
    }
    private func reveal(_ app: XCUIApplication, _ target: XCUIElement) {
        let content = app.webViews.otherElements.matching(identifier:"main").firstMatch
        XCTAssertTrue(content.waitForExistence(timeout:10)); XCTAssertTrue(target.waitForExistence(timeout:10))
        for _ in 0..<8 {
            if content.frame.contains(target.frame) { break }
            let viewport = content.frame, frame = target.frame
            let distance = frame.maxY > viewport.maxY ? frame.maxY - viewport.maxY + 4 : frame.minY - viewport.minY - 4
            // Fixed 60%-height drags can overshoot a tall card in both directions.
            // Move only its measured overflow, retaining a real touch gesture.
            let fraction = min(0.5, max(0.04, abs(distance) / max(1, viewport.height)))
            let start: CGFloat = distance > 0 ? 0.75 : 0.25
            let end = start + (distance > 0 ? -fraction : fraction)
            content.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:start)).press(forDuration:0.05,thenDragTo:content.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:end)))
        }
        XCTAssertTrue(content.frame.contains(target.frame),"Catalog control must be inside the content viewport")
    }
    func testLibraryPersistenceAndPersonalArtwork() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--ritvio-ui-check", "--ritvio-ui-library-reset", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        let settings = app.webViews.buttons.matching(NSPredicate(format:"label == %@ OR label == %@", "Settings", "Impostazioni")).firstMatch
        XCTAssertTrue(settings.waitForExistence(timeout:45))
        let firstResume = app.webViews.buttons.matching(NSPredicate(format:"label CONTAINS %@", "After the rain")).firstMatch
        XCTAssertTrue(firstResume.waitForExistence(timeout:30)); capture(app,"ios5-first-launch")
        tapCenter(button(app,"Settings")); chooseLanguage(app,"English"); button(app,"Done").tap()
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
        let search = app.webViews.searchFields["Songs, albums or artists"]
        XCTAssertTrue(search.waitForExistence(timeout:10)); search.tap(); search.typeText("luna\n"); button(app,"Songs").tap()
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
        tapCenter(button(app,"Back to library"))
        XCTAssertTrue(app.webViews.staticTexts["Your library"].waitForExistence(timeout:10))
        openPlaylistOptions(app,"Native mix")
        XCTAssertTrue(button(app,"Edit details").waitForExistence(timeout:10)); button(app,"Edit details").tap()
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
        openPlaylistOptions(app,"Queued mix"); button(app,"Choose playlist photo").tap()
        let cancelPhoto = app.buttons.matching(identifier:"Cancel").firstMatch
        XCTAssertTrue(cancelPhoto.waitForExistence(timeout:20)); capture(app,"ios5-library-photo-picker"); cancelPhoto.tap()
        XCTAssertTrue(button(app,"Pause").waitForExistence(timeout:15), "Cancelling the system photo picker must preserve the native playback intent")
        button(app,"Pause").tap(); capture(app,"ios5-library-photo-cancelled")
        openPlaylistOptions(app,"Native mix updated"); button(app,"Delete playlist").tap()
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
    private func tapCenter(_ element: XCUIElement) {
        XCTAssertTrue(element.waitForExistence(timeout:10)); XCTAssertTrue(element.isHittable)
        element.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:0.5)).tap()
    }
    private func openPlaylistOptions(_ app: XCUIApplication, _ name: String) {
        let target = button(app,"Playlist options: \(name)")
        let content = app.webViews.otherElements.matching(identifier:"main").firstMatch
        XCTAssertTrue(target.waitForExistence(timeout:10)); XCTAssertTrue(content.exists)
        // WebKit may report a partially clipped control as hittable. Reveal the
        // whole control inside the actual scrollport, above the fixed mini-player.
        for _ in 0..<3 {
            if content.frame.contains(target.frame) { break }
            let up = target.frame.maxY > content.frame.maxY
            let start = content.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:up ? 0.75 : 0.25))
            let finish = content.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:up ? 0.25 : 0.75))
            start.press(forDuration:0.05,thenDragTo:finish)
        }
        XCTAssertTrue(content.frame.contains(target.frame),"Playlist menu must be inside the content viewport before tapping")
        tapCenter(target)
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
        XCTAssertTrue(settings.waitForExistence(timeout: 45)); XCTAssertTrue(button(app,"Open player: After the rain").waitForExistence(timeout:30)); tapCenter(settings)
        XCTAssertTrue(button(app,"Done").waitForExistence(timeout:10))
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
        XCTAssertTrue(slow.waitForExistence(timeout: 10))
        slow.tap(); XCTAssertTrue(button(app, "Move down").waitForExistence(timeout: 10))
        capture(app, "ios4-queue-song-actions"); button(app, "Cancel").tap()
        let closedMenu = NSPredicate { _, _ in !self.button(app, "Cancel").exists }
        expectation(for: closedMenu, evaluatedWith: app); waitForExpectations(timeout: 10)
        XCTAssertTrue(button(app, "Reorder: Night swim").waitForExistence(timeout: 10), "Queue controls must return to the native accessibility tree after dismissing the menu")
        // Repeat the transition: one successful tree refresh must not hide an intermittent regression.
        slow.tap(); XCTAssertTrue(button(app, "Move down").waitForExistence(timeout: 10)); button(app, "Cancel").tap()
        expectation(for: closedMenu, evaluatedWith: app); waitForExpectations(timeout: 10)
        XCTAssertTrue(button(app, "Reorder: Night swim").waitForExistence(timeout: 10))
        revealQueueHandle(app, night)
        XCTAssertTrue(night.isHittable)
        let area = queueArea(app)
        let destination = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx:night.frame.midX-app.frame.minX,dy:area.minY+10-app.frame.minY))
        // The first row can be outside a short/large-text viewport. Hold inside
        // the list's top edge to exercise genuine autoscroll rather than an
        // offscreen element coordinate or the fixed Autoplay panel.
        night.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:0.5)).press(forDuration:0.25,thenDragTo:destination,withVelocity:.slow,thenHoldForDuration:1.2)
        let committed = NSPredicate { _, _ in self.button(app,"Clear").isEnabled }
        expectation(for: committed, evaluatedWith: app); waitForExpectations(timeout: 10)
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
        let field = app.webViews.searchFields["Songs, albums or artists"]
        XCTAssertTrue(field.waitForExistence(timeout: 10)); field.tap(); field.typeText("luna\n"); button(app,"Songs").tap()
        XCTAssertTrue(button(app, "More options: Slow motion").waitForExistence(timeout: 10))
        capture(app, "ios4-search-native-fixture")
        button(app, "More options: Slow motion").tap(); button(app, "Add to queue").tap()
        XCTAssertTrue(app.webViews.staticTexts["Added to queue"].waitForExistence(timeout: 10))
        button(app, "Clear search").tap(); field.typeText("offline\n")
        XCTAssertTrue(app.webViews.staticTexts["The catalog could not load. Check your connection and try again."].waitForExistence(timeout: 10))
        XCTAssertFalse(app.webViews.staticTexts["Added to queue"].exists, "New search must dismiss superseded queue feedback")
        XCTAssertTrue(button(app, "Try again").isHittable)
        capture(app, "ios4-search-recoverable-error")
        button(app, "Clear search").tap(); field.typeText("empty\n")
        XCTAssertTrue(app.webViews.staticTexts["No results here"].waitForExistence(timeout: 10))
        button(app, "Settings").tap()
        XCTAssertTrue(app.webViews.staticTexts["IOS-5"].waitForExistence(timeout: 10))
        let done = button(app, "Done"), headerTop = done.frame.minY
        XCTAssertGreaterThanOrEqual(headerTop, app.frame.height > 800 ? 44 : 16, "Settings must remain below the portrait system region after keyboard dismissal")
        let motion = app.webViews.switches["Reduce motion"]
        XCTAssertTrue(motion.waitForExistence(timeout: 10)); XCTAssertEqual(String(describing: motion.value ?? ""), "0")
        revealSettingsElement(app,motion)
        capture(app, "ios4-settings")
        motion.tap(); XCTAssertEqual(String(describing: motion.value ?? ""), "1")
        capture(app, "ios4-settings-motion-on")
        motion.tap(); XCTAssertEqual(String(describing: motion.value ?? ""), "0")
        let sources = app.webViews.staticTexts["Music sources"]
        revealSettingsElement(app,sources)
        XCTAssertTrue(sources.isHittable, "Settings content must retain its own scrolling")
        XCTAssertEqual(done.frame.minY, headerTop, accuracy: 2, "Settings header must stay fixed")
        capture(app, "ios4-settings-sources")
        // WKWebView can report a partially clipped row as hittable even when its
        // centre is behind the fixed header. Bring the entire control below it.
        let italian = app.webViews.switches["Italiano"]
        revealSettingsElement(app,italian,towardTop:true)
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
    // WebKit exposes an aria-pressed button as a native Switch. Keep those
    // semantics and query the actual actionable role instead of changing UI.
    private func button(_ app: XCUIApplication, _ label: String) -> XCUIElement {
        app.webViews.descendants(matching:.any).matching(NSPredicate(format:"(elementType == %d OR elementType == %d) AND label == %@", XCUIElement.ElementType.button.rawValue, XCUIElement.ElementType.switch.rawValue, label)).firstMatch
    }
    private func queueArea(_ app: XCUIApplication) -> CGRect {
        let hint = app.webViews.staticTexts["Drag to reorder, or use the song menu."].firstMatch
        let autoplay = app.webViews.staticTexts["Autoplay"].firstMatch
        XCTAssertTrue(hint.waitForExistence(timeout:10)); XCTAssertTrue(autoplay.exists)
        let top = hint.frame.maxY+4, bottom = autoplay.frame.minY-12
        XCTAssertGreaterThan(bottom-top, 50, "Upcoming songs must retain a scrolling viewport")
        return CGRect(x:app.frame.minX+22,y:top,width:app.frame.width-44,height:max(1,bottom-top))
    }
    private func revealQueueHandle(_ app: XCUIApplication, _ target: XCUIElement) {
        for attempt in 0..<8 {
            let area = queueArea(app)
            print("Queue reveal \(attempt): list=\(area), target=\(target.exists ? String(describing:target.frame) : "absent")")
            if target.exists && target.frame.midY>area.minY+24 && target.frame.midY<area.maxY-24 { return }
            // AX text frames exclude CSS padding. Starting eight points after
            // the hint can still land above the scrolling list at large text.
            // Pan from its middle, away from either fixed boundary and grips.
            let distance = target.exists ? target.frame.midY-area.midY : area.height
            let travel = min(max(12,abs(distance)),min(90,area.height/2-16))
            let start = app.coordinate(withNormalizedOffset:.zero).withOffset(CGVector(dx:area.minX+4-app.frame.minX,dy:area.midY-app.frame.minY))
            let end = start.withOffset(CGVector(dx:0,dy:(distance >= 0 ? -1 : 1)*travel))
            // Finish at rest rather than flicking: native momentum can move
            // this short list by more than its entire viewport at large text.
            start.press(forDuration:0.05,thenDragTo:end,withVelocity:.slow,thenHoldForDuration:0.5)
        }
        XCTFail("Queue handle could not be revealed inside the list")
    }
    private func revealSettingsElement(_ app: XCUIApplication, _ target: XCUIElement, towardTop: Bool = false) {
        let header = button(app,"Done")
        for _ in 0..<12 {
            let top = header.frame.maxY+16, bottom = app.frame.maxY-40
            let middle = (top+bottom)/2, extent = bottom-top
            if target.exists && target.frame.minY>=top && target.frame.maxY<=bottom { return }
            let distance = target.exists ? target.frame.midY-middle : (towardTop ? -extent : extent)
            let travel = min(max(24,abs(distance)),min(320,extent*0.45))
            let start = app.coordinate(withNormalizedOffset:.zero).withOffset(CGVector(dx:26,dy:middle-app.frame.minY))
            start.press(forDuration:0.05,thenDragTo:start.withOffset(CGVector(dx:0,dy:(distance>=0 ? -1 : 1)*travel)),withVelocity:.slow,thenHoldForDuration:0.5)
        }
        XCTFail("Settings control could not be revealed below the fixed header")
    }
    private func chooseLanguage(_ app: XCUIApplication, _ label: String) {
        let choice = app.webViews.switches[label]
        XCTAssertTrue(choice.waitForExistence(timeout: 10)); choice.tap()
        let selected = NSPredicate { _, _ in String(describing: choice.value ?? "") == "1" }
        expectation(for: selected, evaluatedWith: app); waitForExpectations(timeout: 10)
    }
    private func capture(_ app: XCUIApplication, _ name: String) {
        if name == "ios-catalog-artist-discography" || name == "ios5-player-liked" { wait(app) { !app.webViews.staticTexts["Saved to your library"].exists && !app.webViews.staticTexts["Song saved to liked songs"].exists } }
        Thread.sleep(forTimeInterval: name.contains("landscape") ? 1.0 : 0.35)
        // A full-screen capture avoids app.screenshot's transformed-window ROI in landscape.
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot()); attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
    override func tearDownWithError() throws {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot()); attachment.name = "ios4-final-state"; attachment.lifetime = .keepAlways; add(attachment)
    }
}
