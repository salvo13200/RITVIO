import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {tasteProfile,buildTasteMix,defaultTasteSettings,type TasteInput,type MixRequest} from '../packages/domain/taste';
import type {ActivityEntry,ActivityCheckpoint} from '../packages/domain/activity';
import type {Track} from '../packages/domain/index';
import {createApi} from '../apps/api/server';
import {mediaId} from '../apps/api/store';
import {FixtureResolver,testConfig,tracks} from './fixtures';
import {AppError} from '../apps/api/errors';
const now=Date.now(),day=86400000,headers={authorization:'Bearer test-token-only'};
const input=(patch:Partial<TasteInput>={}):TasteInput=>({entries:[],likes:new Set(),saved:new Set(),genres:{},feedback:{},settings:{...defaultTasteSettings},now,...patch});
const entry=(patch:Partial<ActivityEntry>={}):ActivityEntry=>({id:randomUUID(),mediaId:tracks[0].id,track:tracks[0],epoch:1,sequence:1,startedAt:now-180000,updatedAt:now,listenedMs:150000,durationMs:180000,seeks:0,closed:true,reason:'completed',excluded:false,replay:false,tasteWeight:1,...patch});
const request:MixRequest={kind:'discovery',exclusions:{tracks:[],artists:[]}};
const checkpoint=(mediaId:string,index=0):ActivityCheckpoint=>({id:randomUUID(),mediaId,epoch:1,sequence:1,startedAt:Date.now()-(index+2)*day,updatedAt:Date.now()-(index+2)*day+180000,listenedMs:150000,durationMs:180000,seeks:0,closed:true,reason:'completed'});
test('taste uses measured coverage, decay, reduced replays, exclusions and quick skips',()=>{
  const base=tasteProfile(input({entries:[entry()]}));assert.equal(base.trackScores[tracks[0].id],150000/180000+.25);assert.equal(base.personalized,false);
  const old=tasteProfile(input({entries:[entry({updatedAt:now-14*day,startedAt:now-14*day-180000})]}));assert.equal(old.trackScores[tracks[0].id],base.trackScores[tracks[0].id]/2);
  const mixed=tasteProfile(input({entries:[entry(),entry({tasteWeight:.25}),entry({tasteWeight:0}),entry({excluded:true}),entry({listenedMs:1000,reason:'skip'})]}));assert.equal(mixed.sessions,2);assert.equal(mixed.listenedMs,300000);assert.ok(mixed.trackScores[tracks[0].id]<base.trackScores[tracks[0].id]*1.25);
  const seek=tasteProfile(input({entries:[entry({listenedMs:1000,reason:'completed',seeks:1})]}));assert.equal(seek.trackScores[tracks[0].id],1000/180000);
  const interrupted=tasteProfile(input({entries:[entry({reason:'error',listenedMs:90000})]}));assert.equal(interrupted.trackScores[tracks[0].id],.5);
  const reset=tasteProfile(input({entries:[entry()],settings:{...defaultTasteSettings,resetAt:now-1000}}));assert.equal(reset.sessions,0);
});
test('genre attribution separates artists and tracks, splits collaborators, and exposes unknown weight',()=>{
  const track={...tracks[0],artists:[{id:'a',name:'Omonimo'},{id:'b',name:'Omonimo'}]};
  const data=input({entries:[entry({track})],genres:{'artist:a':['rock'],['track:'+tracks[0].id]:['jazz']}});
  const result=tasteProfile(data);assert.equal(result.unclassifiedPercent,50);assert.equal(result.genres[0].name,'rock');assert.equal(result.artists.length,2);assert.equal(result.artists[0].score,result.artists[1].score);
  data.settings.genreLevel='track';assert.equal(tasteProfile(data).unclassifiedPercent,0);assert.equal(tasteProfile(data).genres[0].name,'jazz');
  data.genres={};assert.equal(tasteProfile(data).unclassifiedPercent,100);
});
const catalog=Array.from({length:80},(_,i):Track=>{const videoId=`mix${String(i).padStart(8,'0')}`,artist=Math.floor(i/4);return {...tracks[0],id:mediaId(videoId),videoId,title:`Brano ${i}`,artist:`Artista ${artist}`,artists:[{id:`UCmix${artist}`,name:`Artista ${artist}`}],duration:180};});
test('daily mixes are deterministic, meet discovery quota with enough candidates, and enforce variety and exclusions',()=>{
  const candidates=catalog.map((track,i)=>({track,discovered:i>=40,query:'Artista di prova'}));
  const data=input({likes:new Set(catalog.slice(0,40).map(t=>t.id)),settings:{...defaultTasteSettings,discoveryPercent:50}});
  const mix=buildTasteMix(data,candidates,request,'2026-10-11');assert.equal(mix.items.length,20);assert.equal(mix.discoveryCount,10);assert.deepEqual(mix,buildTasteMix(data,candidates,request,'2026-10-11'));
  const counts=new Map<string,number>();for(let i=0;i<mix.items.length;i++){const id=mix.items[i].track.artists![0].id;counts.set(id,(counts.get(id)??0)+1);if(i)assert.notEqual(id,mix.items[i-1].track.artists![0].id);}assert.ok([...counts.values()].every(n=>n<=3));
  const blocked=mix.items[0].track;data.feedback[mix.items[1].track.id]=-1;data.entries=[entry({track:mix.items[2].track,mediaId:mix.items[2].track.id})];
  const filtered=buildTasteMix(data,candidates,{...request,exclusions:{tracks:[{videoId:blocked.videoId,title:blocked.title,artist:blocked.artist}],artists:[{...mix.items[3].track.artists![0],match:'id'}]}},'2026-10-11');
  assert.ok(filtered.items.every(i=>i.track.id!==blocked.id&&i.track.id!==mix.items[1].track.id&&i.track.id!==mix.items[2].track.id&&i.track.artists![0].id!==mix.items[3].track.artists![0].id));
  const equivalent={...catalog[0],id:mediaId('mix99999999'),videoId:'mix99999999',title:catalog[0].title+' (Official Audio)'};const dedup=buildTasteMix(data,[...candidates,{track:equivalent,discovered:false}],{kind:'familiar',exclusions:{tracks:[],artists:[]}},'2026-10-11');assert.ok(dedup.items.filter(i=>i.track.id===catalog[0].id||i.track.id===equivalent.id).length<=1);
});
test('genre mixes require confirmed level data and same-name artists do not imply identity',()=>{
  const candidate={...catalog[0],id:mediaId('foreign0001'),videoId:'foreign0001',artists:[{id:'foreign',name:'Artista 0'}]};const data=input({entries:[entry({track:catalog[0]})],genres:{'artist:UCmix0':['rock']}});
  const mix=buildTasteMix(data,[{track:candidate,discovered:true}],{...request,kind:'genre',genre:'rock'},'2026-10-11');assert.equal(mix.items.length,0);
  const discovery=buildTasteMix(data,[{track:candidate,discovered:true}],request,'2026-10-11');assert.equal(discovery.items[0].reason,'discovery');
  assert.equal(buildTasteMix(data,catalog.map(track=>({track,discovered:true})),{...request,kind:'genre',genre:'rock'},'2026-10-11').items.length,3);
});
test('taste API counts all retained sessions, isolates owners, reads confirmed iTunes genre and resets without deleting library',async()=>{
  const {app,store,activity,taste}=await createApi({config:testConfig(),resolver:new FixtureResolver(testConfig(),'fixture')});
  try{
    const owner=store.library.ensureProfile('local').id,other=store.library.ensureProfile('online',randomUUID()).id;store.saveTrack(tracks[0]);store.library.like(owner,tracks[0],true);
    for(let i=0;i<110;i++)activity.checkpoint(owner,checkpoint(tracks[0].id,i));
    assert.equal(activity.snapshot(owner).items.length,100);taste.update(owner,{...defaultTasteSettings,days:180});
    store.db.prepare('INSERT INTO metadata_choices VALUES(?,?,?,?,?)').run(owner,'artist:UCtestArtist01',JSON.stringify({genre:[{name:'rock',original:'Rock'}]}),null,Date.now());
    const snapshot=(await app.inject({url:'/v1/me/taste',headers})).json();assert.equal(snapshot.profile.sessions,110);assert.equal(snapshot.profile.genres[0].name,'rock');assert.equal(taste.snapshot(other).profile.sessions,0);assert.equal(taste.snapshot(other).candidateCount,0);
    const mixed=await app.inject({method:'POST',url:'/v1/me/taste/mix',headers,payload:{kind:'familiar',exclusions:{tracks:[],artists:[]}}});assert.equal(mixed.statusCode,200);assert.equal(mixed.json().items.length,1);
    await app.inject({method:'PUT',url:`/v1/me/taste/feedback/${tracks[0].id}`,headers,payload:{value:-1}});assert.equal(taste.mix(owner,{...request,kind:'familiar'}).items.length,0);assert.equal(taste.snapshot(owner).feedback[0].value,-1);
    await app.inject({method:'PUT',url:`/v1/me/taste/feedback/${tracks[0].id}`,headers,payload:{value:0}});assert.equal(taste.mix(owner,{...request,kind:'familiar'}).items.length,1);
    const clear=await app.inject({method:'DELETE',url:'/v1/me/taste',headers});assert.equal(clear.statusCode,200);assert.equal(taste.snapshot(owner).profile.sessions,0);assert.equal(activity.snapshot(owner).summary.sessions,110);assert.equal(store.library.snapshot(owner).likes.length,1);assert.equal(taste.snapshot(owner).profile.genres.length,0);
    assert.equal((await app.inject({method:'POST',url:'/v1/me/taste/mix',headers,payload:{kind:'genre',exclusions:{tracks:[],artists:[]}}})).statusCode,400);
    assert.equal((await app.inject({method:'PUT',url:'/v1/me/taste/settings',headers,payload:{days:365,genreLevel:'artist',discoveryPercent:90,variety:true,allowRecent:false}})).statusCode,400);
    assert.equal((await app.inject({url:'/v1/me/taste'})).statusCode,401);
  }finally{await app.close();}
});
test('discovery is explicit, cached, coalesced and bounded; outages preserve candidates and privacy cancels late results',async()=>{
  const config=testConfig(),resolver=new FixtureResolver(config,'fixture');const {app,store,activity,taste}=await createApi({config,resolver});
  try{
    const owner=store.library.ensureProfile('local').id;store.library.like(owner,tracks[0],true);assert.equal(taste.snapshot(owner).profile.sessions,0);taste.mix(owner,request);assert.equal(resolver.calls.length,0);
    const results=await Promise.all([taste.discover(owner),taste.discover(owner)]);assert.equal(results[0].added,3);assert.equal(resolver.calls.length,1);assert.equal(taste.snapshot(owner).candidateCount,3);assert.throws(()=>taste.discover(owner),/minuto/);
    store.db.prepare('DELETE FROM taste_discovery').run();resolver.failure=new AppError(503,'UNAVAILABLE','Assente');store.db.prepare('UPDATE search_cache SET expires=0').run();const stale=await taste.discover(owner);assert.equal(stale.failed,1);assert.equal(taste.snapshot(owner).candidateCount,3);
    taste.reset(owner);store.db.prepare('DELETE FROM search_cache').run();resolver.failure=null;let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);const original=resolver.searchSnapshot.bind(resolver);resolver.searchSnapshot=async q=>{await gate;return original(q);};
    const late=taste.discover(owner);activity.changeSettings(owner,true,180);release();await late;assert.equal(Number(store.db.prepare('SELECT count(*) n FROM taste_candidates').get()!.n),0);assert.throws(()=>taste.discover(owner),/privata/);
  }finally{await app.close();}
});
test('prepared mixes persist across restart and cache invalidates feedback, metadata and cleared history',async()=>{
  const directory=mkdtempSync(path.join(tmpdir(),'ritvio-taste-')),config=testConfig({database:path.join(directory,'app.sqlite')});let runtime=await createApi({config,resolver:new FixtureResolver(config,'fixture')});
  try{
    const owner=runtime.store.library.ensureProfile('local').id;runtime.store.library.like(owner,tracks[0],true);const prepared=runtime.taste.mix(owner,{...request,kind:'familiar'});assert.equal(prepared.cached,false);await runtime.app.close();
    runtime=await createApi({config,resolver:new FixtureResolver(config,'fixture')});const restored=runtime.taste.mix(owner,{...request,kind:'familiar'});assert.equal(restored.cached,true);assert.deepEqual(restored.items,prepared.items);
    runtime.taste.feedback(owner,tracks[0].id,-1);assert.equal(runtime.taste.mix(owner,{...request,kind:'familiar'}).items.length,0);runtime.taste.feedback(owner,tracks[0].id,0);
    runtime.store.saveTrack(tracks[0]);runtime.activity.checkpoint(owner,checkpoint(tracks[0].id));runtime.taste.mix(owner,{...request,kind:'familiar'});runtime.activity.clear(owner);assert.equal(runtime.taste.mix(owner,{...request,kind:'familiar'}).cached,false);
  }finally{await runtime.app.close();rmSync(directory,{recursive:true,force:true});}
});
test('zero-time starts and pre-reset sessions cannot seed candidates after a later checkpoint',async()=>{
  const {app,store,activity,taste}=await createApi({config:testConfig(),resolver:new FixtureResolver(testConfig(),'fixture')});
  try{
    const owner=store.library.ensureProfile('local').id;store.saveTrack(tracks[0]);
    const start={...checkpoint(tracks[0].id),startedAt:Date.now()-10000,updatedAt:Date.now(),closed:false,reason:null,listenedMs:0} as ActivityCheckpoint;
    activity.checkpoint(owner,start);assert.equal(taste.snapshot(owner).candidateCount,0);
    activity.checkpoint(owner,{...start,sequence:2,listenedMs:1000});assert.equal(taste.snapshot(owner).candidateCount,1);
    const reset=taste.reset(owner);activity.checkpoint(owner,{...start,sequence:3,updatedAt:reset.resetAt+1,listenedMs:2000});assert.equal(taste.snapshot(owner).candidateCount,0);assert.equal(taste.snapshot(owner).profile.sessions,0);assert.equal(taste.mix(owner,request).items.length,0);
  }finally{await app.close();}
});
