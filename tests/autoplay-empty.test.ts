import test from 'node:test';
import assert from 'node:assert/strict';
import {tracks} from './fixtures';
const memory=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{value:{getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>memory.set(k,v),removeItem:(k:string)=>memory.delete(k)},configurable:true});
const {usePlayer}=await import('../apps/client/src/store');
const {attachAutoplay,useAutoplay}=await import('../apps/client/src/autoplay');
const {api}=await import('../apps/client/src/api');
test('an empty filtered autoplay batch latches a stop without restarting or looping requests',async()=>{
  const original=api.catalog.radio;let calls=0;api.catalog.radio=async()=>{calls++;return {data:{videoId:tracks[0].videoId,items:[tracks[0]]},cache:{hit:true,degraded:false,fetchedAt:new Date().toISOString(),expiresAt:new Date().toISOString()}};};
  const s=usePlayer.getState();s.play(tracks[0]);s.setAutoplay(true);const off=attachAutoplay();
  try{await new Promise(r=>setTimeout(r,850));assert.equal(calls,1);assert.equal(useAutoplay.getState().status,'empty');assert.equal(usePlayer.getState().queue.length,1);s.next(true);assert.equal(usePlayer.getState().autoplayWaiting,false);assert.equal(usePlayer.getState().playing,false);await new Promise(r=>setTimeout(r,850));assert.equal(calls,1);}
  finally{off();api.catalog.radio=original;}
});
