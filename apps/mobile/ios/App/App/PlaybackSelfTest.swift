import Foundation
import AVFoundation
import UIKit

/// Native AVPlayer evidence from original generated tones and synthetic HTTP.
/// It is deliberately independent of provider access and is never live evidence.
enum PlaybackSelfTest {
    #if DEBUG
    private static let fixtureSeconds = 90
    static func startIfRequested() {
        guard ProcessInfo.processInfo.arguments.contains("--ritvio-playback-check") else { return }
        Task { @MainActor in await run() }
    }
    @MainActor private static func run() async {
        var report: [String: Any] = ["schema": 1, "phase": "IOS-5", "nativeAVPlayer": true, "syntheticTransport": true,
            "source": "original-generated-tone", "providerStreaming": "pending", "audibleOutput": "not-measured", "physicalTests": "pending"]
        var stage = "queue-policy"
        func progress(_ value: String) { stage = value; report["stage"] = stage; report["status"] = "running"; write(report) }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("ritvio-playback-check-\(UUID().uuidString)", isDirectory: true)
        var owner: NativePlaybackOwner?
        defer { owner?.shutdown(); FixtureMediaProtocol.reset(); try? FileManager.default.removeItem(at: directory) }
        do {
            progress("library"); report["library"] = try LibrarySelfTest.run()
            progress("queue")
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let tracks = (1...3).map { ["videoId": "ritviotest\($0)", "title": "Original tone \($0)", "artist": "RITVIO native check", "thumbnail": "", "duration": fixtureSeconds] as [String: Any] }
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
            var reordered = PlaybackQueue()
            try reordered.replace(decoded, at: 0)
            try reordered.move(from: 2, to: 1, expectedRevision: reordered.revision)
            try expect(reordered.order.map { reordered.items[$0].videoId } == ["ritviotest1", "ritviotest3", "ritviotest2"], "MOVE_PLAYBACK_ORDER_UNCHANGED")
            try expect(reordered.advance(automatic: false) && reordered.current?.videoId == "ritviotest3", "MOVE_NEXT_WRONG")
            try expect(reordered.previous() && reordered.current?.videoId == "ritviotest1", "MOVE_PREVIOUS_WRONG")
            reordered.shuffle = true; reordered.order = [0, 2, 1]
            let from = reordered.order[2], to = reordered.order[1]
            let expected = [reordered.items[0].videoId, reordered.items[from].videoId, reordered.items[to].videoId]
            try reordered.move(from: from, to: to, expectedRevision: reordered.revision)
            try expect(reordered.valid && reordered.order.map { reordered.items[$0].videoId } == expected, "SHUFFLED_MOVE_ORDER_WRONG")
            var admission = PlaybackQueue(); try admission.replace(decoded, at: 0)
            let beforeAdvance = admission.revision
            _ = admission.advance(automatic: false)
            do { try admission.move(from: 2, to: 1, expectedRevision: beforeAdvance); throw ResolverFailure.code("ADVANCED_QUEUE_EDIT_ACCEPTED") }
            catch let failure as ResolverFailure { if failure.identifier != "QUEUE_CHANGED" { throw failure } }
            do { _ = try admission.remove(1, expectedRevision: beforeAdvance); throw ResolverFailure.code("ADVANCED_QUEUE_REMOVE_ACCEPTED") }
            catch let failure as ResolverFailure { if failure.identifier != "QUEUE_CHANGED" { throw failure } }
            report["queuePolicy"] = ["repeatOne": true, "manualSkip": true, "repeatAll": true, "shufflePermutation": true, "reorderIdentity": true, "staleRevisionRejected": true, "currentChangeInvalidatesEdits": true]

            progress("sleep-policy")
            var timerPolicy = PlaybackSleepTimer()
            try timerPolicy.configure(mode: "duration", minutes: 15, now: 100)
            try expect(timerPolicy.snapshot(now: 999)["remaining"] as? Int == 1, "TIMER_ELAPSED_INTERVAL_FAILED")
            try expect(!timerPolicy.consumeExpiry(now: 999) && timerPolicy.consumeExpiry(now: 1000) && !timerPolicy.consumeExpiry(now: 1001), "TIMER_EXPIRY_NOT_SINGLE_USE")
            try timerPolicy.configure(mode: "track-end", minutes: nil, now: 1002)
            try expect(timerPolicy.consumeBoundary(now: 1002) && !timerPolicy.consumeBoundary(now: 1002), "TIMER_BOUNDARY_NOT_SINGLE_USE")
            for minutes in [0, 14, 16, 120] {
                do { try timerPolicy.configure(mode: "duration", minutes: minutes, now: 1003); throw ResolverFailure.code("INVALID_TIMER_ACCEPTED") }
                catch let failure as ResolverFailure { if failure.identifier != "INVALID_TIMER" { throw failure } }
            }
            report["sleepPolicy"] = ["singleExpiry":true,"singleBoundary":true,"invalidPresetsRejected":true,"clock":"injected-continuous-time"]
            var pendingNow = 200.0, pendingCancelled = 0
            var lateReply: ((Result<[String:Any],ResolverFailure>)->Void)?
            let pendingTimerOwner = NativePlaybackOwner(storage:directory.appendingPathComponent("pending-timer.json"),systemIntegration:false,
                sleepClock:{pendingNow},scheduleSleepTicks:false,resolver:{_,_,reply in lateReply=reply},cancelResolve:{_ in pendingCancelled += 1})
            _ = try pendingTimerOwner.playTracks(tracks,index:0)
            _ = try pendingTimerOwner.configureSleepTimer(mode:"duration",minutes:15,revision:0)
            pendingNow += 901;pendingTimerOwner.refreshSleepTimer()
            lateReply?(.failure(.code("CANCELLED")))
            try await Task.sleep(nanoseconds:50_000_000)
            try expect(pendingCancelled == 1 && !playing(pendingTimerOwner) && !loading(pendingTimerOwner) && pendingTimerOwner.snapshot()["error"] is NSNull, "LATE_RESOLVE_OVERRAN_TIMER")
            pendingTimerOwner.shutdown()
            report["sleepPolicyPendingResolve"] = ["cancelled":true,"lateFailureIgnored":true]
            progress("original-aac")
            let audio = try await makeAudio(in: directory)
            FixtureMediaProtocol.configure(audio)
            progress("discovery");report["discovery"] = try await discoveryChecks(in:directory,tracks:tracks)
            var timerNow = 100.0
            var resolved: [[String: Any]] = [], cancelled = 0
            let stateURL = directory.appendingPathComponent("playback.json")
            owner = NativePlaybackOwner(storage: stateURL, protocols: [FixtureMediaProtocol.self], systemIntegration: false,
                sleepClock: { timerNow }, scheduleSleepTicks: false,
                resolver: { payload, _, callback in
                    resolved.append(payload)
                    DispatchQueue.main.asyncAfter(deadline: .now() + (resolved.count == 1 ? 0.25 : 0.05)) {
                        callback(.success(["url": "https://fixture.googlevideo.com/audio.m4a", "headers": ["User-Agent": "RITVIO-native-test"],
                            "expires": Date().timeIntervalSince1970 + 300, "container": "m4a", "codec": "mp4a.40.2", "protocol": "https", "duration": fixtureSeconds]))
                    }
                }, cancelResolve: { _ in cancelled += 1 })
            guard let player = owner else { throw ResolverFailure.code("OWNER_MISSING") }
            progress("rapid-track-change")
            _ = try player.playTracks(tracks, index: 0)
            _ = try player.command("next"); _ = try player.command("next")
            try await wait("RAPID_CHANGE_FAILED") { (player.snapshot()["index"] as? Int) == 2 && playing(player) && position(player) > 0.15 }
            try expect(resolved.count == 2 && cancelled >= 1, "SUPERSEDED_RESOLUTION_NOT_DISCARDED")
            try expect(AVAudioSession.sharedInstance().category == .playback, "AUDIO_SESSION_CATEGORY_FAILED")
            let timing = player.diagnosticTiming()
            guard let nativeSeconds = timing["itemSeconds"] as? Double, let assetSeconds = timing["assetSeconds"] as? Double else { throw ResolverFailure.code("NATIVE_DURATION_MISSING") }
            try expect(abs(nativeSeconds - Double(fixtureSeconds)) < 0.15 && abs(assetSeconds - nativeSeconds) < 0.15, "NATIVE_DURATION_INCORRECT")
            report["duration"] = timing
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

            progress("sleep-transport")
            _ = try player.configureSleepTimer(mode: "duration", minutes: 15, revision: player.timerSnapshot()["revision"] as! Int)
            timerNow += 899; player.refreshSleepTimer()
            try expect(player.timerSnapshot()["remaining"] as? Int == 1 && !playing(player), "PAUSE_FROZE_TIMER")
            _ = try player.command("play"); try await wait("TIMER_RESUME_SETUP_FAILED") { playing(player) }
            timerNow += 2; player.refreshSleepTimer()
            try expect(!playing(player) && player.timerSnapshot()["reason"] as? String == "expired", "TIMER_DID_NOT_PAUSE")
            player.interruption(began:false,shouldResume:true)
            try expect(!playing(player), "TIMER_INTERRUPTION_RESUMED")
            _ = try player.configureSleepTimer(mode:"track-end",minutes:nil,revision:player.timerSnapshot()["revision"] as! Int)
            _ = try player.command("repeat",value:"one"); _ = try player.command("play")
            _ = try player.command("seek",value:Double(fixtureSeconds)-0.3)
            try await wait("TIMER_DID_NOT_OVERRIDE_REPEAT") { player.timerSnapshot()["reason"] as? String == "expired" && !playing(player) }
            _ = try player.command("play"); try await wait("TIMER_EXPLICIT_RESTART_FAILED") { playing(player) }
            _ = try player.configureSleepTimer(mode:"track-end",minutes:nil,revision:player.timerSnapshot()["revision"] as! Int)
            let beforeTimerSkip = player.snapshot()["index"] as? Int
            _ = try player.command("next")
            try expect(!playing(player) && player.snapshot()["index"] as? Int == beforeTimerSkip, "TIMER_MANUAL_BOUNDARY_FAILED")
            let staleTimer = player.timerSnapshot()["revision"] as! Int
            _ = try player.configureSleepTimer(mode:"duration",minutes:60,revision:staleTimer)
            do { _ = try player.configureSleepTimer(mode:"off",minutes:nil,revision:staleTimer); throw ResolverFailure.code("STALE_TIMER_ACCEPTED") }
            catch let failure as ResolverFailure { if failure.identifier != "TIMER_CHANGED" { throw failure } }
            _ = try player.configureSleepTimer(mode:"off",minutes:nil,revision:player.timerSnapshot()["revision"] as! Int)
            try expect(!playing(player) && player.timerSnapshot()["reason"] as? String == "cancelled", "TIMER_CANCEL_CHANGED_PLAYBACK")
            _ = try player.command("repeat",value:"off")
            report["sleepTransport"] = ["elapsedDuringPause":true,"expiryPauses":true,"interruptionCannotResume":true,"overridesRepeat":true,"manualBoundary":true,"explicitRestart":true,"staleMutationRejected":true,"cancelDoesNotPlay":true]

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
            _ = try player.command("repeat", value: "one"); _ = try player.command("play"); _ = try player.command("seek", value: Double(fixtureSeconds) - 0.3)
            try await wait("REPEAT_ONE_TRANSPORT_FAILED") { !loading(player) && position(player) < 2 && playing(player) }
            try expect(player.snapshot()["index"] as? Int == 2, "REPEAT_ONE_CHANGED_TRACK")
            _ = try player.command("repeat", value: "all"); _ = try player.command("seek", value: Double(fixtureSeconds) - 0.3)
            try await wait("REPEAT_ALL_TRANSPORT_FAILED") { player.snapshot()["index"] as? Int == 0 && !loading(player) && playing(player) }
            _ = try player.command("repeat", value: "off"); _ = try player.command("jump", value: 2)
            try await wait("LAST_TRACK_NOT_READY") { !loading(player) && playing(player) }
            _ = try player.command("seek", value: Double(fixtureSeconds) - 0.3)
            try await wait("END_FAILED") { player.snapshot()["status"] as? String == "ended" && !playing(player) }
            _ = try player.command("play")
            try await wait("RESTART_AFTER_END_FAILED") { !loading(player) && playing(player) && position(player) > 0.15 && position(player) < 3 }
            report["endPolicy"] = ["repeatOne": true, "repeatAll": true, "stopAtEnd": true, "restartAfterEnd": true]

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
            try expect(audio.count > PlaybackResourceLoader.chunkBytes && (FixtureMediaProtocol.stats()["nonzeroRanges"] as? Int ?? 0) > 0, "MULTI_RANGE_NOT_EXERCISED")
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
    @MainActor private static func discoveryChecks(in directory:URL,tracks:[[String:Any]]) async throws -> [String:Any] {
        let decoded=try tracks.map(PlaybackTrack.decode)
        var duplicate=tracks[1];duplicate["videoId"]="abcdefghijk"
        let candidates=[decoded[0],decoded[1],try PlaybackTrack.decode(duplicate),decoded[2]]
        let selected=PlaybackDiscovery.select(candidates,excluding:[decoded[0]],seen:[],limit:20)
        try expect(selected.map(\.videoId) == [decoded[1].videoId,decoded[2].videoId],"RADIO_EDITION_DEDUP_FAILED")
        try expect(PlaybackDiscovery.moved([2],count:3,from:2,to:1) == Set([1]),"AUTOMATIC_MOVE_IDENTITY_LOST")
        try expect(PlaybackDiscovery.removed([1,2],index:1) == Set([1]),"AUTOMATIC_REMOVE_IDENTITY_LOST")
        var legacyQueue=PlaybackQueue();try legacyQueue.replace(decoded,at:0)
        let saved=PlaybackSavedState(schema:1,queue:legacyQueue,position:0,volume:1)
        var legacy=try JSONSerialization.jsonObject(with:JSONEncoder().encode(saved)) as! [String:Any]
        legacy.removeValue(forKey:"automatic");legacy.removeValue(forKey:"radioOrigin")
        let old=try JSONDecoder().decode(PlaybackSavedState.self,from:JSONSerialization.data(withJSONObject:legacy))
        try expect(old.valid && old.automatic == nil,"LEGACY_AUTOMATIC_MIGRATION_FAILED")
        var now=100.0,calls=0
        var reply:((Result<[String:Any],ResolverFailure>)->Void)?
        let owner=NativePlaybackOwner(storage:directory.appendingPathComponent("discovery.json"),protocols:[FixtureMediaProtocol.self],systemIntegration:false,
            sleepClock:{now},scheduleSleepTicks:false,suggest:{_,_,callback in calls += 1;reply=callback},
            resolver:{_,_,callback in callback(.success(["url":"https://fixture.googlevideo.com/audio.m4a","headers":["User-Agent":"RITVIO-native-test"],
                "expires":Date().timeIntervalSince1970+300,"container":"m4a","codec":"mp4a.40.2","protocol":"https","duration":fixtureSeconds]))},cancelResolve:{_ in})
        defer { owner.shutdown() }
        _ = try owner.playTracks(tracks,index:0);try await wait("DISCOVERY_PLAYER_SETUP_FAILED"){playing(owner) && !loading(owner)}
        let seed=decoded[0],payload:[String:Any]=["videoId":seed.videoId,"items":decoded.map(\.json)]
        let before=owner.snapshot()["queueRevision"] as! Int
        _ = try owner.discoveryCommand("radio",seed:seed,requestID:"radio-test-one")
        _ = try owner.command("pause");reply?(.success(payload));try await Task.sleep(nanoseconds:50_000_000)
        try expect(owner.snapshot()["queueRevision"] as? Int == before && !playing(owner),"LATE_RADIO_OVERRAN_PAUSE")
        _ = try owner.discoveryCommand("radio",seed:seed,requestID:"radio-test-two");reply?(.success(payload))
        try await wait("RADIO_DID_NOT_COMMIT"){owner.discoverySnapshot()["status"] as? String == "ready" && playing(owner)}
        try expect(owner.snapshot()["automatic"] as? [Int] == [1,2],"RADIO_ORIGINS_MISSING")
        _ = try owner.enqueue(tracks[0],next:true)
        _ = try owner.discoveryCommand("enabled",enabled:false)
        let retained=owner.snapshot()["items"] as! [[String:Any]]
        try expect(retained.count == 2 && retained.allSatisfy{$0["videoId"] as? String == seed.videoId} && playing(owner),"AUTOPLAY_OFF_REMOVED_MANUAL_OR_CURRENT")
        _ = try owner.discoveryCommand("enabled",enabled:true);now += 5
        try await wait("AUTOPLAY_NOT_REQUESTED"){owner.discoverySnapshot()["mode"] as? String == "autoplay"}
        do {_ = try owner.discoveryCommand("retry");throw ResolverFailure.code("DISCOVERY_CONCURRENT_RETRY_ACCEPTED")}
        catch let failure as ResolverFailure {if failure.identifier != "DISCOVERY_BUSY" {throw failure}}
        let oldReply=reply,beforeRepeat=owner.snapshot()["queueRevision"] as! Int
        _ = try owner.command("repeat",value:"one");oldReply?(.success(payload));try await Task.sleep(nanoseconds:50_000_000)
        try expect(owner.snapshot()["queueRevision"] as? Int == beforeRepeat+1 && owner.discoverySnapshot()["suspended"] as? String == "repeat","LATE_AUTOPLAY_OVERRAN_REPEAT")
        _ = try owner.command("repeat",value:"off")
        _ = try owner.configureSleepTimer(mode:"duration",minutes:15,revision:owner.timerSnapshot()["revision"] as! Int)
        let blockedCalls=calls;now += 5;try await Task.sleep(nanoseconds:350_000_000)
        try expect(calls == blockedCalls && owner.discoverySnapshot()["suspended"] as? String == "timer","TIMER_DID_NOT_SUSPEND_AUTOPLAY")
        _ = try owner.configureSleepTimer(mode:"off",minutes:nil,revision:owner.timerSnapshot()["revision"] as! Int);now += 5
        try await wait("AUTOPLAY_AFTER_TIMER_NOT_REQUESTED"){owner.discoverySnapshot()["mode"] as? String == "autoplay"}
        reply?(.failure(.code("RATE_LIMITED")))
        try await wait("DISCOVERY_COOLDOWN_NOT_SET"){owner.discoverySnapshot()["status"] as? String == "error"}
        do {_ = try owner.discoveryCommand("retry");throw ResolverFailure.code("DISCOVERY_COOLDOWN_BYPASSED")}
        catch let failure as ResolverFailure {if failure.identifier != "RATE_LIMITED" {throw failure}}
        try expect(playing(owner),"SUGGESTIONS_ERROR_STOPPED_AUDIO")
        return ["editionDedup":true,"occurrenceIdentity":true,"legacyState":true,"lateRadioDiscarded":true,"disableProtectsManual":true,"timerRepeatSuspend":true,"cooldown":true]
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
    static func makeAudio(in directory: URL) async throws -> Data {
        var wav = Data()
        func word<T: FixedWidthInteger>(_ number: T) { var value = number.littleEndian; withUnsafeBytes(of: &value) { wav.append(contentsOf: $0) } }
        let count = 22050 * fixtureSeconds
        wav.append(contentsOf: "RIFF".utf8); word(UInt32(36 + count * 2)); wav.append(contentsOf: "WAVEfmt ".utf8)
        word(UInt32(16)); word(UInt16(1)); word(UInt16(1)); word(UInt32(22050)); word(UInt32(44100)); word(UInt16(2)); word(UInt16(16))
        wav.append(contentsOf: "data".utf8); word(UInt32(count * 2))
        let angularStep: Double = 2.0 * Double.pi * 440.0 / 22050.0
        // Fill PCM in one allocation: per-sample Data.append is expensive in
        // unoptimised simulator builds and can delay the UI fixture's queue.
        var pcm = Data(count: count * MemoryLayout<Int16>.size)
        pcm.withUnsafeMutableBytes { (raw: UnsafeMutableRawBufferPointer) in
            let samples = raw.bindMemory(to: Int16.self)
            for index in 0..<count {
                samples[index] = Int16(sin(Double(index) * angularStep) * 2000.0).littleEndian
            }
        }
        wav.append(pcm)
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
final class FixtureMediaProtocol: URLProtocol {
    private static let lock = NSLock()
    private static var audio = Data()
    private static var mode = "normal"
    private static var requests = 0
    private static var largestRange = 0
    private static var nonzeroRanges = 0
    private static var headersValid = true
    static func configure(_ body: Data) { lock.lock(); audio = body; mode = "normal"; requests = 0; largestRange = 0; nonzeroRanges = 0; headersValid = true; lock.unlock() }
    static func reset() { configure(Data()) }
    static func setMode(_ value: String) { lock.lock(); mode = value; lock.unlock() }
    static func stats() -> [String: Any] { lock.lock(); defer { lock.unlock() }; return ["synthetic": true, "requests": requests, "largestRangeBytes": largestRange, "nonzeroRanges": nonzeroRanges, "allowedHeadersForwarded": headersValid, "audioFileBytes": audio.count, "realTLS": false] }
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
        Self.lock.lock(); Self.largestRange = max(Self.largestRange, body.count); if start > 0 { Self.nonzeroRanges += 1 }; Self.lock.unlock()
        let response = HTTPURLResponse(url: url, statusCode: 206, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "audio/mp4", "Content-Length": String(body.count), "Content-Range": "bytes \(start)-\(last)/\(audio.count)", "Accept-Ranges": "bytes"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body); client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

/// Only a Debug build with this explicit launch argument can enter the UI fixture.
/// Playback still goes through the real owner, AVPlayer and bounded range loader.
/// The tone and geometric covers are original diagnostics, never catalog evidence.
enum NativeUIFixture {
    static var enabled: Bool { ProcessInfo.processInfo.arguments.contains("--ritvio-ui-check") }
    private static var preparing = false
    private(set) static var preparationStage = "not-started"
    static let tracks: [[String: Any]] = [
        ["videoId": "ritviotest1", "title": "After the rain", "artist": "Luna Vale", "thumbnail": "", "duration": 90, "artists": [["id":"fixture-artist", "name":"Luna Vale"]], "album": ["id": "fixture-album", "name": "Night scenes"]],
        ["videoId": "ritviotest2", "title": "Slow motion", "artist": "North Avenue", "thumbnail": "", "duration": 90],
        ["videoId": "ritviotest3", "title": "Golden hour", "artist": "June Atlas", "thumbnail": "", "duration": 90],
        ["videoId": "ritviotest4", "title": "Night swim", "artist": "Luna Vale", "thumbnail": "", "duration": 90],
        ["videoId": "ritviotest5", "title": "A very long song title for checking readable overflow on an iPhone", "artist": "A collaborative artist name that also needs room", "thumbnail": "", "duration": 90]
    ]
    static func makeOwner() -> NativePlaybackOwner {
        let storage = FileManager.default.temporaryDirectory.appendingPathComponent("ui-fixture-\(UUID().uuidString).json")
        return NativePlaybackOwner(storage: storage, protocols: [FixtureMediaProtocol.self], systemIntegration: false,
            resolver: { _, _, callback in
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                    callback(.success(["url": "https://fixture.googlevideo.com/audio.m4a", "headers": ["User-Agent": "RITVIO-native-test"], "expires": Date().timeIntervalSince1970 + 300, "container": "m4a", "codec": "mp4a.40.2", "protocol": "https", "duration": 90]))
                }
            }, cancelResolve: { _ in })
    }
    static func seedLibrary(_ store: NativeLibraryStore) throws {
        for track in tracks.prefix(3) { _ = try store.command(["type":"like", "liked":true, "track":track]) }
        for (name,count,offset) in [("Somewhere quiet",9,3),("After hours",24,2),("Slow mornings",12,1),("Night drive",18,0)] {
            let items = (0..<count).map { tracks[($0 + offset) % tracks.count] }
            _ = try store.command(["type":"createFromTracks", "name":name, "items":items])
        }
    }
    static func prepareIfRequested() {
        guard enabled, !preparing else { return }; preparing = true; preparationStage = "generating-media"
        Task { @MainActor in
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent("ui-media-\(UUID().uuidString)", isDirectory: true)
            defer { try? FileManager.default.removeItem(at: directory) }
            do {
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                FixtureMediaProtocol.configure(try await PlaybackSelfTest.makeAudio(in: directory))
                preparationStage = "seeding-queue"
                if !ProcessInfo.processInfo.arguments.contains("--ritvio-ui-empty") {
                    let player = NativePlaybackOwner.shared
                    _ = try player.playTracks(tracks, index: 0)
                    _ = try player.command("pause"); _ = try player.command("seek", value: 24)
                }
                preparationStage = "ready"
            } catch { preparationStage = "failed"; assertionFailure("Original UI media fixture could not be prepared") }
        }
    }
    private static let covers: [String] = (0..<5).map { index in
        let palette: [(CGFloat, CGFloat, CGFloat)] = [(0.27,0.20,0.49),(0.12,0.29,0.38),(0.57,0.28,0.21),(0.19,0.25,0.43),(0.36,0.22,0.41)]
        let color = palette[index]
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 512, height: 512))
        let data = renderer.pngData { context in
            UIColor(red: color.0, green: color.1, blue: color.2, alpha: 1).setFill(); context.fill(CGRect(x: 0, y: 0, width: 512, height: 512))
            UIColor(red: 0.81, green: 0.68, blue: 0.94, alpha: 0.8).setFill()
            context.cgContext.fillEllipse(in: CGRect(x: 292, y: 74, width: 126, height: 126))
            for column in 0..<9 {
                UIColor(red: 0.08, green: 0.08, blue: 0.15, alpha: 0.82).setFill()
                let height = 100 + (column * 67 + index * 31) % 180
                context.fill(CGRect(x: CGFloat(column * 64 - 10), y: CGFloat(512 - height), width: 58, height: CGFloat(height)))
            }
        }
        return "data:image/png;base64," + data.base64EncodedString()
    }
    static func present(_ state: [String: Any]) -> [String: Any] {
        var result = state
        if let items = state["items"] as? [[String: Any]] {
            result["items"] = items.map { track in
                var item = track
                let number = Int(String((track["videoId"] as? String ?? "1").suffix(1))) ?? 1
                item["thumbnail"] = covers[max(0, min(4, number - 1))]
                return item
            }
        }
        return result
    }
    static func playbackTrack(_ track: [String: Any]) -> [String: Any] {
        var result = track
        if tracks.contains(where: { $0["videoId"] as? String == track["videoId"] as? String }) { result["thumbnail"] = "" }
        return result
    }
    static func catalog(_ input: [String: Any]) -> [String: Any] {
        let person: [String:Any] = ["id":"fixture-artist", "name":"Luna Vale"]
        let artist: [String:Any] = ["id":"fixture-artist", "name":"Luna Vale", "kind":"artist", "artwork":covers[3]]
        let album: [String:Any] = ["id":"fixture-album", "name":"Night scenes", "kind":"album", "artists":[person], "year":"2025", "artwork":covers[0]]
        let songs = present(["items":tracks])["items"] as? [[String:Any]] ?? []
        let operation = input["operation"] as? String ?? ""
        if operation == "search-snapshot" {
            let empty = (input["query"] as? String)?.lowercased().contains("empty") == true
            return ["items":empty ? [] : songs, "candidates":empty ? [] : [artist], "albums":empty ? [] : [album], "cached":false, "truncated":false]
        }
        if operation == "artist-search" { return ["items":songs, "kind":"track", "artistId":input["id"] ?? "", "truncated":false] }
        if operation == "releases" { return ["items":[album], "artistId":input["id"] ?? "", "truncated":false] }
        if input["kind"] as? String == "artist" {
            return artist.merging(["id":input["id"] ?? "", "description":"", "tracks":songs, "albums":[album], "singles":[], "moreAlbums":true, "moreSingles":false]) { _, new in new }
        }
        let entries: [[String:Any]] = [
            ["number":1, "title":"After the rain", "duration":90, "track":songs[0]],
            ["number":2, "title":"Unavailable interlude", "duration":0, "track":NSNull()],
            ["number":3, "title":"Slow motion", "duration":90, "track":songs[1]],
            ["number":4, "title":"After the rain", "duration":90, "track":songs[0]],
            ["number":5, "title":"Golden hour", "duration":90, "track":songs[2]]
        ]
        return album.merging(["id":input["id"] ?? "", "description":"", "entries":entries, "reportedCount":5, "incomplete":false]) { _, new in new }
    }
}
#endif
