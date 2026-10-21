# Quality status and next priorities

Current stable delivery: **Windows 1.0.0 / Android 1.4.0 (code 22)**, 21 October 2026. See [release notes](RELEASE_NOTES.md), [downloads](https://salvo13200.github.io/RITVIO/) and each release manifest for exact source and binary hashes. Previous preview records remain historical evidence.

## Stable delivery verification

- **252 core tests, 73 Android JVM tests and 14 focused update/Help/playback browser cases** passed locally. Required PR #18 CI passed before merge. Browser/JVM/physical checks are distinct.
- The exact Windows packages passed isolated 0.7.5 → 1.0.0 update, reinstall/uninstall, preserved database/personal-profile fingerprints, clean-PATH startup, ZIP/runtime integrity, native Help/copy/restart and real-provider playback/seek.
- A **303.99-second live-provider Windows run with a hidden window** passed 60 samples without paused/error state. Peak buffered audio was 8,697,832 bytes within 16 MiB. This is not OS suspend or speaker-output certification; small event-timing samples are not universal latency guarantees.
- The Android APK retains the official certificate and application ID, increases code 21 → 22, and passes signature and all 20 native-library 16 KB ELF/ZIP checks. Instrumentation compilation is not instrumented-device execution.
- The maintainer reported that the exact Android 1.4.0 candidate worked on Motorola edge 60 neo / Android 16 for update/retained library, locked-screen skip/seek, Gallery saving and Help/version context. This is human acceptance, not ADB, TalkBack or a new Bluetooth/call-interruption test. APK SHA-256: `29a828bab0ad62628f60aefbcac4cad3f928bb945d4faafae7d06837216930fd`.
- Locked installation and clean exported-source desktop/API, mobile-web and site builds passed; independently rebuilt web/API assets matched package inputs. The merged source matches executable build inputs, with line-ending normalization and only a Pages workflow plus declaration indentation outside runtime. The release manifests retain the accepted build-source archive hash; native-APK bit reproducibility is not claimed.
- Pages/reference fallback, matching issue forms, stable release metadata and anonymous full package downloads/hashes were verified during publication. The published snapshot drives README download tables and the static page. Older apps lacking the update feature cannot automatically discover this delivery; use the download page.

The live page check exposed a mobile-only hidden invalid-link notice. Its existing visible-note style now keeps the recovery message readable without changing app binaries; the reference-page regression covers both desktop and phone widths. Ten targeted site/reference scenarios passed after correction. Presentation media were refreshed in English with the current versions and retain their synthetic-data/browser disclosures.

| Platform | Stable release | Source |
| --- | --- | --- |
| Windows | [1.0.0](https://github.com/salvo13200/RITVIO/releases/tag/windows-v1.0.0) | `4425477cebaa37b5e0a2ca1d16d09963559865d8` |
| Android | [1.4.0](https://github.com/salvo13200/RITVIO/releases/tag/android-v1.4.0), code 22 | Same corresponding source; official signing identity retained. |

Windows packages remain unsigned. Catalogue/lyrics and provider limits are external dependencies. Native accessibility, broader devices, Bluetooth reconnect and genuine OS suspend remain limited coverage. These are disclosed limits; no known reproducible severe defect is being carried into this delivery. There is no telemetry or automatic upload of listening/report data.

## Historical checks and implementation record

The following sections retain the dates/scopes of previous previews and source stages. Statements about unpublished work or pending final acceptance describe those earlier stages; the stable-delivery evidence above supersedes their publication status. They are not additional counts for the same tests.

## Completed checks and their scope

These entries close the stated scenario for the recorded baseline, without certifying unrelated devices, codecs or later candidates.

| Check | Recorded outcome | Evidence and limits |
| --- | --- | --- |
| Windows release build and installation lifecycle | Passed | 217 core tests, 25 desktop browser/player cases and isolated install/reinstall/update/uninstall; [release build](https://github.com/salvo13200/RITVIO/actions/runs/39403307392). Personal installations were excluded. |
| Windows public package identity | Passed | Installer, self-extracting EXE and whole ZIP checked against release hashes; ZIP CRC/runtime/notices and extracted executable checked. See [release notes](RELEASE_NOTES.md). |
| Windows real-provider playback | Passed, short native probe | Search/play, next, pause/resume, seek and closure on the shipped runtime. Not a continuous hour of real-provider listening or a speaker-output timing test. |
| Windows sharing during playback | Passed, focused native cases | Track/four-line/ten-line PNG export, actual cover delivery, closing selection without export and subsequent track playback. |
| Windows controlled one-hour endurance | Passed, synthetic audio | 3616.9 seconds, 130 navigation cycles, media-error recovery and paused restart; 500 queue entries retained. [Resource sampling](TESTING.md#native-resource-sampling) records the memory interpretation limits. |
| Windows observer/transport comparison | Passed, three controlled sessions | Ten minutes per arm; HTTP alone did not remove the measured increase, while disconnecting the observer reduced it. [Methods and results](TESTING.md#media-transport-and-observer-controls). Not an equivalent repeat of hour-long UI navigation. |
| Windows repeated sources with PCM and Opus | Passed, short finite-source controls | 30 measured changes and 10 playing seeks per format; 500-entry queues retained. Renderer private memory after endpoint GC was 84.0 to 74.2 MiB / 80.3 to 68.8 MiB. No progressive source-count-related increase was reproduced in this workload. [Scope and results](TESTING.md#repeated-track-changes-with-pcm-and-opus). |
| Controlled network failure and stale callbacks | Passed, automated cases | Browser/JVM coverage includes bounded retries, exhaustion, pause/new-track cancellation, pending seeks and stale bridge events. See [playback reliability](TESTING.md#playback-reliability-windows-074--android-121). These are not physical network handoff checks. |
| Android release build and APK identity | Passed | 36 browser cases and 65 JVM tests in the [Android build](https://github.com/salvo13200/RITVIO/actions/runs/39237146190); official update certificate, version and 16 KB native-library/ZIP alignment checked in the release record. |
| Android everyday native playback | Maintainer-reported smoke pass | One Android 16 phone: locked-screen playback, Wi-Fi/data handoff, skips/seeks and headphones/calls reported working. This is user testimony, not an instrumented or multi-device result. |
| Sharing, queue and lyric-reader interactions | Passed within recorded automated scope | Browser/desktop sharing and synthetic touch reorder/edge-scroll/cancellation cases are recorded in [Testing](TESTING.md). Native accessibility and every finger/device interaction remain separate. |
| Latest full local maintenance checks | Passed before consolidation | 229 core tests, TypeScript, public-source policy and documentation checks through `bfefbbd`. These do not replace the release build's original counts. |
| This documentation consolidation | Passed, targeted checks | Three export-policy tests, issue-form YAML validation, architecture/source checks, and 15 documents / 262 local links. Documentation, architecture and source-policy checks also passed on a 778-file allowlisted clean copy without private phase notes or installed dependencies. No native playback tests or package rebuilds were needed. |

## Android 1.3.1 readability fixes

The focused 20 October pass reproduced three interface defects: lyric selection could collapse to a partially visible or unreachable row with enlarged text/short windows; the current-track activity marker used an accessible name on a generic span; and the scrollable story preview was not keyboard-focusable. The Android web changes provide a scrollable selection surface with separate preview actions when space is constrained, preserve its reading position on Back, give the activity marker an image role, and label/focus the preview region. The non-scrolling player layout is retained.

Five browser scenarios cover Search → Player → Queue → lyric selection → Preview at 360×740 with 100%, 150% and 200% root text, 360×640 at 200%, and 740×360 at 150%. All **25 automated accessibility scans** passed; player controls remained within the viewport at least 48 CSS pixels wide/high, contiguous selection and preview Back worked, and queue arrow actions completed. The affected existing touch/lyrics/sharing suite passed **16 cases**. Three focused desktop keyboard, modal and reduced-motion checks passed after fixing a missing initial render wait and using the visible queue opener in compact layouts. No desktop production code changed. TypeScript and the Android web production build passed.

This is **browser fixture evidence**, using root text resizing as a stress test, not a direct emulation of Android WebView `setTextZoom` or native screen-reader certification. The separate full Gradle 1.3.1 APK passed 65 JVM tests, signature/version, official zipalign, all 20 ELF/ZIP library checks and a download checksum comparison. Specific TalkBack, actual system-font and keyboard/inset outcomes remain unrecorded. GitHub checks are linked from [PR #17](https://github.com/salvo13200/RITVIO/pull/17). See [the targeted command](TESTING.md#focused-readability-and-accessibility).

## Remaining verification, not confirmed bugs

| Remaining scope | Why it stays open | When to run it |
| --- | --- | --- |
| Long real-provider listening and genuine OS suspend/resume on Windows | The completed hour used generated PCM and a hidden window; short live playback cannot establish this longer scenario. | Final native acceptance, or after changes to playback/recovery ownership. |
| Prolonged Android background use, Bluetooth reconnect and broader device coverage | A smoke pass on one phone does not certify every OEM, accessory or long session. | A changed native player/recovery build or a reproducible device-specific report. |
| Native accessibility: screen reader, large fonts and system insets | Browser checks do not certify TalkBack, Windows screen readers or every installed-app layout. | A focused usability pass, recording exact version/platform and actual findings. |
| Original hour-long navigation memory increase | Observer contribution was demonstrated in a shorter playback-only comparison. Finite-source tests did not reproduce progressive change-related growth; all UI/native-cache contributions have not been isolated. | If extended normal use reproduces sustained growth, capture that workload and compare equivalent conditions. |

These are coverage gaps, not evidence that the current app is broken. Preserve historical preview labels and do not turn an unverified scenario into a claimed pass or a confirmed defect.

## Work order

### Update discovery: unpublished source increment, 21 October 2026

The current working source adds per-platform update discovery in Settings, opt-in startup checks, an optional preview channel and validated links to official release notes/install packages. It does not download/install packages automatically or change playback ownership. Published Windows 0.7.5 and Android 1.3.1 binaries remain unchanged.

Verification for this increment: the full local core suite passed 238 tests before the final targeted cache/read-recovery case was added; the final focused update suite passes 10 cases. Android release Kotlin compilation and 66 JVM tests passed. Both production web builds, TypeScript, locale generation/coverage, documentation, source-policy and architecture checks passed. Four browser scenarios passed, including accessibility scans, state persistence, preview filtering, offline recovery, notification dismissal, light theme and enlarged text. A focused desktop rerun also verified the actual rendered Ancizar font via Chromium's platform-font data. The bounded visual review returned `ship` for this Settings extension; it does not certify native-device interactions or complete the overall stable-release roadmap. A read-only check of the real public release feed accepted the current platform assets and correctly found no newer version than the published baselines.

The new browser suite is included in the CI workflow for the eventual PR; no remote CI success is claimed for these unpublished changes. Installed-app browser switching and candidate update acceptance belong to the forthcoming package verification, rather than being inferred from browser fixtures or JVM tests. See [the update test scope](TESTING.md#update-discovery-in-the-current-source).

### Download page: unpublished source increment, 21 October 2026

A static English download page is prepared locally in `apps/site`, with Android and Windows choices first, official version/channel/size metadata, Windows format explanations, actual English browser captures and both track/lyric sharing outputs. Existing public packages remain previews; neither the page nor a new app package has been published. The shared release snapshot also checks the three README download tables. Platform recommendation is local, assets/fonts are bundled and the optional GitHub refresh runs only when requested.

Three catalog cases and six browser scenarios passed: desktop/mobile choices, keyboard gallery, accessibility scans, 320 px wrapping, 150% text, reduced motion, JavaScript-disabled `/RITVIO/` navigation and failed/successful release refresh. TypeScript, static build, README consistency, documentation and source-export policy checks passed. Release refresh tests use controlled fixtures, while the snapshot comes from a read-only check of official public metadata. The independent bounded visual review accepted the local surface with no material fixes; both detector inset warnings were judged false positives against the captures and CSS. This is static-site evidence, not deployment, new native-app acceptance or a remote CI result. See [local preview instructions](BUILDING.md#local-download-page) and [test scope](TESTING.md#static-download-page).

### First listening and transfer: unpublished source increment, 21 October 2026

The current desktop/Android source adds contextual search and import actions to loaded empty profiles, explicit supported-link/file help, an ordered and inspectable transfer preview, and a save-result step on Android and desktop link imports. Existing profiles keep their listening/library data; there is no compulsory tour, new account, migration or extra network request for onboarding. Windows file preview now reveals additional rows in bounded batches. Its established create-and-open save behavior is retained.

Eight focused browser scenarios passed, with accessibility scans and a 150% text/reduced-motion short-screen case. Six existing Android transfer regressions also passed, including intentional duplicates and cancellation. The nine actual desktop API/store import tests passed, covering source ordering, private ownership, atomic writes, revision/capacity conflicts, cancellation and same-job retries. Browser fixtures verify unchanged queue/playback during transfer and retained saved data after navigation/reload; these do not certify a native document picker or fresh installed package. This A3 increment changes no Kotlin, playback engine, database schema, signing identity or platform version. Exact package acceptance remains part of the final combined candidate. See [first-use and transfer tests](TESTING.md#first-listening-and-playlist-transfer-in-the-current-source).

The visual review identified three scoped issues: desktop task-header visibility after import, file duplicate-control grouping and desktop app-motion preferences. All three were scored resolved after corrections and targeted desktop reruns; the final `ship` verdict covers those scored browser/source fixes. The file-preview keyboard-access check also passed. Final TypeScript, both production web builds, locale integration/coverage, documentation, architecture and source-export checks passed. Native acceptance and remote CI remain separate; no packages were rebuilt or published for A3.

### Continuity: unpublished source increment, 21 October 2026

Two failures were reproduced before changing production code. On Windows, overlapping origin deliveries discarded untouched parts of a buffered fragment. The corrected range buffer preserves those bytes; a controlled two-delivery/backward-seek replay now needs two origin reads instead of three, with the same 16 MiB total, 8 MiB per stream, eight-entry and 512-fragment limits. This is a specific avoided request, not a claimed universal speedup. On Android, an interrupted shared loader could propagate cancellation to an active listener that had joined it. That listener can now join/start one foreground replacement without inheriting another thread's interrupt; normal provider failures do not get this replacement and concurrency/retry limits stay unchanged.

The focused API/transport suite passed **21 cases**, and the complete Android JVM suite passed **69 tests**. The existing desktop playback suite passed **25 browser cases**, including fifty skips, expired descriptors, pause/seek, stale callbacks, bounded offline recovery and rate limits. Two additional browser cases record separately labelled timing stages and a genuine out-of-buffer seek against original generated audio. The timing records use one observation per phase in a local fixture/development browser; they are not real-provider, native-startup, phone, speaker-output or statistical performance measurements. See [continuity methods and commands](TESTING.md#continuity-and-timing-in-the-current-source).

Native Android source compilation and JVM checks passed; no phone was connected for this increment. The installed Windows/Android acceptance gaps above remain assigned to the final combined candidate. No UI redesign, buffer expansion, additional speculative lane, app telemetry, offline file cache, schema migration, platform-version bump or public release was introduced.

### Existing quality priorities

1. **Reproducible public bugs first.** Record platform, exact version/package, steps, expected/actual behavior and safe diagnostics. A confirmed crash, lost data, wrong-track playback or unwanted resume takes priority. The review-date GitHub snapshot contained no open issues; that is not a promise that no defects exist.
2. **Focused readability and accessibility review.** Use existing automated coverage as a baseline, then inspect specific keyboard/focus, touch-target, large-text and screen-reader paths. Turn actual failures into small fixes with their own regression check. A wholesale UI redesign is not implied.
3. **Targeted native acceptance before a stability claim.** Complete only the missing platform/scenario for the candidate being assessed, including longer real-provider and suspend/background cases above. Preserve earlier evidence for unchanged paths.

Dedicated backup tooling, online accounts, cross-device sync and social collaboration remain deferred, outside this quality pass. No paid service or toolchain reinstall is part of this plan.

## When to repeat a check

| Change or new evidence | Required follow-up |
| --- | --- |
| Documentation, issue forms or test helpers only | Documentation/source-policy checks and relevant helper tests; no installer, APK rebuild or generic native soak solely for these edits. |
| Shared playback, recovery, buffering or native ownership | Relevant regression suite plus the affected native scenario on an exact candidate. |
| Sharing, queue, lyrics, navigation or a common layout component | Focused flow/interaction tests and a visual/device check for the affected platform; retain unrelated playback results. |
| Packaging, signing, dependency/runtime or release-asset changes | Build/package/signature/source/hash checks and isolated install/update for the exact new bytes. |
| Reproducible new report | Reproduce that report first, implement a bounded fix, verify it and add a regression check where useful. |

For each new result, record date, source/build identity, package hash where relevant, platform, workload, outcome and limits. Keep personal profiles, diagnostic identifiers and private reports out of public source. Local preparation does not create a PR, merge or publish a release automatically.
