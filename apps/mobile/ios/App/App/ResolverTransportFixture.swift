import Foundation

#if DEBUG
/// Synthetic in-process responses test the transport boundary, not provider access.
final class ResolverTransportFixture: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "fixture.googlevideo.com" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        guard let url = request.url else { return }
        let mode = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first?.value ?? "valid"
        let start = Int(request.value(forHTTPHeaderField: "Range")?.split(separator: "=").last?.split(separator: "-").first ?? "0") ?? 0
        let first = mode == "wrong-range" ? start + 200 : start
        let size = mode == "oversized" ? 2048 : mode == "truncated" ? 16 : 1024
        var data = Data(repeating: 0, count: size)
        data.replaceSubrange(4..<8, with: mode == "wrong-container" ? Data("oops".utf8) : Data("ftyp".utf8))
        let response = HTTPURLResponse(url: url, statusCode: mode == "whole-response" ? 200 : 206, httpVersion: "HTTP/1.1", headerFields: ["Content-Range": "bytes \(first)-\(first + 1023)/10000"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}

    static func verify() async throws -> [String: Any] {
        func descriptor(_ mode: String) -> [String: Any] { ["url": "https://fixture.googlevideo.com/probe?case=\(mode)", "headers": [String: String]()] }
        let first = try await ResolverStreamProbe.check(descriptor("valid"), protocols: [ResolverTransportFixture.self])
        let middle = try await ResolverStreamProbe.check(descriptor("valid"), start: 5000, protocols: [ResolverTransportFixture.self])
        guard first["bytes"] as? Int == 1024, middle["bytes"] as? Int == 1024 else { throw ResolverFailure.code("TRANSPORT_FIXTURE_FAILED") }
        var rejected = [String]()
        for (mode, expected) in [("whole-response", "RANGE_UNSUPPORTED"), ("wrong-range", "RANGE_UNSUPPORTED"), ("oversized", "PROBE_LIMIT_EXCEEDED"), ("truncated", "TRANSPORT_UNAVAILABLE"), ("wrong-container", "CONTAINER_MISMATCH")] {
            do { _ = try await ResolverStreamProbe.check(descriptor(mode), protocols: [ResolverTransportFixture.self]); throw ResolverFailure.code("TRANSPORT_FIXTURE_FAILED") }
            catch let error as ResolverFailure { guard error.identifier == expected else { throw error }; rejected.append(mode) }
        }
        do { _ = try await ResolverStreamProbe.check(["url": "https://untrusted.invalid/a"]); throw ResolverFailure.code("TRANSPORT_FIXTURE_FAILED") }
        catch let error as ResolverFailure { guard error.identifier == "INVALID_STREAM" else { throw error } }
        return ["synthetic": true, "nativeURLSession": true, "rangeBytes": 1024, "invalidResponsesRejected": rejected, "initialHostValidated": true]
    }
}
#endif
