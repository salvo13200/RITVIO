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

## Source and notices for redistribution

```powershell
pnpm licenses:collect
pnpm release:check
pnpm release:source
node scripts/archive-resolver-sources.mjs
node scripts/release-manifest.mjs
```

The final manifest step requires freshly built EXEs, APK/signature evidence, and both source archives. The public source export contains build scripts, tests, lockfile, localisations, font licences and curated upstream notices. Private keys, profiles, downloaded comparison APKs, historical working mockups and design skills are excluded. The upstream archive contains the exact pinned Python resolver source distributions verified against PyPI's SHA-256 metadata. Publish both source archives with corresponding binaries. See [publication](PUBLISHING.md).

## iOS beta source

The iOS beta is versioned independently and its exact source is tagged separately. See the [iOS guide](IOS.md#source-and-feedback) for the release, corresponding-source archive and macOS/Xcode build instructions. The existing commands in this guide describe Windows and Android unless a platform is named explicitly.
