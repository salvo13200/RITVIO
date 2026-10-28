import Foundation
import UIKit
import Capacitor

/// Native resolver/player bridge. Signed descriptors never cross into JavaScript.
@objc(RitvioPlaybackPlugin)
public class RitvioPlaybackPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RitvioPlaybackPlugin"
    public let jsName = "RitvioPlayback"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "foundationStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "foundationCheck", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "languageRead", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "languageWrite", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resolverStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "search", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "catalog", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resolverInspect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelResolver", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "snapshot", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "playTracks", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "enqueue", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "command", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "library", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "libraryCommand", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveQueue", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "chooseArtwork", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removeArtwork", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "navigationState", returnType: CAPPluginReturnPromise)
    ]
    private let preferenceKey = "ritvio.language.preference"
    private let revisionKey = "ritvio.language.revision"
    let libraryWorker = DispatchQueue(label: "it.ritvio.library", qos: .userInitiated)
    var artworkPicker: LibraryArtworkPicker?

    public override func load() {
        DispatchQueue.main.async { [weak self] in
            NativePlaybackOwner.shared.onSnapshot = { [weak self] state in self?.notifyListeners("playback", data: self?.present(state) ?? state) }
            NativePlaybackOwner.shared.onTrackStarted = { [weak self] track in
                self?.libraryWorker.async { [weak self] in
                    guard let self else { return }
                    if let value = try? NativeLibraryStore.shared.remember(track) { self.emitLibrary(value) }
                }
            }
            #if DEBUG
            NativeUIFixture.prepareIfRequested()
            #endif
        }
    }
    @objc func snapshot(_ call: CAPPluginCall) { playback(call) { NativePlaybackOwner.shared.snapshot() } }
    @objc func playTracks(_ call: CAPPluginCall) {
        guard let items = call.getArray("items") as? [[String: Any]], !items.isEmpty, items.count <= 500, let index = call.getInt("index") else { call.reject("Invalid queue", "INVALID_QUEUE"); return }
        playback(call) {
            #if DEBUG
            if NativeUIFixture.enabled { return try NativePlaybackOwner.shared.playTracks(items.map(NativeUIFixture.playbackTrack), index: index) }
            #endif
            return try NativePlaybackOwner.shared.playTracks(items, index: index)
        }
    }
    @objc func enqueue(_ call: CAPPluginCall) {
        guard let track = call.getObject("track") else { call.reject("Invalid track", "INVALID_TRACK"); return }
        playback(call) {
            #if DEBUG
            if NativeUIFixture.enabled { return try NativePlaybackOwner.shared.enqueue(NativeUIFixture.playbackTrack(track), next: call.getBool("next") ?? false) }
            #endif
            return try NativePlaybackOwner.shared.enqueue(track, next: call.getBool("next") ?? false)
        }
    }
    @objc func command(_ call: CAPPluginCall) {
        guard let type = call.getString("type") else { call.reject("Invalid command", "INVALID_COMMAND"); return }
        playback(call) { try NativePlaybackOwner.shared.command(type, value: call.getValue("value")) }
    }
    private func playback(_ call: CAPPluginCall, operation: @escaping () throws -> [String: Any]) {
        DispatchQueue.main.async {
            do { call.resolve(self.present(try operation())) }
            catch { call.reject("Playback operation could not complete", (error as? ResolverFailure)?.identifier ?? "PLAYBACK_UNAVAILABLE") }
        }
    }

    private func present(_ state: [String: Any]) -> [String: Any] {
        #if DEBUG
        if NativeUIFixture.enabled { return NativeUIFixture.present(state) }
        #endif
        return state
    }

    @objc func resolverStatus(_ call: CAPPluginCall) { resolve(call, payload: ["operation": "status"]) }

    @objc func search(_ call: CAPPluginCall) {
        guard let query = call.getString("query"), (3...200).contains(query.trimmingCharacters(in: .whitespacesAndNewlines).count) else { call.reject("Enter between 3 and 200 characters", "INVALID_QUERY"); return }
        #if DEBUG
        if NativeUIFixture.enabled {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                if query.lowercased().contains("offline") { call.reject("Synthetic offline check", "NETWORK_UNAVAILABLE") }
                else { call.resolve(NativeUIFixture.present(["items": query.lowercased().contains("empty") ? [] : NativeUIFixture.tracks, "cached": false])) }
            }
            return
        }
        #endif
        resolve(call, payload: ["operation": "search", "query": query]) { value in
            ["items": value["items"] ?? [], "cached": value["cacheHit"] as? Bool ?? false]
        }
    }

    @objc func resolverInspect(_ call: CAPPluginCall) {
        guard let videoID = call.getString("videoId") else { call.reject("Missing track", "INVALID_VIDEO_ID"); return }
        resolve(call, payload: ["operation": "resolve", "videoId": videoID], transform: ResolverWorker.inspection)
    }

    @objc func catalog(_ call: CAPPluginCall) {
        guard let operation = call.getString("operation"), ["catalog-search", "detail", "search-snapshot", "releases", "artist-search"].contains(operation) else {
            call.reject("Invalid catalog operation", "INVALID_ARGUMENT"); return
        }
        var payload: [String: Any] = ["operation":operation]
        if operation != "search-snapshot" {
            guard let kind = call.getString("kind"), ["artist", "album"].contains(kind),
                  !["releases", "artist-search"].contains(operation) || kind == "artist" else { call.reject("Invalid catalog kind", "INVALID_ARGUMENT"); return }
            payload["kind"] = kind
        }
        if operation == "catalog-search" || operation == "search-snapshot" {
            guard let query = call.getString("query"), (3...200).contains(query.trimmingCharacters(in:.whitespacesAndNewlines).count) else {
                call.reject("Invalid catalog query", "INVALID_QUERY"); return
            }
            payload["query"] = query
        } else {
            guard let id = call.getString("id"), id.range(of:"\\A[A-Za-z0-9_-]{1,160}\\z",options:.regularExpression) != nil else {
                call.reject("Invalid catalog resource", "INVALID_RESOURCE"); return
            }
            payload["id"] = id
        }
        if operation == "releases" {
            guard let section = call.getString("section"), ["albums", "singles"].contains(section) else { call.reject("Invalid release section", "INVALID_ARGUMENT"); return }
            payload["section"] = section
        }
        if operation == "artist-search" {
            let query = call.getString("query") ?? ""
            guard query.count <= 200, let kind = call.getString("searchKind"), ["track", "album"].contains(kind) else { call.reject("Invalid artist search", "INVALID_ARGUMENT"); return }
            payload["query"] = query; payload["searchKind"] = kind
        }
        if call.getValue("refresh") != nil {
            guard let value = call.getValue("refresh") as? NSNumber, CFGetTypeID(value) == CFBooleanGetTypeID() else { call.reject("Invalid refresh flag", "INVALID_ARGUMENT"); return }
            payload["refresh"] = value.boolValue
        }
        #if DEBUG
        if NativeUIFixture.enabled {
            let request = payload
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                if (request["query"] as? String)?.lowercased().contains("offline") == true { call.reject("Synthetic offline check", "NETWORK_UNAVAILABLE") }
                else { call.resolve(NativeUIFixture.catalog(request)) }
            }
            return
        }
        #endif
        resolve(call, payload:payload)
    }

    @objc func cancelResolver(_ call: CAPPluginCall) {
        guard let identifier = call.getString("requestId") else { call.reject("Missing request", "INVALID_ARGUMENT"); return }
        call.resolve(["cancelled": ResolverWorker.shared.cancel(identifier)])
    }

    private func resolve(_ call: CAPPluginCall, payload: [String: Any], transform: @escaping ([String: Any]) -> [String: Any] = { $0 }) {
        ResolverWorker.shared.perform(payload, requestID: call.getString("requestId") ?? UUID().uuidString) { result in
            switch result {
            case let .success(value): call.resolve(transform(value))
            case let .failure(error): call.reject("Resolver operation could not complete", error.identifier)
            }
        }
    }

    private func languageState() -> [String: Any] {
        let stored = UserDefaults.standard.string(forKey: preferenceKey) ?? "system"
        return ["schema": 1, "preference": ["system", "en", "it"].contains(stored) ? stored : "system",
                "systemLanguages": Array(Locale.preferredLanguages.prefix(20)),
                "revision": UserDefaults.standard.integer(forKey: revisionKey)]
    }

    @objc func foundationStatus(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            #if targetEnvironment(simulator)
            let environment = "simulator"
            #else
            let environment = "device"
            #endif
            let bundle = Bundle.main
            let window = self.bridge?.viewController?.view.window
            var safeArea = window?.safeAreaInsets ?? self.bridge?.viewController?.view.safeAreaInsets ?? .zero
            if let window, window.bounds.height >= window.bounds.width {
                safeArea.top = max(safeArea.top, window.windowScene?.statusBarManager?.statusBarFrame.height ?? 0)
            }
            call.resolve([
                "platform": "ios", "phase": "IOS-5",
                "version": bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown",
                "build": bundle.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "unknown",
                "bundleId": bundle.bundleIdentifier ?? "unknown",
                "minimumOS": bundle.object(forInfoDictionaryKey: "MinimumOSVersion") as? String ?? "unknown",
                "systemVersion": UIDevice.current.systemVersion, "environment": environment,
                "textScale": UIFont.preferredFont(forTextStyle: .body).pointSize / 17.0,
                "safeArea": ["top": safeArea.top, "right": safeArea.right, "bottom": safeArea.bottom, "left": safeArea.left],
                "bundledAssets": bundle.url(forResource: "index", withExtension: "html", subdirectory: "public") != nil,
                "capabilities": ["resolver": bundle.url(forResource: "ios_resolver", withExtension: "py", subdirectory: "Resolver/app") != nil, "playback": true, "library": true, "lyrics": true, "sharing": false]
            ])
        }
    }

    @objc func foundationCheck(_ call: CAPPluginCall) {
        guard let nonce = call.getString("nonce"), (8...128).contains(nonce.utf8.count),
              nonce.unicodeScalars.allSatisfy({ CharacterSet.alphanumerics.contains($0) || $0 == "-" }) else {
            call.reject("Expected an alphanumeric nonce between 8 and 128 bytes", "INVALID_ARGUMENT")
            return
        }
        call.resolve(["platform": "ios", "nonce": nonce])
    }

    @objc func languageRead(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(self.languageState()) }
    }

    @objc func languageWrite(_ call: CAPPluginCall) {
        guard let preference = call.getString("preference"), ["system", "en", "it"].contains(preference) else {
            call.reject("This language is not available", "LANGUAGE_NOT_READY")
            return
        }
        DispatchQueue.main.async {
            let defaults = UserDefaults.standard
            if defaults.string(forKey: self.preferenceKey) != preference {
                defaults.set(preference, forKey: self.preferenceKey)
                defaults.set(defaults.integer(forKey: self.revisionKey) + 1, forKey: self.revisionKey)
            }
            let state = self.languageState()
            self.notifyListeners("language", data: state)
            call.resolve(state)
        }
    }
}
