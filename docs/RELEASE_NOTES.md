# Release notes

## Android 1.2.0 — 18 October 2026 (public preview, version code 18)

[Android 1.2.0 APK, corresponding source and checksums](https://github.com/salvo13200/RITVIO/releases/tag/android-v1.2.0). This Android-only update preserves the signing certificate and local data when installed over the official app. Windows remains on 0.7.2; previous Android releases remain available for rollback.

- Native preloading prepares up to the next five seconds of the following track after playback settles, yielding to current loading.
- Up to 60 seconds of played audio can remain in RAM for faster backward seeks. Startup/rebuffer targets are 500/1000 ms; these are buffer settings, not measured click-to-sound times. No disk audio cache or offline download is added.
- Same-track stream requests share work, selected tracks have a separate bounded resolver lane, and expiring metadata is cached. Cancelled skips do not mark the previous song as failed; real rate limits still use backoff.
- Native events update visible playback controls directly. Settings can copy a local timing report without titles, identifiers or stream URLs; nothing is uploaded automatically.

Verification: the exact signed APK passed 200 core tests, 44 browser tests and 60 native JVM tests. Signature/upgrade certificate and all 20 native libraries passed the 16 KB ELF/ZIP checks. The maintainer tested it on the phone and reported a clear speed improvement; there is no instrumented-device benchmark or percentage claim. Unprepared tracks and seeks outside the available buffer still depend on the network. Comprehensive accessibility, Bluetooth, audio-focus and prolonged background coverage remains incomplete. Preloading may fetch a short fragment of a next track that is subsequently skipped.

## Android 1.1.1 — 18 October 2026 (public preview, version code 17)

[Android 1.1.1 downloads, corresponding source and checksums](https://github.com/salvo13200/RITVIO/releases/tag/android-v1.1.1). This Android-only update keeps the previous `public-preview-1` release available; Windows remains on 0.7.2.

- Choose and restore personal artwork for your own playlists only. Images are copied into private app storage, decoded at a bounded size and stripped of original metadata. No broad photo-library permission is requested.
- Larger provider artwork with fallback to the original thumbnail; track covers and share cards keep the catalogue artwork.
- Loading appears in Play only. The artist remains visible in the mini-player, and playback errors still offer Retry.
- Browse real catalogue genres and moods/activities, open their playlists, and play available tracks. Results use the existing bounded native cache.
- Track artwork editing is not available. Overrides from the 1.1.0 test candidate are retired without changing personal playlist covers. Playlist export embeds a smaller portable image; it never includes private file paths or audio.

Verification: clean-checkout CI passed 200 core tests, 41 browser tests and 44 native JVM tests, plus the Python catalogue suites. APK version/signature and all 20 native libraries passed the 16 KB ELF/ZIP checks. The maintainer reported a successful phone trial of this exact APK on a physical phone; this is a smoke-test report, not an instrumented audit of every feature. Wider device/accessibility, Bluetooth, audio-focus and prolonged background coverage remains open. Update the existing official app without uninstalling to preserve local data.


## Windows 0.7.2 / Android 1.0.4 — 17 October 2026

Windows **0.7.2** (portable EXE and per-user installer), Android **1.0.4 / versionCode 15** (API24+, ARM64/x86_64). [Release and downloads](https://github.com/salvo13200/RITVIO/releases/tag/public-preview-1). This increment packages GPLv3 and upstream notices and public source/build workflows. It preserves the current interface and playback implementation. Previous localisation candidates were Windows 0.7.1 / Android 1.0.3.

## Included

- English and Italian, persistent language preference, international discovery without an Italy-first default.
- Provider attribution in Settings; neutral primary collection labels.
- Local library, search, queue, playback, lyrics and share-image features from the existing candidates.
- GPL-3.0-only for original code, reproduced third-party notices, public source filtering and checksums.
- GitHub issue/PR templates, CI/build workflow, owner-only merge ruleset templates and optional GitHub funding configuration.

## Known limits and verification boundaries

- Physical-device coverage is limited to maintainer-reported smoke testing. Comprehensive accessibility, device/OS, Bluetooth, audio-focus and prolonged background tests remain open. Browser and JVM tests cannot close these gates.
- Lyrics availability and catalogue/stream resolution depend on external services. Unofficial resolvers may stop working or return rate limits. Retry with backoff rather than rapid repeated skips.
- Windows executables are not Authenticode-signed. There is no automatic update service. Local library data is not synchronised online.
- The [repository](https://github.com/salvo13200/RITVIO), CI, owner-controlled merge rules and release downloads are live. Voluntary support is configured on GitHub through [PayPal](https://www.paypal.me/sals126) and [Buy Me a Coffee](https://buymeacoffee.com/Sals126); no donation feature is included in either app.
- Native Gradle transitive dependencies are not fully locked; byte-for-byte reproducibility is not promised.

Publish this as a **prerelease** while native checks remain open. Do not present version numbering as evidence of production certification. Record actual test results for these exact artefacts in the release description; older candidate tests are not a substitute.

## Source maintenance after the first release

The repository now separates browser configurations (`tests/config/`), committed image fixtures (`tests/fixtures/artwork/`) and ignored evidence (`test-results/`). Decorative images use metadata-free lossless WebP. Obsolete development briefs, an unimplemented PostgreSQL proposal and template tests were removed. Architecture and image checks run in CI. These source changes are included in Android 1.1.1. Binaries already published under `public-preview-1`, including Windows 0.7.2, remain unchanged. Legacy profile/file imports remain solely for data compatibility; new exports use RITVIO.
