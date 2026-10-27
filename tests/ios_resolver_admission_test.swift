// Host Swift checks exercise the production worker with a controlled interpreter.
// They do not initialize Python or provide provider/audio/hardware evidence.
import Foundation

func RitvioResolverInvoke(_ bundle: String, _ input: String, _ generation: Int64, _ budget: Int32) -> UnsafeMutablePointer<CChar>? {
    fatalError("Host admission test must inject its interpreter")
}
func RitvioResolverFree(_ pointer: UnsafeMutablePointer<CChar>) { fatalError("Unexpected native buffer") }
func RitvioResolverCancel(_ generation: Int64) { fatalError("Host test must inject its cancellation hook") }

private final class Events {
    private let lock = NSLock()
    private var values: [String] = []
    func add(_ value: String) { lock.lock(); values.append(value); lock.unlock() }
    func read() -> [String] { lock.lock(); defer { lock.unlock() }; return values }
}
private func expect(_ value: Bool, _ message: String) throws {
    if !value { throw NSError(domain: "RITVIOAdmission", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
}
private func until(_ predicate: () -> Bool) async throws {
    let deadline = Date().addingTimeInterval(4)
    while !predicate() {
        try expect(Date() < deadline, "Timed out waiting for controlled worker")
        try await Task.sleep(nanoseconds: 5_000_000)
    }
}
private func outcome(_ result: Result<[String: Any], ResolverFailure>) -> String {
    switch result { case .success: return "OK"; case let .failure(error): return error.identifier }
}

@main private struct AdmissionTests {
    static func main() async throws {
        try await preemption()
        try await playbackCannotBePreempted()
        try await pendingCancellationAndBound()
        try await invalidBudget()
        print("iOS production resolver admission: 4 controlled cases passed; provider/hardware not measured")
    }
    static func preemption() async throws {
        let events = Events(), release = DispatchSemaphore(value: 0)
        let worker = ResolverWorker(invoke: { input, _, _ in
            if input.contains("detail") {
                events.add("metadata-started")
                _ = release.wait(timeout: .now() + 3)
                return .success(["id": "metadata-must-not-escape"])
            }
            events.add("playback-started"); return .success(["descriptor": true])
        }, abort: { _ in events.add("aborted"); release.signal() })
        worker.perform(["operation": "detail"], requestID: "catalog-request") { events.add("metadata-" + outcome($0)) }
        try await until { events.read().contains("metadata-started") }
        worker.perform(["operation": "resolve"], requestID: "playback-request") { events.add("playback-" + outcome($0)) }
        try await until { events.read().contains("metadata-CANCELLED") && events.read().contains("playback-OK") }
        try expect(events.read().filter { $0 == "aborted" }.count == 1, "Metadata was not cancelled once")
        try expect(!events.read().contains("metadata-OK"), "Superseded metadata escaped")
    }
    static func playbackCannotBePreempted() async throws {
        let events = Events(), release = DispatchSemaphore(value: 0)
        let worker = ResolverWorker(invoke: { _, _, _ in
            events.add("audio-started"); _ = release.wait(timeout: .now() + 3); return .success([:])
        }, abort: { _ in events.add("unexpected-abort") })
        worker.perform(["operation": "resolve"], requestID: "audio-request") { events.add("audio-" + outcome($0)) }
        try await until { events.read().contains("audio-started") }
        worker.perform(["operation": "catalog-search"], requestID: "catalog-request") { events.add("catalog-" + outcome($0)) }
        try expect(!worker.cancel("catalog-request"), "Rejected metadata request could cancel audio")
        try expect(events.read().contains("catalog-BUSY") && !events.read().contains("unexpected-abort"), "Metadata interrupted playback")
        release.signal()
        try await until { events.read().contains("audio-OK") }
    }
    static func pendingCancellationAndBound() async throws {
        let events = Events(), release = DispatchSemaphore(value: 0)
        let worker = ResolverWorker(invoke: { input, _, _ in
            if input.contains("detail") {
                events.add("metadata-started"); _ = release.wait(timeout: .now() + 3)
            } else { events.add("unexpected-playback") }
            return .success([:])
        }, abort: { _ in events.add("abort") })
        worker.perform(["operation": "detail"], requestID: "metadata-request") { events.add("metadata-" + outcome($0)) }
        try await until { events.read().contains("metadata-started") }
        worker.perform(["operation": "resolve"], requestID: "queued-request") { events.add("queued-" + outcome($0)) }
        worker.perform(["operation": "resolve"], requestID: "overflow-request") { events.add("overflow-" + outcome($0)) }
        try expect(events.read().contains("overflow-BUSY"), "Playback backlog grew without a bound")
        try expect(worker.cancel("queued-request"), "Pending playback could not be cancelled")
        try expect(!worker.cancel("queued-request"), "Pending cancellation was delivered twice")
        release.signal()
        try await until { events.read().contains("queued-CANCELLED") && events.read().contains("metadata-CANCELLED") }
        try expect(!events.read().contains("unexpected-playback"), "Cancelled queued request reached interpreter")
        try expect(events.read().filter { $0 == "queued-CANCELLED" }.count == 1, "Pending request completed twice")
    }
    static func invalidBudget() async throws {
        let events = Events()
        let worker = ResolverWorker(invoke: { _, _, _ in events.add("unexpected-invoke"); return .success([:]) }, abort: { _ in })
        worker.perform(["operation": "detail"], requestID: "invalid-budget", budget: 99) { events.add(outcome($0)) }
        try expect(events.read() == ["INVALID_ARGUMENT"], "Invalid budget reached native conversion")
    }
}
