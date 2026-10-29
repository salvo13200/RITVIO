import type {NativeTrack} from '../../../../packages/domain/mobile';
import {isNativeTrack} from './library-model';
export type DocumentPreview={token:string;name:string;description:string;cover:string|null;adjusted:number;entries:{number:number;track:NativeTrack}[]};
export type ReviewedReport={token:string;text:string};
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value);
const record=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
export function parseDocumentPreview(raw:unknown):DocumentPreview{
 if(!record(raw)||!uuid(raw.token)||typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>100||typeof raw.description!=='string'||raw.description.length>1000||!Number.isInteger(raw.adjusted)||Number(raw.adjusted)<0||Number(raw.adjusted)>1001||raw.cover!==null&&(typeof raw.cover!=='string'||raw.cover.length>196608||!/^data:image\/jpeg;base64,[A-Za-z\d+/]+={0,2}$/.test(raw.cover))||!Array.isArray(raw.entries)||raw.entries.length>1000)throw Error('PLAYLIST_FILE_INVALID');
 const entries=raw.entries.map((entry,index)=>{if(!record(entry)||entry.number!==index+1||!isNativeTrack(entry.track))throw Error('PLAYLIST_FILE_INVALID');const v=entry.track;return {number:index+1,track:{videoId:v.videoId,title:v.title,artist:v.artist,thumbnail:v.thumbnail,duration:v.duration}};});
 return {token:raw.token,name:raw.name,description:raw.description,cover:raw.cover as string|null,adjusted:raw.adjusted as number,entries};
}
export function documentSelection(preview:DocumentPreview,selected:ReadonlySet<number>,skip:boolean){
 const seen=new Set<string>(),tracks:NativeTrack[]=[];let skipped=0;
 for(const entry of preview.entries){if(!selected.has(entry.number))continue;if(skip&&seen.has(entry.track.videoId)){skipped++;continue;}seen.add(entry.track.videoId);tracks.push(entry.track);}
 return {tracks,skipped,overLimit:tracks.length>500};
}
const reportCodes=new Set(['NONE','OTHER','RATE_LIMITED','PLAYBACK_TIMEOUT','UNSUPPORTED_STREAM','SOURCE_EXPIRED','TRANSPORT_ERROR','SEEK_FAILED','AUDIO_SESSION_UNAVAILABLE','PROVIDER_UNAVAILABLE','PROVIDER_REJECTED','PROVIDER_SIGN_IN_REQUIRED','PROVIDER_TOKEN_REQUIRED','FORMAT_UNAVAILABLE','JS_CHALLENGE_FAILED','BUSY','SUGGESTIONS_UNAVAILABLE','NO_SUGGESTIONS','QUEUE_FULL','PLAYLIST_FILE_INVALID','PLAYLIST_FILE_TOO_LARGE','PLAYLIST_FILE_UNAVAILABLE','PLAYLIST_COVER_INVALID','IMPORT_EXPIRED','LIBRARY_PLAYLIST_LIMIT','LIBRARY_TRACK_LIMIT','LIBRARY_WRITE_FAILED','DOCUMENT_EXPORT_FAILED','DOCUMENT_BUSY','PLAYLIST_CHANGED','PLAYLIST_MISSING','INVALID_IMPORT_SELECTION']);
function keys(value:Record<string,unknown>,expected:string[]){return Object.keys(value).length===expected.length&&expected.every(key=>Object.hasOwn(value,key));}
function validTiming(value:unknown){
 if(!record(value))return false;
 const header=Object.hasOwn(value,'headerNormalized');
 if(!keys(value,['codec','precise','catalogSeconds','sourceSeconds','assetSeconds','itemSeconds',...(header?['headerNormalized','containerSeconds']:[])])||typeof value.codec!=='string'||!['none','other','mp4a.40.2','mp4a.40.5','mp4a.40.29','aac'].includes(value.codec)||typeof value.precise!=='boolean'||header&&typeof value.headerNormalized!=='boolean')return false;
 return ['catalogSeconds','sourceSeconds','assetSeconds','itemSeconds',...(header?['containerSeconds']:[])].every(key=>value[key]===null||typeof value[key]==='number'&&Number.isFinite(value[key])&&Number(value[key])>=0&&Number(value[key])<=86400);
}
export function parseReviewedReport(raw:unknown):ReviewedReport{
 if(!record(raw)||!uuid(raw.token)||typeof raw.text!=='string'||raw.text.length>6000)throw Error('REPORT_UNAVAILABLE');
 let value:unknown;try{value=JSON.parse(raw.text);}catch{throw Error('REPORT_UNAVAILABLE');}
 if(!record(value)||!keys(value,['schema','app','platform','version','build','systemVersion','minimumOS','capabilities','codes',...(Object.hasOwn(value,'timing')?['timing']:[])])||Object.hasOwn(value,'timing')&&!validTiming(value.timing)||value.schema!==1||value.app!=='RITVIO'||value.platform!=='ios'||typeof value.version!=='string'||!/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(value.version)||typeof value.build!=='string'||!/^\d{1,10}$/.test(value.build)||typeof value.systemVersion!=='string'||!/^\d{1,4}(?:\.\d{1,4}){0,3}$/.test(value.systemVersion)||value.minimumOS!=='15.0'||!record(value.capabilities)||!keys(value.capabilities,['library','lyrics','sharing','timer','discovery','playlistFiles'])||Object.values(value.capabilities).some(item=>typeof item!=='boolean')||!record(value.codes)||!keys(value.codes,['playback','suggestions','documents'])||Object.values(value.codes).some(code=>typeof code!=='string'||!reportCodes.has(code)))throw Error('REPORT_UNAVAILABLE');
 return {token:raw.token,text:raw.text};
}
