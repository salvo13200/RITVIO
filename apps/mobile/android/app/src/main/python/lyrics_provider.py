"""Bounded LRCLIB lookup. No media requests; no lyrics from unrelated artists."""
import json
import math
import re
import threading
import time
import unicodedata

import requests

_lock = threading.Lock()
_next_at = 0.0
_blocked_until = 0.0
_empty = {'plainLyrics': None, 'syncedLyrics': None, 'instrumental': False}


def _signature(value):
    return ' '.join(''.join(c if c.isalnum() else ' ' for c in unicodedata.normalize('NFKC', value).casefold()).split())


def _title(value):
    return re.sub(r'\s*[([](?:official\s+(?:audio|video|music video)|lyrics?|lyric video|audio)[)\]]\s*$', '', value, flags=re.I).strip()


def _artist(value):
    return re.sub(r'\s*-\s*Topic$', '', value, flags=re.I).strip()


def _text(value, limit=190000):
    return value.encode('utf-8')[:limit].decode('utf-8', errors='ignore').strip() if isinstance(value, str) else ''


def _remote(path, params, deadline):
    global _next_at, _blocked_until
    now = time.monotonic()
    if now < _blocked_until:
        raise RuntimeError('LYRICS_RATE_LIMIT')
    if _next_at > now:
        time.sleep(min(_next_at - now, max(0, deadline - now)))
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise TimeoutError('Lyrics time budget exceeded')
    try:
        with requests.get('https://lrclib.net/api/' + path, params=params,
                          headers={'User-Agent': 'RITVIO Android lyrics client', 'Accept': 'application/json'},
                          timeout=(min(3, remaining), min(8, remaining)), stream=True, allow_redirects=False) as response:
            if response.status_code == 429:
                retry = response.headers.get('Retry-After', '60')
                seconds = int(retry) if retry.isdigit() else 60
                _blocked_until = time.monotonic() + max(1, min(300, seconds))
                raise RuntimeError('LYRICS_RATE_LIMIT')
            if response.status_code == 404 or path == 'get' and response.status_code == 400:
                return None
            response.raise_for_status()
            if response.status_code != 200:
                raise ValueError('Unexpected lyrics response')
            chunks, size = [], 0
            for chunk in response.iter_content(16384):
                size += len(chunk)
                if size > 2_000_000 or time.monotonic() > deadline:
                    raise ValueError('Lyrics response limit exceeded')
                chunks.append(chunk)
            return json.loads(b''.join(chunks))
    finally:
        _next_at = time.monotonic() + .35


def _candidate(record, title, names, duration):
    if not isinstance(record, dict) or not isinstance(record.get('trackName'), str) or not isinstance(record.get('artistName'), str):
        return None
    if _signature(_title(record['trackName'])) != _signature(title) or _signature(_artist(record['artistName'])) not in names:
        return None
    seconds = record.get('duration')
    if isinstance(seconds, bool) or not isinstance(seconds, (int, float)) or not math.isfinite(seconds) or not 0 < seconds <= 86400:
        return None
    difference = abs(seconds - duration) if duration else 0
    if duration and difference > 10:
        return None
    plain, synced = _text(record.get('plainLyrics')), _text(record.get('syncedLyrics'))
    instrumental = record.get('instrumental') is True
    if not plain and not synced and not instrumental:
        return None
    # An unknown duration or a different intro must not produce false karaoke timing.
    if not duration or difference > 2:
        if not plain and synced:
            plain = '\n'.join(re.sub(r'^(?:\[\d{1,4}:[0-5]\d(?:[.:]\d{1,3})?\])+', '', row).strip()
                              for row in synced.splitlines() if re.match(r'^\[\d{1,4}:', row))
        synced = ''
    return (difference, not bool(synced), {'plainLyrics': plain or None, 'syncedLyrics': synced or None, 'instrumental': instrumental})


def lookup(title, artist, duration, primary_artist=None):
    if not isinstance(title, str) or not isinstance(artist, str) or not 0 < len(title) <= 300 or not 0 < len(artist) <= 300:
        raise ValueError('Invalid lyrics metadata')
    title, artist = _title(title), _artist(artist)
    primary = _artist(primary_artist) if isinstance(primary_artist, str) and primary_artist.strip() else artist.split(', ')[0]
    names = {_signature(artist), _signature(primary)}
    seconds = float(duration)
    seconds = seconds if math.isfinite(seconds) and 0 < seconds <= 86400 else 0
    with _lock:
        deadline = time.monotonic() + 18
        # /get rejects zero and >3600-second durations; search permits missing duration.
        if 1 <= seconds <= 3600:
            value = _remote('get', {'track_name': title, 'artist_name': primary, 'duration': round(seconds)}, deadline)
            found = _candidate(value, title, names, seconds)
            if found:
                return found[2]
        values = _remote('search', {'track_name': title, 'artist_name': primary}, deadline)
        if values is None:
            return dict(_empty)
        if not isinstance(values, list):
            raise ValueError('Invalid lyrics search response')
        candidates = [candidate for value in values[:50] if (candidate := _candidate(value, title, names, seconds))]
        return min(candidates, key=lambda item: item[:2])[2] if candidates else dict(_empty)
