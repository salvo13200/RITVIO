import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {durationTimer,cleanSleepTimer,remainingSeconds,timerDecision} from '../packages/domain/sleep-timer';
import {upcomingTracks} from '../packages/domain/listening';
import {createApi} from '../apps/api/server';
import {testConfig,FixtureResolver,tracks as apiTracks} from './fixtures';
import type {Track} from '../packages/domain/index';
const memory=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{value:{getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>memory.set(k,v),removeItem:(k:string)=>memory.delete(k)},configurable:true});
const {usePlayer}=await import('../apps/client/src/store');
const tracks:Track[]=Array.from({length:5},(_,i)=>({id:randomUUID(),videoId:`timerqueue${i}`,title:`Brano ${i}`,artist:`Artista ${i}`,duration:120,thumbnail:'',canonicalUrl:''}));
const current=()=>usePlayer.getState().queue[usePlayer.getState().index];
beforeEach(()=>{usePlayer.setState({...usePlayer.getInitialState()});memory.clear();});
test('sleep deadlines use wall time, validate persisted state and stop once after suspension',()=>{
  for(const n of [0,1441,NaN,1.5])assert.throws(()=>durationTimer(n));
  const timer=durationTimer(1,1000);assert.equal(remainingSeconds(timer,1500),60);assert.equal(timerDecision(timer,undefined,0,61000),'expire');assert.equal(cleanSleepTimer({kind:'duration',deadline:'123'}),null);assert.equal(cleanSleepTimer({kind:'track',queueId:'x',activation:-1}),null);
  usePlayer.getState().play(tracks[0]);usePlayer.setState({sleepTimer:timer,position:29});assert.equal(usePlayer.getState().tickSleep(120000),true);assert.equal(usePlayer.getState().playing,false);assert.equal(usePlayer.getState().position,29);assert.equal(usePlayer.getState().sleepTimer,null);assert.equal(usePlayer.getState().tickSleep(120001),false);
});
test('end-of-track timer overrides repeat without advancing; manual change cancels and duration survives skips',()=>{
  usePlayer.getState().play(tracks[0],tracks);usePlayer.setState({repeat:'track'});usePlayer.getState().armSleep('track');const id=current().queueId,activation=usePlayer.getState().activation;
  usePlayer.getState().next(true);assert.equal(current().queueId,id);assert.equal(usePlayer.getState().activation,activation);assert.equal(usePlayer.getState().playing,false);assert.equal(usePlayer.getState().sleepTimer,null);
  usePlayer.getState().toggle();usePlayer.getState().armSleep('track');usePlayer.getState().next();assert.notEqual(current().queueId,id);assert.equal(usePlayer.getState().sleepTimer,null);assert.equal(usePlayer.getState().playing,true);
  usePlayer.getState().armSleep(15);const timer=usePlayer.getState().sleepTimer;usePlayer.getState().next();assert.deepEqual(usePlayer.getState().sleepTimer,timer);usePlayer.getState().cancelSleep();assert.equal(usePlayer.getState().sleepTimer,null);
});
test('play after is first under shuffle, preserves audio and duplicates, rejects exclusions and oversized insertion',()=>{
  usePlayer.getState().play(tracks[0],tracks);usePlayer.getState().setShuffle(true);usePlayer.setState({position:41,playing:false});const before=usePlayer.getState(),id=current().queueId;
  assert.equal(usePlayer.getState().playNext(tracks[3]),true);const s=usePlayer.getState(),next=upcomingTracks(s.queue,s.index,s.shuffle,s.shufflePlan,s.exclusions,s.priorityIds)[0];assert.equal(next.id,tracks[3].id);assert.equal(current().queueId,id);assert.equal(s.activation,before.activation);assert.equal(s.position,41);assert.equal(s.playing,false);assert.equal(s.queue.filter(t=>t.id===tracks[3].id).length,2);
  usePlayer.getState().next();assert.equal(current().queueId,next.queueId);assert.ok(!usePlayer.getState().priorityIds.includes(next.queueId));
  usePlayer.getState().excludeTrack(tracks[4]);const count=usePlayer.getState().queue.length;assert.equal(usePlayer.getState().playNext(tracks[4]),false);assert.equal(usePlayer.getState().queue.length,count);
  usePlayer.setState({queue:Array.from({length:1000},()=>({...tracks[1],queueId:randomUUID()})),index:0});assert.equal(usePlayer.getState().playNext(tracks[0]),false);assert.equal(usePlayer.getState().queue.length,1000);
});
test('batch removal preserves current entry and clear removes excluded future, respecting shuffle history',()=>{
  usePlayer.getState().play(tracks[0],tracks);usePlayer.setState({position:33});const id=current().queueId,activation=usePlayer.getState().activation;usePlayer.getState().removeMany([usePlayer.getState().queue[1].queueId,usePlayer.getState().queue[3].queueId]);assert.equal(current().queueId,id);assert.equal(usePlayer.getState().position,33);assert.equal(usePlayer.getState().activation,activation);
  usePlayer.getState().setShuffle(true);usePlayer.getState().prioritize(usePlayer.getState().queue.find(t=>t.id===tracks[2].id)!.queueId);usePlayer.getState().next();const history=id,nextId=current().queueId;usePlayer.getState().excludeTrack(tracks[4]);usePlayer.setState({repeat:'playlist'});usePlayer.getState().clearUpcoming();assert.equal(current().queueId,nextId);assert.equal(usePlayer.getState().repeat,'off');assert.ok(usePlayer.getState().queue.some(t=>t.queueId===history));assert.equal(usePlayer.getState().queue.length,2);
});
test('timer and explicit next persist across hydration without autoplay or stale IDs',async()=>{
  usePlayer.getState().play(tracks[0],tracks);usePlayer.getState().playNext(tracks[4]);usePlayer.getState().armSleep('track');const saved=JSON.parse(memory.get('ritvio-player-v1')!);usePlayer.setState({...usePlayer.getInitialState()});memory.set('ritvio-player-v1',JSON.stringify(saved));await usePlayer.persist.rehydrate();const s=usePlayer.getState();assert.equal(s.playing,false);assert.equal(s.priorityIds.length,1);assert.equal(s.sleepTimer?.kind,'track');assert.equal(timerDecision(s.sleepTimer,current().queueId,s.activation),'none');
  usePlayer.setState({sleepTimer:durationTimer(1,0)});const value=memory.get('ritvio-player-v1')!;usePlayer.setState({...usePlayer.getInitialState()});memory.set('ritvio-player-v1',value);await usePlayer.persist.rehydrate();assert.equal(usePlayer.getState().tickSleep(60000),true);assert.equal(usePlayer.getState().playing,false);
});
test('queue playlist save is authenticated atomic and preserves duplicate metadata and private ownership',async()=>{
  const config=testConfig(),{app,store}=await createApi({config,resolver:new FixtureResolver(config,'http://fixture.test')});const headers={authorization:'Bearer test-token-only'};
  try{store.saveTrack(apiTracks[0]);store.saveTrack(apiTracks[1]);const payload={name:'La coda',mediaIds:[apiTracks[1].id,apiTracks[0].id,apiTracks[1].id]};assert.equal((await app.inject({method:'POST',url:'/v1/me/playlists/from-queue',payload})).statusCode,401);
    const result=await app.inject({method:'POST',url:'/v1/me/playlists/from-queue',headers,payload});assert.equal(result.statusCode,201);const playlist=result.json();assert.equal(playlist.visibility,'private');assert.deepEqual(playlist.items.map((i:any)=>i.track.id),payload.mediaIds);assert.equal(new Set(playlist.items.map((i:any)=>i.id)).size,3);assert.deepEqual(playlist.items[0].track.artists,apiTracks[1].artists);
    for(const body of [{name:'Vuota',mediaIds:[]},{...payload,owner:randomUUID()},{name:'Troppa',mediaIds:Array(1001).fill(apiTracks[0].id)}])assert.equal((await app.inject({method:'POST',url:'/v1/me/playlists/from-queue',headers,payload:body})).statusCode,400);
    assert.equal((await app.inject({method:'POST',url:'/v1/me/playlists/from-queue',headers,payload:{name:'Assente',mediaIds:[apiTracks[0].id,randomUUID()]}})).statusCode,404);assert.equal((await app.inject({url:'/v1/me/library',headers})).json().playlists.length,1);
  }finally{await app.close();}
});
