import type {Track,QueueItem} from './index';
import {isExcluded,upcomingTracks,type ListeningExclusions,type ShufflePlan} from './listening';
import {radioEdition} from './radio';
import type {SleepTimer} from './sleep-timer';

export type AutoplaySeen={videoId:string;edition:string};
export type AutoplayOrigin=Pick<Track,'videoId'|'title'|'artist'>;
export function cleanAutoplaySeen(value:unknown):AutoplaySeen[]{
  return Array.isArray(value)?value.filter(item=>item&&typeof item.videoId==='string'&&/^[A-Za-z0-9_-]{11}$/.test(item.videoId)&&typeof item.edition==='string'&&item.edition.length<=6000).slice(-200):[];
}
export function autoplaySuggestions(candidates:Track[],existing:Track[],recent:Track[],seen:AutoplaySeen[],exclusions:ListeningExclusions,limit=10):Track[]{
  if(limit<=0)return [];
  const videos=new Set([...existing,...recent].map(t=>t.videoId)),editions=new Set([...existing,...recent].map(radioEdition));
  for(const item of seen){videos.add(item.videoId);editions.add(item.edition);}
  const result:Track[]=[];
  for(const track of candidates){const edition=radioEdition(track);if(videos.has(track.videoId)||editions.has(edition)||isExcluded(track,exclusions))continue;videos.add(track.videoId);editions.add(edition);result.push(track);if(result.length>=limit)break;}
  return result;
}
export type AutoplayQueue={queue:QueueItem[];index:number;shuffle:boolean;shufflePlan:ShufflePlan;exclusions:ListeningExclusions;priorityIds:string[];repeat:string;sleepTimer:SleepTimer|null;playing:boolean;loading:boolean;error:string|null;autoplayEnabled:boolean;autoplayWaiting:boolean;autoplayRequested:boolean;autoplayStopped:boolean};
export function autoplayTarget(s:AutoplayQueue):QueueItem|undefined{
  const current=s.queue[s.index];
  if(!s.autoplayEnabled||s.autoplayStopped||!current||(!s.playing&&!s.autoplayWaiting&&!s.autoplayRequested)||s.error||s.repeat!=='off'||s.sleepTimer||s.queue.length>=1000)return;
  const upcoming=upcomingTracks(s.queue,s.index,s.shuffle,s.shufflePlan,s.exclusions,s.priorityIds);
  if(upcoming.length>2)return;
  const seed=upcoming.at(-1)??current;return isExcluded(seed,s.exclusions)?undefined:seed;
}
