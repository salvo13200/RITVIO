import test from 'node:test';
import assert from 'node:assert/strict';
import {rankSearch} from '../packages/domain/search-ranking';
import {ResolverCatalog} from '../apps/api/catalog';
import {Store} from '../apps/api/store';
import {AppError} from '../apps/api/errors';
import {FixtureResolver,testConfig,tracks} from './fixtures';
const artist={id:'UCmarra',name:'Marracash'},other={id:'UCother',name:'Altro'};
test('automatic artist priority retains title-only matches, missing credits, collaborations and stable ties',()=>{
  const items=[{title:'Marracash',artists:[other]},{title:'Senza crediti',artists:[]},{title:'King',artists:[artist]},{title:'Featuring',artists:[other,artist]}];
  const result=rankSearch('  MARRACASH ',items,[artist]);
  assert.equal(result.priorityArtist?.id,artist.id);assert.deepEqual(result.items.map(item=>item.title),['King','Featuring','Marracash','Senza crediti']);assert.equal(result.items.length,items.length);assert.equal(items[0].title,'Marracash');
});
test('title search, combined query, longest whole artist name and ambiguity do not select a namesake',()=>{
  const items=[{title:'Crudelia live',artists:[other]},{title:'Crudelia',artists:[other]},{title:'Altro',artists:[artist]},{title:'Crudelia',artists:[artist]}];
  assert.deepEqual(rankSearch('Crudelia',items).items.map(item=>item.title),['Crudelia','Crudelia','Crudelia live','Altro']);
  const combined=rankSearch('Marracash Crudelia',items,[artist]);assert.equal(combined.items[0],items[3]);assert.equal(combined.priorityArtist?.id,artist.id);
  assert.equal(rankSearch('Marracashh',items,[artist]).priorityArtist,undefined);
  assert.equal(rankSearch('Marracash',items,[artist,{id:'UCnamesake',name:'Marracash'}]).priorityArtist,undefined);
  assert.equal(rankSearch('Marracash',items,[artist,artist]).priorityArtist?.id,artist.id);
  assert.equal(rankSearch('Marracash King',[],[artist,{id:'UCband',name:'Marracash King'}]).priorityArtist?.id,'UCband');
  assert.equal(rankSearch('Beyonce\u0301',[],[{id:'UCb',name:'Beyoncé'}]).priorityArtist?.id,'UCb');
  assert.equal(rankSearch('U2 One',[],[{id:'UCu2',name:'U2'}]).priorityArtist?.id,'UCu2');
});
test('ranking precedes pagination and the frozen snapshot survives expiry, outage and restart',async()=>{
  const store=new Store(':memory:'),config=testConfig(),resolver=new FixtureResolver(config,''),catalog=new ResolverCatalog(config,store,resolver);
  let calls=0;resolver.searchSnapshot=async()=>{calls++;return {items:Array.from({length:40},(_,i)=>({...tracks[0],id:`rank-${i}`,title:i===39?'King':'Marracash',artists:i===39?[artist]:[other]})),candidates:[artist],truncated:false};};
  try{
    const [one,two]=await Promise.all([catalog.search('Marracash'),catalog.search('Marracash')]);assert.deepEqual(one,two);assert.equal(calls,1);assert.equal(one.items[0].id,'rank-39');assert.equal(one.items.length,20);
    store.db.exec('UPDATE search_cache SET expires=0');resolver.searchSnapshot=async()=>{calls++;throw new AppError(503,'RESOLVER_FAILED','Assente');};
    const next=await catalog.search('Marracash',one.nextCursor!);assert.equal(calls,1);assert.equal(next.items.length,20);assert.equal(next.nextCursor,null);assert.equal(new Set([...one.items,...next.items].map(item=>item.id)).size,40);
    const restarted=new ResolverCatalog(testConfig({token:'next-token'}),store,resolver),stale=await restarted.search('Marracash');assert.equal(stale.cache.degraded,true);assert.equal(stale.priorityArtist?.id,artist.id);assert.equal(calls,2);
    assert.equal((await restarted.search('Marracash',stale.nextCursor!)).items[0].id,next.items[0].id);
    await assert.rejects(restarted.search('Marracash',one.nextCursor!),/pagina è scaduta/);
    store.db.exec('UPDATE search_cache SET fetched=fetched+1');await assert.rejects(restarted.search('Marracash',stale.nextCursor!),/pagina è scaduta/);
    await assert.rejects(restarted.search('Altra query'),/Assente/);
  }finally{store.close();}
});
