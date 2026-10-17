import type {Track} from './index';
import {isExcluded,type ListeningExclusions} from './listening';

export type RadioCandidates={videoId:string;items:Track[]};
export type RadioSession={seed:Track;queueIds:string[];createdAt:number;fetchedAt:string;degraded:boolean};
const normalize=(value:string)=>value.normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('it').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
// Keep edition labels (live, remix, acoustic) distinct. Only matching title and
// performer credits deduplicate alternate video IDs for the same edition.
export function radioEdition(track:Track):string{
  const artists=track.artists?.length?track.artists.map(a=>a.id).sort().join('|'):normalize(track.artist.replace(/\s*-\s*Topic$/i,''));
  return `${normalize(track.title)}::${artists}`;
}
export function radioSuggestions(seed:Track,candidates:Track[],exclusions:ListeningExclusions,limit=25):Track[]{
  const videos=new Set([seed.videoId]),editions=new Set([radioEdition(seed)]),result:Track[]=[];
  for(const track of candidates){
    const edition=radioEdition(track);
    if(videos.has(track.videoId)||editions.has(edition)||isExcluded(track,exclusions))continue;
    videos.add(track.videoId);editions.add(edition);result.push(track);
    if(result.length>=limit)break;
  }
  return result;
}
