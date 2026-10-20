# Quality status and next priorities

Baseline reviewed on **20 October 2026**. This is the current evidence record; the blank [release checklist](RELEASE_CHECKLIST.md) is a reusable template for a future candidate. Read [release notes](RELEASE_NOTES.md) for each published version and [Testing](TESTING.md) for detailed methods.

## Published packages and local source

| Platform | Published public preview | Corresponding source commit | Evidence boundary |
| --- | --- | --- | --- |
| Windows | [0.7.5](https://github.com/salvo13200/RITVIO/releases/tag/windows-v0.7.5) | `66d94bf7af3371dcc3a0c3fae6458821e7aa1f22` | Build 39403307392 and the exact downloaded packages; later local controls use its unchanged extracted runtime. |
| Android | [1.3.0](https://github.com/salvo13200/RITVIO/releases/tag/android-v1.3.0), version code 20 | `e1c8e3b2cf60e6d57b596d80373124f33bc71530` | Build 39237146190, the official signed APK and the recorded maintainer phone smoke test. |

The GitHub release records were checked on the review date: both previews include corresponding app/upstream source archives, a release manifest and checksums. Reference asset SHA-256 values:

| Asset | SHA-256 |
| --- | --- |
| Windows extract-once ZIP | `d01a9378653bd592711c7bd244caf559f3e8c37d3b746e2ffc912320c9e095a7` |
| Android APK | `0d2247e2586a67a7731849d5a63a111a727314beccd4ea930ad7b77ebf434c9d` |

Use each release's manifest and `SHA256SUMS` for the other assets. This review checked current release metadata; earlier release runs performed the package download/hash/install checks. Those checks were not repeated for this documentation change.

Local maintenance initially added test tools and documentation. The subsequent unpublished readability pass also changes the Android web interface, as recorded below. The latest full core suite, through test-tool commit `bfefbbd`, passed **229 core tests** before this consolidation. Those results are source-maintenance evidence, not a new APK/EXE or a fresh GitHub CI run. Windows and Android keep separate versions. Publication and merging remain maintainer decisions.

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

## Unpublished readability fixes

The focused 20 October pass reproduced three interface defects: lyric selection could collapse to a partially visible or unreachable row with enlarged text/short windows; the current-track activity marker used an accessible name on a generic span; and the scrollable story preview was not keyboard-focusable. The local Android web changes provide a scrollable selection surface with separate preview actions when space is constrained, preserve its reading position on Back, give the activity marker an image role, and label/focus the preview region. The non-scrolling player layout is retained.

Five browser scenarios cover Search → Player → Queue → lyric selection → Preview at 360×740 with 100%, 150% and 200% root text, 360×640 at 200%, and 740×360 at 150%. All **25 automated accessibility scans** passed; player controls remained within the viewport at least 48 CSS pixels wide/high, contiguous selection and preview Back worked, and queue arrow actions completed. The affected existing touch/lyrics/sharing suite passed **16 cases**. Three focused desktop keyboard, modal and reduced-motion checks passed after fixing a missing initial render wait and using the visible queue opener in compact layouts. No desktop production code changed. TypeScript and the Android web production build passed.

This is **browser fixture evidence**, using root text resizing as a stress test, not a direct emulation of Android WebView `setTextZoom`, native screen-reader certification, a newly signed APK or a GitHub CI run. TalkBack, actual system font scaling and keyboard/system insets still require the installed candidate. See [the targeted command](TESTING.md#focused-readability-and-accessibility).

## Remaining verification, not confirmed bugs

| Remaining scope | Why it stays open | When to run it |
| --- | --- | --- |
| Long real-provider listening and genuine OS suspend/resume on Windows | The completed hour used generated PCM and a hidden window; short live playback cannot establish this longer scenario. | Final native acceptance, or after changes to playback/recovery ownership. |
| Prolonged Android background use, Bluetooth reconnect and broader device coverage | A smoke pass on one phone does not certify every OEM, accessory or long session. | A changed native player/recovery build or a reproducible device-specific report. |
| Native accessibility: screen reader, large fonts and system insets | Browser checks do not certify TalkBack, Windows screen readers or every installed-app layout. | A focused usability pass, recording exact version/platform and actual findings. |
| Original hour-long navigation memory increase | Observer contribution was demonstrated in a shorter playback-only comparison. Finite-source tests did not reproduce progressive change-related growth; all UI/native-cache contributions have not been isolated. | If extended normal use reproduces sustained growth, capture that workload and compare equivalent conditions. |

These are coverage gaps, not evidence that the current app is broken. Keep previews labelled as previews; do not turn an unverified scenario into a claimed pass or a confirmed defect.

## Work order

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
