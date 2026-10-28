import Foundation
import Darwin

/// Session-only policy. Continuous time includes device sleep and ignores wall-clock edits.
enum PlaybackTimerClock {
    private static let secondsPerTick: Double = {
        var info = mach_timebase_info_data_t()
        mach_timebase_info(&info)
        return Double(info.numer) / Double(info.denom) / 1_000_000_000
    }()
    static func now() -> TimeInterval { Double(mach_continuous_time()) * secondsPerTick }
}

struct PlaybackSleepTimer {
    private(set) var mode = "off"
    private(set) var minutes: Int?
    private(set) var deadline: TimeInterval?
    private(set) var revision = 0
    private(set) var reason: String?

    mutating func configure(mode: String, minutes: Int?, now: TimeInterval) throws {
        guard now.isFinite, now >= 0, ["off", "duration", "track-end"].contains(mode),
              mode == "duration" ? [15, 30, 45, 60].contains(minutes ?? -1) : minutes == nil else {
            throw ResolverFailure.code("INVALID_TIMER")
        }
        let wasActive = self.mode != "off"
        self.mode = mode; self.minutes = mode == "duration" ? minutes : nil
        deadline = mode == "duration" ? now + Double(minutes! * 60) : nil
        reason = mode == "off" && wasActive ? "cancelled" : nil; revision += 1
    }
    mutating func consumeExpiry(now: TimeInterval) -> Bool {
        guard mode == "duration", let deadline, now >= deadline else { return false }
        expire(); return true
    }
    mutating func consumeBoundary(now: TimeInterval) -> Bool {
        if consumeExpiry(now: now) { return true }
        guard mode == "track-end" else { return false }
        expire(); return true
    }
    private mutating func expire() {
        mode = "off"; minutes = nil; deadline = nil; reason = "expired"; revision += 1
    }
    func snapshot(now: TimeInterval) -> [String: Any] {
        ["mode": mode, "minutes": minutes as Any? ?? NSNull(),
         "remaining": deadline.map { Int(ceil(max(0, $0 - now))) } as Any? ?? NSNull(),
         "revision": revision, "sample": now, "reason": reason as Any? ?? NSNull()]
    }
}
