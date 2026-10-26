import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCatalog,type AlbumDetail,type ArtistDetail,type CatalogSearch} from '../apps/mobile/src/ios/catalog-model';

const artwork='https://lh3.googleusercontent.com/original-fixture';
const song={videoId:'abcdefghijk',title:'Original fixture',artist:'Luna Vale',thumbnail:artwork,duration:90,artists:[{id:'artist-1',name:'Luna Vale'}],album:{id:'album-1',name:'Night scenes'}};
const album={id:'album-1',kind:'album' as const,name:'Night scenes',artwork,artists:song.artists,entries:[{number:1,title:song.title,duration:90,track:{...song,url:'https://must-not-reach-ui.invalid/signed'}},{number:2,title:'Unavailable fixture',duration:120,track:null}],reportedCount:3,incomplete:false};
test('album metadata preserves unavailable positions and reports an incomplete collection',()=>{
 const value=parseCatalog({...album,year:2024},{operation:'detail',kind:'album',id:'album-1'}) as AlbumDetail;
 assert.equal(value.entries.length,2);assert.equal(value.entries[1].track,null);assert.equal(value.entries[1].number,2);assert.equal(value.incomplete,true);
 assert.equal(value.entries[0].track?.album?.id,'album-1');assert.equal(value.year,'2024');assert.ok(!JSON.stringify(value).includes('must-not-reach-ui'));
});
test('artist detail retains discography order and rejects another artist identity',()=>{
 const raw={id:'artist-1',kind:'artist',name:'Luna Vale',artwork,tracks:[song],albums:[{...album,id:'album-2'},{...album,id:'album-1'}],singles:[],moreAlbums:true};
 const value=parseCatalog(raw,{operation:'detail',kind:'artist',id:'artist-1'}) as ArtistDetail;
 assert.deepEqual(value.albums.map(item=>item.id),['album-2','album-1']);assert.equal(value.moreAlbums,true);assert.equal(value.tracks[0].artists?.[0].id,'artist-1');
 assert.throws(()=>parseCatalog(raw,{operation:'detail',kind:'artist',id:'another-artist'}));
});
test('search resources retain their kinds and metadata flags cannot fake success',()=>{
 const request={operation:'catalog-search',kind:'album',query:'Luna Vale'} as const,raw={items:[album],candidates:[{id:'artist-1',kind:'artist',name:'Luna Vale',artwork}],cached:true,truncated:true};
 const value=parseCatalog(raw,request) as CatalogSearch;assert.equal(value.cached,true);assert.equal(value.candidates[0].kind,'artist');assert.equal(value.truncated,true);
 for(const invalid of [{...raw,cached:'true'},{...raw,items:raw.candidates},{...raw,items:[{...album,id:'album-1\n'}]},{...raw,items:[{...album,artwork:'https://user:password@lh3.googleusercontent.com/private'}]}])assert.throws(()=>parseCatalog(invalid,request));
});
test('malformed and oversized catalog results cannot produce playable metadata',()=>{
 const request={operation:'detail',kind:'album',id:'album-1'} as const;
 for(const raw of [null,{...album,entries:[{...album.entries[0],number:0}]},{...album,entries:[{...album.entries[0],track:{...song,videoId:'../bad'}}]},
  {...album,entries:[{...album.entries[0],track:{...song,videoId:'abcdefghijk\n'}}]},
  {...album,entries:Array.from({length:1001},(_,index)=>({...album.entries[0],number:index+1}))},{...album,reportedCount:-1},{...album,entries:[{...album.entries[0],duration:Infinity}]}])assert.throws(()=>parseCatalog(raw,request));
});
