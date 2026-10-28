import Foundation
import CoreFoundation
import ImageIO
import UniformTypeIdentifiers

/// Metadata interchange only. No endpoints, media bytes or file paths are admitted.
struct PlaylistDocument {
    static let fileLimit = 4 * 1024 * 1024
    static let coverLimit = 196608
    let name: String
    let description: String
    let tracks: [PlaybackTrack]
    let cover: Data?
    let adjusted: Int

    static func bounded(_ value:String,units:Int,bytes:Int)->String {
        var result=""
        for character in value {
            let next=String(character)
            if result.utf16.count+next.utf16.count>units || result.utf8.count+next.utf8.count>bytes { break }
            result += next
        }
        return result
    }
    static func jpeg(_ data:Data) throws -> Data {
        guard data.count <= 1024*1024,let source=CGImageSourceCreateWithData(data as CFData,nil),CGImageSourceGetCount(source)==1,
              let properties=CGImageSourceCopyPropertiesAtIndex(source,0,nil) as? [CFString:Any],
              let width=properties[kCGImagePropertyPixelWidth] as? Int,let height=properties[kCGImagePropertyPixelHeight] as? Int,
              width>0,height>0,width<=8192,height<=8192,width*height<=32_000_000 else { throw ResolverFailure.code("PLAYLIST_COVER_INVALID") }
        for size in [640,512,384,256] {
            guard let image=CGImageSourceCreateThumbnailAtIndex(source,0,[kCGImageSourceCreateThumbnailFromImageAlways:true,kCGImageSourceCreateThumbnailWithTransform:true,kCGImageSourceThumbnailMaxPixelSize:size] as CFDictionary) else { continue }
            let data=NSMutableData()
            guard let destination=CGImageDestinationCreateWithData(data,UTType.jpeg.identifier as CFString,1,nil) else { continue }
            CGImageDestinationAddImage(destination,image,[kCGImageDestinationLossyCompressionQuality:0.72] as CFDictionary)
            if CGImageDestinationFinalize(destination),data.length<=140*1024 { return data as Data }
        }
        throw ResolverFailure.code("PLAYLIST_COVER_INVALID")
    }
    static func parse(_ data:Data) throws -> PlaylistDocument {
        guard data.count<=fileLimit,let root=try? JSONSerialization.jsonObject(with:data) as? [String:Any],
              Set(root.keys)==Set(["format","version","exportedAt","playlist"]),root["format"] as? String == "ritvio-playlist",
              let version=NativeLibraryStore.integer(root["version"]),version==1,let date=root["exportedAt"] as? String,date.count<=60,
              let source=root["playlist"] as? [String:Any],Set(source.keys)==Set(["name","description","cover","tracks"]),
              let rawName=source["name"] as? String,!rawName.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,rawName.unicodeScalars.count<=100,
              let rawDescription=source["description"] as? String,rawDescription.unicodeScalars.count<=1000,
              let rows=source["tracks"] as? [[String:Any]],rows.count<=1000 else { throw ResolverFailure.code("PLAYLIST_FILE_INVALID") }
        let formatter=ISO8601DateFormatter();formatter.formatOptions=[.withInternetDateTime,.withFractionalSeconds]
        if formatter.date(from:date)==nil { formatter.formatOptions=[.withInternetDateTime];guard formatter.date(from:date) != nil else { throw ResolverFailure.code("PLAYLIST_FILE_INVALID") } }
        let name=bounded(rawName.trimmingCharacters(in:.whitespacesAndNewlines),units:100,bytes:400),description=bounded(rawDescription,units:1000,bytes:4000)
        guard !name.isEmpty else { throw ResolverFailure.code("PLAYLIST_FILE_INVALID") }
        var tracks:[PlaybackTrack]=[],adjusted=(name != rawName || description != rawDescription) ? 1 : 0
        for row in rows {
            guard Set(row.keys)==Set(["videoId","title","artist","duration"]),let id=row["videoId"] as? String,
                  let title=row["title"] as? String,title.unicodeScalars.count<=1000,!title.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,
                  let artist=row["artist"] as? String,artist.unicodeScalars.count<=1000,!artist.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,
                  let duration=row["duration"] as? NSNumber,CFGetTypeID(duration) != CFBooleanGetTypeID(),duration.doubleValue.isFinite,(0...31536000).contains(duration.doubleValue) else { throw ResolverFailure.code("PLAYLIST_FILE_INVALID") }
            let cleanTitle=bounded(title.trimmingCharacters(in:.whitespacesAndNewlines),units:1000,bytes:1024),cleanArtist=bounded(artist.trimmingCharacters(in:.whitespacesAndNewlines),units:1000,bytes:1024),seconds=min(86400,duration.doubleValue)
            let track=try PlaybackTrack.decode(["videoId":id,"title":cleanTitle,"artist":cleanArtist,"duration":seconds,"thumbnail":"https://i.ytimg.com/vi/\(id)/hqdefault.jpg"])
            if cleanTitle != title || cleanArtist != artist || seconds != duration.doubleValue { adjusted += 1 }
            tracks.append(track)
        }
        var cover:Data?
        if !(source["cover"] is NSNull) {
            guard let text=source["cover"] as? String,text.utf8.count<=coverLimit,
                  text.range(of:"\\Adata:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}\\z",options:.regularExpression) != nil,
                  let encoded=text.split(separator:",",maxSplits:1).last,let bytes=Data(base64Encoded:String(encoded)) else { throw ResolverFailure.code("PLAYLIST_COVER_INVALID") }
            cover=try jpeg(bytes)
        }
        return PlaylistDocument(name:name,description:description,tracks:tracks,cover:cover,adjusted:adjusted)
    }
    func selected(_ numbers:[Int],skipDuplicates:Bool) throws -> (tracks:[PlaybackTrack],skipped:Int) {
        guard numbers.count<=1000,Set(numbers).count==numbers.count,numbers.allSatisfy({$0>=1 && $0<=tracks.count}) else { throw ResolverFailure.code("INVALID_IMPORT_SELECTION") }
        var chosen:[PlaybackTrack]=[],seen=Set<String>(),skipped=0
        for number in numbers.sorted() { let track=tracks[number-1];if skipDuplicates && seen.contains(track.videoId) { skipped += 1;continue };seen.insert(track.videoId);chosen.append(track) }
        guard !chosen.isEmpty,chosen.count<=NativeLibraryStore.maxTracks else { throw ResolverFailure.code("LIBRARY_TRACK_LIMIT") }
        return (chosen,skipped)
    }
    func preview(token:String)->[String:Any] {
        ["token":token,"name":name,"description":description,"cover":cover.map{"data:image/jpeg;base64,"+$0.base64EncodedString()} as Any? ?? NSNull(),"adjusted":adjusted,
         "entries":tracks.enumerated().map{["number":$0.offset+1,"track":$0.element.json]}]
    }
    static func export(_ playlist:LibraryPlaylist,cover:Data?) throws -> (data:Data,adjusted:Int) {
        var adjusted=0
        let rows:[[String:Any]]=playlist.items.map { track in
            let title=bounded(track.title,units:1000,bytes:4000),artist=bounded(track.artist.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty ? "Unknown artist" : track.artist,units:1000,bytes:4000)
            if title != track.title || artist != track.artist { adjusted += 1 }
            return ["videoId":track.videoId,"title":title,"artist":artist,"duration":track.duration]
        }
        let cleanName=bounded(playlist.name,units:100,bytes:400),cleanDescription=bounded(playlist.description,units:1000,bytes:4000)
        if cleanName != playlist.name || cleanDescription != playlist.description { adjusted += 1 }
        let image=try cover.map(jpeg)
        let value:[String:Any]=["format":"ritvio-playlist","version":1,"exportedAt":ISO8601DateFormatter().string(from:Date()),"playlist":["name":cleanName,"description":cleanDescription,"cover":image.map{"data:image/jpeg;base64,"+$0.base64EncodedString()} as Any? ?? NSNull(),"tracks":rows]]
        let data=try JSONSerialization.data(withJSONObject:value,options:[.prettyPrinted,.sortedKeys])
        guard data.count<=fileLimit else { throw ResolverFailure.code("PLAYLIST_FILE_TOO_LARGE") }
        return (data,adjusted)
    }
    static func filename(_ name:String)->String {
        var value=name.precomposedStringWithCompatibilityMapping.replacingOccurrences(of:"[<>:\"/\\\\|?*\\x00-\\x1f]",with:" ",options:.regularExpression).trimmingCharacters(in:.whitespacesAndNewlines)
        value=String(value.prefix(80)).replacingOccurrences(of:"[. ]+$",with:"",options:.regularExpression)
        if value.isEmpty || value.range(of:"\\A(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\\.|\\z)",options:[.regularExpression,.caseInsensitive]) != nil { value="Playlist "+(value.isEmpty ? "RITVIO" : value) }
        return value+".ritvio.json"
    }
}

/// One bounded import and one immutable reviewed report, each expiring after ten minutes.
final class PlaylistDocumentSession {
    private let lock=NSLock()
    private var imported:(token:String,value:PlaylistDocument,expiry:Double,committing:Bool)?
    private var report:(token:String,text:String,expiry:Double)?
    func prepare(_ value:PlaylistDocument)->[String:Any] { lock.lock();defer{lock.unlock()};let token=UUID().uuidString;imported=(token,value,PlaybackTimerClock.now()+600,false);return value.preview(token:token) }
    func begin(_ token:String) throws -> PlaylistDocument {
        lock.lock();defer{lock.unlock()}
        guard let value=imported,value.token==token,value.expiry>PlaybackTimerClock.now(),!value.committing else { throw ResolverFailure.code("IMPORT_EXPIRED") }
        imported?.committing=true;return value.value
    }
    func finish(_ token:String,success:Bool) { lock.lock();defer{lock.unlock()};if imported?.token==token { if success { imported=nil } else { imported?.committing=false } } }
    func cancel(_ token:String) { lock.lock();defer{lock.unlock()};if imported?.token==token && imported?.committing==false { imported=nil } }
    func prepareReport(_ text:String)->[String:Any] {lock.lock();defer{lock.unlock()};let token=UUID().uuidString;report=(token,text,PlaybackTimerClock.now()+600);return ["token":token,"text":text]}
    func reportText(_ token:String) throws -> String {lock.lock();defer{lock.unlock()};guard let report,report.token==token,report.expiry>PlaybackTimerClock.now() else {throw ResolverFailure.code("REPORT_EXPIRED")};return report.text}
}
