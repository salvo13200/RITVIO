import test from 'node:test';
import assert from 'node:assert/strict';
import {PlaybackPreparation} from '../apps/api/playback-preparation';
const turn=()=>new Promise(resolve=>setImmediate(resolve));
type Value={id:string;expires:number};
function setup(){let calls:string[]=[];const pending=new Map<string,{resolve:(v:Value)=>void;reject:(e:unknown)=>void}>();
  const preparation=new PlaybackPreparation<Value>((id,_fresh,signal)=>{calls.push(id);return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});signal.addEventListener('abort',()=>reject(Error('Aborted')),{once:true});if(signal.aborted)reject(Error('Aborted'));});},v=>v.expires>Date.now());
  return {preparation,calls,pending,finish:(id:string)=>pending.get(id)!.resolve({id,expires:Date.now()+60000})};
}
test('foreground joins prefetch without duplicate work; cancelling one consumer keeps the shared resolution alive',async()=>{
  const s=setup(),cancel=new AbortController();
  const pre=s.preparation.resolve('a',false,{priority:'prefetch',signal:cancel.signal});const rejected=assert.rejects(pre);await turn();
  const fg=s.preparation.resolve('a');cancel.abort();await rejected;s.finish('a');assert.equal((await fg).id,'a');await turn();assert.deepEqual(s.calls,['a']);s.preparation.close();
});
test('a different foreground selection preempts background and bypasses its wait',async()=>{
  const s=setup(),pre=s.preparation.resolve('a',false,{priority:'prefetch'});const cancelled=assert.rejects(pre);await turn();
  const fg=s.preparation.resolve('b');await cancelled;await turn();s.finish('b');assert.equal((await fg).id,'b');await turn();assert.equal(s.preparation.diagnostics().active,0);s.preparation.close();
});
test('only one speculative task; at most two running jobs and foreground queue is bounded',async()=>{
  const s=setup(),one=s.preparation.resolve('a'),two=s.preparation.resolve('b');await turn();
  await assert.rejects(s.preparation.resolve('c',false,{priority:'prefetch'}));const three=s.preparation.resolve('c');await turn();assert.deepEqual(s.calls,['a','b']);
  s.finish('a');await one;await turn();assert.deepEqual(s.calls,['a','b','c']);s.finish('b');s.finish('c');await Promise.all([two,three]);s.preparation.close();
});
test('fresh bypasses memory cache; expired descriptors are resolved again and shutdown rejects waiters',async()=>{
  let counter=0;const s=new PlaybackPreparation<Value>(async id=>({id,expires:++counter===3?0:Date.now()+60000}),v=>v.expires>Date.now());
  await s.resolve('a');await s.resolve('a');assert.equal(counter,1);await s.resolve('a',true);await s.resolve('a',true);await s.resolve('a');assert.equal(counter,4);assert.equal(s.diagnostics().cacheHits,1);s.close();await assert.rejects(s.resolve('b'));
});
test('cancelling the only queued consumer prevents obsolete work from running',async()=>{
  const s=setup(),a=s.preparation.resolve('a'),b=s.preparation.resolve('b');await turn();const controller=new AbortController(),c=s.preparation.resolve('c',false,{signal:controller.signal});const rejected=assert.rejects(c);controller.abort();await rejected;s.finish('a');s.finish('b');await Promise.all([a,b]);await turn();assert.deepEqual(s.calls,['a','b']);s.preparation.close();
});
