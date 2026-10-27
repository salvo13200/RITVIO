import type {MobileResource,NativeTrack} from '../../../../packages/domain/mobile';
import {isNativeTrack} from './library-model';

export type CatalogRequest=({operation:'catalog-search';kind:'album'|'artist';query:string}|{operation:'detail';kind:'album'|'artist';id:string}|{operation:'search-snapshot';query:string}|{operation:'releases';kind:'artist';id:string;section:'albums'|'singles'}|{operation:'artist-search';kind:'artist';id:string;query:string;searchKind:'track'|'album'})&{refresh?:boolean};
type Person={id:string;name:string};
export type CatalogEntry={number:number;title:string;duration:number;track:NativeTrack|null};
export type CatalogSearch={items:MobileResource[];candidates:MobileResource[];truncated:boolean;cached:boolean};
export type CatalogSnapshot={items:NativeTrack[];candidates:MobileResource[];albums:MobileResource[];truncated:boolean;cached:boolean;albumsUnavailable:boolean};
export type CatalogReleases={items:MobileResource[];truncated:boolean;cached:boolean;artistId:string};
export type CatalogArtistSearch={items:NativeTrack[]|MobileResource[];truncated:boolean;cached:boolean;artistId:string;kind:'track'|'album'};
export type CatalogResult=CatalogSearch|CatalogSnapshot|CatalogReleases|CatalogArtistSearch|AlbumDetail|ArtistDetail;
type Detail=MobileResource&{description:string;cached:boolean};
export type AlbumDetail=Detail&{kind:'album';entries:CatalogEntry[];reportedCount:number|null;incomplete:boolean};
export type ArtistDetail=Detail&{kind:'artist';tracks:NativeTrack[];albums:MobileResource[];singles:MobileResource[];moreAlbums:boolean;moreSingles:boolean};

const record=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
function fail():never{throw Error('Invalid catalog metadata');}
function text(value:unknown,max:number,empty=false){if(typeof value!=='string'||value.length>max||(!empty&&!value.trim()))return fail();return value;}
function id(value:unknown){const result=text(value,160);if(/[^A-Za-z\d_-]/.test(result))return fail();return result;}
function flag(value:unknown){if(value!==undefined&&typeof value!=='boolean')return fail();return value===true;}
function year(value:unknown){return typeof value==='number'&&Number.isInteger(value)&&value>=1000&&value<=9999?String(value):text(value,16);}
function list<T>(value:unknown,max:number,parse:(item:unknown,index:number)=>T):T[]{if(!Array.isArray(value)||value.length>max)return fail();return value.map(parse);}
function image(value:unknown):string|null{
 if(value==null||value==='')return null;const result=text(value,2*1024*1024);
 if(/^data:image\/(?:png|jpeg);base64,[A-Za-z\d+/=]+$/.test(result))return result;
 if(result.length>4096||/[\u0000-\u001f\u007f]/.test(result))return fail();
 try{const url=new URL(result);if(url.protocol==='https:'&&!url.username&&!url.password&&(!url.port||url.port==='443')&&['.googleusercontent.com','.ytimg.com','.ggpht.com'].some(domain=>url.hostname.endsWith(domain)))return result;}catch{}
 return fail();
}
function person(value:unknown):Person{if(!record(value))return fail();return {id:id(value.id),name:text(value.name,512)};}
function resource(value:unknown,kind?:'album'|'artist'):MobileResource{
 if(!record(value)||(value.kind!=='artist'&&value.kind!=='album')||(kind&&value.kind!==kind))return fail();
 return {id:id(value.id),name:text(value.name,1024),kind:value.kind,artwork:image(value.artwork),
  ...(value.artists!==undefined?{artists:list(value.artists,20,person)}:{}),...(value.year!=null?{year:year(value.year)}:{})};
}
function track(value:unknown):NativeTrack{
 if(!isNativeTrack(value)||value.videoId.length!==11)return fail();const thumbnail=image(value.thumbnail)??'';
 return {videoId:value.videoId,title:value.title,artist:value.artist,duration:value.duration,thumbnail,
  ...(value.artists!=null?{artists:list(value.artists,20,person)}:{}),...(value.album!=null?{album:person(value.album)}:{})};
}
function entry(value:unknown,index:number):CatalogEntry{
 if(!record(value)||value.number!==index+1||typeof value.duration!=='number'||!Number.isFinite(value.duration)||value.duration<0||value.duration>86400)return fail();
 return {number:index+1,title:text(value.title,1024),duration:value.duration,track:value.track===null?null:track(value.track)};
}
export function parseCatalog(raw:unknown,request:CatalogRequest):CatalogResult{
 if(!record(raw))return fail();const cached=flag(raw.cached);
 if(request.operation==='search-snapshot')return {items:list(raw.items,100,track),candidates:list(raw.candidates,20,value=>resource(value,'artist')),albums:list(raw.albums,20,value=>resource(value,'album')),truncated:flag(raw.truncated),cached,albumsUnavailable:flag(raw.albumsUnavailable)};
 if(request.operation==='releases'){
  if(raw.artistId!==request.id)return fail();return {artistId:request.id,items:list(raw.items,100,value=>resource(value,'album')),truncated:flag(raw.truncated),cached};
 }
 if(request.operation==='artist-search'){
  if(raw.artistId!==request.id||raw.kind!==request.searchKind)return fail();return {artistId:request.id,kind:request.searchKind,items:request.searchKind==='track'?list(raw.items,100,track):list(raw.items,100,value=>resource(value,'album')),truncated:flag(raw.truncated),cached};
 }
 if(request.operation==='catalog-search')return {items:list(raw.items,request.kind==='artist'?20:100,value=>resource(value,request.kind)),
  candidates:raw.candidates===undefined?[]:list(raw.candidates,20,value=>resource(value,'artist')),truncated:flag(raw.truncated),cached};
 const base=resource(raw,request.kind);if(base.id!==request.id)return fail();const detail={...base,description:text(raw.description??'',24000,true),cached};
 if(request.kind==='album'){
  const entries=list(raw.entries,1000,entry),count=raw.reportedCount;
  if(count!=null&&(typeof count!=='number'||!Number.isSafeInteger(count)||count<0||count>100000))return fail();
  const reportedCount=count==null?null:count as number;
  return {...detail,kind:'album',entries,reportedCount,incomplete:flag(raw.incomplete)||(reportedCount!==null&&reportedCount>entries.length)};
 }
 return {...detail,kind:'artist',tracks:list(raw.tracks,100,track),albums:list(raw.albums,100,value=>resource(value,'album')),
  singles:list(raw.singles,100,value=>resource(value,'album')),moreAlbums:flag(raw.moreAlbums),moreSingles:flag(raw.moreSingles)};
}
