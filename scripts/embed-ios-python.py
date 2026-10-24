"""Xcode build phase: bundle the target's stdlib and framework-form extensions.

The relocation follows CPython's documented iOS .fwork loader. Never run code or
install packages on the phone. All input archives are checked before this phase.
"""
from pathlib import Path
import os
import plistlib
import shutil
import subprocess

project = Path(os.environ['PROJECT_DIR']).resolve()
app = Path(os.environ['CODESIGNING_FOLDER_PATH']).resolve()
expected = (Path(os.environ['TARGET_BUILD_DIR']) / os.environ['FULL_PRODUCT_NAME']).resolve()
if app != expected or app.suffix != '.app' or not app.is_dir():
    raise ValueError('Unexpected build product')
runtime = project / 'Runtime'
framework = runtime / 'Python.xcframework'
platform = os.environ['EFFECTIVE_PLATFORM_NAME']
if platform not in ('-iphonesimulator', '-iphoneos'):
    raise ValueError('Unsupported Python destination')
slice_path = framework / ('ios-arm64_x86_64-simulator' if platform == '-iphonesimulator' else 'ios-arm64')
architectures = os.environ['ARCHS'].split()
if not architectures or any(value not in ('arm64', 'x86_64') for value in architectures):
    raise ValueError('Unexpected native architectures')

ignored = shutil.ignore_patterns('__pycache__', '*.pyc', 'tests', 'test', 'idlelib', 'tkinter', 'turtledemo', 'ensurepip', 'libpython*.dylib')
python_path = app / 'python'
if python_path.exists():
    shutil.rmtree(python_path)
common = framework / 'lib'
shutil.copytree(common, python_path / 'lib', ignore=ignored)
for architecture in architectures:
    source = slice_path / ('lib-' + architecture)
    for file in source.rglob('*'):
        if not file.is_file() or file.is_symlink() or '__pycache__' in file.parts:
            continue
        destination = python_path / 'lib' / file.relative_to(source)
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.exists() and file.suffix == '.so':
            temporary = destination.with_suffix('.merge')
            subprocess.run(['lipo', '-create', str(destination), str(file), '-output', str(temporary)], check=True)
            temporary.replace(destination)
        else:
            shutil.copyfile(file, destination)

resolver = app / 'Resolver'
if resolver.exists():
    shutil.rmtree(resolver)
for name in ('app', 'site-packages'):
    shutil.copytree(runtime / name, resolver / name, ignore=ignored)
notices = project.parents[3] / 'third-party'
if notices.is_dir():
    shutil.copytree(notices, resolver / 'licenses', ignore=ignored)

dynamic = python_path / 'lib/python3.13/lib-dynload'
for module in dynamic.glob('*.so'):
    name = module.name.split('.')[0]
    target = app / 'Frameworks' / (name + '.framework')
    target.mkdir(parents=True, exist_ok=True)
    binary = target / name
    shutil.copyfile(module, binary)
    plist = {'CFBundleDevelopmentRegion': 'en', 'CFBundleExecutable': name,
             'CFBundleIdentifier': 'it.ritvio.python.' + name.replace('_', '-'),
             'CFBundleInfoDictionaryVersion': '6.0', 'CFBundleName': name,
             'CFBundlePackageType': 'FMWK', 'CFBundleShortVersionString': '3.13.17',
             'CFBundleVersion': '17', 'MinimumOSVersion': '13.0',
             'CFBundleSupportedPlatforms': ['iPhoneSimulator' if platform == '-iphonesimulator' else 'iPhoneOS']}
    (target / 'Info.plist').write_bytes(plistlib.dumps(plist))
    placeholder = module.with_suffix('.fwork')
    placeholder.write_text('Frameworks/' + name + '.framework/' + name + '\n')
    (target / (name + '.origin')).write_text(str(placeholder.relative_to(app)) + '\n')
    privacy = module.with_name(name + '.xcprivacy')
    if privacy.exists():
        shutil.copyfile(privacy, target / 'PrivacyInfo.xcprivacy')
    module.unlink()
    # Simulator loader requires valid Mach-O signatures. No Apple identity is used.
    if platform == '-iphonesimulator':
        subprocess.run(['codesign', '--force', '--sign', '-', '--timestamp=none', str(target)], check=True)
print('Embedded Python 3.13.17, locked pure-Python dependencies and native extensions for ' + ' '.join(architectures))
if platform == '-iphonesimulator':
    subprocess.run(['codesign', '--force', '--sign', '-', '--timestamp=none', str(app / 'Frameworks/Python.framework')], check=True)
