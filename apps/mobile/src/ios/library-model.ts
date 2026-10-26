import type {MobileLibrary,NativeTrack} from '../../../../packages/domain/mobile';

export type IOSLibrary=MobileLibrary&{revision:number};
export type LibraryAction=
 |{type:'like';track:NativeTrack;liked:boolean}
 |{type:'create';name:string;description?:string;track?:NativeTrack}
 |{type:'rename';id:string;revision:number;name:string;description:string}
 |{type:'delete';id:string;revision:number}
 |{type:'add';id:string;revision:number;track:NativeTrack}
 |{type:'remove';id:string;revision:number;index:number}
 |{type:'move';id:string;revision:number;from:number;to:number}
 |{type:'clearHistory'};
const record=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const integer=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const text=(value:unknown,max:number)=>typeof value==='string'&&value.length<=max;
function cover(value:unknown){if(!text(value,4096)||/[\u0000-\u001f\u007f]/.test(value as string))return false;try{const url=new URL(value as string);return !url.username&&!url.password&&(url.protocol==='https:'&&Boolean(url.hostname)||url.protocol==='file:'&&!url.hostname&&!url.search&&!url.hash);}catch{return false;}}
function track(value:unknown):boolean{
 if(!record(value)||typeof value.videoId!=='string'||!/^[A-Za-z0-9_-]{11}$/.test(value.videoId)||!text(value.title,1024)||!(value.title as string).trim()||!text(value.artist,1024)||!text(value.thumbnail,2*1024*1024)||typeof value.duration!=='number'||!Number.isFinite(value.duration)||value.duration<0||value.duration>86400)return false;
 return !value.thumbnail||/^(https:\/\/|data:image\/(?:png|jpeg);base64,)/.test(value.thumbnail as string);
}
export function parseLibrary(value:unknown):IOSLibrary{
 if(!record(value)||!integer(value.revision))throw Error('Invalid library revision');
 for(const [key,max] of [['likes',500],['recent',40]] as const){const items=value[key];if(!Array.isArray(items)||items.length>max||!items.every(track)||new Set(items.map(item=>item.videoId)).size!==items.length)throw Error('Invalid library songs');}
 if(!Array.isArray(value.follows)||value.follows.length!==0)throw Error('Unsupported library resources');
 if(!Array.isArray(value.playlists)||value.playlists.length>100)throw Error('Invalid playlists');
 const ids=new Set<string>();
 for(const item of value.playlists){
  if(!record(item)||typeof item.id!=='string'||!/^[a-f\d-]{36}$/i.test(item.id)||ids.has(item.id)||!text(item.name,100)||!(item.name as string).trim()||!text(item.description??'',1000)||!integer(item.revision)||(item.revision as number)<1||!integer(item.updatedAt)||!Array.isArray(item.items)||item.items.length>500||!item.items.every(track))throw Error('Invalid playlist');
  if(item.cover!=null&&!cover(item.cover))throw Error('Invalid personal cover');
  ids.add(item.id);
 }
 return value as unknown as IOSLibrary;
}
export function acceptLibrary(previous:IOSLibrary|null,incoming:IOSLibrary):IOSLibrary{return previous&&previous.revision>=incoming.revision?previous:incoming;}
