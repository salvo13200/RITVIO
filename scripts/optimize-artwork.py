"""Convert the seven project-owned decorative/fixture PNGs to metadata-free WebP.

One-time maintenance tool: python -m pip install Pillow, then run this script.
Conversion is lossless and verifies decoded RGBA pixels before removing a PNG.
Normal builds and checks do not require Pillow.
"""
from pathlib import Path
import hashlib
import json
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCES = [
    (f"apps/client/public/artwork/{name}.png", f"apps/client/public/artwork/{name}.webp")
    for name in ("electronic", "jazz", "pop", "rock")
] + [
    (f"docs/design/ui-1/preview/assets/{name}.png", f"tests/fixtures/artwork/{name}.webp")
    for name in ("city", "sky", "sunset")
]

records = []
for source_name, target_name in SOURCES:
    source, target = ROOT / source_name, ROOT / target_name
    if not source.exists():
        if target.exists():
            continue
        raise FileNotFoundError(source_name)
    with Image.open(source) as image:
        original = image.convert("RGBA")
        clean = Image.frombytes("RGBA", original.size, original.tobytes())
        target.parent.mkdir(parents=True, exist_ok=True)
        clean.save(target, "WEBP", lossless=True, exact=True, method=6)
        with Image.open(target) as result:
            assert result.convert("RGBA").tobytes() == original.tobytes(), target_name
            assert not any(key in result.info for key in ("exif", "xmp", "icc_profile"))
        records.append({"file": target_name, "width": original.width, "height": original.height,
                        "rgbaSha256": hashlib.sha256(original.tobytes()).hexdigest(),
                        "beforeBytes": source.stat().st_size, "bytes": target.stat().st_size})
    source.unlink()

if records:
    manifest = {"schema": 1, "encoding": "lossless WebP; decoded RGBA pixels unchanged",
                "origin": "AI-generated project mockups, followed by image-generation edits using crops of those mockups. No external photographic reference is recorded in the local asset manifests.",
                "files": records}
    (ROOT / "third-party/artwork.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"files": len(records), "beforeBytes": sum(r["beforeBytes"] for r in records),
                      "bytes": sum(r["bytes"] for r in records), "pixelsUnchanged": True}))
else:
    print("Artwork is already converted; no files changed.")
