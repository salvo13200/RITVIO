# Contributing to RITVIO

Read [the build guide](docs/BUILDING.md), [privacy information](PRIVACY.md) and [licensing scope](THIRD_PARTY_NOTICES.md) first. Contributions to original RITVIO code are accepted under GPL-3.0-only; retain the notices on third-party code and assets.

Open a bug or feature issue before a substantial change. Include platform, version, reproduction steps and sanitised evidence. Keep pull requests focused; explain the resulting behaviour and checks actually run. Add a regression test for a meaningful bug, rather than tests which only repeat implementation details.

Run `pnpm check:locales`, `pnpm i18n:check`, `pnpm test` and `pnpm build`. Use platform tests for playback, packaging, native bridges and data migrations. Browser fixtures cannot verify Android background playback or Windows installer behaviour. Keep runtime versions locked and update notices when dependencies change.

Do not contribute music, lyrics, album covers or credentials for which you cannot grant redistribution rights. Demo artwork must have a recorded origin. Do not introduce analytics, remote accounts, paid dependencies or telemetry without a documented product decision. Preserve separate desktop/mobile design systems and accessibility, including reduced motion.

No signing keys, database exports, full listening histories, `.env` files, development caches or release binaries belong in a pull request. Signing keys belong only in the maintainer's private backup or a protected release environment.
