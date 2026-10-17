import importlib.util
import pathlib
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('music_catalog', pathlib.Path(__file__).parents[1] / 'scripts/music-catalog.py')
catalog = importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalog)

class RadioCatalogTest(unittest.TestCase):
    def test_watch_lengths_and_existing_duration_formats(self):
        self.assertEqual(catalog.seconds({'length': '3:07'}), 187)
        self.assertEqual(catalog.seconds({'length': '1:02:03'}), 3723)
        self.assertEqual(catalog.seconds({'duration_seconds': 21, 'length': '3:07'}), 21)
        self.assertEqual(catalog.seconds({'duration': '2:31'}), 151)
        self.assertEqual(catalog.seconds({'length': 'unknown'}), 0)

    @patch.object(catalog, 'YTMusic')
    def test_bounded_radio_filters_and_passes_only_public_catalog_fields(self, constructor):
        client = constructor.return_value
        client.get_watch_playlist.return_value = {'tracks': [
            {'videoId': 'testmusic01', 'title': 'Song', 'length': '3:07', 'videoType': 'MUSIC_VIDEO_TYPE_ATV', 'artists': [{'id': 'UCtest', 'name': 'Artist'}], 'album': {'id': 'MPREtest', 'name': 'Album'}, 'feedbackTokens': {'private': 'do-not-pass'}},
            {'videoId': 'testmusic02', 'title': 'Unavailable', 'isAvailable': False},
            {'videoId': 'testvideo03', 'title': 'User video', 'videoType': 'MUSIC_VIDEO_TYPE_UGC'},
        ]}
        result = catalog.catalog({'operation': 'radio', 'videoId': 'testmusic01'})
        client.get_watch_playlist.assert_called_once_with(videoId='testmusic01', radio=True, limit=51)
        self.assertEqual(len(result['items']), 1)
        self.assertEqual(result['items'][0]['duration'], 187)
        self.assertNotIn('feedbackTokens', result['items'][0])
        client.get_watch_playlist.return_value = {'tracks': [{'videoId': 'testmusic01', 'title': 'Song'}] * 100}
        self.assertEqual(len(catalog.catalog({'operation': 'radio', 'videoId': 'testmusic01'})['items']), 51)

    @patch.object(catalog, 'YTMusic')
    def test_invalid_seed_never_calls_provider(self, constructor):
        with self.assertRaises(ValueError):
            catalog.catalog({'operation': 'radio', 'videoId': 'invalid'})
        constructor.assert_not_called()

if __name__ == '__main__':
    unittest.main()
