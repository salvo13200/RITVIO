# Public preview — published 17 October 2026

## Android 1.1.0 candidate (version code 16)

This development candidate is separate from the published `public-preview-1` APK (1.0.4).

- Choose and restore personal artwork for playlists and individual tracks. Images are copied into private app storage, decoded at a bounded size and stripped of original metadata. No broad photo-library permission is requested.
- Larger provider artwork with fallback to the original thumbnail; sharing uses the selected track cover.
- Loading appears in Play only. The artist remains visible in the mini-player, and playback errors still offer Retry.
- Browse real catalogue genres and moods/activities, open their playlists, and play available tracks. Results use the existing bounded native cache.
- Personal track images are local to Android. Playlist export embeds a smaller portable image; it never includes private file paths or audio.

Phone checks still required: photo picker (including cancellation), persistence after restart, media controls, image sharing and audio continuity while editing artwork. Browser fixtures and JVM tests do not certify these native behaviours. Install a candidate signed with the existing official key over the current app to preserve data.


Windows **0.7.2** (portable EXE and per-user installer), Android **1.0.4 / versionCode 15** (API24+, ARM64/x86_64). [Release and downloads](https://github.com/salvo13200/RITVIO/releases/tag/public-preview-1). This increment packages GPLv3 and upstream notices and public source/build workflows. It preserves the current interface and playback implementation. Previous localisation candidates were Windows 0.7.1 / Android 1.0.3.

## Included

- English and Italian, persistent language preference, international discovery without an Italy-first default.
- Provider attribution in Settings; neutral primary collection labels.
- Local library, search, queue, playback, lyrics and share-image features from the existing candidates.
- GPL-3.0-only for original code, reproduced third-party notices, public source filtering and checksums.
- GitHub issue/PR templates, CI/build workflow, owner-only merge ruleset templates and optional GitHub funding configuration.

## Known limits and verification boundaries

- The newest APK still requires installed-device checks for rendering, back/scroll behaviour, locked-screen playback, audio focus and Gallery export. Browser and JVM tests cannot close these gates.
- Lyrics availability and catalogue/stream resolution depend on external services. Unofficial resolvers may stop working or return rate limits. Retry with backoff rather than rapid repeated skips.
- Windows executables are not Authenticode-signed. There is no automatic update service. Local library data is not synchronised online.
- The [repository](https://github.com/salvo13200/RITVIO), CI, owner-controlled merge rules and release downloads are live. Voluntary support is configured on GitHub through [PayPal](https://www.paypal.me/sals126) and [Buy Me a Coffee](https://buymeacoffee.com/Sals126); no donation feature is included in either app.
- Native Gradle transitive dependencies are not fully locked; byte-for-byte reproducibility is not promised.

Publish this as a **prerelease** while native checks remain open. Do not present version numbering as evidence of production certification. Record actual test results for these exact artefacts in the release description; older candidate tests are not a substitute.

## Source maintenance after the first release

The repository now separates browser configurations (`tests/config/`), committed image fixtures (`tests/fixtures/artwork/`) and ignored evidence (`test-results/`). Decorative images use metadata-free lossless WebP. Obsolete development briefs, an unimplemented PostgreSQL proposal and template tests were removed. Architecture and image checks run in CI. These source changes do not replace binaries already published under `public-preview-1`; they will be included in the next build. Legacy profile/file imports remain solely for data compatibility; new exports use RITVIO.
