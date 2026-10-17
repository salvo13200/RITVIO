import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {ListeningClock,type ActivityCheckpoint} from '../packages/domain/activity';
import {Store} from '../apps/api/store';
import {ActivityStore} from '../apps/api/activity';
import {createApi} from '../apps/api/server';
import {tracks,FixtureResolver,testConfig} from './fixtures';
const headers={authorization:'Bearer test-token-only'};
const checkpoint=(overrides:Partial<ActivityCheckpoint>={}):ActivityCheckpoint=>({id:randomUUID(),mediaId:tracks[0].id,epoch:1,sequence:1,startedAt:Date.now()-10000,updatedAt:Date.now(),listenedMs:2000,durationMs:12000,seeks:0,closed:false,reason:null,...overrides});
test('listening clock rejects seek jumps, pauses, buffering, suspend and replay discontinuities',()=>{
  const clock=new ListeningClock();clock.sample(0,0,true);clock.sample(1000,1,true);clock.sample(2000,2,true);assert.equal(clock.listenedMs,2000);
  clock.sample(3000,60,true);assert.equal(clock.listenedMs,2000);clock.seek();clock.sample(4000,3,true);clock.sample(5000,4,true);assert.equal(clock.listenedMs,3000);
  clock.sample(6000,4,false);clock.sample(7000,4,true);clock.sample(8000,5,true);assert.equal(clock.listenedMs,4000);
  clock.sample(9000,5,true);clock.sample(10000,5,true);assert.equal(clock.listenedMs,4000);
  clock.sample(30000,25,true);assert.equal(clock.listenedMs,4000);clock.sample(31000,26,true);assert.equal(clock.listenedMs,5000);
  clock.discontinuity();clock.sample(32000,0,true);clock.sample(33000,1,true);assert.equal(clock.listenedMs,6000);assert.equal(clock.seeks,1);
  clock.sample(34000,Number.NaN,true);clock.sample(35000,5,true);assert.equal(clock.listenedMs,6000);
});
test('checkpoints are idempotent, monotonic, per owner, preserve excluded flags and distinguish legacy starts',()=>{
  const store=new Store(':memory:');const activity=new ActivityStore(store);const owner=store.library.ensureProfile('local').id;const other=store.library.ensureProfile('online',randomUUID()).id;store.saveTrack(tracks[0]);
  try{
    store.library.record(owner,tracks[0],randomUUID());const input=checkpoint();activity.checkpoint(owner,input);activity.checkpoint(owner,input);
    assert.equal(activity.snapshot(owner).summary.listenedMs,2000);assert.equal(activity.snapshot(owner).legacyStarts,1);assert.equal(activity.snapshot(other).items.length,0);
    assert.throws(()=>activity.checkpoint(owner,{...input,sequence:2,listenedMs:1000}),/aggiornata/);
    assert.throws(()=>activity.checkpoint(owner,{...input,sequence:2,mediaId:tracks[1].id}),/Identità/);
    activity.exclude(owner,input.id,true);activity.checkpoint(owner,{...input,sequence:2,listenedMs:3000,closed:true,reason:'skip'});
    const result=activity.snapshot(owner);assert.equal(result.items[0].excluded,true);assert.equal(result.items[0].tasteWeight,0);assert.equal(result.summary.skips,1);assert.equal(result.summary.completed,0);
    assert.equal(store.library.snapshot(owner).history.length,2);assert.throws(()=>activity.exclude(other,input.id,true),/non trovata/);
  }finally{store.close();}
});
test('privacy and clearing advance epochs and reject late queued writes without touching library',()=>{
  const store=new Store(':memory:');const activity=new ActivityStore(store);const owner=store.library.ensureProfile('local').id;store.saveTrack(tracks[0]);
  try{
    store.library.like(owner,tracks[0],true);store.library.create(owner,'Conserva');const input=checkpoint();activity.checkpoint(owner,input);
    const settings=activity.changeSettings(owner,true,90);assert.equal(settings.epoch,2);assert.equal(activity.snapshot(owner).items.length,0);assert.equal(store.library.snapshot(owner).history.length,0);
    assert.equal(activity.checkpoint(owner,{...input,sequence:2}).accepted,false);assert.equal(activity.checkpoint(owner,checkpoint({epoch:2})).accepted,false);
    const publicSettings=activity.changeSettings(owner,false,90);assert.equal(publicSettings.epoch,3);
    const publicItem=checkpoint({epoch:3,closed:true,reason:'completed'});activity.checkpoint(owner,publicItem);assert.equal(activity.snapshot(owner).summary.completed,1);
    const cleared=activity.clear(owner);assert.equal(cleared.epoch,4);assert.equal(activity.checkpoint(owner,publicItem).accepted,false);
    const lib=store.library.snapshot(owner);assert.equal(lib.likes.length,1);assert.equal(lib.playlists.length,1);assert.equal(lib.history.length,0);
  }finally{store.close();}
});
test('replays retain raw time but reduce future taste weights; excluded sessions do not seed replay weights',()=>{
  const store=new Store(':memory:');const activity=new ActivityStore(store);const owner=store.library.ensureProfile('local').id;store.saveTrack(tracks[0]);
  try{
    const now=Date.now();const a=checkpoint({startedAt:now-30000,updatedAt:now-25000,closed:true,reason:'replay'});const b=checkpoint({startedAt:now-20000,updatedAt:now-15000,closed:true,reason:'completed'});const c=checkpoint({startedAt:now-10000,updatedAt:now-5000,closed:true,reason:'skip'});
    for(const item of [a,b,c])activity.checkpoint(owner,item);assert.deepEqual(activity.snapshot(owner).items.map(item=>item.tasteWeight),[0,.25,1]);assert.equal(activity.snapshot(owner).summary.listenedMs,6000);
    activity.exclude(owner,a.id,true);assert.deepEqual(activity.snapshot(owner).items.map(item=>item.tasteWeight),[.25,1,0]);
  }finally{store.close();}
});
test('restart restores measured data and closes active sessions as interrupted; retention preserves legacy and likes',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'ritvio-activity-')),filename=path.join(dir,'db.sqlite');let store=new Store(filename);let activity=new ActivityStore(store);const owner=store.library.ensureProfile('local').id;store.saveTrack(tracks[0]);
  try{
    store.library.record(owner,tracks[0],randomUUID());store.library.like(owner,tracks[0],true);activity.checkpoint(owner,checkpoint());store.close();store=new Store(filename);activity=new ActivityStore(store);
    assert.equal(activity.snapshot(owner).items[0].reason,'interrupted');assert.equal(activity.snapshot(owner).summary.listenedMs,2000);
    const cutoff=Date.now()-100*86400000;store.db.prepare('UPDATE listening_sessions SET updated=? WHERE owner=?').run(cutoff,owner);store.db.prepare('UPDATE library_history SET played=? WHERE owner=? AND measured=1').run(cutoff,owner);
    activity.changeSettings(owner,false,90);assert.equal(activity.snapshot(owner).items.length,0);assert.equal(activity.snapshot(owner).legacyStarts,1);assert.equal(store.library.snapshot(owner).likes.length,1);
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test('listening API validates auth, origin, bounds and ownership; legacy history honours privacy and clear invalidates writes',async()=>{
  const config=testConfig();const {app,store}=await createApi({config,resolver:new FixtureResolver(config,'')});store.saveTrack(tracks[0]);
  try{
    assert.equal((await app.inject({url:'/v1/me/listening'})).statusCode,401);assert.equal((await app.inject({url:'/v1/me/listening',headers:{...headers,origin:'https://evil.example'}})).statusCode,403);
    for(const input of [checkpoint({listenedMs:50000}),checkpoint({reason:'completed'}),{...checkpoint(),owner:randomUUID()},checkpoint({listenedMs:-1})])assert.equal((await app.inject({method:'POST',url:'/v1/me/listening/checkpoints',headers,payload:input})).statusCode,400);
    assert.equal((await app.inject({method:'PUT',url:'/v1/me/listening/settings',headers,payload:{privateMode:true,retentionDays:90}})).statusCode,200);
    await app.inject({method:'POST',url:'/v1/me/history',headers,payload:{mediaId:tracks[0].id,eventId:randomUUID()}});assert.equal((await app.inject({url:'/v1/me/library',headers})).json().history.length,0);
    const settings=(await app.inject({method:'PUT',url:'/v1/me/listening/settings',headers,payload:{privateMode:false,retentionDays:90}})).json();const input=checkpoint({epoch:settings.epoch});assert.equal((await app.inject({method:'POST',url:'/v1/me/listening/checkpoints',headers,payload:input})).statusCode,200);
    await app.inject({method:'DELETE',url:'/v1/me/history',headers});const late=(await app.inject({method:'POST',url:'/v1/me/listening/checkpoints',headers,payload:{...input,sequence:2}})).json();assert.equal(late.accepted,false);assert.equal((await app.inject({url:'/v1/me/listening',headers})).json().items.length,0);
  }finally{await app.close();}
});
