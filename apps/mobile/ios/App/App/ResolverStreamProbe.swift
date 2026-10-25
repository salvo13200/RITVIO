import Foundation

/// A bounded range probe, not a downloader. No response body is persisted.
final class ResolverStreamProbe: NSObject, URLSessionDataDelegate {
    private var completion: ((Result<[String: Any], Error>) -> Void)?
    private var session: URLSession?
    private let start: Int64
    private var total: Int64 = 0
    private var received = 0
    private var expected = 0
    private var prefix = Data()
    private var accepted = false
    private var done = false

    init(start: Int64, completion: @escaping (Result<[String: Any], Error>) -> Void) { self.start = start; self.completion = completion }
    private static func allowed(_ url: URL) -> Bool { url.scheme == "https" && url.host?.hasSuffix(".googlevideo.com") == true && url.user == nil && url.password == nil && (url.port == nil || url.port == 443) }

    static func check(_ descriptor: [String: Any], start: Int64 = 0, protocols: [AnyClass]? = nil) async throws -> [String: Any] {
        guard let text = descriptor["url"] as? String, let url = URL(string: text), allowed(url) else { throw ResolverFailure.code("INVALID_STREAM") }
        return try await withCheckedThrowingContinuation { continuation in
            let probe = ResolverStreamProbe(start: start) { continuation.resume(with: $0) }
            let configuration = URLSessionConfiguration.ephemeral
            if let protocols { configuration.protocolClasses = protocols }
            configuration.urlCache = nil; configuration.httpShouldSetCookies = false
            configuration.timeoutIntervalForRequest = 12; configuration.timeoutIntervalForResource = 15
            let delegateQueue = OperationQueue(); delegateQueue.maxConcurrentOperationCount = 1
            let session = URLSession(configuration: configuration, delegate: probe, delegateQueue: delegateQueue)
            probe.session = session
            var request = URLRequest(url: url)
            for (key, value) in descriptor["headers"] as? [String: String] ?? [:] { request.setValue(value, forHTTPHeaderField: key) }
            request.setValue("bytes=\(start)-\(start + 1023)", forHTTPHeaderField: "Range")
            request.cachePolicy = .reloadIgnoringLocalCacheData
            session.dataTask(with: request).resume()
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(request.url.flatMap { Self.allowed($0) ? request : nil })
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        guard let response = response as? HTTPURLResponse, response.statusCode == 206,
              let range = response.value(forHTTPHeaderField: "Content-Range"),
              let regex = try? NSRegularExpression(pattern: "^bytes ([0-9]+)-([0-9]+)/([0-9]+)$"),
              let match = regex.firstMatch(in: range, range: NSRange(range.startIndex..., in: range)),
              let firstRange = Range(match.range(at: 1), in: range), let lastRange = Range(match.range(at: 2), in: range), let totalRange = Range(match.range(at: 3), in: range),
              let first = Int64(range[firstRange]), let last = Int64(range[lastRange]), let count = Int64(range[totalRange]),
              first == start, last >= first, last - first < 1024, count > last, count < 100_000_000_000 else {
            completionHandler(.cancel); finish(.failure(ResolverFailure.code("RANGE_UNSUPPORTED"))); return
        }
        total = count; expected = Int(last - first + 1); accepted = true; completionHandler(.allow)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        received += data.count
        if received > 1024 { dataTask.cancel(); finish(.failure(ResolverFailure.code("PROBE_LIMIT_EXCEEDED"))); return }
        if prefix.count < 16 { prefix.append(data.prefix(16 - prefix.count)) }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if done { return }
        guard error == nil, accepted, received == expected, received > 0 else { finish(.failure(ResolverFailure.code("TRANSPORT_UNAVAILABLE"))); return }
        if start == 0 && (prefix.count < 8 || String(data: prefix.subdata(in: 4..<8), encoding: .ascii) != "ftyp") { finish(.failure(ResolverFailure.code("CONTAINER_MISMATCH"))); return }
        finish(.success(["httpStatus": 206, "start": start, "bytes": received, "total": total, "mp4Header": start == 0]))
    }

    private func finish(_ result: Result<[String: Any], Error>) {
        guard !done else { return }; done = true
        let callback = completion; completion = nil
        session?.invalidateAndCancel(); session = nil
        callback?(result)
    }
}
