import importlib.util
import json
from pathlib import Path
import unittest
import types
from unittest.mock import patch, MagicMock

source = Path(__file__).resolve().parents[1] / 'apps/mobile/android/app/src/main/python/ritvio_resolver.py'
spec = importlib.util.spec_from_file_location('ritvio_android_resolver_test', source)
resolver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(resolver)


class AndroidResolverTests(unittest.TestCase):
    def test_duration_and_identifiers(self):
        self.assertEqual(resolver._duration({'duration': '1:02:03'}), 3723)
        self.assertEqual(resolver._duration({'duration': '3:09'}), 189)
        self.assertEqual(resolver._duration({'duration': 'live'}), 0)
        for value in ['../file', 'https://example.com', '', 42]:
            with self.assertRaises(ValueError): resolver._video_id(value)

    def test_search_keeps_only_valid_music_and_deduplicates(self):
        song = {'videoId': 'abcdefghijk', 'resultType': 'song', 'title': 'Titolo', 'artists': [{'name': 'Artista'}], 'duration': '3:04', 'thumbnails': [{'url': 'http://unsafe.invalid/image'}]}
        with patch.object(resolver, 'YTMusic') as client:
            client.return_value.search.return_value = [song, song, {**song, 'videoId': '12345678901', 'resultType': 'video'}, {**song, 'videoId': '12345678902', 'isAvailable': False}, {**song, 'videoId': '../wrong'}]
            result = json.loads(resolver.search('Artista'))
        self.assertEqual(len(result['items']), 1)
        self.assertEqual(result['items'][0]['duration'], 184)
        self.assertEqual(result['items'][0]['thumbnail'], 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg')

    def test_search_bounds(self):
        for query in ['ab', 'x' * 201, None]:
            with self.assertRaises(ValueError): resolver.search(query)

    def test_radio_reuses_catalog_and_requests_initial_watch_page_only(self):
        module=types.SimpleNamespace()
        def catalog(payload):
            client=module.YTMusic(language='en',location='IT')
            return client.get_watch_playlist(videoId=payload['videoId'],radio=True,limit=51)
        module.catalog=catalog
        with patch.dict('sys.modules',{'music_catalog':module}),patch.object(resolver,'YTMusic') as client:
            client.return_value.get_watch_playlist.return_value={'items':[{'videoId':'abcdefghijk','title':'Brano','artist':'Artista'}]}
            watch=client.return_value.get_watch_playlist
            value=json.loads(resolver.catalog(json.dumps({'operation':'radio','videoId':'abcdefghijk'})))
            watch.assert_called_once_with(videoId='abcdefghijk',radio=True,limit=1)
            self.assertEqual(value['items'][0]['thumbnail'],'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg')

    def test_catalog_uses_album_cover_but_not_artist_portrait_for_tracks(self):
        song={'videoId':'abcdefghijk','title':'Brano','artist':'Artista','duration':120}
        portrait='https://lh3.googleusercontent.com/artist'
        artist=resolver._catalog_value({'kind':'artist','artwork':portrait,'tracks':[song]})
        self.assertEqual(artist['artwork'],portrait)
        self.assertEqual(artist['tracks'][0]['thumbnail'],'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg')
        album=resolver._catalog_value({'kind':'album','artwork':portrait,'entries':[{'track':song}]})
        self.assertEqual(album['entries'][0]['track']['thumbnail'],portrait)
        self.assertIsNone(resolver._catalog_value({'artwork':'https://untrusted.invalid/cover'})['artwork'])

    def test_lyrics_are_bounded_and_missing_is_not_fabricated(self):
        lookup=MagicMock(return_value={'plainLyrics':None,'syncedLyrics':None,'instrumental':False})
        with patch.dict('sys.modules',{'lyrics_provider':types.SimpleNamespace(lookup=lookup)}):
            missing=json.loads(resolver.lyrics('Titolo','Artista, Ospite',123,'Artista'))
            self.assertIsNone(missing['plainLyrics'])
            lookup.assert_called_once_with('Titolo','Artista, Ospite',123,'Artista')

    def test_playlist_preview_is_metadata_only_and_preserves_missing_slots(self):
        raw={'title':'Playlist','description':'','author':'Autore','artwork':None,'reportedCount':3,'entries':[{'title':'Brano','track':{'videoId':'abcdefghijk','title':'Brano','artist':'Artista','duration':120}},{'title':'Privato','track':None}]}
        module=types.SimpleNamespace(playlist=MagicMock(return_value=raw))
        cancellation=MagicMock();cancellation.isCancelled.return_value=False
        with patch.dict('sys.modules',{'playlist_catalog':module}),patch.object(resolver,'YTMusic'),patch.object(resolver.yt_dlp,'YoutubeDL') as audio:
            result=json.loads(resolver.playlist_preview('PLabcdefghijklmno',cancellation));audio.assert_not_called()
        self.assertEqual(result['entries'][1]['number'],2);self.assertIsNone(result['entries'][1]['track']);self.assertTrue(result['partial']);self.assertEqual(result['provider'],'youtube-music')

    def test_playlist_cancel_and_invalid_ids_do_not_create_a_preview(self):
        cancellation=MagicMock();cancellation.isCancelled.return_value=True
        with self.assertRaises(ValueError):resolver.playlist_preview('../bad',cancellation)
        module=types.SimpleNamespace(playlist=MagicMock(return_value={'title':'Playlist','entries':[]}))
        with patch.dict('sys.modules',{'playlist_catalog':module}),patch.object(resolver,'YTMusic'):
            with self.assertRaises(RuntimeError):resolver.playlist_preview('PLabcdefghijklmno',cancellation)

    def test_resolution_never_downloads_and_filters_headers(self):
        resolver.initialize(MagicMock())
        info = {'url': 'https://r1.googlevideo.com/audio?expire=9999999999', 'vcodec': 'none', 'is_live': False, 'http_headers': {'User-Agent': 'Agent', 'Cookie': 'private', 'Referer': 'bad\r\nheader'}}
        with patch.object(resolver.yt_dlp, 'YoutubeDL') as dl:
            dl.return_value.__enter__.return_value.extract_info.return_value = info
            result = json.loads(resolver.resolve('abcdefghijk'))
            dl.return_value.__enter__.return_value.extract_info.assert_called_once_with('https://www.youtube.com/watch?v=abcdefghijk', download=False)
            self.assertTrue(dl.call_args.args[0]['skip_download'])
        self.assertEqual(result['headers'], {'User-Agent': 'Agent'})

    def test_rejects_untrusted_streams_video_and_live(self):
        resolver.initialize(MagicMock())
        for update in [{'url': 'https://evilgooglevideo.com/file'}, {'url': 'http://r1.googlevideo.com/file'}, {'vcodec': 'h264'}, {'is_live': True}]:
            info = {'url': 'https://r1.googlevideo.com/audio', 'vcodec': 'none', 'is_live': False, **update}
            with patch.object(resolver.yt_dlp, 'YoutubeDL') as dl:
                dl.return_value.__enter__.return_value.extract_info.return_value = info
                with self.assertRaises(ValueError): resolver.resolve('abcdefghijk')


if __name__ == '__main__': unittest.main()
