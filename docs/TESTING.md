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
