"""Offline regression of provider attribution, without fetching any media."""
import importlib.util
from pathlib import Path
import unittest
spec = importlib.util.spec_from_file_location('music_catalog', Path(__file__).resolve().parents[1] / 'scripts/music-catalog.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
class FakeClient:
    calls = []
    def __init__(self, **kwargs):
        pass
    def get_artist(self, identifier):
        return {'name': 'Marracash'}
    def search(self, query, **kwargs):
        self.calls.append((query, kwargs))
        person = {'id': 'UCselected', 'name': 'Marracash'}
        other = {'id': 'UCother', 'name': 'Marracash'}
        if kwargs['filter'] == 'albums':
            return [{'resultType': 'album', 'browseId': 'MPREcorrect', 'title': 'Album vero', 'artist': 'Marracash', 'artists': [person]},
                    {'resultType': 'album', 'browseId': 'MPREwrong', 'title': 'Marracash', 'artists': [other]}]
        good = {'resultType': 'song', 'videoId': 'correct0001', 'title': 'Brano vero', 'artists': [person]}
        return [good, good, {'resultType': 'song', 'videoId': 'foreign0001', 'title': 'Marracash', 'artists': [other]},
                {'resultType': 'song', 'videoId': 'missing0001', 'title': 'Marracash', 'artists': []},
                {'resultType': 'song', 'videoId': 'collabo0001', 'title': 'Collaborazione', 'artists': [other, person]},
                {'resultType': 'song', 'videoId': 'offline0001', 'title': 'Assente', 'artists': [person], 'isAvailable': False}]
module.YTMusic = FakeClient
class AttributionTests(unittest.TestCase):
    def query(self, kind, query=''):
        return module.catalog({'operation': 'artist-search', 'kind': 'artist', 'id': 'UCselected', 'query': query, 'searchKind': kind})
    def test_tracks_require_id_and_keep_collaborations(self):
        data = self.query('track')
        self.assertEqual([row['title'] for row in data['items']], ['Brano vero', 'Collaborazione'])
        self.assertEqual(FakeClient.calls[-1][0], 'Marracash')
        self.assertTrue(FakeClient.calls[-1][1]['ignore_spelling'])
        self.assertEqual(FakeClient.calls[-1][1]['limit'], 101)
    def test_albums_use_title_and_real_credit(self):
        data = self.query('album', 'Album vero')
        self.assertEqual([row['name'] for row in data['items']], ['Album vero'])
        self.assertEqual(FakeClient.calls[-1][0], 'Marracash Album vero')
    def test_invalid_scope_is_rejected(self):
        with self.assertRaises(ValueError): self.query('artist')
        with self.assertRaises(ValueError): self.query('track', 'x' * 201)
    def test_full_artist_query_is_not_prefixed_twice(self):
        self.query('track', 'Marracash King')
        self.assertEqual(FakeClient.calls[-1][0], 'Marracash King')
class RankingClient:
    calls = []
    fail_candidates = False
    def __init__(self, **kwargs): pass
    def search(self, query, **kwargs):
        self.calls.append((query, kwargs))
        person = {'id': 'UCselected', 'name': 'Marracash'}
        if kwargs['filter'] == 'artists':
            if self.fail_candidates: raise RuntimeError('Optional artist lookup unavailable')
            return [{'resultType': 'artist', 'browseId': person['id'], 'artist': person['name']}]
        if kwargs['filter'] == 'albums':
            return [{'resultType': 'album', 'browseId': 'MPREwrong', 'title': 'Marracash', 'artists': []},
                    {'resultType': 'album', 'browseId': 'MPREcorrect', 'title': 'Album vero', 'artists': [person]}]
        return [{'resultType': 'song', 'videoId': f'raw{i:08d}', 'title': 'Marracash' if i == 0 else 'King',
                 'artists': [] if i == 0 else [person]} for i in range(101)]
class SnapshotTests(unittest.TestCase):
    def setUp(self):
        module.YTMusic = RankingClient
        RankingClient.calls = []
        RankingClient.fail_candidates = False
    def tearDown(self): module.YTMusic = FakeClient
    def test_full_bounded_snapshot_is_not_paginated_or_filtered_by_artist(self):
        data = module.catalog({'operation': 'search-snapshot', 'query': 'Marracash'})
        self.assertEqual(len(data['items']), 100)
        self.assertEqual(data['items'][0]['title'], 'Marracash')
        self.assertEqual(data['items'][0]['artists'], [])
        self.assertTrue(data['truncated'])
        self.assertEqual(data['candidates'][0]['id'], 'UCselected')
        self.assertEqual([call[1]['filter'] for call in RankingClient.calls], ['songs', 'artists'])
        self.assertEqual(RankingClient.calls[0][1]['limit'], 101)
    def test_failed_optional_lookup_preserves_results(self):
        RankingClient.fail_candidates = True
        data = module.catalog({'operation': 'search-snapshot', 'query': 'Marracash'})
        self.assertEqual(len(data['items']), 100)
        self.assertEqual(data['candidates'], [])
    def test_album_snapshot_retains_foreign_titles_and_candidates(self):
        data = module.catalog({'operation': 'catalog-search', 'kind': 'album', 'query': 'Marracash'})
        self.assertEqual([row['name'] for row in data['items']], ['Marracash', 'Album vero'])
        self.assertEqual(data['candidates'][0]['id'], 'UCselected')
        self.assertEqual(RankingClient.calls[0][1]['limit'], 101)
    def test_snapshot_validates_query_bounds(self):
        for query in ['xy', 'x' * 201, None]:
            with self.assertRaises(ValueError): module.catalog({'operation': 'search-snapshot', 'query': query})
if __name__ == '__main__': unittest.main()
