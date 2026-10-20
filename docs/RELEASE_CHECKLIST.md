# Release checklist

Use the exact source commit/tag and binary checksums. Record platform, toolchain and outcomes; do not mark a check passed without evidence.

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
- [ ] Draft release notes state known limits and actual checks. Mark prerelease if native gates are open.
- [ ] Downloaded files match hashes; install/update tested from those downloads. Only then publish the reviewed draft.

No tick above is prefilled: the checklist is a release decision record, not a substitute for testing. Current preparation evidence is recorded separately in the development delivery record.
