import type {Track,Playback} from '../../../packages/domain/index';
import {api,ApiError} from './api';
import {usePlayer,nextPreparedTrack} from './store';
const descriptors=new Map<string,Playback>();
const freshEpochs=new Map<string,number>();let epoch=0;
const valid=(value:Playback)=>Date.parse(value.expiresAt)>Date.now()+60000;
function remember(id:string,descriptor:Playback){descriptors.delete(id);descriptors.set(id,descriptor);while(descriptors.size>30)descriptors.delete(descriptors.keys().next().value!);}
export async function preparePlayback(track:Track,fresh:boolean,signal:AbortSignal,background=false){
  if(fresh){freshEpochs.delete(track.id);freshEpochs.set(track.id,++epoch);while(freshEpochs.size>30)freshEpochs.delete(freshEpochs.keys().next().value!);}
  const version=freshEpochs.get(track.id);
  const cached=descriptors.get(track.id);
  if(!fresh&&!background&&cached&&valid(cached))return {descriptor:cached,prepared:true,restoreMs:0,descriptorMs:0};
  if(fresh||!cached||!valid(cached))descriptors.delete(track.id);const started=performance.now();
  // Search/library tracks normally already exist. Avoid a serial media GET before every play.
  let restoreMs=0,descriptor:Playback;
  try{descriptor=await api.playback(track.id,fresh,signal,background);}
  catch(error){
    if(!(error instanceof ApiError)||error.code!=='MEDIA_NOT_FOUND')throw error;
    const restoring=performance.now();await api.restore(track,signal,background);restoreMs=performance.now()-restoring;
    descriptor=await api.playback(track.id,fresh,signal,background);
  }
  if(signal.aborted)throw new DOMException('Preparazione annullata','AbortError');
  if(version===freshEpochs.get(track.id))remember(track.id,descriptor);return {descriptor,prepared:false,restoreMs,descriptorMs:performance.now()-started-restoreMs};
}
/** Prepare one next descriptor and a bounded server RAM prefix after playback settles. */
export function attachPlaybackPreparation(){
  const active=new Set<AbortController>();
  let timer:ReturnType<typeof setTimeout>|undefined,controller:AbortController|undefined,target='',targetKey='',signature:unknown[];
  const cancel=(keep=false)=>{clearTimeout(timer);if(!keep)controller?.abort();controller=undefined;};
  const update=()=>{
    const s=usePlayer.getState(),nextSignature=[s.queue,s.index,s.playing,s.loading,s.shuffle,s.shufflePlan,s.priorityIds,s.repeat,s.exclusions,s.sleepTimer];
    if(signature?.every((value,i)=>value===nextSignature[i]))return;signature=nextSignature;
    if(!s.playing)for(const pending of active)pending.abort();
    const next=nextPreparedTrack(s),nextId=next?.id??'',identity=next?`${s.activation}:${next.id}`:'';
    if(identity===targetKey)return;
    // If the prepared item becomes current, its foreground request can share the server job.
    cancel(s.playing&&s.queue[s.index]?.id===target);target=nextId;targetKey=identity;
    if(!next)return;
    // Even a known descriptor may have lost its RAM audio after eviction or expiry.
    timer=setTimeout(()=>{const own=new AbortController();controller=own;active.add(own);void preparePlayback(next,false,own.signal,true).catch(()=>{}).finally(()=>{active.delete(own);if(controller===own)controller=undefined;});},700);
  };
  const unsubscribe=usePlayer.subscribe(update);update();
  return()=>{unsubscribe();cancel();for(const pending of active)pending.abort();};
}
