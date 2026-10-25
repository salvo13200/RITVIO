import Foundation

struct PlaybackResource: Codable {
    let id: String
    let name: String
}

struct PlaybackTrack: Codable {
    let videoId: String
    let title: String
    let artist: String
    let thumbnail: String
    let duration: Double
    let artists: [PlaybackResource]?
    let album: PlaybackResource?

    static func decode(_ value: [String: Any]) throws -> PlaybackTrack {
        guard let data = try? JSONSerialization.data(withJSONObject: value), data.count <= 8192,
              let track = try? JSONDecoder().decode(Self.self, from: data), track.valid else {
            throw ResolverFailure.code("INVALID_TRACK")
        }
        return track
    }
    var valid: Bool {
        videoId.range(of: "^[A-Za-z0-9_-]{11}$", options: .regularExpression) != nil &&
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && title.utf8.count <= 1024 &&
        artist.utf8.count <= 1024 && thumbnail.utf8.count <= 2048 && duration.isFinite && (0...86400).contains(duration) &&
        (thumbnail.isEmpty || URL(string: thumbnail)?.scheme == "https") &&
        (artists?.count ?? 0) <= 20 && (artists ?? []).allSatisfy { !$0.id.isEmpty && $0.id.utf8.count <= 256 && $0.name.utf8.count <= 512 } &&
        (album == nil || (album!.id.utf8.count <= 256 && album!.name.utf8.count <= 512))
    }
    var json: [String: Any] { (try? JSONSerialization.jsonObject(with: JSONEncoder().encode(self)) as? [String: Any]) ?? [:] }
}

/// Queue identity is the entry index, so duplicate songs remain separate entries.
struct PlaybackQueue: Codable {
    var items: [PlaybackTrack] = []
    var index = 0
    var order: [Int] = []
    var shuffle = false
    var repeatMode = "off"
    var revision = 0
    var current: PlaybackTrack? { items.indices.contains(index) ? items[index] : nil }

    mutating func replace(_ tracks: [PlaybackTrack], at selected: Int) throws {
        guard !tracks.isEmpty, tracks.count <= 500, tracks.allSatisfy(\.valid), tracks.indices.contains(selected) else { throw ResolverFailure.code("INVALID_QUEUE") }
        items = tracks; index = selected; rebuild(); revision += 1
    }
    mutating func rebuild() {
        let others = items.indices.filter { $0 != index }
        order = shuffle && current != nil ? [index] + others.shuffled() : Array(items.indices)
    }
    mutating func setShuffle(_ enabled: Bool) { guard shuffle != enabled else { return }; shuffle = enabled; rebuild(); revision += 1 }
    mutating func advance(automatic: Bool) -> Bool {
        guard current != nil else { return false }
        if automatic && repeatMode == "one" { return true }
        guard let cursor = order.firstIndex(of: index) else { return false }
        if cursor + 1 < order.count { index = order[cursor + 1]; revision += 1; return true }
        if repeatMode == "all" { index = order[0]; revision += 1; return true }
        return false
    }
    mutating func previous() -> Bool {
        guard let cursor = order.firstIndex(of: index) else { return false }
        if cursor > 0 { index = order[cursor - 1]; revision += 1; return true }
        if repeatMode == "all", let last = order.last { index = last; revision += 1; return true }
        return false
    }
    mutating func enqueue(_ track: PlaybackTrack, next: Bool) throws {
        guard track.valid, items.count < 500 else { throw ResolverFailure.code("INVALID_QUEUE") }
        let entry = items.count; items.append(track)
        if next, let cursor = order.firstIndex(of: index) { order.insert(entry, at: cursor + 1) } else { order.append(entry) }
        revision += 1
    }
    mutating func move(from: Int, to: Int, expectedRevision: Int) throws {
        guard expectedRevision == revision else { throw ResolverFailure.code("QUEUE_CHANGED") }
        guard items.indices.contains(from), items.indices.contains(to) else { throw ResolverFailure.code("INVALID_QUEUE") }
        guard from != to else { return }
        // Move the occurrence in the effective playback order as well as storage.
        var playbackIdentities = order
        let destination = playbackIdentities.firstIndex(of: to)!
        playbackIdentities.removeAll { $0 == from }
        playbackIdentities.insert(from, at: destination)
        var identities = Array(items.indices)
        let moving = identities.remove(at: from); identities.insert(moving, at: to)
        let original = items; items = identities.map { original[$0] }
        index = identities.firstIndex(of: index) ?? 0
        order = playbackIdentities.compactMap { identities.firstIndex(of: $0) }
        revision += 1
    }
    mutating func remove(_ entry: Int, expectedRevision: Int?) throws -> Bool {
        if let expectedRevision, expectedRevision != revision { throw ResolverFailure.code("QUEUE_CHANGED") }
        guard items.indices.contains(entry) else { throw ResolverFailure.code("INVALID_QUEUE") }
        let wasCurrent = entry == index
        let cursor = order.firstIndex(of: entry) ?? 0
        let successor = order.dropFirst(cursor + 1).first ?? order.prefix(cursor).first
        items.remove(at: entry)
        order = order.filter { $0 != entry }.map { $0 > entry ? $0 - 1 : $0 }
        if wasCurrent { index = successor.map { $0 > entry ? $0 - 1 : $0 } ?? 0 }
        else if index > entry { index -= 1 }
        revision += 1
        return wasCurrent
    }
    var valid: Bool {
        items.count <= 500 && items.allSatisfy(\.valid) && ["off", "all", "one"].contains(repeatMode) &&
        revision >= 0 && Set(order) == Set(items.indices) && order.count == items.count &&
        (items.isEmpty ? index == 0 : items.indices.contains(index))
    }
}

struct PlaybackSavedState: Codable {
    let schema: Int
    let queue: PlaybackQueue
    let position: Double
    let volume: Float
    var valid: Bool { schema == 1 && queue.valid && position.isFinite && (0...86400).contains(position) && volume.isFinite && (0...1).contains(volume) }
}
