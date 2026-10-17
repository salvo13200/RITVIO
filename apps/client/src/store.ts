import {create} from 'zustand';
import {persist,createJSONStorage} from 'zustand/middleware';
import {reorder,type Track,type QueueItem,type RepeatMode} from '../../../packages/domain/index';
import {emptyPlan,makeShufflePlan,reconcileShuffle,visitShuffle,restartShuffle,isExcluded,cleanExclusions,upcomingTracks,type ShufflePlan,type ListeningExclusions,type ExcludedArtist} from '../../../packages/domain/listening';
import {t} from './i18n';
import {cleanUILayout,defaultUILayout,type UILayoutPreferences} from '../../../packages/domain/ui-layout';
import {cleanAudio,defaultAudio,type AudioPreferences} from '../../../packages/domain/audio';
import {durationTimer,cleanSleepTimer,timerDecision,type SleepTimer} from '../../../packages/domain/sleep-timer';
import type {ActivityJournalItem} from '../../../packages/domain/activity';
import {radioSuggestions,type RadioSession} from '../../../packages/domain/radio';
import {radioEdition} from '../../../packages/domain/radio';
import {autoplaySuggestions,cleanAutoplaySeen,type AutoplaySeen} from '../../../packages/domain/autoplay';
type PlayerState = {
  autoplayEnabled:boolean;autoplayWaiting:boolean;autoplayRequested:boolean;autoplayStopped:boolean;autoplayRevision:number;autoplaySeen:AutoplaySeen[];
  setAutoplay:(enabled:boolean)=>void;interruptAutoplay:()=>void;
  appendAutoplay:(seed:Track,candidates:Track[],revision:number)=>number;
  radioSession:RadioSession|null;startRadio:(seed:Track,candidates:Track[],fetchedAt:string,degraded:boolean)=>boolean;leaveRadio:()=>void;
  uiLayout:UILayoutPreferences;setUILayout:(preferences:Partial<UILayoutPreferences>)=>void;
  sleepTimer:SleepTimer|null;sleepNotice:string;armSleep:(minutes:number|'track')=>void;cancelSleep:()=>void;tickSleep:(now?:number)=>boolean;
  priorityIds:string[];playNext:(track:Track)=>boolean;prioritize:(queueId:string)=>void;removeMany:(ids:string[])=>void;clearUpcoming:()=>void;
  activityJournal:ActivityJournalItem[];
  activityReason:'skip'|'change';
  audioPreferences:AudioPreferences;setAudioPreferences:(preferences:Partial<AudioPreferences>)=>void;
  searchHistory:string[];rememberSearch:(query:string)=>void;clearSearchHistory:()=>void;
  queue:QueueItem[];index:number;recent:Track[];position:number;duration:number;
  playing:boolean;loading:boolean;volume:number;muted:boolean;shuffle:boolean;repeat:RepeatMode;
  error:string|null;activation:number;theme:'dark'|'light';
  shufflePlan:ShufflePlan;exclusions:ListeningExclusions;
  setShuffle:(enabled:boolean)=>void;excludeTrack:(track:Track)=>void;excludeArtist:(artist:ExcludedArtist)=>void;
  restoreTrack:(videoId:string)=>void;restoreArtist:(id:string,match:'id'|'name')=>void;
  play:(track:Track,context?:Track[])=>void;enqueue:(track:Track)=>void;enqueueMany:(tracks:Track[])=>boolean;select:(index:number)=>void;
  toggle:()=>void;next:(automatic?:boolean)=>void;previous:()=>void;
  remove:(queueId:string)=>void;move:(from:number,to:number)=>void;heard:(track:Track)=>void;
};
const entry=(track:Track):QueueItem=>({...track,queueId:crypto.randomUUID(),source:'collection'});
const cleanSearch=(query:string)=>query.normalize('NFC').trim().replace(/\s+/g,' ').slice(0,200);
const validSearchHistory=(value:unknown):string[]=>Array.isArray(value)?[...new Map(value.filter((q):q is string=>typeof q==='string').map(cleanSearch).filter(q=>q.length>=3).map(q=>[q.toLocaleLowerCase('it-IT'),q])).values()].slice(0,8):[];
const eligible=(s:PlayerState)=>s.queue.filter(track=>!isExcluded(track,s.exclusions));
const planFor=(s:PlayerState)=>s.shuffle?reconcileShuffle(s.shufflePlan,s.queue,eligible(s)):emptyPlan();
const activate=(s:PlayerState,index:number,shufflePlan=s.shufflePlan):Partial<PlayerState>=>({index,shufflePlan,priorityIds:s.priorityIds.filter(id=>id!==s.queue[index]?.queueId&&s.queue.some(t=>t.queueId===id)),position:0,duration:s.queue[index]?.duration||0,playing:index>=0,sleepNotice:'',error:null,activation:s.activation+1,activityReason:'change'});
function advance(s:PlayerState,automatic=false):Partial<PlayerState>{
  const allowed=eligible(s),plan=planFor(s),current=s.queue[s.index];
  if(!allowed.length)return {...activate(s,-1,plan),loading:false};
  if(automatic&&s.repeat==='track'&&current&&!isExcluded(current,s.exclusions))return activate(s,s.index,plan);
  const priority=s.priorityIds.map(id=>allowed.find(t=>t.queueId===id)).find(t=>t&&t.queueId!==current?.queueId);
  if(priority)return activate(s,s.queue.indexOf(priority),s.shuffle?visitShuffle(plan,priority.queueId):plan);
  if(s.shuffle){
    let nextPlan=plan;
    const allowedIds=new Set(allowed.map(track=>track.queueId));
    let nextCursor=nextPlan.ids.findIndex((id,i)=>i>nextPlan.cursor&&allowedIds.has(id));
    if(nextCursor<0&&s.repeat!=='off'){
      nextPlan=restartShuffle(plan,allowed.map(track=>track.queueId),current?.queueId);
      if(allowed.length===1)return activate(s,s.queue.indexOf(allowed[0]),visitShuffle(nextPlan,allowed[0].queueId));
      nextCursor=nextPlan.ids.findIndex((id,i)=>i>nextPlan.cursor&&allowedIds.has(id));
    }
    const id=nextCursor>=0?nextPlan.ids[nextCursor]:undefined;
    if(id)return activate(s,s.queue.findIndex(track=>track.queueId===id),{...nextPlan,cursor:nextCursor,visited:Math.max(nextPlan.visited??nextPlan.cursor,nextCursor),consumed:[...new Set([...(nextPlan.consumed??[]),id])]});
  }else{
    const next=allowed.find(track=>s.queue.indexOf(track)>s.index)??(s.repeat!=='off'?allowed[0]:undefined);
    if(next)return activate(s,s.queue.indexOf(next));
  }
  return {playing:false,loading:false,position:s.duration,shufflePlan:plan};
}
/** Predict only an already-determined next item; never draw a new random cycle. */
export function nextPreparedTrack(s:PlayerState):QueueItem|undefined{
  const current=s.queue[s.index];
  if(!current||!s.playing||s.loading||s.sleepTimer?.kind==='track'||s.sleepTimer?.kind==='duration'&&s.sleepTimer.deadline<=Date.now())return;
  if(s.repeat==='track'&&!isExcluded(current,s.exclusions))return current;
  return upcomingTracks(s.queue,s.index,s.shuffle,s.shufflePlan,s.exclusions,s.priorityIds)[0]??(!s.shuffle&&s.repeat==='playlist'?eligible(s)[0]:undefined);
}
function updateExclusions(s:PlayerState,exclusions:ListeningExclusions):Partial<PlayerState>{
  const updated={...s,exclusions};const plan=planFor(updated),current=s.queue[s.index];
  if(current&&isExcluded(current,exclusions)){const next=advance({...updated,shufflePlan:plan});return {exclusions,...(next.index===undefined?{...activate(updated,-1,plan),loading:false}:next),playing:s.playing&&next.playing===true};}
  if(s.index<0){const first=eligible(updated)[0];if(first){const index=s.queue.indexOf(first);return {exclusions,...activate(updated,index,s.shuffle?makeShufflePlan(eligible(updated).map(t=>t.queueId),first.queueId):emptyPlan()),playing:false};}}
  return {exclusions,shufflePlan:plan};
}
export const usePlayer=create<PlayerState>()(persist((set,get)=>({
  autoplayEnabled:false,autoplayWaiting:false,autoplayRequested:false,autoplayStopped:false,autoplayRevision:0,autoplaySeen:[],
  interruptAutoplay(){set(s=>({autoplayRevision:s.autoplayRevision+1,autoplayWaiting:false,autoplayRequested:false,autoplayStopped:false}));},
  setAutoplay(autoplayEnabled){get().interruptAutoplay();set({autoplayEnabled});},
  appendAutoplay(seed,candidates,revision){
    const s=get();if(!s.autoplayEnabled||s.autoplayRevision!==revision||s.repeat!=='off'||s.sleepTimer||s.error)return 0;
    const tracks=autoplaySuggestions(candidates,s.queue,s.recent,s.autoplaySeen,s.exclusions,Math.min(10,1000-s.queue.length));if(!tracks.length)return 0;
    const suggestedFrom={videoId:seed.videoId,title:seed.title,artist:seed.artist};
    const queue=[...s.queue,...tracks.map(track=>({...entry(track),source:'autoplay' as const,suggestedFrom}))],updated={...s,queue};
    set({queue,shufflePlan:planFor(updated),autoplaySeen:[...s.autoplaySeen,...tracks.map(track=>({videoId:track.videoId,edition:radioEdition(track)}))].slice(-200),autoplayStopped:false,autoplayWaiting:false,autoplayRequested:false,
      ...(s.autoplayWaiting?advance(updated,true):{})});
    return tracks.length;
  },
  radioSession:null,
  leaveRadio(){set({radioSession:null});},
  startRadio(seed,candidates,fetchedAt,degraded){
    get().interruptAutoplay();
    const s=get();if(isExcluded(seed,s.exclusions))return false;
    const suggestions=radioSuggestions(seed,candidates,s.exclusions);if(!suggestions.length)return false;
    const current=s.queue[s.index],keep=current?.videoId===seed.videoId;
    const queue:QueueItem[]=[keep?current:{...entry(seed),source:'radio'},...suggestions.map(track=>({...entry(track),source:'radio' as const}))];
    const updated={...s,queue,index:0,shuffle:false,repeat:'off' as const,priorityIds:[]};
    set({queue,index:0,shuffle:false,repeat:'off',priorityIds:[],shufflePlan:emptyPlan(),radioSession:{seed,queueIds:queue.map(t=>t.queueId),createdAt:Date.now(),fetchedAt,degraded},
      ...(!keep?activate(updated,0,emptyPlan()):{}),error:null});
    get().tickSleep();return true;
  },
  sleepTimer:null,sleepNotice:'',priorityIds:[],
  armSleep(minutes){get().interruptAutoplay();const s=get(),current=s.queue[s.index];if(minutes==='track'&&!current)return;set({sleepTimer:minutes==='track'?{kind:'track',queueId:current.queueId,activation:s.activation}:durationTimer(minutes),sleepNotice:''});},
  cancelSleep(){get().interruptAutoplay();set({sleepTimer:null,sleepNotice:t('sleep.cancelled')});},
  tickSleep(now=Date.now()){const s=get(),decision=timerDecision(s.sleepTimer,s.queue[s.index]?.queueId,s.activation,now);if(decision==='expire'){set({sleepTimer:null,playing:false,loading:false,sleepNotice:t('sleep.expired')});return true;}if(decision==='changed')set({sleepTimer:null,sleepNotice:t('sleep.changed')});return false;},
  playNext(track){get().interruptAutoplay();const s=get();if(isExcluded(track,s.exclusions)){set({error:t('queueTools.blocked')});return false;}if(s.queue.length>=1000){set({error:t('listening.queueLimit')});return false;}const item={...entry(track),source:'manual' as const},queue=[...s.queue];queue.splice(Math.max(0,s.index+1),0,item);const updated={...s,queue};set({queue,index:s.index<0?0:s.index,priorityIds:[item.queueId,...s.priorityIds],shufflePlan:planFor(updated),...(s.index<0?{duration:item.duration,position:0}:{}),error:null});return true;},
  prioritize(queueId){get().interruptAutoplay();const s=get(),item=s.queue.find(t=>t.queueId===queueId);if(!item||queueId===s.queue[s.index]?.queueId||isExcluded(item,s.exclusions))return;const current=s.queue[s.index]?.queueId,queue=s.queue.filter(t=>t.queueId!==queueId);const index=queue.findIndex(t=>t.queueId===current);queue.splice(index+1,0,{...item,source:'manual'});set({queue,index,priorityIds:[queueId,...s.priorityIds.filter(id=>id!==queueId)],shufflePlan:planFor({...s,queue,index})});},
  removeMany(ids){get().interruptAutoplay();const s=get(),removed=new Set(ids),current=s.queue[s.index]?.queueId;if(!s.queue.some(t=>removed.has(t.queueId)))return;const queue=s.queue.filter(t=>!removed.has(t.queueId)),updated={...s,queue,priorityIds:s.priorityIds.filter(id=>!removed.has(id))};let index=queue.findIndex(t=>t.queueId===current),shufflePlan=planFor(updated);if(current&&removed.has(current)){const next=upcomingTracks(s.queue,s.index,s.shuffle,s.shufflePlan,s.exclusions,s.priorityIds).find(t=>!removed.has(t.queueId))??eligible(updated)[0];index=next?queue.indexOf(next):-1;shufflePlan=s.shuffle&&next?visitShuffle(shufflePlan,next.queueId):shufflePlan;set({...activate(updated,index,shufflePlan),queue,playing:s.playing&&index>=0});}else set({queue,index,shufflePlan,priorityIds:updated.priorityIds});},
  clearUpcoming(){const s=get(),current=s.queue[s.index]?.queueId,consumed=new Set(s.shufflePlan.consumed??[]);const ids=s.queue.filter((t,i)=>t.queueId!==current&&(s.shuffle?!consumed.has(t.queueId):i>s.index)).map(t=>t.queueId);get().removeMany(ids);if(s.repeat==='playlist')set({repeat:'off'});get().setAutoplay(false);},
  activityJournal:[],activityReason:'change',
  uiLayout:defaultUILayout(),setUILayout(preferences){set({uiLayout:cleanUILayout({...get().uiLayout,...preferences})});},
  audioPreferences:defaultAudio(),setAudioPreferences(preferences){set({audioPreferences:cleanAudio({...get().audioPreferences,...preferences})});},
  searchHistory:[],rememberSearch(query){const cleaned=cleanSearch(query);if(cleaned.length>=3)set({searchHistory:[cleaned,...get().searchHistory.filter(q=>q.toLocaleLowerCase('it-IT')!==cleaned.toLocaleLowerCase('it-IT'))].slice(0,8)});},clearSearchHistory(){set({searchHistory:[]});},
  queue:[],index:-1,recent:[],position:0,duration:0,playing:false,loading:false,volume:.7,muted:false,shuffle:false,repeat:'off',error:null,activation:0,theme:'dark',shufflePlan:emptyPlan(),exclusions:{tracks:[],artists:[]},
  setShuffle(shuffle){get().interruptAutoplay();const s=get();set({shuffle,shufflePlan:shuffle?makeShufflePlan(eligible(s).map(t=>t.queueId),s.queue[s.index]?.queueId):emptyPlan()});},
  excludeTrack(track){get().interruptAutoplay();const s=get();const exclusions=cleanExclusions({...s.exclusions,tracks:[...s.exclusions.tracks,track]});set(updateExclusions(s,exclusions));},
  excludeArtist(artist){get().interruptAutoplay();const s=get();const exclusions=cleanExclusions({...s.exclusions,artists:[...s.exclusions.artists,artist]});set(updateExclusions(s,exclusions));},
  restoreTrack(videoId){get().interruptAutoplay();const s=get();set(updateExclusions(s,{...s.exclusions,tracks:s.exclusions.tracks.filter(t=>t.videoId!==videoId)}));},
  restoreArtist(id,match){get().interruptAutoplay();const s=get();set(updateExclusions(s,{...s.exclusions,artists:s.exclusions.artists.filter(a=>a.id!==id||a.match!==match)}));},
  play(track,context){get().interruptAutoplay();
    const s=get(),tracks=context?.some(t=>t.id===track.id)?context:[track],queue=tracks.slice(0,1000).map(entry);
    const chosen=queue.find(t=>t.id===track.id&&!isExcluded(t,s.exclusions))??queue.find(t=>!isExcluded(t,s.exclusions));
    if(!chosen)return set({error:t('listening.allExcluded')});
    const updated={...s,queue};set({...activate(updated,queue.indexOf(chosen),s.shuffle?makeShufflePlan(eligible(updated).map(t=>t.queueId),chosen.queueId):emptyPlan()),queue,radioSession:null});
  },
  enqueue(track){get().interruptAutoplay();const s=get();if(s.queue.length>=1000)return set({error:t('listening.queueLimit')});const updated={...s,queue:[...s.queue,{...entry(track),source:'manual' as const}]};const first=eligible(updated)[0];const starting=s.index<0&&first;set({queue:updated.queue,shufflePlan:starting&&s.shuffle?makeShufflePlan(eligible(updated).map(t=>t.queueId),first.queueId):planFor(updated),...(starting?{index:updated.queue.indexOf(first),duration:first.duration,position:0}: {})});},
  enqueueMany(tracks){get().interruptAutoplay();const s=get();if(!tracks.length)return false;if(s.queue.length+tracks.length>1000){set({error:t('listening.queueLimit')});return false;}const updated={...s,queue:[...s.queue,...tracks.map(track=>({...entry(track),source:'manual' as const}))]};const first=eligible(updated)[0],starting=s.index<0&&first;set({queue:updated.queue,shufflePlan:starting&&s.shuffle?makeShufflePlan(eligible(updated).map(t=>t.queueId),first.queueId):planFor(updated),...(starting?{index:updated.queue.indexOf(first),duration:first.duration,position:0}:{}),error:null});return true;},
  select(index){get().interruptAutoplay();const s=get(),track=s.queue[index];if(!track||isExcluded(track,s.exclusions))return;set(activate(s,index,s.shuffle?visitShuffle(planFor(s),track.queueId):emptyPlan()));},
  toggle(){get().interruptAutoplay();if(get().tickSleep())return;const s=get();if(s.index<0)return;const end=s.duration||s.queue[s.index].duration;const restart=!s.playing&&end>0&&s.position>=end;set({playing:!s.playing,...(!s.playing?{sleepNotice:''}:{}),error:null,...(restart?{position:0,activation:s.activation+1,shufflePlan:s.shuffle?makeShufflePlan(eligible(s).map(t=>t.queueId),s.queue[s.index].queueId):emptyPlan()}: {})});},
  next(automatic=false){if(!automatic)get().interruptAutoplay();if(get().tickSleep())return;const s=get();if(automatic&&s.sleepTimer?.kind==='track'&&s.sleepTimer.queueId===s.queue[s.index]?.queueId&&s.sleepTimer.activation===s.activation){set({sleepTimer:null,playing:false,loading:false,position:s.duration,sleepNotice:t('sleep.expired')});return;}const advanced=advance(s,automatic),waiting=advanced.playing===false&&s.autoplayEnabled&&!s.autoplayStopped&&!s.sleepTimer&&s.repeat==='off'&&s.queue.length<1000&&!!s.queue[s.index];set({...advanced,autoplayWaiting:waiting,activityReason:automatic?'change':'skip'});get().tickSleep();},
  previous(){get().interruptAutoplay();const s=get();if(s.position>3)return set({position:0,activation:s.activation+1});if(s.shuffle){const plan=planFor(s);for(let cursor=plan.cursor-1;cursor>=0;cursor--){const index=s.queue.findIndex(t=>t.queueId===plan.ids[cursor]&&!isExcluded(t,s.exclusions));if(index>=0)return set(activate(s,index,{...plan,cursor}));}if(s.index>=0)set(activate(s,s.index,plan));}else{const before=eligible(s).filter(t=>s.queue.indexOf(t)<s.index).at(-1);if(before)set(activate(s,s.queue.indexOf(before)));else if(s.index>=0)set(activate(s,s.index));}},
  remove(queueId){get().removeMany([queueId]);},
  move(from,to){get().interruptAutoplay();const s=get(),current=s.queue[s.index]?.queueId,queue=reorder(s.queue,from,to);set({queue,index:queue.findIndex(t=>t.queueId===current)});},
  heard(track){set({recent:[track,...get().recent.filter(t=>t.id!==track.id)].slice(0,12)});},
}),{
  name:'ritvio-player-v1',version:1,
  storage:createJSONStorage(()=>typeof window!=='undefined'&&window.ritvio?{getItem:()=>window.ritvio!.readPlayer(),setItem:(_key,value)=>window.ritvio!.writePlayer(value),removeItem:()=>window.ritvio!.removePlayer()}:localStorage),
  partialize:s=>({autoplayEnabled:s.autoplayEnabled,autoplaySeen:s.autoplaySeen,radioSession:s.radioSession,uiLayout:s.uiLayout,sleepTimer:s.sleepTimer,priorityIds:s.priorityIds,queue:s.queue,index:s.index,recent:s.recent,position:s.position,volume:s.volume,muted:s.muted,shuffle:s.shuffle,repeat:s.repeat,theme:s.theme,searchHistory:s.searchHistory,shufflePlan:s.shufflePlan,exclusions:s.exclusions,audioPreferences:s.audioPreferences,activityJournal:s.activityJournal}),
  merge:(saved,current)=>{
    const s=(saved??{}) as Partial<PlayerState>;const valid=(t:Track)=>t&&/^[A-Za-z0-9_-]{11}$/.test(t.videoId)&&typeof t.title==='string'&&typeof t.id==='string';
    const seen=new Set<string>();const queue=(Array.isArray(s.queue)?s.queue.filter(valid).slice(0,1000):[]).map(track=>{const queueId=typeof track.queueId==='string'&&track.queueId.length>0&&track.queueId.length<=128&&!seen.has(track.queueId)?track.queueId:crypto.randomUUID();seen.add(queueId);return {...track,queueId,suggestedFrom:track.suggestedFrom&&typeof track.suggestedFrom.videoId==='string'&&/^[A-Za-z0-9_-]{11}$/.test(track.suggestedFrom.videoId)&&typeof track.suggestedFrom.title==='string'&&typeof track.suggestedFrom.artist==='string'?{videoId:track.suggestedFrom.videoId,title:track.suggestedFrom.title.slice(0,300),artist:track.suggestedFrom.artist.slice(0,300)}:undefined,source:track.source==='autoplay'?'autoplay' as const:track.source==='radio'?'radio' as const:track.source==='manual'?'manual' as const:track.source==='collection'?'collection' as const:undefined};});
    const exclusions=cleanExclusions(s.exclusions);const wanted=queue.length?Math.max(0,Math.min(Math.trunc(Number(s.index)||0),queue.length-1)):-1;
    const index=queue[wanted]&&!isExcluded(queue[wanted],exclusions)?wanted:queue.findIndex(t=>!isExcluded(t,exclusions));const allowed=queue.filter(t=>!isExcluded(t,exclusions));
    const raw=s.shufflePlan;const validPlan=raw&&Array.isArray(raw.ids)&&raw.ids.length<=2000&&raw.ids.every(id=>typeof id==='string')&&Number.isInteger(raw.cursor)&&raw.cursor>=-1&&raw.cursor<raw.ids.length&&raw.ids[raw.cursor]===queue[index]?.queueId&&(raw.visited===undefined||(Number.isInteger(raw.visited)&&raw.visited>=raw.cursor&&raw.visited<raw.ids.length))&&(raw.cycleStart===undefined||(Number.isInteger(raw.cycleStart)&&raw.cycleStart>=0&&raw.cycleStart<Math.max(1,raw.ids.length)))&&(raw.consumed===undefined||(Array.isArray(raw.consumed)&&raw.consumed.length<=1000&&raw.consumed.every(id=>typeof id==="string")));
    const shufflePlan=s.shuffle?(validPlan?reconcileShuffle(raw,queue,allowed):makeShufflePlan(allowed.map(t=>t.queueId),queue[index]?.queueId)):emptyPlan();
    const activityJournal=Array.isArray(s.activityJournal)?s.activityJournal.filter(item=>item&&valid(item.track)&&item.checkpoint&&/^[a-f0-9-]{36}$/i.test(item.checkpoint.id)&&item.checkpoint.mediaId===item.track.id&&Number.isSafeInteger(item.checkpoint.sequence)&&Number.isSafeInteger(item.checkpoint.epoch)&&Number.isFinite(item.checkpoint.listenedMs)&&item.checkpoint.listenedMs>=0&&item.checkpoint.listenedMs<=86400000&&Number.isFinite(item.checkpoint.startedAt)&&Number.isFinite(item.checkpoint.updatedAt)&&Number.isFinite(item.checkpoint.seeks)).slice(-50):[];
    const timer=cleanSleepTimer(s.sleepTimer);const sleepTimer=timer?.kind==='track'?(timer.queueId===queue[index]?.queueId?{...timer,activation:0}:null):timer;
    const priorityIds=Array.isArray(s.priorityIds)?[...new Set(s.priorityIds.filter(id=>typeof id==='string'&&id!==queue[index]?.queueId&&queue.some(t=>t.queueId===id)))].slice(0,1000):[];
    const rawRadio=s.radioSession;
    const radioSession=rawRadio&&valid(rawRadio.seed)&&Array.isArray(rawRadio.queueIds)&&rawRadio.queueIds.length<=1000&&Number.isFinite(rawRadio.createdAt)&&typeof rawRadio.fetchedAt==='string'&&!Number.isNaN(Date.parse(rawRadio.fetchedAt))?{seed:rawRadio.seed,queueIds:rawRadio.queueIds.filter(id=>typeof id==='string'&&queue.some(t=>t.queueId===id)),createdAt:rawRadio.createdAt,fetchedAt:rawRadio.fetchedAt,degraded:!!rawRadio.degraded}:null;
    return {...current,autoplayEnabled:s.autoplayEnabled===true,autoplaySeen:cleanAutoplaySeen(s.autoplaySeen),autoplayWaiting:false,autoplayRequested:false,autoplayStopped:false,autoplayRevision:0,radioSession:radioSession?.queueIds.length?radioSession:null,uiLayout:cleanUILayout(s.uiLayout),sleepTimer,priorityIds,activityJournal,audioPreferences:cleanAudio(s.audioPreferences),queue,index,exclusions,shufflePlan,searchHistory:validSearchHistory(s.searchHistory),recent:Array.isArray(s.recent)?s.recent.filter(valid).slice(0,12):[],position:index===wanted?Math.max(0,Number(s.position)||0):0,duration:queue[index]?.duration||0,
      volume:Math.max(0,Math.min(1,Number.isFinite(s.volume)?s.volume!:.7)),muted:!!s.muted,shuffle:!!s.shuffle,repeat:['off','playlist','track'].includes(s.repeat!)?s.repeat!:'off',theme:s.theme==='light'?'light':'dark'};
  },
}));
