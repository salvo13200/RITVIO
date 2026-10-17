"""Owned stdin/stdout JSON worker. Metadata and stream URLs only; never downloads media."""
import json
import os
import re
import sys
import yt_dlp
import ytmusicapi


class QuietLogger:
    def debug(self, message):
        pass

    def warning(self, message):
        pass

    def error(self, message):
        pass


def emit(value):
    print(json.dumps(value), flush=True)


args = ["--ignore-config", "--no-plugin-dirs", "--no-playlist", "--no-cache-dir",
        "--skip-download", "--no-warnings", "--socket-timeout", "12", "--retries", "0",
        "--js-runtimes", "node:" + sys.argv[1], "-f", "bestaudio[ext=m4a]/bestaudio"]
options = yt_dlp.parse_options(args).ydl_opts
options.update({"logger": QuietLogger(), "quiet": True, "noprogress": True})
with yt_dlp.YoutubeDL(options) as downloader:
    emit({"ready": True, "pid": os.getpid()})
    for line in sys.stdin:
        try:
            request = json.loads(line)
            video_id = request["videoId"]
            if not isinstance(video_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
                raise ValueError("Invalid video ID")
            info = downloader.extract_info("https://www.youtube.com/watch?v=" + video_id, download=False)
            fields = ("id", "url", "vcodec", "is_live", "track", "title", "artist", "channel", "uploader", "duration")
            emit({"ok": True, "info": {key: info.get(key) for key in fields}})
        except Exception as error:
            # Provider diagnostics can contain signed URLs. Return only a stable classification.
            restricted = re.search(r"private|unavailable|sign in|age.restricted|not available|removed", str(error), re.I)
            emit({"ok": False, "code": "TRACK_UNAVAILABLE" if restricted else "RESOLVER_FAILED"})
