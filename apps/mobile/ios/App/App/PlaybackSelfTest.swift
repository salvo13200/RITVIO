import Foundation
import AVFoundation

/// Native AVPlayer evidence from original generated tones and synthetic HTTP.
/// It is deliberately independent of provider access and is never live evidence.
enum PlaybackSelfTest {
    #if DEBUG
    static func startIfRequested() {
        guard ProcessInfo.processInfo.arguments.contains("--ritvio-playback-check") else { return }
        Task { @MainActor in await run() }
    }
    @MainActor private static func run() async {
        var report: [String: Any] = ["schema": 1, "phase": "IOS-3", "nativeAVPlayer": true, "syntheticTransport": true,
            "source": "original-generated-tone", "providerStreaming": "pending", "audibleOutput": "not-measured", "physicalTests": "pending"]
        var stage = "queue-policy"
        func progress(_ value: String) { stage = value; report["stage"] = stage; report["status"] = "running"; write(report) }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("ritvio-playback-check-\(UUID().uuidString)", isDirectory: true)
        var owner: NativePlaybackOwner?
        defer { owner?.shutdown(); FixtureMediaProtocol.reset(); try? FileManager.default.removeItem(at: directory) }
        do {
            progress(stage)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let tracks = (1...3).map { ["videoId": "ritviotest\($0)", "title": "Original tone \($0)", "artist": "RITVIO native check", "thumbnail": "", "duration": 12] as [String: Any] }
            let decoded = try tracks.map(PlaybackTrack.decode)
            var policy = PlaybackQueue(); try policy.replace(decoded, at: 1)
            policy.repeatMode = "one"
            try expect(policy.advance(automatic: true) && policy.index == 1, "REPEAT_ONE_FAILED")
            try expect(policy.advance(automatic: false) && policy.index == 2, "MANUAL_NEXT_FAILED")
            policy.repeatMode = "all"; try expect(policy.advance(automatic: true) && policy.index == 0, "REPEAT_ALL_FAILED")
            for _ in 0..<30 {
                policy.setShuffle(true); try expect(policy.order.first == policy.index && Set(policy.order).count == 3, "SHUFFLE_INVALID")
                policy.setShuffle(false)
            }
            try policy.move(from: 0, to: 2, expectedRevision: policy.revision)
            try expect(policy.current?.videoId == "ritviotest1" && policy.index == 2, "MOVE_CHANGED_CURRENT")
            do { try policy.move(from: 0, to: 1, expectedRevision: -1); throw ResolverFailure.code("STALE_MOVE_ACCEPTED") }
            catch let failure as ResolverFailure { if failure.identifier != "QUEUE_CHANGED" { throw failure } }
            _ = try policy.remove(0, expectedRevision: policy.revision)
            try expect(policy.current?.videoId == "ritviotest1" && policy.valid, "REMOVE_CHANGED_CURRENT")
            report["queuePolicy"] = ["repeatOne": true, "manualSkip": true, "repeatAll": true, "shufflePermutation": true, "reorderIdentity": true, "staleRevisionRejected": true]

            progress("original-aac")
            let audio = try await makeAudio(in: directory)
            FixtureMediaProtocol.configure(audio)
            var resolved: [[String: Any]] = [], cancelled = 0
            let stateURL = directory.appendingPathComponent("playback.json")
            owner = NativePlaybackOwner(storage: stateURL, protocols: [FixtureMediaProtocol.self], systemIntegration: false,
                resolver: { payload, _, callback in
                    resolved.append(payload)
                    DispatchQueue.main.asyncAfter(deadline: .now() + (resolved.count == 1 ? 0.25 : 0.05)) {
                        callback(.success(["url": "https://fixture.googlevideo.com/audio.m4a", "headers": ["User-Agent": "RITVIO-native-test"],
                            "expires": Date().timeIntervalSince1970 + 300, "container": "m4a", "codec": "mp4a.40.2", "protocol": "https", "duration": 12]))
                    }
                }, cancelResolve: { _ in cancelled += 1 })
            guard let player = owner else { throw ResolverFailure.code("OWNER_MISSING") }
            progress("rapid-track-change")
            _ = try player.playTracks(tracks, index: 0)
            _ = try player.command("next"); _ = try player.command("next")
            try await wait("RAPID_CHANGE_FAILED") { (player.snapshot()["index"] as? Int) == 2 && playing(player) && position(player) > 0.15 }
            try expect(resolved.count == 2 && cancelled >= 1, "SUPERSEDED_RESOLUTION_NOT_DISCARDED")
            try expect(AVAudioSession.sharedInstance().category == .playback, "AUDIO_SESSION_CATEGORY_FAILED")
            report["rapidChange"] = ["latestTrackWins": true, "supersededResolutionDiscarded": true, "cancelRequested": true]

            progress("seek-and-pause")
            _ = try player.command("pause"); _ = try player.command("seek", value: 5.5)
            try await wait("PAUSED_SEEK_FAILED") { !loading(player) && abs(position(player) - 5.5) < 0.25 && !playing(player) }
            _ = try player.command("play")
            try await wait("RESUME_FAILED") { playing(player) && position(player) > 5.7 }
            _ = try player.command("seek", value: 2.0); _ = try player.command("seek", value: 8.0); _ = try player.command("seek", value: 4.0)
            _ = try player.command("pause")
            try await wait("RAPID_SEEK_FAILED") { !loading(player) && abs(position(player) - 4) < 0.25 && !playing(player) }
            report["seeking"] = ["pausedSeek": true, "resume": true, "latestSeekWins": true, "pauseIntentPreserved": true]

            progress("interruptions-and-route")
            _ = try player.command("play"); try await wait("RESUME_FAILED") { playing(player) }
            player.interruption(began: true); _ = try player.command("pause"); player.interruption(began: false, shouldResume: true)
            try await Task.sleep(nanoseconds: 350_000_000)
            try expect(!playing(player), "INTERRUPTION_OVERRAN_PAUSE")
            _ = try player.command("play"); try await wait("RESUME_FAILED") { playing(player) }
            player.interruption(began: true); player.interruption(began: false, shouldResume: true)
            try await wait("INTERRUPTION_RESUME_FAILED") { playing(player) }
            player.routeLost(); try expect(!playing(player), "ROUTE_LOSS_FAILED")
            report["interruptionPolicy"] = ["syntheticEvents": true, "userPausePreserved": true, "recommendedResume": true, "routeLossPauses": true]

            progress("end-repeat")
            _ = try player.command("repeat", value: "one"); _ = try player.command("play"); _ = try player.command("seek", value: 11.7)
            try await wait("REPEAT_ONE_TRANSPORT_FAILED") { !loading(player) && position(player) < 2 && playing(player) }
            try expect(player.snapshot()["index"] as? Int == 2, "REPEAT_ONE_CHANGED_TRACK")
            _ = try player.command("repeat", value: "all"); _ = try player.command("seek", value: 11.7)
            try await wait("REPEAT_ALL_TRANSPORT_FAILED") { player.snapshot()["index"] as? Int == 0 && !loading(player) && playing(player) }
            _ = try player.command("repeat", value: "off"); _ = try player.command("jump", value: 2)
            try await wait("LAST_TRACK_NOT_READY") { !loading(player) && playing(player) }
            _ = try player.command("seek", value: 11.7)
            try await wait("END_FAILED") { player.snapshot()["status"] as? String == "ended" && !playing(player) }
            report["endPolicy"] = ["repeatOne": true, "repeatAll": true, "stopAtEnd": true]

            progress("expired-source-recovery")
            FixtureMediaProtocol.setMode("deny-once")
            let beforeRecovery = resolved.count
            _ = try player.playTracks(tracks, index: 1)
            _ = try player.command("seek", value: 3.5)
            try await wait("SOURCE_RECOVERY_FAILED") { !loading(player) && playing(player) && position(player) > 3.6 && position(player) < 6 }
            try expect(resolved.count == beforeRecovery + 2 && resolved.last?["refresh"] as? Bool == true, "SOURCE_REFRESH_NOT_BOUNDED")
            report["sourceRecovery"] = ["synthetic403": true, "oneRefresh": true, "positionRetained": true]

            progress("rate-limit")
            FixtureMediaProtocol.setMode("rate-limit")
            let beforeRateLimit = resolved.count
            _ = try player.playTracks(tracks, index: 0)
            try await wait("RATE_LIMIT_NOT_SURFACED") { player.snapshot()["error"] as? String == "RATE_LIMITED" }
            try await Task.sleep(nanoseconds: 1_300_000_000)
            try expect(resolved.count == beforeRateLimit + 1 && !playing(player), "RATE_LIMIT_RETRIED")
            report["rateLimit"] = ["synthetic429": true, "noAutomaticRetry": true]

            progress("persistence")
            FixtureMediaProtocol.setMode("normal")
            _ = try player.playTracks(tracks, index: 1)
            try await wait("PERSISTENCE_SOURCE_NOT_READY") { !loading(player) && playing(player) }
            _ = try player.command("pause"); _ = try player.command("seek", value: 3.0)
            try await wait("PERSISTENCE_SEEK_FAILED") { !loading(player) && abs(position(player) - 3) < 0.25 }
            player.flush(); player.shutdown(); owner = nil
            let stored = try String(contentsOf: stateURL, encoding: .utf8)
            try expect(!stored.contains("googlevideo") && !stored.contains("headers") && !stored.contains("expires"), "DESCRIPTOR_PERSISTED")
            let restored = NativePlaybackOwner(storage: stateURL, systemIntegration: false)
            defer { restored.shutdown() }
            try expect(restored.snapshot()["index"] as? Int == 1 && abs(position(restored) - 3) < 0.25 && !playing(restored) && !loading(restored), "RESTORE_FAILED")
            report["persistence"] = ["queueAndPosition": true, "pausedOnRestore": true, "noSignedDescriptors": true]
            report["transport"] = FixtureMediaProtocol.stats()
            try expect(FixtureMediaProtocol.stats()["allowedHeadersForwarded"] as? Bool == true && (FixtureMediaProtocol.stats()["largestRangeBytes"] as? Int ?? Int.max) <= PlaybackResourceLoader.chunkBytes, "TRANSPORT_BOUNDS_FAILED")
            report["audioSession"] = "playback-category-activated"
            report["status"] = "passed"
        } catch {
            report["status"] = "failed"; report["failedStage"] = stage
            report["error"] = (error as? ResolverFailure)?.identifier ?? "NATIVE_PLAYBACK_CHECK_FAILED"
            if let owner {
                let state = owner.snapshot()
                var lastState: [String: Any] = [:]
                for key in ["index", "position", "playing", "loading", "status", "error"] { lastState[key] = state[key] ?? NSNull() }
                report["lastState"] = lastState
            }
        }
        write(report)
    }
    private static func expect(_ value: Bool, _ code: String) throws { if !value { throw ResolverFailure.code(code) } }
    @MainActor private static func playing(_ owner: NativePlaybackOwner) -> Bool { owner.snapshot()["playing"] as? Bool == true }
    @MainActor private static func loading(_ owner: NativePlaybackOwner) -> Bool { owner.snapshot()["loading"] as? Bool == true }
    @MainActor private static func position(_ owner: NativePlaybackOwner) -> Double { owner.snapshot()["position"] as? Double ?? -1 }
    @MainActor private static func wait(_ code: String, timeout: Double = 25, _ predicate: () -> Bool) async throws {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if predicate() { return }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        throw ResolverFailure.code(code)
    }
    private static func makeAudio(in directory: URL) async throws -> Data {
        var wav = Data()
        func word<T: FixedWidthInteger>(_ number: T) { var value = number.littleEndian; withUnsafeBytes(of: &value) { wav.append(contentsOf: $0) } }
        let count = 22050 * 12
        wav.append(contentsOf: "RIFF".utf8); word(UInt32(36 + count * 2)); wav.append(contentsOf: "WAVEfmt ".utf8)
        word(UInt32(16)); word(UInt16(1)); word(UInt16(1)); word(UInt32(22050)); word(UInt32(44100)); word(UInt16(2)); word(UInt16(16))
        wav.append(contentsOf: "data".utf8); word(UInt32(count * 2))
        for index in 0..<count { word(Int16(sin(Double(index) * 2 * .pi * 440 / 22050) * 2000)) }
        let input = directory.appendingPathComponent("original-tone.wav"), output = directory.appendingPathComponent("original-tone.m4a")
        try wav.write(to: input)
        guard let exporter = AVAssetExportSession(asset: AVURLAsset(url: input), presetName: AVAssetExportPresetAppleM4A) else { throw ResolverFailure.code("FIXTURE_ENCODER_UNAVAILABLE") }
        exporter.outputURL = output; exporter.outputFileType = .m4a; exporter.shouldOptimizeForNetworkUse = true
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in exporter.exportAsynchronously { continuation.resume() } }
        guard exporter.status == .completed else { throw ResolverFailure.code("FIXTURE_ENCODING_FAILED") }
        return try Data(contentsOf: output)
    }
    private static func write(_ report: [String: Any]) {
        let file = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("playback-evidence.json")
        if let data = try? JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]) { try? data.write(to: file, options: .atomic) }
    }
    #endif
}

#if DEBUG
private final class FixtureMediaProtocol: URLProtocol {
    private static let lock = NSLock()
    private static var audio = Data()
    private static var mode = "normal"
    private static var requests = 0
    private static var largestRange = 0
    private static var headersValid = true
    static func configure(_ body: Data) { lock.lock(); audio = body; mode = "normal"; requests = 0; largestRange = 0; headersValid = true; lock.unlock() }
    static func reset() { configure(Data()) }
    static func setMode(_ value: String) { lock.lock(); mode = value; lock.unlock() }
    static func stats() -> [String: Any] { lock.lock(); defer { lock.unlock() }; return ["synthetic": true, "requests": requests, "largestRangeBytes": largestRange, "allowedHeadersForwarded": headersValid, "audioFileBytes": audio.count, "realTLS": false] }
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "fixture.googlevideo.com" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.lock.lock()
        let audio = Self.audio, mode = Self.mode
        if mode == "deny-once" { Self.mode = "normal" }
        Self.requests += 1
        Self.headersValid = Self.headersValid && request.value(forHTTPHeaderField: "User-Agent") == "RITVIO-native-test"
        Self.lock.unlock()
        guard let url = request.url else { return }
        if mode == "deny-once" || mode == "rate-limit" {
            client?.urlProtocol(self, didReceive: HTTPURLResponse(url: url, statusCode: mode == "rate-limit" ? 429 : 403, httpVersion: "HTTP/1.1", headerFields: [:])!, cacheStoragePolicy: .notAllowed)
            client?.urlProtocolDidFinishLoading(self); return
        }
        let pieces = (request.value(forHTTPHeaderField: "Range") ?? "").replacingOccurrences(of: "bytes=", with: "").split(separator: "-")
        guard pieces.count == 2, let start = Int(pieces[0]), let end = Int(pieces[1]), start >= 0, start < audio.count, end >= start else {
            client?.urlProtocol(self, didFailWithError: NSError(domain: "fixture", code: 416)); return
        }
        let last = min(end, audio.count - 1), body = audio.subdata(in: start..<(last + 1))
        Self.lock.lock(); Self.largestRange = max(Self.largestRange, body.count); Self.lock.unlock()
        let response = HTTPURLResponse(url: url, statusCode: 206, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "audio/mp4", "Content-Length": String(body.count), "Content-Range": "bytes \(start)-\(last)/\(audio.count)", "Accept-Ranges": "bytes"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body); client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
#endif
