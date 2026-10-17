"""Bounded public Home metadata. No cookies, credentials, audio or stream URLs."""
import re
from concurrent.futures import ThreadPoolExecutor
import requests
from ytmusicapi import YTMusic

class HomeSession(requests.Session):
    def request(self, method, url, **kwargs):
        kwargs['timeout'] = (3, 5)
        return super().request(method, url, **kwargs)

def client():
    # Do not force an Italian market. Explore follows the provider's own region;
    # only get_charts('ZZ') below is explicitly worldwide.
    return YTMusic(requests_session=HomeSession(), language='en')

def playlist_id(value):
    value = value[2:] if isinstance(value, str) and value.startswith('VL') else value
    return value if isinstance(value, str) and re.fullmatch(r'[A-Za-z0-9_-]{1,160}', value) else None

def home_catalog(payload, song, resource, thumbnail):
    if payload.get('operation') == 'situation-index':
        raw = client().get_mood_categories()
        all_categories = [item for group in raw.values() if isinstance(group, list) for item in group if isinstance(item, dict)]
        aliases = {'focus':['Focus','Concentration','Study'], 'travel':['Commute','Travel','Road Trip'], 'energy':['Energize','Energy','Feel Good'], 'relax':['Relax','Chill','Sleep'], 'workout':['Workout','Fitness'], 'party':['Party']}
        result = []
        for key, names in aliases.items():
            match = next((item for name in names for item in all_categories if str(item.get('title','')).casefold() == name.casefold() and item.get('params')), None)
            if match:
                result.append({'id':key,'params':match['params'],'sourceTitle':match['title']})
        return {'items':result}
    if payload.get('operation') == 'situation-playlists':
        params = payload.get('params')
        if not isinstance(params, str) or not re.fullmatch(r'[A-Za-z0-9_=%+\-]{1,1024}', params):
            raise ValueError('Invalid situation')
        raw = client().get_mood_playlists(params)
        seen, result = set(), []
        for item in raw:
            identifier = playlist_id(item.get('playlistId') or item.get('browseId'))
            if identifier and identifier not in seen and item.get('title'):
                seen.add(identifier)
                author = item.get('author') or ''
                if isinstance(author, list): author = ', '.join(str(a.get('name','')) for a in author if isinstance(a,dict))
                if isinstance(author, dict): author = author.get('name','')
                result.append({'id':identifier,'title':item['title'],'author':str(author),'artwork':thumbnail(item)})
        return {'items':result[:12]}
    if payload.get('operation') == 'home-index':
        collections = []
        api = client()
        for country, identifier in [('ZZ', 'global')]:
            try:
                charts = api.get_charts(country)
                candidates = charts.get('videos') or []
                # Never silently substitute daily/trending charts for a weekly Top 100.
                item = next((v for v in candidates if isinstance(v, dict) and '100' in (v.get('title') or '') and playlist_id(v.get('playlistId'))), None)
                if item:
                    collections.append({'id':identifier,'playlistId':playlist_id(item['playlistId']),'sourceTitle':item.get('title') or '', 'country':country,'artwork':thumbnail(item),'albums':[]})
            except Exception:
                pass
        try:
            explore = api.get_explore()
            releases = [resource(item, 'album') for item in (explore.get('new_releases') or [])[:24] if item.get('browseId')]
            if releases:
                collections.append({'id':'releases','playlistId':None,'sourceTitle':'YouTube Music · Explore','country':None,'artwork':releases[0]['artwork'],'albums':releases})
        except Exception:
            pass
        return {'collections':collections}
    collection = payload.get('collection')
    if not isinstance(collection, dict) or collection.get('id') not in ['italy','global','trending','releases']:
        raise ValueError('Invalid Home collection')
    if collection['id'] == 'releases':
        # Eight albums, two songs each: at most eight bounded metadata reads,
        # two at a time. Never crawl the whole catalog just to paint the Home.
        albums = collection.get('albums') or []
        def album_songs(album):
            try:
                if not re.fullmatch(r'[A-Za-z0-9_-]{1,160}', str(album.get('id') or '')):
                    raise ValueError('Invalid album')
                raw = client().get_album(album['id'])
                items = [song(t, album.get('artists'), {'id':album['id'],'name':album['name']}) for t in raw.get('tracks') or [] if t.get('isAvailable') is not False and re.fullmatch(r'[A-Za-z0-9_-]{11}', str(t.get('videoId') or ''))]
                return items[:2], False
            except Exception:
                return [], True
        with ThreadPoolExecutor(max_workers=2) as pool:
            batches = list(pool.map(album_songs, albums[:8]))
        return {'tracks':[track for batch, _ in batches for track in batch], 'partial':any(failed for _, failed in batches)}
    identifier = playlist_id(collection.get('playlistId'))
    if not identifier:
        raise ValueError('Invalid Home playlist')
    raw = client().get_playlist(identifier, limit=100)
    tracks = [song(item) for item in (raw.get('tracks') or [])[:100] if item.get('isAvailable') is not False and re.fullmatch(r'[A-Za-z0-9_-]{11}', str(item.get('videoId') or ''))]
    return {'tracks':tracks, 'partial':len(tracks)<min(100, raw.get('trackCount') or len(tracks))}
