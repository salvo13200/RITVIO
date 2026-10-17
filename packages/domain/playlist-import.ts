import type {Track,PersonalPlaylist} from './index';
export const remotePlaylistLimit=1000;
export const remotePlaylistIdPattern=/^(?:PL|OLAK5uy_|RDCLAK5uy_)[A-Za-z0-9_-]{8,150}$/;
export function playlistLink(value:string):{id:string;url:string}{
  let url:URL;try{url=new URL(value.trim());}catch{throw Error('Incolla un link completo a una playlist YouTube o YouTube Music.');}
  const hosts=['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be'];
  if(url.protocol!=='https:'||!hosts.includes(url.hostname)||url.username||url.password||url.port||url.searchParams.getAll('list').length!==1||
    (url.hostname==='youtu.be'?!/^\/[A-Za-z0-9_-]{11}$/.test(url.pathname):!['/playlist','/watch'].includes(url.pathname)))throw Error('Usa un link HTTPS di YouTube o YouTube Music con il parametro list.');
  const id=url.searchParams.get('list')!;
  if(!remotePlaylistIdPattern.test(id))throw Error('Questa lista non è supportata. Usa una playlist condivisibile; radio, Mix personali, Guarda più tardi e Preferiti richiedono altri flussi.');
  return {id,url:`https://www.youtube.com/playlist?list=${id}`};
}
export type RemotePlaylistEntry={number:number;title:string;track:Track|null};
export type RemotePlaylistPreview={id:string;url:string;title:string;description:string;author:string;artwork:string|null;entries:RemotePlaylistEntry[];reportedCount:number|null;partial:boolean;truncated:boolean;provider:'youtube-music'|'youtube';fetchedAt:string;cache:'fresh'|'cached'|'stale'};
export type RemotePlaylistResult={playlist:PersonalPlaylist;added:number;skippedDuplicates:number;unavailable:number;excluded:number;partial:boolean};
export type RemotePlaylistJob={id:string;state:'loading'|'ready'|'failed'|'cancelled'|'imported';phase:'youtube-music'|'youtube'|'ready';preview:RemotePlaylistPreview|null;error:string|null;result:RemotePlaylistResult|null};
export type RemotePlaylistCommit={entryNumbers:number[];skipDuplicates:boolean;name:string;targetId:string|null;targetRevision:number|null};
export function importSelection<T extends {videoId:string}>(entries:Array<{number:number;track:T|null}>,numbers:number[],skip:boolean,existing:T[]=[]){
  const chosen=new Set(numbers),seen=new Set(existing.map(t=>t.videoId));let skipped=0;
  const tracks:T[]=[];
  for(const entry of entries){if(!chosen.has(entry.number)||!entry.track)continue;if(skip&&seen.has(entry.track.videoId)){skipped++;continue;}seen.add(entry.track.videoId);tracks.push(entry.track);}
  return {tracks,skipped};
}
