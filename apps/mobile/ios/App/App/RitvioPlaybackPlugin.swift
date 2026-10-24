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
        CAPPluginMethod(name: "languageWrite", returnType: CAPPluginReturnPromise)
    ]
    private let preferenceKey = "ritvio.language.preference"
    private let revisionKey = "ritvio.language.revision"

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
                "platform": "ios", "phase": "IOS-1",
                "version": bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown",
                "build": bundle.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "unknown",
                "bundleId": bundle.bundleIdentifier ?? "unknown",
                "minimumOS": bundle.object(forInfoDictionaryKey: "MinimumOSVersion") as? String ?? "unknown",
                "systemVersion": UIDevice.current.systemVersion, "environment": environment,
                "bundledAssets": bundle.url(forResource: "index", withExtension: "html", subdirectory: "public") != nil,
                "capabilities": ["resolver": false, "playback": false, "library": false, "lyrics": false, "sharing": false]
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
