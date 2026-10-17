import {create} from 'zustand';
import {api,ApiError} from './api';
import {usePlayer} from './store';
import {useLibrary} from './library';
import {ListeningClock,type ActivityCheckpoint,type ActivityReason,type ActivitySettings,type ActivitySnapshot} from '../../../packages/domain/activity';
import type {Track} from '../../../packages/domain/index';
import {t} from './i18n';
type State={data:ActivitySnapshot|null;ready:boolean;loading:boolean;busy:boolean;error:string|null;load:()=>Promise<void>};
let loadId=0;
export const useActivity=create<State>((set)=>({data:null,ready:false,loading:false,busy:false,error:null,
  async load(){const id=++loadId;set({loading:true,error:null});try{const data=await api.activity.get();if(id===loadId)set({data,ready:true});}catch(e){if(id===loadId)set({error:e instanceof Error?e.message:t('activity.failed')});}finally{if(id===loadId)set({loading:false});}},
}));
let session:{track:Track;key:string;clock:ListeningClock;checkpoint:ActivityCheckpoint}|null=null;
let media:HTMLAudioElement|null=null,flushing=false,initialized=false,initializing:Promise<void>|null=null,privacyChanging=false,closing=false;
let matchesCurrent=()=>true;
const syncedHistory=new Set<string>();
export const recordRecentAllowed=()=>initialized&&!privacyChanging&&useActivity.getState().ready&&!useActivity.getState().data?.settings.privateMode;
const key=()=>{const state=usePlayer.getState();return state.queue[state.index]?`${state.queue[state.index].queueId}:${state.activation}`:'';};
function remember(){if(!session)return;session.checkpoint={...session.checkpoint,sequence:session.checkpoint.sequence+1,updatedAt:Date.now(),listenedMs:Math.round(session.clock.listenedMs),seeks:session.clock.seeks,durationMs:Math.min(86400000,Math.round((Number.isFinite(media?.duration)?media!.duration:usePlayer.getState().duration)*1000))};
  const item={track:session.track,checkpoint:session.checkpoint};usePlayer.setState(state=>({activityJournal:[...state.activityJournal.filter(entry=>entry.checkpoint.id!==item.checkpoint.id),item].slice(-50)}));
}
function sample(force=false){
  if(!media||!initialized||privacyChanging||!useActivity.getState().ready||useActivity.getState().data?.settings.privateMode)return;
  const state=usePlayer.getState(),track=state.queue[state.index];
  const active=force||(!media.paused&&!media.ended&&!media.seeking&&media.readyState>=3&&state.playing&&!state.loading&&matchesCurrent());
  if(!session&&!force&&active&&track){const startedAt=Date.now();session={track,key:key(),clock:new ListeningClock(),checkpoint:{id:crypto.randomUUID(),mediaId:track.id,epoch:useActivity.getState().data!.settings.epoch,sequence:0,startedAt,updatedAt:startedAt,listenedMs:0,durationMs:0,seeks:0,closed:false,reason:null}};remember();}
  if(session)session.clock.sample(performance.now(),media.currentTime,active,media.playbackRate);
}
function close(reason:ActivityReason){if(!session||closing)return;closing=true;try{sample(true);session.checkpoint={...session.checkpoint,closed:true,reason};remember();session=null;}finally{closing=false;}void flushActivity();}
export async function flushActivity(){
  if(flushing||!initialized||privacyChanging)return;
  flushing=true;
  try{
    for(const item of [...usePlayer.getState().activityJournal]){
      const latest=usePlayer.getState().activityJournal.find(entry=>entry.checkpoint.id===item.checkpoint.id);if(!latest)continue;
      await api.restore(latest.track);
      let result:{accepted:boolean;epoch:number};
      try{result=await api.activity.checkpoint(latest.checkpoint);}catch(e){
        if(e instanceof ApiError&&['INVALID_REQUEST','INVALID_LISTENING','LISTENING_CONFLICT'].includes(e.code)){usePlayer.setState(s=>({activityJournal:s.activityJournal.filter(entry=>entry.checkpoint.id!==latest.checkpoint.id)}));if(session?.checkpoint.id===latest.checkpoint.id)session=null;useActivity.setState({error:e.message});continue;}
        throw e;
      }
      if(!result.accepted){
        await useActivity.getState().load();session=null;const epoch=useActivity.getState().data?.settings.epoch;usePlayer.setState(s=>({activityJournal:s.activityJournal.filter(entry=>entry.checkpoint.epoch===epoch)}));continue;
      }
      if(latest.checkpoint.closed)usePlayer.setState(s=>({activityJournal:s.activityJournal.filter(entry=>entry.checkpoint.id!==latest.checkpoint.id||entry.checkpoint.sequence>latest.checkpoint.sequence)}));
      if(latest.checkpoint.listenedMs>0&&!syncedHistory.has(latest.checkpoint.id)){syncedHistory.add(latest.checkpoint.id);if(syncedHistory.size>1000)syncedHistory.delete(syncedHistory.values().next().value!);await useLibrary.getState().load();}
    }
    useActivity.setState({error:null});
  }catch(e){
    useActivity.setState({error:e instanceof Error?e.message:t('activity.failed')});
  }finally{flushing=false;}
}
async function initialize(){
  if(initialized)return;
  initializing??=(async()=>{
    if(!usePlayer.persist.hasHydrated())await new Promise<void>(resolve=>{const unsub=usePlayer.persist.onFinishHydration(()=>{unsub();resolve();});});
    await useActivity.getState().load();
    if(!useActivity.getState().ready){initializing=null;return;}
    const settings=useActivity.getState().data!.settings;
    usePlayer.setState(s=>({activityJournal:settings.privateMode?[]:s.activityJournal.filter(item=>item.checkpoint.epoch===settings.epoch).map(item=>item.checkpoint.closed?item:{...item,checkpoint:{...item.checkpoint,sequence:item.checkpoint.sequence+1,closed:true,reason:'interrupted'}})}));
    initialized=true;await flushActivity();await useLibrary.getState().load();
  })();await initializing;
}
export function attachActivity(audio:HTMLAudioElement,matches=()=>true){
  media=audio;matchesCurrent=matches;void initialize();
  const onPlaying=()=>{sample();if(session){session.clock.discontinuity();sample();}};
  const onTime=()=>sample();
  const onPause=()=>{sample(true);session?.clock.discontinuity();remember();void flushActivity();};
  const onWaiting=()=>{sample(true);session?.clock.discontinuity();};
  const onSeeking=()=>session?.clock.seek();
  const onSeeked=()=>sample();
  const onEnded=()=>close('completed');
  const events={playing:onPlaying,timeupdate:onTime,pause:onPause,waiting:onWaiting,stalled:onWaiting,seeking:onSeeking,seeked:onSeeked,ended:onEnded};
  for(const [event,handler] of Object.entries(events))audio.addEventListener(event,handler);
  const unsubscribe=usePlayer.subscribe((state,previous)=>{
    if(closing)return;
    if(session&&key()!==session.key){const current=state.queue[state.index];close(current?.id===session.track.id?'replay':state.activityReason);}
    else if(session&&previous.playing&&!state.playing){if(state.error)close('error');else onPause();}
    else if(!session&&state.error&&state.error!==previous.error&&previous.playing&&initialized&&!privacyChanging&&!useActivity.getState().data?.settings.privateMode){
      const track=state.queue[state.index];if(track){const startedAt=Date.now();session={track,key:key(),clock:new ListeningClock(),checkpoint:{id:crypto.randomUUID(),mediaId:track.id,epoch:useActivity.getState().data!.settings.epoch,sequence:0,startedAt,updatedAt:startedAt,listenedMs:0,durationMs:0,seeks:0,closed:true,reason:'error'}};remember();session=null;void flushActivity();}
    }
  });
  let ticks=0;const timer=window.setInterval(()=>{if(!initialized){void initialize();return;}sample();if(++ticks%5===0){remember();void flushActivity();}},1000);
  const onHide=()=>{close('interrupted');void flushActivity();};window.addEventListener('pagehide',onHide);
  return()=>{unsubscribe();clearInterval(timer);window.removeEventListener('pagehide',onHide);for(const [event,handler] of Object.entries(events))audio.removeEventListener(event,handler);close('interrupted');media=null;};
}
export async function updateActivitySettings(privateMode:boolean,retentionDays:ActivitySettings['retentionDays']){
  if(useActivity.getState().busy)return false;
  privacyChanging=true;useActivity.setState({busy:true,error:null});
  try{const settings=await api.activity.settings({privateMode,retentionDays});
    if(settings.epoch!==useActivity.getState().data?.settings.epoch){session=null;usePlayer.setState({activityJournal:[],...(privateMode?{recent:[]}: {})});}
    useActivity.setState(state=>({data:state.data?{...state.data,settings}:null}));
    await useActivity.getState().load();await useLibrary.getState().load();return true;
  }catch(e){useActivity.setState({error:e instanceof Error?e.message:t('activity.failed')});return false;}
  finally{privacyChanging=false;useActivity.setState({busy:false});session?.clock.discontinuity();}
}
export async function clearActivity(){
  if(useActivity.getState().busy)return false;
  privacyChanging=true;useActivity.setState({busy:true,error:null});
  try{const settings=await api.activity.clear();session=null;usePlayer.setState({activityJournal:[],recent:[]});useActivity.setState(state=>({data:state.data?{...state.data,settings,items:[],legacyStarts:0,summary:{sessions:0,listenedMs:0,completed:0,skips:0,replays:0,errors:0,interrupted:0,excluded:0}}:null}));await useActivity.getState().load();await useLibrary.getState().load();return true;}
  catch(e){useActivity.setState({error:e instanceof Error?e.message:t('activity.failed')});return false;}
  finally{privacyChanging=false;useActivity.setState({busy:false});}
}
export async function excludeActivity(id:string,excluded:boolean){useActivity.setState({busy:true,error:null});try{await api.activity.exclude(id,excluded);await useActivity.getState().load();}catch(e){useActivity.setState({error:e instanceof Error?e.message:t('activity.failed')});}finally{useActivity.setState({busy:false});}}
