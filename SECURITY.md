# Security policy

Security fixes target the latest public candidate and subsequent releases. There is no guaranteed response time or third-party provider availability.

Use the repository's **Security → Report a vulnerability** facility when private vulnerability reporting is enabled. If it is unavailable, open a minimal issue requesting a private reporting channel, without publishing exploit details, credentials or personal data. No private email contact is currently configured. Maintainers must enable private vulnerability reporting before the first public release.

Never attach signing keys, cookies, local databases, authentication tokens, stream URLs containing tokens or complete user logs. Provide the version, platform, impact and a minimal reproduction privately once a channel is available.

Dependencies, unofficial catalogue resolvers and external websites have their own security policies. Treat imported files, network metadata and links as untrusted. Releases must include source, licence notices and SHA-256 checksums. Checksums detect corruption but do not establish publisher identity; Windows candidates are currently not Authenticode-signed.
