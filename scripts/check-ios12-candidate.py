"""Validate the actual legacy IPA and every bundled Mach-O deployment target."""
import importlib.util
import json
from pathlib import Path
import plistlib
import struct
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('candidate', ROOT / 'scripts/package-ios-candidate.py')
common = importlib.util.module_from_spec(spec)
spec.loader.exec_module(common)

def signing_structure(data, main=False):
    common.require(data[:4] == common.MAGICS[0] and len(data) >= 32, 'Expected thin arm64 signature container')
    count, size = struct.unpack_from('<II', data, 16)
    common.require(count <= 4096 and 32 + size <= len(data), 'Invalid signing load commands')
    cursor, paths, sealed = 32, [], False
    for _ in range(count):
        common.require(cursor + 8 <= 32 + size, 'Truncated signing command')
        command, length = struct.unpack_from('<II', data, cursor)
        common.require(length >= 8 and cursor + length <= 32 + size, 'Invalid signing command length')
        if command == 0x8000001c:
            common.require(length >= 12, 'Invalid runtime path command')
            offset = struct.unpack_from('<I', data, cursor + 8)[0]
            common.require(12 <= offset < length, 'Invalid runtime path offset')
            paths.append(data[cursor + offset:cursor + length].split(b'\0', 1)[0].decode('utf-8'))
        if command == 0x1d:
            common.require(length == 16, 'Invalid signature command')
            offset, size_blob = struct.unpack_from('<II', data, cursor + 8)
            common.require(offset >= 32 + size and size_blob >= 12 and offset + size_blob <= len(data), 'Invalid signature bounds')
            common.require(data[offset:offset + 4] == b'\xfa\xde\x0c\xc0', 'Missing signature superblob')
            sealed = True
        cursor += length
    common.require(cursor == 32 + size and sealed, 'Missing ad-hoc signature structure for re-signing')
    if main:
        common.require('@executable_path/Frameworks' in paths, 'Bundled Swift runtime search path missing')
    return paths

def check(path):
    with zipfile.ZipFile(path) as archive:
        files, root = common.members(archive, ipa=True)
        info = plistlib.loads(archive.read(root + '/Info.plist'))
        common.require(info['CFBundleIdentifier'] == 'it.ritvio.pctest' and info['MinimumOSVersion'] == '12.0' and info['CFBundleSupportedPlatforms'] == ['iPhoneOS'], 'Not the iOS-12 device test')
        common.require('audio' in info['UIBackgroundModes'], 'Background declaration missing')
        common.require(root + '/embedded.mobileprovision' not in files, 'Unexpected personal profile')
        common.require(root + '/public/index.html' in files, 'Bundled interface missing')
        common.require(root + '/_CodeSignature/CodeResources' in files, 'Ad-hoc resource seal missing')
        common.require(files[root + '/Info.plist'].compress_type == zipfile.ZIP_STORED, 'Bundle metadata must be stored uncompressed for re-signing')
        common.require(all(not any(word in name for word in ['Python.framework','Capacitor.framework','Cordova.framework','Resolver/app/']) for name in files), 'Modern runtime leaked into legacy IPA')
        binaries = []
        for name, item in files.items():
            if item.is_dir(): continue
            with archive.open(item) as stream:
                if stream.read(4) not in common.MAGICS: continue
                slices = common.macho(stream,item.file_size)
            common.require(all(tuple(s['minimumOS']) <= (12,0,0) for s in slices), 'Binary requires newer iOS: '+name)
            signing_structure(archive.read(item), main=name == root + '/PCTest')
            binaries.append({'file':name[len(root)+1:],'slices':slices})
        common.require(any(b['file'] == 'PCTest' for b in binaries), 'Device executable missing')
        common.require(archive.testzip() is None, 'IPA CRC failed')
    return {'container':'passed','nativeMinimumOS':'passed','adHocSignatureStructure':'passed','bundledSwiftRpath':'passed','minimumOS':'12.0','sha256':common.file_digest(path),'bytes':Path(path).stat().st_size,'binaries':binaries,'physicalTests':'pending','personalSigningRequired':True,'publicReleaseReady':False}

if __name__ == '__main__':
    result = check(Path(sys.argv[1]))
    if len(sys.argv)>2: Path(sys.argv[2]).write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result))
