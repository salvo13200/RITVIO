"""Publish metadata-free, lossless WebP copies of the documentation captures.

Requires Pillow (python -m pip install Pillow). Capture the UI first:
pnpm exec tsx scripts/capture-showcase.ts
For a new generated banner, supply --banner /path/to/the-generated.png.
Existing banner bytes are retained when no replacement is supplied.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "docs/media"
VIEWS = json.loads((ROOT / "scripts/showcase-files.json").read_text(encoding="utf-8"))["views"]
NAMES = [view["name"] for view in VIEWS]
capture = json.loads((ROOT / "test-results/showcase/capture.json").read_text(encoding="utf-8"))
if capture.get("language") != "en" or set(capture.get("views", [])) != set(NAMES):
    raise RuntimeError("Run a complete English capture before preparing public images")
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--banner", type=Path)
args = parser.parse_args()
OUTPUT.mkdir(parents=True, exist_ok=True)

def convert(source, destination):
    with Image.open(source) as image:
        rgba = image.convert("RGBA")
        clean = Image.frombytes("RGBA", rgba.size, rgba.tobytes())
        clean.save(destination, "WEBP", lossless=True, exact=True, method=6)
        with Image.open(destination) as result:
            assert result.convert("RGBA").tobytes() == rgba.tobytes()
            assert not any(key in result.info for key in ("exif", "xmp", "icc_profile"))

if args.banner:
    convert(args.banner, OUTPUT / "banner.webp")
elif not (OUTPUT / "banner.webp").is_file():
    parser.error("The first run requires --banner with the generated image path")
for name in NAMES:
    convert(ROOT / f"test-results/showcase/{name}.png", OUTPUT / f"{name}.webp")
shutil.copyfile(ROOT / "build-resources/icon.svg", OUTPUT / "logo.svg")
records = []
for name in ["banner", *NAMES]:
    file = OUTPUT / f"{name}.webp"
    with Image.open(file) as image:
        kind = "generated-brand-banner" if name == "banner" else "demo-share-export" if name.startswith("share-card-") else "browser-interface-capture"
        records.append({"file": file.name, "kind": kind,
                        "width": image.width, "height": image.height, "bytes": file.stat().st_size,
                        "sha256": hashlib.sha256(file.read_bytes()).hexdigest()})
manifest = {"schema": 1, "language": "en", "encoding": "metadata-free lossless WebP; decoded capture pixels unchanged",
            "capture": "Actual React UI with isolated synthetic fixtures, Microsoft Edge. No private profile or live provider requests; not native-device execution.",
            "banner": "AI-generated for RITVIO with its existing waveform app icon as the only reference; no app UI is generated inside the banner.",
            "files": records}
(OUTPUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
gallery = """# Inside RITVIO

[Back to RITVIO](../README.md) · [Feature guide](FEATURES.md) · [Downloads](https://github.com/salvo13200/RITVIO/releases/tag/public-preview-1)

Actual React interfaces in English, with deterministic synthetic demo data and project-generated cover artwork. All tracks, artists, playlists, listening statistics and collection contents shown are illustrative. No personal profile, real listening history or external song lyric is included. The demo verses are original sample text.

Desktop/mobile interface captures use Microsoft Edge to render the real application components. They are not generated UI mockups, photographs or native-device test evidence. Background playback, system media controls and Gallery saving need separate phone checks; their behaviour cannot be proved by a screenshot. The two complete share cards below are actual exports of the app's canvas, not edited mockups.

## Sharing, with and without lyrics

<p align="center">
  <a href="media/share-card-track.webp"><img src="media/share-card-track.webp" width="280" alt="Actual 9:16 RITVIO track-card export without lyrics"></a>
  <a href="media/share-card-lyrics.webp"><img src="media/share-card-lyrics.webp" width="280" alt="Actual 9:16 RITVIO export with four consecutive original demo verses"></a>
</p>

### Choose the track or the words

The sharing flow has a track mode, a consecutive-lyrics selector and a preview before export. The two output images above retain the complete 9:16 canvas.

<p align="center">
  <a href="media/mobile-share-track.webp"><img src="media/mobile-share-track.webp" width="220" alt="English track sharing preview"></a>
  <a href="media/mobile-share-selection.webp"><img src="media/mobile-share-selection.webp" width="220" alt="English menu selecting consecutive lyrics lines"></a>
  <a href="media/mobile-share-lyrics.webp"><img src="media/mobile-share-lyrics.webp" width="220" alt="English preview of the lyrics share card"></a>
</p>

## Feature-to-screen index

Every listed UI feature has a corresponding full-resolution image. Playback transport, seeking, shuffle and repeat share the player view; Android system/background features are documented alongside it, without inventing a system screenshot.

| Feature | Interface | Full-size image |
| --- | --- | --- |
"""
for view in VIEWS:
    gallery += f'| {view["feature"]} | {view["group"]} | [View image](media/{view["name"]}.webp) |\n'
for group in ("Android", "Desktop"):
    gallery += f"\n## {group} interface\n\nOpen a feature to see its full English view. Click the image for the original size.\n\n"
    for view in VIEWS:
        if view["group"] != group:
            continue
        width = ' width="300"' if group == "Android" else ' width="1000"'
        gallery += f'<details>\n<summary><strong>{view["feature"]}</strong></summary>\n\n<p><a href="media/{view["name"]}.webp"><img src="media/{view["name"]}.webp"{width} alt="RITVIO in English: {view["feature"]}"></a></p>\n\n</details>\n\n'
gallery += """## Capture and maintenance

`pnpm exec tsx scripts/capture-showcase.ts` renders isolated fixtures without accessing your profile or live catalogue services. Raw PNGs stay in ignored `test-results/showcase/`. `scripts/prepare-showcase.py` creates metadata-free lossless WebP copies and this gallery from `scripts/showcase-files.json`. See [media origins and maintenance](media/README.md).

The gallery shows the current source interface. Source/documentation updates do not replace previously published APK/EXE files; download versions are listed in [release notes](RELEASE_NOTES.md).

See the separate [new-source walkthrough and silent demo](ADOPTION.md) for the additional adoption/help materials and their unpublished-source scope.
"""
(ROOT / "docs/SCREENSHOTS.md").write_text(gallery, encoding="utf-8", newline="\n")
print(json.dumps({"images": len(records), "bytes": sum(record["bytes"] for record in records), "pixelsUnchanged": True}))
