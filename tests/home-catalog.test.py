import importlib.util
import sys
import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import home_catalog
spec = importlib.util.spec_from_file_location('catalog_fixture', Path(__file__).resolve().parents[1] / 'scripts/music-catalog.py')
catalog = importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalog)

class Fake:
    def __init__(self): self.albums = []; self.fail = False; self.countries = []
    def get_charts(self, country):
        self.countries.append(country)
        return {'videos':[{'title':'Daily Top Music Videos', 'playlistId':'PL_daily'}, {'title':'Top 100 Music Videos '+country,'playlistId':'PL_weekly_'+country,'thumbnails':[{'url':'https://i.ytimg.com/chart.jpg'}]}]}
    def get_explore(self):
        return {'new_releases':[{'title':'Album originale','browseId':'MPREb_test','artists':[{'id':'UC_test','name':'Autore'}],'thumbnails':[]}], 'trending':{'playlist':'VLPL_trending','items':[{}]}}
    def get_album(self, identifier):
        self.albums.append(identifier)
        if self.fail and identifier == 'album0': raise RuntimeError('Temporary provider failure')
        n = int(identifier.removeprefix('album'))
        return {'tracks':[{'videoId':f'ab{n*3+i:08d}x','title':f'Verso {i}','artists':[{'id':'UC_test','name':'Autore'}]} for i in range(3)]}
    def get_playlist(self, identifier, limit):
        assert identifier == 'PL_weekly_IT' and limit == 100
        return {'tracks':[{'videoId':'testmusic01','title':'Primo'}, {'videoId':'testmusic02','title':'Assente','isAvailable':False}], 'trackCount':2}

class HomeTests(unittest.TestCase):
    def test_sibling_module_imports_with_isolated_python(self):
        script = Path(__file__).resolve().parents[1] / 'scripts/music-catalog.py'
        result = subprocess.run([sys.executable, '-I', '-c', 'import runpy,sys; runpy.run_path(sys.argv[1]); import home_catalog; print(home_catalog.__file__)', str(script)], capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(Path(result.stdout.strip()).resolve(), script.with_name('home_catalog.py'))
    def call(self, payload, fake):
        with patch.object(home_catalog, 'client', return_value=fake):
            return home_catalog.home_catalog(payload, catalog.song, catalog.resource, catalog.thumbnail)
    def test_situations_use_real_category_params_and_do_not_invent_missing_categories(self):
        fake = Fake(); fake.get_mood_categories = lambda: {'Moods': [{'title':'Focus','params':'real_focus'},{'title':'Chill','params':'real_chill'}]}
        result = self.call({'operation':'situation-index'}, fake)
        self.assertEqual([item['id'] for item in result['items']], ['focus','relax'])
        self.assertEqual(result['items'][0]['params'], 'real_focus')
    def test_situation_playlists_are_bounded_and_deduplicated(self):
        fake = Fake(); fake.get_mood_playlists = lambda params: [{'playlistId':'PL_real','title':'Vera raccolta','author':{'name':'Autore'}}] * 3
        result = self.call({'operation':'situation-playlists','params':'real_focus'}, fake)
        self.assertEqual(len(result['items']), 1)
        self.assertEqual(result['items'][0]['author'], 'Autore')
        with self.assertRaises(ValueError): self.call({'operation':'situation-playlists','params':'https://localhost/private'}, fake)
    def test_weekly_charts_are_not_replaced_by_daily(self):
        fake = Fake()
        result = self.call({'operation':'home-index'}, fake)
        self.assertEqual([c['id'] for c in result['collections']], ['global', 'releases'])
        self.assertEqual(result['collections'][0]['playlistId'], 'PL_weekly_ZZ')
        self.assertEqual(result['collections'][0]['country'], 'ZZ')
        self.assertIsNone(result['collections'][1]['country'])
        self.assertEqual(fake.countries, ['ZZ'])
    def test_explore_does_not_force_an_italian_market(self):
        with patch.object(home_catalog, 'YTMusic') as factory:
            home_catalog.client()
            self.assertNotIn('location', factory.call_args.kwargs)
    def test_bounded_release_selection_preserves_album_references(self):
        fake=Fake(); albums=[{'id':f'album{i}','name':f'Album {i}','artists':[]} for i in range(24)]
        result=self.call({'operation':'home-collection','collection':{'id':'releases','albums':albums}},fake)
        self.assertEqual(len(fake.albums),8);self.assertEqual(len(result['tracks']),16)
        self.assertEqual(result['tracks'][0]['album'], {'id':'album0','name':'Album 0'})
        self.assertFalse(result['partial'])
    def test_partial_release_failure_is_explicit(self):
        fake=Fake();fake.fail=True
        result=self.call({'operation':'home-collection','collection':{'id':'releases','albums':[{'id':'album0','name':'A'},{'id':'album1','name':'B'}]}},fake)
        self.assertTrue(result['partial']);self.assertEqual(len(result['tracks']),2)
    def test_unavailable_playlist_rows_are_not_playable(self):
        result=self.call({'operation':'home-collection','collection':{'id':'italy','playlistId':'PL_weekly_IT'}},Fake())
        self.assertEqual(len(result['tracks']),1);self.assertTrue(result['partial'])
    def test_arbitrary_ids_and_urls_are_rejected(self):
        for collection in [{'id':'foreign'}, {'id':'italy','playlistId':'https://127.0.0.1/internal'}]:
            with self.assertRaises(ValueError): self.call({'operation':'home-collection','collection':collection}, Fake())
    def test_missing_weekly_chart_does_not_fabricate_one(self):
        fake=Fake();fake.get_charts=lambda country:{'videos':[{'title':'Daily Top Videos','playlistId':'PL_daily'}]}
        result=self.call({'operation':'home-index'},fake)
        self.assertEqual([c['id'] for c in result['collections']],['releases'])

if __name__ == '__main__': unittest.main()
