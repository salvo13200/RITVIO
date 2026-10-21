"""Prepare local A6 presentation captures without replacing the approved gallery.

Run the opt-in adoption-media.spec.ts capture first. Requires existing Pillow.
"""
from pathlib import Path
import hashlib
import json
import shutil
from PIL import Image

root = Path(__file__).resolve().parent.parent
source = root / "test-results/adoption"
output = root / "docs/media"
views = json.loads((root / "scripts/adoption-media.json").read_text(encoding="utf-8"))["views"]
capture = json.loads((source / "capture.json").read_text(encoding="utf-8"))
if capture.get("language") != "en" or set(capture.get("views", [])) != {view["name"] for view in views}:
    raise RuntimeError("Run a complete English adoption capture first")
records = []
for view in views:
    with Image.open(source / (view["name"] + ".png")) as image:
        rgba = image.convert("RGBA")
        clean = Image.frombytes("RGBA", rgba.size, rgba.tobytes())
        destination = output / (view["name"] + ".webp")
        clean.save(destination, "WEBP", lossless=True, exact=True, method=6)
        with Image.open(destination) as result:
            assert result.convert("RGBA").tobytes() == rgba.tobytes()
            assert not any(key in result.info for key in ("exif", "xmp", "icc_profile"))
        data = destination.read_bytes()
        records.append({"file": destination.name, "feature": view["feature"], "width": clean.width, "height": clean.height,
                        "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(), "kind": "browser-source-capture"})
video_source = source / "adoption-demo.webm"
video = video_source.read_bytes()
if video[:4] != bytes.fromhex("1a45dfa3") or len(video) > 5_000_000:
    raise RuntimeError("Expected a bounded WebM UI recording")
shutil.copyfile(video_source, output / video_source.name)
manifest = {"schema": 1, "language": "en", "status": "English interface captures; see release notes for published-package evidence.",
            "versions": {"windows": json.loads((root / "package.json").read_text(encoding="utf-8"))["version"],
                         "android": json.loads((root / "apps/mobile/package.json").read_text(encoding="utf-8"))["version"]},
            "origin": capture["origin"], "encoding": "Metadata-free lossless WebP; screenshot pixels unchanged.", "files": records,
            "video": {"file": video_source.name, "bytes": len(video), "sha256": hashlib.sha256(video).hexdigest(),
                      "kind": "silent-browser-ui-recording", "scope": "Search, fixture playback UI, lyrics, selection and card preview. Not native or audio evidence."}}
(output / "adoption.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"images": len(records), "imageBytes": sum(item["bytes"] for item in records), "videoBytes": len(video), "pixelsUnchanged": True}))
