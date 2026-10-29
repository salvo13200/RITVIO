# RITVIO for iOS — beta

[Back to RITVIO](../README.md) · [Download page and short tutorial](https://salvo13200.github.io/RITVIO/#ios-install) · [Beta 2 release](https://github.com/salvo13200/RITVIO/releases/tag/ios-v0.10.0-beta.2)

**Current beta: 0.10.0 beta 2, build 15, for iOS 15 or newer.** Windows 1.0.0 and Android 1.4.0 remain stable. iOS is a separate beta with its own version and remaining device checks.

## What you need

- An iPhone running iOS 15 or newer. iPhone 6 / iOS 12 is not supported.
- A Windows PC or Mac, a USB connection for initial setup, and your own Apple account.
- [Sideloadly](https://sideloadly.io/) and its official operating-system prerequisites. Follow its Apple-component instructions on Windows.
- The official [RITVIO iOS beta IPA](https://github.com/salvo13200/RITVIO/releases/download/ios-v0.10.0-beta.2/RITVIO-iOS-0.10.0-beta.ipa).

You do not need a paid Apple developer membership for the personal-signing route described here. Free-account signing has limits, including seven-day expiry and Apple's sideloaded-app allowance. There is no App Store or TestFlight installation. An IPA does not install by tapping a link on the phone. See the [official Sideloadly FAQ](https://sideloadly.io/faq.html) for current setup, account limits and renewal instructions.

## Install

1. Download the IPA to your computer. Optionally compare its SHA-256 with the release's `SHA256SUMS` before opening it in the signing utility.
2. Install and open Sideloadly. Connect the unlocked iPhone by USB and complete the phone/computer Trust prompts.
3. Select your iPhone and the RITVIO IPA in Sideloadly. Sign/install with your own Apple account. Enter credentials only in that utility, never in RITVIO, an issue or a support message.
4. On the phone, open **Settings → General → VPN & Device Management** (labels vary by iOS), select your developer profile and trust it. On iOS 16+, also enable **Developer Mode** under **Privacy & Security** when required, following the phone's restart/confirmation prompts.
5. Open RITVIO, search for a song and start playback. Your library stays on this device; no RITVIO account or cloud synchronisation is required or provided.

If the device is missing, first check whether the computer's Apple device software recognises it, its Trust prompt has been accepted, and the cable carries data. Follow Sideloadly's troubleshooting before retrying; changing RITVIO's minimum OS setting does not make an older iPhone compatible.

## Renew and update

A free Apple-account signature lasts **seven days**. If it expires, the app stops opening until it is signed again. Sideloadly offers optional automatic refresh through its daemon: the computer must be available and able to reach the phone by USB or previously configured Wi-Fi. Renewal is not performed by RITVIO or by the iPhone alone. Follow the [official refresh instructions](https://sideloadly.io/faq.html).

For an update or renewal, use the **same Apple account and bundle identity** and install over the existing app. Avoid uninstalling first if you want to retain the local library. Changing the signing identity may create a separate installation; local data does not automatically sync. Personal signing, retained-data updates and renewal still require acceptance on a user's own device.

## Included in this beta

- Home, song/album/artist search, album and artist pages, persistent mini-player and fixed full-screen player.
- Native AVPlayer, seeking, editable queue, shuffle/repeat, restoration without autoplay, sleep timer, song radio and Autoplay.
- Local library, likes, personal playlists and cover photos, history, saved artists/albums.
- Available lyrics, consecutive verse selection, 9:16 track/lyrics cards, native Photos saving and sharing.
- `.ritvio.json` playlist import/export, reviewed Help reports, English/Italian and motion settings.

The equalizer, complete Android/Windows discovery Home and public-provider playlist URL import are not included. There are no cloud accounts/sync, offline audio downloads or automatic IPA installation. Catalogue and lyric availability depend on external services; [provider and content limits](../README.md#privacy-sources-and-licence) apply on iOS too.

## What was checked

Beta 2 corrects doubled native durations for eligible fragmented AAC streams and repeat activation of the Queue menu. The [full native run](https://github.com/salvo13200/RITVIO/actions/runs/40917748394) passed on the exact source, including compact/large-text UI, device/simulator builds, native resolver-core checks and synthetic AVPlayer regressions.

The exact release IPA was subsequently checked on real cloud-hosted iPhone 15 / iOS 17.5.1 and iPhone 13 / native iOS 15.4.1. Corrective flows passed: real-stream durations, repeated Queue menu activation, paused seeking/resume, natural next, rapid skips and short background/lock continuity. The service's iPhone 13 request was labelled 15.5; the app's native system report returned 15.4.1. These are scoped results, not complete feature acceptance.

**Still unverified:** audible output quality, long background sessions, Bluetooth/calls, VoiceOver and personal installation/update/signature renewal. See `VALIDATION.md` in the [release assets](https://github.com/salvo13200/RITVIO/releases/tag/ios-v0.10.0-beta.2). The original packaging/native reports keep their conservative pending gates; subsequent cloud checks are recorded separately. A green native run or short cloud session does not certify every hardware scenario or promote iOS to stable.

## Source and feedback

The release includes the exact corresponding source ZIP, GPLv3 licence/notices, dependency inventory, native/run records, validation summary and checksums. The binary's source is [tagged separately](https://github.com/salvo13200/RITVIO/tree/ios-v0.10.0-beta.2); its [build instructions](https://github.com/salvo13200/RITVIO/blob/ios-v0.10.0-beta.2/docs/BUILDING.md#ios-embedded-resolver-technical-build) describe the macOS/Xcode toolchain. Publishing download-page documentation on `main` does not change the source identity of an existing IPA.

For a problem, [open an issue](https://github.com/salvo13200/RITVIO/issues/new/choose) with **iOS**, app version/build, device model, iOS version and reproducible steps. Review Help reports before sharing. Never attach Apple credentials, provisioning profiles, signed stream URLs or private cloud-service session links.
