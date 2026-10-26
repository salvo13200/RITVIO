import Foundation
import Security
import Darwin

enum ResolverFailure: Error {
    case code(String)
    var identifier: String { switch self { case let .code(value): return value } }
}

/// Only literal private IPv4 addresses are permitted; redirects are never followed.
final class PCRequest: NSObject, URLSessionDataDelegate {
    private var session: URLSession!
    private var bytes = Data()
    private var finished = false
    private var status = 0
    private let complete: (Result<[String: Any], ResolverFailure>) -> Void
    init(request: URLRequest, complete: @escaping (Result<[String: Any], ResolverFailure>) -> Void) {
        self.complete = complete; super.init()
        let config = URLSessionConfiguration.ephemeral
        config.urlCache = nil; config.httpCookieStorage = nil; config.httpShouldSetCookies = false
        config.timeoutIntervalForRequest = 65; config.timeoutIntervalForResource = 70
        let queue = OperationQueue(); queue.maxConcurrentOperationCount = 1
        session = URLSession(configuration: config, delegate: self, delegateQueue: queue)
        session.dataTask(with: request).resume()
    }
    private func finish(_ result: Result<[String: Any], ResolverFailure>) {
        guard !finished else { return }; finished = true
        session.invalidateAndCancel()
        DispatchQueue.main.async { self.complete(result) }
    }
    func cancel() { session.invalidateAndCancel() }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil); finish(.failure(.code("PC_REDIRECT_REJECTED")))
    }
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        guard let response = response as? HTTPURLResponse, response.expectedContentLength <= 512 * 1024 else {
            completionHandler(.cancel); finish(.failure(.code("PC_RESPONSE_INVALID"))); return
        }
        status = response.statusCode; completionHandler(.allow)
    }
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard bytes.count + data.count <= 512 * 1024 else { finish(.failure(.code("PC_RESPONSE_INVALID"))); return }
        bytes.append(data)
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error = error as NSError? { finish(.failure(.code(error.code == NSURLErrorCancelled ? "CANCELLED" : "PC_UNREACHABLE"))); return }
        guard let value = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any] else { finish(.failure(.code("PC_RESPONSE_INVALID"))); return }
        guard status == 200 else {
            let allowed = ["PC_PAIRING_REQUIRED", "PAIRING_FAILED", "RATE_LIMITED", "BUSY", "TRACK_UNAVAILABLE", "RESOLVER_FAILED", "RESOLVER_TIMEOUT", "UNSUPPORTED_STREAM"]
            let code = (value["error"] as? [String: Any])?["code"] as? String ?? "PC_REQUEST_FAILED"
            finish(.failure(.code(allowed.contains(code) ? code : "PC_REQUEST_FAILED"))); return
        }
        finish(.success(value))
    }
}

final class ResolverWorker {
    static let shared = ResolverWorker()
    private var requests: [String: PCRequest] = [:]
    private var host = UserDefaults.standard.string(forKey: "pc.host") ?? ""
    private var port = UserDefaults.standard.integer(forKey: "pc.port")
    private var token = ResolverWorker.keychainRead() ?? ""
    var connected: Bool { !host.isEmpty && token.count == 64 && port > 0 }
    var address: String { host }
    var serverPort: Int { port > 0 ? port : 59212 }
    static func privateHost(_ host: String) -> Bool {
        var address = in_addr()
        guard inet_pton(AF_INET, host, &address) == 1 else { return false }
        let parts = host.split(separator: ".").compactMap { Int($0) }
        guard parts.count == 4, parts.map(String.init).joined(separator: ".") == host else { return false }
        return parts[0] == 10 || parts[0] == 127 || parts[0] == 192 && parts[1] == 168 || parts[0] == 172 && (16...31).contains(parts[1])
    }
    private static let keyQuery: [String: Any] = [kSecClass as String:kSecClassGenericPassword, kSecAttrService as String:"it.ritvio.pctest", kSecAttrAccount as String:"pc-session"]
    private static func keychainRead() -> String? {
        var query = keyQuery; query[kSecReturnData as String] = true; query[kSecMatchLimit as String] = kSecMatchLimitOne
        var output: CFTypeRef?; guard SecItemCopyMatching(query as CFDictionary, &output) == errSecSuccess, let data = output as? Data else { return nil }
        return String(data:data, encoding:.utf8)
    }
    private static func keychainWrite(_ value: String) -> Bool {
        var query = keyQuery; query[kSecValueData as String] = Data(value.utf8); query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let result = SecItemAdd(query as CFDictionary, nil)
        if result == errSecDuplicateItem { return SecItemUpdate(keyQuery as CFDictionary, [kSecValueData as String:Data(value.utf8)] as CFDictionary) == errSecSuccess }
        return result == errSecSuccess
    }
    func pair(host: String, port: Int, pin: String, complete: @escaping (Result<[String: Any], ResolverFailure>) -> Void) {
        guard Self.privateHost(host), (1024...65535).contains(port), pin.range(of:"^[0-9]{6}$", options:.regularExpression) != nil else { complete(.failure(.code("INVALID_PC_ADDRESS"))); return }
        send(path:"/v1/pair", body:["pin":pin], id:"pc-pair", destination:(host,port), authorization:nil) { result in
            switch result {
            case .success(let value):
                guard let token = value["token"] as? String, token.range(of:"^[a-f0-9]{64}$", options:.regularExpression) != nil,
                      value["protocol"] as? Int == 1, value["mode"] as? String == "ios12-pc-test", Self.keychainWrite(token) else { complete(.failure(.code("PC_RESPONSE_INVALID"))); return }
                self.host = host; self.port = port; self.token = token
                UserDefaults.standard.set(host, forKey:"pc.host"); UserDefaults.standard.set(port, forKey:"pc.port")
                complete(.success(["connected":true]))
            case .failure(let error): complete(.failure(error))
            }
        }
    }
    func status(_ complete: @escaping (Result<[String: Any], ResolverFailure>) -> Void) {
        guard connected else { complete(.success(["connected":false,"host":host,"port":serverPort])); return }
        send(path:"/v1/status", body:nil, id:"pc-status") { result in
            switch result {
            case .success(let value):
                guard value["protocol"] as? Int == 1, value["mode"] as? String == "ios12-pc-test" else { complete(.failure(.code("PC_RESPONSE_INVALID"))); return }
                complete(.success(["connected":true,"host":self.host,"port":self.serverPort]))
            case .failure(let error): complete(.failure(error))
            }
        }
    }
    func perform(_ payload: [String: Any], requestID: String = UUID().uuidString, budget: Int = 60000, completion: @escaping (Result<[String: Any], ResolverFailure>) -> Void) {
        guard connected else { completion(.failure(.code("PC_PAIRING_REQUIRED"))); return }
        guard payload["operation"] as? String == "resolve", let videoId = payload["videoId"] as? String,
              videoId.range(of:"^[A-Za-z0-9_-]{11}$", options:.regularExpression) != nil else { completion(.failure(.code("INVALID_ARGUMENT"))); return }
        send(path:"/v1/resolve", body:["videoId":videoId,"refresh":payload["refresh"] as? Bool ?? false], id:requestID, complete:completion)
    }
    func search(query: String, id: String, complete: @escaping (Result<[String: Any], ResolverFailure>) -> Void) {
        guard connected else { complete(.failure(.code("PC_PAIRING_REQUIRED"))); return }
        guard (3...200).contains(query.trimmingCharacters(in:.whitespacesAndNewlines).count) else { complete(.failure(.code("INVALID_QUERY"))); return }
        send(path:"/v1/search", body:["query":query], id:id, complete:complete)
    }
    @discardableResult func cancel(_ id: String) -> Bool { guard let request = requests[id] else { return false }; request.cancel(); return true }
    private func send(path: String, body: [String: Any]?, id: String, destination: (String,Int)? = nil, authorization: String? = "stored", complete: @escaping (Result<[String: Any], ResolverFailure>) -> Void) {
        guard Thread.isMainThread, requests.count < 8, requests[id] == nil, id.count <= 128 else { complete(.failure(.code("BUSY"))); return }
        let target = destination ?? (host,port)
        guard Self.privateHost(target.0), let url = URL(string:"http://\(target.0):\(target.1)\(path)") else { complete(.failure(.code("INVALID_PC_ADDRESS"))); return }
        var request = URLRequest(url:url); request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = path == "/v1/status" ? 3 : path == "/v1/pair" ? 10 : 60
        request.httpMethod = body == nil ? "GET" : "POST"
        if let body { request.httpBody = try? JSONSerialization.data(withJSONObject:body); request.setValue("application/json",forHTTPHeaderField:"Content-Type") }
        if authorization != nil { request.setValue("Bearer \(token)",forHTTPHeaderField:"Authorization") }
        requests[id] = PCRequest(request:request) { result in self.requests.removeValue(forKey:id); complete(result) }
    }
}
