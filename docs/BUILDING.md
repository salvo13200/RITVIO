# Build RITVIO from source

The download packages include their runtime. These requirements are for developers only. No API key, RITVIO account or paid build service is required. Windows is the supported packaging host for both platforms in the supplied scripts; Linux/macOS packaging is not claimed tested.

## Local download page

The static page reuses the existing Vite/TypeScript installation and approved English media; no new dependency, Android SDK, Python environment, backend or account is needed for this page. After the normal JavaScript dependency installation:

```powershell
pnpm downloads:check
pnpm site:build
pnpm site:preview
```

Open `http://127.0.0.1:5180/`; `http://127.0.0.1:5180/RITVIO/` checks the project-subpath layout with the same built files. Stop the preview with Ctrl+C. `pnpm site:dev` runs the editable Vite preview instead. The complete static output is `dist/site/`. These commands do not publish or register a website. See [publication and snapshot maintenance](PUBLISHING.md#download-page-and-release-links).

## Toolchain

- Windows 10/11 x64, Git, Node.js 24 or later, **pnpm 11.25.0** (the packageManager field pins it).
- Python **3.13**, installed with its `python` executable on PATH. Windows packages embed Python 3.13.16; Android uses Chaquopy Python 3.13. Keep Python 3.13 for the build host too.
- Android only: JDK 21, Android SDK platform 36, build-tools 36.0.0, platform-tools and Gradle 8.14.3 via the committed wrapper. `pnpm android:setup` downloads the pinned JDK and SDK tools into the ignored `.packaging/android-tools` directory, with download checksums. Alternatively set `JAVA_HOME`, `ANDROID_HOME` and `RITVIO_BUILD_PYTHON` explicitly.
- Internet access for package registries, Gradle/SDK/runtime downloads and live provider testing. All application Python requirements and direct JavaScript dependencies are pinned. Native Gradle transitive resolution is not fully locked: bit-for-bit reproducible binaries are not claimed.

Install pnpm separately using its official installation instructions if it is unavailable. The PowerShell wrapper can use an installed pnpm; its optional local Codex fallback is **not required** by the source build.

```powershell
pnpm install --frozen-lockfile
pnpm setup:resolver
pnpm dev
```

Optional settings are documented in `.env.example`. Defaults work without copying it. The app starts a loopback-only Fastify/SQLite service on desktop; no PostgreSQL server or Google login setup is needed.

## Verification

```powershell
pnpm check:locales
pnpm i18n:check
pnpm check:architecture
pnpm check:assets
pnpm exec tsx --test --test-concurrency=2 tests/*.test.ts
.\.venv\Scripts\python.exe tests/home-catalog.test.py
.\.venv\Scripts\python.exe tests/radio-catalog.test.py
pnpm build
pnpm --dir apps/mobile build
pnpm exec playwright install msedge
pnpm exec playwright test --config tests/config/playwright.localization.config.ts
pnpm exec playwright test --config tests/config/playwright.home.config.ts
```

Browser tests use controlled fixtures and do not establish live audio availability, native rendering or background playback. Committed image inputs live in `tests/fixtures/artwork/`; generated screenshots and records live in ignored `test-results/`. No private design folder is needed. See [the testing guide](TESTING.md) for targeted suites and optional platform probes. Run browser tests and Android Gradle builds separately on low-memory PCs.

## Windows binaries

```powershell
pnpm licenses:collect
pnpm package:windows
```

This builds the frontend/API, includes a separate Python runtime and production Node dependencies, and creates the self-extracting portable EXE, per-user NSIS installer EXE and extract-once portable ZIP in `release/`, each with a `.sha256` sidecar. Use `pnpm package:windows --zip-only` to build only the ZIP candidate. Packaging stages dependencies in an isolated pnpm project to avoid pulling Android development modules into the installer. Signing is not configured for Authenticode; SmartScreen warnings may appear.

For the ZIP, extract the **entire archive** into a folder and start its `RITVIO.exe`. Keep the adjacent `resources`, runtime and other files together. Unlike the self-extracting EXE, subsequent launches do not unpack the whole application again. Both formats use the existing Windows user-data directory; the ZIP is an installation-free application folder, not a separate profile on a USB drive. Close RITVIO before extracting an update into a new folder; personal library data stay outside that folder. Building a candidate does not publish it or change existing GitHub downloads.

The installer lifecycle test refuses existing RITVIO installations/open apps and does not terminate the user's player. Read `tests/installer-lifecycle.mjs` before running `pnpm test:installer` on an appropriate clean Windows environment.

## Android APK

```powershell
pnpm android:setup
$env:RITVIO_BUILD_PYTHON = (Get-Command python).Source
pnpm android:build --with-tests
.\scripts\gradle-android.ps1 -Task @(':app:testReleaseUnitTest')
python scripts/check-android-apk.py release/RITVIO-Android-1.2.0.apk
```

First local builds generate a private keystore and random password in `.local/android-signing`. Back both up privately. The key is never public source. Official updates require the **existing official key**; a fork's freshly generated key cannot update the official installed app. The release workflow refuses missing official signing secrets instead of silently creating another key. For an independently branded fork, change the application ID and signing identity.

The three shared Python catalogue modules are copied from canonical `scripts/` sources before Gradle runs. Do not edit their generated Android copies. Native localisation is generated by `pnpm i18n:sync`; verify it with `pnpm i18n:check`. For Android Studio, run the JavaScript build/Capacitor sync and generate/copy these sources through `android:build` first.

## iOS embedded resolver (technical build)

The unreleased iOS candidate has an independent version in `apps/mobile/ios-version.json` (currently 0.10.0 build 12, iOS 15+). Source now includes Home/Search/Library, fixed player and queue, native AVPlayer and embedded resolver, personal playlist photos/history, album/artist pages, lyrics and song/lyric image cards, sleep timer, radio/Autoplay, portable playlist files and reviewed Help reports. The candidate scope is maintained in `scripts/ios-candidate-scope.json`. Native and real-provider acceptance are separate from the source/browser checks recorded in TESTING.md. Android and Windows retain their existing release channels.

On Windows, prepare the bundled assets and sync only the iOS project:

```powershell
pnpm install --frozen-lockfile
py -3.13 -m venv .venv
pnpm ios:prepare
pnpm exec tsx --test tests/ios-foundation.test.ts
.venv/Scripts/python.exe tests/ios_resolver_test.py
```

For native compilation use macOS with Xcode 26 or newer and an installed iPhone simulator runtime:

```sh
pnpm install --frozen-lockfile
pnpm ios:build --smoke
```

Python 3.10 or newer is also required on the build computer. Preparation downloads only the pinned support archive, QuickJS source and pure-Python wheels listed in `third-party/ios/runtime-lock.json`; every download is checked by SHA-256. Windows prepares the web/resources and pure packages; Xcode compilation and native framework extraction run on macOS. No Python installation or external process is needed on the phone. The Android adapter remains the authoritative shared metadata/descriptor source; its copied iOS build output is generated and ignored.

The command builds an unsigned arm64 device app and the simulator app, runs native UI/gesture/language tests, then runs embedded resolver checks inside the app on available iPhone simulators. AVPlayer checks use an original generated AAC tone and synthetic HTTP range responses: superseded resolutions, pause/seek intent, queue/repeat, source refresh, rate limits and restoration. IOS-4 UI tests use an explicit Debug-only launch fixture through the real native queue/AVPlayer, with original diagnostic covers; Release builds cannot activate it. They exercise reorder-to-next, paused seeking, fixed player layout, search recovery and language persistence on compact/large-text simulators. This proves neither provider transport nor audible speaker output. By default the first simulator also attempts real searches, repeated stream resolution and bounded first/middle byte-range probes; provider failures fail this check. `pnpm ios:build --smoke --skip-live` explicitly excludes provider requests and records `liveProvider: not-run`; it does not close live acceptance. Output is under `.local/ios/artifacts/`: separate simulator/device ZIPs, SHA-256 sidecars, native screenshots, redacted resolver/playback evidence and a report. The device ZIP is a technical build for later personal signing, not a directly installable IPA or a release-ready listening app. Physical installation, free-profile renewal, background audio and hardware tests remain separate gates.

`pnpm ios:build --simulator` and `pnpm ios:build --device` select a single build destination. The default Capacitor configuration remains Android. The iOS builder sets `RITVIO_MOBILE_PLATFORM=ios` and uses `ios-web-dist`; running an unqualified mobile build still uses `web-dist`. Do not point the packaged iOS app at a development server.

The `iOS native verification` workflow uses a standard macOS runner, with read-only repository permissions and no Apple account/signing secrets. Matching iOS work-branch pushes run independent native/UI/player checks with provider requests excluded. Manual dispatch can additionally enable `live_provider`; a provider rejection then fails the run. This distinction permits development while live iOS acceptance remains open; a green core run does not mean provider streaming works. The workflow uploads short-lived technical artifacts and does not create a release, merge a branch or change public download links. Apple keys, provisioning profiles, pairing data, generated icons, copied web assets, `Runtime/` dependencies and Xcode build output must remain outside public source.

### Prepare the consolidated iOS beta candidate

Work from a clean committed Git checkout. This preparation runs on Windows or macOS and does not sign, install, upload or publish an app:

```sh
pnpm ios:candidate:prepare
```

It checks the independent app/Xcode identity and public-source policy, freezes the source commit/tree, and writes `.local/ios/prepared/vVERSION-bBUILD-COMMIT/`. This folder contains `plan.json`, the versioned corresponding-source ZIP, `SOURCE-MANIFEST.json` and `candidate-notes.json`. The manifest hashes canonical Git blobs; ZIP export honors tracked Git attributes with automatic host EOL conversion disabled. Native build is recorded as not run, and no IPA is fabricated from the former 0.5.0 bundle. Repeating preparation with the same inputs is idempotent; different existing output is preserved and rejected.

The native build report now includes its actual Git commit/tree and dirty flag. Development builds may be dirty, but candidate packaging refuses them. The existing macOS workflow prepares the frozen source and uploads it as a separate `RITVIO-iOS-source-COMMIT` artifact, retaining the existing native archive artifact layout. It does not make a GitHub Release.

After a native run has completed, use a checkout of that exact commit and download its native artifact. Export the actual completed run metadata with GitHub CLI; replace `RUN_ID` with the real numeric Actions run ID:

```sh
gh run view RUN_ID --repo salvo13200/RITVIO --json databaseId,headSha,status,conclusion,url > .local/ios/run-metadata.json
python3 scripts/package-ios-candidate.py --artifacts NATIVE_ARTIFACT_DIRECTORY --run-metadata .local/ios/run-metadata.json --source-archive PREPARED_DIRECTORY/RITVIO-iOS-0.10.0-source.zip --notes PREPARED_DIRECTORY/candidate-notes.json --output .local/ios/candidates
```

On Windows use `.venv/Scripts/python.exe` in place of `python3`. Keep downloaded run metadata outside the source checkout or under ignored `.local/`, so it does not invalidate the clean-source check. Run metadata must be the actual completed GitHub record, not a hand-written success claim. Native outcome checks are carried forward even when they remain failed or not run. Never combine a prior device archive with a newer source tag.

Packaging verifies the report/source/build identity, the exact archive checksum, Release iPhoneOS arm64 load commands and minimum OS for every bundled binary, runtime lock/source hashes, matching corresponding-source contents, and preservation of all app bytes/permissions inside `Payload/`. It produces a `-beta.ipa`, `candidate.json`, dependency inventory, corresponding source, checksums, notices and English `INSTALL.md`. It needs no Apple password, certificate or provisioning profile. This is an unsigned beta for personal signing; `publicReleaseReady` remains false and does not certify a stable release. Read [Sideloadly's official setup and renewal FAQ](https://sideloadly.io/faq.html) before installation.

The maintainer intentionally schedules physical iPhone acceptance after the beta/source are uploaded to GitHub. That timing does not mark device checks passed. A stable iOS release still requires the separately recorded native/provider/device acceptance.

## Source and notices for redistribution

```powershell
pnpm licenses:collect
pnpm release:check
pnpm release:source
node scripts/archive-resolver-sources.mjs
node scripts/release-manifest.mjs
```

The final manifest step requires freshly built EXEs, APK/signature evidence, and both source archives. The public source export contains build scripts, tests, lockfile, localisations, font licences and curated upstream notices. Private keys, profiles, downloaded comparison APKs, historical working mockups and design skills are excluded. The upstream archive contains the exact pinned Python resolver source distributions verified against PyPI's SHA-256 metadata. Publish both source archives with corresponding binaries. See [publication](PUBLISHING.md).
