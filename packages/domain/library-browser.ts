import type {Track} from './index';

export type LibrarySort='recent'|'name'|'artist'|'duration-short'|'duration-long'|'count';
export type LibraryDuration='all'|'short'|'medium'|'long'|'unknown';
export type LibraryFilter={query:string;sort:LibrarySort;duration:LibraryDuration};
export type LibraryRow<T>={item:T;text:string;name:string;artist?:string;duration?:number;recent?:number;count?:number};
export const libraryBatchSize=60;
export const defaultLibraryFilter:LibraryFilter={query:'',sort:'recent',duration:'all'};
export const normalizeLibraryText=(value:string)=>value.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('it').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function trackLibraryText(track:Track){return [track.title,track.artist,...(track.artists??[]).map(a=>a.name),track.album?.name??''].join(' ');}
/** The player holds 1000 entries; a far-down row must still be playable. */
export function libraryPlaybackWindow(tracks:Track[],selected:Track):Track[]{
  const index=tracks.findIndex(track=>track.id===selected.id);
  if(index<0)return [selected];
  const start=index<1000?0:index;
  return tracks.slice(start,start+1000);
}
const collator=new Intl.Collator('it',{numeric:true,sensitivity:'base'});
export function browseLibrary<T>(rows:LibraryRow<T>[],filter:LibraryFilter):T[]{
  const words=normalizeLibraryText(filter.query).split(' ').filter(Boolean);
  const validDuration=(row:LibraryRow<T>)=>Number.isFinite(row.duration)&&row.duration!>0;
  return rows.map((row,index)=>({row,index})).filter(({row})=>{
    if(words.length&&!words.every(word=>normalizeLibraryText(row.text).includes(word)))return false;
    const known=validDuration(row);
    return filter.duration==='all'||filter.duration==='unknown'&&!known||known&&(filter.duration==='short'?row.duration!<180:filter.duration==='medium'?row.duration!>=180&&row.duration!<=360:filter.duration==='long'&&row.duration!>360);
  }).sort((a,b)=>{
    let order=0;
    if(filter.sort==='name')order=collator.compare(a.row.name,b.row.name);
    else if(filter.sort==='artist')order=collator.compare(a.row.artist??'',b.row.artist??'')||collator.compare(a.row.name,b.row.name);
    else if(filter.sort==='count')order=(b.row.count??0)-(a.row.count??0);
    else if(filter.sort==='duration-short'||filter.sort==='duration-long'){
      const ak=validDuration(a.row),bk=validDuration(b.row);
      order=ak!==bk?ak?-1:1:ak?(a.row.duration!-b.row.duration!)*(filter.sort==='duration-short'?1:-1):0;
    }else order=(b.row.recent??0)-(a.row.recent??0);
    return order||a.index-b.index;
  }).map(({row})=>row.item);
}
