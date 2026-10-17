import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {artistChoices,cleanExclusions,emptyPlan,isExcluded,makeShufflePlan,reconcileShuffle,upcomingTracks,visitShuffle} from '../packages/domain/listening';
import type {Track,QueueItem} from '../packages/domain/index';

const memory=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{value:{getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>memory.set(k,v),removeItem:(k:string)=>memory.delete(k)},configurable:true});
const {usePlayer}=await import('../apps/client/src/store');
const tracks:Track[]=Array.from({length:5},(_,i)=>({id:`track-${i}`,videoId:`testmusic0${i}`,title:`Brano ${i}`,artist:`Artista ${i}`,artists:[{id:`artist-${i}`,name:`Artista ${i}`}],duration:120,thumbnail:'',canonicalUrl:`https://youtu.be/testmusic0${i}`}));
const current=()=>usePlayer.getState().queue[usePlayer.getState().index];
beforeEach(()=>{usePlayer.setState({...usePlayer.getInitialState()});memory.clear();});

test('batch enqueue preserves the active entry and rejects an oversized album without partial insertion',()=>{
  usePlayer.getState().play(tracks[0],tracks);usePlayer.getState().setShuffle(true);usePlayer.setState({position:31});const before=usePlayer.getState(),id=current().queueId;
  assert.equal(usePlayer.getState().enqueueMany([tracks[1],tracks[1]]),true);const after=usePlayer.getState();assert.equal(after.queue.length,7);assert.equal(current().queueId,id);assert.equal(after.position,31);assert.equal(after.activation,before.activation);assert.equal(new Set(after.queue.map(t=>t.queueId)).size,7);
  const ids=after.queue.map(t=>t.queueId);assert.equal(usePlayer.getState().enqueueMany(Array(1000).fill(tracks[0])),false);assert.deepEqual(usePlayer.getState().queue.map(t=>t.queueId),ids);assert.equal(current().queueId,id);
});

test('Fisher-Yates fixes the current entry, visits every queue ID, including duplicate videos',()=>{
  assert.deepEqual(makeShufflePlan([],undefined),emptyPlan());
  assert.deepEqual(makeShufflePlan(['a'],'a'),{ids:['a'],cursor:0,visited:0,cycleStart:0,consumed:['a']});
  for(const random of [0,.25,.99]){const plan=makeShufflePlan(['a','b','c','d'],'b',()=>random);assert.equal(plan.ids[0],'b');assert.equal(new Set(plan.ids).size,4);}
  const queue:QueueItem[]=[{...tracks[0],queueId:'a'},{...tracks[0],queueId:'b'}];
  const plan=makeShufflePlan(['a','b'],'a');
  assert.equal(upcomingTracks(queue,0,true,plan,{tracks:[],artists:[]})[0].queueId,'b');
});
test('reconciling preserves past and future order while removing unavailable entries and adding once',()=>{
  const queue=tracks.map((t,i)=>({...t,queueId:String(i)}));
  const plan=reconcileShuffle({ids:['0','1','2','3'],cursor:1},queue.filter(t=>t.queueId!=='2'),queue.filter(t=>t.queueId!=='2'),()=>0);
  assert.deepEqual(plan,{ids:['0','1','3','4'],cursor:1,visited:1,cycleStart:0,consumed:['0','1']});
  assert.deepEqual(reconcileShuffle(plan,queue.filter(t=>t.queueId!=='2'),queue.filter(t=>t.queueId!=='2')),plan);
});
test('exclusions match video IDs and structured artist IDs, with explicit exact-name fallback',()=>{
  const rule=artistChoices(tracks[0])[0];
  const exclusions={tracks:[],artists:[rule]};
  assert.equal(isExcluded(tracks[0],exclusions),true);
  assert.equal(isExcluded({...tracks[0],artists:[{id:'other',name:rule.name}]},exclusions),false);
  assert.equal(isExcluded({...tracks[0],artists:undefined,artist:'  ARTISTA   0 '},exclusions),true);
  assert.equal(isExcluded({...tracks[0],artists:undefined,artist:'Artista 0 feat. Altro'},exclusions),false);
  assert.equal(isExcluded({...tracks[1],artists:[...tracks[1].artists!,rule]},exclusions),true);
  assert.equal(isExcluded({...tracks[0],id:'other-resolver-id'},{tracks:[tracks[0]],artists:[]}),true);
  assert.deepEqual(cleanExclusions({tracks:[null,{},tracks[0],tracks[0],{...tracks[1],videoId:12345678901}],artists:[null,{},rule,rule]}),{tracks:[{videoId:tracks[0].videoId,title:tracks[0].title,artist:tracks[0].artist}],artists:[rule]});
  const long=artistChoices({...tracks[0],artists:undefined,artist:'Artista dal nome molto lungo '.repeat(12)})[0];
  assert.deepEqual(cleanExclusions(cleanExclusions({tracks:[],artists:[long]})).artists,[long]);
});
test('shuffle exhausts the queue once then stops with repeat off',()=>{
  usePlayer.getState().play(tracks[0],tracks);usePlayer.getState().setShuffle(true);
  const visited=[current().queueId];
  for(let i=1;i<tracks.length;i++){usePlayer.getState().next(true);visited.push(current().queueId);}
  assert.equal(new Set(visited).size,tracks.length);
  const activation=usePlayer.getState().activation;
  usePlayer.getState().next(true);
  assert.equal(usePlayer.getState().playing,false);assert.equal(usePlayer.getState().activation,activation);
  usePlayer.getState().toggle();assert.equal(usePlayer.getState().position,0);assert.equal(usePlayer.getState().playing,true);
});
test('repeat queue starts a new shuffle cycle without immediately replaying the last entry',()=>{
  usePlayer.getState().play(tracks[0],tracks);usePlayer.getState().setShuffle(true);usePlayer.setState({repeat:'playlist'});
  for(let i=1;i<tracks.length;i++)usePlayer.getState().next(true);
  const previous=usePlayer.getState().shufflePlan.ids.at(-2),last=current().queueId;usePlayer.getState().next(true);assert.notEqual(current().queueId,last);
  const path=usePlayer.getState().shufflePlan;assert.equal(new Set(path.ids.slice(path.cycleStart)).size,tracks.length);
  usePlayer.getState().previous();assert.equal(current().queueId,last);usePlayer.getState().previous();assert.equal(current().queueId,previous);
});
test('repeat track replays at audio end, while explicit Next advances',()=>{
  usePlayer.getState().play(tracks[0],tracks);usePlayer.getState().setShuffle(true);usePlayer.setState({repeat:'track',position:120});
  const id=current().queueId;usePlayer.getState().next(true);assert.equal(current().queueId,id);assert.equal(usePlayer.getState().position,0);
  usePlayer.getState().next();assert.notEqual(current().queueId,id);
});
test('previous follows the actual shuffle path and Next follows that path again',()=>{
  usePlayer.getState().play(tracks[0],tracks);usePlayer.getState().setShuffle(true);
  const first=current().queueId;usePlayer.getState().next();const second=current().queueId;usePlayer.getState().next();const third=current().queueId;
  usePlayer.setState({position:4});usePlayer.getState().previous();assert.equal(current().queueId,third);assert.equal(usePlayer.getState().position,0);
  usePlayer.getState().previous();assert.equal(current().queueId,second);usePlayer.getState().previous();assert.equal(current().queueId,first);
  usePlayer.getState().next();assert.equal(current().queueId,second);usePlayer.getState().next();assert.equal(current().queueId,third);
});
test('queue reorder and additions preserve the shuffle path; removal chooses the real next item',()=>{
  usePlayer.getState().play(tracks[0],tracks.slice(0,3));usePlayer.getState().setShuffle(true);
  const before=usePlayer.getState().shufflePlan.ids.slice(),first=current().queueId;
  usePlayer.getState().move(0,2);assert.equal(current().queueId,first);assert.deepEqual(usePlayer.getState().shufflePlan.ids,before);
  usePlayer.getState().enqueue(tracks[3]);assert.deepEqual(usePlayer.getState().shufflePlan.ids.slice(0,3),before);
  usePlayer.setState({playing:false});usePlayer.getState().remove(first);assert.equal(current().queueId,before[1]);assert.equal(usePlayer.getState().playing,false);
  usePlayer.getState().remove(before[2]);usePlayer.getState().next();assert.equal(current().id,tracks[3].id);
});
test('manual shuffle selection records a replay and does not duplicate it in the remaining cycle',()=>{
  usePlayer.getState().play(tracks[0],tracks);usePlayer.getState().setShuffle(true);
  usePlayer.getState().next();const second=current().queueId;
  usePlayer.getState().select(0);assert.equal(current().id,tracks[0].id);
  usePlayer.getState().previous();assert.equal(current().queueId,second);
  usePlayer.getState().next();assert.equal(current().id,tracks[0].id);
  const state=usePlayer.getState();assert.ok(!state.shufflePlan.ids.slice(state.shufflePlan.cursor+1).includes(current().queueId));
});
test('blocking the current track skips it immediately, preserves pause, and blocking all stops safely',()=>{
  usePlayer.getState().play(tracks[0],tracks.slice(0,2));usePlayer.setState({playing:false});
  usePlayer.getState().excludeTrack(tracks[0]);assert.equal(current().id,tracks[1].id);assert.equal(usePlayer.getState().playing,false);
  usePlayer.getState().toggle();assert.equal(usePlayer.getState().playing,true);
  usePlayer.getState().excludeTrack(tracks[1]);assert.equal(usePlayer.getState().index,-1);assert.equal(usePlayer.getState().playing,false);
  usePlayer.getState().toggle();usePlayer.getState().select(0);assert.equal(usePlayer.getState().playing,false);
  usePlayer.getState().play(tracks[0]);assert.match(usePlayer.getState().error!,/esclusi/);
  usePlayer.getState().restoreTrack(tracks[0].videoId);assert.equal(current().id,tracks[0].id);assert.equal(usePlayer.getState().playing,false);
});
test('blocked shuffle entries are removed from upcoming and artist exclusion blocks all matching collaborations',()=>{
  usePlayer.getState().play(tracks[0],tracks);usePlayer.getState().setShuffle(true);
  const futureId=usePlayer.getState().shufflePlan.ids[1],future=usePlayer.getState().queue.find(t=>t.queueId===futureId)!;
  usePlayer.getState().excludeArtist(artistChoices(future)[0]);assert.ok(!usePlayer.getState().shufflePlan.ids.slice(1).includes(futureId));
  usePlayer.getState().restoreArtist(future.artists![0].id,'id');assert.equal(usePlayer.getState().shufflePlan.ids.filter(id=>id===futureId).length,1);
});
test('enqueue into a stopped excluded queue aligns the new shuffle current item',()=>{
  usePlayer.getState().play(tracks[0]);usePlayer.getState().setShuffle(true);usePlayer.getState().excludeTrack(tracks[0]);usePlayer.getState().enqueue(tracks[1]);
  const state=usePlayer.getState();assert.equal(state.shufflePlan.ids[state.shufflePlan.cursor],current().queueId);assert.equal(state.playing,false);
});
test('one-entry shuffle ends without repeat and loops with queue/track repeat',()=>{
  usePlayer.getState().play(tracks[0]);usePlayer.getState().setShuffle(true);usePlayer.getState().next(true);assert.equal(usePlayer.getState().playing,false);
  for(const repeat of ['playlist','track'] as const){usePlayer.setState({repeat});usePlayer.getState().next(true);assert.equal(current().id,tracks[0].id);assert.equal(usePlayer.getState().playing,true);}
});
test('trimming long manual history does not forget entries already consumed in the current cycle',()=>{
  const queue=tracks.map((t,i)=>({...t,queueId:String(i)}));
  let plan=makeShufflePlan(queue.map(t=>t.queueId),'0');
  plan=visitShuffle(plan,'1');
  for(let i=0;i<1100;i++)plan=visitShuffle(plan,String(i%2+2));
  plan=reconcileShuffle(plan,queue,queue);
  assert.ok(plan.ids.slice(plan.visited!+1).every(id=>id==='4'));
  assert.equal(plan.consumed?.length,4);assert.ok(plan.visited!<1000);
});
test('a blocked past entry is skipped while retracing shuffle history',()=>{
  usePlayer.getState().play(tracks[0],tracks);usePlayer.getState().setShuffle(true);
  usePlayer.getState().next();const second=current();usePlayer.getState().next();const third=current();
  usePlayer.getState().previous();usePlayer.getState().previous();
  usePlayer.getState().excludeTrack(second);usePlayer.getState().next();assert.equal(current().queueId,third.queueId);
});
test('excluding the last shuffled entry with repeat leaves a single eligible entry aligned',()=>{
  usePlayer.getState().play(tracks[0],tracks.slice(0,2));usePlayer.getState().setShuffle(true);usePlayer.setState({repeat:'playlist'});usePlayer.getState().next();usePlayer.getState().excludeTrack(tracks[1]);
  const state=usePlayer.getState();assert.equal(current().id,tracks[0].id);assert.equal(state.shufflePlan.ids[state.shufflePlan.cursor],current().queueId);
  usePlayer.getState().next(true);assert.equal(current().id,tracks[0].id);assert.equal(usePlayer.getState().playing,true);
});
test('persisted shuffle and exclusions survive restart in pause, and legacy queues repair duplicate IDs',async()=>{
  usePlayer.getState().play(tracks[0],tracks);usePlayer.getState().setShuffle(true);usePlayer.getState().next();usePlayer.getState().excludeTrack(tracks[4]);usePlayer.setState({position:37});
  const saved=memory.get('ritvio-player-v1')!,plan=usePlayer.getState().shufflePlan,queueId=current().queueId;
  usePlayer.setState({...usePlayer.getInitialState()});memory.set('ritvio-player-v1',saved);await usePlayer.persist.rehydrate();
  assert.equal(current().queueId,queueId);assert.deepEqual(usePlayer.getState().shufflePlan,plan);assert.equal(usePlayer.getState().position,37);assert.equal(usePlayer.getState().playing,false);assert.equal(usePlayer.getState().exclusions.tracks.length,1);
  memory.set('ritvio-player-v1',JSON.stringify({version:1,state:{queue:[{...tracks[0],queueId:'legacy'},{...tracks[1],queueId:'legacy'}],index:1,shuffle:true,position:8,volume:.6}}));await usePlayer.persist.rehydrate();
  const state=usePlayer.getState();assert.equal(new Set(state.queue.map(t=>t.queueId)).size,2);assert.equal(state.shufflePlan.ids[state.shufflePlan.cursor],current().queueId);assert.equal(state.position,8);assert.deepEqual(state.exclusions,{tracks:[],artists:[]});
});
