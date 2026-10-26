"""Validate the actual legacy IPA and every bundled Mach-O deployment target."""
import importlib.util
import json
from pathlib import Path
import plistlib
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('candidate', ROOT / 'scripts/package-ios-candidate.py')
common = importlib.util.module_from_spec(spec)
spec.loader.exec_module(common)

def check(path):
    with zipfile.ZipFile(path) as archive:
        files, root = common.members(archive, ipa=True)
        info = plistlib.loads(archive.read(root + '/Info.plist'))
        common.require(info['CFBundleIdentifier'] == 'it.ritvio.pctest' and info['MinimumOSVersion'] == '12.0' and info['CFBundleSupportedPlatforms'] == ['iPhoneOS'], 'Not the iOS-12 device test')
        common.require('audio' in info['UIBackgroundModes'], 'Background declaration missing')
        common.require(root + '/embedded.mobileprovision' not in files, 'Unexpected personal profile')
        common.require(root + '/public/index.html' in files, 'Bundled interface missing')
        common.require(all(not any(word in name for word in ['Python.framework','Capacitor.framework','Cordova.framework','Resolver/app/']) for name in files), 'Modern runtime leaked into legacy IPA')
        binaries = []
        for name, item in files.items():
            if item.is_dir(): continue
            with archive.open(item) as stream:
                if stream.read(4) not in common.MAGICS: continue
                slices = common.macho(stream,item.file_size)
            common.require(all(tuple(s['minimumOS']) <= (12,0,0) for s in slices), 'Binary requires newer iOS: '+name)
            binaries.append({'file':name[len(root)+1:],'slices':slices})
        common.require(any(b['file'] == 'PCTest' for b in binaries), 'Device executable missing')
        common.require(archive.testzip() is None, 'IPA CRC failed')
    return {'container':'passed','nativeMinimumOS':'passed','minimumOS':'12.0','sha256':common.file_digest(path),'bytes':Path(path).stat().st_size,'binaries':binaries,'physicalTests':'pending','personalSigningRequired':True,'publicReleaseReady':False}

if __name__ == '__main__':
    result = check(Path(sys.argv[1]))
    if len(sys.argv)>2: Path(sys.argv[2]).write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result))
