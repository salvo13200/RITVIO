"""Container/identity regressions. Fixtures are synthetic, not native-test evidence."""
import importlib.util
import io
import json
from pathlib import Path
import plistlib
import stat
import struct
import tempfile
import unittest
from unittest.mock import patch
import warnings
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("ios_candidate", ROOT / "scripts/package-ios-candidate.py")
PACK = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PACK)
COMMIT = "a" * 40


def binary(platform=2, cpu=0x0100000C, minimum=15, filetype=2, encrypted=False):
    commands = struct.pack("<6I", 0x32, 24, platform, minimum << 16, 26 << 16, 0)
    if encrypted:
        commands += struct.pack("<6I", 0x2C, 24, 0, 0, 1, 0)
    return struct.pack("<8I", 0xFEEDFACF, cpu, 0, filetype, 2 if encrypted else 1, len(commands), 0, 0) + commands


def item(name, data, mode=stat.S_IFREG | 0o644):
    entry = zipfile.ZipInfo(name, (2026, 10, 26, 12, 0, 0))
    entry.create_system = 3
    entry.external_attr = mode << 16
    entry.compress_type = zipfile.ZIP_DEFLATED
    return entry, data


class CandidateTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="ritvio-ios-package-")
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.source = self.base / "native"
        self.source.mkdir()
        self.output = self.base / "candidates"
        self.lock = PACK.load_json(ROOT / "third-party/ios/runtime-lock.json")
        self.info = {"CFBundleIdentifier": "it.ritvio.ios", "CFBundlePackageType": "APPL",
                     "CFBundleSupportedPlatforms": ["iPhoneOS"], "UIDeviceFamily": [1],
                     "UIBackgroundModes": ["audio"], "MinimumOSVersion": "15.0",
                     "CFBundleExecutable": "App", "CFBundleShortVersionString": "0.5.0", "CFBundleVersion": "5"}
        self.runtime = {"schema": 1, "python": self.lock["python"]["version"],
                        "quickjs": self.lock["quickjs"]["version"], "wheels": self.lock["wheels"],
                        "sources": [{"file": "ios_resolver.py", "sha256": PACK.digest(b"# fixture\n")}]}
        self.run = {"status": "completed", "conclusion": "failure", "headSha": COMMIT,
                    "databaseId": 123, "url": "https://github.com/example/project/actions/runs/123"}
        self.entries = []

    def fixture(self, native=None, include_directory=True):
        entries = ([item("App.app/", b"", stat.S_IFDIR | 0o755)] if include_directory else []) + [
            item("App.app/Info.plist", plistlib.dumps(self.info)),
            item("App.app/App", native or binary(), stat.S_IFREG | 0o755),
            item("App.app/public/index.html", b"<!doctype html><title>Fixture</title>"),
            item("App.app/PrivacyInfo.xcprivacy", plistlib.dumps({"NSPrivacyTracking": False})),
            item("App.app/Resolver/app/runtime_manifest.json", json.dumps(self.runtime).encode()),
            item("App.app/Resolver/app/ios_resolver.py", b"# fixture\n"),
        ] + self.entries
        archive = self.source / "device.zip"
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            with zipfile.ZipFile(archive, "w") as stream:
                for entry, data in entries:
                    stream.writestr(entry, data)
        self.report = {"schema": 1, "phase": "IOS-5", "version": "0.5.0", "build": 5,
                       "minimumOS": "15.0", "deviceSigning": "none", "nativeBuild": "passed",
                       "playback": "native-synthetic-passed", "resolver": "native-checks-passed",
                       "liveProvider": "not-run", "physicalTests": "pending",
                       "uiFailures": ["Fixture UI acceptance is open"], "simulators": [{"uiTests": "failed"}],
                       "artifacts": [{"file": archive.name, "destination": "device-unsigned",
                                      "bytes": archive.stat().st_size, "sha256": PACK.file_digest(archive)}]}
        self.records()
        return archive

    def records(self):
        for name, value in (("report.json", self.report), ("run-metadata.json", self.run)):
            (self.source / name).write_text(json.dumps(value), encoding="utf-8")

    def build(self, **options):
        return PACK.package(self.source, self.source / "run-metadata.json", self.output, project=ROOT, **options)

    def test_container_preserves_bytes_permissions_and_open_evidence(self):
        source = self.fixture()
        result = self.build()
        manifest = PACK.load_json(result["manifest"])
        self.assertFalse(manifest["publicReleaseReady"])
        self.assertTrue(manifest["personalSigningRequired"])
        self.assertEqual(manifest["source"]["runConclusion"], "failure")
        self.assertEqual(manifest["checks"]["uiFailures"], self.report["uiFailures"])
        self.assertEqual(manifest["checks"]["simulators"], self.report["simulators"])
        self.assertEqual(manifest["checks"]["liveProvider"], "not-run")
        self.assertEqual(manifest["checks"]["physicalTests"], "pending")
        with zipfile.ZipFile(source) as original, zipfile.ZipFile(result["ipa"]) as ipa:
            self.assertEqual(set(ipa.namelist()), {"Payload/"} | {"Payload/" + name for name in original.namelist()})
            for entry in original.infolist():
                target = ipa.getinfo("Payload/" + entry.filename)
                self.assertEqual(ipa.read(target), original.read(entry))
                self.assertEqual(target.external_attr, entry.external_attr)
        self.assertEqual(PACK.file_digest(result["ipa"]), result["sha256"])
        folder = Path(result["ipa"]).parent
        self.assertEqual(PACK.load_json(folder / "native-report.json"), self.report)
        self.assertEqual((folder / "LICENSE").read_bytes(), (ROOT / "LICENSE").read_bytes())
        self.assertEqual(self.build()["sha256"], result["sha256"])

    def test_check_only_and_implicit_bundle_directory(self):
        self.fixture(include_directory=False)
        self.assertFalse(self.build(check_only=True)["candidateCreated"])
        self.assertFalse(self.output.exists())
        self.assertTrue(Path(self.build()["ipa"]).is_file())

    def test_archive_hash_and_report_identity_are_enforced(self):
        for change in ("hash", "version", "commit", "run-url", "running"):
            with self.subTest(change=change):
                self.fixture()
                if change == "hash": self.report["artifacts"][0]["sha256"] = "0" * 64
                if change == "version": self.report["version"] = "0.6.0"
                if change == "commit": self.run["headSha"] = "not-a-commit"
                if change == "run-url": self.run["url"] = "https://github.com/example/project/actions/runs/456"
                if change == "running": self.run["status"] = "in_progress"
                self.records()
                with self.assertRaises(ValueError): self.build()
                self.assertFalse(self.output.exists())
                self.run.update(headSha=COMMIT, status="completed", url="https://github.com/example/project/actions/runs/123")

    def test_native_platform_architecture_encryption_and_minimum_os(self):
        for native in (binary(platform=7), binary(cpu=0x01000007), binary(minimum=16), binary(encrypted=True)):
            with self.subTest(native=native.hex()):
                self.fixture(native=native)
                with self.assertRaises(ValueError): self.build()
                self.assertFalse(self.output.exists())

    def test_framework_minimum_os_is_not_ignored(self):
        self.entries = [item("App.app/Frameworks/New.framework/Info.plist", plistlib.dumps({"CFBundleExecutable": "New"})),
                        item("App.app/Frameworks/New.framework/New", binary(filetype=6, minimum=16), stat.S_IFREG | 0o755)]
        self.fixture()
        with self.assertRaisesRegex(ValueError, "newer OS"): self.build()

    def test_simulator_or_debug_bundle_cannot_masquerade_as_device_release(self):
        for field, value in (("CFBundleSupportedPlatforms", ["iPhoneSimulator"]), ("CAPACITOR_DEBUG", "true")):
            with self.subTest(field=field):
                self.info[field] = value
                self.fixture()
                with self.assertRaises(ValueError): self.build()
                self.info.pop("CAPACITOR_DEBUG", None)
                self.info["CFBundleSupportedPlatforms"] = ["iPhoneOS"]

    def test_unsafe_archive_entries_rejected_before_output(self):
        for entry in (item("../escape", b"x"), item("App.app/Info.plist", b"duplicate"),
                      item("App.app/info.plist", b"collision"), item("App.app/link", b"App", stat.S_IFLNK | 0o777),
                      item("App.app/file", b"x"), item("App.app/drive:file", b"x")):
            with self.subTest(name=entry[0].orig_filename):
                self.entries = [entry]
                if entry[0].filename == "App.app/file":
                    self.entries.append(item("App.app/file/child", b"x"))
                self.fixture()
                with self.assertRaises(ValueError): self.build()
                self.assertFalse(self.output.exists())

    def test_stored_null_and_backslash_paths_are_rejected(self):
        self.entries = [item("App.app/null_suffix", b"x")]
        for stored in (b"App.app/null\0suffix", b"App.app/null\\suffix"):
            with self.subTest(stored=stored):
                archive = self.fixture()
                archive.write_bytes(archive.read_bytes().replace(b"App.app/null_suffix", stored))
                self.report["artifacts"][0]["sha256"] = PACK.file_digest(archive)
                self.records()
                with self.assertRaisesRegex(ValueError, "Unsafe archive path"): self.build()
                self.assertFalse(self.output.exists())

    def test_runtime_source_and_lock_integrity(self):
        self.runtime["sources"][0]["sha256"] = "0" * 64
        self.fixture()
        with self.assertRaisesRegex(ValueError, "source hash"): self.build()
        self.runtime["sources"][0]["sha256"] = PACK.digest(b"# fixture\n")
        self.runtime["quickjs"] = "different"
        self.fixture()
        with self.assertRaisesRegex(ValueError, "runtime lock"): self.build()

    def test_wrong_commit_notes_fail_before_output(self):
        self.fixture()
        notes = self.base / "notes.json"
        notes.write_text(json.dumps({"sourceCommit": "b" * 40}), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "another source commit"): self.build(notes_path=notes)
        self.assertFalse(self.output.exists())

    def test_failed_write_removes_only_new_partial_candidate(self):
        self.fixture()
        with patch.object(PACK, "write_ipa", side_effect=OSError("full disk")):
            with self.assertRaises(OSError): self.build()
        self.assertFalse(list(self.output.rglob("*.ipa")))
        self.assertTrue(Path(self.build()["ipa"]).is_file())

    def test_existing_different_candidate_or_sidecar_is_never_overwritten(self):
        self.fixture()
        result = self.build()
        target = Path(result["ipa"])
        target.write_bytes(b"existing user's candidate")
        with self.assertRaises(zipfile.BadZipFile): self.build()
        self.assertEqual(target.read_bytes(), b"existing user's candidate")
        sidecar = target.parent / "candidate.json"
        sidecar.write_bytes(b"existing notes")
        with self.assertRaises(ValueError): PACK.write_new(sidecar, b"changed")
        self.assertEqual(sidecar.read_bytes(), b"existing notes")

    def test_fat_slice_offsets_and_simulator_are_validated(self):
        body = binary()
        prefix = struct.pack(">7I", 0xCAFEBABE, 1, 0x0100000C, 0, 28, len(body), 0)
        slices = PACK.macho(io.BytesIO(prefix + body), len(prefix + body))
        self.assertEqual(slices[0]["architecture"], "arm64")
        wrong = struct.pack(">7I", 0xCAFEBABE, 1, 0x0100000C, 0, 8, len(body), 0) + body
        with self.assertRaises(ValueError): PACK.macho(io.BytesIO(wrong), len(wrong))
        simulated = prefix + binary(platform=7)
        with self.assertRaises(ValueError): PACK.macho(io.BytesIO(simulated), len(simulated))


if __name__ == "__main__":
    unittest.main(verbosity=2)
