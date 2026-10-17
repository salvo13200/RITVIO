import type {Track,Playback} from '../../../packages/domain/index';
import {api} from './api';
import {usePlayer,nextPreparedTrack} from './store';
const descriptors=new Map<string,Playback>();
const freshEpochs=new Map<string,number>();let epoch=0;
const valid=(value:Playback)=>Date.parse(value.expiresAt)>Date.now()+60000;
function remember(id:string,descriptor:Playback){descriptors.delete(id);descriptors.set(id,descriptor);while(descriptors.size>30)descriptors.delete(descriptors.keys().next().value!);}
export async function preparePlayback(track:Track,fresh:boolean,signal:AbortSignal,background=false){
  if(fresh){freshEpochs.delete(track.id);freshEpochs.set(track.id,++epoch);while(freshEpochs.size>30)freshEpochs.delete(freshEpochs.keys().next().value!);}
  const version=freshEpochs.get(track.id);
  const cached=descriptors.get(track.id);
  if(!fresh&&cached&&valid(cached))return {descriptor:cached,prepared:true,restoreMs:0,descriptorMs:0};
  descriptors.delete(track.id);const started=performance.now();
  // Restore from the local media table; a missing item is resolved only on explicit playback.
  await api.restore(track,signal,background);
  const restoreMs=performance.now()-started,requested=performance.now();
  const descriptor=await api.playback(track.id,fresh,signal,background);
  if(signal.aborted)throw new DOMException('Preparazione annullata','AbortError');
  if(version===freshEpochs.get(track.id))remember(track.id,descriptor);return {descriptor,prepared:false,restoreMs,descriptorMs:performance.now()-requested};
}
/** Resolve one next descriptor after playback settles. No second media element or audio buffering. */
export function attachPlaybackPreparation(){
  const active=new Set<AbortController>();
  let timer:ReturnType<typeof setTimeout>|undefined,controller:AbortController|undefined,target='',signature:unknown[],attempted='';
  const cancel=(keep=false)=>{clearTimeout(timer);if(!keep&&controller){controller.abort();attempted='';}controller=undefined;};
  const update=()=>{
    const s=usePlayer.getState(),nextSignature=[s.queue,s.index,s.playing,s.loading,s.shuffle,s.shufflePlan,s.priorityIds,s.repeat,s.exclusions,s.sleepTimer];
    if(signature?.every((value,i)=>value===nextSignature[i]))return;signature=nextSignature;
    if(!s.playing)for(const pending of active)pending.abort();
    const next=nextPreparedTrack(s),nextId=next?.id??'';
    // If the prepared item becomes current, its foreground request can share the server job.
    cancel(s.playing&&s.queue[s.index]?.id===target);target=nextId;
    if(!next)return;
    const identity=`${s.activation}:${next.id}`;
    const cached=descriptors.get(next.id);
    if(cached&&valid(cached)){timer=setTimeout(()=>{signature=[];attempted='';update();},Math.max(1000,Date.parse(cached.expiresAt)-Date.now()-60000));return;}
    if(attempted===identity)return;
    timer=setTimeout(()=>{attempted=identity;const own=new AbortController();controller=own;active.add(own);void preparePlayback(next,false,own.signal,true).catch(()=>{}).finally(()=>{active.delete(own);if(controller===own){controller=undefined;signature=[];update();}});},700);
  };
  const unsubscribe=usePlayer.subscribe(update);update();
  return()=>{unsubscribe();cancel();for(const pending of active)pending.abort();};
}
