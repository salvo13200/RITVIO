import Foundation

/// Debug-only CI entry point. It writes redacted evidence into this app's sandbox.
enum ResolverSelfTest {
    #if DEBUG
    static func startIfRequested() {
        guard ProcessInfo.processInfo.arguments.contains("--ritvio-resolver-check") else { return }
        let live = ProcessInfo.processInfo.arguments.contains("--ritvio-resolver-live")
        Task { await run(live: live) }
    }

    private static func run(live: Bool) async {
        let worker = ResolverWorker.shared
        var report: [String: Any] = ["schema": 1, "phase": "IOS-2", "native": true, "liveRequested": live, "playback": false, "physicalTests": "pending"]
        #if arch(arm64)
        report["executionArchitecture"] = "arm64"
        #else
        report["executionArchitecture"] = "x86_64"
        #endif
        var stage = "runtime"
        func progress(_ next: String) {
            stage = next; report["stage"] = stage; report["status"] = "running"
            write(report)
        }
        progress("runtime")
        do {
            let status = try await worker.call(["operation": "status"])
            guard status["nativeIOS"] as? Bool == true, (status["trustedCAs"] as? Int ?? 0) > 0,
                  let engine = status["engine"] as? [String: Any], engine["jit"] as? Bool == false else { throw ResolverFailure.code("RUNTIME_CHECK_FAILED") }
            report["runtime"] = status
            progress("engine")
            report["deterministic"] = try await worker.call(["operation": "engine-check"])
            progress("cancellation")
            let identifier = UUID().uuidString
            let started = Date()
            let pending = Task { try await worker.call(["operation": "cancel-check"], requestID: identifier) }
            try await Task.sleep(nanoseconds: 100_000_000)
            do { _ = try await worker.call(["operation": "status"]); throw ResolverFailure.code("ADMISSION_NOT_BOUNDED") }
            catch let failure as ResolverFailure { if failure.identifier != "BUSY" { throw failure } }
            guard worker.cancel(identifier) else { throw ResolverFailure.code("CANCELLATION_NOT_ACTIVE") }
            do { _ = try await pending.value; throw ResolverFailure.code("CANCELLATION_NOT_APPLIED") }
            catch let failure as ResolverFailure { if failure.identifier != "CANCELLED" { throw failure } }
            report["cancellation"] = ["code": "CANCELLED", "milliseconds": Date().timeIntervalSince(started) * 1000, "concurrentAdmission": "BUSY"]
            // A cancelled operation must not poison the next request.
            _ = try await worker.call(["operation": "status"])
            progress("transport-policy")
            report["transportPolicy"] = try await ResolverTransportFixture.verify()
            if live {
                progress("live-search")
                var searches = [[String: Any]](), streams = [[String: Any]]()
                var candidates = [String]()
                for query in ["Daft Punk", "Massive Attack"] {
                    let result = try await worker.call(["operation": "search", "query": query])
                    guard let items = result["items"] as? [[String: Any]], !items.isEmpty,
                          let track = items.first, let videoID = track["videoId"] as? String else { throw ResolverFailure.code("NO_MUSIC_RESULTS") }
                    let repeated = try await worker.call(["operation": "search", "query": query])
                    guard repeated["cacheHit"] as? Bool == true else { throw ResolverFailure.code("SEARCH_CACHE_MISSED") }
                    searches.append(["query": query, "items": items.count, "cacheReused": true])
                    report["searches"] = searches
                    candidates.append(videoID)
                }
                for videoID in candidates {
                    report["attemptedVideoId"] = videoID
                    progress("live-resolution")
                    let coldStart = Date()
                    let descriptor = try await worker.call(["operation": "resolve", "videoId": videoID], budget: 60000)
                    let coldMilliseconds = Date().timeIntervalSince(coldStart) * 1000
                    let warmStart = Date()
                    let warm = try await worker.call(["operation": "resolve", "videoId": videoID])
                    guard warm["cacheHit"] as? Bool == true else { throw ResolverFailure.code("STREAM_CACHE_MISSED") }
                    var evidence = ResolverWorker.inspection(descriptor)
                    evidence["videoId"] = videoID
                    evidence["coldMilliseconds"] = coldMilliseconds
                    evidence["warmMilliseconds"] = Date().timeIntervalSince(warmStart) * 1000
                    progress("live-byte-range")
                    let first = try await ResolverStreamProbe.check(descriptor)
                    let total = (first["total"] as? NSNumber)?.int64Value ?? 0
                    guard total > 2048 else { throw ResolverFailure.code("MEDIA_TOO_SHORT") }
                    evidence["ranges"] = [first, try await ResolverStreamProbe.check(descriptor, start: total / 2)]
                    evidence["cacheReused"] = true
                    streams.append(evidence)
                    report["searches"] = searches; report["streams"] = streams
                    progress("live-search")
                }
                let final = try await worker.call(["operation": "status"])
                report["finalEngine"] = final["engine"]
            }
            report["status"] = "passed"
        } catch {
            report["status"] = "failed"; report["failedStage"] = stage
            report["error"] = (error as? ResolverFailure)?.identifier ?? "NATIVE_CHECK_FAILED"
            report["runtimeAfterFailure"] = try? await worker.call(["operation": "status"])
        }
        write(report)
    }
    private static func write(_ report: [String: Any]) {
        let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        if let data = try? JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]) { try? data.write(to: directory.appendingPathComponent("resolver-evidence.json"), options: .atomic) }
    }
    #endif
}
