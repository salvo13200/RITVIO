import type {Track,QueueItem,MusicResource} from './index';

export type ExcludedTrack = Pick<Track,'videoId'|'title'|'artist'>;
export type ExcludedArtist = MusicResource & {match:'id'|'name'};
export type ListeningExclusions = {tracks:ExcludedTrack[];artists:ExcludedArtist[]};
export type ShufflePlan = {ids:string[];cursor:number;visited?:number;cycleStart?:number;consumed?:string[]};
export const emptyPlan = ():ShufflePlan=>({ids:[],cursor:-1,visited:-1,cycleStart:0,consumed:[]});
export const normalizeArtist = (name:string)=>name.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('it-IT');
export function artistChoices(track:Track):ExcludedArtist[]{
  const artists=Array.isArray(track.artists)?track.artists.filter(a=>a&&typeof a.id==='string'&&typeof a.name==='string'&&a.id&&a.name):[];
  const label=typeof track.artist==='string'?track.artist:'';
  return artists.length?[...new Map(artists.map(a=>[a.id,{...a,match:'id' as const}])).values()]:label.trim()&&label.length<=500?[{id:normalizeArtist(label),name:label,match:'name'}]:[];
}
export function isExcluded(track:Track,exclusions:ListeningExclusions):boolean{
  if(exclusions.tracks.some(item=>item.videoId===track.videoId))return true;
  const artists=artistChoices(track);
  return exclusions.artists.some(rule=>artists.some(artist=>rule.match==='id'&&artist.match==='id'?rule.id===artist.id:normalizeArtist(rule.name)===normalizeArtist(artist.name)));
}
export function makeShufflePlan(ids:string[],current:string|undefined,random=Math.random):ShufflePlan{
  const rest=ids.filter(id=>id!==current);
  for(let i=rest.length-1;i>0;i--){const j=Math.floor(Math.max(0,Math.min(.999999999,random()))*(i+1));[rest[i],rest[j]]=[rest[j],rest[i]];}
  return current&&ids.includes(current)?{ids:[current,...rest],cursor:0,visited:0,cycleStart:0,consumed:[current]}:{ids:rest,cursor:-1,visited:-1,cycleStart:0,consumed:[]};
}
// Keep the actual listening path, including intentional manual replays. Queue IDs,
// rather than video IDs, distinguish duplicates deliberately added to a playlist.
export function reconcileShuffle(plan:ShufflePlan,queue:QueueItem[],eligible:QueueItem[],random=Math.random):ShufflePlan{
  const live=new Set(queue.map(t=>t.queueId)),allowed=new Set(eligible.map(t=>t.queueId));
  const visited=Math.max(plan.cursor,plan.visited??plan.cursor);
  const fullHistory=plan.ids.slice(0,visited+1).filter(id=>live.has(id));
  const trim=Math.max(0,fullHistory.length-1000),history=fullHistory.slice(trim);
  const cursor=Math.max(-1,plan.ids.slice(0,plan.cursor+1).filter(id=>live.has(id)).length-1-trim);
  const cycleStart=Math.max(0,plan.ids.slice(0,plan.cycleStart??0).filter(id=>live.has(id)).length-trim);
  const consumed=[...new Set([...(plan.consumed??[]),...history.slice(cycleStart)])].filter(id=>live.has(id));
  const seen=new Set(consumed);
  const future=plan.ids.slice(visited+1).filter(id=>{if(!allowed.has(id)||seen.has(id))return false;seen.add(id);return true;});
  const additions=makeShufflePlan(eligible.map(t=>t.queueId).filter(id=>!seen.has(id)),undefined,random).ids;
  return {ids:[...history,...future,...additions],cursor,visited:history.length-1,cycleStart,consumed};
}
export function visitShuffle(plan:ShufflePlan,id:string):ShufflePlan{
  if(plan.ids[plan.cursor]===id)return plan;
  const fullHistory=[...plan.ids.slice(0,plan.cursor+1),id],trim=Math.max(0,fullHistory.length-1000),history=fullHistory.slice(trim);
  return {ids:[...history,...plan.ids.slice((plan.visited??plan.cursor)+1).filter(item=>item!==id)],cursor:history.length-1,visited:history.length-1,cycleStart:Math.max(0,Math.min(plan.cycleStart??0,fullHistory.length-1)-trim),consumed:[...new Set([...(plan.consumed??plan.ids.slice(plan.cycleStart??0,(plan.visited??plan.cursor)+1)),id])]};
}
export function restartShuffle(plan:ShufflePlan,eligible:string[],current:string|undefined):ShufflePlan{
  const cycle=makeShufflePlan(eligible,current);
  const history=plan.ids.slice(0,plan.cursor+1).slice(-1000);
  if(!history.length||history.at(-1)!==current)return cycle;
  return {ids:[...history,...cycle.ids.filter(id=>id!==current)],cursor:history.length-1,visited:history.length-1,cycleStart:history.length-1,consumed:current?[current]:[]};
}
export function upcomingTracks(queue:QueueItem[],index:number,shuffle:boolean,plan:ShufflePlan,exclusions:ListeningExclusions,priorityIds:string[]=[]):QueueItem[]{
  const eligible=queue.filter(track=>!isExcluded(track,exclusions));
  const byId=new Map(eligible.map(track=>[track.queueId,track]));
  const first=[...new Set(priorityIds)].filter(id=>id!==queue[index]?.queueId&&byId.has(id));
  const rest=shuffle?plan.ids.slice(plan.cursor+1):eligible.filter(track=>queue.indexOf(track)>index).map(t=>t.queueId);
  return [...new Set([...first,...rest])].flatMap(id=>byId.has(id)?[byId.get(id)!]:[]);
}
export function cleanExclusions(value:unknown):ListeningExclusions{
  const saved=(value&&typeof value==='object'?value:{}) as Partial<ListeningExclusions>;
  const tracks=Array.isArray(saved.tracks)?saved.tracks.filter(t=>t&&typeof t.videoId==='string'&&/^[A-Za-z0-9_-]{11}$/.test(t.videoId)&&typeof t.title==='string'&&typeof t.artist==='string').slice(0,5000).map(t=>({videoId:t.videoId,title:t.title.slice(0,500),artist:t.artist.slice(0,500)})):[];
  const artists=Array.isArray(saved.artists)?saved.artists.filter(a=>a&&typeof a.id==='string'&&a.id.length>0&&a.id.length<=(a.match==='name'?500:200)&&typeof a.name==='string'&&a.name.trim()&&(a.match!=='name'||a.name.length<=500)&&['id','name'].includes(a.match)).slice(0,5000).map(a=>({id:a.match==='name'?normalizeArtist(a.name):a.id,name:a.name.slice(0,500),match:a.match})):[];
  return {tracks:[...new Map(tracks.map(t=>[t.videoId,t])).values()],artists:[...new Map(artists.map(a=>[`${a.match}:${a.id}`,a])).values()]};
}
