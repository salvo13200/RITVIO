import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch

source = Path(__file__).resolve().parents[1] / 'apps/mobile/android/app/src/main/python/lyrics_provider.py'
spec = importlib.util.spec_from_file_location('android_lyrics_provider_test', source)
provider = importlib.util.module_from_spec(spec)
spec.loader.exec_module(provider)


def record(**changes):
    return {'trackName': 'Titolo', 'artistName': 'Artista', 'duration': 200,
            'plainLyrics': 'Prima riga\nSeconda riga', 'syncedLyrics': '[00:01.00]Prima riga',
            'instrumental': False, **changes}


def response(status=200, value=None, headers=None):
    result = MagicMock()
    result.status_code = status
    result.headers = headers or {}
    result.iter_content.return_value = [json.dumps(value).encode()]
    result.__enter__.return_value = result
    return result


class LyricsLookupTests(unittest.TestCase):
    def setUp(self):
        provider._next_at = provider._blocked_until = 0
        self.sleep = patch.object(provider.time, 'sleep').start()
        self.addCleanup(patch.stopall)

    def test_unknown_duration_uses_search_and_plain_text_not_invalid_zero_get(self):
        with patch.object(provider.requests, 'get', return_value=response(value=[record()])) as get:
            value = provider.lookup('Titolo', 'Artista', 0)
        self.assertTrue(get.call_args.args[0].endswith('/search'))
        self.assertNotIn('duration', get.call_args.kwargs['params'])
        self.assertEqual(value['plainLyrics'], 'Prima riga\nSeconda riga')
        self.assertIsNone(value['syncedLyrics'])

    def test_primary_credit_and_topic_and_promotional_suffix_are_normalized(self):
        with patch.object(provider.requests, 'get', return_value=response(value=record())) as get:
            value = provider.lookup('Titolo (Official Audio)', 'Artista, Ospite', 200, 'Artista - Topic')
        self.assertEqual(get.call_args.kwargs['params'], {'track_name': 'Titolo', 'artist_name': 'Artista', 'duration': 200})
        self.assertIsNotNone(value['syncedLyrics'])
        self.assertEqual(get.call_count, 1)

    def test_404_falls_back_and_selects_correct_artist_and_duration(self):
        values = [record(artistName='Estraneo'), record(trackName='Titolo (Live)'), record(duration=250), record(duration=201)]
        with patch.object(provider.requests, 'get', side_effect=[response(404), response(value=values)]) as get:
            value = provider.lookup('Titolo', 'Artista', 200)
        self.assertEqual(get.call_count, 2)
        self.assertIsNotNone(value['syncedLyrics'])

    def test_invalid_exact_request_can_recover_via_search(self):
        with patch.object(provider.requests, 'get', side_effect=[response(400), response(value=[record()])]):
            self.assertTrue(provider.lookup('Titolo', 'Artista', 200)['plainLyrics'])

    def test_intro_duration_difference_shows_plain_without_wrong_timing(self):
        with patch.object(provider.requests, 'get', return_value=response(value=record(duration=205))):
            value = provider.lookup('Titolo', 'Artista', 200)
        self.assertTrue(value['plainLyrics'])
        self.assertIsNone(value['syncedLyrics'])

    def test_mismatched_song_or_version_never_becomes_the_lyrics(self):
        values = [record(artistName='Cover Band'), record(trackName='Titolo (Remix)'), record(duration=220)]
        with patch.object(provider.requests, 'get', side_effect=[response(404), response(value=values)]):
            self.assertEqual(provider.lookup('Titolo', 'Artista', 200), provider._empty)

    def test_rate_limit_stops_fallback_and_subsequent_network_until_cooldown(self):
        with patch.object(provider.requests, 'get', return_value=response(429, headers={'Retry-After': '60'})) as get:
            for _ in range(2):
                with self.assertRaisesRegex(RuntimeError, 'LYRICS_RATE_LIMIT'):
                    provider.lookup('Titolo', 'Artista', 200)
        self.assertEqual(get.call_count, 1)

    def test_network_failure_is_not_cached_or_changed_to_missing(self):
        with patch.object(provider.requests, 'get', side_effect=provider.requests.Timeout):
            with self.assertRaises(provider.requests.Timeout):
                provider.lookup('Titolo', 'Artista', 200)
        with patch.object(provider.requests, 'get', return_value=response(value=record())):
            self.assertTrue(provider.lookup('Titolo', 'Artista', 200)['plainLyrics'])

    def test_payload_is_bounded_in_utf8_bytes_for_shared_parser(self):
        with patch.object(provider.requests, 'get', return_value=response(value=record(plainLyrics='è' * 160000))):
            value = provider.lookup('Titolo', 'Artista', 200)
        self.assertLessEqual(len(value['plainLyrics'].encode()), 190000)

    def test_oversized_stream_is_rejected_and_closed(self):
        oversized = response()
        oversized.iter_content.return_value = [b'x' * 2_000_001]
        with patch.object(provider.requests, 'get', return_value=oversized):
            with self.assertRaises(ValueError):
                provider.lookup('Titolo', 'Artista', 200)
        oversized.__exit__.assert_called_once()

    def test_instrumental_and_real_missing_remain_distinct(self):
        with patch.object(provider.requests, 'get', return_value=response(value=record(instrumental=True, plainLyrics=None, syncedLyrics=None))):
            self.assertTrue(provider.lookup('Titolo', 'Artista', 200)['instrumental'])
        with patch.object(provider.requests, 'get', side_effect=[response(404), response(value=[])]):
            self.assertEqual(provider.lookup('Titolo', 'Artista', 200), provider._empty)

    def test_unknown_duration_can_read_timed_only_source_as_plain(self):
        with patch.object(provider.requests, 'get', return_value=response(value=[record(plainLyrics=None)])):
            value = provider.lookup('Titolo', 'Artista', 0)
        self.assertEqual(value['plainLyrics'], 'Prima riga')
        self.assertIsNone(value['syncedLyrics'])


if __name__ == '__main__':
    unittest.main()
