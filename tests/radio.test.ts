import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {radioSuggestions} from '../packages/domain/radio';
import {createApi} from '../apps/api/server';
import {AppError} from '../apps/api/errors';
import {testConfig,FixtureResolver,tracks,radioTracks} from './fixtures';
const memory=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{value:{getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>memory.set(k,v),removeItem:(k:string)=>memory.delete(k)},configurable:true});
const {usePlayer,nextPreparedTrack}=await import('../apps/client/src/store');
beforeEach(()=>{usePlayer.setState({...usePlayer.getInitialState()});memory.clear();});
const headers={authorization:'Bearer test-token-only'};
test('radio cache coalesces provider work, deduplicates IDs and saves playable catalog metadata',async()=>{
  const config=testConfig(),resolver=new FixtureResolver(config,''),{app}=await createApi({config,resolver});
  try{
    const url='/v1/catalog/radio/'+tracks[1].videoId;
    const responses=await Promise.all(Array.from({length:6},()=>app.inject({url,headers})));
    for(const r of responses){assert.equal(r.statusCode,200);assert.equal(r.json().data.items.length,5);}
    assert.equal(resolver.catalogCalls.filter(c=>c.startsWith('radio:')).length,1);
    assert.equal((await app.inject({url,headers})).json().cache.hit,true);
    for(const track of responses[0].json().data.items)assert.equal((await app.inject({url:'/v1/media/'+track.id,headers})).statusCode,200);
    assert.equal((await app.inject({method:'POST',url:'/v1/media/'+radioTracks[0].id+'/playback?prepare=true',headers})).statusCode,200);
    assert.equal((await app.inject(url)).statusCode,401);
    assert.equal((await app.inject({url:'/v1/catalog/radio/invalid',headers})).statusCode,400);
  }finally{await app.close();}
});
test('radio provider failure serves dated stale cache; first failure and malformed response remain errors',async()=>{
  const config=testConfig(),resolver=new FixtureResolver(config,''),{app,store}=await createApi({config,resolver});
  try{
    const url='/v1/catalog/radio/'+tracks[0].videoId;
    assert.equal((await app.inject({url,headers})).statusCode,200);store.db.prepare('UPDATE catalog_pages SET expires=?').run(Date.now()-1);
    resolver.failure=new AppError(503,'RESOLVER_FAILED','Catalogo non disponibile');
    const stale=await app.inject({url,headers});assert.equal(stale.statusCode,200);assert.equal(stale.json().cache.degraded,true);
    assert.equal((await app.inject({url:'/v1/catalog/radio/'+radioTracks[0].videoId,headers})).statusCode,503);
    resolver.failure=null;resolver.radio=async videoId=>({videoId,items:[{...radioTracks[0],videoId:'invalid'}]});
    assert.equal((await app.inject({url:'/v1/catalog/radio/'+radioTracks[0].videoId,headers})).statusCode,502);
  }finally{await app.close();}
});
test('radio removes seed editions, duplicate videos and exclusions, preserving remixes and provider order',()=>{
  const edition={...tracks[0],videoId:'edition0001'},remix={...tracks[0],videoId:'remixed0001',title:tracks[0].title+' (Remix)'};
  const excluded={tracks:[{videoId:radioTracks[0].videoId,title:'',artist:''}],artists:[{id:radioTracks[1].artists![0].id,name:'',match:'id' as const}]};
  assert.deepEqual(radioSuggestions(tracks[0],[tracks[0],edition,radioTracks[0],radioTracks[1],remix,...radioTracks,remix],excluded).map(t=>t.videoId),[remix.videoId,radioTracks[2].videoId,radioTracks[3].videoId]);
  assert.equal(radioSuggestions(tracks[0],Array.from({length:40},(_,i)=>({...radioTracks[0],videoId:String(i).padStart(11,'0'),title:'Title '+i})),{tracks:[],artists:[]}).length,25);
});
test('radio on current seed preserves audio, pause and end-track timer; next preparation uses its suggestions',()=>{
  usePlayer.getState().play(tracks[0],tracks);usePlayer.setState({position:4,playing:false,repeat:'track'});usePlayer.getState().setShuffle(true);usePlayer.getState().armSleep('track');
  const before=usePlayer.getState();assert.equal(before.startRadio(tracks[0],radioTracks,new Date().toISOString(),false),true);
  const s=usePlayer.getState();assert.equal(s.queue[0],before.queue[before.index]);assert.equal(s.activation,before.activation);assert.equal(s.position,4);assert.equal(s.playing,false);assert.deepEqual(s.sleepTimer,before.sleepTimer);assert.equal(s.repeat,'off');assert.equal(s.shuffle,false);
  assert.equal(nextPreparedTrack(s),undefined);s.cancelSleep();s.toggle();assert.equal(nextPreparedTrack(usePlayer.getState())?.videoId,radioTracks[0].videoId);
  s.leaveRadio();assert.equal(usePlayer.getState().queue,s.queue);assert.equal(usePlayer.getState().radioSession,null);
});
test('radio is finite, prioritization and exclusions still apply, and manual play leaves it',()=>{
  assert.equal(usePlayer.getState().startRadio(tracks[0],radioTracks,new Date().toISOString(),false),true);
  const s=usePlayer.getState();s.prioritize(s.queue[3].queueId);assert.equal(nextPreparedTrack(usePlayer.getState())?.videoId,radioTracks[2].videoId);
  s.excludeTrack(radioTracks[2]);assert.notEqual(nextPreparedTrack(usePlayer.getState())?.videoId,radioTracks[2].videoId);
  usePlayer.getState().select(usePlayer.getState().queue.length-1);usePlayer.getState().next(true);assert.equal(usePlayer.getState().playing,false);assert.equal(usePlayer.getState().repeat,'off');
  s.play(tracks[1]);assert.equal(usePlayer.getState().radioSession,null);
});
test('empty or fully excluded radio preserves the old queue; restart restores radio paused',async()=>{
  usePlayer.getState().play(tracks[0]);const before=usePlayer.getState();assert.equal(before.startRadio(tracks[0],[],new Date().toISOString(),false),false);assert.equal(usePlayer.getState().queue,before.queue);
  before.excludeTrack(radioTracks[0]);assert.equal(before.startRadio(tracks[0],[radioTracks[0]],new Date().toISOString(),false),false);
  assert.equal(before.startRadio(tracks[0],radioTracks,new Date().toISOString(),true),true);
  const persisted=memory.get('ritvio-player-v1');usePlayer.setState({...usePlayer.getInitialState()});memory.set('ritvio-player-v1',persisted!);await usePlayer.persist.rehydrate();assert.ok(usePlayer.getState().radioSession);assert.equal(usePlayer.getState().playing,false);assert.equal(usePlayer.getState().radioSession?.degraded,true);assert.equal(usePlayer.getState().queue[1].source,'radio');
});
