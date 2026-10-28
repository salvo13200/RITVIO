import Foundation
import AVFoundation
import MediaPlayer
import UIKit

/// Main-thread owner of transport, intent, queue and system controls. UI is a client.
final class NativePlaybackOwner {
    static let shared: NativePlaybackOwner = {
        #if DEBUG
        if NativeUIFixture.enabled { return NativeUIFixture.makeOwner() }
        #endif
        return NativePlaybackOwner()
    }()
    typealias Resolve = ([String: Any], String, @escaping (Result<[String: Any], ResolverFailure>) -> Void) -> Void
    var onSnapshot: (([String: Any]) -> Void)?
    var onSleepTimer: (([String: Any]) -> Void)?
    private var sleepTimer = PlaybackSleepTimer()
    private var sleepTick: DispatchSourceTimer?
    private let sleepClock: () -> TimeInterval
    private let scheduleSleepTicks: Bool
    var onTrackStarted: ((PlaybackTrack) -> Void)?
    private var rememberedGeneration = -1
    private let player = AVPlayer()
    private var queue = PlaybackQueue()
    private var loader: PlaybackResourceLoader?
    private var observations: [NSKeyValueObservation] = []
    private var itemObservation: NSKeyValueObservation?
    private var endedObserver: NSObjectProtocol?
    private var notifications: [NSObjectProtocol] = []
    private var timeObserver: Any?
    private var generation = 0
    private var seekGeneration = 0
    private var pendingSeek: Double?
    private var seeking = false
    private var wantsPlayback = false
    private var interrupted = false
    private var ended = false
    private var resolving = false
    private var errorCode: String?
    private var savedPosition = 0.0
    private var recoveryAttempts = 0
    private var recovering = false
    private var watchdog: DispatchWorkItem?
    private var retryWork: DispatchWorkItem?
    private var pendingResolution: (generation: Int, position: Double, refresh: Bool, deadline: Date)?
    private var activeResolution: String?
    private let resolver: Resolve
    private let cancelResolve: (String) -> Void
    private let protocols: [AnyClass]?
    private let storage: URL
    private var lastSave = Date.distantPast
    private var sequence = 0
    private let sessionID = Int(Date().timeIntervalSince1970 * 1000)
    private let systemIntegration: Bool

    init(storage: URL? = nil, protocols: [AnyClass]? = nil, systemIntegration: Bool = true,
         sleepClock: @escaping () -> TimeInterval = PlaybackTimerClock.now, scheduleSleepTicks: Bool = true,
         resolver: @escaping Resolve = { payload, id, callback in ResolverWorker.shared.perform(payload, requestID: id, budget: 60000, completion: callback) },
         cancelResolve: @escaping (String) -> Void = { _ = ResolverWorker.shared.cancel($0) }) {
        self.sleepClock = sleepClock; self.scheduleSleepTicks = scheduleSleepTicks
        self.resolver = resolver; self.cancelResolve = cancelResolve; self.protocols = protocols; self.systemIntegration = systemIntegration
        self.storage = storage ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("RITVIO/playback-v1.json")
        restore()
        player.automaticallyWaitsToMinimizeStalling = true
        observations.append(player.observe(\.timeControlStatus, options: [.new]) { [weak self] _, _ in DispatchQueue.main.async {
            guard let self else { return }
            if self.player.timeControlStatus == .waitingToPlayAtSpecifiedRate && self.wantsPlayback { self.armWatchdog() }
            else if !self.resolving { self.watchdog?.cancel() }
            if self.player.timeControlStatus == .playing, self.rememberedGeneration != self.generation, let track = self.queue.current {
                self.rememberedGeneration = self.generation; self.onTrackStarted?(track)
            }
            self.emit()
        } })
        timeObserver = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.25, preferredTimescale: 600), queue: .main) { [weak self] _ in
            guard let self else { return }; self.emit()
            if self.player.rate > 0 && Date().timeIntervalSince(self.lastSave) >= 5 { self.persist() }
        }
        if systemIntegration { installSystemIntegration() }
    }

    private var position: Double {
        if let pendingSeek { return pendingSeek }
        let current = player.currentTime().seconds
        return player.currentItem != nil && current.isFinite ? max(0, current) : savedPosition
    }
    private var duration: Double {
        let current = player.currentItem?.duration.seconds ?? .nan
        return current.isFinite && current > 0 ? current : queue.current?.duration ?? 0
    }
    func snapshot() -> [String: Any] {
        precondition(Thread.isMainThread)
        _ = checkSleepExpiry()
        let ranges = player.currentItem?.loadedTimeRanges.compactMap { $0.timeRangeValue } ?? []
        let currentPosition = position
        let buffered = ranges.filter { $0.start.seconds <= currentPosition && CMTimeRangeGetEnd($0).seconds >= currentPosition }.map { CMTimeRangeGetEnd($0).seconds }.filter(\.isFinite).max() ?? currentPosition
        return ["items": queue.items.map(\.json), "index": queue.index, "order": queue.order, "queueRevision": queue.revision,
                "position": currentPosition, "duration": duration, "buffered": max(currentPosition, buffered),
                "playing": player.rate > 0, "loading": resolving || recovering || seeking || (wantsPlayback && !interrupted && player.timeControlStatus == .waitingToPlayAtSpecifiedRate),
                "shuffle": queue.shuffle, "repeat": queue.repeatMode, "volume": player.volume,
                "error": errorCode as Any? ?? NSNull(), "status": queue.current == nil ? "idle" : ended ? "ended" : resolving || seeking ? "buffering" : "ready",
                "stamp": ["session": sessionID, "sequence": sequence]]
    }
    private func emit() {
        _ = checkSleepExpiry()
        sequence += 1
        if systemIntegration { updateNowPlaying() }
        onSnapshot?(snapshot())
    }
    func playTracks(_ values: [[String: Any]], index: Int) throws -> [String: Any] {
        let tracks = try values.map(PlaybackTrack.decode)
        guard tracks.indices.contains(index) else { throw ResolverFailure.code("INVALID_QUEUE") }
        let expired = checkSleepExpiry(), boundary = consumeSleepBoundary()
        try queue.replace(tracks, at: index)
        if expired || boundary { stopCurrent(); savedPosition = 0; wantsPlayback = false; persist(); emit() }
        else { wantsPlayback = true; activate(at: 0) }
        return snapshot()
    }
    func enqueue(_ value: [String: Any], next: Bool) throws -> [String: Any] {
        try queue.enqueue(PlaybackTrack.decode(value), next: next); persist(); emit(); return snapshot()
    }
    func command(_ type: String, value: Any? = nil) throws -> [String: Any] {
        precondition(Thread.isMainThread)
        if checkSleepExpiry() { emit(); return snapshot() }
        switch type {
        case "play":
            guard queue.current != nil else { return snapshot() }
            let restart = ended || (player.currentItem == nil && duration > 0 && savedPosition >= duration - 0.05)
            wantsPlayback = true; ended = false; interrupted = false
            if player.currentItem == nil || errorCode != nil { activate(at: restart ? 0 : savedPosition) }
            else if restart { seek(to: 0) }
            else { reconcileIntent() }
        case "pause": wantsPlayback = false; player.pause(); watchdog?.cancel(); persist()
        case "next":
            if consumeSleepBoundary() { emit(); return snapshot() }
            if queue.advance(automatic: false) { activate(at: 0) } else { wantsPlayback = false; player.pause(); ended = true; persist() }
        case "previous":
            if position <= 3, queue.order.first != queue.index, consumeSleepBoundary() { emit(); return snapshot() }
            if position > 3 { seek(to: 0) } else if queue.previous() { activate(at: 0) } else { seek(to: 0) }
        case "seek":
            guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(), number.doubleValue.isFinite else { throw ResolverFailure.code("INVALID_ARGUMENT") }
            seek(to: number.doubleValue)
        case "volume":
            guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(), number.doubleValue.isFinite, (0...1).contains(number.doubleValue) else { throw ResolverFailure.code("INVALID_ARGUMENT") }
            player.volume = number.floatValue; persist()
        case "repeat":
            guard let mode = value as? String, ["off", "all", "one"].contains(mode) else { throw ResolverFailure.code("INVALID_ARGUMENT") }
            queue.repeatMode = mode; queue.revision += 1; persist()
        case "shuffle":
            guard let number = value as? NSNumber, CFGetTypeID(number) == CFBooleanGetTypeID() else { throw ResolverFailure.code("INVALID_ARGUMENT") }
            let enabled = number.boolValue
            queue.setShuffle(enabled); persist()
        case "jump":
            guard let index = Self.integer(value), queue.items.indices.contains(index) else { throw ResolverFailure.code("INVALID_QUEUE") }
            if consumeSleepBoundary() { emit(); return snapshot() }
            if queue.index != index { queue.index = index; queue.revision += 1 }
            wantsPlayback = true; activate(at: 0)
        case "move":
            guard let item = value as? [String: Any], let from = Self.integer(item["from"]), let to = Self.integer(item["to"]), let revision = Self.integer(item["revision"]) else { throw ResolverFailure.code("INVALID_QUEUE") }
            try queue.move(from: from, to: to, expectedRevision: revision); persist()
        case "remove":
            let details = value as? [String: Any]
            guard let index = Self.integer(details?["index"] ?? value) else { throw ResolverFailure.code("INVALID_QUEUE") }
            if let details, Self.integer(details["revision"]) == nil { throw ResolverFailure.code("INVALID_QUEUE") }
            let removed = try queue.remove(index, expectedRevision: details.flatMap { Self.integer($0["revision"]) })
            if queue.current == nil { stopCurrent(); wantsPlayback = false; savedPosition = 0; cancelSleepTimer() }
            else if removed {
                if consumeSleepBoundary() { stopCurrent(); savedPosition = 0 }
                else { activate(at: 0) }
            }
            persist()
        case "retry":
            if queue.current != nil { wantsPlayback = true; interrupted = false; activate(at: position, refresh: true) }
        case "clear":
            cancelSleepTimer()
            stopCurrent(); queue = PlaybackQueue(revision: queue.revision + 1); wantsPlayback = false; savedPosition = 0; ended = false; errorCode = nil; persist()
            if systemIntegration { try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation) }
        default: throw ResolverFailure.code("INVALID_COMMAND")
        }
        emit(); return snapshot()
    }
    func timerSnapshot() -> [String: Any] {
        precondition(Thread.isMainThread)
        if checkSleepExpiry() { emit() }
        return sleepTimer.snapshot(now: sleepClock())
    }
    func configureSleepTimer(mode: String, minutes: Int?, revision: Int) throws -> [String: Any] {
        precondition(Thread.isMainThread)
        if checkSleepExpiry() { emit() }
        guard revision == sleepTimer.revision else { throw ResolverFailure.code("TIMER_CHANGED") }
        guard mode == "off" || queue.current != nil else { throw ResolverFailure.code("NO_CURRENT_TRACK") }
        try sleepTimer.configure(mode: mode, minutes: minutes, now: sleepClock())
        sleepTick?.cancel(); sleepTick = nil
        if mode == "duration", scheduleSleepTicks {
            let timer = DispatchSource.makeTimerSource(queue: .main)
            timer.schedule(deadline: .now() + 1, repeating: .seconds(1), leeway: .milliseconds(100))
            timer.setEventHandler { [weak self] in self?.refreshSleepTimer() }
            sleepTick = timer; timer.resume()
        }
        publishSleepTimer(); return sleepTimer.snapshot(now: sleepClock())
    }
    func refreshSleepTimer() {
        precondition(Thread.isMainThread)
        if checkSleepExpiry() { emit() } else { publishSleepTimer() }
    }
    private func publishSleepTimer() { onSleepTimer?(sleepTimer.snapshot(now: sleepClock())) }
    private func cancelSleepTimer() {
        guard sleepTimer.mode != "off" else { return }
        try? sleepTimer.configure(mode: "off", minutes: nil, now: sleepClock())
        sleepTick?.cancel(); sleepTick = nil; publishSleepTimer()
    }
    @discardableResult private func checkSleepExpiry() -> Bool {
        guard sleepTimer.consumeExpiry(now: sleepClock()) else { return false }
        pauseForSleep(); return true
    }
    private func consumeSleepBoundary() -> Bool {
        guard sleepTimer.consumeBoundary(now: sleepClock()) else { return false }
        pauseForSleep(); return true
    }
    private func pauseForSleep() {
        let offset = position
        wantsPlayback = false; interrupted = false; player.pause(); watchdog?.cancel(); retryWork?.cancel()
        if resolving || recovering { stopCurrent(); savedPosition = offset }
        sleepTick?.cancel(); sleepTick = nil
        persist(); publishSleepTimer()
    }

    private static func integer(_ value: Any?) -> Int? {
        guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(), number.doubleValue.isFinite,
              number.doubleValue.rounded() == number.doubleValue, abs(number.doubleValue) < 1_000_000_000 else { return nil }
        return number.intValue
    }
    private func stopCurrent() {
        generation += 1; seekGeneration += 1; pendingSeek = nil; seeking = false; resolving = false; recovering = false
        pendingResolution = nil; retryWork?.cancel(); watchdog?.cancel()
        if let activeResolution { cancelResolve(activeResolution) }
        itemObservation = nil
        if let endedObserver { NotificationCenter.default.removeObserver(endedObserver); self.endedObserver = nil }
        player.pause(); player.replaceCurrentItem(with: nil); loader?.stop(); loader = nil
    }
    private func activate(at offset: Double, refresh: Bool = false, resetRecovery: Bool = true) {
        stopCurrent()
        guard queue.current != nil else { emit(); return }
        errorCode = nil; ended = false; resolving = true; savedPosition = max(0, offset); pendingSeek = savedPosition > 0 ? savedPosition : nil
        if resetRecovery { recoveryAttempts = 0 }
        pendingResolution = (generation, savedPosition, refresh, Date().addingTimeInterval(12))
        drainResolution(); armWatchdog(); persist(); emit()
    }
    private func drainResolution() {
        guard activeResolution == nil, let pending = pendingResolution, pending.generation == generation, let track = queue.current else { return }
        pendingResolution = nil
        let identifier = UUID().uuidString; activeResolution = identifier
        resolver(["operation": "resolve", "videoId": track.videoId, "refresh": pending.refresh], identifier) { [weak self] result in DispatchQueue.main.async {
            guard let self else { return }; self.activeResolution = nil
            if self.generation != pending.generation { self.drainResolution(); return }
            switch result {
            case let .success(descriptor):
                do { try self.install(descriptor, generation: pending.generation) }
                catch { self.finishError((error as? ResolverFailure)?.identifier ?? "UNSUPPORTED_STREAM") }
            case let .failure(failure):
                if failure.identifier == "BUSY", Date() < pending.deadline {
                    self.pendingResolution = pending
                    let retry = DispatchWorkItem { [weak self] in self?.drainResolution() }; self.retryWork = retry
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.25, execute: retry)
                } else { self.finishError(failure.identifier) }
            }
        } }
    }
    private func install(_ descriptor: [String: Any], generation current: Int) throws {
        if checkSleepExpiry() { emit(); return }
        let source = try PlaybackResourceLoader(descriptor: descriptor, protocols: protocols)
        loader = source
        source.onFailure = { [weak self] code in guard let self, self.generation == current else { return }; self.mediaFailure(code) }
        let item = AVPlayerItem(asset: source.asset); item.preferredForwardBufferDuration = 15
        itemObservation = item.observe(\.status, options: [.new]) { [weak self] item, _ in DispatchQueue.main.async {
            guard let self, self.generation == current else { return }
            if item.status == .readyToPlay {
                self.resolving = false; self.watchdog?.cancel()
                if let target = self.pendingSeek { self.seek(to: target) } else { self.reconcileIntent() }
                self.emit()
            } else if item.status == .failed { self.mediaFailure("TRANSPORT_ERROR") }
        } }
        endedObserver = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
            guard let self, self.generation == current else { return }
            if self.consumeSleepBoundary() { self.ended = true; self.persist(); self.emit(); return }
            if self.queue.advance(automatic: true) { self.activate(at: 0) }
            else { self.wantsPlayback = false; self.ended = true; self.savedPosition = self.duration; self.persist(); self.emit() }
        }
        player.replaceCurrentItem(with: item)
        if wantsPlayback && !interrupted { try activateAudioSession(); player.play() }
    }
    private func activateAudioSession() throws {
        let audio = AVAudioSession.sharedInstance()
        try audio.setCategory(.playback, mode: .default, options: [])
        try audio.setActive(true)
    }
    private func reconcileIntent() {
        if checkSleepExpiry() { return }
        if wantsPlayback && !interrupted && !seeking {
            do { try activateAudioSession(); player.play(); armWatchdog() }
            catch { finishError("AUDIO_SESSION_UNAVAILABLE") }
        } else { player.pause() }
    }
    private func seek(to requested: Double) {
        guard queue.current != nil else { return }
        ended = false
        let target = max(0, min(requested, duration > 0 ? duration : 86400))
        savedPosition = target; pendingSeek = target
        guard player.currentItem?.status == .readyToPlay else { persist(); emit(); return }
        seekGeneration += 1; let serial = seekGeneration, current = generation
        seeking = true; player.pause(); player.currentItem?.cancelPendingSeeks()
        player.seek(to: CMTime(seconds: target, preferredTimescale: 600), toleranceBefore: CMTime(seconds: 0.03, preferredTimescale: 600), toleranceAfter: CMTime(seconds: 0.03, preferredTimescale: 600)) { [weak self] completed in DispatchQueue.main.async {
            guard let self, self.generation == current, self.seekGeneration == serial else { return }
            self.seeking = false; self.pendingSeek = nil
            if !completed { self.finishError("SEEK_FAILED"); return }
            self.reconcileIntent(); self.persist(); self.emit()
        } }
        emit()
    }
    private func mediaFailure(_ code: String) {
        guard !recovering, errorCode == nil else { return }
        let offset = position
        if ["SOURCE_EXPIRED", "TRANSPORT_ERROR"].contains(code), recoveryAttempts < 1 {
            recovering = true; recoveryAttempts += 1; player.pause()
            let current = generation
            let work = DispatchWorkItem { [weak self] in
                guard let self, self.generation == current else { return }
                self.activate(at: offset, refresh: true, resetRecovery: false)
            }
            retryWork = work; DispatchQueue.main.asyncAfter(deadline: .now() + 1, execute: work)
        } else { finishError(code) }
    }
    private func finishError(_ code: String) {
        savedPosition = position
        generation += 1; seekGeneration += 1; pendingResolution = nil
        if let activeResolution { cancelResolve(activeResolution) }
        itemObservation = nil
        if let endedObserver { NotificationCenter.default.removeObserver(endedObserver); self.endedObserver = nil }
        errorCode = code; wantsPlayback = false; resolving = false; seeking = false; pendingSeek = nil; recovering = false
        loader?.stop()
        player.pause(); player.replaceCurrentItem(with: nil); watchdog?.cancel(); retryWork?.cancel(); persist(); emit()
    }
    private func armWatchdog() {
        watchdog?.cancel(); let current = generation
        let work = DispatchWorkItem { [weak self] in
            guard let self, self.generation == current, self.resolving || (self.wantsPlayback && self.player.timeControlStatus == .waitingToPlayAtSpecifiedRate) else { return }
            self.finishError("PLAYBACK_TIMEOUT")
        }
        watchdog = work; DispatchQueue.main.asyncAfter(deadline: .now() + 45, execute: work)
    }

    private func restore() {
        guard let attributes = try? FileManager.default.attributesOfItem(atPath: storage.path), ((attributes[.size] as? NSNumber)?.intValue ?? Int.max) <= 2 * 1024 * 1024,
              let data = try? Data(contentsOf: storage), let saved = try? JSONDecoder().decode(PlaybackSavedState.self, from: data), saved.valid else { return }
        queue = saved.queue; savedPosition = saved.position; player.volume = saved.volume
        // Restore metadata and position; playback always requires a new user action.
    }
    func persist() {
        let saved = PlaybackSavedState(schema: 1, queue: queue, position: position, volume: player.volume)
        guard saved.valid, let data = try? JSONEncoder().encode(saved), data.count <= 2 * 1024 * 1024 else { return }
        do {
            try FileManager.default.createDirectory(at: storage.deletingLastPathComponent(), withIntermediateDirectories: true)
            try data.write(to: storage, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            lastSave = Date()
        } catch { /* Playback continues; no path or personal queue enters logs. */ }
    }
    func flush() { persist() }
    func publishSnapshot() { emit() }

    func interruption(began: Bool, shouldResume: Bool = false) {
        _ = checkSleepExpiry()
        if began { interrupted = true; player.pause(); watchdog?.cancel(); persist() }
        else {
            interrupted = false
            if shouldResume && wantsPlayback { reconcileIntent() }
            else { wantsPlayback = false; player.pause() }
        }
        emit()
    }
    func routeLost() { _ = try? command("pause") }

    private func installSystemIntegration() {
        let center = NotificationCenter.default
        notifications.append(center.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main) { [weak self] _ in
            self?.refreshSleepTimer()
        })
        notifications.append(center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
            guard let self, let raw = (note.userInfo?[AVAudioSessionInterruptionTypeKey] as? NSNumber)?.uintValue else { return }
            let options = AVAudioSession.InterruptionOptions(rawValue: (note.userInfo?[AVAudioSessionInterruptionOptionKey] as? NSNumber)?.uintValue ?? 0)
            self.interruption(began: raw == AVAudioSession.InterruptionType.began.rawValue, shouldResume: options.contains(.shouldResume))
        })
        notifications.append(center.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] note in
            guard let self, (note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? NSNumber)?.uintValue == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue else { return }
            self.routeLost()
        })
        notifications.append(center.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: .main) { [weak self] _ in
            guard let self else { return }; self.wantsPlayback = false; self.stopCurrent(); self.errorCode = "AUDIO_SESSION_RESET"; self.emit()
        })
        let remote = MPRemoteCommandCenter.shared()
        func bind(_ command: MPRemoteCommand, _ type: String) {
            command.isEnabled = true
            command.addTarget { [weak self] _ in
                DispatchQueue.main.async { _ = try? self?.command(type) }
                return .success
            }
        }
        bind(remote.playCommand, "play"); bind(remote.pauseCommand, "pause"); bind(remote.nextTrackCommand, "next"); bind(remote.previousTrackCommand, "previous"); bind(remote.stopCommand, "pause")
        remote.togglePlayPauseCommand.isEnabled = true; remote.changePlaybackPositionCommand.isEnabled = true
        remote.changeRepeatModeCommand.isEnabled = true; remote.changeShuffleModeCommand.isEnabled = true
        remote.togglePlayPauseCommand.addTarget { [weak self] _ in DispatchQueue.main.async { guard let self else { return }; _ = try? self.command(self.wantsPlayback ? "pause" : "play") }; return .success }
        remote.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            DispatchQueue.main.async { _ = try? self?.command("seek", value: event.positionTime) }; return .success
        }
        remote.changeRepeatModeCommand.addTarget { [weak self] event in
            guard let event = event as? MPChangeRepeatModeCommandEvent else { return .commandFailed }
            let mode = event.repeatType == .one ? "one" : event.repeatType == .all ? "all" : "off"
            DispatchQueue.main.async { _ = try? self?.command("repeat", value: mode) }; return .success
        }
        remote.changeShuffleModeCommand.addTarget { [weak self] event in
            guard let event = event as? MPChangeShuffleModeCommandEvent else { return .commandFailed }
            DispatchQueue.main.async { _ = try? self?.command("shuffle", value: event.shuffleType != .off) }; return .success
        }
    }
    private func updateNowPlaying() {
        let commands = MPRemoteCommandCenter.shared()
        commands.changeRepeatModeCommand.currentRepeatType = queue.repeatMode == "one" ? .one : queue.repeatMode == "all" ? .all : .off
        commands.changeShuffleModeCommand.currentShuffleType = queue.shuffle ? .items : .off
        guard let track = queue.current else { MPNowPlayingInfoCenter.default().nowPlayingInfo = nil; return }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = [MPMediaItemPropertyTitle: track.title, MPMediaItemPropertyArtist: track.artist,
            MPMediaItemPropertyAlbumTitle: track.album?.name ?? "", MPMediaItemPropertyPlaybackDuration: duration,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: position, MPNowPlayingInfoPropertyPlaybackRate: player.rate,
            MPNowPlayingInfoPropertyDefaultPlaybackRate: 1.0, MPNowPlayingInfoPropertyMediaType: MPNowPlayingInfoMediaType.audio.rawValue]
    }
    func shutdown() {
        sleepTick?.cancel(); sleepTick = nil; onSleepTimer = nil
        persist(); stopCurrent(); wantsPlayback = false
        if let timeObserver { player.removeTimeObserver(timeObserver); self.timeObserver = nil }
        for note in notifications { NotificationCenter.default.removeObserver(note) }; notifications.removeAll(); observations.removeAll()
        onSnapshot = nil
    }
}
