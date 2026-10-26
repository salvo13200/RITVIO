"""Build the isolated iOS-12 PC-assisted test with Xcode 15.x, without signing."""
from pathlib import Path
import hashlib
import json
import os
import plistlib
import shutil
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.local/ios12/native'
ARTIFACTS = ROOT / '.local/ios12/artifacts'
SHARED = ROOT / 'apps/mobile/ios/App/App'

def run(*args):
    return subprocess.check_output(list(map(str, args)), cwd=ROOT, text=True).strip()

def archive_app(app, target_file, simulator=False):
    # Keep bundle metadata uncompressed for compatibility with IPA re-signers.
    # This changes the container only; personal signing is still mandatory.
    with zipfile.ZipFile(target_file, 'w', zipfile.ZIP_DEFLATED) as archive:
        for file in sorted(app.rglob('*')):
            if file.is_file():
                name = ('' if simulator else 'Payload/') + 'PCTest.app/' + file.relative_to(app).as_posix()
                archive.write(file, name, compress_type=zipfile.ZIP_STORED if file.name == 'Info.plist' else zipfile.ZIP_DEFLATED)

def build(simulator=False):
    sdk = 'iphonesimulator' if simulator else 'iphoneos'
    arch = 'arm64'  # macos-14 is Apple Silicon; device remains general arm64.
    minimum = '14.0' if simulator else '12.0'
    target = arch + '-apple-ios' + minimum + ('-simulator' if simulator else '')
    app = OUT / sdk / 'PCTest.app'
    app.mkdir(parents=True, exist_ok=True)
    generated = OUT / 'sources'
    generated.mkdir(parents=True, exist_ok=True)
    sources = [SHARED / name for name in ['PlaybackQueue.swift','NativePlaybackOwner.swift','NativeLibraryStore.swift']]
    loader = (SHARED / 'PlaybackResourceLoader.swift').read_text()
    assert loader.count('import UniformTypeIdentifiers') == 1 and loader.count('UTType.mpeg4Audio.identifier') == 1
    loader = loader.replace('import UniformTypeIdentifiers','import MobileCoreServices').replace('UTType.mpeg4Audio.identifier','kUTTypeMPEG4Audio as String')
    assert loader.count('response.value(forHTTPHeaderField: "Content-Range")') == 1
    loader = loader.replace('response.value(forHTTPHeaderField: "Content-Range")','PCHeader.value(response, "Content-Range")')
    (generated / 'PlaybackResourceLoader.swift').write_text(loader)
    sources += [generated / 'PlaybackResourceLoader.swift'] + sorted((ROOT / 'apps/ios12-test/native').glob('*.swift'))
    sdk_path = run('xcrun','--sdk',sdk,'--show-sdk-path')
    command = ['xcrun','swiftc','-sdk',sdk_path,'-target',target,'-swift-version','5','-O','-whole-module-optimization','-warnings-as-errors']
    command += list(map(str,sources)) + ['-o',str(app / 'PCTest')]
    for framework in ['UIKit','WebKit','AVFoundation','MediaPlayer','ImageIO','MobileCoreServices','Security']:
        command += ['-framework',framework]
    command += ['-Xlinker','-rpath','-Xlinker','/usr/lib/swift',
                '-Xlinker','-rpath','-Xlinker','@executable_path/Frameworks']
    subprocess.run(command, cwd=ROOT, check=True)
    metadata = {'CFBundleIdentifier':'it.ritvio.pctest','CFBundleDisplayName':'RITVIO PC Test','CFBundleName':'PCTest',
                'CFBundleExecutable':'PCTest','CFBundlePackageType':'APPL','CFBundleShortVersionString':'0.1.1','CFBundleVersion':'2',
                'MinimumOSVersion':minimum,'CFBundleSupportedPlatforms':['iPhoneSimulator' if simulator else 'iPhoneOS'],
                'UIDeviceFamily':[1],'LSRequiresIPhoneOS':True,'UIRequiredDeviceCapabilities':['arm64'],
                'UIBackgroundModes':['audio'],'UIStatusBarStyle':'UIStatusBarStyleLightContent','UILaunchStoryboardName':'LaunchScreen',
                'NSPhotoLibraryUsageDescription':'Choose a cover for your personal RITVIO test playlist.',
                'NSAppTransportSecurity':{'NSAllowsArbitraryLoads':True},
                'UISupportedInterfaceOrientations':['UIInterfaceOrientationPortrait','UIInterfaceOrientationLandscapeLeft','UIInterfaceOrientationLandscapeRight']}
    (app / 'Info.plist').write_bytes(plistlib.dumps(metadata))
    subprocess.run(['xcrun','ibtool','--compile',str(app / 'LaunchScreen.storyboardc'),'--minimum-deployment-target','12.0',str(SHARED / 'Base.lproj/LaunchScreen.storyboard')],check=True)
    shutil.copytree(ROOT / '.local/ios12/web',app / 'public',dirs_exist_ok=True)
    shutil.copyfile(SHARED / 'PrivacyInfo.xcprivacy', app / 'PrivacyInfo.xcprivacy')
    for size, name in [(120,'Icon60@2x.png'),(180,'Icon60@3x.png')]:
        subprocess.run(['sips','-z',str(size),str(size),str(ROOT / 'build-resources/icon.png'),'--out',str(app / name)],check=True,stdout=subprocess.DEVNULL)
    metadata['CFBundleIcons'] = {'CFBundlePrimaryIcon':{'CFBundleIconFiles':['Icon60'],'UIPrerenderedIcon':False}}
    (app / 'Info.plist').write_bytes(plistlib.dumps(metadata))
    for name in ['LICENSE','THIRD_PARTY_NOTICES.md']:
        shutil.copyfile(ROOT / name,app / name)
    # Copy any back-deployment Swift libraries required by the linked binary.
    subprocess.run(['xcrun','swift-stdlib-tool','--copy','--platform',sdk,'--scan-executable',str(app / 'PCTest'),'--destination',str(app / 'Frameworks')],check=True)
    # Ad-hoc seals reserve complete signature structures for downstream re-signing.
    # They grant no installation entitlement and contain no Apple account/profile.
    signing = ['codesign','--force','--sign','-','--timestamp=none','--digest-algorithm=sha1,sha256']
    for library in sorted((app / 'Frameworks').glob('*.dylib')):
        subprocess.run(signing + [str(library)],check=True)
    subprocess.run(signing + [str(app)],check=True)
    subprocess.run(['codesign','--verify','--deep','--strict',str(app)],check=True)
    ARTIFACTS.mkdir(parents=True,exist_ok=True)
    name = 'RITVIO-iOS12-PC-Test-0.1.1-' + ('simulator.zip' if simulator else 'unsigned.ipa')
    target_file = ARTIFACTS / name
    archive_app(app, target_file, simulator)
    checksum = hashlib.sha256(target_file.read_bytes()).hexdigest()
    (ARTIFACTS / (name + '.sha256')).write_text(checksum + '  ' + name + '\n')
    evidence = {'schema':1,'purpose':'temporary-ios12-pc-test','publicReleaseReady':False,'minimumOS':minimum,
                'architecture':'arm64','destination':sdk,'signing':'ad-hoc-simulator' if simulator else 'ad-hoc-placeholder-personal-signing-required',
                'adHocSealVerification':'passed','personalProvisioningProfile':False,
                'embeddedPython':False,'embeddedCapacitor':False,'pcRequired':True,'physicalTests':'pending',
                'xcode':run('xcodebuild','-version'),'sourceCommit':run('git','rev-parse','HEAD'),
                'artifact':{'file':name,'bytes':target_file.stat().st_size,'sha256':checksum},
                'binaryLoadCommands':run('xcrun','otool','-l',app / 'PCTest'),
                'sharedSources':{file.name:hashlib.sha256(file.read_bytes()).hexdigest() for file in sources}}
    (ARTIFACTS / (sdk + '-report.json')).write_text(json.dumps(evidence,indent=2)+'\n')
    print(json.dumps({'artifact':str(target_file),'sha256':checksum,'physicalTests':'pending'}))
    return app

if __name__ == '__main__':
    if sys.platform != 'darwin': raise SystemExit('Native compilation requires macOS/Xcode; no signing account required to build.')
    build(simulator='--simulator' in sys.argv)
