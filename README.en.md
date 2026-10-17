# RITVIO

A free, open-source music player for **Windows and Android**. Local libraries, global discovery and separate interfaces designed for each platform. English and Italian are available; Spanish, French and German are planned.

**Public preview candidates: Windows 0.7.2 · Android 1.0.4.** These are candidates, not a claim of completed native-device validation. Published binaries are distributed through [GitHub Releases](https://github.com/salvo13200/RITVIO/releases). Listeners do not need Node.js, Python, an API key or a RITVIO account.

## What it does

- Search tracks, artists and albums, browse global hits and new releases.
- Keep liked tracks, playlists, followed artists/albums and listening history locally.
- Edit the queue, shuffle/repeat, start a track radio or set a sleep timer.
- Read lyrics, use audio controls/equaliser and share a track or lyrics excerpt as a 9:16 image.
- Import/export playlist files and import supported public playlist links.
- Windows: full desktop player, immersive view and mini-player. Android: native Media3 playback, system controls, background service and direct share-image saving to Gallery.

Some features differ by platform. There is no offline audio download, hosted account service, cross-device library sync or always-online social collaboration. Provider availability and device audio capabilities affect features.

## Install

Windows supports Windows 10/11 x64, with a portable EXE and per-user installer. Runtime dependencies are included. The EXEs are not Authenticode-signed and Windows may show a SmartScreen warning.

Android supports API24+ (Android 7.0+), ARM64 and x86_64. Update an existing official installation without uninstalling to preserve local data. A build signed with a different key cannot replace it. Physical-device checks for this newest candidate are still pending; read [release notes and known limits](docs/RELEASE_NOTES.md).

Choose the interface language in **Settings → Language** (desktop: Appearance). Existing Italian profiles stay Italian; fresh installations follow a supported system language with English fallback. Music metadata and lyrics remain in their original language.

## Build from source

Install Node.js 24+, pnpm 11.25.0 and Python 3.13. Android packaging additionally uses JDK 21 and Android SDK 36. The supplied packaging scripts run on Windows.

```powershell
pnpm install --frozen-lockfile
pnpm setup:resolver
pnpm dev
```

See the complete [build instructions](docs/BUILDING.md), [contribution guide](CONTRIBUTING.md) and [GitHub publication guide](docs/PUBLISHING.md). Architecture: React/TypeScript/Vite/Zustand, Electron with a local Fastify/SQLite service on desktop, Capacitor with native Android Media3 playback, shared domain/localisation code in `packages/`.

## Providers and privacy

The library stays on the device. Search, streaming, artwork, metadata and lyrics contact external providers, which receive the relevant requests and network address. Provider information is available inside **Settings → Sources and attribution**. [Privacy and storage details](PRIVACY.md).

YouTube/YouTube Music access uses unofficial resolvers and may break or be rate-limited. LRCLIB is the automatic lyrics source; a general licence for its content has not been verified. Optional metadata comes from iTunes. RITVIO is not affiliated with these services and grants no rights to music, lyrics, artwork or provider trademarks. Respect applicable content rights and provider terms.

## Licence

Original RITVIO source is **GPL-3.0-only**. See [LICENSE](LICENSE), [third-party notices and material origins](THIRD_PARTY_NOTICES.md), and the reproduced licences in `third-party/`. Third-party components retain their own licences. Matching source/build scripts and the required upstream source material accompany release binaries.

## Support development

<!-- funding:start -->
Donations are optional and do not unlock features.

[Support via PayPal](https://www.paypal.me/sals126) · [Buy Me a Coffee](https://buymeacoffee.com/Sals126)

Payments are handled by the provider; provider fees may apply.
<!-- funding:end -->

## Report a problem

Use the repository's issue templates with your version, OS/device, reproduction steps and sanitised evidence. For vulnerabilities, follow [SECURITY.md](SECURITY.md). Everyone may report issues or propose a fork-based pull request; the repository owner controls merging. [Release checklist](docs/RELEASE_CHECKLIST.md) · [Italian introduction](README.it.md).
