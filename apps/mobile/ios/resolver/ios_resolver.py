"""Bounded iOS policy around the existing mobile metadata/stream adapter.

Only the native owner receives signed descriptors. Public diagnostics omit URLs
and request headers. Python and the challenge engine run inside the app process.
"""
from collections import OrderedDict
import importlib.metadata
import json
import math
import os
import re
import ssl
import sys
import time
from urllib.parse import urlparse

import certifi
import requests
import _ritvio_native as native

os.environ['SSL_CERT_FILE'] = certifi.where()
os.environ['REQUESTS_CA_BUNDLE'] = certifi.where()
import ritvio_resolver as shared

shared.initialize(native)
_Session = requests.Session
_sessions = []
_search_cache = OrderedDict()
_catalog_cache = OrderedDict()
_stream_cache = OrderedDict()
_cooldown_until = 0.0
_provider_signals = set()


def provider_signal(message):
    text = str(message).lower()
    if 'sign in' in text or 'not a bot' in text:
        return 'PROVIDER_SIGN_IN_REQUIRED'
    if 'challenge solving failed' in text or 'signature extraction failed' in text or 'no supported javascript' in text:
        return 'JS_CHALLENGE_FAILED'
    if 'po token' in text and ('required' in text or 'missing' in text):
        return 'PROVIDER_TOKEN_REQUIRED'
    if 'requested format is not available' in text:
        return 'FORMAT_UNAVAILABLE'
    if 'http error 429' in text or 'too many requests' in text:
        return 'RATE_LIMITED'
    if 'http error 403' in text or 'http error 401' in text:
        return 'PROVIDER_REJECTED'
    return None


class DiagnosticLogger(shared.QuietLogger):
    def warning(self, message):
        signal = provider_signal(message)
        if signal:
            _provider_signals.add(signal)

    error = warning


shared.QuietLogger = DiagnosticLogger


class ResolverError(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def checkpoint():
    reason = native.abort_reason()
    if reason:
        raise ResolverError('CANCELLED' if reason == 'cancelled' else 'TIMEOUT')


class BoundedSession(_Session):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.verify = certifi.where()
        self.trust_env = False
        _sessions.append(self)

    def request(self, *args, **kwargs):
        global _cooldown_until
        checkpoint()
        kwargs['timeout'] = 8
        kwargs['verify'] = certifi.where()
        response = super().request(*args, **kwargs)
        checkpoint()
        if response.status_code == 429:
            _cooldown_until = time.monotonic() + 30
            raise ResolverError('RATE_LIMITED')
        return response


requests.Session = BoundedSession
requests.sessions.Session = BoundedSession


def cache_read(cache, key, now):
    checkpoint()
    entry = cache.get(key)
    if entry is None:
        return None
    if entry[0] <= now:
        del cache[key]
        return None
    cache.move_to_end(key)
    return json.loads(entry[1])


def cache_write(cache, key, value, expires, maximum):
    checkpoint()
    encoded = json.dumps(value, ensure_ascii=False)
    if len(encoded.encode('utf-8')) > 256 * 1024:
        raise ResolverError('RESULT_TOO_LARGE')
    cache[key] = (expires, encoded)
    cache.move_to_end(key)
    while len(cache) > maximum:
        cache.popitem(last=False)


def search(query):
    if not isinstance(query, str) or not 3 <= len(query.strip()) <= 200:
        raise ResolverError('INVALID_QUERY')
    query = ' '.join(query.split())
    key = query.casefold()
    cached = cache_read(_search_cache, key, time.monotonic())
    if cached is not None:
        return {**cached, 'cacheHit': True}
    if time.monotonic() < _cooldown_until:
        raise ResolverError('RATE_LIMITED')
    result = json.loads(shared.search(query))
    checkpoint()
    cache_write(_search_cache, key, result, time.monotonic() + 300, 24)
    return {**result, 'cacheHit': False}


def catalog(payload):
    operation, kind = payload.get('operation'), payload.get('kind')
    if operation not in ('catalog-search', 'detail', 'search-snapshot', 'releases', 'artist-search') or (operation != 'search-snapshot' and kind not in ('artist', 'album')):
        raise ResolverError('INVALID_ARGUMENT')
    if operation in ('releases', 'artist-search') and kind != 'artist':
        raise ResolverError('INVALID_ARGUMENT')
    if operation == 'search-snapshot':
        kind = None
    request = {'operation': operation}
    if kind is not None:
        request['kind'] = kind
    if operation in ('catalog-search', 'search-snapshot'):
        query = payload.get('query')
        if not isinstance(query, str) or not 3 <= len(query.strip()) <= 200:
            raise ResolverError('INVALID_QUERY')
        request['query'] = ' '.join(query.split())
        identity = request['query'].casefold()
    else:
        identifier = payload.get('id')
        if not isinstance(identifier, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,160}', identifier):
            raise ResolverError('INVALID_RESOURCE')
        request['id'] = identity = identifier
    if operation == 'search-snapshot':
        request['includeAlbums'] = True
    if operation == 'releases':
        if payload.get('section') not in ('albums', 'singles'):
            raise ResolverError('INVALID_ARGUMENT')
        request['section'] = payload['section']
    if operation == 'artist-search':
        query = payload.get('query', '')
        if not isinstance(query, str) or len(query) > 200 or payload.get('searchKind') not in ('track', 'album'):
            raise ResolverError('INVALID_ARGUMENT')
        request['query'], request['searchKind'] = ' '.join(query.split()), payload['searchKind']
    refresh = payload.get('refresh', False)
    if not isinstance(refresh, bool):
        raise ResolverError('INVALID_ARGUMENT')
    key = json.dumps([operation, kind, identity, request.get('section'), request.get('searchKind'), request.get('query', '').casefold() if operation == 'artist-search' else None])
    cached = None if refresh else cache_read(_catalog_cache, key, time.monotonic())
    if cached is not None:
        return {**cached, 'cached': True}
    if time.monotonic() < _cooldown_until:
        raise ResolverError('RATE_LIMITED')
    # Only validated metadata fields reach the common adapter. Caller-supplied
    # endpoints, headers, or alternate operations never cross this boundary.
    result = json.loads(shared.catalog(json.dumps(request, ensure_ascii=False), ios_identity_catalog=True)) if operation in ('search-snapshot', 'releases', 'artist-search') else json.loads(shared.catalog(json.dumps(request, ensure_ascii=False)))
    checkpoint()
    if not isinstance(result, dict):
        raise ResolverError('NATIVE_RESPONSE_INVALID')
    if operation == 'detail' and (result.get('id') != identity or result.get('kind') != kind):
        raise ResolverError('NATIVE_RESPONSE_INVALID')
    result = public_catalog(result)
    if operation in ('releases', 'artist-search'):
        result['artistId'] = identity
    # A partial failed section can be retried; don't cache it as a successful empty album catalog.
    if not result.get('albumsUnavailable'):
        cache_write(_catalog_cache, key, result, time.monotonic() + (120 if operation in ('catalog-search', 'search-snapshot', 'artist-search') else 600), 8)
    return {**result, 'cached': False}


_CATALOG_FIELDS = frozenset(('items', 'candidates', 'tracks', 'entries', 'albums', 'singles',
    'id', 'name', 'kind', 'artwork', 'description', 'artists', 'year', 'releaseType',
    'number', 'title', 'duration', 'videoId', 'artist', 'thumbnail', 'album', 'track',
    'reportedCount', 'incomplete', 'moreAlbums', 'moreSingles', 'truncated', 'albumsUnavailable', 'artistId'))


def public_catalog(value, depth=0):
    if depth > 8:
        raise ResolverError('RESULT_TOO_LARGE')
    if isinstance(value, dict):
        return {key: public_catalog(item, depth + 1) for key, item in value.items() if key in _CATALOG_FIELDS}
    if isinstance(value, list):
        if len(value) > 1000:
            raise ResolverError('RESULT_TOO_LARGE')
        return [public_catalog(item, depth + 1) for item in value]
    if isinstance(value, str) and len(value) > 24000:
        raise ResolverError('RESULT_TOO_LARGE')
    if isinstance(value, float) and not math.isfinite(value):
        raise ResolverError('NATIVE_RESPONSE_INVALID')
    return value


def valid_stream(value):
    if not isinstance(value, dict):
        raise ResolverError('INVALID_STREAM')
    try:
        parsed = urlparse(value.get('url', ''))
        if parsed.scheme != 'https' or not (parsed.hostname or '').endswith('.googlevideo.com') or parsed.username or parsed.password or parsed.port not in (None, 443):
            raise ValueError()
        expires = value.get('expires')
        if isinstance(expires, bool) or not isinstance(expires, (float, int)) or not math.isfinite(expires) or expires < time.time() + 45:
            raise ValueError()
        if value.get('container') != 'm4a' or not str(value.get('codec', '')).startswith(('mp4a', 'aac')) or value.get('protocol') != 'https':
            raise ValueError()
        duration = value.get('duration')
        if isinstance(duration, bool) or not isinstance(duration, (float, int)) or not math.isfinite(duration) or not 0 < duration <= 86400:
            raise ValueError()
        headers = value.get('headers')
        if not isinstance(headers, dict) or len(headers) > 5 or any(k.lower() not in {'user-agent', 'referer', 'origin', 'accept', 'accept-language'} or not isinstance(v, str) or len(v) > 2048 or '\r' in v or '\n' in v for k, v in headers.items()):
            raise ValueError()
    except (TypeError, ValueError, AttributeError):
        raise ResolverError('UNSUPPORTED_STREAM') from None
    return value


def resolve(video_id, refresh=False):
    try:
        shared._video_id(video_id)
    except ValueError:
        raise ResolverError('INVALID_VIDEO_ID') from None
    if not isinstance(refresh, bool):
        raise ResolverError('INVALID_ARGUMENT')
    if refresh:
        _stream_cache.pop(video_id, None)
    cached = cache_read(_stream_cache, video_id, time.time())
    if cached is not None:
        return {**valid_stream(cached), 'cacheHit': True}
    if time.monotonic() < _cooldown_until:
        raise ResolverError('RATE_LIMITED')
    _provider_signals.clear()
    result = valid_stream(json.loads(shared.resolve(video_id, format_selector='bestaudio[ext=m4a][acodec^=mp4a][protocol=https]', include_metadata=True)))
    checkpoint()
    cache_write(_stream_cache, video_id, result, min(result['expires'] - 45, time.time() + 300), 4)
    return {**result, 'cacheHit': False}


def status():
    return {'nativeIOS': sys.platform == 'ios', 'python': sys.version.split()[0],
            'openssl': ssl.OPENSSL_VERSION, 'trustedCAs': ssl.create_default_context().cert_store_stats()['x509_ca'],
            'versions': {name: importlib.metadata.version(name) for name in ('yt-dlp', 'yt-dlp-ejs', 'ytmusicapi', 'requests', 'certifi')},
            'engine': native.stats(), 'searchCacheLimit': 24, 'streamCacheLimit': 4,
            'audioPolicy': 'https-aac-m4a-only', 'externalProcesses': False, 'backendRequired': False}


def engine_checks():
    output = json.loads(native.evaluate('console.log(JSON.stringify({sum:[1,2,3].map(x=>x*2).reduce((a,b)=>a+b,0),io:typeof fetch,os:typeof std}));'))
    if output != {'sum': 12, 'io': 'undefined', 'os': 'undefined'}:
        raise ResolverError('ENGINE_CHECK_FAILED')
    started = time.monotonic()
    try:
        native.evaluate('while(true){}', 50)
    except RuntimeError:
        pass
    else:
        raise ResolverError('ENGINE_TIMEOUT_FAILED')
    if time.monotonic() - started > 2:
        raise ResolverError('ENGINE_TIMEOUT_FAILED')
    try:
        native.evaluate('new ArrayBuffer(256*1024*1024)')
    except RuntimeError:
        pass
    else:
        raise ResolverError('ENGINE_MEMORY_FAILED')
    for index in range(6):
        cache_write(_stream_cache, str(index), {'fixture': True}, time.time() + 30, 4)
    if len(_stream_cache) != 4 or cache_read(_stream_cache, '0', time.time()) is not None:
        raise ResolverError('CACHE_BOUND_FAILED')
    _stream_cache.clear()
    return {'javascript': True, 'noHostIO': True, 'executionLimit': True, 'memoryLimit': True, 'cacheEviction': True}


def invoke(payload_json):
    try:
        _provider_signals.clear()
        try:
            payload = json.loads(payload_json)
        except (json.JSONDecodeError, TypeError):
            raise ResolverError('INVALID_ARGUMENT') from None
        if not isinstance(payload, dict):
            raise ResolverError('INVALID_ARGUMENT')
        operation = payload.get('operation')
        checkpoint()
        if operation == 'status':
            value = status()
        elif operation == 'search':
            value = search(payload.get('query'))
        elif operation in ('catalog-search', 'detail', 'search-snapshot', 'releases', 'artist-search'):
            value = catalog(payload)
        elif operation == 'resolve':
            value = resolve(payload.get('videoId'), payload.get('refresh', False))
        elif operation == 'engine-check':
            value = engine_checks()
        elif operation == 'cancel-check':
            native.evaluate('while(true){}')
            raise ResolverError('CANCELLATION_FAILED')
        else:
            raise ResolverError('INVALID_ARGUMENT')
        checkpoint()
        return json.dumps({'ok': True, 'value': value}, ensure_ascii=False, allow_nan=False)
    except Exception as error:
        reason = native.abort_reason()
        code = ('CANCELLED' if reason == 'cancelled' else 'TIMEOUT') if reason else error.code if isinstance(error, ResolverError) else 'NETWORK_TIMEOUT' if isinstance(error, requests.Timeout) else 'PROVIDER_UNAVAILABLE'
        if code == 'PROVIDER_UNAVAILABLE':
            signal = provider_signal(error)
            signals = _provider_signals | ({signal} if signal else set())
            code = next((item for item in ('PROVIDER_SIGN_IN_REQUIRED', 'JS_CHALLENGE_FAILED', 'PROVIDER_TOKEN_REQUIRED', 'FORMAT_UNAVAILABLE', 'RATE_LIMITED', 'PROVIDER_REJECTED') if item in signals), code)
        # Provider errors may contain signed URLs. Never send their raw text to JS/logs.
        return json.dumps({'ok': False, 'error': code})
    finally:
        while _sessions:
            _sessions.pop().close()
