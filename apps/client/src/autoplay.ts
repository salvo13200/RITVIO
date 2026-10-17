import {create} from 'zustand';
import {usePlayer} from './store';
import {useLibrary} from './library';
import {useRadio} from './radio';
import {api} from './api';
import {autoplayTarget} from '../../../packages/domain/autoplay';
import type {Track,QueueItem} from '../../../packages/domain/index';
import {t} from './i18n';

type AutoplayStatus={status:'idle'|'loading'|'added'|'empty'|'error';seed:Track|null;count:number;error:string|null;degraded:boolean;retry:()=>void};
export const useAutoplay=create<AutoplayStatus>(()=>({status:'idle',seed:null,count:0,error:null,degraded:false,retry:()=>{usePlayer.getState().interruptAutoplay();usePlayer.setState({autoplayRequested:true});}}));
type Task={controller:AbortController;revision:number;queue:QueueItem[];seed:Track;owner:string|undefined};

/** One bounded metadata lookup near the tail; the existing player prefetches audio. */
export function attachAutoplay(){
  let timer:ReturnType<typeof setTimeout>|undefined,task:Task|undefined,attempted='',signature:unknown[]|undefined,committing=false,closed=false;
  const cancel=()=>{clearTimeout(timer);timer=undefined;const old=task;task=undefined;old?.controller.abort();if(useAutoplay.getState().status==='loading')useAutoplay.setState({status:'idle'});};
  const matches=(own:Task)=>{const s=usePlayer.getState();return !closed&&!own.controller.signal.aborted&&s.autoplayRevision===own.revision&&s.queue===own.queue&&useLibrary.getState().data?.profile.id===own.owner&&!useRadio.getState().loading&&autoplayTarget(s)?.videoId===own.seed.videoId;};
  const run=async(seed:Track)=>{
    const s=usePlayer.getState();const own:Task={controller:new AbortController(),revision:s.autoplayRevision,queue:s.queue,seed,owner:useLibrary.getState().data?.profile.id};
    if(!matches(own))return;task=own;attempted=`${own.revision}:${own.owner??''}:${seed.videoId}`;
    useAutoplay.setState({status:'loading',seed,count:0,error:null,degraded:false});
    try{
      const result=await api.catalog.radio(seed.videoId,own.controller.signal);if(!matches(own))return;
      task=undefined;committing=true;
      const added=usePlayer.getState().appendAutoplay(seed,result.data.items,own.revision);
      if(!added)usePlayer.setState({autoplayStopped:true,autoplayWaiting:false,autoplayRequested:false});
      useAutoplay.setState({status:added?'added':'empty',seed,count:added,error:null,degraded:result.cache.degraded});
    }catch(error){if(matches(own)){task=undefined;committing=true;usePlayer.setState({autoplayStopped:true,autoplayWaiting:false,autoplayRequested:false});useAutoplay.setState({status:'error',error:error instanceof Error?error.message:t('autoplay.error')});}}
    finally{committing=false;if(task===own)task=undefined;update();}
  };
  const update=()=>{
    if(closed||committing)return;
    const s=usePlayer.getState(),owner=useLibrary.getState().data?.profile.id,radioBusy=useRadio.getState().loading;
    const nextSignature=[s.queue,s.index,s.playing,s.loading,s.repeat,s.shuffle,s.shufflePlan,s.priorityIds,s.exclusions,s.sleepTimer,s.autoplayEnabled,s.autoplayRevision,s.autoplayWaiting,s.autoplayRequested,s.autoplayStopped,s.error,owner,radioBusy];
    if(signature?.every((v,i)=>v===nextSignature[i]))return;signature=nextSignature;
    const target=radioBusy?undefined:autoplayTarget(s);
    if(task&&matches(task))return;
    cancel();
    if(!target){if(s.autoplayWaiting||s.autoplayRequested)usePlayer.setState({autoplayWaiting:false,autoplayRequested:false});if(!s.autoplayEnabled)useAutoplay.setState({status:'idle',seed:null,count:0,error:null,degraded:false});return;}
    const identity=`${s.autoplayRevision}:${owner??''}:${target.videoId}`;
    if(attempted===identity||s.loading&&!s.autoplayWaiting)return;
    timer=setTimeout(()=>{timer=undefined;void run(target);},s.autoplayWaiting?0:700);
  };
  const offPlayer=usePlayer.subscribe(update),offLibrary=useLibrary.subscribe(update),offRadio=useRadio.subscribe(update);update();
  return()=>{closed=true;offPlayer();offLibrary();offRadio();cancel();usePlayer.setState({autoplayWaiting:false});};
}
