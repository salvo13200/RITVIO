"""Create an unsigned physical-test IPA from a verified device-build archive.

No extraction, network access, Apple credentials, signing or publication.
UI/provider/device outcomes are carried forward as evidence, never upgraded.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
from pathlib import Path, PurePosixPath
import plistlib
import re
import stat
import struct
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
MAX_TOTAL = 512 * 1024 * 1024
MAX_FILE = 64 * 1024 * 1024
MAGICS = (b"\xcf\xfa\xed\xfe", b"\xfe\xed\xfa\xcf",
          b"\xca\xfe\xba\xbe", b"\xbe\xba\xfe\xca",
          b"\xca\xfe\xba\xbf", b"\xbf\xba\xfe\xca")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def file_digest(path):
    result = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(chunk)
    return result.hexdigest()


def version(value):
    require(isinstance(value, str) and re.fullmatch(r"\d{1,5}(?:\.\d{1,3}){0,2}", value), "Invalid OS version")
    return tuple((list(map(int, value.split("."))) + [0, 0])[:3])


def os_version(value):
    return (value >> 16, (value >> 8) & 255, value & 255)


def macho(stream, size, offset=0, span=None, depth=0):
    """Read load commands, not architecture names inferred from a ZIP filename."""
    span = size if span is None else span
    require(depth <= 1 and 0 <= offset <= size and 0 < span <= size - offset, "Invalid Mach-O slice")
    stream.seek(offset)
    header = stream.read(min(32, span))
    magic = header[:4]
    require(magic in MAGICS, "Unsupported native executable")
    if magic in MAGICS[2:]:
        require(depth == 0 and len(header) >= 8, "Nested or incomplete fat Mach-O")
        endian = ">" if magic in (MAGICS[2], MAGICS[4]) else "<"
        wide = magic in (MAGICS[4], MAGICS[5])
        count = struct.unpack_from(endian + "I", header, 4)[0]
        require(1 <= count <= 8, "Invalid fat Mach-O architecture count")
        record_size = 32 if wide else 20
        table_size = 8 + count * record_size
        require(table_size <= span, "Incomplete fat Mach-O table")
        stream.seek(offset + 8)
        table = stream.read(count * record_size)
        ranges, result = [], []
        for index in range(count):
            record = struct.unpack_from(endian + ("IIQQII" if wide else "IIIII"), table, index * record_size)
            cpu, subtype, start, length = record[:4]
            require(start >= table_size and length > 0 and start + length <= span, "Invalid fat Mach-O bounds")
            require(all(start + length <= left or start >= right for left, right in ranges), "Overlapping Mach-O slices")
            ranges.append((start, start + length))
            children = macho(stream, size, offset + start, length, depth + 1)
            require(all(child["cpu"] == cpu and child["subtype"] == subtype for child in children), "Mach-O architecture mismatch")
            result.extend(children)
        return result
    require(len(header) == 32, "Incomplete Mach-O header")
    endian = "<" if magic == MAGICS[0] else ">"
    _, cpu, subtype, filetype, count, command_bytes, _, _ = struct.unpack(endian + "8I", header)
    require(cpu == 0x0100000C and subtype & 0x00FFFFFF == 0, "Device requires a general arm64 slice; simulator/arm64e-only binary rejected")
    require(filetype in (2, 6, 8) and count <= 4096 and command_bytes <= 1024 * 1024, "Invalid native binary header")
    require(32 + command_bytes <= span, "Incomplete Mach-O commands")
    commands = stream.read(command_bytes)
    cursor, platforms, signature = 0, [], False
    for _ in range(count):
        require(cursor + 8 <= len(commands), "Incomplete load command")
        command, length = struct.unpack_from(endian + "II", commands, cursor)
        require(length >= 8 and cursor + length <= len(commands), "Invalid load command length")
        if command == 0x32:
            require(length >= 24, "Incomplete platform command")
            platform, minimum, sdk = struct.unpack_from(endian + "III", commands, cursor + 8)
            platforms.append((platform, minimum, sdk))
        elif command == 0x25:
            require(length >= 16, "Incomplete legacy iOS command")
            minimum, sdk = struct.unpack_from(endian + "II", commands, cursor + 8)
            platforms.append((2, minimum, sdk))
        elif command == 0x2C:
            require(length >= 24 and struct.unpack_from(endian + "I", commands, cursor + 16)[0] == 0, "Encrypted binary is not a source-built candidate")
        elif command == 0x1D:
            signature = True
        cursor += length
    require(cursor == len(commands) and len(platforms) == 1 and platforms[0][0] == 2, "Native binary is not an iPhoneOS device build")
    return [{"cpu": cpu, "subtype": subtype, "architecture": "arm64", "filetype": filetype,
             "minimumOS": os_version(platforms[0][1]), "sdk": os_version(platforms[0][2]),
             "codeSignaturePresent": signature}]


def members(archive, ipa=False):
    infos = archive.infolist()
    require(0 < len(infos) <= 20000 and sum(info.file_size for info in infos) <= MAX_TOTAL, "Archive exceeds candidate limits")
    found, folded = {}, set()
    for info in infos:
        name = info.filename
        parts = name.rstrip("/").split("/")
        require(name == info.orig_filename and name and not name.startswith("/") and "\\" not in name and
                all(part not in ("", ".", "..") and ":" not in part and
                    not any(ord(char) < 32 or ord(char) == 127 for char in part) for part in parts), "Unsafe archive path")
        require(name not in found and name.casefold() not in folded, "Duplicate or case-colliding archive member")
        require(info.file_size <= MAX_FILE and not info.flag_bits & 1, "Oversized or encrypted ZIP member")
        mode = info.external_attr >> 16
        kind = stat.S_IFMT(mode)
        require(kind in (0, stat.S_IFREG, stat.S_IFDIR), "Links and special files are not supported in a device candidate")
        require((not info.is_dir() or info.file_size == 0) and
                (kind != stat.S_IFDIR or info.is_dir()), "Invalid directory member")
        found[name] = info
        folded.add(name.casefold())
    for name in found:
        parents = PurePosixPath(name.rstrip("/")).parents
        require(all(str(parent).casefold() not in folded for parent in parents if str(parent) != "."),
                "A file cannot be an archive directory")
    usable = [name for name in found if not name.startswith("__MACOSX/")]
    if ipa:
        require(all(name.startswith("Payload/") for name in usable), "IPA must contain only Payload")
        roots = {"/".join(name.rstrip("/").split("/")[:2]) for name in usable if name != "Payload/"}
    else:
        roots = {name.split("/")[0] for name in usable}
    require(len(roots) == 1, "Expected exactly one app bundle")
    root = next(iter(roots))
    require(root.endswith(".app"), "Expected a device .app archive, not a simulator or another IPA")
    return {name: info for name, info in found.items() if name == root + "/" or name.startswith(root + "/")}, root


def bounded_read(archive, info, maximum=1024 * 1024):
    require(info.file_size <= maximum, "Bundle metadata exceeds its limit")
    return archive.read(info)


def inspect_bundle(archive, ipa=False):
    files, root = members(archive, ipa)
    prefix = root + "/"
    require(prefix + "Info.plist" in files, "App Info.plist missing")
    info = plistlib.loads(bounded_read(archive, files[prefix + "Info.plist"]))
    require(isinstance(info, dict) and info.get("CFBundleIdentifier") == "it.ritvio.ios" and
            info.get("CFBundlePackageType") == "APPL" and info.get("CFBundleSupportedPlatforms") == ["iPhoneOS"], "Bundle is not the RITVIO iPhoneOS app")
    require(1 in info.get("UIDeviceFamily", []) and "audio" in info.get("UIBackgroundModes", []), "iPhone/background-audio declaration missing")
    require(str(info.get("CAPACITOR_DEBUG", "")).lower() not in ("true", "yes", "1"), "Expected the Release device build")
    minimum = version(info.get("MinimumOSVersion"))
    executable = info.get("CFBundleExecutable")
    require(isinstance(executable, str) and re.fullmatch(r"[A-Za-z0-9_-]+", executable), "Invalid executable name")
    require(prefix + executable in files and files[prefix + executable].external_attr >> 16 & 0o111, "Main executable or executable permissions missing")
    for name in ("public/index.html", "PrivacyInfo.xcprivacy", "Resolver/app/runtime_manifest.json"):
        require(prefix + name in files, "Required bundled resource missing: " + name)
    require(prefix + "embedded.mobileprovision" not in files, "Expected an unsigned build without a personal provisioning profile")
    require(isinstance(plistlib.loads(bounded_read(archive, files[prefix + "PrivacyInfo.xcprivacy"])), dict), "Invalid privacy manifest")
    runtime = json.loads(bounded_read(archive, files[prefix + "Resolver/app/runtime_manifest.json"]))
    require(runtime.get("schema") == 1 and isinstance(runtime.get("wheels"), list) and
            isinstance(runtime.get("sources"), list), "Invalid embedded-runtime manifest")
    for item in runtime["sources"]:
        require(isinstance(item, dict) and isinstance(item.get("file"), str) and
                re.fullmatch(r"[a-z_]+\.py", item["file"]) and re.fullmatch(r"[a-f0-9]{64}", item.get("sha256", "")), "Invalid runtime source inventory")
        name = prefix + "Resolver/app/" + item["file"]
        require(name in files and digest(bounded_read(archive, files[name])) == item["sha256"], "Bundled resolver source hash mismatch")
    native = []
    for name, item in sorted(files.items()):
        if item.is_dir():
            continue
        with archive.open(item) as stream:
            if stream.read(4) not in MAGICS:
                continue
            slices = macho(stream, item.file_size)
        require(all(tuple(part["minimumOS"]) <= minimum for part in slices), "Native dependency requires a newer OS than the app: " + name[len(prefix):])
        native.append({"file": name[len(prefix):], "bytes": item.file_size,
                       "sha256": digest(archive.read(item)), "slices": slices})
    main = next((item for item in native if item["file"] == executable), None)
    require(main is not None and all(part["filetype"] == 2 for part in main["slices"]), "Main file is not an arm64 device executable")
    binaries = {item["file"] for item in native}
    frameworks = []
    for name, item in sorted(files.items()):
        relative = name[len(prefix):]
        if re.fullmatch(r"Frameworks/[^/]+\.framework/Info\.plist", relative):
            metadata = plistlib.loads(bounded_read(archive, item))
            binary = str(PurePosixPath(relative).parent / str(metadata.get("CFBundleExecutable", "")))
            require(binary in binaries, "Framework executable missing or invalid: " + relative)
            frameworks.append({"bundle": str(PurePosixPath(relative).parent),
                               "identifier": metadata.get("CFBundleIdentifier"),
                               "version": metadata.get("CFBundleShortVersionString")})
    return {"root": root, "metadata": info, "runtime": runtime, "nativeBinaries": native,
            "frameworks": frameworks, "members": files}


def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def verify_source(artifacts, run_path, project=ROOT):
    report, run = load_json(artifacts / "report.json"), load_json(run_path)
    commit = run.get("headSha", "")
    require(re.fullmatch(r"[a-f0-9]{40}", commit) and run.get("status") == "completed" and
            run.get("conclusion") in ("success", "failure"), "A completed source-run record is required")
    require(isinstance(run.get("databaseId"), int) and run["databaseId"] > 0 and
            re.fullmatch(r"https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/actions/runs/" + str(run["databaseId"]), run.get("url", "")), "Invalid source-run identity")
    require(report.get("schema") == 1 and report.get("deviceSigning") == "none", "Expected a native unsigned-build report")
    choices = [item for item in report.get("artifacts", []) if item.get("destination") == "device-unsigned"]
    require(len(choices) == 1, "Native report must identify one device archive")
    source = choices[0]
    require(isinstance(source.get("file"), str) and re.fullmatch(r"[A-Za-z0-9_.-]+\.zip", source["file"]), "Invalid device archive filename")
    path = artifacts / source["file"]
    require(path.is_file() and path.stat().st_size == source.get("bytes") and file_digest(path) == source.get("sha256"), "Device archive does not match its native report")
    with zipfile.ZipFile(path) as archive:
        result = inspect_bundle(archive)
        require(archive.testzip() is None, "Device archive CRC failure")
    app, runtime = result["metadata"], result["runtime"]
    require(app.get("CFBundleShortVersionString") == report.get("version") and
            str(app.get("CFBundleVersion")) == str(report.get("build")) and
            app.get("MinimumOSVersion") == report.get("minimumOS"), "App/report version mismatch")
    require(re.fullmatch(r"\d+\.\d+\.\d+", str(report.get("version", ""))) and
            isinstance(report.get("build"), int) and report["build"] > 0, "Invalid candidate build identity")
    lock = load_json(project / "third-party/ios/runtime-lock.json")
    expected = sorted((item["name"], item["version"], item["sha256"]) for item in lock["wheels"])
    actual = sorted((item["name"], item["version"], item["sha256"]) for item in runtime["wheels"])
    require(runtime.get("python") == lock["python"]["version"] and runtime.get("quickjs") == lock["quickjs"]["version"] and actual == expected, "Embedded dependencies differ from the runtime lock")
    return path, result, report, run, source


def write_new(path, data):
    if path.exists():
        require(path.is_file() and path.read_bytes() == data, "Existing candidate file differs; refusing to overwrite: " + path.name)
        return
    with path.open("xb") as stream:
        stream.write(data)


def package(artifacts, run_path, output, notes_path=None, project=ROOT, check_only=False):
    artifacts, output, project = Path(artifacts).resolve(), Path(output).resolve(), Path(project).resolve()
    source_path, source_bundle, report, run, source = verify_source(artifacts, run_path, project)
    notes = load_json(notes_path) if notes_path else {}
    require(isinstance(notes, dict) and (not notes or notes.get("sourceCommit") == run["headSha"]), "Build notes belong to another source commit")
    for key in ("implemented", "notYetPorted", "deferredChecks"):
        require(key not in notes or isinstance(notes[key], list) and len(notes[key]) <= 32 and
                all(isinstance(item, str) and 0 < len(item) <= 500 for item in notes[key]), "Invalid build-note list")
    folder = output / f'v{report["version"]}-b{report["build"]}-{run["headSha"][:8]}'
    name = f'RITVIO-iOS-{report["version"]}-device-test.ipa'
    if check_only:
        return {"checked": True, "candidateCreated": False, "version": report["version"],
                "nativeBinaries": len(source_bundle["nativeBinaries"]), "frameworks": len(source_bundle["frameworks"])}
    folder.mkdir(parents=True, exist_ok=True)
    target, root = folder / name, source_bundle["root"]
    expected = {}
    created = False
    with zipfile.ZipFile(source_path) as original:
        for filename, member in source_bundle["members"].items():
            expected["Payload/" + filename] = (digest(original.read(member)), member.external_attr)
        if not target.exists():
            try:
                with target.open("xb") as stream:
                    created = True
                    write_ipa(stream, original, source_bundle)
            except Exception:
                if created:
                    target.unlink(missing_ok=True)
                raise
    try:
        with zipfile.ZipFile(target) as candidate:
            completed = inspect_bundle(candidate, ipa=True)
            actual = {filename: (digest(candidate.read(member)), member.external_attr)
                      for filename, member in completed["members"].items()}
            require(actual == expected and candidate.testzip() is None, "IPA does not preserve the original bundle bytes/permissions")
    except Exception:
        if created:
            target.unlink(missing_ok=True)
        raise
    sha = file_digest(target)
    manifest = {"schema": 1, "stage": "IOS-6", "purpose": "physical-device-test",
        "publicReleaseReady": False, "personalSigningRequired": True,
        "app": {"bundleId": "it.ritvio.ios", "version": report["version"], "build": report["build"],
                "minimumOS": report["minimumOS"], "sourcePhase": report.get("phase")},
        "ipa": {"file": name, "bytes": target.stat().st_size, "sha256": sha},
        "source": {"commit": run["headSha"], "runId": run["databaseId"], "runUrl": run["url"],
                   "runConclusion": run["conclusion"], "archive": source},
        "checks": {"container": "passed", "bundleByteAndPermissionPreservation": "passed",
                   "deviceArchitecturesAndMinimumOS": "passed", "nativeBuild": report.get("nativeBuild", "not-run"),
                   "playback": report.get("playback", "not-run"), "resolver": report.get("resolver", "not-run"),
                   "liveProvider": report.get("liveProvider", "not-run"), "uiFailures": report.get("uiFailures", []),
                   "liveFailures": report.get("liveFailures", []),
                   "physicalTests": report.get("physicalTests", "pending"), "simulators": report.get("simulators", [])},
        "scope": {key: notes.get(key, []) for key in ("implemented", "notYetPorted", "deferredChecks")}}
    inventory = {"schema": 1, "sourceCommit": run["headSha"], "embeddedRuntime": completed["runtime"],
                 "frameworks": completed["frameworks"], "nativeBinaries": completed["nativeBinaries"]}
    encode = lambda value: (json.dumps(value, indent=2, sort_keys=True) + "\n").encode()
    write_new(folder / (name + ".sha256"), f"{sha}  {name}\n".encode())
    write_new(folder / "candidate.json", encode(manifest))
    write_new(folder / "native-report.json", encode(report))
    write_new(folder / "run-record.json", encode(run))
    write_new(folder / "DEPENDENCIES.json", encode(inventory))
    for filename in ("LICENSE", "THIRD_PARTY_NOTICES.md"):
        write_new(folder / filename, (project / filename).read_bytes())
    write_new(folder / "INSTALL.md", install_guide(manifest).encode())
    return {"candidateCreated": True, "ipa": str(target), "manifest": str(folder / "candidate.json"),
            "sha256": sha, "bytes": target.stat().st_size, "personalSigningRequired": True,
            "publicReleaseReady": False}


def write_ipa(stream, original, source_bundle):
    with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as candidate:
        root = source_bundle["root"]
        stamp = source_bundle["members"].get(root + "/", source_bundle["members"][root + "/Info.plist"]).date_time
        parent = zipfile.ZipInfo("Payload/", stamp)
        parent.create_system = 3
        parent.external_attr = (stat.S_IFDIR | 0o755) << 16 | 0x10
        candidate.writestr(parent, b"")
        for filename, member in source_bundle["members"].items():
            entry = copy.copy(member)
            entry.filename = "Payload/" + filename
            entry.extra = b""
            entry.comment = b""
            candidate.writestr(entry, original.read(member))


def install_guide(manifest):
    app, checks = manifest["app"], manifest["checks"]
    lines = [f'# RITVIO iOS {app["version"]} — device-test candidate', "",
        "This IPA needs personal signing before installation. It is not a public-release approval.",
        f'Build target: iOS {app["minimumOS"]} or newer; device compatibility is still under test.', "",
        "1. Download [Sideloadly](https://sideloadly.io/index.html) for Windows or macOS. On Windows, follow its official Apple-component prerequisites.",
        "2. Connect your iPhone by USB and complete the trust prompts yourself.",
        "3. Select this IPA in Sideloadly. Enter Apple-account credentials only in that utility, never in RITVIO or a support message.",
        "4. Sign/install with your account, then complete the developer-trust steps on the phone. On iOS 16+, Developer Mode may be required.",
        "5. Optionally enable automatic renewal. A free account's signature lasts seven days; renewal requires the computer and a USB or configured Wi-Fi connection.",
        "", "See the [official FAQ](https://sideloadly.io/faq.html) for current setup, renewal and update instructions. Updating with the same account and bundle identity avoids intentionally creating a separate app; do not delete the installed app just to update it.",
        "", "## Evidence still open", "",
        f'- Source CI: {manifest["source"]["runConclusion"]}. See candidate.json for individual outcomes.',
        f'- Provider: {checks["liveProvider"]}; physical-device tests: {checks["physicalTests"]}.',
        "- Personal signing, installation, renewal, locked-screen playback, routes/calls and Photos remain to be tested."]
    for key, title in (("notYetPorted", "Not yet ported"), ("deferredChecks", "Deferred acceptance")):
        if manifest["scope"][key]:
            lines += ["", "## " + title, ""] + ["- " + value for value in manifest["scope"][key]]
    lines += ["", "Sources and notices", "",
              manifest["source"]["runUrl"].split("/actions/runs/")[0] + "/tree/" + manifest["source"]["commit"],
              "LICENSE, THIRD_PARTY_NOTICES.md and DEPENDENCIES.json accompany this candidate.", ""]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifacts", type=Path, default=ROOT / ".local/ios/artifacts")
    parser.add_argument("--run-metadata", type=Path)
    parser.add_argument("--output", type=Path, default=ROOT / ".local/ios/candidates")
    parser.add_argument("--notes", type=Path)
    parser.add_argument("--check-only", action="store_true")
    args = parser.parse_args()
    result = package(args.artifacts, args.run_metadata or args.artifacts / "run-metadata.json",
                     args.output, args.notes, check_only=args.check_only)
    print(json.dumps(result))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, TypeError, OSError, KeyError, struct.error, zipfile.BadZipFile, plistlib.InvalidFileException) as error:
        print("iOS candidate was not accepted: " + str(error), file=sys.stderr)
        sys.exit(1)
