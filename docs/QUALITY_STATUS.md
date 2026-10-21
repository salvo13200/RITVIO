# Quality status and next priorities

Baseline reviewed on **20 October 2026**, with Android 1.3.1 publication preparation on **21 October 2026**. This is the current evidence record; the blank [release checklist](RELEASE_CHECKLIST.md) is a reusable template for a future candidate. Read [release notes](RELEASE_NOTES.md) for each published version and [Testing](TESTING.md) for detailed methods.

## Published packages and local source

### Combined local candidates, 21 October 2026

The adoption work prepares Windows **1.0.0** and Android **1.4.0**, version code **22**, for one combined delivery. These version numbers do not mean that new releases have been published or accepted as stable. Public downloads in the table below remain unchanged. Real-phone acceptance, remote CI and deployment of the song-reference page and matching issue forms are separate publication gates.

The source suite passes **252 cases**, including a new listening-server shutdown regression. An unfinished renderer HTTP request previously kept `app.close()` waiting; the desktop loopback service now closes active connections during shutdown, after the existing cancellation hooks run. This affects exit only, not normal playback or request limits. The test first reproduced the wait with an actual local HTTP socket, then passed after the correction. Earlier native candidate outcomes must not be treated as evidence for replacement binary hashes.

Android's signed local APK retains the official certificate, application ID and supported architectures, increases version code from 21 to 22, and passes **73 JVM tests** and all **20 native-library 16 KB ELF/ZIP checks**. Instrumentation APK compilation is not an instrumented-device run. No phone was attached during these automated checks. Preserve the previous phone evidence for unchanged behavior and record the new candidate's actual acceptance separately.

On **21 October 2026**, the maintainer reported that the exact signed Android 1.4.0 candidate worked on an Android 16 phone after the requested update/retained-library, locked-screen track-change/seek, Gallery card saving and Help/version checks. This is human-reported device acceptance, not ADB, instrumentation, TalkBack or a new Bluetooth/call-interruption test. The APK SHA-256 is `29a828bab0ad62628f60aefbcac4cad3f928bb945d4faafae7d06837216930fd`.

The rebuilt Windows candidate passed isolated 0.7.5-to-1.0.0 installation/update, same-version reinstall and uninstall, with database preservation, clean registry cleanup and unchanged personal-profile fingerprints. The extracted ZIP passed CRC/runtime/notices checks; its desktop modules and bundles match build inputs. Native Help/report copying, URL guards, update preferences, song-reference copying and saved-library/player restart checks also passed on an isolated profile. A separate self-extracting EXE run verified live provider MP4 playback, preparation, pause/resume and seek. Its small event-timing sample is not a speaker-output measurement or a general speed promise.

A locked offline installation of the exported source in a separate temporary directory passed desktop/API, Android-web and static-page builds, architecture and documentation checks. All 845 source files matched the archive manifest/workspace; independently rebuilt desktop, API, site and mobile web outputs matched the candidate inputs, including all APK web assets. This verifies corresponding source and controlled web-build equivalence; it does not claim bit-reproducible native APKs or a completed GitHub CI run. Four update and ten Help/playback browser cases passed with the candidate versions.

The final extracted Windows candidate also passed **303.99 seconds of live-provider listening with its window hidden**. Sixty samples showed continuing playback without a paused/error state; buffered audio peaked at 8,697,832 bytes within the existing 16 MiB bound. This scoped run does not represent actual OS suspend or speaker-output measurement. Repository publication, required remote CI, Pages/reference-link deployment and public-download verification remain open.

A6 source preparation adds inspectable, voluntary help/report controls and separate English presentation material. Timings are included only after opting in and are filtered before display/copy; form URLs contain version/platform context only. Browser fixtures and native unit/compile checks have separate evidence boundaries. The new-source guide and silent browser walkthrough disclose their synthetic catalogue/native responses and do not replace installed-package acceptance. No release, push, deployment or announcement is implied.

The A5 sharing increment is local source work, outside the published packages below. Song references use the prepared static-page URL with bounded title/artist text in its fragment. Desktop copying and Android share arguments are covered by browser fixtures; the native builder and bridge compile are checked separately. No current APK/EXE is rebuilt or relabelled. Pages deployment, real recipient-app sharing and exact installed-package acceptance remain final-candidate checks. The PNG renderer and approved selection/preview composition are preserved.

| Platform | Published public preview | Corresponding source commit | Evidence boundary |
| --- | --- | --- | --- |
| Windows | [0.7.5](https://github.com/salvo13200/RITVIO/releases/tag/windows-v0.7.5) | `66d94bf7af3371dcc3a0c3fae6458821e7aa1f22` | Build 39403307392 and the exact downloaded packages; later local controls use its unchanged extracted runtime. |
| Android | [1.3.1](https://github.com/salvo13200/RITVIO/releases/tag/android-v1.3.1), version code 21 | See the release manifest for the exact build/archive commit. | Local full Gradle build, 65 JVM tests, official signature and 16 KB checks; exact APK approved for publication. Earlier phone smoke evidence remains separately scoped. |

The GitHub release records were checked on the review date: both previews include corresponding app/upstream source archives, a release manifest and checksums. Reference asset SHA-256 values:

| Asset | SHA-256 |
| --- | --- |
| Windows extract-once ZIP | `d01a9378653bd592711c7bd244caf559f3e8c37d3b746e2ffc912320c9e095a7` |
| Android APK | `9bf31e16cee37a9d9675bf5906bdbdce31ae9b4bcb96c0a7ba822bb49a8a406e` |

Use each release's manifest and `SHA256SUMS` for the other assets. This review checked current release metadata; earlier release runs performed the package download/hash/install checks. Those checks were not repeated for this documentation change.

Local maintenance initially added test tools and documentation. The Android 1.3.1 readability pass also changes the Android web interface, as recorded below. The latest full core suite, through test-tool commit `bfefbbd`, passed **229 core tests** before this consolidation. Those results are source-maintenance evidence, not a new APK/EXE or a fresh GitHub CI run. Windows and Android keep separate versions. Publication and merging remain maintainer decisions.

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

These are coverage gaps, not evidence that the current app is broken. Keep previews labelled as previews; do not turn an unverified scenario into a claimed pass or a confirmed defect.

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
