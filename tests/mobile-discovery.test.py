import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('discovery',Path(__file__).resolve().parents[1]/'apps/mobile/android/app/src/main/python/discovery_catalog.py')
discovery=importlib.util.module_from_spec(spec);spec.loader.exec_module(discovery)
class Provider:
    def get_mood_categories(self):return {'Genres':[{'title':'Pop','params':'pop'},{'title':'Invalid','params':'../../file'},{'title':'Duplicate','params':'pop'}],'Moods & moments':[{'title':'Focus','params':'focus'}]}
    def _send_request(self,endpoint,body):
        assert endpoint=='browse' and body['browseId']=='FEmusic_moods_and_genres_category'
        def card(title,identifier=None):return {'musicTwoRowItemRenderer':{'title':{'runs':[{'text':title}]},'navigationEndpoint':{'browseEndpoint':{'browseId':identifier}} if identifier else {'watchEndpoint':{'videoId':'abcdefghijk'}}}}
        return {'contents':[card('Focus','VLPLAYLIST1'),card('A song without browse endpoint'),card('An album','MPREexample'),card('Duplicate','VLPLAYLIST1'),card('Invalid','VLbad/id')]}
    def get_playlist(self,id,limit):return {'title':'Focus','trackCount':3,'tracks':[{'videoId':'abcdefghijk','title':'First'},{'videoId':'12345678901','isAvailable':False},{'videoId':'invalid'}]}
def load(operation,**args):return discovery.catalog({'operation':operation,**args},lambda **kw:Provider(),lambda item:dict(item),lambda item:None)
class DiscoveryTest(unittest.TestCase):
    def test_index_separates_genres_and_moods_and_rejects_unsafe_categories(self):
        value=load('browse-index');self.assertEqual([x['name'] for x in value['genres']],['Pop']);self.assertEqual(value['moods'][0]['name'],'Focus')
    def test_playlists_are_unique_and_bounded(self):self.assertEqual(load('browse-playlists',params='focus')['playlists'],[{'id':'PLAYLIST1','name':'Focus','artwork':None}])
    def test_tracks_exclude_unavailable_and_invalid_and_report_partial(self):
        value=load('browse-tracks',id='PLAYLIST1');self.assertEqual(len(value['tracks']),1);self.assertTrue(value['partial'])
    def test_input_is_validated_before_provider_request(self):
        for operation,args in [('browse-playlists',{'params':'../../bad'}),('browse-tracks',{'id':'https://bad.example'})]:
            with self.assertRaises(ValueError):load(operation,**args)
if __name__=='__main__':unittest.main()
