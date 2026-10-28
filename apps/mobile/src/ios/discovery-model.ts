import type {NativeTrack} from '../../../../packages/domain/mobile';
import {isNativeTrack} from './library-model';
export type DiscoveryState={enabled:boolean;status:'idle'|'loading'|'ready'|'error'|'empty'|'full';mode:'radio'|'autoplay'|null;loading:boolean;origin:NativeTrack|null;message:string|null;suspended:'timer'|'repeat'|null;retryIn:number;revision:number;sample:number};
export type DiscoveryCommand={type:'enabled';enabled:boolean}|{type:'radio';track:NativeTrack;requestId:string}|{type:'cancel';requestId:string}|{type:'retry'};
export function parseDiscovery(raw:unknown):DiscoveryState{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('INVALID_DISCOVERY_STATE');
 const v=raw as Record<string,unknown>;
 if(typeof v.enabled!=='boolean'||typeof v.loading!=='boolean'||typeof v.status!=='string'||!['idle','loading','ready','error','empty','full'].includes(v.status)||v.mode!==null&&v.mode!=='radio'&&v.mode!=='autoplay'||v.suspended!==null&&v.suspended!=='timer'&&v.suspended!=='repeat'||v.message!==null&&(typeof v.message!=='string'||!['BUSY','QUEUE_FULL','NO_SUGGESTIONS','RATE_LIMITED','SUGGESTIONS_UNAVAILABLE'].includes(v.message))||!Number.isSafeInteger(v.revision)||Number(v.revision)<0||Number(v.revision)>1e9||!Number.isSafeInteger(v.retryIn)||Number(v.retryIn)<0||Number(v.retryIn)>3600||typeof v.sample!=='number'||!Number.isFinite(v.sample)||v.sample<0||v.sample>1e12||v.loading!==(v.status==='loading')||v.loading!==(v.mode!==null)||v.origin!==null&&!isNativeTrack(v.origin))throw Error('INVALID_DISCOVERY_STATE');
 const source=v.origin as NativeTrack|null;
 if(source?.artists!=null&&(!Array.isArray(source.artists)||source.artists.length>20||source.artists.some(person=>!person||typeof person.id!=='string'||person.id.length>256||typeof person.name!=='string'||person.name.length>512)))throw Error('INVALID_DISCOVERY_STATE');
 if(source?.album!=null&&(typeof source.album.id!=='string'||source.album.id.length>256||typeof source.album.name!=='string'||source.album.name.length>512))throw Error('INVALID_DISCOVERY_STATE');
 const origin=source?{videoId:source.videoId,title:source.title,artist:source.artist,thumbnail:source.thumbnail,duration:source.duration,...(source.artists?{artists:source.artists.map(person=>({id:person.id,name:person.name}))}:{}),...(source.album?{album:{id:source.album.id,name:source.album.name}}:{})}:null;
 return {enabled:v.enabled,status:v.status,loading:v.loading,mode:v.mode,origin,message:v.message,suspended:v.suspended,retryIn:v.retryIn,revision:v.revision,sample:v.sample} as DiscoveryState;
}
export function acceptDiscovery(previous:DiscoveryState|null,next:DiscoveryState){return previous&&(next.revision<previous.revision||next.sample<previous.sample)?previous:next;}
