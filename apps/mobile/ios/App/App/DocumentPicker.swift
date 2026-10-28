import Foundation
import UIKit
import UniformTypeIdentifiers

final class PlaylistDocumentPicker: NSObject, UIDocumentPickerDelegate, UIAdaptivePresentationControllerDelegate {
    private let completion:(Result<PlaylistDocument?,ResolverFailure>)->Void
    private var finished=false
    private var selected=false
    init(completion:@escaping(Result<PlaylistDocument?,ResolverFailure>)->Void){self.completion=completion}
    func present(from controller:UIViewController) {
        let picker=UIDocumentPickerViewController(forOpeningContentTypes:[.json],asCopy:true)
        picker.allowsMultipleSelection=false;picker.delegate=self;picker.shouldShowFileExtensions=true
        controller.present(picker,animated:true);picker.presentationController?.delegate=self
    }
    private func finish(_ result:Result<PlaylistDocument?,ResolverFailure>) {guard !finished else{return};finished=true;completion(result)}
    func documentPickerWasCancelled(_ controller:UIDocumentPickerViewController){finish(.success(nil))}
    func presentationControllerDidDismiss(_ presentationController:UIPresentationController){if !selected{finish(.success(nil))}}
    func documentPicker(_ controller:UIDocumentPickerViewController,didPickDocumentsAt urls:[URL]) {
        guard urls.count==1,let url=urls.first,url.isFileURL else{finish(.failure(.code("PLAYLIST_FILE_INVALID")));return}
        selected=true
        DispatchQueue.global(qos:.userInitiated).async {
            let access=url.startAccessingSecurityScopedResource();defer{if access{url.stopAccessingSecurityScopedResource()}}
            var coordinationError:NSError?,result:Result<PlaylistDocument,Error>?
            NSFileCoordinator().coordinate(readingItemAt:url,options:[],error:&coordinationError){coordinated in
                result=Result {
                    let values=try coordinated.resourceValues(forKeys:[.isRegularFileKey,.isSymbolicLinkKey,.fileSizeKey])
                    guard values.isRegularFile==true,values.isSymbolicLink != true else{throw ResolverFailure.code("PLAYLIST_FILE_INVALID")}
                    if let size=values.fileSize,size>PlaylistDocument.fileLimit{throw ResolverFailure.code("PLAYLIST_FILE_TOO_LARGE")}
                    guard let stream=InputStream(url:coordinated) else{throw ResolverFailure.code("PLAYLIST_FILE_INVALID")}
                    stream.open();defer{stream.close()}
                    var data=Data(),buffer=[UInt8](repeating:0,count:8192)
                    while true{let count=stream.read(&buffer,maxLength:buffer.count);if count<0{throw ResolverFailure.code("PLAYLIST_FILE_INVALID")};if count==0{break};guard data.count+count<=PlaylistDocument.fileLimit else{throw ResolverFailure.code("PLAYLIST_FILE_TOO_LARGE")};data.append(contentsOf:buffer.prefix(count))}
                    return try PlaylistDocument.parse(data)
                }
            }
            DispatchQueue.main.async {
                if coordinationError != nil{self.finish(.failure(.code("PLAYLIST_FILE_UNAVAILABLE")));return}
                switch result{
                case .success(let value)?:self.finish(.success(value))
                case .failure(let error)?:self.finish(.failure((error as? ResolverFailure) ?? .code("PLAYLIST_FILE_INVALID")))
                case nil:self.finish(.failure(.code("PLAYLIST_FILE_UNAVAILABLE")))
                }
            }
        }
    }
}

/// Copies app-owned, bounded documents; destination and sharing are always chosen by the user.
final class DocumentExport: NSObject, UIDocumentPickerDelegate, UIAdaptivePresentationControllerDelegate {
    private weak var controller:UIViewController?
    private let completion:(Result<String,ResolverFailure>)->Void
    private var finished=false
    init(controller:UIViewController,completion:@escaping(Result<String,ResolverFailure>)->Void){self.controller=controller;self.completion=completion}
    func start(data:Data,filename:String,save:Bool){
        guard data.count<=PlaylistDocument.fileLimit,!filename.contains("/"),!filename.contains("\\"),filename.utf8.count<512 else{finish(.failure(.code("DOCUMENT_INVALID")));return}
        DispatchQueue.global(qos:.userInitiated).async{
            do{
                let root=FileManager.default.temporaryDirectory.appendingPathComponent("RITVIO-documents",isDirectory:true)
                try FileManager.default.createDirectory(at:root,withIntermediateDirectories:true)
                let owned=try FileManager.default.contentsOfDirectory(at:root,includingPropertiesForKeys:[.creationDateKey,.isDirectoryKey])
                    .filter{UUID(uuidString:$0.lastPathComponent) != nil && (try? $0.resourceValues(forKeys:[.isDirectoryKey]).isDirectory)==true}
                    .sorted{((try? $0.resourceValues(forKeys:[.creationDateKey]).creationDate) ?? .distantPast)<((try? $1.resourceValues(forKeys:[.creationDateKey]).creationDate) ?? .distantPast)}
                // Only UUID directories under this app-owned temporary root are removed.
                for folder in owned.prefix(max(0,owned.count-7)){try? FileManager.default.removeItem(at:folder)}
                let directory=root.appendingPathComponent(UUID().uuidString,isDirectory:true)
                try FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true)
                let file=directory.appendingPathComponent(filename);try data.write(to:file,options:[.atomic,.completeFileProtectionUntilFirstUserAuthentication])
                DispatchQueue.main.async{self.present(file,save:save)}
            }catch{DispatchQueue.main.async{self.finish(.failure(.code("DOCUMENT_EXPORT_FAILED")))}}
        }
    }
    private func present(_ file:URL,save:Bool){
        guard let controller,controller.view.window != nil,controller.presentedViewController==nil else{finish(.failure(.code("DOCUMENT_BUSY")));return}
        if save{
            let picker=UIDocumentPickerViewController(forExporting:[file],asCopy:true);picker.delegate=self;picker.shouldShowFileExtensions=true
            controller.present(picker,animated:true);picker.presentationController?.delegate=self
        }else{
            let sheet=UIActivityViewController(activityItems:[file],applicationActivities:nil)
            sheet.popoverPresentationController?.sourceView=controller.view
            sheet.popoverPresentationController?.sourceRect=CGRect(x:controller.view.bounds.midX,y:controller.view.bounds.midY,width:1,height:1)
            sheet.popoverPresentationController?.permittedArrowDirections=[]
            sheet.completionWithItemsHandler={_,completed,_,error in DispatchQueue.main.async{if error != nil{self.finish(.failure(.code("DOCUMENT_EXPORT_FAILED")))}else{self.finish(.success(completed ? "shared" : "cancelled"))}}}
            controller.present(sheet,animated:true);sheet.presentationController?.delegate=self
        }
    }
    private func finish(_ result:Result<String,ResolverFailure>){guard !finished else{return};finished=true;completion(result)}
    func documentPickerWasCancelled(_ controller:UIDocumentPickerViewController){finish(.success("cancelled"))}
    func presentationControllerDidDismiss(_ presentationController:UIPresentationController){finish(.success("cancelled"))}
    func documentPicker(_ controller:UIDocumentPickerViewController,didPickDocumentsAt urls:[URL]){finish(urls.isEmpty ? .success("cancelled") : .success("saved"))}
}
