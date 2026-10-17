"""Check packaged ABIs and ELF/ZIP alignment for Android 16 KB devices."""
import hashlib
import json
from pathlib import Path
import struct
import sys
import zipfile

artifact = Path(sys.argv[1] if len(sys.argv)>1 else 'release/RITVIO-Android-0.1.0.apk')
libraries = []
with artifact.open('rb') as file, zipfile.ZipFile(file) as archive:
    for entry in archive.infolist():
        if not entry.filename.startswith('lib/') or not entry.filename.endswith('.so'): continue
        data=archive.read(entry)
        if data[:4] != b'\x7fELF': continue
        assert data[4] == 2 and data[5] == 1, 'Expected little-endian ELF64'
        offset=struct.unpack_from('<Q',data,32)[0]
        size,count=struct.unpack_from('<HH',data,54)
        loads=[]
        for index in range(count):
            header=offset+index*size
            if struct.unpack_from('<I',data,header)[0] != 1: continue
            file_offset,virtual_address=struct.unpack_from('<QQ',data,header+8)
            alignment=struct.unpack_from('<Q',data,header+48)[0]
            loads.append(alignment>=16384 and file_offset%16384==virtual_address%16384)
        file.seek(entry.header_offset+26)
        name_length,extra_length=struct.unpack('<HH',file.read(4))
        data_offset=entry.header_offset+30+name_length+extra_length
        libraries.append({'file':entry.filename,'elf16k':bool(loads) and all(loads),'zip16k':entry.compress_type!=zipfile.ZIP_STORED or data_offset%16384==0,'compressed':entry.compress_type!=zipfile.ZIP_STORED})
    assert 'assets/capacitor.config.json' in archive.namelist()
result={'artifact':str(artifact),'bytes':artifact.stat().st_size,'sha256':hashlib.sha256(artifact.read_bytes()).hexdigest(),'abis':sorted({item['file'].split('/')[1] for item in libraries}),'libraries':libraries,'elfAndZip16k':all(item['elf16k'] and item['zip16k'] for item in libraries)}
assert set(result['abis'])=={'arm64-v8a','x86_64'}
Path(sys.argv[2] if len(sys.argv)>2 else 'data/analysis/android-apk-check.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps({'artifact':str(artifact),'libraries':len(libraries),'elfAndZip16k':result['elfAndZip16k'],'failures':[item['file'] for item in libraries if not item['elf16k'] or not item['zip16k']]}))
if not result['elfAndZip16k']:sys.exit(1)
