"""Bounded genre/mood discovery from the provider. Metadata only, no audio reads."""
import re

PARAMS = re.compile(r'[A-Za-z0-9_=%+\-]{1,1024}')
IDENTIFIER = re.compile(r'[A-Za-z0-9_-]{1,160}')


def catalog(payload, client, song, thumbnail):
    operation = payload['operation']
    api = client(language='en')
    if operation == 'browse-index':
        result = {'genres': [], 'moods': []}
        seen = set()
        for group, values in api.get_mood_categories().items():
            if not isinstance(values, list):
                continue
            target = 'genres' if 'genre' in str(group).lower() else 'moods'
            for item in values[:100]:
                if not isinstance(item, dict):
                    continue
                params, title = item.get('params'), item.get('title')
                if not isinstance(params, str) or not PARAMS.fullmatch(params) or not isinstance(title, str) or not title.strip() or params in seen:
                    continue
                seen.add(params)
                if len(result[target]) < 60:
                    result[target].append({'id': params, 'params': params, 'name': title[:100]})
        return result
    if operation == 'browse-playlists':
        params = payload.get('params', '')
        if not isinstance(params, str) or not PARAMS.fullmatch(params):
            raise ValueError('Invalid category')
        results, seen = [], set()
        for item in api.get_mood_playlists(params)[:100]:
            identifier = item.get('playlistId') or item.get('browseId') or ''
            if identifier.startswith('VL'):
                identifier = identifier[2:]
            if not IDENTIFIER.fullmatch(identifier) or identifier in seen or not item.get('title'):
                continue
            seen.add(identifier)
            results.append({'id': identifier, 'name': str(item['title'])[:300], 'artwork': thumbnail(item)})
            if len(results) >= 24:
                break
        return {'playlists': results}
    if operation != 'browse-tracks':
        raise ValueError('Invalid discovery operation')
    identifier = payload.get('id', '')
    if not isinstance(identifier, str) or not IDENTIFIER.fullmatch(identifier):
        raise ValueError('Invalid playlist')
    raw = api.get_playlist(identifier, limit=100)
    tracks = []
    for item in (raw.get('tracks') or [])[:100]:
        if item.get('isAvailable') is False or not re.fullmatch(r'[A-Za-z0-9_-]{11}', str(item.get('videoId') or '')):
            continue
        track = song(item)
        track['thumbnail'] = thumbnail(item) or thumbnail(raw)
        tracks.append(track)
    return {'name': str(raw.get('title') or '')[:300], 'artwork': thumbnail(raw), 'tracks': tracks,
            'partial': len(tracks) < min(100, raw.get('trackCount') or len(tracks))}
