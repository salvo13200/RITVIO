"""Regenerate an original CC0 test tone; requires FFmpeg, never network media.

The init durations are deliberately invalid for an empty fragmented movie,
reproducing the metadata conflict seen in real DASH audio. No song is included.
"""
import argparse, hashlib, json, pathlib, struct, subprocess, tempfile

ROOT = pathlib.Path(__file__).resolve().parent / 'fixtures' / 'audio'
SECONDS = 5

def boxes(data, start, end):
    while start < end:
        if start + 8 > end: raise ValueError('Truncated box')
        size, kind = struct.unpack_from('>I4s', data, start); header = 8
        if size == 1:
            if start + 16 > end: raise ValueError('Truncated wide box')
            size = struct.unpack_from('>Q', data, start + 8)[0]; header = 16
        if size < header or start + size > end: raise ValueError('Invalid box')
        yield kind, start + header, start + size
        start += size

def main():
    p = argparse.ArgumentParser(); p.add_argument('--ffmpeg', default='ffmpeg'); args = p.parse_args()
    ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='ritvio-original-tone-') as tmp:
        output = pathlib.Path(tmp) / 'tone.m4a'
        command = [args.ffmpeg, '-nostdin', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i',
            f'sine=frequency=440:sample_rate=44100:duration={SECONDS}', '-ac', '1', '-c:a', 'aac', '-b:a', '64k',
            '-movflags', '+frag_keyframe+empty_moov+default_base_moof+global_sidx+skip_trailer',
            '-frag_duration', '1000000', '-brand', 'dash', '-f', 'mp4', str(output)]
        subprocess.run(command, check=True)
        data = bytearray(output.read_bytes()); patched = []
    def walk(start, end, path=''):
        for kind, a, b in boxes(data, start, end):
            name = path + '/' + kind.decode('ascii')
            if kind in (b'mvhd', b'mdhd', b'tkhd'):
                version = data[a]; wide = version == 1
                if version > 1: raise ValueError('Unknown clock')
                if kind == b'tkhd': offset = a + (28 if wide else 20); scale = movie_scale
                else:
                    scale_offset = a + (20 if wide else 12)
                    scale = struct.unpack_from('>I', data, scale_offset)[0]; offset = scale_offset + 4
                struct.pack_into('>Q' if wide else '>I', data, offset, SECONDS * scale); patched.append(name)
            if kind in (b'moov', b'trak', b'mdia'): walk(a, b, name)
    movie = next((a, b) for kind, a, b in boxes(data, 0, len(data)) if kind == b'moov')
    mvhd = next(a for kind, a, b in boxes(data, *movie) if kind == b'mvhd')
    movie_scale = struct.unpack_from('>I', data, mvhd + (20 if data[mvhd] == 1 else 12))[0]
    walk(0, len(data))
    assert len(patched) == 3, patched
    target = ROOT / 'fragmented-timing.m4a'; target.write_bytes(data)
    manifest = {'schema': 1, 'file': target.name, 'seconds': SECONDS, 'bytes': len(data),
        'sha256': hashlib.sha256(data).hexdigest(), 'source': 'original-generated-440Hz-sine', 'license': 'CC0-1.0',
        'purpose': 'Deliberately nonzero init durations with empty sample tables and movie fragments', 'modifiedMetadata': patched}
    (ROOT / 'fragmented-timing.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf8')
    print(json.dumps(manifest))

if __name__ == '__main__': main()
