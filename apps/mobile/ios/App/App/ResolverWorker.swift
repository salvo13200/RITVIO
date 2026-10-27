import Foundation

enum ResolverFailure: Error {
    case code(String)
    var identifier: String { switch self { case let .code(value): return value } }
}

/// A single native owner for the embedded interpreter. It never runs on main.
final class ResolverWorker {
    static let shared = ResolverWorker()
    typealias Invoke = (String, Int64, Int32) -> Result<[String: Any], ResolverFailure>
    private final class Job {
        let id: String
        let generation: Int64
        let operation: String
        let input: String
        let budget: Int32
        let completion: (Result<[String: Any], ResolverFailure>) -> Void
        var cancelled = false
        init(id: String, generation: Int64, operation: String, input: String, budget: Int32,
             completion: @escaping (Result<[String: Any], ResolverFailure>) -> Void) {
            self.id = id; self.generation = generation; self.operation = operation
            self.input = input; self.budget = budget; self.completion = completion
        }
    }
    private let queue = DispatchQueue(label: "it.ritvio.resolver", qos: .userInitiated)
    private let lock = NSLock()
    private var generation: Int64 = 0
    private var active: Job?
    private var pendingPlayback: Job?
    private let invoke: Invoke
    private let abort: (Int64) -> Void

    init(invoke: @escaping Invoke = ResolverWorker.nativeInvoke,
         abort: @escaping (Int64) -> Void = { RitvioResolverCancel($0) }) {
        self.invoke = invoke; self.abort = abort
    }

    private static func nativeInvoke(_ input: String, _ current: Int64, _ budget: Int32) -> Result<[String: Any], ResolverFailure> {
        guard let raw = RitvioResolverInvoke(Bundle.main.bundlePath, input, current, budget) else { return .failure(.code("NATIVE_RESPONSE_INVALID")) }
        let text = String(cString: raw)
        RitvioResolverFree(raw)
        guard let data = text.data(using: .utf8), let envelope = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return .failure(.code("NATIVE_RESPONSE_INVALID"))
        }
        if envelope["ok"] as? Bool == true, let value = envelope["value"] as? [String: Any] { return .success(value) }
        return .failure(.code(envelope["error"] as? String ?? "NATIVE_RESPONSE_INVALID"))
    }

    func perform(_ payload: [String: Any], requestID: String = UUID().uuidString, budget: Int = 45000, completion: @escaping (Result<[String: Any], ResolverFailure>) -> Void) {
        guard (8...80).contains(requestID.utf8.count), requestID.unicodeScalars.allSatisfy({ CharacterSet.alphanumerics.contains($0) || $0 == "-" }),
              (100...60000).contains(budget), let operation = payload["operation"] as? String,
              let bytes = try? JSONSerialization.data(withJSONObject: payload), bytes.count <= 16384,
              let input = String(data: bytes, encoding: .utf8) else { completion(.failure(.code("INVALID_ARGUMENT"))); return }
        lock.lock()
        if let active {
            // Keep one interpreter and one bounded playback slot. Metadata cannot
            // retry itself into a backlog or hold manual playback behind it.
            guard operation == "resolve", active.operation != "resolve", pendingPlayback == nil,
                  active.id != requestID else { lock.unlock(); completion(.failure(.code("BUSY"))); return }
            generation += 1
            pendingPlayback = Job(id: requestID, generation: generation, operation: operation, input: input,
                                  budget: Int32(budget), completion: completion)
            active.cancelled = true
            // The native hook is an atomic generation cancellation, not a callback.
            abort(active.generation)
            lock.unlock()
            return
        }
        generation += 1
        let job = Job(id: requestID, generation: generation, operation: operation, input: input,
                      budget: Int32(budget), completion: completion)
        active = job
        lock.unlock()
        enqueue(job)
    }

    private func enqueue(_ job: Job) {
        queue.async {
            self.lock.lock(); let cancelledBeforeStart = job.cancelled; self.lock.unlock()
            var result: Result<[String: Any], ResolverFailure> = cancelledBeforeStart ? .failure(.code("CANCELLED")) : self.invoke(job.input, job.generation, job.budget)
            self.lock.lock()
            if job.cancelled { result = .failure(.code("CANCELLED")) }
            let next = self.pendingPlayback
            self.pendingPlayback = nil
            self.active = next
            self.lock.unlock()
            // Reserve playback under the lock before exposing the free worker.
            // A completion may immediately request more metadata.
            if let next { self.enqueue(next) }
            DispatchQueue.main.async { job.completion(result) }
        }
    }

    func call(_ payload: [String: Any], requestID: String = UUID().uuidString, budget: Int = 45000) async throws -> [String: Any] {
        try await withCheckedThrowingContinuation { continuation in
            perform(payload, requestID: requestID, budget: budget) { continuation.resume(with: $0.mapError { $0 as Error }) }
        }
    }

    @discardableResult func cancel(_ requestID: String) -> Bool {
        lock.lock()
        if let pending = pendingPlayback, pending.id == requestID {
            pendingPlayback = nil; pending.cancelled = true
            lock.unlock()
            DispatchQueue.main.async { pending.completion(.failure(.code("CANCELLED"))) }
            return true
        }
        guard let current = active, current.id == requestID else { lock.unlock(); return false }
        current.cancelled = true
        abort(current.generation)
        lock.unlock()
        return true
    }

    static func inspection(_ value: [String: Any]) -> [String: Any] {
        // Only the native player/probe may access a signed URL or its headers.
        ["container": value["container"] ?? NSNull(), "codec": value["codec"] ?? NSNull(),
         "duration": value["duration"] ?? NSNull(), "protocol": value["protocol"] ?? NSNull(),
         "validForSeconds": max(0, (value["expires"] as? Double ?? 0) - Date().timeIntervalSince1970),
         "cacheHit": value["cacheHit"] as? Bool ?? false]
    }
}
