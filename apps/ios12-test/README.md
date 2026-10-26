# RITVIO PC Test for iOS 12

Temporary iPhone 6 test variant, separate from the autonomous iOS app. The iPhone runs the bundled listening interface, native AVPlayer, queue and local library. An awake PC on the same private LAN provides search and AAC stream resolution. Audio is streamed directly to the iPhone from the validated media host; this helper does not download or convert it.

This build does **not** validate the embedded Python resolver in the official iOS-15+ candidate. It has a separate app ID (`it.ritvio.pctest`), version (`0.1.1`) and data sandbox. No jailbreak or phone system modification is involved. Lyrics, image-sharing cards, artist/album pages and radio/timer are outside its current IOS-5A source scope.

## PC helper

Use the repository's Node 24, Python 3.13 resolver environment and installed dependencies:

```powershell
pnpm install --frozen-lockfile
pnpm setup:resolver
pnpm exec tsx apps/ios12-test/server/main.ts
```

Open `http://127.0.0.1:59212/setup` **on the PC**. In the iPhone app enter the PC's private IPv4 address, port 59212 and the six-digit pairing code shown there. The code expires after 15 minutes and works once. Restart the helper to pair again. The phone keeps the resulting session token in its own Keychain. Keep the helper running; it must be reachable from the phone over the same LAN. Any Windows firewall permission prompt must be handled by the user; the helper does not disable or change the firewall. Do not forward the port on a router.

The helper binds IPv4 for LAN use and accepts only literal private/loopback hosts and private clients. It rejects browser origins, rate-limits pairing, authenticates metadata/descriptor requests and exposes no personal desktop library, file browser or administrative API. This temporary transport uses HTTP on the private LAN, not a public HTTPS service. Search caches eight queries for two minutes; audio descriptors are bounded in memory by the shared preparation scheduler. Nothing is written into the desktop library.

## Native candidate

On macOS 14 with Xcode 15.4 selected, build without an Apple account:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm exec vite build --config apps/ios12-test/vite.config.ts
python3 scripts/build-ios12-test.py
python3 scripts/check-ios12-candidate.py .local/ios12/artifacts/RITVIO-iOS12-PC-Test-0.1.1-unsigned.ipa
```

Output has verified ad-hoc signature placeholders (no personal provisioning profile) and uncompressed bundle metadata for re-signing compatibility. It is **not personally signed or installable yet**, and requires personal signing/install with Sideloadly on Windows or macOS. Follow [Sideloadly's official Windows prerequisites and setup](https://sideloadly.io/) and [signing/renewal instructions](https://sideloadly.io/faq.html). No Apple credentials belong in this app, source files or a support message. Free-account signing requires renewal after seven days; automatic renewal still requires the configured computer/device connection.

`--simulator` builds an independently labelled arm64 simulator app (minimum simulator OS 14.0); this is not an IPA for an iPhone. `capture-ios12-test.py` captures its actual WKWebView connection screen on an available simulator. A current simulator capture is not evidence of iOS 12 physical compatibility. The macos-14 runner/toolchain is an intentionally temporary development dependency, not a long-term legacy-support promise.

The legacy build reuses the current native queue/player/library sources. It substitutes only the resource-loader media-type/header APIs during its own build, uses an iOS-12-compatible photo picker and replaces Capacitor/Python with a small WKScriptMessage/URLSession adapter. Web assets use Safari-12 JavaScript, classic script loading, DOM/Intl/resize/touch polyfills and physical spacing fallbacks. The normal Android/Windows and autonomous iOS entry points retain their build settings.

## Verification

```powershell
pnpm exec tsc --noEmit
pnpm exec tsx --test tests/ios12-pc-service.test.ts tests/ios-foundation.test.ts tests/ios-library.test.ts
pnpm exec vite build --config apps/ios12-test/vite.config.ts
pnpm exec playwright test --config tests/config/playwright.ios12.config.ts
```

Host/browser tests use synthetic metadata and native bridge responses. They exercise authentication, no desktop API exposure, cache expiry, rejected hosts/formats, old-WebKit fallbacks, pairing recovery, fixed-player layout, release-only touch seek and touch-to-pointer queue dragging. Native compilation and Mach-O deployment-target checks are separate. Live provider availability, installation/personal signing, actual iOS 12 WebKit, audible output, Photos, locked-screen playback, interruptions and renewal still need the physical iPhone. No release readiness is inferred from these fixtures.
