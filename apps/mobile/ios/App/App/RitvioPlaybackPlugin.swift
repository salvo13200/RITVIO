import Foundation
import UIKit
import Capacitor

/// IOS-1 exposes native readiness and language persistence. Listening methods
/// remain unimplemented and must not be presented as available by the client.
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
        CAPPluginMethod(name: "resolverInspect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelResolver", returnType: CAPPluginReturnPromise)
    ]
    private let preferenceKey = "ritvio.language.preference"
    private let revisionKey = "ritvio.language.revision"

    @objc func resolverStatus(_ call: CAPPluginCall) { resolve(call, payload: ["operation": "status"]) }

    @objc func search(_ call: CAPPluginCall) {
        guard let query = call.getString("query"), (3...200).contains(query.trimmingCharacters(in: .whitespacesAndNewlines).count) else { call.reject("Enter between 3 and 200 characters", "INVALID_QUERY"); return }
        resolve(call, payload: ["operation": "search", "query": query]) { value in
            ["items": value["items"] ?? [], "cached": value["cacheHit"] as? Bool ?? false]
        }
    }

    @objc func resolverInspect(_ call: CAPPluginCall) {
        guard let videoID = call.getString("videoId") else { call.reject("Missing track", "INVALID_VIDEO_ID"); return }
        resolve(call, payload: ["operation": "resolve", "videoId": videoID], transform: ResolverWorker.inspection)
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
            call.resolve([
                "platform": "ios", "phase": "IOS-2",
                "version": bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown",
                "build": bundle.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "unknown",
                "bundleId": bundle.bundleIdentifier ?? "unknown",
                "minimumOS": bundle.object(forInfoDictionaryKey: "MinimumOSVersion") as? String ?? "unknown",
                "systemVersion": UIDevice.current.systemVersion, "environment": environment,
                "bundledAssets": bundle.url(forResource: "index", withExtension: "html", subdirectory: "public") != nil,
                "capabilities": ["resolver": bundle.url(forResource: "ios_resolver", withExtension: "py", subdirectory: "Resolver/app") != nil, "playback": false, "library": false, "lyrics": false, "sharing": false]
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
