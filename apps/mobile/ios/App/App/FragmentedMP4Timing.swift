import Foundation

/// A DASH init segment has no initial samples: its mvhd/tkhd/mdhd durations
/// must be zero. AVFoundation otherwise adds that duration to the fragments.
/// Normalize only complete, bounded, single-audio-track init metadata with
/// empty sample tables. Byte offsets, indexes, fragment times and audio stay intact.
enum FragmentedMP4Timing {
    static let maximumPrefix = 128 * 1024
    struct Normalized {
        let data: Data
        let containerSeconds: Double
        let changedRanges: [Range<Int>]
    }
    private struct Box {
        let kind: String
        let payload: Int
        let end: Int
    }
    static func normalize(_ data: Data) -> Normalized? {
        guard data.count <= maximumPrefix, data.count >= 24 else { return nil }
        let bytes = [UInt8](data)
        func number(_ offset: Int, _ width: Int, end: Int) -> UInt64? {
            guard offset >= 0, width > 0, width <= 8, offset <= end - width, end <= bytes.count else { return nil }
            return bytes[offset..<(offset + width)].reduce(0) { ($0 << 8) | UInt64($1) }
        }
        func box(_ start: Int, end: Int) -> Box? {
            guard let short = number(start, 4, end: end), start <= end - 8,
                  let kind = String(bytes: bytes[(start + 4)..<(start + 8)], encoding: .ascii) else { return nil }
            let header = short == 1 ? 16 : 8
            guard let length = short == 1 ? number(start + 8, 8, end: end) : Optional(short),
                  length >= UInt64(header), length <= UInt64(end - start) else { return nil }
            return Box(kind: kind, payload: start + header, end: start + Int(length))
        }
        func children(_ parent: Box) -> [Box]? {
            var cursor = parent.payload, result: [Box] = []
            while cursor < parent.end {
                guard result.count < 128, let next = box(cursor, end: parent.end) else { return nil }
                result.append(next); cursor = next.end
            }
            return result
        }
        func only(_ items: [Box], _ kind: String) -> Box? {
            let matches = items.filter { $0.kind == kind }
            return matches.count == 1 ? matches[0] : nil
        }
        func clock(_ item: Box, track: Bool = false) -> (range: Range<Int>, units: UInt64, scale: UInt64)? {
            guard item.payload < item.end, bytes[item.payload] <= 1 else { return nil }
            let wide = bytes[item.payload] == 1
            let offset = item.payload + (track ? (wide ? 28 : 20) : (wide ? 24 : 16))
            let width = wide ? 8 : 4
            guard let units = number(offset, width, end: item.end),
                  let scale = track ? Optional(UInt64(1)) : number(offset - 4, 4, end: item.end), scale > 0 else { return nil }
            return (offset..<(offset + width), units, scale)
        }
        func supportedEdit(_ track: [Box]) -> Bool {
            let edits = track.filter { $0.kind == "edts" }
            if edits.isEmpty { return true }
            guard edits.count == 1, let entries = children(edits[0]), let edit = only(entries, "elst"),
                  edit.payload < edit.end, bytes[edit.payload] <= 1,
                  number(edit.payload + 4, 4, end: edit.end) == 1 else { return false }
            let width = bytes[edit.payload] == 1 ? 8 : 4
            guard let mediaTime = number(edit.payload + 8 + width, width, end: edit.end),
                  mediaTime < (UInt64(1) << (width * 8 - 1)),
                  number(edit.payload + 8 + width * 2, 4, end: edit.end) == 0x00010000 else { return false }
            // Preserve the entire edit, including AAC encoder-priming trim.
            return true
        }
        guard let file = box(0, end: bytes.count), file.kind == "ftyp", file.end >= file.payload + 8,
              String(bytes: bytes[file.payload..<(file.payload + 4)], encoding: .ascii) == "dash" else { return nil }
        var cursor = file.end, movie: Box?
        for _ in 0..<32 {
            guard let next = box(cursor, end: bytes.count) else { return nil }
            if next.kind == "moov" { movie = next; break }
            if ["moof", "mdat"].contains(next.kind) { return nil }
            cursor = next.end
        }
        guard let movie, let parts = children(movie), let mvhd = only(parts, "mvhd"),
              let mvex = only(parts, "mvex"), let defaults = children(mvex), let trex = only(defaults, "trex"),
              let trak = only(parts, "trak"), let track = children(trak),
              supportedEdit(track), let tkhd = only(track, "tkhd"),
              let mdia = only(track, "mdia"), let media = children(mdia), let mdhd = only(media, "mdhd"),
              let handler = only(media, "hdlr"), handler.end >= handler.payload + 12,
              String(bytes: bytes[(handler.payload + 8)..<(handler.payload + 12)], encoding: .ascii) == "soun",
              let minf = only(media, "minf"), let information = children(minf), let stbl = only(information, "stbl"),
              let table = children(stbl), let stts = only(table, "stts"), let stsc = only(table, "stsc"),
              let sizes = only(table, "stsz") ?? only(table, "stz2"),
              let offsets = only(table, "stco") ?? only(table, "co64"),
              number(stts.payload + 4, 4, end: stts.end) == 0,
              number(stsc.payload + 4, 4, end: stsc.end) == 0,
              number(sizes.payload + 8, 4, end: sizes.end) == 0,
              number(offsets.payload + 4, 4, end: offsets.end) == 0,
              let movieClock = clock(mvhd), let trackClock = clock(tkhd, track: true), let mediaClock = clock(mdhd),
              let trackID = number(tkhd.payload + (bytes[tkhd.payload] == 1 ? 20 : 12), 4, end: tkhd.end), trackID > 0,
              number(trex.payload + 4, 4, end: trex.end) == trackID else { return nil }
        let seconds = Double(mediaClock.units) / Double(mediaClock.scale)
        guard seconds.isFinite, seconds > 0, seconds <= 86400,
              abs(Double(movieClock.units) / Double(movieClock.scale) - seconds) < 1 else { return nil }
        let ranges = [movieClock, trackClock, mediaClock].filter { $0.units != 0 }.map { $0.range }
        guard !ranges.isEmpty else { return nil }
        var normalized = data
        for range in ranges { normalized.replaceSubrange(range, with: repeatElement(UInt8(0), count: range.count)) }
        return Normalized(data: normalized, containerSeconds: seconds, changedRanges: ranges)
    }
}
