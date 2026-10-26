"""AAC-only variant of the existing owned worker, for native AVPlayer tests."""
import json
import re
import sys
import yt_dlp

class QuietLogger:
    def debug(self, message): pass
    def warning(self, message): pass
    def error(self, message): pass

args = ['--ignore-config', '--no-plugin-dirs', '--no-playlist', '--no-cache-dir', '--skip-download',
        '--no-warnings', '--socket-timeout', '12', '--retries', '0', '--js-runtimes', 'node:' + sys.argv[1],
        '-f', 'bestaudio[ext=m4a][acodec^=mp4a]/bestaudio[ext=m4a][acodec^=aac]']
options = yt_dlp.parse_options(args).ydl_opts
options.update(logger=QuietLogger(), quiet=True, noprogress=True)
with yt_dlp.YoutubeDL(options) as downloader:
    print(json.dumps({'ready': True}), flush=True)
    for line in sys.stdin:
        try:
            identifier = json.loads(line)['videoId']
            if not isinstance(identifier, str) or not re.fullmatch(r'[A-Za-z0-9_-]{11}', identifier):
                raise ValueError('Invalid video ID')
            value = downloader.extract_info('https://www.youtube.com/watch?v=' + identifier, download=False)
            keys = ('id', 'url', 'vcodec', 'is_live', 'ext', 'acodec', 'http_headers')
            result = {'ok': True, 'info': {key: value.get(key) for key in keys}}
        except Exception:
            result = {'ok': False, 'code': 'RESOLVER_FAILED'}
        print(json.dumps(result), flush=True)
