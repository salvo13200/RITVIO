import Foundation

enum LibrarySelfTest {
    #if DEBUG
    static func run() throws -> [String: Any] {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("library-check-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let path = folder.appendingPathComponent("library.json"), store = NativeLibraryStore(file: path)
        func require(_ condition: Bool) throws { if !condition { throw ResolverFailure.code("LIBRARY_SELF_TEST_FAILED") } }
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
        try Data("{\"schema\":2}".utf8).write(to: broken)
        try rejects("LIBRARY_VERSION_UNSUPPORTED") { _ = try NativeLibraryStore(file: broken).read() }
        let huge = folder.appendingPathComponent("huge.json")
        try Data(repeating: 32, count: NativeLibraryStore.maxBytes + 1).write(to: huge)
        try rejects("LIBRARY_TOO_LARGE") { _ = try NativeLibraryStore(file: huge).read() }
        return ["status":"passed", "atomicFailurePreservesData":true, "damagedFilePreserved":true, "unknownSchemaRejected":true,
            "restartPersistence":true, "duplicateOccurrenceEdits":true, "staleRevisionRejected":true, "strictBooleanAndIndex":true,
            "historyDeduplicated":true, "noSignedDescriptors":true, "managedCoverCleanup":true, "boundedDocument":true]
    }
    #endif
}
