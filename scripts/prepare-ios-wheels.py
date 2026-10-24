"""Install only locked pure-Python wheels; no pip hooks or binary wheels run."""
from pathlib import Path, PurePosixPath
import sys
import zipfile

target = Path(sys.argv[1]).resolve()
target.mkdir(parents=True, exist_ok=True)
for filename in sys.argv[2:]:
    if not filename.endswith('none-any.whl'):
        raise ValueError('Only pure Python wheels are supported')
    with zipfile.ZipFile(filename) as wheel:
        for entry in wheel.infolist():
            name = PurePosixPath(entry.filename)
            if name.is_absolute() or '..' in name.parts or (entry.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError('Unsafe wheel member')
            output = target.joinpath(*name.parts).resolve()
            if not output.is_relative_to(target):
                raise ValueError('Wheel escaped installation directory')
            if entry.is_dir():
                output.mkdir(parents=True, exist_ok=True)
            else:
                if entry.file_size > 32 * 1024 * 1024:
                    raise ValueError('Oversized wheel member')
                output.parent.mkdir(parents=True, exist_ok=True)
                output.write_bytes(wheel.read(entry))
