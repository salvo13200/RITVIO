# Public preview candidate

Windows **0.7.2** (portable EXE and per-user installer), Android **1.0.4 / versionCode 15** (API24+, ARM64/x86_64). This increment packages GPLv3 and upstream notices and prepares public source/build workflows. It preserves the current interface and playback implementation. Previous localisation candidates were Windows 0.7.1 / Android 1.0.3.

## Included

- English and Italian, persistent language preference, international discovery without an Italy-first default.
- Provider attribution in Settings; neutral primary collection labels.
- Local library, search, queue, playback, lyrics and share-image features from the existing candidates.
- GPL-3.0-only for original code, reproduced third-party notices, public source filtering and checksums.
- GitHub issue/PR templates, CI/build workflow, owner-only merge ruleset templates and optional GitHub funding configuration.

## Known limits and verification boundaries

- The newest APK still requires installed-device checks for rendering, back/scroll behaviour, locked-screen playback, audio focus and Gallery export. Browser and JVM tests cannot close these gates. The reference phone is Motorola Edge 60 Neo with Android 16.
- Lyrics availability and catalogue/stream resolution depend on external services. Unofficial resolvers may stop working or return rate limits. Retry with backoff rather than rapid repeated skips.
- Windows executables are not Authenticode-signed. There is no automatic update service. Local library data is not synchronised online.
- GitHub workflows, repository protections and downloads are not live until the repository is created and configured. Donation recipients have not been supplied; no active payment destination is included yet.
- Native Gradle transitive dependencies are not fully locked; byte-for-byte reproducibility is not promised.

Publish this as a **prerelease** while native checks remain open. Do not present version numbering as evidence of production certification. Record actual test results for these exact artefacts in the release description; older candidate tests are not a substitute.
