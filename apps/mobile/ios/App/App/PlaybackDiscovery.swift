import Foundation

enum PlaybackDiscovery {
    static func keys(_ track: PlaybackTrack) -> [String] {
        func clean(_ value: String) -> String {
            value.decomposedStringWithCompatibilityMapping.folding(options:[.diacriticInsensitive,.caseInsensitive,.widthInsensitive],locale:Locale(identifier:"en_US_POSIX"))
                .replacingOccurrences(of:"[^\\p{L}\\p{N}]+",with:" ",options:.regularExpression).trimmingCharacters(in:.whitespacesAndNewlines)
        }
        let credits = track.artists?.map(\.id).sorted() ?? []
        let artist = credits.isEmpty ? clean(track.artist.replacingOccurrences(of:"\\s*-\\s*Topic$",with:"",options:[.regularExpression,.caseInsensitive])) : credits.joined(separator:"|")
        return ["v:" + track.videoId,"e:" + clean(track.title) + "::" + artist]
    }
    static func select(_ candidates:[PlaybackTrack],excluding:[PlaybackTrack],seen:[String],limit:Int)->[PlaybackTrack] {
        guard limit > 0 else { return [] }
        var used=Set(seen + excluding.flatMap(keys)),result:[PlaybackTrack]=[]
        for track in candidates {
            let identity=keys(track)
            if identity.contains(where:used.contains) { continue }
            used.formUnion(identity);result.append(track)
            if result.count == limit { break }
        }
        return result
    }
    static func decode(_ value:[String:Any],seed:String) throws -> [PlaybackTrack] {
        guard value["videoId"] as? String == seed,let items=value["items"] as? [[String:Any]],items.count <= 51,
              let bytes=try? JSONSerialization.data(withJSONObject:value),bytes.count <= 256*1024 else { throw ResolverFailure.code("NATIVE_RESPONSE_INVALID") }
        return items.compactMap { try? PlaybackTrack.decode($0) }
    }
    static func moved(_ automatic:Set<Int>,count:Int,from:Int,to:Int)->Set<Int> {
        var identities=Array(0..<count);identities.insert(identities.remove(at:from),at:to)
        return Set(identities.enumerated().compactMap { automatic.contains($0.element) ? $0.offset : nil })
    }
    static func removed(_ automatic:Set<Int>,index:Int)->Set<Int> {
        Set(automatic.filter { $0 != index }.map { $0 > index ? $0-1 : $0 })
    }
    static func future(_ queue:PlaybackQueue,automatic:Set<Int>)->[Int] {
        guard let cursor=queue.order.firstIndex(of:queue.index) else { return [] }
        return queue.order.dropFirst(cursor+1).filter(automatic.contains).sorted(by:>)
    }
}
