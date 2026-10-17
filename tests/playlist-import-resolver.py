import importlib.util
import pathlib
import unittest
path = pathlib.Path(__file__).resolve().parents[1] / 'scripts' / 'playlist-catalog.py'
spec = importlib.util.spec_from_file_location('playlist_catalog', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PlaylistTest(unittest.TestCase):
    def test_order_unavailable_duplicate_and_metadata_only(self):
        class Client:
            def get_playlist(self, identifier, **options):
                assert options == {'limit': 1001, 'related': False, 'suggestions_limit': 0}
                return {'title': 'Playlist', 'trackCount': 4, 'tracks': [
                    {'videoId': 'testmusic01', 'title': 'One', 'artists': [{'name': 'Channel'}], 'duration': '1:23'},
                    {'videoId': 'testmusic02', 'title': 'Private', 'isAvailable': False},
                    {'videoId': 'testmusic01', 'title': 'Copy'},
                    {'title': 'Deleted'}]}
        result = module.playlist({'id': 'PLremote_test1234'}, Client())
        self.assertEqual(len(result['entries']), 4)
        self.assertEqual(result['entries'][0]['track']['duration'], 83)
        self.assertEqual(result['entries'][0]['track']['artist'], 'Channel')
        self.assertIsNone(result['entries'][1]['track'])
        self.assertIsNone(result['entries'][3]['track'])
        self.assertEqual(result['entries'][2]['track']['videoId'], 'testmusic01')
        self.assertNotIn('url', result['entries'][0]['track'])

    def test_invalid_identifiers_never_call_provider(self):
        class Client:
            def get_playlist(self, *args, **kwargs):
                raise AssertionError('Unexpected request')
        for identifier in ['LM', 'RDtestmusic01', 'https://evil.test', 'PLbad&params']:
            with self.assertRaises(ValueError):
                module.playlist({'id': identifier}, Client())


if __name__ == '__main__':
    unittest.main()
