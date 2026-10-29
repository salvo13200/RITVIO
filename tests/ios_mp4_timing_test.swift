import Foundation

@main enum MP4TimingRegression {
    static func u32(_ value: UInt32) -> [UInt8] { (0..<4).reversed().map { UInt8(truncatingIfNeeded: value >> ($0 * 8)) } }
    static func box(_ name: String, _ payload: [UInt8]) -> [UInt8] { u32(UInt32(payload.count + 8)) + Array(name.utf8) + payload }
    static func put(_ value: UInt64, into bytes: inout [UInt8], at offset: Int, width: Int = 4) {
        for index in 0..<width { bytes[offset + index] = UInt8(truncatingIfNeeded: value >> ((width - index - 1) * 8)) }
    }
    static func clock(_ kind: String, wide: Bool) -> [UInt8] {
        let track = kind == "tkhd", durationOffset = track ? (wide ? 28 : 20) : (wide ? 24 : 16)
        var payload = [UInt8](repeating: 0, count: track ? 96 : 40)
        payload[0] = wide ? 1 : 0
        if track { put(1, into: &payload, at: wide ? 20 : 12) }
        else { put(1000, into: &payload, at: durationOffset - 4) }
        put(90000, into: &payload, at: durationOffset, width: wide ? 8 : 4)
        return box(kind, payload)
    }
    static func fixture(wide: Bool = false, brand: String = "dash", fragmented: Bool = true, samples: UInt32 = 0, audio: Bool = true, tracks: Int = 1, edit: Bool = true) -> Data {
        var sizes = [UInt8](repeating: 0, count: 12); put(UInt64(samples), into: &sizes, at: 8)
        let empty = [UInt8](repeating: 0, count: 8)
        let tables = box("stbl", box("stts", empty) + box("stsc", empty) + box("stsz", sizes) + box("stco", empty))
        var handler = [UInt8](repeating: 0, count: 24); handler.replaceSubrange(8..<12, with: Array((audio ? "soun" : "vide").utf8))
        let editList = box("edts", box("elst", u32(0) + u32(1) + u32(90000) + u32(1600) + u32(0x00010000)))
        let media = box("mdia", clock("mdhd", wide: wide) + box("hdlr", handler) + box("minf", tables))
        let track = box("trak", clock("tkhd", wide: wide) + (edit ? editList : []) + media)
        var trex = [UInt8](repeating: 0, count: 24); put(1, into: &trex, at: 4)
        let movie = box("moov", clock("mvhd", wide: wide) + (fragmented ? box("mvex", box("trex", trex)) : []) + Array(repeating: track, count: tracks).flatMap { $0 })
        let file = box("ftyp", Array(brand.utf8) + u32(0) + Array("iso6mp41".utf8))
        let indexes = box("sidx", [UInt8](repeating: 23, count: 32)) + box("moof", [UInt8](repeating: 37, count: 32))
        return Data(file + movie + indexes + box("mdat", (0...255).map { UInt8($0) }))
    }
    static func expect(_ condition: Bool, _ name: String) {
        precondition(condition, name)
    }
    static func main() {
        for wide in [false, true] {
            let original = fixture(wide: wide)
            guard let result = FragmentedMP4Timing.normalize(original) else { fatalError("Fragmented empty init must normalize") }
            expect(abs(result.containerSeconds - 90) < 0.001, "Keep measured container clock")
            expect(result.data.count == original.count && result.changedRanges.count == 3, "No offset or size changes")
            expect(result.changedRanges.reduce(0) { $0 + $1.count } == (wide ? 24 : 12), "Only the three duration fields change")
            for index in original.indices {
                if result.changedRanges.contains(where: { $0.contains(index) }) { expect(result.data[index] == 0, "Zero initial duration") }
                else { expect(result.data[index] == original[index], "Audio, indexes and fragment bytes untouched") }
            }
            expect(FragmentedMP4Timing.normalize(result.data) == nil, "Normalization is idempotent")
        }
        expect(FragmentedMP4Timing.normalize(fixture(edit:false)) != nil, "Fragmented init without edit list")
        for data in [fixture(brand:"M4A "), fixture(fragmented:false), fixture(samples:1), fixture(audio:false), fixture(tracks:2)] {
            expect(FragmentedMP4Timing.normalize(data) == nil, "Leave unsupported or populated initial movies unchanged")
        }
        let sample = fixture()
        for count in 0..<64 { expect(FragmentedMP4Timing.normalize(Data(sample.prefix(count))) == nil, "Truncated metadata is untouched") }
        var oversized = sample; oversized.replaceSubrange(24..<28, with: [255,255,255,255])
        expect(FragmentedMP4Timing.normalize(oversized) == nil, "Reject unbounded box length")
        expect(FragmentedMP4Timing.normalize(Data(repeating:0,count:FragmentedMP4Timing.maximumPrefix + 1)) == nil, "Bound parsing memory")
        for count in 0..<128 { expect(FragmentedMP4Timing.normalize(Data(repeating:255,count:count)) == nil, "Malformed prefixes do not crash") }
        print("Fragmented MP4 timing: v0/v1, byte preservation, nonfragmented/populated/video/multitrack, truncation and bounds passed")
    }
}
