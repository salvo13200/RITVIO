# ANDROID-0 — technical playback slice

## Scope and mode

Operate. Search a real song, start it, queue another song, lock the phone and control playback through Android. User approved this precise functional slice before implementation; no new visual world or full mobile redesign is being selected.

## Direction contract

Established RITVIO world from ../client/DESIGN.md. Code-led technical extension; complete mobile mockups are explicitly ANDROID-1. No image-generation assets, no borrowed competitor code.

FIRST VIEWPORT: RITVIO header, clear technical-preview status, large search input, readable music rows, persistent compact player. Only Search and Queue views are exposed because the library port is not present yet. Empty/error/loading states explain the next action.

MEMORABLE MOMENT: opening the current track expands the cover and transport while the same native audio continues. Fast fade/shared-axis transitions, reduced-motion fallback; the app must remain immediately usable.

PROOF: APK build, native resolver/Media3 tests and captures from an emulator or a physical device. Browser fixtures can verify layout and UI logic but cannot certify Android background audio.

PRESERVE: desktop source and release, Italian voice, identity, no account/cloud, native system Back, no hidden JavaScript audio engine.

UNRESOLVED: resolver feasibility must pass native execution. Reference phone: Motorola Edge 60 Neo, Android 16; OEM battery behavior remains untested. No claim of hardware testing or complete desktop feature parity.
