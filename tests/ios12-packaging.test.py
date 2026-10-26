"""Regression checks for the legacy IPA container and signing prerequisites."""
import importlib.util
from pathlib import Path
import struct
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

builder = load('legacy_builder', 'scripts/build-ios12-test.py')
checker = load('legacy_checker', 'scripts/check-ios12-candidate.py')

def executable(path=True, signature=True):
    commands = []
    if path:
        value = b'@executable_path/Frameworks\0'
        length = (12 + len(value) + 7) // 8 * 8
        commands.append(struct.pack('<III', 0x8000001c, length, 12) + value + b'\0' * (length - 12 - len(value)))
    if signature:
        offset = 32 + sum(map(len, commands)) + 16
        commands.append(struct.pack('<IIII', 0x1d, 16, offset, 12))
    header = struct.pack('<8I', 0xfeedfacf, 0x100000c, 0, 2, len(commands), sum(map(len, commands)), 0, 0)
    return header + b''.join(commands) + (struct.pack('>III', 0xfade0cc0, 12, 0) if signature else b'')

class Packaging(unittest.TestCase):
    def test_metadata_stored_and_binary_content_permissions_preserved(self):
        with tempfile.TemporaryDirectory() as temp:
            app = Path(temp) / 'PCTest.app'
            app.mkdir()
            (app / 'Info.plist').write_bytes(b'<plist>test metadata</plist>')
            binary = app / 'PCTest'
            binary.write_bytes(executable())
            binary.chmod(0o755)
            target = Path(temp) / 'test.ipa'
            builder.archive_app(app, target)
            with zipfile.ZipFile(target) as archive:
                self.assertIsNone(archive.testzip())
                self.assertEqual(archive.getinfo('Payload/PCTest.app/Info.plist').compress_type, zipfile.ZIP_STORED)
                self.assertEqual(archive.read('Payload/PCTest.app/PCTest'), binary.read_bytes())
                if __import__('os').name != 'nt':
                    self.assertTrue(archive.getinfo('Payload/PCTest.app/PCTest').external_attr >> 16 & 0o111)

    def test_accepts_structural_seal_and_bundled_runtime_path(self):
        self.assertIn('@executable_path/Frameworks', checker.signing_structure(executable(), main=True))

    def test_rejects_missing_signature_and_runtime_path(self):
        with self.assertRaisesRegex(ValueError, 'Missing ad-hoc'):
            checker.signing_structure(executable(signature=False), main=True)
        with self.assertRaisesRegex(ValueError, 'runtime search path'):
            checker.signing_structure(executable(path=False), main=True)

    def test_rejects_truncated_signature(self):
        with self.assertRaisesRegex(ValueError, 'signature bounds'):
            checker.signing_structure(executable()[:-1], main=True)

if __name__ == '__main__':
    unittest.main()
