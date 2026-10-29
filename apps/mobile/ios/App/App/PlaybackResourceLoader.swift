import Foundation
import AVFoundation
import UniformTypeIdentifiers

/// Public AVAssetResourceLoader API keeps signed URLs and allowed headers native.
/// Bounded range requests feed AVPlayer; media is neither saved nor converted.
final class PlaybackResourceLoader: NSObject, AVAssetResourceLoaderDelegate, URLSessionDataDelegate {
    private final class Loading {
        let request: AVAssetResourceLoadingRequest
        var task: URLSessionDataTask?
        var offset: Int64
        var end: Int64?
        var expected = 0
        var limit: Int64 = 0
        var bytes = Data()
        init(_ request: AVAssetResourceLoadingRequest) {
            self.request = request
            offset = max(request.dataRequest?.requestedOffset ?? 0, request.dataRequest?.currentOffset ?? 0)
            if let data = request.dataRequest, !data.requestsAllDataToEndOfResource { end = data.requestedOffset + Int64(data.requestedLength) }
        }
    }
    static let chunkBytes = 128 * 1024
    static let maxRequests = 4
    let asset: AVURLAsset
    let codec: String
    let descriptorDuration: Double?
    private let url: URL
    private let headers: [String: String]
    private let expires: Double
    private let queue = DispatchQueue(label: "it.ritvio.media-ranges")
    private var session: URLSession!
    private var loading: [Int: Loading] = [:]
    private var total: Int64?
    private var stopped = false
    var onFailure: ((String) -> Void)?

    static func allowed(_ url: URL) -> Bool {
        url.scheme == "https" && url.host?.hasSuffix(".googlevideo.com") == true &&
        url.user == nil && url.password == nil && (url.port == nil || url.port == 443)
    }
    init(descriptor: [String: Any], protocols: [AnyClass]? = nil) throws {
        guard let source = descriptor["url"] as? String, let url = URL(string: source), Self.allowed(url),
              let expires = descriptor["expires"] as? Double, expires.isFinite, expires > Date().timeIntervalSince1970,
              descriptor["container"] as? String == "m4a", descriptor["protocol"] as? String == "https",
              let codec = descriptor["codec"] as? String, codec.hasPrefix("mp4a") || codec.hasPrefix("aac"),
              let headers = descriptor["headers"] as? [String: String], headers.count <= 5,
              headers.allSatisfy({ ["user-agent", "referer", "origin", "accept", "accept-language"].contains($0.key.lowercased()) && $0.value.utf8.count <= 2048 && !$0.value.contains("\r") && !$0.value.contains("\n") }) else {
            throw ResolverFailure.code("UNSUPPORTED_STREAM")
        }
        self.url = url; self.headers = headers; self.expires = expires
        self.codec = ["mp4a.40.2", "mp4a.40.5", "mp4a.40.29", "aac"].contains(codec) ? codec : "other"
        let seconds = descriptor["duration"] as? Double
        self.descriptorDuration = seconds.flatMap { $0.isFinite && $0 > 0 && $0 <= 86400 ? $0 : nil }
        // A private resource scheme, not an HTTP proxy or private AVURLAsset key.
        asset = AVURLAsset(url: URL(string: "ritvio-media://stream/\(UUID().uuidString).m4a")!,
            options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
        super.init()
        let configuration = URLSessionConfiguration.ephemeral
        configuration.urlCache = nil; configuration.httpCookieStorage = nil; configuration.httpShouldSetCookies = false
        configuration.timeoutIntervalForRequest = 12; configuration.timeoutIntervalForResource = 20
        configuration.httpMaximumConnectionsPerHost = Self.maxRequests
        if let protocols { configuration.protocolClasses = protocols }
        let delegate = OperationQueue(); delegate.maxConcurrentOperationCount = 1; delegate.underlyingQueue = queue
        session = URLSession(configuration: configuration, delegate: self, delegateQueue: delegate)
        asset.resourceLoader.setDelegate(self, queue: queue)
    }
    func stop() {
        queue.async {
            guard !self.stopped else { return }; self.stopped = true
            for item in self.loading.values {
                item.task?.cancel()
                if !item.request.isFinished && !item.request.isCancelled { item.request.finishLoading(with: self.error("CANCELLED")) }
            }
            self.loading.removeAll(); self.session.invalidateAndCancel()
        }
    }
    func resourceLoader(_ resourceLoader: AVAssetResourceLoader, shouldWaitForLoadingOfRequestedResource request: AVAssetResourceLoadingRequest) -> Bool {
        guard !stopped, loading.count < Self.maxRequests else { request.finishLoading(with: error("MEDIA_BUSY")); return true }
        if let data = request.dataRequest {
            guard data.requestedOffset >= 0, data.currentOffset >= 0, data.requestedLength >= 0,
                  data.requestedOffset < 100_000_000_000,
                  data.requestsAllDataToEndOfResource || Int64(data.requestedLength) <= Int64.max - data.requestedOffset else {
                request.finishLoading(with: error("INVALID_RANGE")); return true
            }
        }
        let item = Loading(request)
        fetch(item)
        return true
    }
    func resourceLoader(_ resourceLoader: AVAssetResourceLoader, didCancel request: AVAssetResourceLoadingRequest) {
        for (key, item) in loading where item.request === request { item.task?.cancel(); loading.removeValue(forKey: key) }
    }
    private func error(_ code: String) -> NSError { NSError(domain: "it.ritvio.playback", code: 1, userInfo: [NSLocalizedDescriptionKey: code]) }
    private func fetch(_ item: Loading) {
        guard !stopped, !item.request.isCancelled, !item.request.isFinished else { return }
        if expires <= Date().timeIntervalSince1970 { fail(item, "SOURCE_EXPIRED"); return }
        if let total {
            item.end = min(item.end ?? total, total)
            if item.offset >= (item.end ?? total) { item.request.finishLoading(); return }
        }
        let informationOnly = item.request.dataRequest == nil
        let amount = informationOnly ? 2 : Int64(Self.chunkBytes)
        let last = min(item.offset + amount - 1, (item.end ?? Int64.max) - 1)
        item.limit = last
        var request = URLRequest(url: url); request.cachePolicy = .reloadIgnoringLocalCacheData
        for (name, value) in headers { request.setValue(value, forHTTPHeaderField: name) }
        request.setValue("bytes=\(item.offset)-\(last)", forHTTPHeaderField: "Range")
        request.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
        item.bytes.removeAll(keepingCapacity: false); item.expected = 0
        let task = session.dataTask(with: request); item.task = task; loading[task.taskIdentifier] = item; task.resume()
    }
    private func fail(_ item: Loading, _ code: String) {
        if let task = item.task { loading.removeValue(forKey: task.taskIdentifier); task.cancel() }
        if !stopped { DispatchQueue.main.async { [weak self] in self?.onFailure?(code) } }
        if !item.request.isFinished && !item.request.isCancelled { item.request.finishLoading(with: error(code)) }
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        guard let url = request.url, Self.allowed(url) else {
            completionHandler(nil)
            if let item = loading[task.taskIdentifier] { fail(item, "UNTRUSTED_REDIRECT") }
            return
        }
        var redirected = request
        for (name, value) in headers { redirected.setValue(value, forHTTPHeaderField: name) }
        redirected.setValue(task.originalRequest?.value(forHTTPHeaderField: "Range"), forHTTPHeaderField: "Range")
        redirected.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
        completionHandler(redirected)
    }
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        guard let item = loading[dataTask.taskIdentifier] else { completionHandler(.cancel); return }
        guard let response = response as? HTTPURLResponse else { completionHandler(.cancel); fail(item, "TRANSPORT_ERROR"); return }
        if [401,403,410].contains(response.statusCode) { completionHandler(.cancel); fail(item, "SOURCE_EXPIRED"); return }
        if response.statusCode == 429 { completionHandler(.cancel); fail(item, "RATE_LIMITED"); return }
        guard response.statusCode == 206, let range = response.value(forHTTPHeaderField: "Content-Range"),
              let regex = try? NSRegularExpression(pattern: "^bytes ([0-9]+)-([0-9]+)/([0-9]+)$"),
              let match = regex.firstMatch(in: range, range: NSRange(range.startIndex..., in: range)),
              let a = Range(match.range(at: 1), in: range), let b = Range(match.range(at: 2), in: range), let c = Range(match.range(at: 3), in: range),
              let first = Int64(range[a]), let last = Int64(range[b]), let length = Int64(range[c]),
              first == item.offset, last >= first, last == min(item.limit, length - 1), last - first < Int64(Self.chunkBytes), length > last, length < 100_000_000_000,
              total == nil || total == length else { completionHandler(.cancel); fail(item, "RANGE_UNSUPPORTED"); return }
        total = length; item.expected = Int(last - first + 1)
        if let info = item.request.contentInformationRequest { info.contentType = UTType.mpeg4Audio.identifier; info.contentLength = length; info.isByteRangeAccessSupported = true }
        completionHandler(.allow)
    }
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard let item = loading[dataTask.taskIdentifier] else { return }
        guard item.bytes.count + data.count <= Self.chunkBytes, item.bytes.count + data.count <= item.expected else { fail(item, "RESPONSE_TOO_LARGE"); return }
        item.bytes.append(data)
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError failure: Error?) {
        guard let item = loading.removeValue(forKey: task.taskIdentifier), !stopped, !item.request.isCancelled else { return }
        guard failure == nil, item.expected > 0, item.bytes.count == item.expected else { fail(item, "TRANSPORT_ERROR"); return }
        if item.offset == 0 && item.bytes.count >= 8 && String(data: item.bytes.subdata(in: 4..<8), encoding: .ascii) != "ftyp" { fail(item, "CONTAINER_MISMATCH"); return }
        if let data = item.request.dataRequest {
            let available = max(0, (item.end ?? total ?? Int64.max) - item.offset)
            let count = min(item.bytes.count, Int(min(available, Int64(Self.chunkBytes))))
            if count > 0 { data.respond(with: item.bytes.prefix(count)); item.offset += Int64(count) }
        } else { item.request.finishLoading(); return }
        if item.offset >= min(item.end ?? Int64.max, total ?? Int64.max) { item.request.finishLoading() } else { fetch(item) }
    }
}
