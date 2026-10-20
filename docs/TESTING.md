# Testing from a clean checkout

For the consolidated Windows 0.7.5 / Android 1.3.0 baseline and rules that avoid repeating unchanged scenarios, start with [Quality status](QUALITY_STATUS.md). This guide retains the detailed methods and historical results.

Use Node 24+, pnpm 11.25.0 and Python 3.13 on Windows as described in [BUILDING.md](BUILDING.md). No private design folders, existing user profile, cloud account or generated mockup is required for the source/browser checks.

```powershell
pnpm install --frozen-lockfile
pnpm setup:resolver
pnpm release:check
pnpm check:architecture
pnpm check:assets
pnpm check:locales
pnpm i18n:check
pnpm exec tsx --test --test-concurrency=2 tests/*.test.ts
pnpm build
pnpm --dir apps/mobile build
pnpm exec playwright install msedge
pnpm exec playwright test --config tests/config/playwright.localization.config.ts
pnpm exec playwright test --config tests/config/playwright.home.config.ts
```

`playwright.config.ts` is the default desktop entry point. Additional targeted configurations live in `tests/config/`; numbered names identify historical regression slices, not separate product versions. For example:

```powershell
pnpm exec playwright test --list
pnpm exec playwright test --config tests/config/playwright.android10.config.ts --list
pnpm test:controls
```

Use `Get-ChildItem tests/config` to select other existing suites. Run one suite at a time: their fixture servers use fixed loopback ports. Screenshots, performance records and test-run output go under ignored `test-results/`; directories are created by the tests/tools. Committed synthetic image fixtures are in `tests/fixtures/artwork/`, and decorative genre images in `apps/client/public/artwork/`. Both are checked for embedded metadata.

`scripts/optimize-artwork.py` is a one-time lossless conversion utility requiring Pillow (`python -m pip install Pillow`). Normal builds/checks do not require it. Its pixel hashes and conversion sizes are recorded in `third-party/artwork.json`.

## Platform and live checks

Browser tests use controlled catalogue/audio fixtures. Passing them does not establish native audio focus, background playback, Gallery export or real-provider availability. Use a phone for those checks. Android unit/instrumentation builds require the separate SDK/JDK toolchain; instrumentation tests must actually run on a device before reporting a native pass.

`tests/packaged-desktop.mjs`, `desktop-live.mjs`, `installer-lifecycle.mjs`, `english-desktop.mjs` and `scripts/measure-playback.ts` are opt-in Windows/package/live probes. They require their stated built artefacts, installed runtimes or explicit environment configuration. They are not prerequisites for fixture-based CI. Installer tests refuse to replace an existing installation or terminate an open personal player. Performance tools generate new records in `test-results/`; historic private benchmark reports are not inputs shipped with the source.

Do not run Android Gradle and browser/Electron tests concurrently on a low-memory machine. Signing keys, profiles, personal listening data and screenshots never belong in a commit.

## Android 1.2.0 playback

Android 1.2.0 introduced the native playback changes below and was published after the maintainer's successful phone trial. That report establishes a perceived speed improvement, not an instrumented benchmark or comprehensive device coverage. Windows has a separate playback pipeline; its 0.7.3 public preview is documented below.

Media3 1.11.1 defaults to 1000 ms of startup buffer, 2000 ms after rebuffering, no retained back buffer and disabled playlist preloading. The candidate uses 500/1000 ms startup/rebuffer targets, 15–50 seconds forward buffering, 60 seconds of played audio retained in RAM, an 8 MiB allocator target and native preloading of the next five seconds after playback settles for at least 1.5 seconds. These are policy targets, not measured startup guarantees or a hard total-process memory cap. No disk audio cache or offline feature is added. Preloading is disabled while paused, sleeping, repeating one track or under the resolver cooldown; Media3 also yields to the current item's loading. This can fetch a short portion of a next track that is subsequently skipped.

References: [pinned load-control defaults](https://github.com/androidx/media/blob/1.11.1/libraries/exoplayer/src/main/java/androidx/media3/exoplayer/DefaultLoadControl.java), [native playlist preloading](https://developer.android.com/blog/posts/elevating-media-playback-introducing-preloading-with-media3-part-1).

The descriptor resolver coalesces requests for the same video through one interactive and one speculative lane (at most two active resolutions). An interactive request can promote an already queued preload. Existing expiry checks, bounded descriptor cache, media-host validation and rate-limit backoff remain active. Generations prevent an old preload from overwriting a retried descriptor. Pure JVM tests use latches to prove that an unrelated foreground lookup can complete while background work is held, that promotion works and that concurrent consumers do not duplicate resolution. Those tests establish scheduling behaviour, not real-provider or phone speed. Playback-state writes are coalesced and flushed on service shutdown. Native playback/readiness/seek events also update the visible interface immediately; the 500 ms position poll is retained, so the loading icon no longer relies solely on its next tick. Physical-device delivery latency still needs measurement.

On the phone, compare the released 1.1.1 and candidate with the same network and recordings: cold first track, next after 10 seconds, several rapid skips, forward seek inside/outside buffered audio, backwards within played audio, paused seek/resume, shuffle, repeat, timer and lock-screen controls. Watch for new buffering/errors, memory pressure and battery/data use. Do not record a percentage improvement until actual comparable device timings exist.

In candidate Settings, **Copy playback diagnostics** copies only aggregate resolver counters, buffer policy and up to 20 recent interaction timing records; it does not export song IDs/titles, stream URLs, headers or persistent history. `readyMs` means player readiness and `audioPositionAdvancingMs` means an Android audio-position callback, not an independently measured audible output time. A buffered-seek hint is not proof of a cache hit. Interrupted or superseded actions are labelled; missing audio events remain unmeasured and expire rather than appearing as zero latency. Nothing is uploaded automatically.

## Windows 0.7.3 playback

This release keeps a single HTMLAudio/Web Audio owner and the existing equaliser. After playback settles and the current item has at least eight seconds buffered ahead (or is buffered through its end), the existing one-next-item preparation requests a maximum 512 KiB encoded-audio range through the local proxy, with one speculative transfer and a five-second budget. Foreground streaming/seeking cancels obsolete speculative network work. The proxy also retains recently received ranges in RAM, bounded to 16 MiB total, 8 MiB per signed stream URL, eight stream entries and 512 fragments. These are proxy-buffer limits, not a whole-app memory cap or a guarantee about Chromium's separate media buffers. No audio files or offline feature are created. Pausing/loading, queue changes and sleep continue to cancel inappropriate next-item preparation; a preloaded fragment may never be played.

The proxy returns explicit finite `206 Content-Range` responses for cached prefixes. A following media request continues at the next offset; an uncached range falls back to the validated upstream relay. Expired URLs, changed URLs/representations, unsupported Range responses and malformed bodies cannot populate an unrelated track's buffer. Origin restrictions, expiring opaque tickets, allowed-host redirect checks and private URL handling remain active. The client requests playback directly for known tracks and restores missing media only after `MEDIA_NOT_FOUND`, avoiding an unnecessary serial local GET. A fresh descriptor retry replaces obsolete in-flight preparation. The Python playback worker starts warming alongside the real API without blocking the interface.

Run `pnpm exec tsx --test tests/audio-buffer.test.ts tests/audio.test.ts tests/playback-preparation.test.ts tests/playback-api.test.ts` and `pnpm exec playwright test --config tests/config/playwright.playback.config.ts`. The browser transport case decodes an 80-second original generated WAV from a prepared partial response, continues beyond the prefix and seeks both ways. Other cases cover fifty sequential skips, stale descriptors, cancellation, pause/resume and saved seek position. These fixture tests do not establish a real-provider speedup.

Use the existing opt-in Windows `tests/packaged-desktop.mjs --latency --exe-version 0.7.3` with an isolated profile to compare the actual portable with 0.7.2. Record cold startup, prepared changes, pause/resume and seek separately. `window.ritvioPlaybackMetrics` contains bounded client samples, including seek completion and buffered hints; the authenticated `/v1/playback/diagnostics` includes proxy byte/hit/preload counters without media URLs or titles. HTML media events measure readiness/progress rather than independently measured audible output. Unprepared tracks and seeks outside available audio remain network-dependent.

`Windows preview` can build read-only workflow artifacts from a `codex/` branch without opening a PR, merging or publishing a release. The isolated installer check runs only on the disposable runner. Keep public downloads unchanged until the maintainer has tried the candidate.

The published 0.7.3 EXEs match [Windows preview run 39158729658](https://github.com/salvo13200/RITVIO/actions/runs/39158729658): 211 core tests, 13 focused browser/player tests and isolated installer lifecycle checks passed. The downloaded portable passed the real-provider playback/next/pause/resume/seek harness, and the maintainer approved the candidate for publication. A small sequential comparison (three prepared track changes per version) measured a median 317.5 ms in 0.7.2 and 87.7 ms in 0.7.3; the uncached first track remained about 2.8 seconds and paused seek completion stayed around 8–9 ms. These are HTML media events, not speaker-output measurements or a universal speed claim.

Record portable startup separately: the first fresh launch exceeded a 90-second probe budget; a follow-up with a fresh profile reached the UI in 26.8 seconds, then the complete harness passed. Prefer the installer to avoid per-launch extraction. This is not a measured installer startup result or comprehensive Windows-device/accessibility coverage. Exact files, source/build provenance and limitations are recorded in the [release manifest and notes](https://github.com/salvo13200/RITVIO/releases/tag/windows-v0.7.3).

## Playback reliability: Windows 0.7.4 / Android 1.2.1

These exact binaries are published as public previews after the maintainer authorised publication. The final builds passed 217 core tests, 25 desktop browser tests, 20 Android browser tests and 65 JVM tests. The isolated Windows installer lifecycle and downloaded portable playback/next/pause/resume/seek/closure checks passed; Android signature and all 20 native libraries passed their checks. These results do not close the physical-device acceptance checklist below. Corresponding source commits, build runs, checksums and platform-specific limitations are recorded in each release manifest.

Windows adds at most two automatic transient-network retries (1/3-second backoff), with a bounded 30-second offline wait per attempt. An online notification can resume a pending attempt, but cannot restart an exhausted, paused or superseded session. Rate-limit and non-transient descriptor errors retain the explicit Retry flow. A resource that stops producing data while buffering gets a bounded recovery after 20 seconds. A seek made during descriptor preparation is applied when metadata arrives and uses the selected recording's duration, without seeking the outgoing resource; rapid paused seeks retain the last target without starting audio. Queued media events must agree with the installed resource's real readiness/end state before changing controls or advancing the queue. Returning to the app can resume a suspended Web Audio graph only when playback is still requested; a real OS suspend/resume trial remains separate from the controlled browser focus test.

Android adds at most two service-owned transient-network/expired-URL attempts per activation, with 1/3-second backoff and a 30-second pending deadline. Recovery waits for a validated default network and respects audio suppression. Pause, sleep expiry, clear, a new track and service destruction invalidate delayed callbacks. Explicit retries clear the track's short negative cache, while the resolver's global rate-limit cooldown stays enforced. The service does not request new permissions. Monotonic service/sequence stamps prevent late bridge responses or old service events from replacing newer track, artwork, position or pause state.

Automated coverage: `pnpm test:playback` includes controlled transient failure, exhaustion, pause/cancellation, offline/online notification, rate-limit and pending-seek cases with actual browser audio. `pnpm exec playwright test --config tests/config/playwright.mobile-artwork.config.ts` covers artwork ownership and late native-bridge responses. JVM `PlaybackRecoveryTest` exercises deadlines, retry bounds and cancelled callbacks; it does not establish real device connectivity, Bluetooth or audio-focus behaviour. Media3 error/state semantics are documented in [Player.Listener](https://developer.android.com/reference/androidx/media3/common/Player.Listener#onPlayerError(androidx.media3.common.PlaybackException)).

Shutdown also cancels owned catalogue/search/import subprocesses before Home/collection hooks wait for their reads. Cancellation terminates only the spawned process tree, with a bounded completion wait; it does not record a provider failure in the persistent discovery cache. `tests/resolver-shutdown.test.ts` holds an actual fixture interpreter for 60 seconds and verifies resolver/API closure cancels it promptly, prevents new work and leaves no fake cache error. This regression was added after a Windows installer lifecycle run timed out while closing the app during reinstall; the final 0.7.4 binary subsequently passed a fresh complete lifecycle run and the local real-provider portable harness.

### Native acceptance run (record results for each exact candidate)

Do not substitute fixture or JVM results for this checklist. Use the official update signature and keep a backup; do not uninstall or erase the real library.

| Scenario | Acceptance | Required environment |
| --- | --- | --- |
| 60 minutes of listening, including screen locked | Correct track/cover/queue; no crash, accumulating covers or indefinite loading | Physical Android phone; installed Windows app |
| Rapid next/previous and queue jumps, including duplicate tracks | Only the final selected item can own playback and update the interface | Both native apps |
| Repeated forward/backward seeks, including while loading or paused | Last target wins; pause remains paused; no stale position restores | Both native apps |
| Disable connectivity, then restore it within the pending window | Buffered audio may continue; transient failure recovers the current intent within the retry budget | Phone Wi-Fi/mobile handoff and Windows network |
| Pause or change track before connectivity returns | No unsolicited playback or old-track recovery | Both native apps |
| Network unavailable longer than the recovery deadline, or provider rejection | Finite loading/retries, actionable error, explicit Retry still available; no request storm | Both native apps |
| Incoming call, transient/permanent audio focus loss, unplugged headphones and Bluetooth reconnect | Respect system pause/suppression; no unwanted speaker playback or recovery overriding pause | Physical phone/accessories |
| Sleep timer during retry; app/PC suspend and resume | Timer/pause intent respected; no delayed callback revives playback | Both native apps |
| Restart after queue edits and seek | Correct saved queue/track/position; restart remains paused; library unchanged | Both native apps |

Record app version, exact SHA-256, device/OS, connection, duration, result and diagnostic report when available. Strip personal listening identifiers before sharing reports. No hour-long phone trial or Bluetooth/call pass is implied by building these candidates.

### Controlled Windows endurance probe

The opt-in portable probe uses a new isolated profile, 500 stored queue items and locally generated PCM. It navigates Audio settings, lyrics and the queue while checking that media time keeps pace with real elapsed time, then injects a playback failure, retries and verifies the paused queue/position after restart. It does not use or alter the personal installation/library.

```powershell
node tests/packaged-desktop.mjs --performance --soak --soak-seconds 600 --exe-version 0.7.4
```

`--soak-seconds` accepts 60–7200 whole seconds and requires `--performance --soak`. Omit it for the existing 60-second smoke check; use `3600` for a real elapsed hour. The generated recording and descriptor lifetime cover the requested interval. The probe prints progress approximately every 30 seconds, after the current navigation cycle; a successful report records the requested/actual navigation duration, media-time advancement and the largest observed interval between progress samples. The interval includes navigation/sampling time and is not a measured audible gap. Results go to `test-results/native/NATIVE-<version>.json` only after the full probe succeeds. A controlled hidden-window run cannot establish real-provider continuity, whole-process memory stability, OS suspend/resume, phone battery use, calls or Bluetooth; retain the native acceptance checklist above.

The separate `--latency` probe waits for its initial live seek to finish with sufficient media readiness before measuring pause/resume. Reading the assigned `currentTime` alone cannot establish that a seek has completed; otherwise the subsequent resume measurement can include the pending seek.

The controlled fault interrupts both descriptor resolution and prepared media delivery, so a cached descriptor cannot bypass it. A navigation checkpoint in the isolated profile (`soak-navigation.json`) records only that phase, with retry/restart still pending; it must not be reported as a complete pass if later assertions fail. `soak-complete.json` is written only after those assertions succeed. Relaunch also updates the caller's page before further renderer checks, rather than querying the closed window.

#### Native resource sampling

To observe memory/process counters throughout that same controlled session, extract the complete official Windows ZIP under `.packaging/zip-check/` and run:

```powershell
node tests/packaged-desktop.mjs --performance --soak --soak-seconds 600 --resource-samples --retained-heap --exe-version 0.7.5 --unpacked-exe .packaging/zip-check/RITVIO.exe
pnpm exec tsx --test tests/native-resource-probe.test.ts
```

`--resource-samples` requires `--performance --soak`. It samples after a warm-up navigation cycle, approximately every 30 seconds after a cycle completes, before the fault check, after recovery, and after 30 seconds paused. A fresh probe samples the restarted app with the same Now playing panel open; it has a separate root identity/timeline, so CPU intervals never span the old/new processes. It records renderer heap, document/node/listener counts, and Windows private bytes, working sets, handles, threads and CPU counters for descendants of the isolated test root, including observed resolver children. It excludes the test harness and unrelated apps. Chromium process roles identify main/renderer/GPU where available; unsupported or absent roles are explicitly unclassified. Process creation identities guard against PID reuse. A missing root/counter fails the probe instead of reporting zero usage. No process command lines, song identifiers, stream URLs or environment variables enter these samples; no diagnostics are uploaded automatically.

Private bytes represent committed private memory. Summed working sets can double-count shared pages. CPU percentages are core-equivalent over matching observed process lifetimes, may exceed 100%, and omit short-lived processes between observations. `--retained-heap` explicitly requests garbage collection at the navigation baseline/end and restarted snapshot, in addition to the existing initial renderer check. Periodic, recovery and paused-idle samples do not force collection. Endpoint GC can change the measurements; neither a lower endpoint nor a high periodic peak proves absence/presence of a leak. Retained DOM/heap and native memory must be assessed separately, with workload and sampling cost recorded.

`soak-resources.json` and `soak-restart-resources.json` are partial checkpoints and keep `sessionComplete: false`. Only the final `soak-complete.json` and top-level native report establish that failure recovery and paused restart also passed. The final report separates immutable `navigationResources`, original-session `resources` (including recovery/pause), and `restartedResources`. Reports taken before a later sample retain their original entries and summary. A short run does not close the hour-long, real-provider, OS suspend/resume, physical-phone or accessibility acceptance gates.

Use `--soak-seconds 3600` for the hour-long controlled session. The generated PCM grows with the duration; the fixture serves finite byte ranges of at most 256 KiB per debugger fulfillment and records actual response counts/sizes. This avoids serializing the entire hour-long WAV in one debugger message. Large non-range requests are rejected explicitly. `tests/native-tone.test.ts` verifies complete byte reconstruction, WAV sizes, terminal/suffix ranges and bounds; the native probe still has to demonstrate actual continued decoding across responses. Compare trends within that run rather than treating its absolute memory level as directly comparable to the previous unbounded-body fixture. Paused restart has no loaded audio decoder and is a separate workload, not a like-for-like active-playback baseline.

The packaged-probe error handler logs the original failure before attempting a screenshot or bounded body-text diagnostics, so a second diagnostic timeout cannot replace the cause. Early attempts that failed before the measured phase are not successful endurance evidence.

On 20 October 2026, the published Windows 0.7.5 ZIP (`d01a9378653bd592711c7bd244caf559f3e8c37d3b746e2ffc912320c9e095a7`) passed this probe: 42 navigation cycles over 607.8 seconds, with media position advancing 607 seconds, controlled media-failure recovery and a paused restart preserving all 500 entries, index 1 and position 5 seconds. Test machine: Windows 11 Home 10.0.26200, Ryzen 5 5500U, 12 logical processors, 5.8 GiB usable RAM. Other desktop workload was not isolated; the core suite also ran during part of the session. The executable/ASAR payload hashes stayed unchanged; all observed original-session processes exited. All 222 core tests, TypeScript, documentation and public-source checks passed.

Sixteen resource samples recorded private bytes at 521.6 → 574.6 MiB (peak 656.8), and summed working sets at 643.8 → 444.0 MiB. Endpoint-collected renderer heap was 6.9 → 7.9 MiB; DOM nodes 819 → 814 and listeners 352 → 348. Process count fell from seven to five. The residual private-memory increase remains unclassified and needs a longer/repeated investigation; renderer counters returning to baseline do not establish native-memory stability. Hidden-window frame collection was insufficient for an FPS conclusion. No application runtime change or new binary is implied by these test-tool additions.

The subsequent hour-long controlled run on the same machine and published ZIP completed **3616.9 seconds / 130 cycles**, with media position advancing 3617 seconds. Recovery from the controlled media error, 30 seconds paused, and a paused restart preserving all 500 items/index 1/position 5 passed. All observed original/restarted processes exited; executable/ASAR and recorded harness hashes matched. The 59,520,044-byte original PCM used 241 partial responses, at most 262,144 bytes each, with no invalid requests. The core suite ran after this measured session: **225/225 passed**, as did TypeScript, documentation, public-source and whitespace checks. Early attempts that stalled before the measured phase are excluded; the bounded-response fixture and original-error logging address those probe limitations without changing the app.

| Phase | Total private MiB | Main | Renderer | GPU | Renderer heap MiB |
| --- | ---: | ---: | ---: | ---: | ---: |
| Warm baseline, explicit GC | 446.0 | 96.4 | 78.4 | 202.5 | 7.4 |
| Navigation end, explicit GC | 641.6 | 99.2 | 244.6 | 274.1 | 8.0 |
| Recovery playing, no forced GC | 578.4 | 100.8 | 259.2 | 194.8 | 11.0 |
| Paused 30 seconds, no forced GC | 479.7 | 91.8 | 247.9 | 116.3 | 10.5 |
| New process paused, explicit GC | 397.7 | 104.8 | 55.9 | 178.3 | 5.8 |

This establishes the controlled functional run, **not a resolved memory issue**. At the navigation GC endpoints, nodes were 819 → 814 and listeners 348 → 348; main private memory stayed close to baseline, but renderer private memory increased substantially beyond its measured JS heap and remained elevated after recovery/pause. At that stage, native media allocations, process caches and debugger preservation had not been separated. [CDP documents network-payload buffers](https://chromedevtools.github.io/devtools-protocol/tot/Network/#method-enable); that is a measurement limitation, not proof they caused all the growth. No product optimisation is claimed from these observations.

The fixture uses mono 8 kHz/16-bit generated PCM, 500 occurrences of one reference item with 61 initially rendered rows, and missing lyrics. It is not broad catalogue/codec coverage. The hidden-window frame check was insufficient for a visible-FPS conclusion. Real-provider hour-long listening, real OS suspend/resume, physical-phone and broad accessibility acceptance remain separate; a fresh paused process has no loaded audio decoder and has different helper lifetimes, so its lower total is not a like-for-like playback measurement.

#### Media transport and observer controls

To separate media response interception from a connected debugger, run these three **separate fresh-profile** controls against the same extracted Windows ZIP:

```powershell
node tests/packaged-desktop.mjs --media-control intercepted --control-seconds 600 --exe-version 0.7.5 --unpacked-exe .packaging/zip-check/RITVIO.exe
node tests/packaged-desktop.mjs --media-control http-connected --control-seconds 600 --exe-version 0.7.5 --unpacked-exe .packaging/zip-check/RITVIO.exe
node tests/packaged-desktop.mjs --media-control http-detached --control-seconds 600 --exe-version 0.7.5 --unpacked-exe .packaging/zip-check/RITVIO.exe
```

All arms use the same generated PCM, finite 256 KiB ranges, hidden native window, 500 repeated queue references and idle Now playing view. `intercepted` fulfills media through Playwright; `http-connected` serves identical bytes from an ephemeral loopback HTTP server while Playwright stays connected. `http-detached` uses that server and disconnects Playwright/CDP after starting playback. During all three measured intervals, only Windows process counters are polled, approximately every 30 seconds; connected arms receive no periodic heap/DOM queries. Renderer roles come from the initial CDP process map and are attached only to matching PID/creation identities. New helper process lifetimes are unclassified; replacement of the single identified renderer fails this comparison.

The initial HTML response keeps its original document body and app origin. **In these test profiles only**, its CSP `media-src` adds the exact ephemeral loopback fixture origin; no production CSP, executable or ASAR is changed. Other CSP directives remain intact. Small playback descriptors are intercepted during setup. For the detached arm all routes are removed before disconnecting, so media delivery no longer depends on the automation connection. Playwright's CDP connection close disconnects its transport; the harness separately verifies the native app remains alive. The debugger port remains enabled on loopback, so this is not a completely debug-disabled launch.

`media-control.json` is checkpointed in the isolated profile with `complete: false` until the measured interval ends, reconnection succeeds where needed, playback position advances with elapsed time, the transport bounds pass and playback pauses. The final OS memory sample precedes reconnection; endpoint heap/DOM/GC observations are instrumented and reported separately. PCM/server and native processes are closed on completion or failure. Reports contain process counters rather than command lines or app tokens.

This is a **playback-only causal control**, not a repeat of the hour-long UI-navigation workload. Do not treat its lower memory level as a production optimisation or a passed long-term real-provider gate. Compare trends within each arm, allow for startup/native-cache settling, and repeat ambiguous results. The deterministic arm order, single session per arm, hidden window and other desktop activity limit causal confidence. `tests/native-media-fixture.test.ts` checks that real HTTP and intercepted ranges return identical bounded bytes.

On 20 October 2026, all three 600-second playback controls passed on the same published 0.7.5 runtime and machine above. They used 63 OS samples across the measured intervals and identical 11,520,044-byte WAV resources, 44 finite responses per arm, with no invalid requests. The renderer identity stayed unchanged in every sample. All observed processes exited, and executable/ASAR hashes matched before and after. Core tests ran outside these three measured intervals. The final 226/226 core tests, TypeScript, documentation and public-source checks passed; a subsequent 60-second disconnected preflight also passed after adding stricter identity/CSP assertions and error cleanup.

| Control | Media advanced | Renderer OS private MiB, first → last | Renderer private MiB, GC endpoints | Renderer heap MiB, GC endpoints |
| --- | ---: | ---: | ---: | ---: |
| Intercepted, connected | 600 s | 82.9 → 108.3 | 82.9 → 101.4 | 5.85 → 6.16 |
| HTTP, connected | 601 s | 82.5 → 106.0 | 82.5 → 100.4 | 5.85 → 6.16 |
| HTTP, disconnected | 601 s | 81.9 → 85.9 | 81.9 → 84.5 | 5.85 → 6.92 |

Serving media over HTTP alone did not eliminate the increase. Disconnecting the observer reduced the increase in this single playback-only comparison; the responsible debugger subsystem was not isolated. This supports a measurement contribution, **not** an explanation of all prior hour-long UI-navigation growth or a product fix. Do not hide residual growth by using only the first/last snapshots: after initial settling, descriptive renderer-private slopes from minute 2 onward were approximately 3.01 / 2.89 / 1.44 MiB/minute respectively. Those are single-run regressions, not replicated statistical estimates. PCM/native-media allocations and caches still need classification with realistic codecs, repeated track changes and an equivalent navigation control. Reconnection itself can affect the disconnected arm's final heap/listener observation. No production leak is confirmed or declared resolved, and no application binary changed.

#### Repeated track changes with PCM and Opus

```powershell
node tests/packaged-desktop.mjs --switch-control pcm --switch-cycles 30 --exe-version 0.7.5 --unpacked-exe .packaging/zip-check/RITVIO.exe
node tests/packaged-desktop.mjs --switch-control opus --switch-cycles 30 --exe-version 0.7.5 --unpacked-exe .packaging/zip-check/RITVIO.exe
```

These controls use 500 distinct synthetic queue entries and a 24-second original stereo signal: PCM at 48 kHz/16-bit, or WebM/Opus recorded inside Electron with a requested 128 kbit/s target. The Opus signal comes only from two oscillators connected to a recording destination, never a microphone or external recording. Actual decoded duration, channel count and sample rate are checked. The recording process is closed, then a fresh app process performs the measurement; no encoder tool, additional dependency, API key or paid service is required. See the [MediaStream Recording specification](https://www.w3.org/TR/mediastream-recording/) and [Web Audio recording destinations](https://www.w3.org/TR/webaudio-1.0/#MediaStreamAudioDestinationNode).

After setup, Playwright disconnects. A small raw CDP client controls the real transport buttons and sends keyboard seek events; it refuses every `Network.*` command. `Fetch` intercepts only the small playback descriptors. All actual media bytes travel through a loopback HTTP fixture with finite 256 KiB ranges and a distinct URL per queue item. The test document alone adds that fixture origin to CSP; production CSP and binaries remain unchanged. The client remains attached, so this is not a debugger-free test. It samples renderer/OS counters without network-response collection.

Two warm-up changes precede the baseline. Each measured cycle changes to the next item, checks that the selected title and actual audio resource match, and requires at least four seconds of actual media-time advancement during a six-second dwell. Every third cycle also seeks to five seconds using the real slider's keyboard behavior and waits for media readiness and seeking completion. Baseline/end and the 20-second paused tail explicitly collect renderer GC; periodic samples do not. A stable single renderer identity is required. `switch-control.json` remains incomplete until all cycles, decoder-error checks, paused positioning and transport bounds pass. The isolated profile's saved queue/index/position can then be checked after the harness exits.

This crosses the frontend descriptor cache's 30-item limit in the default run, counting warm-up and current entries. It does not exercise the real resolver, production stream proxy/RAM prefix cache, WAN latency, unsupported codecs, audible output or broad music content. All entries reuse one original signal per format with distinct URLs. Local timings are not internet startup/seek guarantees; one short comparison cannot prove absence of leaks. Recording/fixture issues that fail before completion are excluded from successful evidence.

On 20 October 2026, both 30-cycle controls passed against the unchanged published 0.7.5 runtime. Each measured switching phase lasted approximately 191 seconds, in addition to setup, warm-up and a 20-second paused tail. Both profiles preserved all 500 entries, index 32 and position 5 seconds after process exit. All observed measured processes exited and runtime/harness hashes matched. The 229 core tests and TypeScript passed before the measured sessions.

| Format | Measured changes / playing seeks | Renderer private MiB, GC baseline → end → paused | JS heap MiB, GC baseline → end |
| --- | ---: | ---: | ---: |
| PCM 48 kHz stereo | 30 / 10 | 84.0 → 74.2 → 70.8 | 6.60 → 6.75 |
| WebM/Opus 48 kHz stereo | 30 / 10 | 80.3 → 68.8 → 65.9 | 6.61 → 6.76 |

There were 33 distinct media URLs per arm, zero invalid range requests, no media interception, and no decoder errors during the verified changes. PCM served 149,206,356 prepared body bytes through 582 responses; Opus served 12,697,212 through 66 responses. The waveform/Opus files were 4,608,044 / 384,764 bytes respectively; Opus decoded to 23.88 seconds. DOM nodes were 818 → 829 and listeners 355 → 355 at switching GC endpoints in both arms. This short workload did not reproduce a progressive source-count-related renderer increase; retained JS heap rose about 0.15 MiB. It neither proves absence of leaks nor isolates all prior hour-long navigation growth.

Local median/p95 change readiness was approximately 231/238 ms for PCM and 232/237 ms for Opus. The two-key seek verification measured approximately 124/125 ms and 124/142 ms respectively. Those include control/polling overhead, use local synthetic media, and are not guarantees for WAN or provider latency. Playback seek assertions use the new `seeked` event near the requested target, rather than demanding that the still-playing current time remain fixed. Early preflight document/selector/assertion failures are excluded from completed evidence.

### Windows startup comparison

On a Windows machine without an existing RITVIO installation, shortcuts or open app:

```powershell
node tests/desktop-startup.mjs --version 0.7.4 --samples 3
```

This verifies the EXE checksum sidecars, temporarily installs that exact version under a new `.packaging/startup-*` directory, then alternates installer/portable launches sequentially. Every launch gets a fresh English user-data directory and clean PATH. The probe measures debug availability, rendered search controls and usable Settings separately; it does not wait for online Home collections or measure first-track audio. It refuses existing installations/open players, closes only its own processes, checks the exact test uninstaller's registration and verifies personal data fingerprints after cleanup. A report is marked complete only after cleanup succeeds. Results are in `test-results/startup/desktop-<version>.json`.

To check an already extracted ZIP without running an installer, provide its staged executable under this workspace's `.packaging/` directory:

```powershell
node tests/desktop-startup.mjs --version 0.7.5 --samples 3 --folder-only --folder-exe .packaging/zip-check/RITVIO.exe
```

That report is `test-results/startup/folder-<version>.json`. These are hidden native-window samples with OS/security caches retained, not cold-boot or visible-paint benchmarks. A large delay before debug availability locates work before the renderer; it cannot by itself distinguish decompression, disk access and antivirus scanning. Do not disable system protections to improve the result. Keep first and subsequent samples; do not substitute extraction-free folder timings for self-extracting EXE timings.

## Listening tools: Android 1.3.0 / Windows 0.7.5

[Android 1.3.0 is published as a public preview](https://github.com/salvo13200/RITVIO/releases/tag/android-v1.3.0) after the maintainer authorised the exact signed APK. The Windows 0.7.5 release preparation uses binaries from build 39403307392, whose source tree matches merged commit `66d94bf7af3371dcc3a0c3fae6458821e7aa1f22`. This increment adapts Android lyric sharing, queue and lyric reading to full-height task workspaces. Sharing keeps selection and preview as separate history entries; Back preserves the contiguous excerpt and frozen track. The shared desktop/Android canvas measures wrapped lyric and credit rows before centring a content-sized inner card in the unchanged 1080×1920 image. It never stretches the thumbnail behind the verses. Preview generation/export must not issue playback or queue commands.

Run `pnpm exec playwright test --config tests/config/playwright.listening-tools.config.ts --grep-invert 'capture:'` for behavioural coverage. Touch cases send actual Chromium CDP touch events: reorder upwards/downwards, hold at either edge without more movement, drop beyond the initially visible rows, cancel, ordinary row swiping and queue-revision interruption. The dragged grip must remain under the held finger while the list scrolls. Native commands preserve the current track/position, pause and duplicate occurrences. Raw CDP targeting waits for finite row-settle animations, like normal actionability checks; this is synthetic Chromium touch evidence, not a physical Android gesture result.

Queue dragging only starts on the handle. Text/artwork swipes keep native scrolling; tapping a grip or row menu offers labelled move/remove controls. The current item is pinned above the upcoming order and previously played items remain available separately. Edge scrolling advances on animation frames while a drag is held; the dragged row stays within its real peers so it cannot extend the list indefinitely at the last edge. Shuffle reordering preserves the previously played/current items. Unrelated snapshots cancel a drag when the queue revision or current item changes. Source-row transforms update without rerendering the whole list every frame. Normal/native Back, gesture cancellation and reduced motion remain separate checks.

Reader checks cover stored text-size/emphasis preferences, stable row heights across active-line changes, manual-scroll interruption and explicit follow recovery. Auto-follow scrolls the reader itself rather than an ancestor dialog. Plain lyrics retain text-size controls without invented timing. Loading/unavailable lyrics and gallery/export failures must stay recoverable.

The opt-in `capture:` case writes English demo screenshots and actual canvas exports under the ignored `.impeccable/review/android-listening-tools/` directory, which it creates in a clean checkout. Those are browser-rendered layouts with fixture bridge responses; they do not establish native system insets, TalkBack, OEM font scaling, Gallery permissions or playback continuity. Test the exact signed APK on the phone, particularly long-list drag/drop with one finger, edge holds, Android Back through sharing, large system fonts, save-to-Gallery feedback and continuous locked-screen audio. The Windows 0.7.5 candidate passed isolated packaged track/lyrics/ten-line exports, including the real cover proxy, without changing playback. Its release is separate from Android. The maintainer reported successful initial Android 1.3.0 trials on Motorola edge 60 neo / Android 16 on 20 October 2026: locked-screen listening, Wi-Fi/data handoff, skips/seeks and headphones/calls. This is a maintainer report, not instrumented evidence or comprehensive device acceptance; prolonged listening, accessibility and broader Bluetooth/device checks remain open.
