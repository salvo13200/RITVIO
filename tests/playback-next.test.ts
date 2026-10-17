import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
const memory=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{value:{getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>memory.set(k,v),removeItem:(k:string)=>memory.delete(k)},configurable:true});
const {usePlayer,nextPreparedTrack}=await import('../apps/client/src/store');
const {tracks}=await import('./fixtures');
beforeEach(()=>usePlayer.setState({...usePlayer.getInitialState()}));
test('preparation follows real next selection across priority, exclusions and deterministic shuffle without mutation',()=>{
  usePlayer.getState().play(tracks[0],tracks);usePlayer.setState({loading:false});assert.equal(nextPreparedTrack(usePlayer.getState())?.id,tracks[1].id);
  usePlayer.getState().setShuffle(true);const before=JSON.stringify(usePlayer.getState().shufflePlan),next=nextPreparedTrack(usePlayer.getState());assert.equal(JSON.stringify(usePlayer.getState().shufflePlan),before);usePlayer.getState().next();assert.equal(usePlayer.getState().queue[usePlayer.getState().index].id,next?.id);
  usePlayer.getState().play(tracks[0],tracks);usePlayer.getState().playNext(tracks[0]);usePlayer.setState({loading:false});assert.equal(nextPreparedTrack(usePlayer.getState())?.queueId,usePlayer.getState().priorityIds[0]);
  usePlayer.getState().excludeTrack(tracks[1]);assert.notEqual(nextPreparedTrack(usePlayer.getState())?.id,tracks[1].id);
});
test('repeat, sleep and pause avoid unwanted speculative resolutions',()=>{
  usePlayer.getState().play(tracks[0],tracks);usePlayer.setState({loading:false,repeat:'track'});assert.equal(nextPreparedTrack(usePlayer.getState())?.id,tracks[0].id);
  usePlayer.getState().armSleep('track');assert.equal(nextPreparedTrack(usePlayer.getState()),undefined);usePlayer.getState().cancelSleep();usePlayer.setState({playing:false});assert.equal(nextPreparedTrack(usePlayer.getState()),undefined);
  usePlayer.setState({playing:true,repeat:'playlist',index:1});assert.equal(nextPreparedTrack(usePlayer.getState())?.id,tracks[0].id);
});
