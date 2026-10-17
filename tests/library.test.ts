import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Store} from '../apps/api/store';
import {createApi} from '../apps/api/server';
import {testConfig,tracks,FixtureResolver} from './fixtures';
const headers={authorization:'Bearer test-token-only'};
test('playlist edits preserve duplicates and reject stale revisions and incomplete reorder atomically',()=>{
  const store=new Store(':memory:');const lib=store.library;const user=lib.ensureProfile('local');
  try{
    let playlist=lib.create(user.id,'La mia musica');playlist=lib.add(user.id,playlist.id,1,tracks[0]);playlist=lib.add(user.id,playlist.id,2,tracks[0]);
    assert.equal(playlist.items.length,2);assert.notEqual(playlist.items[0].id,playlist.items[1].id);
    assert.throws(()=>lib.reorder(user.id,playlist.id,3,[playlist.items[0].id]),/ogni brano/);
    assert.equal(lib.playlist(user.id,playlist.id).revision,3);
    assert.throws(()=>lib.update(user.id,playlist.id,1,{name:'Persa',description:'',visibility:'private',cover:null}),/cambiata/);
    playlist=lib.reorder(user.id,playlist.id,3,playlist.items.map(i=>i.id).reverse());
    const removed=playlist.items[0].id;playlist=lib.remove(user.id,playlist.id,4,removed);
    assert.equal(playlist.count,1);assert.notEqual(playlist.items[0].id,removed);
    lib.delete(user.id,playlist.id,5);assert.equal(lib.snapshot(user.id).playlists.length,0);assert.equal(store.db.prepare('SELECT count(*) n FROM library_items').get()!.n,0);
  }finally{store.close();}
});
test('library and profile survive restart and cache expiry without storing stream URLs',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'ritvio-library-'));const filename=path.join(directory,'test.sqlite');let store=new Store(filename);
  try{
    const lib=store.library;const profile=lib.ensureProfile('local');lib.updateProfile(profile.id,'Alex',null);store.saveTrack(tracks[0]);lib.like(profile.id,tracks[0],true);lib.record(profile.id,tracks[0],randomUUID());
    const playlist=lib.create(profile.id,'Sempre con me');lib.add(profile.id,playlist.id,1,tracks[0]);store.db.prepare('UPDATE tracks SET expires=0').run();store.close();store=new Store(filename);
    assert.equal(store.library.ensureProfile('local').id,profile.id);assert.equal(store.library.snapshot(profile.id).profile.displayName,'Alex');assert.equal(store.library.snapshot(profile.id).likes.length,1);assert.equal(store.library.playlist(profile.id,playlist.id).count,1);assert.equal(store.getTrack(tracks[0].id)?.title,tracks[0].title);
    assert(!JSON.stringify(store.library.snapshot(profile.id)).includes('googlevideo.com'));
  }finally{store.close();await rm(directory,{recursive:true,force:true});}
});
test('identity boundary isolates playlist, favourites and history for future online users',async()=>{
  let actor={id:randomUUID(),mode:'online' as const};const config=testConfig();const {app,store}=await createApi({config,resolver:new FixtureResolver(config,'http://fixture.test'),identityProvider:{resolve:async()=>actor}});
  try{
    store.library.ensureProfile('online',actor.id,'Uno');store.saveTrack(tracks[0]);
    const playlist=(await app.inject({method:'POST',url:'/v1/me/playlists',headers,payload:{name:'Riservata'}})).json();
    await app.inject({method:'PUT',url:`/v1/me/likes/${tracks[0].id}`,headers,payload:{liked:true}});
    await app.inject({method:'POST',url:'/v1/me/history',headers,payload:{mediaId:tracks[0].id,eventId:randomUUID()}});
    actor={id:randomUUID(),mode:'online'};store.library.ensureProfile('online',actor.id,'Due');
    const snapshot=(await app.inject({url:'/v1/me/library',headers})).json();assert.equal(snapshot.likes.length,0);assert.equal(snapshot.history.length,0);assert.equal(snapshot.playlists.length,0);
    for(const method of ['GET','DELETE'] as const)assert.equal((await app.inject({method,url:`/v1/me/playlists/${playlist.id}`,headers:{...headers,'if-match':'"1"'}})).statusCode,404);
    assert.equal((await app.inject({method:'POST',url:'/v1/me/playlists',headers,payload:{name:'Attacco',owner:randomUUID()}})).statusCode,400);
  }finally{await app.close();}
});
test('library API validates images, revisions, resources and auth; history inserts are idempotent',async()=>{
  const config=testConfig();const {app,store}=await createApi({config,resolver:new FixtureResolver(config,'http://fixture.test')});
  try{
    store.saveTrack(tracks[0]);assert.equal((await app.inject('/v1/me/library')).statusCode,401);
    assert.equal((await app.inject({method:'PATCH',url:'/v1/me/profile',headers,payload:{displayName:' ',avatar:null}})).statusCode,400);
    assert.equal((await app.inject({method:'PATCH',url:'/v1/me/profile',headers,payload:{displayName:'Alex',avatar:'data:image/jpeg;base64,SGVsbG8='}})).statusCode,400);
    assert.equal((await app.inject({method:'PATCH',url:'/v1/me/profile',headers,payload:{displayName:'Alex',avatar:`data:image/jpeg;base64,${'A'.repeat(220000)}`}})).statusCode,413);
    const eventId=randomUUID();for(let i=0;i<2;i++)assert.equal((await app.inject({method:'POST',url:'/v1/me/history',headers,payload:{mediaId:tracks[0].id,eventId}})).statusCode,200);
    let snapshot=(await app.inject({url:'/v1/me/library',headers})).json();assert.equal(snapshot.history.length,1);
    assert.equal((await app.inject({method:'PUT',url:'/v1/me/follows',headers,payload:{kind:'artist',resourceId:'UntrustedArtist',mediaId:tracks[0].id,followed:true}})).statusCode,400);
    assert.equal((await app.inject({method:'PUT',url:'/v1/me/follows',headers,payload:{kind:'artist',resourceId:tracks[0].artists![0].id,mediaId:tracks[0].id,followed:true}})).statusCode,200);
    const playlist=(await app.inject({method:'POST',url:'/v1/me/playlists',headers,payload:{name:'Prova'}})).json();
    assert.equal((await app.inject({method:'POST',url:`/v1/me/playlists/${playlist.id}/items`,headers,payload:{mediaId:tracks[0].id}})).statusCode,428);
    assert.equal((await app.inject({method:'POST',url:`/v1/me/playlists/${playlist.id}/items`,headers:{...headers,'if-match':'"1"'},payload:{mediaId:tracks[0].id}})).statusCode,200);
    assert.equal((await app.inject({method:'DELETE',url:`/v1/me/playlists/${playlist.id}`,headers:{...headers,'if-match':'"1"'}})).statusCode,409);
    await app.inject({method:'DELETE',url:'/v1/me/history',headers});snapshot=(await app.inject({url:'/v1/me/library',headers})).json();assert.equal(snapshot.history.length,0);assert.equal(snapshot.follows.length,1);
  }finally{await app.close();}
});
