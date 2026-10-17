import type {Track} from './index';
export const playlistFileLimit=4*1024*1024;
export type PlaylistFile={format:'ritvio-playlist';version:1;exportedAt:string;playlist:{name:string;description:string;cover:string|null;tracks:Array<{videoId:string;title:string;artist:string;duration:number}>}};
export function sharedTrackLink(track:Pick<Track,'videoId'>):string{if(!/^[A-Za-z0-9_-]{11}$/.test(track.videoId))throw Error('Identificativo video non valido.');return `https://www.youtube.com/watch?v=${track.videoId}`;}
export function playlistFilename(name:string):string{
  let safe=name.normalize('NFKC').replace(/[<>:"/\\|?*\u0000-\u001f]/g,' ').trim().replace(/[. ]+$/g,'').slice(0,80).replace(/[. ]+$/g,'');
  if(!safe||/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(safe))safe=`Playlist ${safe||'RITVIO'}`;
  return `${safe}.ritvio.json`;
}
