import test from 'node:test';
import assert from 'node:assert/strict';
import {HomeCatalog} from '../apps/api/home';
import {Store} from '../apps/api/store';
import {createApi} from '../apps/api/server';
import {AppError} from '../apps/api/errors';
import {homeEdition,type HomeIndex} from '../packages/domain/home';
import {normalizeHomeIndex,normalizeHomeDetail} from '../apps/api/home-normalize';
import {FixtureResolver,testConfig,tracks} from './fixtures';
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('Home editions switch on Friday in Rome, including DST and a PC in another timezone',()=>{
  assert.equal(homeEdition(Date.parse('2026-10-15T21:59:59Z')),'2026-10-09');
  assert.equal(homeEdition(Date.parse('2026-10-15T22:00:00Z')),'2026-10-16');
  assert.equal(homeEdition(Date.parse('2026-10-22T22:00:00Z')),'2026-10-23');
  assert.equal(homeEdition(Date.parse('2026-10-29T22:59:59Z')),'2026-10-23');
  assert.equal(homeEdition(Date.parse('2026-10-29T23:00:00Z')),'2026-10-30');
});
test('Home coalesces cold reads, caches across restart, and never prepares audio',async()=>{
  const config=testConfig(),store=new Store(':memory:'),resolver=new FixtureResolver(config,''),index=await resolver.homeIndex();resolver.catalogCalls=[];
  let finish!:(data:HomeIndex)=>void,calls=0;resolver.homeIndex=()=>{calls++;return new Promise(resolve=>{finish=resolve;});};
  resolver.resolve=async()=>{throw Error('Home must not resolve audio');};let now=Date.parse('2026-10-14T10:00:00Z');
  const home=new HomeCatalog(store,resolver,()=>now);
  try{
    const first=home.index(),second=home.index();finish(index);const values=await Promise.all([first,second]);assert.equal(calls,1);assert.equal(values[0].data?.collections.length,2);assert.deepEqual(values[0],values[1]);
    await home.index(true);assert.equal(calls,1);await home.close();const restarted=new HomeCatalog(store,resolver,()=>now);await restarted.index();assert.equal(calls,1);await restarted.close();
  }finally{await home.close();store.close();}
});
test('Home returns stale immediately on a new week and preserves good data on a malformed update',async()=>{
  const store=new Store(':memory:'),resolver=new FixtureResolver(testConfig(),''),home=new HomeCatalog(store,resolver,()=>now);let now=Date.parse('2026-10-14T10:00:00Z');
  try{
    const before=await home.index();now+=7*86400000;let finish!:(data:HomeIndex)=>void;resolver.homeIndex=()=>new Promise(resolve=>{finish=resolve;});
    const stale=await home.index();assert.equal(stale.refreshing,true);assert.equal(stale.stale,true);assert.deepEqual(stale.data,before.data);
    finish({collections:[],missing:[]});await settle();const failed=await home.index();assert.deepEqual(failed.data,before.data);assert.ok(failed.error);assert.equal(failed.refreshing,false);assert.ok(failed.retryAt);
  }finally{await home.close();store.close();}
});
test('Home partial indexes preserve the missing collection and mark it as outdated',async()=>{
  const store=new Store(':memory:'),resolver=new FixtureResolver(testConfig(),''),home=new HomeCatalog(store,resolver,()=>now);let now=Date.parse('2026-10-14T10:00:00Z');
  try{const before=await home.index();now+=7*86400000;resolver.homeIndex=async()=>({collections:before.data!.collections.filter(c=>c.id!=='global'),missing:['global']});await home.index();await settle();const result=await home.index();assert.equal(result.data?.collections.length,2);assert.deepEqual(result.data?.missing,['global']);assert.equal(result.stale,true);assert.ok(result.error);}finally{await home.close();store.close();}
});
test('Home retry budget survives restart and recovers after backoff',async()=>{
  const store=new Store(':memory:'),resolver=new FixtureResolver(testConfig(),''),home=new HomeCatalog(store,resolver,()=>now);let now=Date.parse('2026-10-14T10:00:00Z');
  try{resolver.failure=new AppError(429,'BUSY','Riprova tra poco.');const bad=await home.index();assert.equal(bad.data,null);assert.ok(bad.retryAt);const calls=resolver.catalogCalls.length;await home.close();const restarted=new HomeCatalog(store,resolver,()=>now);await restarted.index(true);assert.equal(resolver.catalogCalls.length,calls);now+=31000;resolver.failure=null;assert.equal((await restarted.index()).data?.collections.length,2);await restarted.close();}finally{await home.close();store.close();}
});
test('Collection details cache metadata, deduplicate and preserve the prior complete edition',async()=>{
  const store=new Store(':memory:'),resolver=new FixtureResolver(testConfig(),''),home=new HomeCatalog(store,resolver,()=>now);let now=Date.parse('2026-10-14T10:00:00Z');
  try{await home.index();resolver.homeCollection=async collection=>({collection,tracks:[...tracks,tracks[0]],albums:[],partial:false});const first=await home.detail('global');assert.equal(first.data?.tracks.length,2);assert.ok(store.getTrack(tracks[0].id));now+=16*60000;resolver.homeCollection=async collection=>({collection,tracks:[tracks[1]],albums:[],partial:true});const pending=await home.detail('global',true);assert.equal(pending.refreshing,true);await settle();const next=await home.detail('global');assert.deepEqual(next.data,first.data);assert.ok(next.error);}finally{await home.close();store.close();}
});
for(const mode of ['failed','partial'] as const)test(`Collection retains its original timestamp and warning after a ${mode} Friday index refresh`,async()=>{
  let now=Date.parse('2026-10-14T10:00:00Z'),detailCalls=0;
  const store=new Store(':memory:'),resolver=new FixtureResolver(testConfig(),''),home=new HomeCatalog(store,resolver,()=>now);
  const loadDetail=resolver.homeCollection.bind(resolver);resolver.homeCollection=async collection=>{detailCalls++;return loadDetail(collection);};
  try{
    const index=await home.index(),first=await home.detail('global');now+=7*86400000;
    resolver.homeIndex=async()=>{if(mode==='failed')throw new AppError(503,'SOURCE_DOWN','Fonte non disponibile.');return {collections:index.data!.collections.filter(c=>c.id!=='global'),missing:['global']};};
    const pending=await home.detail('global');assert.equal(pending.stale,true);await settle();
    const retained=await home.detail('global',true);assert.equal(retained.stale,true);assert.ok(retained.error);assert.equal(retained.refreshing,false);
    assert.equal(retained.updatedAt,first.updatedAt);assert.deepEqual(retained.data,first.data);assert.equal(detailCalls,1);
  }finally{await home.close();store.close();}
});
test('Home normalization rejects untrusted IDs, overlong output and empty playable collections',async()=>{
  const resolver=new FixtureResolver(testConfig(),''),index=await resolver.homeIndex(),collection=index.collections[0];
  assert.throws(()=>normalizeHomeIndex({collections:[{...collection,playlistId:'https://127.0.0.1/private'}]}));
  assert.throws(()=>normalizeHomeIndex({collections:[...index.collections,collection]}));assert.throws(()=>normalizeHomeDetail({tracks:[],partial:false},collection));
  assert.equal(normalizeHomeIndex({collections:[{...collection,artwork:'https://127.0.0.1/private'}]}).collections[0].artwork,null);
});
test('Home API protects local access and accepts only the four known collection keys',async()=>{
  const config=testConfig(),resolver=new FixtureResolver(config,''),{app}=await createApi({config,resolver});const headers={authorization:`Bearer ${config.token}`};
  try{assert.equal((await app.inject({url:'/v1/home'})).statusCode,401);assert.equal((await app.inject({url:'/v1/home',headers})).json().data.collections.length,2);assert.equal((await app.inject({url:'/v1/home/collections/arbitrary-playlist',headers})).statusCode,400);assert.equal((await app.inject({url:'/v1/home/collections/global',headers})).json().data.tracks.length,2);assert.equal(resolver.catalogCalls.filter(c=>c==='home:index').length,1);}finally{await app.close();}
});


test('public Home ignores old Italy-first cache without deleting it and keeps source region honest',async()=>{
 const store=new Store(':memory:'),resolver=new FixtureResolver(testConfig(),''),home=new HomeCatalog(store,resolver);
 try{
  const legacy=await resolver.homeIndex();
  store.db.prepare('INSERT INTO home_cache(key,data,fetched,edition,retry) VALUES(?,?,?,?,?)').run('index',JSON.stringify(legacy),Date.now(),homeEdition(Date.now()),Date.now()+86400000);
  const result=await home.index();assert.deepEqual(result.data?.collections.map(c=>c.id),['global','releases']);
  assert.equal(resolver.catalogCalls.filter(c=>c==='home:index').length,2);
  assert.ok(store.db.prepare("SELECT data FROM home_cache WHERE key='index'").get());
  const releases=legacy.collections.find(c=>c.id==='releases')!;
  const neutral=normalizeHomeIndex({collections:[legacy.collections.find(c=>c.id==='global'),{...releases,country:null}]});
  assert.deepEqual(neutral.missing,[]);assert.equal(neutral.collections.find(c=>c.id==='releases')?.country,null);
  assert.throws(()=>normalizeHomeIndex({collections:[{...releases,country:'ZZ'}]}));
 }finally{await home.close();store.close();}
});
