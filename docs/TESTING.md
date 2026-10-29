# Testing from a clean checkout

## Current stable delivery

Windows 1.0.0 / Android 1.4.0 acceptance, source correspondence, remote CI and public-download checks are recorded in [Quality status](QUALITY_STATUS.md). The staged test descriptions below distinguish their original source-only scope from later native acceptance; a browser fixture never substitutes for a physical-device result.

## iOS foundation and embedded resolver (unreleased)

`pnpm exec tsx --test tests/ios-foundation.test.ts` checks platform isolation, the native readiness contract, challenge/response validation, version separation and source-export exclusions. `pnpm ios:prepare` prepares only bundled assets and Capacitor configuration, including on Windows; it is not evidence of native compilation.

On macOS, `pnpm ios:build --smoke` separately builds the simulator and unsigned arm64 device target. The XCTest UI test launches the packaged app and exercises the actual Swift bridge through the listening controls, changes language, terminates/relaunches the app and verifies persistence. The bridge contract/challenge validation also has host coverage. The native UI test runs on up to two available iPhone simulators; the second uses larger accessibility text. Screenshots come from XCTest, not a browser mock. Reports record the selected models and runtimes, so a recent simulator is never presented as an iOS 15/iPhone 6s result.

IOS-2 additionally runs the packaged Python/QuickJS interpreter inside the app, checking trusted CA availability, execution/memory limits, lack of host IO in the JavaScript sandbox, cache eviction, CPU cancellation, concurrent admission and recovery after cancellation. Native URLSession protocol fixtures test exact byte-range lengths, rejection of ignored/malformed ranges, oversized/truncated bodies, invalid containers and untrusted initial hosts. They are explicitly marked synthetic, not evidence of provider TLS or streaming. The first simulator separately attempts two real music searches, cache reuse, AAC/M4A resolution and bounded initial/middle byte-range probes. Provider failures fail the live check; deterministic fixtures never replace live evidence. Independent UI/native checks continue after a live-provider rejection, while the final workflow stays failed and records the open live check. Reports distinguish successful compilation from failed checks. The host policy tests in `tests/ios_resolver_test.py` cover validation, cache rules, cancellation, error redaction and fixed provider-error categories; they do not prove native execution.

IOS-3 additionally runs an AVPlayer harness using an original generated tone encoded to AAC/M4A and served through in-process URLProtocol fixtures. It exercises the public resource loader, superseded resolutions, real AVPlayer time advancement, paused/rapid seeks, repeat/end transitions, synthetic interruption/route events, one expired-source refresh, rate-limit stopping and queue/position restoration without autoplay or persisted descriptors. These are native decoding and policy tests: fixtures prove neither provider TLS nor audible output; synthetic session events prove neither a phone call nor locked-screen continuity. The separate `playback.json` labels those limits. System command delivery, real routes and signing remain hardware checks.

IOS-4 adds a dedicated listening shell and native UI coverage. `pnpm exec playwright test --config tests/config/playwright.ios4.config.ts` checks release-only seeking, a single proportional cover with stable sizing across missing album metadata, a fixed portrait/landscape player, actual-next semantics after handle/menu reordering, queue clearing, search debounce/stale-response rejection, recoverable errors, keyboard focus, reduced motion, large text and an automated accessibility scan. These browser tests use controlled bridge responses and are not native acceptance. Full native smoke runs launch the Debug-only `--ritvio-ui-check` fixture, then drive WKWebView controls through Capacitor into the real queue/AVPlayer with an original generated tone. Screenshots are explicitly fixture-labelled; the fixture is unavailable in Release. Native UI checks exercise a paused touch seek, fixed player, grip tap actions, drag-to-next order, search enqueue/error recovery, persisted language, the Reduce motion switch in both states and independently scrollable Settings below native safe insets after keyboard dismissal on compact and large-text iPhone simulators. Captures use the full screen to avoid a transformed-window crop when rotating. The player harness also asserts that storage and effective order both change when moving an occurrence, including shuffle, and rejects stale edits after the current song advances. Browser gesture checks cover cancellation when a native revision changes, a held row following the pointer and notices staying above the mini-player.

`pnpm ios:build --smoke --resolver-only` runs the native resolver on one simulator without UI/XCTest captures or the player harness, for backend diagnosis. This does not count as the two-device UI/player check. Full `--smoke` retains those captures and player checks. Adding `--skip-live` excludes provider requests explicitly; reports record `liveProvider: not-run`, not success. Work-branch CI uses this independent scope; manual dispatch can opt into the still-open live-provider check. Artifacts and SHA-256 sidecars are under `.local/ios/artifacts/`, with simulator/device ZIPs explicitly separated. The device ZIP has no distribution signature and is not a directly installable IPA. IOS-5A adds local library operations; lyrics, sharing and discovery remain later blocks. Physical installation, free-signing renewal, locked-screen listening, Bluetooth/calls, real performance and iOS 15 compatibility remain pending until a device is available. See [build instructions](BUILDING.md#ios-embedded-resolver-technical-build).

IOS-5A uses `pnpm exec playwright test --config tests/config/playwright.ios5.config.ts` for Library A, list/search persistence, song saving, playlist creation, duplicate-occurrence reorder and stale-gesture cancellation, photo-adapter success/cancellation, failure preservation, queue saving, large text and accessibility. Browser adapters are fixtures, not native acceptance. The native player harness runs the actual library repository against isolated files: atomic failure, corrupted/unknown-schema preservation, bounded state, duplicate/stale edits, restart persistence and metadata-only storage. Native ImageIO checks downsampling, invalid images and GPS removal. The native UI case exercises save/add/reorder-to-next, rename/restart/delete, history, system photo-picker cancellation and a fixture-labelled four-playlist shelf on both phone classes. Actual photo selection, real-provider audio and device/background behavior remain pre-publication hardware gates; simulator success does not close them.
## CI isolation and native process sampling

The `CI` workflow divides the existing browser commands into four groups on separate fresh Windows runners: interface, updates/site/first use, playback/continuity, and sharing/support. This limits resource accumulation between suites after a run failed to load the Vite React refresh module with `net::ERR_NO_BUFFER_SPACE`. All existing suites remain enabled, with the same assertions and deadlines. The required **Browser regression** check aggregates every group and fails if any group fails, is cancelled or is skipped. Each failed group uploads its own traces and screenshots. No automatic retry turns a failed run green.

The site readability report uses Playwright's per-test output directory. The site tests also run inside the sharing project, so they must not depend on `test-results/site/` being created by an earlier invocation on the same runner.

The Windows resource probe prefers the PowerShell 7 host available on CI, with Windows PowerShell as a fallback only when `pwsh.exe` is absent. It resolves the owned process IDs in one `Get-Process` call, preserves creation-time guards against PID reuse, and validates the returned counters before accepting a snapshot. The 10-second query deadline is unchanged; timeouts, permission errors, incomplete output and missing root counters still fail. Deterministic regressions cover host selection, compatibility fallback and failure propagation; the existing live-process test continues to verify inclusion of descendants and exclusion of unrelated processes.

## Help and local presentation preparation

`pnpm exec tsx --test tests/resolver-shutdown.test.ts` includes a real loopback HTTP connection held open during shutdown. It distinguishes listening-server exit from injection-only tests: quitting must stop renderer connections without waiting for an unfinished response, while existing resolver cancellation and cache-integrity checks still pass.

On a clean Windows test host, `pnpm exec node tests/installer-lifecycle.mjs --from-version 0.7.5` additionally installs that earlier checksum-verified installer into the isolated directory before updating to the current package. Keep the previous installer and its SHA-256 sidecar in `release/`. The normal command without this option checks fresh install and same-version reinstall. Both modes refuse a pre-existing RITVIO installation or open app and never use the personal library as test data.

`pnpm exec tsx --test tests/support.test.ts tests/public-source.test.ts` checks the form URL allowlist, context-only parameters, bounded/safe report construction, deep/cyclic inputs and source/media selection policy. Android `SupportLinksTest` checks the corresponding native URL guard, and `:app:testReleaseUnitTest` compiles the changed native bridge.

`pnpm exec playwright test --config tests/config/playwright.support.config.ts --grep-invert 'capture:'` checks the actual Windows and Android-browser Settings against isolated hosts. It covers category selection, report inspection, opt-in reads, clipboard/open failures, retries, late responses after opt-out/unmount, keyboard focus, enlarged text, narrow width, reduced motion and automated accessibility scans. Existing mobile latency/snapshot cases are retained. No real issue is submitted. Browser native calls remain fixtures; verify actual external browser/clipboard behavior on the final installed candidates.

The opt-in presentation capture and metadata-free preparation commands are in [the new-source walkthrough](ADOPTION.md). Routine CI neither installs the recording tool nor rewrites public media. Capture data is synthetic; the silent UI video is not an audio, native-device or performance test. The mobile Vite watcher excludes generated native Android directories, avoiding development-server file-watcher races during Gradle work.

For the consolidated Windows 0.7.5 / Android 1.3.0 baseline and rules that avoid repeating unchanged scenarios, start with [Quality status](QUALITY_STATUS.md). This guide retains the detailed methods and historical results.

Use Node 24+, pnpm 11.25.0 and Python 3.13 on Windows as described in [BUILDING.md](BUILDING.md). No private design folders, existing user profile, cloud account or generated mockup is required for the source/browser checks.

## Continuity and timing in the current source

```powershell
pnpm exec tsx --test tests/audio-buffer.test.ts tests/audio.test.ts tests/playback-preparation.test.ts tests/playback-api.test.ts
pnpm test:playback
pnpm exec playwright test --config tests/config/playwright.continuity.config.ts
.\scripts\gradle-android.ps1 -Task @(':app:testReleaseUnitTest')
```

The buffer regressions cover overlapping, concurrently started origin reads followed by a backward seek. The previous implementation dropped untouched fragment bytes; the corrected buffer retains both sides of a replacement and keeps the existing total/per-stream/entry/fragment limits. Byte equality, expiry, representation changes and proxy transport are tested. In the controlled replay, the backward seek becomes a RAM hit, removing one otherwise necessary origin read; this is not a universal latency or bandwidth percentage.

Android `AudioSingleFlightTest` covers a foreground listener joining a preload whose owner is interrupted, including the resolver's wrapped `IOException` case. The active listener may join/start one replacement without inheriting another thread's interrupt. Multiple listeners still share work; cancelling a listener cancels that listener, and ordinary provider/rate-limit failures do not receive this replacement. Existing foreground/speculative lanes, descriptor generations and service retry limits remain in force.

The continuity browser suite records separate first-playback, prepared/unprepared change, pause/resume and buffered paused-seek observations in `test-results/continuity/timing-matrix.json`. Search time includes debounce, local API and development-route loading. One observation per phase uses original generated WAV audio and a local fixture API; it is neither native startup nor a real-provider speed benchmark. A second case gates the remainder of an 80-second generated recording beyond its prepared prefix and records a verified out-of-buffer seek in `unbuffered-seek.json`. It waits for media completion/readiness events rather than treating assignment to `currentTime` as completion. These reports contain no track names, IDs, signed URLs or tokens and are never uploaded by the app.

The existing playback suite covers decoding partial responses, stale callbacks, pending/paused seeks, cancellation, finite retries, rate limits and rapid skipping. JVM tests and browser audio do not establish phone background, Bluetooth, OS suspend/resume, live-provider or speaker-output timings. The eventual combined candidate still needs the relevant installed-package acceptance; this local increment neither reinstalls an app nor publishes a package.

## First listening and playlist transfer in the current source

`pnpm exec playwright test --config tests/config/playwright.first-use.config.ts` checks the existing desktop and Android interfaces against isolated fixtures. It covers an empty profile reaching search, play and heart-save; returning libraries; discoverable link/file import; supported formats; unavailable rows, selection, source order and duplicate skipping; a readable save result; cancellation/Back, late responses, file-picker cancellation and failed-save recovery. The Android short-screen case includes 150% root text and reduced motion. Accessibility scans cover the changed guidance and import/result surfaces.

The tests preserve and compare playback/queue state during transfer. They do not exercise the physical Android document picker, native background audio, a personal library or real catalogue availability. `tests/playlist-import.test.ts` separately covers the actual desktop API/store, owner and revision checks, cancellation, bounded previews, source ordering, atomic writes and same-job commit retries. Windows file imports retain their existing create-and-open flow; link imports and Android imports expose a result step. Exact installed-package acceptance is deferred to the final candidate; this source increment does not publish an APK or EXE.

## Static download page

### Song references and sharing (local source)

Run `pnpm exec playwright test --config tests/config/playwright.sharing-discovery.config.ts`. It starts isolated desktop, Android-browser fixture, API and built-static-page servers. It covers existing track/lyric exports, ten contiguous rows, missing artwork/lyrics, long rows, cancelled/failed saves, Gallery confirmation and captured-track ownership; it adds public-link/text copying and Android bridge arguments without playback commands. Reference-page cases cover `/RITVIO/`, literal untrusted metadata, invalid/duplicate/unknown parameters, absent metadata, no automatic external requests, accessibility, 320 px with 150% root text, reduced motion and a JavaScript-disabled fallback. Screenshot output directories are created without private input prerequisites.

`pnpm exec tsx --test tests/track-sharing.test.ts tests/story-sharing.test.ts tests/sharing.test.ts` checks the URL/message contract, bounded metadata, omitted private fields, selection rules, PNG validation and actual playlist APIs. Android `TrackShareTest` checks the corresponding native builder; `:app:testReleaseUnitTest` also compiles the changed bridge. Android browser export responses remain fixtures: they cannot establish receiving-app caption handling, real Gallery access or locked-screen continuity. Test those on the exact signed A7 candidate. These checks neither deploy Pages nor prove the future public URL is live.

`pnpm test:site` builds and serves the actual static output, then checks desktop/mobile downloads, locally recommended platform, image links, keyboard gallery, both sharing examples, automated accessibility scans, 320px wrapping, enlarged text, reduced motion, installation disclosures and guarded release refresh. A JavaScript-disabled context verifies both downloads and image assets under `/RITVIO/`. External release responses are fixtures; the tests neither download real APK/EXE packages nor claim a deployment. The source-only CI configuration includes these cases.

`pnpm downloads:check` verifies all three README tables against the validated public release snapshot without contacting GitHub. `download-catalog.test.ts` covers the per-platform catalog, stable/preview preference and invalid external links in the normal core suite. The snapshot itself is updated only after actual release publication; it is intentionally independent of unpublished local candidate versions.

## Update discovery in the current source

`pnpm exec playwright test --config tests/config/playwright.updates.config.ts` runs the actual desktop and mobile Settings with fixture release responses. It covers manual checks, platform-specific download actions, the preview channel, persisted startup preferences, notification dismissal, offline handling, light theme and enlarged text. Automated accessibility scans apply to the changed surfaces. These are browser fixtures, not evidence of the installed APK opening a physical phone's browser. The CI Browser regression job includes this suite.

The normal core suite includes `updates.test.ts` (version ordering, untrusted release/cache data, channels, cache validators, coalescing, cooldown and storage failures) and `updates-host.test.ts` (isolated Windows persistence, fixed network endpoint, bounded responses and validated external actions). Android's `UpdateAccessTest` verifies the native URL boundary as part of the JVM suite. No test installs a fake release or uses a personal profile.

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

### Focused readability and accessibility

```powershell
pnpm exec playwright test --config tests/config/playwright.mobile-accessibility.config.ts
pnpm test:accessibility --grep "skip link|modal traps|reduced motion"
```

The mobile suite follows Search, Player, Queue, lyric selection and Preview at 360Ãƒâ€”740 with 100/150/200% root text, 360Ãƒâ€”640 at 200%, and 740Ãƒâ€”360 at 150%. It checks automated accessibility, player containment and control dimensions, keyboard queue actions, contiguous verse selection, preview focus and reading-position restoration without transport commands. Synthetic text/catalogue fixtures are used. Root font resizing is a layout stress test; it does not reproduce WebView `setTextZoom` exactly or certify TalkBack, system insets or native text scaling. The existing listening-tools configuration includes these cases in browser CI. Screenshots and measured layouts are written under ignored `test-results/mobile-readability/`.

On the installed Android candidate, separately check actual enlarged system text, TalkBack traversal and focus on modal Back, portrait/landscape, and Search with the software keyboard open. Only claim these as device passes after observing them. Do not repeat native playback endurance for these web-only accessibility changes unless an actual regression calls for it.

Browser tests use controlled catalogue/audio fixtures. Passing them does not establish native audio focus, background playback, Gallery export or real-provider availability. Use a phone for those checks. Android unit/instrumentation builds require the separate SDK/JDK toolchain; instrumentation tests must actually run on a device before reporting a native pass.

`tests/packaged-desktop.mjs`, `desktop-live.mjs`, `installer-lifecycle.mjs`, `english-desktop.mjs` and `scripts/measure-playback.ts` are opt-in Windows/package/live probes. They require their stated built artefacts, installed runtimes or explicit environment configuration. They are not prerequisites for fixture-based CI. Installer tests refuse to replace an existing installation or terminate an open personal player. Performance tools generate new records in `test-results/`; historic private benchmark reports are not inputs shipped with the source.

Do not run Android Gradle and browser/Electron tests concurrently on a low-memory machine. Signing keys, profiles, personal listening data and screenshots never belong in a commit.

## Android 1.2.0 playback

Android 1.2.0 introduced the native playback changes below and was published after the maintainer's successful phone trial. That report establishes a perceived speed improvement, not an instrumented benchmark or comprehensive device coverage. Windows has a separate playback pipeline; its 0.7.3 public preview is documented below.

Media3 1.11.1 defaults to 1000 ms of startup buffer, 2000 ms after rebuffering, no retained back buffer and disabled playlist preloading. The candidate uses 500/1000 ms startup/rebuffer targets, 15Ã¢â‚¬â€œ50 seconds forward buffering, 60 seconds of played audio retained in RAM, an 8 MiB allocator target and native preloading of the next five seconds after playback settles for at least 1.5 seconds. These are policy targets, not measured startup guarantees or a hard total-process memory cap. No disk audio cache or offline feature is added. Preloading is disabled while paused, sleeping, repeating one track or under the resolver cooldown; Media3 also yields to the current item's loading. This can fetch a short portion of a next track that is subsequently skipped.

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

The published 0.7.3 EXEs match [Windows preview run 39158729658](https://github.com/salvo13200/RITVIO/actions/runs/39158729658): 211 core tests, 13 focused browser/player tests and isolated installer lifecycle checks passed. The downloaded portable passed the real-provider playback/next/pause/resume/seek harness, and the maintainer approved the candidate for publication. A small sequential comparison (three prepared track changes per version) measured a median 317.5 ms in 0.7.2 and 87.7 ms in 0.7.3; the uncached first track remained about 2.8 seconds and paused seek completion stayed around 8Ã¢â‚¬â€œ9 ms. These are HTML media events, not speaker-output measurements or a universal speed claim.

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

`--soak-seconds` accepts 60Ã¢â‚¬â€œ7200 whole seconds and requires `--performance --soak`. Omit it for the existing 60-second smoke check; use `3600` for a real elapsed hour. The generated recording and descriptor lifetime cover the requested interval. The probe prints progress approximately every 30 seconds, after the current navigation cycle; a successful report records the requested/actual navigation duration, media-time advancement and the largest observed interval between progress samples. The interval includes navigation/sampling time and is not a measured audible gap. Results go to `test-results/native/NATIVE-<version>.json` only after the full probe succeeds. A controlled hidden-window run cannot establish real-provider continuity, whole-process memory stability, OS suspend/resume, phone battery use, calls or Bluetooth; retain the native acceptance checklist above.

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

Sixteen resource samples recorded private bytes at 521.6 Ã¢â€ â€™ 574.6 MiB (peak 656.8), and summed working sets at 643.8 Ã¢â€ â€™ 444.0 MiB. Endpoint-collected renderer heap was 6.9 Ã¢â€ â€™ 7.9 MiB; DOM nodes 819 Ã¢â€ â€™ 814 and listeners 352 Ã¢â€ â€™ 348. Process count fell from seven to five. The residual private-memory increase remains unclassified and needs a longer/repeated investigation; renderer counters returning to baseline do not establish native-memory stability. Hidden-window frame collection was insufficient for an FPS conclusion. No application runtime change or new binary is implied by these test-tool additions.

The subsequent hour-long controlled run on the same machine and published ZIP completed **3616.9 seconds / 130 cycles**, with media position advancing 3617 seconds. Recovery from the controlled media error, 30 seconds paused, and a paused restart preserving all 500 items/index 1/position 5 passed. All observed original/restarted processes exited; executable/ASAR and recorded harness hashes matched. The 59,520,044-byte original PCM used 241 partial responses, at most 262,144 bytes each, with no invalid requests. The core suite ran after this measured session: **225/225 passed**, as did TypeScript, documentation, public-source and whitespace checks. Early attempts that stalled before the measured phase are excluded; the bounded-response fixture and original-error logging address those probe limitations without changing the app.

| Phase | Total private MiB | Main | Renderer | GPU | Renderer heap MiB |
| --- | ---: | ---: | ---: | ---: | ---: |
| Warm baseline, explicit GC | 446.0 | 96.4 | 78.4 | 202.5 | 7.4 |
| Navigation end, explicit GC | 641.6 | 99.2 | 244.6 | 274.1 | 8.0 |
| Recovery playing, no forced GC | 578.4 | 100.8 | 259.2 | 194.8 | 11.0 |
| Paused 30 seconds, no forced GC | 479.7 | 91.8 | 247.9 | 116.3 | 10.5 |
| New process paused, explicit GC | 397.7 | 104.8 | 55.9 | 178.3 | 5.8 |

This establishes the controlled functional run, **not a resolved memory issue**. At the navigation GC endpoints, nodes were 819 Ã¢â€ â€™ 814 and listeners 348 Ã¢â€ â€™ 348; main private memory stayed close to baseline, but renderer private memory increased substantially beyond its measured JS heap and remained elevated after recovery/pause. At that stage, native media allocations, process caches and debugger preservation had not been separated. [CDP documents network-payload buffers](https://chromedevtools.github.io/devtools-protocol/tot/Network/#method-enable); that is a measurement limitation, not proof they caused all the growth. No product optimisation is claimed from these observations.

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

| Control | Media advanced | Renderer OS private MiB, first Ã¢â€ â€™ last | Renderer private MiB, GC endpoints | Renderer heap MiB, GC endpoints |
| --- | ---: | ---: | ---: | ---: |
| Intercepted, connected | 600 s | 82.9 Ã¢â€ â€™ 108.3 | 82.9 Ã¢â€ â€™ 101.4 | 5.85 Ã¢â€ â€™ 6.16 |
| HTTP, connected | 601 s | 82.5 Ã¢â€ â€™ 106.0 | 82.5 Ã¢â€ â€™ 100.4 | 5.85 Ã¢â€ â€™ 6.16 |
| HTTP, disconnected | 601 s | 81.9 Ã¢â€ â€™ 85.9 | 81.9 Ã¢â€ â€™ 84.5 | 5.85 Ã¢â€ â€™ 6.92 |

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

| Format | Measured changes / playing seeks | Renderer private MiB, GC baseline Ã¢â€ â€™ end Ã¢â€ â€™ paused | JS heap MiB, GC baseline Ã¢â€ â€™ end |
| --- | ---: | ---: | ---: |
| PCM 48 kHz stereo | 30 / 10 | 84.0 Ã¢â€ â€™ 74.2 Ã¢â€ â€™ 70.8 | 6.60 Ã¢â€ â€™ 6.75 |
| WebM/Opus 48 kHz stereo | 30 / 10 | 80.3 Ã¢â€ â€™ 68.8 Ã¢â€ â€™ 65.9 | 6.61 Ã¢â€ â€™ 6.76 |

There were 33 distinct media URLs per arm, zero invalid range requests, no media interception, and no decoder errors during the verified changes. PCM served 149,206,356 prepared body bytes through 582 responses; Opus served 12,697,212 through 66 responses. The waveform/Opus files were 4,608,044 / 384,764 bytes respectively; Opus decoded to 23.88 seconds. DOM nodes were 818 Ã¢â€ â€™ 829 and listeners 355 Ã¢â€ â€™ 355 at switching GC endpoints in both arms. This short workload did not reproduce a progressive source-count-related renderer increase; retained JS heap rose about 0.15 MiB. It neither proves absence of leaks nor isolates all prior hour-long navigation growth.

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

[Android 1.3.0 is published as a public preview](https://github.com/salvo13200/RITVIO/releases/tag/android-v1.3.0) after the maintainer authorised the exact signed APK. The Windows 0.7.5 release preparation uses binaries from build 39403307392, whose source tree matches merged commit `66d94bf7af3371dcc3a0c3fae6458821e7aa1f22`. This increment adapts Android lyric sharing, queue and lyric reading to full-height task workspaces. Sharing keeps selection and preview as separate history entries; Back preserves the contiguous excerpt and frozen track. The shared desktop/Android canvas measures wrapped lyric and credit rows before centring a content-sized inner card in the unchanged 1080Ãƒâ€”1920 image. It never stretches the thumbnail behind the verses. Preview generation/export must not issue playback or queue commands.

Run `pnpm exec playwright test --config tests/config/playwright.listening-tools.config.ts --grep-invert 'capture:'` for behavioural coverage. Touch cases send actual Chromium CDP touch events: reorder upwards/downwards, hold at either edge without more movement, drop beyond the initially visible rows, cancel, ordinary row swiping and queue-revision interruption. The dragged grip must remain under the held finger while the list scrolls. Native commands preserve the current track/position, pause and duplicate occurrences. Raw CDP targeting waits for finite row-settle animations, like normal actionability checks; this is synthetic Chromium touch evidence, not a physical Android gesture result.

Queue dragging only starts on the handle. Text/artwork swipes keep native scrolling; tapping a grip or row menu offers labelled move/remove controls. The current item is pinned above the upcoming order and previously played items remain available separately. Edge scrolling advances on animation frames while a drag is held; the dragged row stays within its real peers so it cannot extend the list indefinitely at the last edge. Shuffle reordering preserves the previously played/current items. Unrelated snapshots cancel a drag when the queue revision or current item changes. Source-row transforms update without rerendering the whole list every frame. Normal/native Back, gesture cancellation and reduced motion remain separate checks.

Reader checks cover stored text-size/emphasis preferences, stable row heights across active-line changes, manual-scroll interruption and explicit follow recovery. Auto-follow scrolls the reader itself rather than an ancestor dialog. Plain lyrics retain text-size controls without invented timing. Loading/unavailable lyrics and gallery/export failures must stay recoverable.

The opt-in `capture:` case writes English demo screenshots and actual canvas exports under the ignored `.impeccable/review/android-listening-tools/` directory, which it creates in a clean checkout. Those are browser-rendered layouts with fixture bridge responses; they do not establish native system insets, TalkBack, OEM font scaling, Gallery permissions or playback continuity. Test the exact signed APK on the phone, particularly long-list drag/drop with one finger, edge holds, Android Back through sharing, large system fonts, save-to-Gallery feedback and continuous locked-screen audio. The Windows 0.7.5 candidate passed isolated packaged track/lyrics/ten-line exports, including the real cover proxy, without changing playback. Its release is separate from Android. The maintainer reported successful initial Android 1.3.0 trials on Motorola edge 60 neo / Android 16 on 20 October 2026: locked-screen listening, Wi-Fi/data handoff, skips/seeks and headphones/calls. This is a maintainer report, not instrumented evidence or comprehensive device acceptance; prolonged listening, accessibility and broader Bluetooth/device checks remain open.


## Autonomous iOS catalog candidate 0.5.1

The iOS catalog is an unreleased candidate on `codex/ios-5-catalog`, separate from Android/Windows and the temporary iOS 12 PC-assisted trial. It requires iOS 15 or later. Unified search returns songs, artist identities and albums through one bounded metadata operation; artist-scoped lists use provider IDs. Album entries retain unavailable positions and repeated occurrences. The 500-song native queue limit is disclosed before a larger collection is played. Metadata work yields to playback; an in-flight network operation can still wait for its existing socket timeout before cooperative cancellation completes.

Saved albums/artists use native library schema 2 in the existing `library-v1.json` path. Legacy schema 1 is upgraded in memory on read and written only by a successful mutation. Migration checks retain likes, recent listening, personal playlists and managed covers, including simulated write failure. Damaged or future documents remain untouched. Store resources contain public metadata only, never stream URLs/headers.

Run the following from a clean checkout with dependencies installed:

```sh
pnpm exec tsc --noEmit
pnpm exec tsx --test tests/ios-foundation.test.ts tests/ios-library.test.ts tests/ios-catalog.test.ts
python tests/ios_resolver_test.py
python tests/artist-search-resolver.py
pnpm exec playwright test --config tests/config/playwright.ios5.config.ts
```

The browser suite includes the catalog, existing player/queue and personal library. It checks saved resources, stale-response rejection, playback-priority waiting, bounded BUSY recovery, unavailable/repeated album entries, navigation without audio commands and compact large-text accessibility. Fixtures are diagnostic data and are not evidence of real-provider availability.

On macOS, `pnpm ios:build --smoke --skip-live` compiles unsigned device and simulator applications, exercises the real Swift store/migration and player, and runs WKWebView gestures on compact and large-text simulators. The XCTest catalog flow captures search, Album B, Artist discography and saved resources under `.local/ios/artifacts/`. `--skip-live` explicitly leaves real-provider acceptance open. Signing, sideloading and autonomous iPhone playback/background/network checks must be completed before public distribution; the iOS 12 PC-assisted test does not establish those results. No iOS release is published by these checks.


### Scoped iOS verification and evidence boundaries

The native build script also accepts `--listening-ui-only` or `--catalog-ui-only`, with `--smoke`; these options are mutually exclusive and cannot be combined with `--resolver-only`. The workflow exposes matching explicit inputs. Default verification still runs the complete UI suite. Focused reports and simulator entries retain `uiTestScope`, and a focused run must export the selected flow's expected capture to reject an empty test selection. Device/simulator compilation, resolver core and synthetic player/store checks remain enabled. A focused pass must never be described as a complete UI rerun.

On 27 October 2026, full run `40494299539` passed on compact and accessibility-large simulators before the final visual refinements. Full run `40527230828` subsequently passed both Catalog and both Library cases, but failed compact Listening's initial Settings/language setup; the large Listening case passed. Its overall result remains failure. Commit `625380c` changes only test readiness/tooling for focused Listening confirmation. Commit `44c515c` then changes production UI only in scoped catalog styles: Album Play's capsule and Search spacing, with a compact first-result geometry regression test. Focused Listening run `40534182170` passed on both simulator classes at `625380c`, including fresh device/simulator builds and synthetic player/store/resolver checks. Its exported manifests contain the expected Listening flow captures. Catalog run `40537852623` then passed the compact flow but failed the large-text initial queue-fixture readiness assertion before reaching Search. Its final screenshot shows the rendered empty Home, not an established catalog rendering defect; the preparation cause is still unproven. Its overall failure remains recorded. Commit `cae2578` changes only Debug test fixtures/diagnostics and XCTest readiness: PCM is filled in one allocation, setup stage is recorded, and the Catalog test allows up to 90 seconds for the original-media fixture. This does not alter Release playback. At that checkpoint fresh Catalog confirmation was still required; neither earlier failed run is converted to green.

Screenshots use synthetic diagnostic resources. Native synthetic audio, real-provider metadata on a Windows host, and actual autonomous iPhone streaming are different evidence. Physical iOS 15+ acceptance and provider streaming remain pending. Private illustrative artwork approved for design comparison is not imported into the runtime. The automatic Impeccable PLATES gate remains open for that artwork variation; human material approval is not a successful automatic gate.


Focused Catalog run `40541808071` at `cae2578` passed the complete large-text flow and its additional standard-text tall captures. Its compact case reached the saved Library, but the test's fixed60%-viewport reveal gesture oscillated past a tall album card and failed its full-containment assertion. The run remains overall failure. The latest test-only `d303e6a` instead drags by the measured overflow, bounded to the content viewport; its native confirmation was pending at that checkpoint; the final outcome is recorded below. Compact `44c515c` and large/standard `cae2578` passing Catalog cases have identical production UI source and can support a correction review with explicit per-capture origin; they must not be described as one successful full CI run.


Final focused Catalog run `40577150178` at `d303e6afa69e9f3928c759294d8029ba74e499c5` **passed** on both iPhone SE (3rd generation) and iPhone 17 Pro with accessibility-large text, also exporting three independent normal-text tall captures. The single-run matrix contains 15 unedited captures. Both unsigned device and simulator builds passed, as did native synthetic player/store migration and resolver core. This is `uiTestScope: catalog-only`; the separately successful Listening run and prior Library cases remain separate evidence, not a claimed all-UI rerun. The latest change after correction review is XCTest's measured-overflow reveal gesture, not production UI.

The independent correction verdict resolved Album Play's capsule and Search spacing; it retained `fix` solely for the unresolved automatic PLATES workflow. No further changes were requested on that original UI fix list. The CLI recorded `finish: fix` while PLATES and downstream formal phases stayed open; this is not whole-surface approval or completed automatic workflow. Provider acceptance remains `not-run`, physical acceptance `pending`. A private unsigned iOS 0.5.1 build 6 IPA was packaged from this exact run with SHA-256 `aab2c2eecc31386a0b74dabe8b1ed12a791fdc7f2c92a2e4a266b2cd00072324`, preserving original bundle bytes/permissions and validating arm64, minimum iOS 15 and the embedded runtime lock. It requires personal signing and is not a public release.


## iOS lyrics source candidate 0.6.0 build 7

The local `codex/ios-lyrics` increment extends the existing iPhone player with the approved A reading composition: compact track identity, fixed seek/transport and a text-only scrolling area. It supports synchronized or plain lyrics, manual scrolling with explicit follow recovery, local reading preferences and distinct missing/instrumental/rate-limit/error states. Metadata must match the title and credited or primary artist. Unknown duration or differences over two seconds produce plain text; differences over ten seconds are rejected. Equally plausible differing editions are not selected automatically.

Native CapacitorHttp is already bundled and performs these HTTPS LRCLIB requests separately from music resolution. There is one active lookup plus the latest waiting track. Cancelled consumers cannot publish obsolete data, though a started native HTTP request can finish under its configured connect/read timeouts. The RAM cache holds up to30 entries/1MB, with24-hour positive and2-minute missing-result expiry. Provider bodies are checked against2MB after native buffering; this is not a streaming native-memory cap. Existing shared lyric parsing and active-line timing are reused. No new account, API key or paid dependency is introduced.

```powershell
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit
$env:RITVIO_MOBILE_PLATFORM='ios'
pnpm --dir apps/mobile exec vite build
pnpm exec tsx --test tests/ios-lyrics.test.ts tests/ios-foundation.test.ts
pnpm exec playwright test --config tests/config/playwright.ios5.config.ts tests/ios-lyrics-ui.spec.ts
```

TypeScript and the final iOS-target web bundle passed locally;12 deterministic client/foundation cases and two browser fixture cases passed (15.2seconds for the latter). The browser flow covers manual/follow controls, appearance, track changes, plain/missing/instrumental/error states and 59pt synthetic side insets in landscape plus the tall/default gutter rule. Opening lyrics does not issue an audio/queue command. The independent review resolved its sole safe-area fix at browser/source scope. No native Simulator, device, live LRCLIB HTTP or new IPA result is inferred. The maintainer explicitly deferred native/physical testing until beta; signing, native HTTP behaviour, Dynamic Type/VoiceOver and locked-screen/network continuity remain acceptance work before distribution. No GitHub push or public release was performed for this local increment. Existing Android and desktop releases are unchanged.


## iOS image-sharing source candidate 0.7.0 build 8

This local increment adds song and lyric card sharing to the existing iOS player and reader. It uses the shared desktop/Android 1080x1920 PNG renderer. Selection and preview are separate; Back retains the range and list scroll. The first selected row stays anchored until Reset. At most ten consecutive original rows are accepted, without a character cap or whole-song export. The inner quote sizes itself to wrapped verses, with a square cover beside the credits below. Song and available lyrics are captured on opening; later playback snapshots cannot change the card. Sharing issues no transport or queue commands.

Artwork uses a separate ephemeral HTTPS request restricted to provider image hosts, without cookies, redirects or credentials. It is bounded to 2MiB while streaming and 12seconds, with bounded image decoding and a 1024px JPEG conversion that drops source metadata. An unavailable cover offers Retry or explicit RITVIO colors. Rendering uses an HTML image, a rounded-path fallback for iOS15 and sampled colors when canvas blur is unsupported. Existing modern desktop/Android renderer paths remain available.

The native bridge validates a single 1080x1920 PNG up to 8MiB and re-encodes pixels without source metadata. Save to Photos requests add-only access only after the explicit tap and reports success after the Photos write completes. Denial offers user-initiated Open Settings and retry; it requests no photo-library read access and opens no Files picker. Share opens UIActivityViewController with an app-owned temporary PNG. Cancellation and failure remain distinct; completion does not prove publication by a receiving app. At most eight owned temporary export folders are retained. These operations do not change the playback audio session or enter the music resolver.

```powershell
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit
$env:RITVIO_MOBILE_PLATFORM='ios'
pnpm --dir apps/mobile exec vite build
pnpm exec tsx --test tests/ios-foundation.test.ts tests/ios-lyrics.test.ts tests/story-sharing.test.ts
pnpm exec playwright test --config tests/config/playwright.ios-sharing.config.ts
```

TypeScript and the iOS-target web bundle passed locally. 17 deterministic cases passed, along with two existing reader browser cases and four sharing browser cases. These cover compact/large-text layouts, 59pt synthetic landscape side insets, contiguous selection and invalid extension, preserved Back state, frozen metadata, reader-document reuse, PNG dimensions, adaptive quote layout, delayed success acknowledgement, Photos denial, share cancellation and explicit cover fallback. Export checks remove roundRect/createImageBitmap to exercise compatibility. HTTPS responses and native outcomes are fixtures, not provider or OS evidence. Info.plist parses with an add-only Photos description and the project includes the new Swift source in App build sources; these checks do not compile Swift.

This is local source on codex/ios-sharing, not an IPA or published iOS release. The maintainer deferred native/simulator/device testing until beta. Before distribution, macOS compilation and an iOS15+ phone must establish real artwork/lyrics access, Photos permission and acknowledgement, activity-sheet handoff/cancellation, VoiceOver/Dynamic Type and continuous audio through sharing. Existing Android/Windows releases and the temporary PC-assisted iOS12 trial remain separate and unchanged.

The independent finish review requested one text-scaling correction in the new composer. Its verdict pass scored that finding resolved (`ship`) at source/browser scope; the documentation audit confirmed reuse of the incumbent system and preserved the known historical Android-document drift. Neither verdict establishes native or public-release readiness.


## iOS sleep-timer source candidate 0.8.0 build 9

The local timer increment extends the existing player with a clock action and an additional Settings entry. Choose 15/30/45/60 minutes or End of this song, inspect the native remaining time and cancel without starting music. End of song pauses the current occurrence before natural repeat/advance or a manual skip/jump/new-queue boundary. A duration timer survives ordinary track changes and continues counting while playback is paused. Closing its sheet does not cancel it. It is session-only and is not restored after process termination.

`NativePlaybackOwner` owns the policy, ticking and pause intent. Expiry is checked before resume, descriptor installation, seek reconciliation, interruption recovery and foreground refresh. Pending resolution generations are invalidated when stopping a loading item; a late result must not restart playback. The native getter/setter/event are separate from transport commands. Mutations require the current revision, modes/presets are bounded, and the client rejects older revisions and time samples. A completed native response is required before showing the new active state. Inline feedback keeps timer controls visible; long content scrolls below the fixed Done header.

The deadline uses [`mach_continuous_time`](https://developer.apple.com/documentation/kernel/1646199-mach_continuous_time), which advances during system sleep and avoids civil-clock adjustments. A native dispatch source polls while the process runs; this is not a claim that iOS wakes a suspended process or provides an exact real-time alarm. Foreground and playback-intent checks enforce an overdue timer on return. The existing SystemBootTime/35F9.1 privacy declaration covers the app's elapsed-interval use. No notification permission, additional background entitlement, paid service or server is added.

```powershell
pnpm exec tsc --noEmit
$env:RITVIO_MOBILE_PLATFORM='ios'
pnpm --dir apps/mobile exec vite build
pnpm exec tsx --test tests/ios-sleep-timer.test.ts tests/ios-foundation.test.ts
pnpm exec playwright test --config tests/config/playwright.ios-timer.config.ts
```

Eight local model/foundation cases and three browser cases passed. Browser checks cover delayed acknowledgement, native countdown presentation, closing/reopening/focus, cancelling, end mode, expiry feedback, failed mutation recovery, older-event rejection, Settings entry, 375x667/402x874 large-text layouts and 59pt synthetic landscape side insets. They assert no transport/queue calls from timer UI actions. Outcomes are native bridge fixtures; they do not execute Swift or prove real audio expiry. The App project lists the new Swift source and the privacy plist parses with its existing elapsed-time reason.

`PlaybackSelfTest` now includes native policy checks with an injected continuous clock plus synthetic AVPlayer cases for elapsed time during pause, stopping playback, interruption/repeat precedence, manual boundaries, stale mutations and cancelled pending resolution. These native additions are written but have not been compiled or executed on this Windows host. As agreed, macOS compilation, actual locked-screen/background timing, calls/headphones, VoiceOver/Dynamic Type and iOS15+ phone acceptance remain beta work. This source-only increment stays on codex/ios-sleep-timer; no IPA, push or release is produced. Radio/autoplay, playlist document transfer and support/update adaptation remain later IOS-5 work.

The independent Impeccable finish review returned `ship` with no material findings at this local source/browser scope. It does not certify native background execution or supersede the beta acceptance work above.


## iOS song-radio and autoplay source candidate 0.9.0 build 10

Start song radio from a song's menu. Its frozen seed, preparation state and queue-replacement disclosure are separate from playback controls. A successful radio replaces the queue with its seed and up to 20 deduplicated suggestions, enables Autoplay and turns repeat/shuffle off. The current song can retain its installed player item and position when it is the seed. Music keeps playing while metadata is prepared; closing cancels a still-pending preparation. Failures and stale responses leave the existing queue usable.

Autoplay is off by default and its explicit preference is stored locally. It requests up to 8 suggestions when at most two songs remain, after a four-second settling interval, with one active metadata operation and one attempt per tail seed. Timer and repeat suspend extension. Manual queue/transport changes invalidate pending results; natural progress can accept a result for the unchanged queue session. Disabling Autoplay removes only unplayed automatic occurrences, preserving current, previously played and manually added entries. Suggested rows retain occurrence identity through reordering/removal. The native 500-song bound is disclosed when full; this increment does not prune a manual queue or claim unlimited continuation.

The existing single resolver worker gives manual stream resolution priority over metadata. Radio uses a 15-second cooperative budget and the existing 8-second request timeout; cancellation can wait for a started network call to return. The authoritative shared radio adapter returns at most 51 metadata candidates. iOS admits only the seed ID, strips descriptor/header fields, caches at most 8 batches for 10 minutes (empty results 2 minutes) and observes the shared provider cooldown. Native failures additionally enforce a 30-second retry gate; there is no tight provider retry loop or resolution of every suggested stream. Provider recommendations determine variety; this is not a new personal genre model.

Playback persistence remains schema 1 with backward-compatible optional automatic-occurrence indices and radio-origin metadata. Missing fields decode as legacy manual entries; invalid indices/duplicates or invalid origin fail validation. Signed URLs and stream headers are excluded. Enabling Autoplay or restoring its setting never starts playback by itself. Native ownership covers continuation, queue changes and timer precedence; React only requests explicit discovery actions and presents state.

```powershell
pnpm exec tsc --noEmit
$env:RITVIO_MOBILE_PLATFORM='ios'
pnpm --dir apps/mobile exec vite build
python tests/ios_resolver_test.py
pnpm exec tsx --test tests/ios-discovery.test.ts tests/ios-foundation.test.ts
pnpm exec playwright test --config tests/config/playwright.ios-discovery.config.ts
```

23 Python host-policy tests and 7 TypeScript model/foundation cases passed. Four browser cases passed across compact 375x667 and 1.6-scale 402x874 layouts, radio preparation/acknowledgement, native cancellation/failure fixtures, queue protection, timer/repeat suspension, Suggested labels, disabling future suggestions, real pointer-handle reordering and 59pt synthetic landscape insets. Queue reorder feedback is inline rather than a floating message over controls. These are fixture/source checks, not provider or iPhone evidence. The native self-test source now covers edition/ID deduplication, occurrence remapping, legacy-state decoding, obsolete-radio rejection after pause, protecting manual/current entries, timer/repeat suspension and retry gates; those additions have not been compiled or run on Windows.

This remains local source on codex/ios-radio-autoplay. Native macOS compilation, actual provider access, automatic continuation across locked-screen/background changes, iOS15+ rendering, interruptions and VoiceOver remain beta acceptance work, as agreed. No IPA, push or publication is performed. Playlist document transfer and support/update adaptation remain later IOS-5 work; this block does not complete the full iOS plan.

The independent Impeccable finish review returned `ship` without material findings for this local source/browser increment. This does not certify Swift compilation or native/provider acceptance.


## iOS playlist files and support source candidate 0.10.0 build 11

Library > Import playlist file uses the native JSON picker, then previews the validated document before any library mutation. Select occurrences, skip duplicates if desired and choose a new playlist name. Import always creates a new playlist, without overwriting existing collections. At most 1,000 source rows can be previewed, with a maximum of 500 imported songs and 100 personal playlists on iOS. Limits are disclosed, a first-500 selection is available and the Import action remains below the scrolling list. A failed write preserves existing library bytes and removes only the newly created managed cover. Completion requires a successful native acknowledgement.

Personal playlist menus export the shared `ritvio-playlist` version 1 `.ritvio.json` format used on Android and Windows. Native code reads the authoritative playlist at its captured revision; a changed/missing playlist requires reopening export. Order and duplicate occurrences are retained. Portable files contain names, description, song IDs/title/artist/duration and an optional inline cover, without audio, signed media descriptors, accounts or private paths. Extreme metadata is bounded with an adjustment notice. Cover pixels are resized/re-encoded as JPEG, removing embedded metadata. Save to Files and Share file use native system choosers with separate success/cancellation outcomes.

Documents are bounded to 4 MiB and portable covers to 196,608 encoded characters. Images are dimension-checked before downsampling. The native import picker uses [Apple's asCopy initializer](https://developer.apple.com/documentation/uikit/uidocumentpickerviewcontroller/init%28foropeningcontenttypes%3Aascopy%3A%29), coordinated reading and balanced security-scoped access, then admits only the validated document through an opaque token. One preview is retained at most; eligibility expires after ten minutes and allows one successful import. Export accepts a playlist ID/revision rather than an arbitrary path. Output is restricted to app-owned temporary UUID directories, retaining at most eight documents. These flows add no audio/session commands.

Settings > Help & feedback prepares a report only after View report is pressed. Inspect the exact frozen text before Copy or Share. It includes app/build/iOS versions, six feature flags and three whitelisted error codes. Unknown error text becomes OTHER; titles, artists, playlist names, history, device IDs, paths, accounts and URLs are excluded. Report eligibility expires after ten minutes. Nothing is uploaded or sent automatically. Separate explicit links open the fixed GitHub issue chooser or project releases page. This is a manual releases link, not an update checker/installer; iOS updates still require a newly signed IPA.

```powershell
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit
$env:RITVIO_MOBILE_PLATFORM='ios'
pnpm --dir apps/mobile exec vite build
pnpm exec tsx --test tests/ios-documents.test.ts
pnpm exec playwright test --config tests/config/playwright.ios-documents.config.ts
```

TypeScript, the iOS-target web bundle, three deterministic model cases and five browser cases passed locally. Checks cover occurrence order/duplicates, malformed/oversized preview and report validation, report field allowlists, compact 375x667 and 1.6-scale 402x874 layouts, picker cancellation/error fixtures, the 500-song limit, delayed import/copy acknowledgement, failed write and expired preview, personal playlist export, share cancellation, explicit report preparation and 59pt synthetic landscape insets. They assert no transport/queue/timer/discovery mutation calls from document/help UI actions. Browser outcomes are bridge fixtures, not Files, activity-sheet or clipboard evidence. Xcode source/build references were counted statically; this does not compile Swift.

LibrarySelfTest now includes native source checks for portable round-trip order/duplicates, strict version/extra-field rejection, invalid/empty selection, removal of cover metadata, failed-import rollback without leftover new cover, single-use tokens and frozen report text. Those additions have not been compiled or run on Windows. Before beta distribution, macOS compilation and an iOS15+ phone must verify Files/iCloud provider access, security scope, destination save/cancel, activity-sheet acknowledgement, clipboard writing, actual Android/Windows interoperability in both directions, VoiceOver/Dynamic Type/keyboard behavior and continuous playback. The maintainer deferred these native checks until beta.

This is local source on codex/ios-transfer-support; no IPA, push or release is produced. Public Android/Windows builds and the temporary iOS12 PC-assisted trial remain separate. This does not add cloud sync, public playlist URL import, automatic update installation or complete the full native beta acceptance plan.

The independent finish review's pagination finding is resolved: Show more reveals rows without changing selection, while the separate Select all action selects every occurrence. Its scored-fix verdict is `ship` only within local source/browser scope. The documentation audit verified all 24 packet source hashes, all 16 browser-preview capture hashes and the three approved private reference-image sidecars, and confirmed reuse of the incumbent iOS system. No detector ran (iOS); native compilation and device acceptance remain deferred to beta. Historical Android design-document drift and the unrelated older CatalogPLATES gate remain untouched.


## Consolidated iOS beta packaging

The packaging implementation originally developed for IOS-6 has been integrated with the full 0.10.0 build 11 source. The app version is unchanged by packaging. `ios:candidate:prepare` requires a clean committed checkout, checks source policy and app/Xcode versions, creates a corresponding-source ZIP from that commit and records canonical source hashes, beta scope and deferred acceptance. Preparation creates no IPA and runs no phone checks. The native builder now records its actual source commit/tree and dirty state; the packager rejects stale versions, missing/different provenance, uncommitted inputs and a run from another source. A supplied source ZIP must contain exactly the frozen Git export, with no changed/extra/missing files. Host automatic EOL conversion is disabled for export; explicit Git attributes are retained.

```sh
pnpm exec tsx --test tests/ios-candidate.test.ts
python3 tests/ios_package_test.py
pnpm exec tsc --noEmit
pnpm check:docs
pnpm release:check
pnpm ios:prepare
# After committing all source changes:
pnpm ios:candidate:prepare
```

On Windows replace python3 with `.venv/Scripts/python.exe`. Three source-preparation cases and 15 container/provenance cases passed locally. These use synthetic native files and isolated temporary Git repositories, not a new iPhoneOS build. They cover deterministic/idempotent preparation, dirty-source refusal, normalized EOL handling, stale/mismatched source/report/run/version rejection, matching corresponding source, native Mach-O platform/architecture/minimum/encryption checks, strict ZIP containment, runtime inventory, existing-output preservation and partial-write recovery. TypeScript, documentation and public-source scans passed. Windows `ios:prepare` rebuilt/synced bundled web resources and verified the pinned Python/QuickJS/wheel downloads; it explicitly reports nativeBuild false.

The macOS workflow will run the expanded iOS model suite and packaging checks and upload frozen source separately from its native artifacts. Wiring a check into a workflow does not prove it has run remotely. The beta manifest preserves failed/not-run provider/UI/device outcomes and keeps publicReleaseReady false. Physical iPhone acceptance is deferred until after the candidate/source are on GitHub, as the maintainer requested. A stable iOS release still requires the deferred acceptance. No new runtime UI, player policy, platform version, signing identity, public download link or stable Android/Windows binary changes in this packaging increment.


### Native consolidation findings and build 12 queue correction

Native run 40757742905 for source 2c27b5d4032c9f9bd9b4dd08313f37cf012542d2 compiled the 0.10.0 build 11 Release iPhoneOS arm64 app and arm64/x86_64 simulator app. Embedded resolver core, synthetic AVPlayer and native library/interchange/radio policy self-checks passed. Live provider was explicitly not run. The overall run failed the Listening UI scenario: compact drag did not reach the expected occurrence, and the large-text harness expected an offscreen handle to be hittable. That failed UI result is retained in the native report; compilation success does not close it.

The queue now waits for actual pointer movement before edge autoscroll, scrolls only toward the edge being dragged into and computes the drop target from the release position. The native harness reveals a handle inside the scrolling list rather than swiping the fixed Autoplay panel, then exercises a top-edge drag/hold for a target outside a short viewport. The candidate build number advances to 12 for this runtime correction, retaining version 0.10.0. Three new browser cases passed at 375x667 and 402x874 with 2.14 text scale, including stationary hold, edge autoscroll, actual Next occurrence and pointer-up without an intermediate move. They are synthesized Chromium mouse/pointer evidence, not physical multitouch or native proof. The expanded combined iOS browser suite includes these cases. Native build 12 confirmation remains a separate check; iPhone acceptance remains scheduled after GitHub upload.

Run 40765377423 compiled build 12 and passed its native player/resolver self-checks and the compact Listening scenario. The large-text Listening scenario failed before reordering: the reveal helper repeatedly started a pan next to the hint's accessibility frame, whose bounds exclude the CSS padding above the actual list. Its failure capture shows Night swim clipped at the top. The helper now starts inside the middle of the list and sizes each pan toward the target's centre; production UI and app build number are unchanged by that harness correction. Its next native result remains to be recorded in the candidate's authentic run report, including any remaining failure. This is not physical-device acceptance.

Run 40769741051 again compiled build 12 and passed compact Listening plus the player/resolver checks. The large-text helper logs now prove overshoot: the grip alternated between y=552 and y=334 around a y=341...514 viewport, so the reorder assertion was never reached there. The reveal pan now uses slow velocity and holds stationary before release to avoid flick inertia. This changes test input only; no successful large-text result is inferred before rerunning it.

### Build 13: complete queue release and settings reachability

Run 40776441950 compiled build 12 and passed player/resolver self-checks, but failed Listening. The compact capture still showed a lifted row and disabled queue actions after the native gesture returned; closing Queue then pressing Next played Slow motion. A visual order predicate alone had accepted an unfinished drag. On the large-text simulator the queue and actual Next assertions passed, but the motion switch was below the visible settings area when the harness tried to tap it. Neither result is presented as a green UI run.

Build 13 observes terminal pointer events at document capture as well as on the grip, with a legacy touch-end/cancel fallback bound to the touch that started the drag. The drag ref is cleared before any asynchronous command, so duplicate terminal events cannot apply a second move. Another pointer cannot replace the active drag. Cancellation and queue-revision guards remain intact. This is a runtime interaction fix with no layout/style changes. The native test now requires queue actions to become enabled before checking order, then still verifies the actual Next song. Settings controls are revealed within the body below its fixed header using bounded slow pans before tapping them.

Six targeted browser cases passed: stationary hold and edge reorder/Next at compact and large-text sizes, final-position handling, document-level release without a grip event, and matching legacy touch release/cancellation with unrelated touches ignored and exactly one/zero move commands. Initial new assertions incorrectly expected a fixed item index after the native-style fixture remapped occurrences; these were corrected to check song identity rather than storage indices. These browser checks do not establish native WebKit gesture completion. Build 13 native confirmation and provider/device acceptance remain separate; physical iPhone tests are scheduled after GitHub upload.
