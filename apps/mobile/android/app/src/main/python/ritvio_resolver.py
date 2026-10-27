"""Android adapter. Metadata and signed URLs only; media is never downloaded here."""
import json
import re
import threading
import time
from functools import partial
from urllib.parse import urlparse, parse_qs

import yt_dlp
import requests
from ytmusicapi import YTMusic
from yt_dlp.extractor.youtube.jsc._builtin.ejs import EJSBaseJCP
from yt_dlp.extractor.youtube.jsc.provider import register_provider, register_preference
from yt_dlp.extractor.youtube.pot._provider import BuiltinIEContentProvider

_bridge = None
_lock = threading.Lock()
_started = False


@register_provider
class RitvioJCP(EJSBaseJCP, BuiltinIEContentProvider):
    PROVIDER_NAME = 'ritvio'
    JS_RUNTIME_NAME = 'ritvio-quickjs'

    def is_available(self):
        return self._available and _bridge is not None

    def _run_js_runtime(self, script):
        if _bridge is None:
            raise RuntimeError('JS engine unavailable')
        return str(_bridge.evaluate(script))


@register_preference(RitvioJCP)
def preference(provider, requests):
    return 1100


class QuietLogger:
    def debug(self, message): pass
    def warning(self, message): pass
    def error(self, message): pass


def initialize(bridge):
    global _bridge, _started
    with _lock:
        _bridge = bridge
        _started = True
    return json.dumps({'python': True, 'catalog': True, 'js': bridge is not None})


def _video_id(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_-]{11}', value):
        raise ValueError('Invalid video ID')
    return value


def _duration(item):
    if isinstance(item.get('duration_seconds'), (int, float)):
        return max(0, item['duration_seconds'])
    raw = item.get('duration')
    if isinstance(raw, str) and re.fullmatch(r'\d+(?::\d{2}){1,2}', raw):
        value = 0
        for number in raw.split(':'): value = value * 60 + int(number)
        return value
    return 0


def search(query):
    if not isinstance(query, str) or not 3 <= len(query.strip()) <= 200:
        raise ValueError('Invalid query')
    session = requests.Session()
    session.request = partial(session.request, timeout=12)
    client = YTMusic(language='en', requests_session=session)
    raw = client.search(query.strip(), filter='songs', limit=24)
    items, seen = [], set()
    for item in raw:
        identifier = item.get('videoId')
        if not isinstance(identifier, str) or not re.fullmatch(r'[A-Za-z0-9_-]{11}', identifier): continue
        if identifier in seen or item.get('isAvailable') is False or item.get('resultType') != 'song': continue
        seen.add(identifier)
        images = item.get('thumbnails') or []
        image = max(images, key=lambda entry: (entry.get('width') or 0) * (entry.get('height') or 0)).get('url', '') if images else ''
        parsed = urlparse(image)
        if parsed.scheme != 'https' or not (parsed.hostname or '').endswith(('.googleusercontent.com', '.ytimg.com', '.ggpht.com')):
            image = f'https://i.ytimg.com/vi/{identifier}/hqdefault.jpg'
        items.append({'videoId': identifier, 'title': str(item.get('title') or 'Brano')[:300],
                      'artist': ', '.join(a['name'] for a in item.get('artists', []) if a.get('name'))[:300] or 'Artista',
                      'thumbnail': image, 'duration': _duration(item),
                      'album': item.get('album') if isinstance(item.get('album'), dict) else None,
                      'artists': [{'id':a['id'],'name':a['name']} for a in item.get('artists',[]) if a.get('id') and a.get('name')][:12]})
        if len(items) >= 20: break
    return json.dumps({'items': items}, ensure_ascii=False)


def _catalog_value(value, artwork=''):
    if isinstance(value, list): return [_catalog_value(item, artwork) for item in value]
    if not isinstance(value, dict): return value
    own_art = (value.get('artwork') if value.get('kind') == 'album' else None) or artwork
    result = {key: _catalog_value(item, own_art) for key, item in value.items()}
    if value.get('videoId'):
        identifier = _video_id(value['videoId'])
        result['thumbnail'] = value.get('thumbnail') or own_art or f'https://i.ytimg.com/vi/{identifier}/hqdefault.jpg'
        result['duration'] = value.get('duration') or 0
    for key in ('artwork', 'thumbnail'):
        image = result.get(key)
        if image:
            parsed = urlparse(str(image))
            if parsed.scheme != 'https' or parsed.username or not (parsed.hostname or '').endswith(('.googleusercontent.com', '.ytimg.com', '.ggpht.com')):
                result[key] = None if key == 'artwork' else ''
    return result


def catalog(payload_json, *, ios_identity_catalog=False):
    payload = json.loads(payload_json)
    allowed = ('catalog-search', 'detail', 'home-index', 'home-collection', 'radio', 'browse-index', 'browse-playlists', 'browse-tracks')
    if ios_identity_catalog is True:
        allowed += ('search-snapshot', 'releases', 'artist-search')
    if not isinstance(payload, dict) or payload.get('operation') not in allowed:
        raise ValueError('Invalid catalog operation')
    # Shared desktop metadata adapter, copied from its authoritative sources by the APK builder.
    import music_catalog
    def bounded_client(**kwargs):
        session = requests.Session()
        session.request = partial(session.request, timeout=12)
        client = YTMusic(requests_session=session, **kwargs)
        watch = client.get_watch_playlist
        def initial_watch_page(**options):
            # ytmusicapi's limit is a minimum; one initial page already supplies
            # candidates. Do not request the desktop's 51-item continuation.
            options['limit'] = 1
            return watch(**options)
        client.get_watch_playlist = initial_watch_page
        return client
    if payload['operation'].startswith('browse-'):
        from discovery_catalog import catalog as browse_catalog
        return json.dumps(_catalog_value(browse_catalog(payload, bounded_client, music_catalog.song, music_catalog.thumbnail)), ensure_ascii=False)
    music_catalog.YTMusic = bounded_client
    result = _catalog_value(music_catalog.catalog(payload))
    return json.dumps(result, ensure_ascii=False)


def lyrics(title, artist, duration, primary_artist=None):
    from lyrics_provider import lookup
    return json.dumps(lookup(title, artist, duration, primary_artist), ensure_ascii=False)


def playlist_preview(identifier, cancellation):
    if not isinstance(identifier,str) or not re.fullmatch(r'(?:PL|OLAK5uy_|RDCLAK5uy_)[A-Za-z0-9_-]{8,150}',identifier):
        raise ValueError('Invalid playlist ID')
    import playlist_catalog
    deadline=time.monotonic()+45
    session=requests.Session()
    original=session.request
    def request(*args,**kwargs):
        if cancellation.isCancelled(): raise RuntimeError('Import cancelled')
        remaining=deadline-time.monotonic()
        if remaining<=0: raise TimeoutError('Playlist time budget exceeded')
        kwargs['timeout']=min(8,remaining)
        return original(*args,**kwargs)
    session.request=request
    try:
        client=YTMusic(language='en',requests_session=session)
        value=playlist_catalog.playlist({'id':identifier},client=client)
        if cancellation.isCancelled(): raise RuntimeError('Import cancelled')
        value=_catalog_value(value)
        value['entries']=[{'number':i+1,**entry} for i,entry in enumerate(value['entries'][:1000])]
        count=value.get('reportedCount')
        value['truncated']=isinstance(count,int) and count>1000 or value.get('partial',False)
        value['partial']=value['truncated'] or count is None or isinstance(count,int) and count>len(value['entries'])
        value['provider']='youtube-music'
        return json.dumps(value,ensure_ascii=False)
    finally:session.close()


def resolve(video_id, *, format_selector='bestaudio[ext=m4a]/bestaudio', include_metadata=False):
    _video_id(video_id)
    if not _started: raise RuntimeError('Resolver not initialized')
    options = {'quiet': True, 'no_warnings': True, 'logger': QuietLogger(), 'skip_download': True,
               'noplaylist': True, 'cachedir': False, 'socket_timeout': 12, 'retries': 0,
               'format': format_selector, 'js_runtimes': {}}
    with yt_dlp.YoutubeDL(options) as downloader:
        info = downloader.extract_info(f'https://www.youtube.com/watch?v={video_id}', download=False)
    url = info.get('url', '')
    parsed = urlparse(url)
    if parsed.scheme != 'https' or not (parsed.hostname or '').endswith('.googlevideo.com') or parsed.username or parsed.password:
        raise ValueError('Invalid media host')
    if info.get('vcodec') != 'none' or info.get('is_live'):
        raise ValueError('Unsupported audio stream')
    expires = int((parse_qs(parsed.query).get('expire') or [int(time.time()) + 300])[0])
    allowed_headers = {'user-agent', 'referer', 'origin', 'accept', 'accept-language'}
    headers = {key: value for key, value in (info.get('http_headers') or {}).items()
               if key.lower() in allowed_headers and isinstance(value, str) and '\r' not in value and '\n' not in value}
    result = {'url': url, 'expires': expires, 'headers': headers}
    if include_metadata:
        result.update({'container': info.get('ext'), 'codec': info.get('acodec'),
                       'duration': info.get('duration'), 'bytes': info.get('filesize') or info.get('filesize_approx'),
                       'protocol': info.get('protocol')})
    return json.dumps(result)
