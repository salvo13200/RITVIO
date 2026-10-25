"""Host policy tests; these do not claim to run the native Python/JS engines."""
from pathlib import Path
import importlib.util
import json
import sys
import time
import types
import unittest
from unittest.mock import MagicMock, patch

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / 'apps/mobile/ios/App/Runtime/site-packages'))
sys.path.insert(0, str(root / 'apps/mobile/android/app/src/main/python'))
native = types.SimpleNamespace(abort_reason=MagicMock(return_value=None), evaluate=MagicMock(), stats=lambda: {'jit': False})
sys.modules['_ritvio_native'] = native
spec = importlib.util.spec_from_file_location('ios_resolver_test_module', root / 'apps/mobile/ios/resolver/ios_resolver.py')
resolver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(resolver)


class IOSResolverTests(unittest.TestCase):
    def setUp(self):
        native.abort_reason.return_value = None
        resolver._search_cache.clear(); resolver._stream_cache.clear(); resolver._cooldown_until = 0
        self.stream = {'url': 'https://r1.googlevideo.com/audio?expire=9999999999&signature=private-value',
                       'expires': time.time() + 600, 'headers': {'User-Agent': 'Agent'},
                       'container': 'm4a', 'codec': 'mp4a.40.2', 'protocol': 'https', 'duration': 180}

    def call(self, **payload):
        return json.loads(resolver.invoke(json.dumps(payload)))

    def test_invalid_inputs_never_reach_the_provider(self):
        with patch.object(resolver.shared, 'search') as search, patch.object(resolver.shared, 'resolve') as stream:
            for query in ('', 'ab', None, 'x' * 201):
                self.assertEqual(self.call(operation='search', query=query)['error'], 'INVALID_QUERY')
            for identifier in ('../bad', 'https://host.test', None):
                self.assertEqual(self.call(operation='resolve', videoId=identifier)['error'], 'INVALID_VIDEO_ID')
            search.assert_not_called(); stream.assert_not_called()
        self.assertEqual(json.loads(resolver.invoke('{'))['error'], 'INVALID_ARGUMENT')

    def test_search_reuses_bounded_cache_and_returns_independent_values(self):
        with patch.object(resolver.shared, 'search', return_value=json.dumps({'items': [{'videoId': 'abcdefghijk'}]})) as provider:
            first = resolver.search('  Daft   Punk ')
            first['items'].clear()
            second = resolver.search('daft punk')
            self.assertTrue(second['cacheHit']); self.assertEqual(len(second['items']), 1)
            provider.assert_called_once_with('Daft Punk')

    def test_stream_is_aac_https_only_and_warm_requests_reuse_it(self):
        with patch.object(resolver.shared, 'resolve', return_value=json.dumps(self.stream)) as provider:
            self.assertFalse(resolver.resolve('abcdefghijk')['cacheHit'])
            self.assertTrue(resolver.resolve('abcdefghijk')['cacheHit'])
            provider.assert_called_once_with('abcdefghijk', format_selector='bestaudio[ext=m4a][acodec^=mp4a][protocol=https]', include_metadata=True)

    def test_expired_streams_are_not_reused(self):
        resolver.cache_write(resolver._stream_cache, 'abcdefghijk', self.stream, time.time() - 1, 4)
        with patch.object(resolver.shared, 'resolve', return_value=json.dumps(self.stream)) as provider:
            self.assertFalse(resolver.resolve('abcdefghijk')['cacheHit']); provider.assert_called_once()

    def test_explicit_refresh_evicts_only_target_and_preserves_cooldown(self):
        with patch.object(resolver.shared, 'resolve', return_value=json.dumps(self.stream)) as provider:
            resolver.resolve('abcdefghijk'); resolver.resolve('lmnopqrstuv')
            self.assertFalse(resolver.resolve('abcdefghijk', refresh=True)['cacheHit'])
            self.assertTrue(resolver.resolve('lmnopqrstuv')['cacheHit'])
            self.assertEqual(provider.call_count, 3)
            resolver._cooldown_until = time.monotonic() + 30
            with self.assertRaises(resolver.ResolverError): resolver.resolve('abcdefghijk', refresh=True)
            self.assertEqual(provider.call_count, 3)
        self.assertEqual(self.call(operation='resolve', videoId='abcdefghijk', refresh='yes')['error'], 'INVALID_ARGUMENT')

    def test_descriptor_rejects_incompatible_untrusted_or_expired_audio(self):
        updates = [{'url': 'https://evilgooglevideo.com/a'}, {'url': 'http://r1.googlevideo.com/a'}, {'url': 'https://user:password@r1.googlevideo.com/a'},
                   {'url': 'https://r1.googlevideo.com:444/a'}, {'codec': 'opus'}, {'container': 'webm'}, {'protocol': 'm3u8_native'},
                   {'expires': time.time() + 10}, {'duration': float('nan')}, {'duration': 0}, {'duration': True},
                   {'headers': {'Cookie': 'secret'}}, {'headers': {'User-Agent': 'a\r\nb'}}]
        for update in updates:
            with self.subTest(update=update), self.assertRaises(resolver.ResolverError): resolver.valid_stream({**self.stream, **update})

    def test_eviction_ttl_and_result_size(self):
        for index in range(8): resolver.cache_write(resolver._stream_cache, str(index), {}, 100, 4)
        self.assertEqual(list(resolver._stream_cache), ['4', '5', '6', '7'])
        self.assertIsNone(resolver.cache_read(resolver._stream_cache, '4', 100))
        with self.assertRaises(resolver.ResolverError): resolver.cache_write(resolver._search_cache, 'large', {'value': 'x' * 300000}, 100, 24)

    def test_cancelled_results_are_not_inserted_and_next_request_can_succeed(self):
        def provider(query):
            native.abort_reason.return_value = 'cancelled'
            return '{"items":[]}'
        with patch.object(resolver.shared, 'search', side_effect=provider):
            self.assertEqual(self.call(operation='search', query='Daft Punk')['error'], 'CANCELLED')
        self.assertFalse(resolver._search_cache)
        native.abort_reason.return_value = None
        with patch.object(resolver.shared, 'search', return_value='{"items":[]}'):
            self.assertTrue(self.call(operation='search', query='Daft Punk')['ok'])

    def test_rate_limited_queries_do_not_repeat_network_requests(self):
        resolver._cooldown_until = time.monotonic() + 30
        with patch.object(resolver.shared, 'search') as provider:
            self.assertEqual(self.call(operation='search', query='Daft Punk')['error'], 'RATE_LIMITED'); provider.assert_not_called()

    def test_provider_error_details_do_not_expose_signed_urls(self):
        with patch.object(resolver.shared, 'resolve', side_effect=RuntimeError(self.stream['url'])):
            value = resolver.invoke(json.dumps({'operation': 'resolve', 'videoId': 'abcdefghijk'}))
        self.assertNotIn('signature', value); self.assertNotIn('googlevideo', value)
        self.assertEqual(json.loads(value)['error'], 'PROVIDER_UNAVAILABLE')

    def test_sessions_are_closed_even_on_failure(self):
        session = MagicMock(); resolver._sessions.append(session)
        self.call(operation='not-an-operation')
        session.close.assert_called_once(); self.assertFalse(resolver._sessions)

    def test_provider_diagnostics_use_fixed_codes_without_error_text(self):
        for message, code in [('Sign in to confirm you are not a bot', 'PROVIDER_SIGN_IN_REQUIRED'), ('Requested format is not available', 'FORMAT_UNAVAILABLE'), ('challenge solving failed', 'JS_CHALLENGE_FAILED'), ('HTTP Error 429: Too Many Requests', 'RATE_LIMITED')]:
            with self.subTest(code=code), patch.object(resolver.shared, 'resolve', side_effect=RuntimeError(message + ' ' + self.stream['url'])):
                text = resolver.invoke(json.dumps({'operation': 'resolve', 'videoId': 'abcdefghijk'}))
                self.assertEqual(json.loads(text)['error'], code)
                self.assertNotIn('signature', text)


if __name__ == '__main__': unittest.main()
