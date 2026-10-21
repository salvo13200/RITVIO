# RITVIO presentation assets

The additional A1–A6 source views and silent UI recording are inventoried separately in `adoption.json`; see the [new-source walkthrough](../ADOPTION.md). They use the same English/synthetic-data/browser evidence rules and are not a new published package. `scripts/prepare-adoption.py` preserves screenshot pixels, strips image metadata and retains the original gallery/banner.

- `logo.svg` is an unchanged copy of the code-authored RITVIO waveform icon from `build-resources/icon.svg`.
- `banner.webp` is synthetic brand artwork generated for this repository presentation using the existing icon as the only reference. It contains no generated app screenshot, external photograph or stock image. The wordmark and tagline are in English.
- The `desktop-*.webp` / `mobile-*.webp` images capture the real React interfaces, in English, with controlled demo data. They were not generated as UI mockups or retouched to invent features. Mobile captures are browser renders, not native phone captures. `share-card-track.webp` and `share-card-lyrics.webp` are complete 9:16 images exported by the actual sharing canvas, without and with lyrics respectively.
- Demo tracks, artists, playlists and collection contents are illustrative. Cover images reuse the project's documented synthetic artwork. The short lyrics are original demonstration text, not external song lyrics.

The images are included under the repository's licence to the extent contributors can grant rights. They do not grant rights over real catalogue music or provider artwork. See [third-party notices](../../THIRD_PARTY_NOTICES.md).

## Refresh the gallery

With normal development dependencies and Microsoft Edge installed:

```powershell
pnpm exec tsx scripts/capture-showcase.ts
python -m pip install Pillow
python scripts/prepare-showcase.py
pnpm release:check
pnpm check:docs
```

Run on an otherwise idle machine. The tool starts the desktop and mobile fixture renderers sequentially, keeps demo sessions isolated, and closes its own browser/server. It does not start Electron, Gradle, an emulator, the Android SDK or a live resolver. Normal builds do not require Pillow.

Raw PNGs and capture logs stay in ignored `test-results/showcase/`. The preparation script writes lossless WebP files, checks pixel equivalence and omits EXIF, XMP and embedded prompts. `manifest.json` records file sizes and checksums. Keep all screenshots in English, wait for covers/collections to load and inspect the results before committing. Never publish a personal profile, listening history, local path or secret inside a capture.
