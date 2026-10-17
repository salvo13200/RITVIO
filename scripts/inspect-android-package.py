"""Read APK/XAPK metadata and selected static evidence, without executing app code."""
import argparse
import hashlib
import io
import json
import re
import struct
import zipfile
from pathlib import Path


def android_manifest(data):
    """Decode string pools and selected start tags from Android binary XML."""
    def u16(p):
        return struct.unpack_from('<H', data, p)[0]

    def u32(p):
        return struct.unpack_from('<I', data, p)[0]

    if u16(0) != 3:
        raise ValueError('Expected Android binary XML')
    strings, elements = [], []
    position = u16(2)
    while position < len(data):
        kind, header, size = struct.unpack_from('<HHI', data, position)
        if size < 8 or position + size > len(data):
            raise ValueError('Invalid XML chunk')
        if kind == 1:
            count, flags = u32(position + 8), u32(position + 16)
            start = position + u32(position + 20)
            utf8 = bool(flags & 256)

            def length_at(p):
                step, mask = (1, 128) if utf8 else (2, 32768)
                first = data[p] if utf8 else u16(p)
                if first & mask:
                    second = data[p + step] if utf8 else u16(p + step)
                    return ((first & (mask - 1)) << (8 if utf8 else 16)) | second, p + 2 * step
                return first, p + step

            for index in range(count):
                p = start + u32(position + header + 4 * index)
                length, p = length_at(p)
                if utf8:
                    length, p = length_at(p)
                strings.append(data[p:p + length * (1 if utf8 else 2)].decode(
                    'utf-8' if utf8 else 'utf-16le', errors='replace'))
        if kind == 0x102:
            ext = position + 16
            name = strings[u32(ext + 4)]
            attributes = {}
            for index in range(u16(ext + 12)):
                p = ext + u16(ext + 8) + index * u16(ext + 10)
                key, raw, value_kind, value = strings[u32(p + 4)], u32(p + 8), data[p + 15], u32(p + 16)
                if raw != 0xffffffff:
                    value = strings[raw]
                elif value_kind == 3:
                    value = strings[value]
                elif value_kind == 18:
                    value = bool(value)
                attributes[key] = value
            if name in {'manifest', 'application', 'uses-sdk', 'uses-permission', 'service'}:
                elements.append({'element': name, 'attributes': attributes})
        position += size
    return elements


def inspect_apk(blob, name):
    result = {'file': name, 'sha256': hashlib.sha256(blob).hexdigest(), 'libraries': [], 'evidence': []}
    # Do not extract archive entries to the filesystem.
    with zipfile.ZipFile(io.BytesIO(blob)) as archive:
        if 'AndroidManifest.xml' in archive.namelist():
            result['manifest'] = android_manifest(archive.read('AndroidManifest.xml'))
        for info in archive.infolist():
            if info.filename.startswith('lib/'):
                result['libraries'].append({'path': info.filename, 'bytes': info.file_size})
            if not (info.filename.endswith('.dex') or info.filename.endswith('/libapp.so')):
                continue
            if info.file_size > 64 * 1024 * 1024:
                raise ValueError('Unexpectedly large code entry')
            evidence = set()
            for value in re.findall(rb'[\x20-\x7e]{6,}', archive.read(info)):
                if re.search(rb'content-resolver\.bloomfactory\.|package:Bloomee/|hemantkarya\.github\.io/BloomeeTunes/repositories\.json|com/ryanheise/audioservice/AudioService;', value):
                    evidence.add(value.decode()[:500])
            if evidence:
                result['evidence'].append({'entry': info.filename, 'strings': sorted(evidence)})
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('package', type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    blob = args.package.read_bytes()
    if len(blob) > 256 * 1024 * 1024:
        raise ValueError('Package exceeds analysis size limit')
    result = {'package_file': args.package.name, 'sha256': hashlib.sha256(blob).hexdigest()}
    with zipfile.ZipFile(io.BytesIO(blob)) as archive:
        if 'manifest.json' in archive.namelist():
            result['xapk_manifest'] = json.loads(archive.read('manifest.json'))
            result['apks'] = [inspect_apk(archive.read(name), name)
                              for name in archive.namelist() if name.endswith('.apk')]
        else:
            result['apks'] = [inspect_apk(blob, args.package.name)]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"Analizzati {len(result['apks'])} APK senza esecuzione. SHA-256: {result['sha256']}")
    print(f'Resultati: {args.output}')


if __name__ == '__main__':
    main()
