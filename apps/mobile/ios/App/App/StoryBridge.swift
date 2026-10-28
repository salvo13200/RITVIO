import Foundation
import Capacitor
import UIKit
import Photos
import ImageIO
import UniformTypeIdentifiers

/// Story operations never access the native playback owner or music resolver.
extension RitvioPlaybackPlugin {
    @objc func storyArtwork(_ call: CAPPluginCall) {
        guard let id = call.getString("requestId"), id.range(of:"\\A[a-f0-9]{32}\\z",options:.regularExpression) != nil,
              let raw = call.getString("thumbnail"), let url = StoryArtworkFetch.allowedURL(raw) else { call.reject("Cover unavailable", "STORY_ARTWORK_INVALID"); return }
        DispatchQueue.main.async {
            self.storyArtworkFetch?.cancel()
            let fetch = StoryArtworkFetch(id:id,url:url) { [weak self] result in
                if self?.storyArtworkFetch?.id == id { self?.storyArtworkFetch = nil }
                switch result {
                case .success(let bytes): call.resolve(["dataUrl":"data:image/jpeg;base64," + bytes.base64EncodedString()])
                case .failure(let failure): call.reject("Cover unavailable",failure.identifier)
                }
            }
            self.storyArtworkFetch = fetch; fetch.start()
        }
    }
    @objc func cancelStoryArtwork(_ call: CAPPluginCall) {
        guard let id = call.getString("requestId") else { call.reject("Missing request", "STORY_ARTWORK_INVALID"); return }
        DispatchQueue.main.async {
            let matches = self.storyArtworkFetch?.id == id
            if matches { self.storyArtworkFetch?.cancel() }
            call.resolve(["cancelled":matches])
        }
    }
    @objc func exportStory(_ call: CAPPluginCall) {
        guard let base64 = call.getString("base64"), base64.utf8.count <= 12_000_000,
              let save = call.getBool("save") else { call.reject("Invalid story", "STORY_INVALID_IMAGE"); return }
        DispatchQueue.main.async {
            guard self.storyExporter == nil, let controller = self.bridge?.viewController,
                  controller.view.window != nil, controller.presentedViewController == nil else { call.reject("Another export is open", "STORY_BUSY"); return }
            let exporter = StoryImageExport(controller:controller) { [weak self] result in
                self?.storyExporter = nil
                switch result {
                case .success(let value): call.resolve(value)
                case .failure(let failure): call.reject("Image could not be exported",failure.identifier)
                }
            }
            self.storyExporter = exporter; exporter.start(base64:base64,save:save)
        }
    }
    @objc func storyOpenSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string:UIApplication.openSettingsURLString) else { call.reject("Settings unavailable", "STORY_SETTINGS_UNAVAILABLE"); return }
            UIApplication.shared.open(url,options:[:]) { opened in
                if opened { call.resolve() } else { call.reject("Settings unavailable", "STORY_SETTINGS_UNAVAILABLE") }
            }
        }
    }
}

/// Dedicated finite HTTPS image request with no cookies, redirects or credentials.
final class StoryArtworkFetch: NSObject, URLSessionDataDelegate {
    let id: String
    private let url: URL
    private let completion: (Result<Data,ResolverFailure>) -> Void
    private let queue = DispatchQueue(label:"it.ritvio.story-artwork",qos:.userInitiated)
    private var session: URLSession?
    private var task: URLSessionDataTask?
    private var timeout: DispatchWorkItem?
    private var bytes = Data()
    private var finished = false
    init(id:String,url:URL,completion:@escaping(Result<Data,ResolverFailure>)->Void) { self.id=id;self.url=url;self.completion=completion;super.init() }
    static func allowedURL(_ raw:String) -> URL? {
        guard raw.utf8.count <= 4096, !raw.unicodeScalars.contains(where:CharacterSet.controlCharacters.contains),
              let parts = URLComponents(string:raw), parts.scheme == "https", parts.user == nil, parts.password == nil,
              parts.fragment == nil, parts.port == nil || parts.port == 443, let host = parts.host?.lowercased(),
              [".googleusercontent.com",".ytimg.com",".ggpht.com"].contains(where:host.hasSuffix) else { return nil }
        return parts.url
    }
    func start() {
        queue.async {
            guard !self.finished else { return }
            let config = URLSessionConfiguration.ephemeral
            config.timeoutIntervalForRequest=8;config.timeoutIntervalForResource=12
            config.httpShouldSetCookies=false;config.httpCookieStorage=nil;config.urlCredentialStorage=nil;config.urlCache=nil
            let delegateQueue=OperationQueue();delegateQueue.maxConcurrentOperationCount=1;delegateQueue.underlyingQueue=self.queue
            self.session=URLSession(configuration:config,delegate:self,delegateQueue:delegateQueue)
            var request=URLRequest(url:self.url,cachePolicy:.reloadIgnoringLocalCacheData,timeoutInterval:8)
            request.setValue("image/jpeg,image/png,image/webp",forHTTPHeaderField:"Accept")
            self.task=self.session?.dataTask(with:request)
            let timeout=DispatchWorkItem { [weak self] in self?.finish(.failure(.code("STORY_ARTWORK_UNAVAILABLE"))) }
            self.timeout=timeout;self.queue.asyncAfter(deadline:.now()+12,execute:timeout)
            self.task?.resume()
        }
    }
    func cancel() { queue.async { self.finish(.failure(.code("STORY_CANCELLED"))) } }
    private func finish(_ result:Result<Data,ResolverFailure>) {
        guard !finished else { return };finished=true;timeout?.cancel();timeout=nil
        task?.cancel();task=nil;session?.invalidateAndCancel();session=nil;bytes.removeAll(keepingCapacity:false)
        DispatchQueue.main.async { self.completion(result) }
    }
    func urlSession(_ session:URLSession,task:URLSessionTask,willPerformHTTPRedirection response:HTTPURLResponse,newRequest request:URLRequest,completionHandler:@escaping(URLRequest?)->Void) {
        completionHandler(nil);finish(.failure(.code("STORY_ARTWORK_UNAVAILABLE")))
    }
    func urlSession(_ session:URLSession,dataTask:URLSessionDataTask,didReceive response:URLResponse,completionHandler:@escaping(URLSession.ResponseDisposition)->Void) {
        guard !finished, let http=response as? HTTPURLResponse, http.statusCode == 200,
              http.expectedContentLength <= 2 * 1024 * 1024,
              ["image/jpeg","image/png","image/webp"].contains(http.mimeType?.lowercased() ?? "") else {
            completionHandler(.cancel);finish(.failure(.code("STORY_ARTWORK_UNAVAILABLE")));return
        }
        completionHandler(.allow)
    }
    func urlSession(_ session:URLSession,dataTask:URLSessionDataTask,didReceive data:Data) {
        guard !finished else { return }
        guard bytes.count + data.count <= 2 * 1024 * 1024 else { finish(.failure(.code("STORY_ARTWORK_UNAVAILABLE")));return }
        bytes.append(data)
    }
    func urlSession(_ session:URLSession,task:URLSessionTask,didCompleteWithError error:Error?) {
        guard !finished else { return }
        do {
            guard error == nil, !bytes.isEmpty, let source=CGImageSourceCreateWithData(bytes as CFData,nil),
                  let properties=CGImageSourceCopyPropertiesAtIndex(source,0,nil) as? [CFString:Any],
                  let width=properties[kCGImagePropertyPixelWidth] as? Int,let height=properties[kCGImagePropertyPixelHeight] as? Int,
                  width > 0,height > 0,width <= 8192,height <= 8192,width * height <= 32_000_000 else { throw ResolverFailure.code("STORY_ARTWORK_UNAVAILABLE") }
            let output=try LibraryArtworkPicker.encode(bytes)
            finish(.success(output))
        } catch { finish(.failure(.code("STORY_ARTWORK_UNAVAILABLE"))) }
    }
}

/// Only explicit Save requests Photos add-only permission. Share uses iOS's sheet.
final class StoryImageExport {
    private weak var controller: UIViewController?
    private let completion:(Result<[String:Any],ResolverFailure>)->Void
    private var finished=false
    init(controller:UIViewController,completion:@escaping(Result<[String:Any],ResolverFailure>)->Void){self.controller=controller;self.completion=completion}
    func start(base64:String,save:Bool) {
        DispatchQueue.global(qos:.userInitiated).async {
            do {
                let png=try Self.normalizedPNG(base64)
                DispatchQueue.main.async {
                    if save { self.save(png) } else { self.share(png) }
                }
            } catch { DispatchQueue.main.async { self.finish(.failure(.code("STORY_INVALID_IMAGE"))) } }
        }
    }
    static func normalizedPNG(_ base64:String) throws -> Data {
        guard base64.utf8.count <= 12_000_000, let data=Data(base64Encoded:base64),data.count <= 8 * 1024 * 1024,
              data.starts(with:[137,80,78,71,13,10,26,10]),let source=CGImageSourceCreateWithData(data as CFData,nil),
              CGImageSourceGetCount(source)==1,CGImageSourceGetType(source) as String? == UTType.png.identifier,
              let properties=CGImageSourceCopyPropertiesAtIndex(source,0,nil) as? [CFString:Any],
              properties[kCGImagePropertyPixelWidth] as? Int == 1080,properties[kCGImagePropertyPixelHeight] as? Int == 1920,
              let image=CGImageSourceCreateImageAtIndex(source,0,[kCGImageSourceShouldCache:false] as CFDictionary) else { throw ResolverFailure.code("STORY_INVALID_IMAGE") }
        let output=NSMutableData()
        guard let destination=CGImageDestinationCreateWithData(output,UTType.png.identifier as CFString,1,nil) else { throw ResolverFailure.code("STORY_INVALID_IMAGE") }
        // Pass pixels only, never source text chunks, camera tags or location data.
        CGImageDestinationAddImage(destination,image,nil)
        guard CGImageDestinationFinalize(destination),output.length <= 8 * 1024 * 1024 else { throw ResolverFailure.code("STORY_INVALID_IMAGE") }
        return output as Data
    }
    private func finish(_ result:Result<[String:Any],ResolverFailure>) {
        guard !finished else { return };finished=true;completion(result)
    }
    private func save(_ png:Data) {
        let proceed:(PHAuthorizationStatus)->Void = { status in
            guard status == .authorized || status == .limited else {
                DispatchQueue.main.async { self.finish(.failure(.code("STORY_PHOTOS_DENIED"))) };return
            }
            PHPhotoLibrary.shared().performChanges({
                let options=PHAssetResourceCreationOptions();options.originalFilename="RITVIO-card.png"
                PHAssetCreationRequest.forAsset().addResource(with:.photo,data:png,options:options)
            }) { success,_ in
                DispatchQueue.main.async {
                    if success { self.finish(.success(["status":"saved","destination":"photos"])) }
                    else { self.finish(.failure(.code("STORY_SAVE_FAILED"))) }
                }
            }
        }
        let status=PHPhotoLibrary.authorizationStatus(for:.addOnly)
        if status == .notDetermined { PHPhotoLibrary.requestAuthorization(for:.addOnly,handler:proceed) }
        else { proceed(status) }
    }
    private func share(_ png:Data) {
        guard let controller,controller.view.window != nil,controller.presentedViewController == nil else { finish(.failure(.code("STORY_BUSY")));return }
        do {
            let root=FileManager.default.temporaryDirectory.appendingPathComponent("RITVIO-story-export",isDirectory:true)
            try FileManager.default.createDirectory(at:root,withIntermediateDirectories:true)
            let folders=try FileManager.default.contentsOfDirectory(at:root,includingPropertiesForKeys:[.creationDateKey,.isDirectoryKey])
                .filter { UUID(uuidString:$0.lastPathComponent) != nil && (try? $0.resourceValues(forKeys:[.isDirectoryKey]).isDirectory) == true }
                .sorted { ((try? $0.resourceValues(forKeys:[.creationDateKey]).creationDate) ?? .distantPast) < ((try? $1.resourceValues(forKeys:[.creationDateKey]).creationDate) ?? .distantPast) }
            // Root and names are app-owned; never inspect or remove arbitrary files.
            for folder in folders.prefix(max(0,folders.count-7)) { try? FileManager.default.removeItem(at:folder) }
            let directory=root.appendingPathComponent(UUID().uuidString,isDirectory:true)
            try FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true)
            let file=directory.appendingPathComponent("RITVIO-card.png")
            try png.write(to:file,options:[.atomic,.completeFileProtectionUntilFirstUserAuthentication])
            let activity=UIActivityViewController(activityItems:[file],applicationActivities:nil)
            activity.popoverPresentationController?.sourceView=controller.view
            activity.popoverPresentationController?.sourceRect=CGRect(x:controller.view.bounds.midX,y:controller.view.bounds.midY,width:1,height:1)
            activity.popoverPresentationController?.permittedArrowDirections=[]
            activity.completionWithItemsHandler = { _,completed,_,error in
                DispatchQueue.main.async {
                    if error != nil { self.finish(.failure(.code("STORY_SHARE_FAILED"))) }
                    else { self.finish(.success(["status":completed ? "shared" : "cancelled"])) }
                }
            }
            controller.present(activity,animated:true)
        } catch { finish(.failure(.code("STORY_SHARE_FAILED"))) }
    }
}
