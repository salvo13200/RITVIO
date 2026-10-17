import type {RemotePlaylistPreview} from '../../packages/domain/playlist-import';
import {catalogTrack,catalogArtwork} from './catalog-normalize';
import {AppError} from './errors';
import {videoIdPattern} from '../../packages/domain/index';
const text=(value:unknown,max:number)=>typeof value==='string'?value.trim().slice(0,max):'';
export function normalizeRemotePlaylist(value:any,id:string,provider:RemotePlaylistPreview['provider']):RemotePlaylistPreview{
  if(!value||!Array.isArray(value.entries)||value.entries.length>5000||!text(value.title,100))throw new AppError(502,'PLAYLIST_INVALID','Il servizio non ha restituito una playlist valida. Riprova con un link condivisibile.');
  const reportedCount=Number.isSafeInteger(value.reportedCount)&&value.reportedCount>=0&&value.reportedCount<=1000000?value.reportedCount:null;
  const entries=value.entries.slice(0,1000).map((entry:any,index:number)=>{
    let track=null;try{if(entry?.track)track=catalogTrack(entry.track);}catch{/* Retain a visible unavailable slot rather than shifting the order. */}
    return {number:index+1,title:track?.title||text(entry?.title,300)||'Contenuto non disponibile',track};
  });
  const truncated=value.entries.length>1000||reportedCount!==null&&reportedCount>1000;
  return {id,url:`https://www.youtube.com/playlist?list=${id}`,title:text(value.title,100),description:text(value.description,1000),author:text(value.author,300),artwork:catalogArtwork(value.artwork),entries,reportedCount,
    partial:truncated||value.partial===true||reportedCount===null||reportedCount>entries.length,truncated,provider,fetchedAt:new Date().toISOString(),cache:'fresh'};
}
export function normalizeFlatPlaylist(raw:any,id:string):RemotePlaylistPreview{
  if(!raw||!Array.isArray(raw.entries))throw new AppError(502,'PLAYLIST_INVALID','Playlist non accessibile. Controlla che il link sia condivisibile.');
  const entries=raw.entries.slice(0,1001).map((entry:any)=>{
    const title=entry?.title||'Contenuto non disponibile',available=entry&&videoIdPattern.test(entry.id??'')&&entry.is_live!==true&&!['private','needs_auth','premium_only','subscriber_only'].includes(entry.availability)&&!['[Private video]','[Deleted video]'].includes(title);
    return {title,track:available?{videoId:entry.id,title,artist:entry.artist||entry.channel||entry.uploader||'YouTube',duration:entry.duration,artists:[]}:null};
  });
  return normalizeRemotePlaylist({title:raw.title,description:raw.description,author:raw.uploader||raw.channel,artwork:raw.thumbnails?.at(-1)?.url,entries,reportedCount:raw.playlist_count,partial:raw.entries.length>1000},id,'youtube');
}
