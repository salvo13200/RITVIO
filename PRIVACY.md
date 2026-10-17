# Data and external services

RITVIO uses a local profile, not a hosted RITVIO account. The app stores playlists, likes, followed artists/albums, listening history, preferences, caches and playback state on the device. It does not currently include a RITVIO analytics or advertising SDK, cloud library sync, or a hosted telemetry backend.

Windows stores its profile under `%APPDATA%\RITVIO`; development runs use the workspace's ignored `data/` directory. Android stores application data in its app sandbox. Uninstalling Android can delete this data: export important playlists first. Existing installations should be updated without uninstalling.

Internet requests are necessary for catalogue search, stream resolution, playback, artwork and lyrics. YouTube/YouTube Music, Google media/artwork hosts, LRCLIB, and optionally Apple's iTunes metadata/artwork services receive request data and the network address used to connect. Search terms, track/artist identifiers and metadata needed for each request may be sent. Provider policies apply; local storage does not make network requests anonymous. RITVIO is not affiliated with these services. Sources are also described inside Settings.

Android saving a share card writes a PNG through MediaStore into Pictures/RITVIO on supported versions. Sharing opens Android's chooser; the selected receiving application controls what happens next. Desktop image export writes to the chosen destination. Exported images and playlists may disclose the tracks or lyrics selected by the user. No cover artwork, lyrics or audio is included in the public source archive as a bundled catalogue.

Logs can contain catalogue metadata, URLs and local paths. Review and redact them before posting issues. Unofficial providers may set their own logs and limits; RITVIO cannot control their retention. This document describes the code shipped here, not a claim about every downstream build.

Optional donation links appear only on GitHub and in its README, not inside the applications. Clicking them takes you to PayPal or Buy Me a Coffee, which process the payment and related personal information under their own policies. No payment information is collected by RITVIO code.
