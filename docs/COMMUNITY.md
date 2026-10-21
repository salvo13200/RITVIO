# Feedback and release communication

This is preparation for the combined release. It does not publish a post, announce a new package or claim the local additions are already downloadable. Use the final approved release link and matching screenshots when publication is authorized.

## Useful feedback

- **Reproducible problem:** use Bug report. Include exact version/platform, steps, expected/actual behavior and frequency. Device and OS details are entered by the reporter. Optional playback counters can be inspected/copied in Settings; never attach the library database, private paths, tokens or signed stream URLs.
- **Interface/readability preference:** use Interface feedback. Name the screen and task; explain what is difficult and what would help. A preference is useful feedback without being a confirmed bug.
- **Future capability:** use Feature request. Describe the listening problem and how the capability would help. A request is not a promise of delivery.

Settings opens the matching form with app context only. Sign-in and submission take place on GitHub. An opened form is not a submitted report. Security-sensitive reports follow [the security policy](../SECURITY.md).

Current priorities are a verified combined candidate, reliable everyday listening and clear, accessible sharing/help flows. Online accounts, cross-device sync and dedicated backup tooling remain later work. Keep public priorities few and update them when scope changes; do not promise dates or an update frequency.

## Short release copy, ready to adapt

Use only after the corresponding packages and sources are public and verified. Respect community rules and disclose that you maintain the project. Replace the release link with the approved final one; do not mass-post or send unsolicited messages.

**Music-listener introduction**

> I’m building RITVIO, a free, open-source music player for Android and Windows. Keep a local library, shape your queue, follow available lyrics, and turn a song or a few consecutive lines into a 9:16 share card. No RITVIO account is required. Music and lyrics depend on external services. Downloads and source: https://github.com/salvo13200/RITVIO

**Short community update**

> RITVIO brings local playlists, lyrics and music share cards to Android and Windows. The latest release notes explain what changed. I maintain the project and welcome specific feedback about daily listening, readability and sharing. It’s free and open source (GPLv3): https://github.com/salvo13200/RITVIO

Use the [actual screenshots and silent walkthrough](ADOPTION.md), with their capture disclosures. Avoid edited UI, unloaded collections, invented endorsements, popularity claims or native/background claims based on browser images. Update the screenshots that changed when final package acceptance is complete; preserve their origin notes.

## Reading download and feedback signals

GitHub release asset `download_count` records asset transfers, not unique listeners, installations or active users. Report the date, release/tag and asset type separately: Android APK, Windows installer, portable ZIP/EXE, source archives and checksums. A person can fetch multiple packages or repeat a download; update checks and page views are different events. Do not sum everything into a user count. Use the official [release asset field definitions](https://docs.github.com/en/rest/releases/assets) when collecting a snapshot.

Record voluntary reports and spontaneous comments without inferring activity. A compact maintainer log can contain date, public issue link, platform/version, bug/interface/idea, a brief summary and status. A comment explicitly saying “I use it regularly” or “a friend shared it” is a reported signal, not measured retention or referral conversion. Do not copy private identities/contact details into a public log. No analytics SDK, tracking endpoint or mandatory tester group is part of this plan.
