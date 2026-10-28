# Release checklist

Use the exact source commit/tag and binary checksums. Record platform, toolchain and outcomes; do not mark a check passed without evidence.

## Current baseline

Completed Windows 1.0.0 / Android 1.4.0 checks, source-only maintenance results, remaining coverage and next priorities are consolidated in [Quality status](QUALITY_STATUS.md). Consult that record before scheduling another test. The boxes below are a reusable checklist for the **next exact candidate**, so blank boxes do not mean that published releases have never been checked.

Repeat a scenario when its implementation, runtime/package or relevant environment changes, or a new report calls its result into question. Documentation/test-helper changes alone do not require rebuilding an APK/EXE or repeating a generic endurance run. Use the [repeat-check rules](QUALITY_STATUS.md#when-to-repeat-a-check) to select the affected checks.

## Source and repository

- [ ] Review the allowlisted export; no signing keys, credentials, profiles, private paths or downloaded comparison apps.
- [ ] GPLv3 text, third-party inventory/notices and font/material attribution included; requirements are pinned and unchanged sources archived where required.
- [ ] Locked installation, core tests, localisation, desktop/mobile web builds pass from the exported source, with outcomes recorded.
- [ ] Public GitHub repository created; only owner has write/admin permissions. Issues and private vulnerability reporting enabled.
- [ ] Both active main rulesets imported and checked; real CI check names match and pass. PRs have no signing secrets/write token.
- [ ] Donation recipients reviewed, or funding remains inactive; no fake account/placeholder payment link.

## Windows

- [ ] Portable launch and installer install/update/uninstall on an isolated test profile; no library loss and no existing personal installation touched.
- [ ] Extract-once ZIP has valid checksums/CRC, the complete runtime and notices; test its extracted executable separately from the self-extracting EXE. Keep adjacent files together and state that user data still uses the Windows profile.
- [ ] Playback, next/seek/queue, local library, lyrics, sharing, restart and language persistence verified.
- [ ] Embedded source/notices, production dependency isolation and SHA-256 verified. Unsigned-executable limitation stated.

## Android

- [ ] VersionName/code and same official signing certificate verified; APK signature, permissions and 16KB alignment checked.
- [ ] Current APK installed/updated on a physical device without uninstalling or deleting the library.
- [ ] Locked-screen/notification playback, audio focus/Bluetooth, player cover changes, gestures/back, lyrics and Gallery saving/feedback verified.
- [ ] TalkBack, large fonts and system insets checked on the installed APK. JVM/browser/instrumentation results distinguished.

## Publication

- [ ] Build source and tag correspond; source archives available alongside EXE/APK.
- [ ] RELEASE-MANIFEST.json and SHA256SUMS generated from final assets, no stale binaries.
- [ ] Draft release notes state known limits and actual checks. Use prerelease for a candidate with unresolved release-blocking gates; document non-blocking coverage limits explicitly.
- [ ] Downloaded files match hashes; install/update tested from those downloads. Only then publish the reviewed draft.

Fill this template for a future candidate without overwriting the dated evidence in [Quality status](QUALITY_STATUS.md). Keep automated, controlled-native and maintainer-reported outcomes distinct; leave unverified checks open and state their limits in the release notes.


## iOS beta (separate channel)

- [ ] Clean exact source commit/tree, independent iOS app/Xcode versions and corresponding-source ZIP verified.
- [ ] Completed native run record matches the archive/report/checkout. Compile, UI, synthetic playback and provider outcomes remain distinct.
- [ ] Device IPA contains unchanged Release iPhoneOS arm64 app/dependencies; simulator/too-new/encrypted binaries and personal provisioning material rejected.
- [ ] Source ZIP contents, dependency inventory, notices, installation guide, candidate manifest and SHA-256 verified.
- [ ] Draft explicitly says beta, personal signing and minimum iOS, and lists all deferred acceptance. Never mark publicReleaseReady true merely to publish a beta.
- [ ] Owner authorizes the prerelease. Keep Android/Windows stable downloads unchanged.
- [ ] After GitHub upload: actual iPhone install/update, provider/background/permissions/sharing/renewal and accessibility outcomes recorded; fix blockers before stable promotion.
