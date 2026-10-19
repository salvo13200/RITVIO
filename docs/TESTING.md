# Testing from a clean checkout

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
