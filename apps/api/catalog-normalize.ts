import {mediaId} from './store';
import {AppError} from './errors';
import {videoIdPattern,type MusicResource,type Track} from '../../packages/domain/index';
import {catalogIdPattern,type CatalogResource,type CatalogDetail,type CatalogKind,type CatalogSearch,type ArtistReleases} from '../../packages/domain/catalog';
const fail=()=>new AppError(502,'CATALOG_INVALID','Il catalogo ha restituito dati incompleti. Riprova più tardi.');
const text=(value:unknown,limit=300)=>typeof value==='string'?value.trim().slice(0,limit):'';
const seconds=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?Math.min(86400,Math.max(0,Math.round(value))):0;
function people(value:unknown):MusicResource[]{return Array.isArray(value)?value.slice(0,30).filter(a=>a&&typeof a.id==='string'&&catalogIdPattern.test(a.id)&&text(a.name)).map(a=>({id:a.id,name:text(a.name)})):[];}
export function catalogArtwork(value:unknown):string|null{
  if(typeof value!=='string'||value.length>2048)return null;
  try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&(['i.ytimg.com','yt3.googleusercontent.com','lh3.googleusercontent.com'].includes(url.hostname)||url.hostname.endsWith('.ytimg.com'))?url.href:null;}catch{return null;}
}
export function catalogResource(value:any,kind:CatalogKind):CatalogResource{
  if(!value||value.kind!==kind||typeof value.id!=='string'||!catalogIdPattern.test(value.id)||!text(value.name))throw fail();
  return {id:value.id,name:text(value.name),kind,artwork:catalogArtwork(value.artwork),artists:people(value.artists),year:text(value.year,20)||null,releaseType:text(value.releaseType,40)||null};
}
export function catalogTrack(value:any):Track{
  if(!value||typeof value.videoId!=='string'||!videoIdPattern.test(value.videoId)||!text(value.title))throw fail();
  const album=value.album&&typeof value.album.id==='string'&&catalogIdPattern.test(value.album.id)&&text(value.album.name)?{id:value.album.id,name:text(value.album.name)}:undefined;
  return {id:mediaId(value.videoId),videoId:value.videoId,title:text(value.title),artist:text(value.artist)||'YouTube Music',duration:seconds(value.duration),artists:people(value.artists),album,thumbnail:`https://i.ytimg.com/vi/${value.videoId}/mqdefault.jpg`,canonicalUrl:`https://www.youtube.com/watch?v=${value.videoId}`};
}
export function normalizeCatalogSearch(value:any,kind:CatalogKind,limit=20):CatalogSearch|ArtistReleases{
  if(!value||!Array.isArray(value.items)||value.items.length>limit||typeof value.truncated!=='boolean')throw fail();
  const seen=new Set<string>();const items=value.items.map((item:any)=>catalogResource(item,kind)).filter((item:CatalogResource)=>{if(seen.has(item.id))return false;seen.add(item.id);return true;});return {items,truncated:value.truncated};
}
export function normalizeCatalogDetail(value:any,kind:CatalogKind,id:string):CatalogDetail{
  const summary=catalogResource(value,kind);if(summary.id!==id)throw fail();
  const description=text(value.description,10000);
  if(kind==='album'){
    if(!Array.isArray(value.entries)||value.entries.length>1000||typeof value.incomplete!=='boolean')throw fail();
    const entries=value.entries.map((entry:any,index:number)=>{if(!entry||!text(entry.title)||!(entry.track===null||typeof entry.track==='object'))throw fail();const track=entry.track?catalogTrack(entry.track):null;if(track?.album?.id!==id&&track)throw fail();return {number:index+1,title:text(entry.title),duration:seconds(entry.duration),track};});
    const reportedCount=Number.isSafeInteger(value.reportedCount)&&value.reportedCount>=0&&value.reportedCount<=100000?value.reportedCount:null;
    return {...summary,kind:'album',description,entries,reportedCount,incomplete:value.incomplete||(reportedCount!==null&&reportedCount>entries.length)};
  }
  if(!Array.isArray(value.tracks)||value.tracks.length>100||!Array.isArray(value.albums)||!Array.isArray(value.singles))throw fail();
  return {...summary,kind:'artist',description,tracks:value.tracks.map(catalogTrack),albums:normalizeCatalogSearch({items:value.albums,truncated:false},'album',100).items,singles:normalizeCatalogSearch({items:value.singles,truncated:false},'album',100).items,moreAlbums:value.moreAlbums===true,moreSingles:value.moreSingles===true};
}
