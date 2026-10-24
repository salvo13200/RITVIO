import Foundation

enum ResolverFailure: Error {
    case code(String)
    var identifier: String { switch self { case let .code(value): return value } }
}

/// A single native owner for the embedded interpreter. It never runs on main.
final class ResolverWorker {
    static let shared = ResolverWorker()
    private let queue = DispatchQueue(label: "it.ritvio.resolver", qos: .userInitiated)
    private let lock = NSLock()
    private var generation: Int64 = 0
    private var active: (id: String, generation: Int64, cancelled: Bool)?

    func perform(_ payload: [String: Any], requestID: String = UUID().uuidString, budget: Int = 45000, completion: @escaping (Result<[String: Any], ResolverFailure>) -> Void) {
        guard (8...80).contains(requestID.utf8.count), requestID.unicodeScalars.allSatisfy({ CharacterSet.alphanumerics.contains($0) || $0 == "-" }),
              let bytes = try? JSONSerialization.data(withJSONObject: payload), bytes.count <= 16384,
              let input = String(data: bytes, encoding: .utf8) else { completion(.failure(.code("INVALID_ARGUMENT"))); return }
        lock.lock()
        if active != nil { lock.unlock(); completion(.failure(.code("BUSY"))); return }
        generation += 1
        let current = generation
        active = (requestID, current, false)
        lock.unlock()
        queue.async {
            let raw = RitvioResolverInvoke(Bundle.main.bundlePath, input, current, Int32(budget))
            var result: Result<[String: Any], ResolverFailure> = .failure(.code("NATIVE_RESPONSE_INVALID"))
            if let raw {
                let text = String(cString: raw)
                RitvioResolverFree(raw)
                if let data = text.data(using: .utf8), let envelope = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                    if envelope["ok"] as? Bool == true, let value = envelope["value"] as? [String: Any] { result = .success(value) }
                    else { result = .failure(.code(envelope["error"] as? String ?? "NATIVE_RESPONSE_INVALID")) }
                }
            }
            self.lock.lock()
            if self.active?.cancelled == true { result = .failure(.code("CANCELLED")) }
            self.active = nil
            self.lock.unlock()
            DispatchQueue.main.async { completion(result) }
        }
    }

    func call(_ payload: [String: Any], requestID: String = UUID().uuidString, budget: Int = 45000) async throws -> [String: Any] {
        try await withCheckedThrowingContinuation { continuation in
            perform(payload, requestID: requestID, budget: budget) { continuation.resume(with: $0.mapError { $0 as Error }) }
        }
    }

    @discardableResult func cancel(_ requestID: String) -> Bool {
        lock.lock(); defer { lock.unlock() }
        guard var current = active, current.id == requestID else { return false }
        current.cancelled = true; active = current
        RitvioResolverCancel(current.generation)
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
