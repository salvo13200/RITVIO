import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../apps/api/store';
import {SituationsCatalog} from '../apps/api/situations';
import {situationIndex,situationPlaylists} from '../apps/api/situations-normalize';
import {FixtureResolver,testConfig} from './fixtures';
import {createApi} from '../apps/api/server';
import {AppError} from '../apps/api/errors';
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('situations are cached and coalesced, only listed playlists resolve metadata and no audio is prepared',async()=>{
  const store=new Store(':memory:'),resolver=new FixtureResolver(testConfig(),''),catalog=new SituationsCatalog(store,resolver);let count=0;const load=resolver.situations.bind(resolver);resolver.situations=async()=>{count++;return load();};resolver.resolve=async()=>{throw Error('Unexpected audio');};
  try{const [a,b]=await Promise.all([catalog.playlists('focus'),catalog.playlists('focus')]);assert.deepEqual(a.data,b.data);assert.equal(count,1);const playlist=a.data![0],detail=await catalog.tracks('focus',playlist.id);assert.equal(detail.data?.tracks.length,2);await assert.rejects(catalog.tracks('focus','PL_unlisted'),/presente/);assert.ok(store.getTrack(detail.data!.tracks[0].id));}finally{await catalog.close();store.close();}
});
test('situations retain stale data and apply persistent failure backoff across restart',async()=>{
  let now=Date.parse('2026-10-15T10:00:00Z');const store=new Store(':memory:'),resolver=new FixtureResolver(testConfig(),''),catalog=new SituationsCatalog(store,resolver,()=>now);let calls=0;
  try{const before=await catalog.playlists('focus');now+=2*86400000;resolver.situationPlaylists=async()=>{calls++;throw new AppError(503,'SOURCE_DOWN','Fonte non disponibile.');};await catalog.playlists('focus');await settle();const stale=await catalog.playlists('focus');assert.deepEqual(stale.data,before.data);assert.equal(stale.stale,true);assert.ok(stale.error);await catalog.close();const restarted=new SituationsCatalog(store,resolver,()=>now);await restarted.playlists('focus');assert.equal(calls,1);await restarted.close();}finally{await catalog.close();store.close();}
});
test('situation metadata refuses unsafe URLs, injected params, duplicate IDs and oversized lists',()=>{
  assert.throws(()=>situationIndex({items:[{id:'focus',params:'https://localhost/private',sourceTitle:'Focus'}]}));assert.throws(()=>situationPlaylists({items:[]}));assert.throws(()=>situationPlaylists({items:Array.from({length:13},(_,i)=>({id:`PL_${i}`,title:'Playlist'}))}));
  assert.equal(situationPlaylists({items:[{id:'PL_original',title:'Originale',artwork:'https://tracker.invalid/image'}]})[0].artwork,null);
});
test('situation endpoints require local authentication and known route identifiers',async()=>{
  const config=testConfig(),resolver=new FixtureResolver(config,''),{app}=await createApi({config,resolver}),headers={authorization:`Bearer ${config.token}`};
  try{assert.equal((await app.inject({url:'/v1/situations/focus'})).statusCode,401);assert.equal((await app.inject({url:'/v1/situations/unknown',headers})).statusCode,400);const list=(await app.inject({url:'/v1/situations/focus',headers})).json();assert.equal(list.data.length,1);assert.equal((await app.inject({url:'/v1/situations/focus/playlists/PL_unlisted',headers})).statusCode,404);}finally{await app.close();}
});
