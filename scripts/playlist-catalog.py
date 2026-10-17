"""Public playlist metadata only; no media resolution, cookies or audio downloads."""
import json
import re
import sys
from ytmusicapi import YTMusic


def playlist(payload, client=None):
    identifier = payload.get('id')
    if not isinstance(identifier, str) or not re.fullmatch(r'(?:PL|OLAK5uy_|RDCLAK5uy_)[A-Za-z0-9_-]{8,150}', identifier):
        raise ValueError('Invalid playlist id')
    raw = (client or YTMusic(language='en')).get_playlist(identifier, limit=1001, related=False, suggestions_limit=0)
    if not isinstance(raw.get('tracks'), list) or not raw.get('title'):
        raise ValueError('Missing playlist metadata')
    entries = []
    for item in raw['tracks'][:1001]:
        item = item if isinstance(item, dict) else {}
        people = item.get('artists') or []
        names = [a['name'] for a in people if isinstance(a, dict) and isinstance(a.get('name'), str)]
        credits = [a for a in people if isinstance(a, dict) and a.get('id') and a.get('name')]
        video = item.get('videoId')
        available = item.get('isAvailable') is not False and isinstance(video, str) and re.fullmatch(r'[A-Za-z0-9_-]{11}', video)
        duration = item.get('duration_seconds') or 0
        if not duration and isinstance(item.get('duration'), str) and re.fullmatch(r'\d+(?::\d{2}){1,2}', item['duration']):
            for part in item['duration'].split(':'):
                duration = duration * 60 + int(part)
        title = item.get('title') or 'Contenuto non disponibile'
        entries.append({'title': title, 'track': {'videoId': video, 'title': title, 'artist': ', '.join(names) or 'YouTube Music', 'artists': credits,
                        'album': item.get('album'), 'duration': duration} if available else None})
    author = raw.get('author') or {}
    thumbnails = raw.get('thumbnails') or []
    return {'title': raw['title'], 'description': raw.get('description') or '', 'author': author.get('name', '') if isinstance(author, dict) else '',
            'artwork': thumbnails[-1].get('url') if thumbnails else None, 'entries': entries,
            'reportedCount': raw.get('trackCount'), 'partial': len(raw['tracks']) > 1000}


if __name__ == '__main__':
    try:
        print(json.dumps(playlist(json.load(sys.stdin)), ensure_ascii=False))
    except Exception as error:
        print(type(error).__name__ + ': ' + str(error), file=sys.stderr)
        sys.exit(1)
