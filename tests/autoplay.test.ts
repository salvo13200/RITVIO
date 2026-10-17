import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {autoplaySuggestions,autoplayTarget,cleanAutoplaySeen} from '../packages/domain/autoplay';
import {radioEdition} from '../packages/domain/radio';
import {tracks,radioTracks} from './fixtures';
const memory=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{value:{getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>memory.set(k,v),removeItem:(k:string)=>memory.delete(k)},configurable:true});
const {usePlayer}=await import('../apps/client/src/store');
const {useAutoplay,attachAutoplay}=await import('../apps/client/src/autoplay');
const {api}=await import('../apps/client/src/api');
const response=()=>({data:{videoId:tracks[0].videoId,items:radioTracks},cache:{hit:false,degraded:false,fetchedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()}});
const wait=(ms=850)=>new Promise(r=>setTimeout(r,ms));
beforeEach(()=>{usePlayer.setState({...usePlayer.getInitialState()});useAutoplay.setState({...useAutoplay.getInitialState()});memory.clear();});
test('autoplay defaults off, validates seen keys and never activates through restart',async()=>{
  usePlayer.getState().play(tracks[0]);assert.equal(autoplayTarget(usePlayer.getState()),undefined);usePlayer.getState().setAutoplay(true);usePlayer.setState({autoplayWaiting:true,autoplayRequested:true});
  const saved=memory.get('ritvio-player-v1');usePlayer.setState({...usePlayer.getInitialState()});memory.set('ritvio-player-v1',saved!);await usePlayer.persist.rehydrate();assert.equal(usePlayer.getState().autoplayEnabled,true);assert.equal(usePlayer.getState().playing,false);assert.equal(usePlayer.getState().autoplayWaiting,false);assert.equal(usePlayer.getState().autoplayRequested,false);assert.equal(autoplayTarget(usePlayer.getState()),undefined);
  assert.deepEqual(cleanAutoplaySeen([{videoId:'bad',edition:'x'},{videoId:tracks[0].videoId,edition:'x'.repeat(6001)}]),[]);
});
test('autoplay suggestions deduplicate full queue, recently played editions, proposed items and exclusions',()=>{
  const alias={...radioTracks[0],videoId:'duplicate01'},excluded={tracks:[{videoId:radioTracks[3].videoId,title:'',artist:''}],artists:[]};
  assert.deepEqual(autoplaySuggestions([...radioTracks,alias],[tracks[0]],[radioTracks[0]],[{videoId:radioTracks[1].videoId,edition:radioEdition(radioTracks[1])}],excluded).map(t=>t.videoId),[radioTracks[2].videoId]);
  assert.equal(autoplaySuggestions(radioTracks,[],[],[],{tracks:[],artists:[]},0).length,0);
});
test('tail threshold follows effective shuffle order, repeat and every sleep timer suspend it',()=>{
  const s=usePlayer.getState();s.play(tracks[0],[tracks[0],...radioTracks]);s.setAutoplay(true);assert.equal(autoplayTarget(usePlayer.getState()),undefined);s.select(2);assert.equal(autoplayTarget(usePlayer.getState())?.videoId,radioTracks[3].videoId);
  s.setShuffle(true);const active=usePlayer.getState();usePlayer.setState({shufflePlan:{...active.shufflePlan,ids:active.queue.map(t=>t.queueId),cursor:2,visited:2,consumed:active.queue.slice(0,3).map(t=>t.queueId)}});assert.ok(autoplayTarget(usePlayer.getState()));
  for(const repeat of ['track','playlist'] as const){usePlayer.setState({repeat});assert.equal(autoplayTarget(usePlayer.getState()),undefined);}usePlayer.setState({repeat:'off'});s.armSleep(15);assert.equal(autoplayTarget(usePlayer.getState()),undefined);s.cancelSleep();s.armSleep('track');assert.equal(autoplayTarget(usePlayer.getState()),undefined);
});
test('append preserves the active queue entry, priority and position, and rejects stale intent or capacity overflow',()=>{
  const s=usePlayer.getState();s.play(tracks[0]);s.setAutoplay(true);usePlayer.setState({position:4});const before=usePlayer.getState();assert.equal(before.appendAutoplay(tracks[0],radioTracks,before.autoplayRevision-1),0);assert.equal(before.appendAutoplay(tracks[0],radioTracks,before.autoplayRevision),4);const after=usePlayer.getState();assert.equal(after.queue[0],before.queue[0]);assert.equal(after.position,4);assert.equal(after.activation,before.activation);assert.equal(after.queue[1].source,'autoplay');assert.equal(after.queue[1].suggestedFrom?.videoId,tracks[0].videoId);
  assert.equal(after.appendAutoplay(tracks[0],radioTracks,after.autoplayRevision),0);usePlayer.setState({queue:Array.from({length:1000},(_,i)=>({...tracks[0],queueId:'full'+i}))});assert.equal(autoplayTarget(usePlayer.getState()),undefined);assert.equal(usePlayer.getState().appendAutoplay(tracks[0],radioTracks,usePlayer.getState().autoplayRevision),0);
});
test('natural or requested end can wait for a batch; timer and repeat retain precedence',()=>{
  const s=usePlayer.getState();s.play(tracks[0]);s.setAutoplay(true);s.next(true);assert.equal(usePlayer.getState().autoplayWaiting,true);assert.equal(usePlayer.getState().playing,false);const revision=usePlayer.getState().autoplayRevision;s.appendAutoplay(tracks[0],radioTracks,revision);assert.equal(usePlayer.getState().queue[usePlayer.getState().index].videoId,radioTracks[0].videoId);assert.equal(usePlayer.getState().playing,true);
  s.play(tracks[0]);s.armSleep('track');s.next(true);assert.equal(usePlayer.getState().autoplayWaiting,false);assert.equal(usePlayer.getState().playing,false);s.cancelSleep();s.toggle();usePlayer.setState({repeat:'track'});s.next(true);assert.equal(usePlayer.getState().index,0);assert.equal(usePlayer.getState().autoplayWaiting,false);
  usePlayer.setState({repeat:'off'});s.next();assert.equal(usePlayer.getState().autoplayWaiting,true);
});
test('clearing upcoming disables autoplay; proposed removals remain excluded from subsequent batches',()=>{
  const s=usePlayer.getState();s.play(tracks[0]);s.setAutoplay(true);s.appendAutoplay(tracks[0],radioTracks,usePlayer.getState().autoplayRevision);s.removeMany(usePlayer.getState().queue.slice(1).map(t=>t.queueId));assert.equal(s.appendAutoplay(tracks[0],radioTracks,usePlayer.getState().autoplayRevision),0);s.clearUpcoming();assert.equal(usePlayer.getState().autoplayEnabled,false);
});
test('controller issues one batch after stable playback, does not replace current audio or repeat on progress',async()=>{
  const original=api.catalog.radio;let calls=0;api.catalog.radio=async()=>{calls++;return response();};const s=usePlayer.getState();s.play(tracks[0]);s.setAutoplay(true);usePlayer.setState({position:4});const before=usePlayer.getState(),off=attachAutoplay();
  try{await wait();assert.equal(calls,1);assert.equal(usePlayer.getState().queue.length,5);assert.equal(usePlayer.getState().position,4);assert.equal(usePlayer.getState().activation,before.activation);for(let i=0;i<50;i++)usePlayer.setState({position:4+i/100});await wait();assert.equal(calls,1);}finally{off();api.catalog.radio=original;}
});
test('late natural-end result continues exactly once; manual pause discards it',async()=>{
  const original=api.catalog.radio;let resolve!:(value:ReturnType<typeof response>)=>void;api.catalog.radio=()=>new Promise(r=>resolve=r);const s=usePlayer.getState();s.play(tracks[0]);s.setAutoplay(true);const off=attachAutoplay();
  try{await wait();s.next(true);assert.equal(usePlayer.getState().autoplayWaiting,true);resolve(response());await wait(30);assert.equal(usePlayer.getState().index,1);assert.equal(usePlayer.getState().playing,true);}finally{off();api.catalog.radio=original;}
  s.play(tracks[0]);s.setAutoplay(true);api.catalog.radio=()=>new Promise(r=>resolve=r);const off2=attachAutoplay();try{await wait();s.toggle();resolve(response());await wait(40);assert.equal(usePlayer.getState().queue.length,1);assert.equal(usePlayer.getState().playing,false);}finally{off2();api.catalog.radio=original;}
});
test('failure or empty batches stop automatic retries and explicit retry prepares while paused',async()=>{
  const original=api.catalog.radio;let calls=0;api.catalog.radio=async()=>{calls++;throw Error('offline');};const s=usePlayer.getState();s.play(tracks[0]);s.setAutoplay(true);const off=attachAutoplay();
  try{await wait();assert.equal(useAutoplay.getState().status,'error');assert.equal(usePlayer.getState().autoplayStopped,true);s.next(true);assert.equal(usePlayer.getState().autoplayWaiting,false);await wait();assert.equal(calls,1);
    api.catalog.radio=async()=>{calls++;return response();};useAutoplay.getState().retry();await wait();assert.equal(calls,2);assert.equal(usePlayer.getState().queue.length,5);assert.equal(usePlayer.getState().playing,false);
  }finally{off();api.catalog.radio=original;}
});
