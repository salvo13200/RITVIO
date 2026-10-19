# What you can do with RITVIO

[Back to RITVIO](../README.md) · [Screenshots](SCREENSHOTS.md) · [Downloads](https://github.com/salvo13200/RITVIO/releases)

Every feature group below has a corresponding view in the [illustrated function index](SCREENSHOTS.md#feature-to-screen-index), including separate track-card and lyrics-card exports and the lyrics-selection menu.

## Discover and return

Search tracks, artists and albums, then browse an artist or a complete available album. Home combines recent listening with global hits and new releases; Android also lets you browse catalogue genres and moods/activities; availability and updates depend on the catalogue provider. A track radio and listening-based suggestions help you continue from a song you like. These are RITVIO/provider-dependent selections, not an official Spotify or Apple Music recommendation service.

## Keep a local library

Like tracks, follow artists/albums, make playlists and keep listening history on your device. Rename playlists, add/remove/reorder tracks and browse the library. Import/export version-1 playlist files or preview supported public playlist links before importing their metadata. Playlist transfer contains references and metadata, not downloaded audio. On Android, choose or restore a photo for a personal playlist; track artwork stays supplied by the catalogue. Exported playlist files include a portable version of a custom playlist cover.

No hosted account is required. Windows and Android libraries are separate: automatic cross-device synchronisation and online collaboration are not implemented.

## Shape the listening session

Use previous/next, seeking, shuffle/repeat and a queue you can edit. Set a sleep timer, adjust the available equaliser/audio controls, and return to a saved listening state. Android uses physical/system volume controls in the main player; desktop exposes its own volume control.

| Windows | Android |
| --- | --- |
| Keyboard-friendly desktop layout with sidebar and persistent playback bar. | Touch interface with Home, Search, Library and a full-screen player. |
| Immersive listening view and a separate mini-player. | Media3 playback, Android media-session controls and background service. |
| Desktop queue/library surfaces and local Fastify/SQLite service. | Native playback ownership and local library through the Capacitor bridge. |

Android 1.2.0 preloads the next track, retains a bounded RAM back buffer and shares duplicate stream requests to reduce waiting. Unprepared tracks and seeks outside available audio still require the network; there is no offline audio cache. Use **Settings → Copy playback diagnostics** to copy local timing evidence without track titles, identifiers or stream URLs. Nothing is uploaded automatically.

Windows 0.7.3 prepares one next track after current playback has enough buffered audio, shares duplicate resolution work and reuses encoded ranges in a bounded 16 MiB RAM proxy buffer. There is no disk audio cache. Unprepared tracks and seeks outside available audio remain network-dependent. The installer is recommended for daily use because the portable extracts on launch.

Android 1.3.0 pins the current item above upcoming tracks. Drag the larger grip to reorder, including held-edge scrolling, or tap it to use labelled move/remove controls. Swiping the title or cover scrolls the list. Previously played entries are available separately.

Features and audio effects depend on the platform/device. Native background playback, audio focus and OEM battery restrictions must be checked on the phone; browser captures cannot validate them.

## Read and share

Read automatic lyrics when the external source has a match. Lyrics availability and synchronisation vary by recording; an incorrect match or missing text should be reported with the song/version. LRCLIB is the automatic source, and a general licence for its content has not been verified.

Create a 9:16 share image with a track card or a consecutive lyrics excerpt. The preview lets you choose the content before sharing/exporting; Android has a native Gallery-save flow. Images do not include the audio. Only share text and artwork where applicable content rights permit it.

Android 1.3.0 separates full-height verse selection from preview. Back preserves the excerpt and reading position. The inner quote card grows with the wrapped text while the outer image stays 9:16. The reader stores text-size/emphasis preferences and offers resume-follow after manual scrolling.

## Languages and appearance

English and Italian are available through Settings. Both platforms use the RITVIO charcoal/lavender identity, readable type, waveform progress and reduced-motion support, with layouts designed separately for desktop and touch. Metadata and lyrics are not automatically translated. Other languages are planned, not currently offered as complete translations.

## Current limits

RITVIO is a public preview. Offline audio downloads, online accounts, cloud sync and live social collaboration are not available. Unofficial catalogue resolvers can break or be rate-limited; lyrics and metadata depend on their sources. Read [release notes](RELEASE_NOTES.md), [privacy](../PRIVACY.md) and [source/licensing information](../THIRD_PARTY_NOTICES.md).
