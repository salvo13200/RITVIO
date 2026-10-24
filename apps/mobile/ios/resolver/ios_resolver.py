"""Bounded iOS policy around the existing mobile metadata/stream adapter.

Only the native owner receives signed descriptors. Public diagnostics omit URLs
and request headers. Python and the challenge engine run inside the app process.
"""
from collections import OrderedDict
import importlib.metadata
import json
import math
import os
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
_stream_cache = OrderedDict()
_cooldown_until = 0.0


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


def resolve(video_id):
    try:
        shared._video_id(video_id)
    except ValueError:
        raise ResolverError('INVALID_VIDEO_ID') from None
    cached = cache_read(_stream_cache, video_id, time.time())
    if cached is not None:
        return {**valid_stream(cached), 'cacheHit': True}
    if time.monotonic() < _cooldown_until:
        raise ResolverError('RATE_LIMITED')
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
        elif operation == 'resolve':
            value = resolve(payload.get('videoId'))
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
        # Provider errors may contain signed URLs. Never send their raw text to JS/logs.
        return json.dumps({'ok': False, 'error': code})
    finally:
        while _sessions:
            _sessions.pop().close()
