import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createApi} from '../apps/api/server';
import {Store} from '../apps/api/store';
import {exportPlaylist} from '../apps/api/sharing';
import {testConfig,FixtureResolver,tracks} from './fixtures';
import {playlistFilename,playlistFileLimit,sharedTrackLink,type PlaylistFile} from '../packages/domain/sharing';
const headers={authorization:'Bearer test-token-only'};
const empty=():PlaylistFile=>({format:'ritvio-playlist',version:1,exportedAt:new Date().toISOString(),playlist:{name:'Importata',description:'Descrizione condivisa',cover:null,tracks:[]}});
test('playlist export/import preserves cover, order and duplicates, creates private copies and excludes personal data',async()=>{
  let actor={id:randomUUID(),mode:'online' as const};const config=testConfig();const {app,store}=await createApi({config,resolver:new FixtureResolver(config,'http://fixture.test'),identityProvider:{resolve:async()=>actor}});
  try{
    store.library.ensureProfile('online',actor.id,'Autore');let playlist=store.library.create(actor.id,'Da condividere');playlist=store.library.add(actor.id,playlist.id,1,tracks[1]);playlist=store.library.add(actor.id,playlist.id,2,tracks[0]);playlist=store.library.add(actor.id,playlist.id,3,tracks[1]);
    const cover='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    playlist=store.library.update(actor.id,playlist.id,4,{name:'Da condividere',description:'Una descrizione',visibility:'public',cover});
    const response=await app.inject({url:`/v1/me/playlists/${playlist.id}/export`,headers});assert.equal(response.statusCode,200);const file=response.json();const serialized=JSON.stringify(file);
    assert(!serialized.includes(actor.id));assert(!serialized.includes('googlevideo.com'));assert(!serialized.includes('history'));assert(!serialized.includes('queue'));assert(!serialized.includes(playlist.id));
    const author=actor.id;actor={id:randomUUID(),mode:'online'};store.library.ensureProfile('online',actor.id,'Destinatario');
    assert.equal((await app.inject({url:`/v1/me/playlists/${playlist.id}/export`,headers})).statusCode,404);
    const imported=(await app.inject({method:'POST',url:'/v1/me/playlists/import',headers,payload:file}));assert.equal(imported.statusCode,201);const copy=imported.json();
    assert.equal(copy.cover,cover);assert.equal(copy.description,'Una descrizione');assert.equal(copy.visibility,'private');assert.equal(copy.revision,1);assert.notEqual(copy.id,playlist.id);assert.equal(copy.items.length,3);
    assert.deepEqual(copy.items.map((item:any)=>item.track.videoId),playlist.items.map(item=>item.track.videoId));assert.notEqual(copy.items[0].id,copy.items[2].id);
    assert.equal(store.library.snapshot(author).playlists.length,1);assert.equal(store.library.snapshot(actor.id).playlists.length,1);
    assert.equal((await app.inject({method:'POST',url:'/v1/me/playlists/import',headers,payload:file})).statusCode,201);assert.equal(store.library.snapshot(actor.id).playlists.length,2);
  }finally{await app.close();}
});
test('import rejects malformed JSON, executable metadata, unknown formats and oversized files without partial writes',async()=>{
  const config=testConfig();const {app,store}=await createApi({config,resolver:new FixtureResolver(config,'http://fixture.test')});
  try{
    assert.equal((await app.inject({method:'POST',url:'/v1/me/playlists/import',payload:empty()})).statusCode,401);
    const invalid=[{...empty(),version:2},{...empty(),format:'other'},{...empty(),owner:randomUUID()}, {...empty(),playlist:{...empty().playlist,cover:'data:image/svg+xml;base64,PHN2Zy8+'}}, {...empty(),playlist:{...empty().playlist,tracks:[{videoId:'../../file',title:'Brano',artist:'Artista',duration:2}]}}, {...empty(),playlist:{...empty().playlist,tracks:[{videoId:tracks[0].videoId,title:'Brano',artist:'Artista',duration:2,url:'https://evil.test/audio'}]}}];
    for(const file of invalid)assert.equal((await app.inject({method:'POST',url:'/v1/me/playlists/import',headers,payload:file})).statusCode,400);
    assert.equal((await app.inject({method:'POST',url:'/v1/me/playlists/import',headers:{...headers,'content-type':'application/json'},payload:'{"broken":'})).statusCode,400);
    assert.equal((await app.inject({method:'POST',url:'/v1/me/playlists/import',headers,payload:{...empty(),oversize:'A'.repeat(playlistFileLimit)}})).statusCode,413);
    const profile=store.library.ensureProfile('local');assert.equal(store.library.snapshot(profile.id).playlists.length,0);
    assert.equal((await app.inject({method:'POST',url:'/v1/me/playlists/import',headers,payload:empty()})).statusCode,201);
  }finally{await app.close();}
});
test('failed imports roll back entirely, preserve existing metadata and never trust file URLs',()=>{
  const store=new Store(':memory:');try{
    const user=store.library.ensureProfile('local');store.library.saveTrack(tracks[0]);
    store.db.exec("CREATE TEMP TRIGGER fail_import BEFORE INSERT ON library_items WHEN NEW.position=1 BEGIN SELECT RAISE(ABORT,'test import failure');END;");
    assert.throws(()=>store.library.importPlaylist(user.id,{name:'Fallita',description:'',cover:null,tracks:[tracks[1],tracks[0]]}),/test import failure/);
    store.db.exec('DROP TRIGGER fail_import;');
    assert.equal(store.library.snapshot(user.id).playlists.length,0);assert.equal(store.library.getTrack(tracks[1].id),undefined);
    const imported=store.library.importPlaylist(user.id,{name:'Corretta',description:'',cover:null,tracks:[{...tracks[0],title:'Nome modificato nel file'}]});assert.equal(imported.items[0].track.title,tracks[0].title);
    assert.equal(exportPlaylist(imported).playlist.tracks[0].videoId,tracks[0].videoId);
  }finally{store.close();}
});
test('share links use canonical YouTube URLs and exported filenames cannot escape the selected folder',()=>{
  assert.equal(sharedTrackLink(tracks[0]),`https://www.youtube.com/watch?v=${tracks[0].videoId}`);assert.throws(()=>sharedTrackLink({videoId:'$(bad)'}));
  assert.equal(playlistFilename('CON'),'Playlist CON.ritvio.json');assert.equal(playlistFilename('  '),'Playlist RITVIO.ritvio.json');assert(!playlistFilename('../../Cartella\\musica:*').match(/[\\/:*]/));assert(playlistFilename('Viaggio').endsWith('.ritvio.json'));
});


test('RITVIO imports previous SPOTYFREE playlist files and exports the current brand format',async()=>{
  const config=testConfig(),{app}=await createApi({config,resolver:new FixtureResolver(config,'http://fixture.test')});
  try{const imported=await app.inject({method:'POST',url:'/v1/me/playlists/import',headers,payload:{...empty(),format:'spotyfree-playlist'}});assert.equal(imported.statusCode,201);const exported=await app.inject({url:`/v1/me/playlists/${imported.json().id}/export`,headers});assert.equal(exported.json().format,'ritvio-playlist');}finally{await app.close();}
});
