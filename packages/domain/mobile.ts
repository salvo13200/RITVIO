import type {Track} from './index';
export type NativeTrack=Pick<Track,'videoId'|'title'|'artist'|'thumbnail'|'duration'|'artists'>&{album?:Track['album']|null};
export type MobileResource={id:string;name:string;kind:'album'|'artist';artwork:string|null;artists?:{id:string;name:string}[];year?:string|null};
export type MobilePlaylist={id:string;name:string;items:NativeTrack[];updatedAt:number;revision?:number;description?:string;cover?:string|null};
export type MobileImportPreview={requestId:string;title:string;description:string;cover?:string|null;artwork?:string|null;entries:{number:number;title:string;track:NativeTrack|null}[];reportedCount:number|null;partial:boolean;truncated:boolean;provider:'file'|'youtube-music';adjusted?:number;cached?:boolean;fetchedAt?:number;expiresAt:number};
export type MobileImportResult={library:MobileLibrary;playlistId:string;added:number;skippedDuplicates:number};
export type MobileLibrary={likes:NativeTrack[];playlists:MobilePlaylist[];recent:NativeTrack[];follows:MobileResource[];artwork?:Record<string,string>};
export type MobileCollection={id:string;playlistId:string|null;sourceTitle:string;country:string|null;artwork:string|null;albums:MobileResource[]};
export type MobileCatalog={items?:MobileResource[];collections?:MobileCollection[];tracks?:NativeTrack[];entries?:{number:number;title:string;duration:number;track:NativeTrack|null}[];albums?:MobileResource[];singles?:MobileResource[];id?:string;kind?:'album'|'artist';name?:string;artwork?:string|null;description?:string;cached?:boolean;stale?:boolean;fetchedAt?:number;partial?:boolean};
export type MobileAudio={available:boolean;bands:{index:number;frequency:number;level:number}[];min:number;max:number;enabled:boolean;sleepUntil:number|null;sleepAtEnd?:boolean};
export const emptyMobileLibrary:MobileLibrary={likes:[],playlists:[],recent:[],follows:[]};
export type MobileDiscovery={enabled:boolean;status:'idle'|'loading'|'ready'|'error'|'empty'|'full';loading:boolean;mode:'radio'|'autoplay'|null;origin:NativeTrack|null;message:string|null;retryAfter:number|null;suspended?:'timer'|'repeat'|null};
export type MobilePlayback={items:NativeTrack[];index:number;position:number;duration:number;buffered:number;playing:boolean;loading:boolean;repeat:'off'|'all'|'one';shuffle:boolean;volume:number;error:string|null;status:'idle'|'ready'|'buffering'|'ended';order?:number[];queueRevision?:number;discovery?:MobileDiscovery;automatic?:number[]};
export type MobileCommand={type:'play'|'pause'|'next'|'previous'|'clear'|'retry'}|{type:'seek'|'volume';value:number}|{type:'repeat';value:'off'|'all'|'one'}|{type:'shuffle';value:boolean}|{type:'remove'|'jump';value:number}|{type:'remove';value:{index:number;revision:number}}|{type:'move';value:{from:number;to:number;revision:number}};
export const emptyMobilePlayback:MobilePlayback={items:[],index:0,position:0,duration:0,buffered:0,playing:false,loading:false,repeat:'off',shuffle:false,volume:1,error:null,status:'idle'};
export function mobileTime(value:number){const seconds=Math.max(0,Math.floor(Number.isFinite(value)?value:0));return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;}
