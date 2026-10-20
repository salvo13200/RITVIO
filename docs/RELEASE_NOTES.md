# Release notes

## Windows 0.7.5 — 20 October 2026 (public preview)

[Windows 0.7.5 downloads, corresponding source and checksums](https://github.com/salvo13200/RITVIO/releases/tag/windows-v0.7.5). This Windows-only release adds an extract-once portable ZIP alongside the installer and self-extracting EXE. Android remains [1.3.0](https://github.com/salvo13200/RITVIO/releases/tag/android-v1.3.0); previous releases remain available.

- For everyday use, choose the installer or extract the **whole portable ZIP** into a folder and launch `RITVIO.exe`. Keep the adjacent files together. The standalone portable EXE still extracts on every launch and can start slowly.
- All three Windows formats retain the existing local profile in Windows AppData; the ZIP does not make library data travel on a USB drive. Update an official installation without uninstalling to retain local data.
- Shared lyric-image rendering fits the inner quote card to wrapped verses and credits inside the unchanged 1080×1920 image, with square cover artwork beside the credits. Android's separate full-height sharing workflow is not introduced on desktop.
- Add isolated startup/endurance probes and retain browser failure diagnostics in CI. The playback engine is unchanged from 0.7.4; this release does not promise faster network resolution.

The Windows build passed 217 core tests, 25 desktop browser/player tests and isolated installer install/reinstall/update/uninstall checks. [Build 39403307392](https://github.com/salvo13200/RITVIO/actions/runs/39403307392) produced the binaries from `f53af2f3860de40b75bd51ff644ac330205fa16f`; the merged source commit `66d94bf7af3371dcc3a0c3fae6458821e7aa1f22` has exactly the same Git tree. All three downloaded package checksums and the ZIP's CRC/runtime inventory passed. Its extracted executable passed three fresh-profile launches, real-provider playback/next/pause/resume/seek and track/four-line/ten-line PNG exports with the real cover proxy. Closing lyric selection without exporting preserved live playback and the following track. Startup personal-data fingerprints stayed unchanged. The release manifest records exact hashes, test scope and timing conditions.

Windows EXEs are not Authenticode-signed. Broad accessibility/device coverage, an hour-long native listening trial and real OS suspend/resume remain open. Network/provider delays, lyrics availability and rate limits remain possible. Startup probes use hidden native windows and fresh profiles with OS/security caches retained; they are not cold-boot, visible-paint or speaker-output benchmarks.

## Android 1.3.0 — 19 October 2026 (public preview)

[Android 1.3.0 APK, corresponding source and checksums](https://github.com/salvo13200/RITVIO/releases/tag/android-v1.3.0). Version code 20 keeps the official signing certificate. Install over the official app to retain local data; keep a backup. Windows public downloads remain [0.7.4](https://github.com/salvo13200/RITVIO/releases/tag/windows-v0.7.4); Windows 0.7.5 remains a separate candidate.

- Lyrics sharing separates full-height selection from preview. Back restores the contiguous excerpt, scroll position and endpoint focus; the limit remains 10 original lines, with full-song export excluded.
- The inner quote card fits actual wrapped lyrics and credits inside the unchanged 1080×1920 image. Cover artwork stays square beside the credits.
- The queue pins the current track, improves grip targets, adds labelled move/remove controls and scrolls continuously at held edges. Real-row bounds prevent an endless blank tail. Reordering preserves playback, duplicate occurrences and shuffle order.
- The reader adds persistent size/emphasis controls, stable current-line geometry, independent scrolling and explicit follow recovery. Its Share action opens verse selection directly.

Verification: 217 core tests, 16 focused listening-tool/lyrics cases, 20 artwork/player/latency cases, existing mobile regressions and 7 desktop-sharing cases passed. [Android build 39237146190](https://github.com/salvo13200/RITVIO/actions/runs/39237146190) passed its 36 browser cases and 65 JVM tests. Official signature, package/version and all 20 native libraries' 16 KB ELF/ZIP alignment were checked; hosted candidate bytes matched the signed APK. The maintainer authorised publication of the exact candidate. The release manifest records the build and tree-equivalent merged source.

Touch tests use synthetic Chromium events, including both directions, held edges, final-edge bounds, cancellation, ordinary scrolling, stale revisions and shuffle. They do not certify real finger gestures, TalkBack, system font scaling, every OEM's safe areas or prolonged background/audio-focus behaviour. Broad physical-device coverage remains open; no comprehensive device test is claimed. External services may be unavailable or rate-limited. Previous releases remain available.

## Windows 0.7.4 / Android 1.2.1 — 19 October 2026 (public previews)

[Windows 0.7.4 installer, portable, source and checksums](https://github.com/salvo13200/RITVIO/releases/tag/windows-v0.7.4) · [Android 1.2.1 APK, source and checksums](https://github.com/salvo13200/RITVIO/releases/tag/android-v1.2.1). Android version code is 19 and preserves the official signing certificate. Update the official installation without uninstalling to retain local data; keep a backup. Previous releases remain available. Prefer the Windows installer: the portable self-extracts on launch and can start slowly. Windows EXEs are not Authenticode-signed.

- Both platforms bound automatic transient-network recovery to two retries, invalidate obsolete callbacks and preserve rate-limit backoff. Pausing or choosing a new track cannot revive an old pending playback request.
- Windows applies the last seek to the selected resource during loading, preserves pause during scrubbing, rejects stale media events and restores the requested Web Audio graph on return. Shutdown cancels owned catalogue processes before waiting for discovery work.
- Android respects validated connectivity and audio suppression during recovery. Ordered native snapshots stop late bridge responses from replacing newer covers, tracks, positions or pause state. Sleep, clear and service destruction cancel pending recovery; explicit system-media Play can prepare an idle current item.
- Existing bounded RAM buffering/preloading is retained. No offline audio feature, disk audio cache or additional Android permissions are introduced.

Verification: 217 core tests, 25 desktop browser/player tests, 20 Android browser tests and 65 native JVM tests passed. Exact binaries match [Windows build 39177881872](https://github.com/salvo13200/RITVIO/actions/runs/39177881872) and [Android build 39177881929](https://github.com/salvo13200/RITVIO/actions/runs/39177881929). Isolated Windows installation/update/uninstall preserved test data; the downloaded portable passed real-provider playback, next, pause/resume, repeated paused seeks and successful closure. The signed APK's official update certificate, package/version and all 20 native libraries' 16 KB ELF/ZIP alignment were checked. Manifests identify the matching merged source and exact binary build commit; release uploads preserve the tested bytes.

Native limits remain open: this exact APK still needs physical Motorola Android 16 checks for locked-screen listening, Wi-Fi/mobile handoff, Bluetooth/headphones and calls. A 60-minute native soak, real OS suspend/resume and broad accessibility/device coverage have not been established. Browser/JVM tests do not prove those behaviours. Network/provider delays and rate limits remain possible; no universal speed or speaker-output timing guarantee is claimed. See the [native acceptance checklist](TESTING.md#native-acceptance-run-record-results-for-each-exact-candidate).

## Windows 0.7.3 — 18 October 2026 (public preview)

[Windows 0.7.3 installer, portable, corresponding source and checksums](https://github.com/salvo13200/RITVIO/releases/tag/windows-v0.7.3). This Windows-only update uses the exact maintainer-approved EXEs; Android remains [1.2.0](https://github.com/salvo13200/RITVIO/releases/tag/android-v1.2.0). Earlier releases remain available for rollback. Prefer the installer for everyday use and update the existing official app without uninstalling to preserve local data. EXEs are not Authenticode-signed.

- Prepare one next track after the current item has enough audio, yielding speculative work to current playback.
- Reuse encoded ranges in a bounded 16 MiB RAM proxy buffer; no disk audio cache or offline download. Seeks outside available audio still need the network.
- Avoid a redundant metadata lookup for known tracks, share duplicate resolution work and replace obsolete preparation on a fresh retry.
- Keep bounded local timing samples and buffer counters without song titles, identifiers or stream URLs; nothing is uploaded automatically.

Verification: the exact downloadable EXEs passed 211 core tests, 13 focused browser/player tests, production/source checks and isolated installer install/reinstall/update/uninstall on a disposable Windows runner with test data preserved. The downloaded portable passed the real-provider playback/next/pause/resume/seek harness with an isolated profile, and the maintainer approved release. In a small sequential comparison of three prepared changes per version, the median was 317.5 ms (0.7.2) versus 87.7 ms (0.7.3). These are HTML media-event timings, not independently measured speaker output or a universal speed guarantee. The uncached first track stayed around 2.8 seconds; paused seeks remained around 8–9 ms.

Known startup limit: the first fresh portable launch exceeded a 90-second test budget. A follow-up with a fresh profile reached the UI in 26.8 seconds; the full harness subsequently passed. The portable extracts on every launch; use the installer to avoid that extraction. An installer startup benchmark is not claimed. Broad native-device/accessibility coverage remains incomplete, and external services can fail or rate-limit requests. A preloaded fragment may never be played.

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
