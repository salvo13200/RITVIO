import UIKit
import WebKit

@UIApplicationMain
final class PCTestApp: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let window = UIWindow(frame:UIScreen.main.bounds); window.rootViewController = PCTestController(); self.window = window; window.makeKeyAndVisible(); return true
    }
    func applicationDidEnterBackground(_ application: UIApplication) { NativePlaybackOwner.shared.flush() }
    func applicationWillTerminate(_ application: UIApplication) { NativePlaybackOwner.shared.flush() }
}

final class LocalAssets: NSObject, WKURLSchemeHandler {
    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url, url.scheme == "ritvio12" else { task.didFailWithError(ResolverFailure.code("INVALID_ASSET")); return }
        let root: URL, relative: String
        if url.host == "bundle" { root = Bundle.main.bundleURL.appendingPathComponent("public"); relative = url.path == "/" ? "index.html" : String(url.path.dropFirst()) }
        else if url.host == "library", url.lastPathComponent.range(of:"^[a-fA-F0-9-]{36}\\.jpg$", options:.regularExpression) != nil { root = NativeLibraryStore.shared.artworkDirectory; relative = url.lastPathComponent }
        else { task.didFailWithError(ResolverFailure.code("INVALID_ASSET")); return }
        let file = root.appendingPathComponent(relative).standardizedFileURL
        guard file.path.hasPrefix(root.standardizedFileURL.path + "/"), !relative.contains("\\"), let bytes = try? Data(contentsOf:file), bytes.count <= 8 * 1024 * 1024 else { task.didFailWithError(ResolverFailure.code("INVALID_ASSET")); return }
        let types = ["html":"text/html", "js":"text/javascript", "css":"text/css", "json":"application/json", "png":"image/png", "jpg":"image/jpeg", "webp":"image/webp", "svg":"image/svg+xml", "ttf":"font/ttf"]
        task.didReceive(URLResponse(url:url, mimeType:types[file.pathExtension] ?? "application/octet-stream", expectedContentLength:bytes.count, textEncodingName:["html","js","css","json"].contains(file.pathExtension) ? "utf-8" : nil)); task.didReceive(bytes); task.didFinish()
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

final class WeakMessages: NSObject, WKScriptMessageHandler {
    weak var owner: PCTestController?
    init(_ owner: PCTestController) { self.owner = owner }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) { owner?.receive(message) }
}

final class PCTestController: UIViewController, WKNavigationDelegate {
    private var web: WKWebView!
    private let worker = DispatchQueue(label:"it.ritvio.pctest.library")
    private var picker: PCTestPhotoPicker?
    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
    override func viewDidLoad() {
        super.viewDidLoad(); view.backgroundColor = UIColor(red:15/255,green:17/255,blue:23/255,alpha:1)
        let configuration = WKWebViewConfiguration(); configuration.setURLSchemeHandler(LocalAssets(), forURLScheme:"ritvio12")
        configuration.userContentController.add(WeakMessages(self), name:"ritvio")
        web = WKWebView(frame:view.bounds,configuration:configuration); web.autoresizingMask = [.flexibleWidth,.flexibleHeight]; web.isOpaque = false; web.backgroundColor = view.backgroundColor
        web.scrollView.isScrollEnabled = false; web.scrollView.contentInsetAdjustmentBehavior = .never; web.navigationDelegate = self; view.addSubview(web)
        NativePlaybackOwner.shared.onSnapshot = { [weak self] value in self?.publish(["event":"playback","value":value]) }
        NativePlaybackOwner.shared.onTrackStarted = { [weak self] track in self?.library { try NativeLibraryStore.shared.remember(track) } }
        web.load(URLRequest(url:URL(string:"ritvio12://bundle/index.html")!))
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        decisionHandler(action.request.url?.scheme == "ritvio12" && action.request.url?.host == "bundle" ? .allow : .cancel)
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        // Older phones may discard the web process under memory pressure.
        // Recreate only the interface; the native player and library stay alive.
        webView.load(URLRequest(url:URL(string:"ritvio12://bundle/index.html")!))
    }
    private func publish(_ value: [String: Any]) {
        DispatchQueue.main.async {
            // Audio stays native while WKWebView is suspended. Do not accumulate
            // four snapshot scripts/second during locked-screen listening.
            if value["event"] != nil && UIApplication.shared.applicationState != .active { return }
            guard let bytes = try? JSONSerialization.data(withJSONObject:value), let text = String(data:bytes,encoding:.utf8) else { return }
            let safe = text.replacingOccurrences(of:"\u{2028}",with:"\\u2028").replacingOccurrences(of:"\u{2029}",with:"\\u2029")
            self.web.evaluateJavaScript("window.__ritvioReceive && window.__ritvioReceive(\(safe))",completionHandler:nil)
        }
    }
    private func reply(_ id: String, _ result: Result<[String: Any], ResolverFailure>) {
        switch result {
        case .success(let value): publish(["id":id,"ok":true,"value":value])
        case .failure(let error): publish(["id":id,"ok":false,"error":error.identifier])
        }
    }
    private func library(id: String? = nil, action: @escaping () throws -> LibraryState) {
        worker.async {
            do { let value = NativeLibraryStore.shared.snapshot(try action()); self.publish(["event":"library","value":value]); if let id { self.reply(id,.success(value)) } }
            catch { if let id { self.reply(id,.failure(error as? ResolverFailure ?? .code("LIBRARY_UNAVAILABLE"))) } }
        }
    }
    private func language() -> [String: Any] {
        ["schema":1, "preference":UserDefaults.standard.string(forKey:"pc.language") ?? "system", "systemLanguages":Array(Locale.preferredLanguages.prefix(20)), "revision":UserDefaults.standard.integer(forKey:"pc.languageRevision")]
    }
    func receive(_ message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, web.url?.scheme == "ritvio12", web.url?.host == "bundle",
              let input = message.body as? [String: Any], let id = input["id"] as? String, id.range(of:"^[0-9]{1,12}$",options:.regularExpression) != nil,
              let method = input["method"] as? String, let data = input["data"] as? [String: Any],
              let size = try? JSONSerialization.data(withJSONObject:data).count, size <= 4 * 1024 * 1024 else { return }
        let done: (Result<[String: Any], ResolverFailure>) -> Void = { self.reply(id,$0) }
        do {
            switch method {
            case "pcRead": ResolverWorker.shared.status(done)
            case "pcPair":
                guard let host = data["host"] as? String, let port = NativeLibraryStore.integer(data["port"]), let pin = data["pin"] as? String else { throw ResolverFailure.code("INVALID_PC_ADDRESS") }
                _ = try NativePlaybackOwner.shared.command("pause")
                ResolverWorker.shared.pair(host:host,port:port,pin:pin,complete:done)
            case "foundationStatus":
                let area = view.safeAreaInsets
                #if targetEnvironment(simulator)
                let environment = "simulator"
                #else
                let environment = "device"
                #endif
                done(.success(["platform":"ios","phase":"IOS-12-PC","version":"0.1.0","build":"1","bundleId":"it.ritvio.pctest","systemVersion":UIDevice.current.systemVersion,"environment":environment,"minimumOS":"12.0","bundledAssets":true,"textScale":UIFont.preferredFont(forTextStyle:.body).pointSize / 17,"safeArea":["top":area.top,"right":area.right,"bottom":area.bottom,"left":area.left],"capabilities":["resolver":false,"playback":true,"library":true,"lyrics":false,"sharing":false]]))
            case "foundationCheck": done(.success(["platform":"ios","nonce":data["nonce"] ?? ""]))
            case "languageRead": done(.success(language()))
            case "languageWrite":
                guard let value = data["preference"] as? String, ["system","en","it"].contains(value) else { throw ResolverFailure.code("LANGUAGE_NOT_READY") }
                UserDefaults.standard.set(value,forKey:"pc.language"); UserDefaults.standard.set(UserDefaults.standard.integer(forKey:"pc.languageRevision")+1,forKey:"pc.languageRevision")
                let state = language(); publish(["event":"language","value":state]); done(.success(state))
            case "search":
                guard let query = data["query"] as? String, let request = data["requestId"] as? String else { throw ResolverFailure.code("INVALID_QUERY") }
                ResolverWorker.shared.search(query:query,id:request) { result in done(result.flatMap { value in
                    guard let items = value["items"] as? [[String:Any]], items.count <= 20, items.allSatisfy({ (try? PlaybackTrack.decode($0)) != nil }) else { return .failure(.code("PC_RESPONSE_INVALID")) }; return .success(value)
                }) }
            case "cancelResolver": done(.success(["cancelled":ResolverWorker.shared.cancel(data["requestId"] as? String ?? "")]))
            case "snapshot": done(.success(NativePlaybackOwner.shared.snapshot()))
            case "playTracks":
                guard let items = data["items"] as? [[String:Any]], let index = NativeLibraryStore.integer(data["index"]) else { throw ResolverFailure.code("INVALID_QUEUE") }
                done(.success(try NativePlaybackOwner.shared.playTracks(items,index:index)))
            case "enqueue":
                guard let track = data["track"] as? [String:Any] else { throw ResolverFailure.code("INVALID_TRACK") }
                done(.success(try NativePlaybackOwner.shared.enqueue(track,next:data["next"] as? Bool ?? false)))
            case "command":
                guard let type = data["type"] as? String else { throw ResolverFailure.code("INVALID_COMMAND") }
                done(.success(try NativePlaybackOwner.shared.command(type,value:data["value"])))
            case "library": library(id:id) { try NativeLibraryStore.shared.read() }
            case "libraryCommand":
                guard let type = data["type"] as? String, ["like","create","rename","delete","add","remove","move","clearHistory"].contains(type) else { throw ResolverFailure.code("INVALID_LIBRARY_COMMAND") }
                library(id:id) { try NativeLibraryStore.shared.command(data) }
            case "saveQueue":
                let state = NativePlaybackOwner.shared.snapshot()
                guard state["queueRevision"] as? Int == NativeLibraryStore.integer(data["revision"]), let items = state["items"] as? [[String:Any]], let order = state["order"] as? [Int], !items.isEmpty else { throw ResolverFailure.code("QUEUE_CHANGED") }
                library(id:id) { try NativeLibraryStore.shared.command(["type":"createFromTracks","name":data["name"] ?? "","items":order.map { items[$0] }]) }
            case "chooseArtwork":
                guard data["kind"] as? String == "playlist", let playlist = data["id"] as? String, UUID(uuidString:playlist) != nil, let revision = NativeLibraryStore.integer(data["revision"]), picker == nil, presentedViewController == nil else { throw ResolverFailure.code("INVALID_ARTWORK_TARGET") }
                let picker = PCTestPhotoPicker(store:NativeLibraryStore.shared,id:playlist,revision:revision) { result in self.picker = nil; done(result) }
                self.picker = picker; picker.present(from:self)
            case "removeArtwork": library(id:id) { try NativeLibraryStore.shared.command(["type":"cover","id":data["id"] ?? "","revision":data["revision"] ?? -1]) }
            case "navigationState": web.allowsBackForwardNavigationGestures = data["canGoBack"] as? Bool ?? false; done(.success([:]))
            default: throw ResolverFailure.code("NOT_AVAILABLE_IN_PC_TEST")
            }
        } catch { done(.failure(error as? ResolverFailure ?? .code("NATIVE_REQUEST_FAILED"))) }
    }
}
