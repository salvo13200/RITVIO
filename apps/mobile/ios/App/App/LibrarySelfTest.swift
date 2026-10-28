import Foundation
import UIKit
import ImageIO
import UniformTypeIdentifiers

enum LibrarySelfTest {
    #if DEBUG
    static func run() throws -> [String: Any] {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("library-check-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let path = folder.appendingPathComponent("library.json"), store = NativeLibraryStore(file: path)
        func require(_ condition: Bool, line: Int = #line) throws { if !condition { throw ResolverFailure.code("LIBRARY_SELF_TEST_FAILED_\(line)") } }
        func rejects(_ code: String, _ action: () throws -> Void) throws {
            do { try action(); throw ResolverFailure.code("LIBRARY_SELF_TEST_FAILED") }
            catch let error as ResolverFailure { try require(error.identifier == code) }
        }
        let track: [String: Any] = ["videoId":"abcdefghijk", "title":"Original library fixture", "artist":"RITVIO tests", "thumbnail":"", "duration":90,
            "url":"https://must-not-persist.invalid/signed", "headers":["Authorization":"must-not-persist"]]
        let second: [String: Any] = ["videoId":"bcdefghijkl", "title":"Second fixture", "artist":"RITVIO tests", "thumbnail":"", "duration":80]
        try require(store.read().playlists.isEmpty)
        var state = try store.command(["type":"create", "name":"  Night drive  "])
        let id = state.playlists[0].id
        try require(state.playlists[0].name == "Night drive")
        state = try store.command(["type":"add", "id":id, "revision":1, "track":track])
        state = try store.command(["type":"add", "id":id, "revision":2, "track":second])
        state = try store.command(["type":"add", "id":id, "revision":3, "track":track])
        state = try store.command(["type":"move", "id":id, "revision":4, "from":2, "to":1])
        try require(state.playlists[0].items.map(\.videoId) == ["abcdefghijk","abcdefghijk","bcdefghijkl"])
        state = try store.command(["type":"remove", "id":id, "revision":5, "index":1])
        try require(state.playlists[0].items.map(\.videoId) == ["abcdefghijk","bcdefghijkl"])
        let before = try Data(contentsOf: path)
        try rejects("PLAYLIST_CHANGED") { _ = try store.command(["type":"delete", "id":id, "revision":1]) }
        try rejects("INVALID_PLAYLIST_ENTRY") { _ = try store.command(["type":"remove", "id":id, "revision":6, "index":true]) }
        try require(Data(contentsOf: path) == before)
        _ = try store.command(["type":"like", "track":track, "liked":true])
        _ = try store.command(["type":"like", "track":track, "liked":true])
        try require(store.read().likes.count == 1)
        try rejects("INVALID_LIBRARY_COMMAND") { _ = try store.command(["type":"like", "track":track, "liked":1]) }
        state = try store.remember(PlaybackTrack.decode(track)); state = try store.remember(PlaybackTrack.decode(second))
        state = try store.remember(PlaybackTrack.decode(track))
        try require(state.recent.map(\.videoId) == ["abcdefghijk","bcdefghijkl"])
        let restored = NativeLibraryStore(file: path)
        try require(restored.read().likes.count == 1 && restored.read().playlists[0].items.count == 2)
        let text = try String(contentsOf: path, encoding: .utf8)
        try require(!text.contains("must-not-persist"))
        let failWrite = NativeLibraryStore(file: path, write: { _, _ in throw ResolverFailure.code("SIMULATED_DISK_FULL") })
        let durable = try Data(contentsOf: path)
        try rejects("LIBRARY_WRITE_FAILED") { _ = try failWrite.command(["type":"delete", "id":id, "revision":6]) }
        try require(Data(contentsOf: path) == durable)
        try FileManager.default.createDirectory(at: store.artworkDirectory, withIntermediateDirectories: true)
        let cover = UUID().uuidString.lowercased() + ".jpg"
        try Data([1,2,3]).write(to: store.artworkDirectory.appendingPathComponent(cover))
        state = try store.command(["type":"cover", "id":id, "revision":6, "file":cover])
        try require(state.playlists[0].coverFile == cover)
        _ = try store.command(["type":"delete", "id":id, "revision":7])
        try require(!FileManager.default.fileExists(atPath: store.artworkDirectory.appendingPathComponent(cover).path))
        let broken = folder.appendingPathComponent("broken.json")
        try Data("not json".utf8).write(to: broken)
        try rejects("LIBRARY_DAMAGED") { _ = try NativeLibraryStore(file: broken).command(["type":"create", "name":"Must not replace damage"]) }
        try require(String(contentsOf: broken, encoding: .utf8) == "not json")
        try Data("{\"schema\":9}".utf8).write(to: broken)
        try rejects("LIBRARY_VERSION_UNSUPPORTED") { _ = try NativeLibraryStore(file: broken).read() }
        let huge = folder.appendingPathComponent("huge.json")
        try Data(repeating: 32, count: NativeLibraryStore.maxBytes + 1).write(to: huge)
        try rejects("LIBRARY_TOO_LARGE") { _ = try NativeLibraryStore(file: huge).read() }
        let format = UIGraphicsImageRendererFormat(); format.scale = 1
        let renderer = UIGraphicsImageRenderer(size: CGSize(width:2000, height:1000), format:format)
        let image = renderer.image { context in UIColor.purple.setFill(); context.fill(CGRect(x:0,y:0,width:2000,height:1000)) }.cgImage!
        let input = NSMutableData(), destination = CGImageDestinationCreateWithData(input, UTType.jpeg.identifier as CFString, 1, nil)!
        CGImageDestinationAddImage(destination, image, [kCGImagePropertyGPSDictionary:[kCGImagePropertyGPSLatitude:1.0, kCGImagePropertyGPSLatitudeRef:"N", kCGImagePropertyGPSLongitude:1.0, kCGImagePropertyGPSLongitudeRef:"E"]] as CFDictionary)
        try require(CGImageDestinationFinalize(destination))
        let taggedSource = CGImageSourceCreateWithData(input as CFData, nil)!
        try require((CGImageSourceCopyPropertiesAtIndex(taggedSource, 0, nil)! as NSDictionary)[kCGImagePropertyGPSDictionary] != nil)
        let encoded = try LibraryArtworkPicker.encode(input as Data)
        let source = CGImageSourceCreateWithData(encoded as CFData, nil)!
        let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil)! as NSDictionary
        try require((properties[kCGImagePropertyPixelWidth] as? Int) == 1024 && (properties[kCGImagePropertyPixelHeight] as? Int) == 512)
        try require(properties[kCGImagePropertyGPSDictionary] == nil)
        try rejects("ARTWORK_INVALID") { _ = try LibraryArtworkPicker.encode(Data([0,1,2])) }
        var full = LibraryState()
        for index in 0..<NativeLibraryStore.maxTracks { var item = track; item["videoId"] = String(format:"limit%06d",index); full.likes.append(try PlaybackTrack.decode(item)) }
        let limitFile = folder.appendingPathComponent("limit.json")
        try JSONEncoder().encode(full).write(to:limitFile)
        let bounded = NativeLibraryStore(file:limitFile), limitBefore = try Data(contentsOf:limitFile)
        try rejects("LIBRARY_TRACK_LIMIT") { _ = try bounded.command(["type":"like", "track":track, "liked":true]) }
        try require(Data(contentsOf:limitFile) == limitBefore)
        let single = try store.command(["type":"create", "name":"Single-song create", "track":track])
        try require(single.playlists[0].items.count == 1)
        // Decode the previous real document schema without writing during read.
        let migrationFile = folder.appendingPathComponent("migration.json")
        let legacyCover = UUID().uuidString.lowercased() + ".jpg"
        var legacy = store.snapshot(single)
        legacy["schema"] = 1; legacy.removeValue(forKey:"follows")
        var legacyPlaylists = legacy["playlists"] as! [[String:Any]]
        legacyPlaylists[0].removeValue(forKey:"cover"); legacyPlaylists[0]["coverFile"] = legacyCover
        legacy["playlists"] = legacyPlaylists
        let legacyBytes = try JSONSerialization.data(withJSONObject:legacy)
        try legacyBytes.write(to:migrationFile)
        let migrated = NativeLibraryStore(file:migrationFile)
        try FileManager.default.createDirectory(at:migrated.artworkDirectory,withIntermediateDirectories:true)
        let legacyCoverURL = migrated.artworkDirectory.appendingPathComponent(legacyCover)
        try Data([1,2,3]).write(to:legacyCoverURL)
        try require(migrated.read().schema == 2 && migrated.read().follows.isEmpty)
        try require(Data(contentsOf:migrationFile) == legacyBytes)
        let resource: [String:Any] = ["id":"artist-1","kind":"artist","name":"Original artist","artwork":"https://lh3.googleusercontent.com/fixture"]
        let migrationFailure = NativeLibraryStore(file:migrationFile,write:{_,_ in throw ResolverFailure.code("SIMULATED_DISK_FULL")})
        try rejects("LIBRARY_WRITE_FAILED") { _ = try migrationFailure.command(["type":"follow","resource":resource,"followed":true]) }
        try require(Data(contentsOf:migrationFile) == legacyBytes)
        let followed = try migrated.command(["type":"follow","resource":resource,"followed":true])
        try require(followed.schema == 2 && followed.follows.count == 1 && followed.likes.count == single.likes.count && followed.recent.count == single.recent.count)
        try require(followed.playlists[0].items.count == 1 && followed.playlists[0].coverFile == legacyCover && FileManager.default.fileExists(atPath:legacyCoverURL.path))
        try require(NativeLibraryStore(file:migrationFile).read().follows.first?.id == "artist-1")
        var otherKind = resource; otherKind["kind"] = "album"
        _ = try migrated.command(["type":"follow","resource":otherKind,"followed":true])
        _ = try migrated.command(["type":"follow","resource":resource,"followed":true])
        try require(migrated.read().follows.count == 2)
        _ = try migrated.command(["type":"follow","resource":resource,"followed":false])
        try require(migrated.read().follows.count == 1 && migrated.read().follows[0].kind == "album")
        try rejects("INVALID_LIBRARY_COMMAND") { _ = try migrated.command(["type":"follow","resource":resource,"followed":1]) }
        var invalidResource = resource; invalidResource["artwork"] = "https://rr1.googlevideo.com/signed-audio"
        try rejects("INVALID_RESOURCE") { _ = try migrated.command(["type":"follow","resource":invalidResource,"followed":true]) }
        let savedBytes = try Data(contentsOf:migrationFile)
        var missing = try JSONSerialization.jsonObject(with:savedBytes) as! [String:Any]
        missing.removeValue(forKey:"follows")
        try JSONSerialization.data(withJSONObject:missing).write(to:broken)
        let damagedV2 = try Data(contentsOf:broken)
        try rejects("LIBRARY_DAMAGED") { _ = try NativeLibraryStore(file:broken).command(["type":"create","name":"Must not lose saved resources"]) }
        try require(Data(contentsOf:broken) == damagedV2)
        // Playlist interchange checks run on macOS/iOS with the existing library self-check.
        let portable = LibraryPlaylist(id:UUID().uuidString.lowercased(),name:"Portable",description:"Order and duplicates",items:[try PlaybackTrack.decode(track),try PlaybackTrack.decode(second),try PlaybackTrack.decode(track)],coverFile:nil,revision:1,updatedAt:0)
        let exported = try PlaylistDocument.export(portable,cover:input as Data)
        let document = try PlaylistDocument.parse(exported.data)
        try require(document.tracks.map(\.videoId)==["abcdefghijk","bcdefghijkl","abcdefghijk"])
        try require(document.selected([3,1,2],skipDuplicates:true).tracks.map(\.videoId)==["abcdefghijk","bcdefghijkl"])
        try require(document.selected([3,1],skipDuplicates:false).tracks.count==2)
        try rejects("LIBRARY_TRACK_LIMIT"){_ = try document.selected([],skipDuplicates:true)}
        try rejects("INVALID_IMPORT_SELECTION"){_ = try document.selected([0],skipDuplicates:true)}
        try rejects("INVALID_IMPORT_SELECTION"){_ = try document.selected([1,1],skipDuplicates:true)}
        try rejects("PLAYLIST_FILE_INVALID"){_ = try PlaylistDocument.parse(Data("{}".utf8))}
        var payload = try JSONSerialization.jsonObject(with:exported.data) as! [String:Any]
        payload["version"] = true
        try rejects("PLAYLIST_FILE_INVALID"){_ = try PlaylistDocument.parse(JSONSerialization.data(withJSONObject:payload))}
        payload["version"] = 1;payload["privateUrl"] = "must-not-export"
        try rejects("PLAYLIST_FILE_INVALID"){_ = try PlaylistDocument.parse(JSONSerialization.data(withJSONObject:payload))}
        let cleanCover = CGImageSourceCreateWithData(document.cover! as CFData,nil)!
        try require((CGImageSourceCopyPropertiesAtIndex(cleanCover,0,nil)! as NSDictionary)[kCGImagePropertyGPSDictionary]==nil)
        let importBefore = try Data(contentsOf:path),coversBefore = Set(try FileManager.default.contentsOfDirectory(atPath:store.artworkDirectory.path))
        try rejects("LIBRARY_WRITE_FAILED"){_ = try failWrite.importPlaylist(name:"Must not save",description:"",tracks:document.tracks,cover:document.cover)}
        try require(Data(contentsOf:path)==importBefore)
        try require(Set(FileManager.default.contentsOfDirectory(atPath:store.artworkDirectory.path))==coversBefore)
        let imported = try store.importPlaylist(name:"New portable playlist",description:document.description,tracks:document.tracks,cover:document.cover)
        try require(imported.state.playlists.count==single.playlists.count+1 && imported.state.likes.count==single.likes.count)
        try require(imported.state.playlists[0].items.count==3 && imported.state.playlists[0].id != portable.id)
        let sessions=PlaylistDocumentSession(),sessionPreview=sessions.prepare(document),sessionToken=sessionPreview["token"] as! String
        _ = try sessions.begin(sessionToken);sessions.cancel(sessionToken);sessions.finish(sessionToken,success:false)
        _ = try sessions.begin(sessionToken);sessions.finish(sessionToken,success:true)
        try rejects("IMPORT_EXPIRED"){_ = try sessions.begin(sessionToken)}
        let frozen=sessions.prepareReport("reviewed bytes"),reportToken=frozen["token"] as! String
        try require(sessions.reportText(reportToken)=="reviewed bytes")
        try require(RitvioPlaybackPlugin.reportCode("private song name")=="OTHER" && RitvioPlaybackPlugin.reportCode(nil)=="NONE")
        return ["status":"passed", "atomicFailurePreservesData":true, "damagedFilePreserved":true, "unknownSchemaRejected":true,
            "restartPersistence":true, "duplicateOccurrenceEdits":true, "staleRevisionRejected":true, "strictBooleanAndIndex":true,
            "historyDeduplicated":true, "noSignedDescriptors":true, "managedCoverCleanup":true, "boundedDocument":true,
            "artworkDownsampled":true, "artworkMetadataRemoved":true, "invalidImageRejected":true,
            "trackLimitPreservesData":true, "singleSongCreateAtomic":true,"playlistInterchangeAndDuplicateOrder":true,"importFailureRemovesOnlyNewCover":true,"singleUseImportAndFrozenReport":true,
            "followMigrationPreservesCollectionsAndCovers":true,"followMigrationReadOnlyUntilMutation":true,
            "followMigrationFailurePreservesLegacyFile":true,"followRestartAndIdentity":true,"damagedFollowFieldPreserved":true]
    }
    #endif
}
