import Foundation
import CoreFoundation
import Capacitor
import UIKit

extension RitvioPlaybackPlugin {
    @objc func choosePlaylistFile(_ call:CAPPluginCall){
        DispatchQueue.main.async{
            guard !self.documentBusy,self.documentPicker==nil,let controller=self.bridge?.viewController,controller.presentedViewController==nil else{call.reject("Another document is open","DOCUMENT_BUSY");return}
            self.documentBusy=true
            let picker=PlaylistDocumentPicker{result in
                self.documentPicker=nil;self.documentBusy=false
                switch result{
                case .success(nil):call.resolve(["cancelled":true])
                case .success(let document?):call.resolve(["cancelled":false,"preview":self.documents.prepare(document)])
                case .failure(let failure):self.lastDocumentError=failure.identifier;call.reject("Playlist file could not be read",failure.identifier)
                }
            }
            self.documentPicker=picker;picker.present(from:controller)
        }
    }
    @objc func cancelPlaylistImport(_ call:CAPPluginCall){guard let token=call.getString("token"),UUID(uuidString:token) != nil else{call.reject("Invalid import","IMPORT_EXPIRED");return};documents.cancel(token);call.resolve()}
    @objc func commitPlaylistImport(_ call:CAPPluginCall){
        guard let token=call.getString("token"),UUID(uuidString:token) != nil,let name=call.getString("name"),
              let raw=call.getArray("numbers"),raw.count<=1000,let skipValue=call.getValue("skipDuplicates") as? NSNumber,CFGetTypeID(skipValue)==CFBooleanGetTypeID(),
              raw.allSatisfy({NativeLibraryStore.integer($0) != nil}) else{call.reject("Invalid import selection","INVALID_IMPORT_SELECTION");return}
        let numbers=raw.compactMap{NativeLibraryStore.integer($0)}
        libraryWorker.async{
            do{
                let document=try self.documents.begin(token)
                do{
                    let selection=try document.selected(numbers,skipDuplicates:skipValue.boolValue)
                    let outcome=try NativeLibraryStore.shared.importPlaylist(name:name,description:document.description,tracks:selection.tracks,cover:document.cover)
                    self.documents.finish(token,success:true);self.emitLibrary(outcome.state)
                    call.resolve(["library":self.libraryValue(outcome.state),"playlistId":outcome.id,"added":selection.tracks.count,"skipped":selection.skipped])
                }catch{self.documents.finish(token,success:false);throw error}
            }catch{let code=(error as? ResolverFailure)?.identifier ?? "LIBRARY_WRITE_FAILED";DispatchQueue.main.async{self.lastDocumentError=code};call.reject("Import could not be saved",code)}
        }
    }
    @objc func exportPlaylistDocument(_ call:CAPPluginCall){
        guard let id=call.getString("id"),UUID(uuidString:id) != nil,let revision=NativeLibraryStore.integer(call.getValue("revision")),let save=call.getBool("save") else{call.reject("Playlist required","INVALID_LIBRARY_COMMAND");return}
        DispatchQueue.main.async{
            guard !self.documentBusy,let controller=self.bridge?.viewController,controller.presentedViewController==nil else{call.reject("Another document is open","DOCUMENT_BUSY");return}
            self.documentBusy=true
            self.libraryWorker.async{
                do{
                    let state=try NativeLibraryStore.shared.read()
                    guard let playlist=state.playlists.first(where:{$0.id==id}) else{throw ResolverFailure.code("PLAYLIST_MISSING")}
                    guard playlist.revision==revision else{throw ResolverFailure.code("PLAYLIST_CHANGED")}
                    var cover:Data?
                    if let file=playlist.coverFile{
                        guard NativeLibraryStore.validCover(file) else{throw ResolverFailure.code("PLAYLIST_COVER_INVALID")}
                        let url=NativeLibraryStore.shared.artworkDirectory.appendingPathComponent(file),values=try url.resourceValues(forKeys:[.fileSizeKey,.isRegularFileKey,.isSymbolicLinkKey])
                        guard values.isRegularFile==true,values.isSymbolicLink != true,(values.fileSize ?? Int.max)<=1024*1024 else{throw ResolverFailure.code("PLAYLIST_COVER_INVALID")}
                        cover=try Data(contentsOf:url)
                    }
                    let output=try PlaylistDocument.export(playlist,cover:cover),filename=PlaylistDocument.filename(playlist.name)
                    DispatchQueue.main.async{self.presentDocument(call,data:output.data,filename:filename,save:save,adjusted:output.adjusted,controller:controller)}
                }catch{let code=(error as? ResolverFailure)?.identifier ?? "DOCUMENT_EXPORT_FAILED";DispatchQueue.main.async{self.documentBusy=false;self.lastDocumentError=code;call.reject("Playlist export failed",code)}}
            }
        }
    }
    private func presentDocument(_ call:CAPPluginCall,data:Data,filename:String,save:Bool,adjusted:Int=0,controller:UIViewController){
        let exporter=DocumentExport(controller:controller){result in
            self.documentBusy=false;self.documentExporter=nil
            switch result{case .success(let status):call.resolve(["status":status,"filename":filename,"adjusted":adjusted]);case .failure(let error):self.lastDocumentError=error.identifier;call.reject("Document export failed",error.identifier)}
        }
        documentExporter=exporter;exporter.start(data:data,filename:filename,save:save)
    }
    @objc func prepareSupportReport(_ call:CAPPluginCall){
        DispatchQueue.main.async{
            let bundle=Bundle.main,codes=NativePlaybackOwner.shared.diagnosticCodes()
            let value:[String:Any]=["schema":1,"app":"RITVIO","platform":"ios","version":bundle.object(forInfoDictionaryKey:"CFBundleShortVersionString") as? String ?? "0.0.0",
                "build":bundle.object(forInfoDictionaryKey:"CFBundleVersion") as? String ?? "0","systemVersion":UIDevice.current.systemVersion,"minimumOS":"15.0",
                "capabilities":["library":true,"lyrics":true,"sharing":true,"timer":true,"discovery":true,"playlistFiles":true],
                "codes":["playback":Self.reportCode(codes["playback"]),"suggestions":Self.reportCode(codes["suggestions"]),"documents":Self.reportCode(self.lastDocumentError)]]
            do{let bytes=try JSONSerialization.data(withJSONObject:value,options:[.prettyPrinted,.sortedKeys]);guard bytes.count<=6000,let text=String(data:bytes,encoding:.utf8) else{throw ResolverFailure.code("REPORT_UNAVAILABLE")};call.resolve(self.documents.prepareReport(text))}
            catch{call.reject("Report unavailable","REPORT_UNAVAILABLE")}
        }
    }
    static func reportCode(_ code:String?)->String{
        guard let code else{return "NONE"}
        let known=Set(["NONE","RATE_LIMITED","PLAYBACK_TIMEOUT","UNSUPPORTED_STREAM","SOURCE_EXPIRED","TRANSPORT_ERROR","SEEK_FAILED","AUDIO_SESSION_UNAVAILABLE","PROVIDER_UNAVAILABLE","PROVIDER_REJECTED","PROVIDER_SIGN_IN_REQUIRED","PROVIDER_TOKEN_REQUIRED","FORMAT_UNAVAILABLE","JS_CHALLENGE_FAILED","BUSY","SUGGESTIONS_UNAVAILABLE","NO_SUGGESTIONS","QUEUE_FULL","PLAYLIST_FILE_INVALID","PLAYLIST_FILE_TOO_LARGE","PLAYLIST_FILE_UNAVAILABLE","PLAYLIST_COVER_INVALID","IMPORT_EXPIRED","LIBRARY_PLAYLIST_LIMIT","LIBRARY_TRACK_LIMIT","LIBRARY_WRITE_FAILED","DOCUMENT_EXPORT_FAILED","DOCUMENT_BUSY","PLAYLIST_CHANGED","PLAYLIST_MISSING","INVALID_IMPORT_SELECTION"])
        return known.contains(code) ? code : "OTHER"
    }
    @objc func useSupportReport(_ call:CAPPluginCall){
        guard let token=call.getString("token"),UUID(uuidString:token) != nil,let action=call.getString("action"),["copy","share"].contains(action) else{call.reject("Invalid report","REPORT_EXPIRED");return}
        DispatchQueue.main.async{
            do{
                let text=try self.documents.reportText(token)
                if action=="copy"{UIPasteboard.general.string=text;call.resolve(["status":"copied"]);return}
                guard !self.documentBusy,let controller=self.bridge?.viewController,controller.presentedViewController==nil else{throw ResolverFailure.code("DOCUMENT_BUSY")}
                self.documentBusy=true;self.presentDocument(call,data:Data(text.utf8),filename:"RITVIO-support-report.txt",save:false,controller:controller)
            }catch{call.reject("Report unavailable",(error as? ResolverFailure)?.identifier ?? "REPORT_UNAVAILABLE")}
        }
    }
    @objc func openSupportLink(_ call:CAPPluginCall){
        let links=["issues":"https://github.com/salvo13200/RITVIO/issues/new/choose","releases":"https://github.com/salvo13200/RITVIO/releases"]
        guard let kind=call.getString("kind"),let raw=links[kind],let url=URL(string:raw) else{call.reject("Invalid help link","INVALID_SUPPORT_LINK");return}
        DispatchQueue.main.async{UIApplication.shared.open(url,options:[:]){opened in if opened{call.resolve()}else{call.reject("Link unavailable","SUPPORT_LINK_UNAVAILABLE")}}}
    }
}
