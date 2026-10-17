import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../apps/api/store';
import {tracks} from './fixtures';
import {browseLibrary,defaultLibraryFilter,libraryPlaybackWindow,trackLibraryText} from '../packages/domain/library-browser';
import {useLibraryBrowser,getLibraryView} from '../apps/client/src/library-browser';

test('local library search matches all words across credits and albums, ignoring accents and punctuation',()=>{
  const first={...tracks[0],title:'Città, notte!',artist:'Artista Uno',artists:[{id:'guest',name:'Ospite Due'}],album:{id:'album',name:'Luce blu'}};
  const rows=[first,tracks[1]].map(item=>({item,text:trackLibraryText(item),name:item.title}));
  assert.deepEqual(browseLibrary(rows,{...defaultLibraryFilter,query:'CITTA ospite blu'}),[first]);
  assert.deepEqual(browseLibrary(rows,{...defaultLibraryFilter,query:'citta estraneo'}),[]);
  assert.deepEqual(browseLibrary(rows,{...defaultLibraryFilter,query:'   '}),[first,tracks[1]]);
});
test('duration boundaries and unknown values are explicit; sorting is stable and does not mutate saved order',()=>{
  const rows=[0,179,180,360,361,NaN].map((duration,index)=>({item:index,text:'Musica',name:`Brano ${index}`,duration}));
  const filter=(duration:'short'|'medium'|'long'|'unknown')=>browseLibrary(rows,{...defaultLibraryFilter,duration});
  assert.deepEqual(filter('short'),[1]);assert.deepEqual(filter('medium'),[2,3]);assert.deepEqual(filter('long'),[4]);assert.deepEqual(filter('unknown'),[0,5]);
  assert.deepEqual(browseLibrary(rows,{...defaultLibraryFilter,sort:'duration-long'}),[4,3,2,1,0,5]);
  assert.deepEqual(rows.map(row=>row.item),[0,1,2,3,4,5]);
  assert.deepEqual(browseLibrary([{item:1,name:'Brano 10',text:''},{item:2,name:'brano 2',text:''},{item:3,name:'Brano 2',text:''}],{...defaultLibraryFilter,sort:'name'}),[2,3,1]);
});
test('collection sorting uses actual update dates and counts while unknown total durations stay last',()=>{
  const rows=[{item:'unknown',text:'',name:'A',recent:30,count:3},{item:'known',text:'',name:'B',recent:20,count:4,duration:300},{item:'short',text:'',name:'C',recent:10,count:1,duration:120}];
  assert.deepEqual(browseLibrary(rows,{...defaultLibraryFilter,sort:'recent'}),['unknown','known','short']);
  assert.deepEqual(browseLibrary(rows,{...defaultLibraryFilter,sort:'count'}),['known','unknown','short']);
  assert.deepEqual(browseLibrary(rows,{...defaultLibraryFilter,sort:'duration-short'}),['short','known','unknown']);
});
test('large library playback includes the chosen row beyond the player limit and preserves the view',()=>{
  const list=Array.from({length:5000},(_,i)=>({...tracks[0],id:`track:${i}`}));
  const window=libraryPlaybackWindow(list,list[4200]);assert.equal(window.length,800);assert.equal(window[0],list[4200]);assert.equal(list.length,5000);
  assert.equal(libraryPlaybackWindow(list,list[60]).length,1000);assert.equal(libraryPlaybackWindow(list,list[60])[60],list[60]);
});
test('library view state survives tab navigation but is cleared for another profile',()=>{
  const state=useLibraryBrowser.getState();state.bind('profile-one');state.change('likes',{query:'notte',sort:'name',scroll:900});state.more('likes');state.setTab('artists');state.setTab('likes');
  assert.equal(getLibraryView('likes').query,'notte');assert.equal(getLibraryView('likes').shown,120);assert.equal(getLibraryView('likes').scroll,900);
  state.bind('profile-one');assert.equal(getLibraryView('likes').query,'notte');state.bind('profile-two');assert.equal(getLibraryView('likes').query,'');assert.equal(getLibraryView('likes').scroll,0);assert.equal(useLibraryBrowser.getState().tab,'playlists');
});
test('playlist durations count intentional duplicates, report missing values and keep batch snapshots isolated',()=>{
  const store=new Store(':memory:');try{
    const lib=store.library,owner=lib.ensureProfile('local').id,other=lib.ensureProfile('online').id;
    let playlist=lib.importPlaylist(owner,{name:'Duplicati',description:'',cover:null,tracks:[tracks[0],tracks[0],tracks[1]]});
    const seconds=tracks[0].duration*2+tracks[1].duration;
    assert.equal(playlist.durationSeconds,seconds);assert.equal(lib.snapshot(owner).playlists[0].durationSeconds,seconds);
    playlist=lib.add(owner,playlist.id,playlist.revision,{...tracks[1],id:'duration-unknown',duration:0});assert.equal(playlist.durationSeconds,null);assert.equal(lib.snapshot(owner).playlists[0].durationSeconds,null);
    for(let i=0;i<80;i++)lib.create(owner,`Playlist ${i}`);
    lib.importPlaylist(other,{name:'Privata altro',description:'',cover:null,tracks:[tracks[0]]});
    const snapshot=lib.snapshot(owner);assert.equal(snapshot.playlists.length,81);assert(!snapshot.playlists.some(p=>p.name==='Privata altro'));assert.equal(snapshot.playlists.find(p=>p.id===playlist.id)?.count,4);
    assert.equal(lib.snapshot(other).playlists[0].count,1);assert.equal(snapshot.playlists.find(p=>p.name==='Playlist 0')?.durationSeconds,0);
  }finally{store.close();}
});
