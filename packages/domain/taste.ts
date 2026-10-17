import type {Track} from './index';
import type {ActivityEntry} from './activity';
import {artistChoices,normalizeArtist,isExcluded,type ListeningExclusions} from './listening';
export type TasteSettings={days:30|90|180;genreLevel:'artist'|'track';discoveryPercent:25|50|75;allowRecent:boolean;variety:boolean;resetAt:number};
export type TasteFeedback=-1|0|1;
export type TasteCandidate={track:Track;discovered:boolean;query?:string};
export type TasteInput={entries:ActivityEntry[];likes:Set<string>;saved:Set<string>;genres:Record<string,string[]>;feedback:Record<string,TasteFeedback>;settings:TasteSettings;now:number};
export type TasteProfile={sessions:number;listenedMs:number;personalized:boolean;artists:{id:string;name:string;match:'id'|'name';score:number}[];genres:{name:string;score:number}[];unclassifiedPercent:number;trackScores:Record<string,number>};
export type MixKind='familiar'|'discovery'|'genre';
export type MixRequest={kind:MixKind;genre?:string;refresh?:boolean;exclusions:ListeningExclusions};
export type MixItem={track:Track;reason:'liked'|'saved'|'listened'|'artist'|'genre'|'feedback'|'discovery';detail:string|null;feedback:TasteFeedback;fresh:boolean};
export type TasteMix={kind:MixKind;genre:string|null;day:string;items:MixItem[];requested:20;discoveryCount:number;generatedAt:number;cached:boolean};
export type TasteSnapshot={settings:TasteSettings;profile:TasteProfile;candidateCount:number;discoveredAt:number|null;privateMode:boolean;feedback:{track:Track;value:TasteFeedback}[]};
export const defaultTasteSettings:TasteSettings={days:30,genreLevel:'artist',discoveryPercent:50,allowRecent:false,variety:true,resetAt:0};
const day=86400000;
export function trackGenres(track:Track,genres:Record<string,string[]>,level:TasteSettings['genreLevel']):string[]{
  return level==='track'?genres[`track:${track.id}`]??[]:[...new Set(artistChoices(track).flatMap(a=>a.match==='id'?genres[`artist:${a.id}`]??[]:[]))];
}
export function tasteProfile(input:TasteInput):TasteProfile{
  const {settings,now,genres}=input;const scores=new Map<string,number>(),artists=new Map<string,{id:string;name:string;match:'id'|'name';score:number}>(),genreScores=new Map<string,number>();
  let sessions=0,listenedMs=0,total=0,unknown=0;
  for(const entry of input.entries){
    if(entry.excluded||entry.startedAt<Math.max(settings.resetAt,now-settings.days*day)||entry.tasteWeight<=0||entry.listenedMs<=0)continue;
    const decay=2**(-Math.max(0,now-entry.updatedAt)/(14*day)),coverage=Math.min(1,entry.listenedMs/Math.max(1000,entry.durationMs||entry.track.duration*1000||180000));
    const skip=entry.reason==='skip'&&entry.listenedMs<30000&&coverage<.25;
    const weight=entry.tasteWeight*decay*(skip?-.4:coverage+(entry.reason==='completed'&&coverage>=.75?.25:0));
    scores.set(entry.track.id,(scores.get(entry.track.id)??0)+weight);
    if(skip)continue;
    sessions++;listenedMs+=entry.listenedMs;
    const choices=artistChoices(entry.track);
    for(const a of choices){const key=`${a.match}:${a.id}`,old=artists.get(key)??{id:a.id,name:a.name,match:a.match,score:0};old.score+=weight/Math.max(1,choices.length);artists.set(key,old);}
    // Artist-level genres are displayed as artist genres, never copied onto tracks.
    const groups=settings.genreLevel==='track'?[genres[`track:${entry.track.id}`]??[]]:choices.map(a=>a.match==='id'?genres[`artist:${a.id}`]??[]:[]);
    if(!groups.length)groups.push([]);
    total+=weight;
    for(const group of groups){const part=weight/groups.length;if(!group.length)unknown+=part;else for(const name of group)genreScores.set(name,(genreScores.get(name)??0)+part/group.length);}
  }
  const sort=<T extends {score:number}>(values:T[])=>values.sort((a,b)=>b.score-a.score);
  return {sessions,listenedMs,personalized:sessions>=3&&listenedMs>=180000,artists:sort([...artists.values()]).slice(0,12),genres:sort([...genreScores].map(([name,score])=>({name,score}))).slice(0,20),unclassifiedPercent:total?Math.round(unknown/total*100):100,trackScores:Object.fromEntries(scores)};
}
function hash(value:string){let n=2166136261;for(const c of value)n=Math.imul(n^c.charCodeAt(0),16777619);return (n>>>0)/4294967296;}
export function recentTasteVideos(input:TasteInput):Set<string>{return new Set(input.entries.filter(e=>!e.excluded&&e.tasteWeight>0&&e.listenedMs>=Math.min(30000,Math.max(1000,e.durationMs||e.track.duration*1000||180000)/2)&&e.startedAt>=Math.max(input.settings.resetAt,input.now-day)).map(e=>e.track.videoId));}
export function buildTasteMix(input:TasteInput,candidates:TasteCandidate[],request:MixRequest,date:string):TasteMix{
  const profile=tasteProfile(input),recent=recentTasteVideos(input);
  const discovered=new Set(candidates.filter(c=>c.discovered).map(c=>c.track.id));
  const artistScores=new Map(profile.artists.map(a=>[`${a.match}:${a.id}`,a.score]));
  const genreScores=new Map(profile.genres.map(g=>[normalizeArtist(g.name),g.score]));
  for(const {track} of candidates){const explicit=(input.likes.has(track.id)?1:0)+(input.saved.has(track.id)?.3:0)+(input.feedback[track.id]===1?1.5:0);if(explicit)for(const artist of artistChoices(track)){const key=`${artist.match}:${artist.id}`;artistScores.set(key,(artistScores.get(key)??0)+explicit);}}
  const seen=new Set<string>();
  const pool=candidates.filter(c=>{
    const t=c.track;if(seen.has(t.videoId)||isExcluded(t,request.exclusions)||input.feedback[t.id]===-1||(!input.settings.allowRecent&&recent.has(t.videoId)))return false;
    seen.add(t.videoId);return request.kind!=='genre'||trackGenres(t,input.genres,input.settings.genreLevel).some(g=>normalizeArtist(g)===normalizeArtist(request.genre??''));
  }).map(c=>{
    const t=c.track,liked=input.likes.has(t.id),saved=input.saved.has(t.id),measured=profile.trackScores[t.id]??0,feedback=input.feedback[t.id]??0;
    const artist=artistChoices(t).sort((a,b)=>(artistScores.get(`${b.match}:${b.id}`)??0)-(artistScores.get(`${a.match}:${a.id}`)??0))[0];
    const artistScore=artist?artistScores.get(`${artist.match}:${artist.id}`)??0:0;
    const genre=[...trackGenres(t,input.genres,input.settings.genreLevel)].sort((a,b)=>(genreScores.get(normalizeArtist(b))??0)-(genreScores.get(normalizeArtist(a))??0))[0];
    const genreScore=genre?genreScores.get(normalizeArtist(genre))??0:0;
    const known=liked||saved||measured>0||feedback===1;
    const score=measured+(liked?2:0)+(saved?.6:0)+(feedback===1?3:0)+Math.min(2,artistScore)*.4+Math.min(2,genreScore)*.35+hash(`${date}:${request.kind}:${t.videoId}`)*.35;
    const reason:MixItem['reason']=feedback===1?'feedback':request.kind==='genre'?'genre':liked?'liked':saved?'saved':measured>0?'listened':artistScore>0?'artist':genreScore>0?'genre':'discovery';
    return {track:t,reason,detail:reason==='artist'?artist?.name??null:reason==='genre'?request.genre??genre??null:reason==='discovery'?c.query??null:null,feedback,fresh:!known,score,known};
  }).filter(c=>(request.kind!=='familiar'||c.known)&&(c.known||discovered.has(c.track.id))).sort((a,b)=>b.score-a.score||a.track.videoId.localeCompare(b.track.videoId));
  const selected:typeof pool=[];const counts=new Map<string,number>(),equivalent=new Set<string>();
  const target=request.kind==='discovery'?Math.round(20*input.settings.discoveryPercent/100):0;
  const keys=(track:Track)=>artistChoices(track).map(a=>`${a.match}:${a.id}`);
  const equivalentKey=(track:Track)=>`${keys(track).sort().join('|')}:${normalizeArtist(track.title).replace(/\s*\((official (audio|video)|audio|lyrics)\)\s*/g,'').trim()}`;
  while(selected.length<20&&pool.length){
    const remaining=20-selected.length,newNeeded=target-selected.filter(c=>!c.known).length;
    const eligible=(c:typeof pool[number])=>!equivalent.has(equivalentKey(c.track))&&(!input.settings.variety||keys(c.track).every(k=>(counts.get(k)??0)<3));
    const preferred=(c:typeof pool[number])=>request.kind!=='discovery'||(newNeeded>0&&(!c.known)&&(remaining<=newNeeded||selected.length%2===0))||(newNeeded<=0&&c.known)||(remaining>newNeeded&&c.known);
    const prior=selected.at(-1);const adjacent=(c:typeof pool[number])=>!input.settings.variety||!prior||!keys(c.track).some(k=>keys(prior.track).includes(k));
    let index=pool.findIndex(c=>eligible(c)&&preferred(c)&&adjacent(c));
    if(index<0)index=pool.findIndex(c=>eligible(c)&&preferred(c));
    if(index<0)index=pool.findIndex(c=>eligible(c)&&adjacent(c));
    if(index<0)index=pool.findIndex(eligible);
    if(index<0)break;
    const [next]=pool.splice(index,1);selected.push(next);equivalent.add(equivalentKey(next.track));for(const k of keys(next.track))counts.set(k,(counts.get(k)??0)+1);
  }
  return {kind:request.kind,genre:request.genre??null,day:date,items:selected.map(({score,known,...item})=>item),requested:20,discoveryCount:selected.filter(c=>!c.known).length,generatedAt:input.now,cached:false};
}
