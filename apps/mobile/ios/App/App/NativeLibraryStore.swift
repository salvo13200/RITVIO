import Foundation
import CoreFoundation

struct LibraryPlaylist: Codable {
    var id: String
    var name: String
    var description: String
    var items: [PlaybackTrack]
    var coverFile: String?
    var revision: Int
    var updatedAt: Int64
}

struct LibraryState: Codable {
    var schema = 1
    var revision = 0
    var likes: [PlaybackTrack] = []
    var playlists: [LibraryPlaylist] = []
    var recent: [PlaybackTrack] = []
}

/// Native repository boundary, independent of the web view and playback owner.
/// Every mutation reloads, validates and atomically replaces one bounded document.
/// A damaged/unknown document is preserved; it is never replaced with an empty one.
final class NativeLibraryStore {
    static let shared: NativeLibraryStore = {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        #if DEBUG
        if NativeUIFixture.enabled { return NativeLibraryStore(file: base.appendingPathComponent("RITVIO/UITestLibrary/library-v1.json")) }
        #endif
        return NativeLibraryStore(file: base.appendingPathComponent("RITVIO/library-v1.json"))
    }()
    static let maxBytes = 4 * 1024 * 1024
    static let maxTracks = 500 // Matches the native playback queue; no silent truncation.
    let file: URL
    var artworkDirectory: URL { file.deletingLastPathComponent().appendingPathComponent("playlist-artwork", isDirectory: true) }
    private let lock = NSLock()
    private let write: (Data, URL) throws -> Void
    init(file: URL, write: @escaping (Data, URL) throws -> Void = { data, url in
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }) { self.file = file; self.write = write }

    func read() throws -> LibraryState { lock.lock(); defer { lock.unlock() }; return try load() }
    private func load() throws -> LibraryState {
        guard FileManager.default.fileExists(atPath: file.path) else { return LibraryState() }
        let attributes = try FileManager.default.attributesOfItem(atPath: file.path)
        guard ((attributes[.size] as? NSNumber)?.intValue ?? Int.max) <= Self.maxBytes else { throw ResolverFailure.code("LIBRARY_TOO_LARGE") }
        let bytes = try Data(contentsOf: file)
        guard let header = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              let schema = Self.integer(header["schema"]) else { throw ResolverFailure.code("LIBRARY_DAMAGED") }
        guard schema == 1 else { throw ResolverFailure.code("LIBRARY_VERSION_UNSUPPORTED") }
        guard let value = try? JSONDecoder().decode(LibraryState.self, from: bytes), Self.valid(value) else { throw ResolverFailure.code("LIBRARY_DAMAGED") }
        return value
    }
    private func save(_ value: LibraryState) throws {
        guard Self.valid(value) else { throw ResolverFailure.code("INVALID_LIBRARY") }
        let data = try JSONEncoder().encode(value)
        guard data.count <= Self.maxBytes else { throw ResolverFailure.code("LIBRARY_TOO_LARGE") }
        do { try write(data, file) } catch { throw ResolverFailure.code("LIBRARY_WRITE_FAILED") }
    }
    static func valid(_ state: LibraryState) -> Bool {
        state.schema == 1 && state.revision >= 0 && state.revision < Int.max - 1 &&
        state.likes.count <= maxTracks && state.recent.count <= 40 && state.playlists.count <= 100 &&
        state.likes.allSatisfy(\.valid) && state.recent.allSatisfy(\.valid) &&
        Set(state.likes.map(\.videoId)).count == state.likes.count && Set(state.recent.map(\.videoId)).count == state.recent.count &&
        Set(state.playlists.map(\.id)).count == state.playlists.count && state.playlists.allSatisfy {
            UUID(uuidString: $0.id) != nil && !$0.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
            $0.name.count <= 100 && $0.description.count <= 1000 && $0.items.count <= maxTracks && $0.items.allSatisfy(\.valid) &&
            $0.revision > 0 && $0.revision < Int.max - 1 && $0.updatedAt >= 0 &&
            ($0.coverFile == nil || validCover($0.coverFile!))
        }
    }
    static func validCover(_ file: String) -> Bool { file.range(of: "^[a-f0-9-]{36}\\.jpg$", options: .regularExpression) != nil && UUID(uuidString: String(file.dropLast(4))) != nil }
    static func integer(_ value: Any?) -> Int? {
        guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(), number.doubleValue.isFinite,
              number.doubleValue.rounded() == number.doubleValue, abs(number.doubleValue) < 9_000_000_000_000_000 else { return nil }
        return number.intValue
    }
    private static func bool(_ value: Any?) -> Bool? {
        guard let number = value as? NSNumber, CFGetTypeID(number) == CFBooleanGetTypeID() else { return nil }; return number.boolValue
    }
    private static func title(_ input: [String: Any]) throws -> String {
        guard let raw = input["name"] as? String else { throw ResolverFailure.code("INVALID_PLAYLIST_NAME") }
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (1...100).contains(value.count) else { throw ResolverFailure.code("INVALID_PLAYLIST_NAME") }; return value
    }
    private static func tracks(_ value: Any?) throws -> [PlaybackTrack] {
        guard let raw = value as? [[String: Any]], raw.count <= maxTracks else { throw ResolverFailure.code("LIBRARY_TRACK_LIMIT") }
        return try raw.map(PlaybackTrack.decode)
    }
    private func playlistIndex(_ input: [String: Any], in state: LibraryState) throws -> Int {
        guard let id = input["id"] as? String, let index = state.playlists.firstIndex(where: { $0.id == id }) else { throw ResolverFailure.code("PLAYLIST_MISSING") }
        guard let revision = Self.integer(input["revision"]), revision == state.playlists[index].revision else { throw ResolverFailure.code("PLAYLIST_CHANGED") }
        return index
    }
    private static func touch(_ value: inout LibraryPlaylist) { value.revision += 1; value.updatedAt = Int64(Date().timeIntervalSince1970 * 1000) }

    @discardableResult func command(_ input: [String: Any]) throws -> LibraryState {
        lock.lock(); defer { lock.unlock() }
        var value = try load()
        let oldCovers = Set(value.playlists.compactMap(\.coverFile))
        switch input["type"] as? String {
        case "like":
            guard let raw = input["track"] as? [String: Any], let liked = Self.bool(input["liked"]) else { throw ResolverFailure.code("INVALID_LIBRARY_COMMAND") }
            let track = try PlaybackTrack.decode(raw)
            value.likes.removeAll { $0.videoId == track.videoId }
            if liked { guard value.likes.count < Self.maxTracks else { throw ResolverFailure.code("LIBRARY_TRACK_LIMIT") }; value.likes.insert(track, at: 0) }
        case "create", "createFromTracks":
            guard value.playlists.count < 100 else { throw ResolverFailure.code("LIBRARY_PLAYLIST_LIMIT") }
            let name = try Self.title(input)
            let tracks: [PlaybackTrack]
            if input["type"] as? String == "create" { tracks = [] } else { tracks = try Self.tracks(input["items"]) }
            let description = input["description"] as? String ?? ""
            guard description.count <= 1000 else { throw ResolverFailure.code("INVALID_DESCRIPTION") }
            value.playlists.insert(LibraryPlaylist(id: UUID().uuidString.lowercased(), name: name, description: description,
                items: tracks, revision: 1, updatedAt: Int64(Date().timeIntervalSince1970 * 1000)), at: 0)
        case "rename", "delete", "add", "remove", "move", "cover":
            let index = try playlistIndex(input, in: value)
            switch input["type"] as? String {
            case "rename":
                value.playlists[index].name = try Self.title(input)
                if let description = input["description"] as? String { guard description.count <= 1000 else { throw ResolverFailure.code("INVALID_DESCRIPTION") }; value.playlists[index].description = description }
            case "delete": value.playlists.remove(at: index)
            case "add":
                guard let raw = input["track"] as? [String: Any] else { throw ResolverFailure.code("INVALID_TRACK") }
                guard value.playlists[index].items.count < Self.maxTracks else { throw ResolverFailure.code("LIBRARY_TRACK_LIMIT") }
                value.playlists[index].items.append(try PlaybackTrack.decode(raw))
            case "remove":
                guard let entry = Self.integer(input["index"]), value.playlists[index].items.indices.contains(entry) else { throw ResolverFailure.code("INVALID_PLAYLIST_ENTRY") }
                value.playlists[index].items.remove(at: entry)
            case "move":
                guard let from = Self.integer(input["from"]), let to = Self.integer(input["to"]), value.playlists[index].items.indices.contains(from), value.playlists[index].items.indices.contains(to) else { throw ResolverFailure.code("INVALID_PLAYLIST_ENTRY") }
                value.playlists[index].items.insert(value.playlists[index].items.remove(at: from), at: to)
            case "cover":
                let cover = input["file"] as? String
                guard cover == nil || (Self.validCover(cover!) && FileManager.default.fileExists(atPath: artworkDirectory.appendingPathComponent(cover!).path)) else { throw ResolverFailure.code("INVALID_ARTWORK") }
                value.playlists[index].coverFile = cover
            default: break
            }
            if input["type"] as? String != "delete" { Self.touch(&value.playlists[index]) }
        case "clearHistory": value.recent = []
        default: throw ResolverFailure.code("INVALID_LIBRARY_COMMAND")
        }
        value.revision += 1
        try save(value)
        let retained = Set(value.playlists.compactMap(\.coverFile))
        for old in oldCovers.subtracting(retained) { try? FileManager.default.removeItem(at: artworkDirectory.appendingPathComponent(old)) }
        return value
    }

    @discardableResult func remember(_ track: PlaybackTrack) throws -> LibraryState {
        guard track.valid else { throw ResolverFailure.code("INVALID_TRACK") }
        lock.lock(); defer { lock.unlock() }
        var value = try load()
        if value.recent.first?.videoId == track.videoId { return value }
        value.recent.removeAll { $0.videoId == track.videoId }; value.recent.insert(track, at: 0)
        value.recent = Array(value.recent.prefix(40)); value.revision += 1
        try save(value); return value
    }

    func snapshot(_ value: LibraryState) -> [String: Any] {
        ["revision": value.revision, "likes": value.likes.map(\.json), "recent": value.recent.map(\.json), "follows": [],
         "playlists": value.playlists.map { item in
            ["id": item.id, "name": item.name, "description": item.description, "items": item.items.map(\.json),
             "revision": item.revision, "updatedAt": item.updatedAt,
             "cover": item.coverFile.map { artworkDirectory.appendingPathComponent($0).absoluteString } as Any? ?? NSNull()] as [String: Any]
         }]
    }
}
