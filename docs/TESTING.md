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

## Android 1.2.0 playback candidate

This candidate changes the native Android playback pipeline. Windows playback is unchanged. The public Android release remains 1.1.1 until the candidate passes a phone trial.

Media3 1.11.1 defaults to 1000 ms of startup buffer, 2000 ms after rebuffering, no retained back buffer and disabled playlist preloading. The candidate uses 500/1000 ms startup/rebuffer targets, 15–50 seconds forward buffering, 60 seconds of played audio retained in RAM, an 8 MiB allocator target and native preloading of the next five seconds after playback settles for at least 1.5 seconds. These are policy targets, not measured startup guarantees or a hard total-process memory cap. No disk audio cache or offline feature is added. Preloading is disabled while paused, sleeping, repeating one track or under the resolver cooldown; Media3 also yields to the current item's loading. This can fetch a short portion of a next track that is subsequently skipped.

References: [pinned load-control defaults](https://github.com/androidx/media/blob/1.11.1/libraries/exoplayer/src/main/java/androidx/media3/exoplayer/DefaultLoadControl.java), [native playlist preloading](https://developer.android.com/blog/posts/elevating-media-playback-introducing-preloading-with-media3-part-1).

The descriptor resolver coalesces requests for the same video through one interactive and one speculative lane (at most two active resolutions). An interactive request can promote an already queued preload. Existing expiry checks, bounded descriptor cache, media-host validation and rate-limit backoff remain active. Generations prevent an old preload from overwriting a retried descriptor. Pure JVM tests use latches to prove that an unrelated foreground lookup can complete while background work is held, that promotion works and that concurrent consumers do not duplicate resolution. Those tests establish scheduling behaviour, not real-provider or phone speed. Playback-state writes are coalesced and flushed on service shutdown. Native playback/readiness/seek events also update the visible interface immediately; the 500 ms position poll is retained, so the loading icon no longer relies solely on its next tick. Physical-device delivery latency still needs measurement.

On the phone, compare the released 1.1.1 and candidate with the same network and recordings: cold first track, next after 10 seconds, several rapid skips, forward seek inside/outside buffered audio, backwards within played audio, paused seek/resume, shuffle, repeat, timer and lock-screen controls. Watch for new buffering/errors, memory pressure and battery/data use. Do not record a percentage improvement until actual comparable device timings exist.

In candidate Settings, **Copy playback diagnostics** copies only aggregate resolver counters, buffer policy and up to 20 recent interaction timing records; it does not export song IDs/titles, stream URLs, headers or persistent history. `readyMs` means player readiness and `audioPositionAdvancingMs` means an Android audio-position callback, not an independently measured audible output time. A buffered-seek hint is not proof of a cache hit. Interrupted or superseded actions are labelled; missing audio events remain unmeasured and expire rather than appearing as zero latency. Nothing is uploaded automatically.
