import {CapacitorHttp} from '@capacitor/core';
import type {NativeTrack} from '../../../../packages/domain/mobile';
import {parseLyrics,type LyricsDocument,type LyricsResponse} from '../../../../packages/domain/lyrics';

type Reply={status:number;data:unknown;headers:Record<string,string>;url?:string};
type Transport=(url:string)=>Promise<Reply>;
type Failure='LYRICS_CANCELLED'|'LYRICS_RATE_LIMIT'|'LYRICS_UNAVAILABLE'|'LYRICS_INVALID_RESPONSE';
export class IOSLyricsError extends Error {constructor(readonly code:Failure){super(code);}}
type Consumer={resolve:(value:LyricsResponse)=>void;reject:(error:IOSLyricsError)=>void;detach:()=>void};
type Job={key:string;track:NativeTrack;consumers:Set<Consumer>};
type Entry={value:LyricsResponse;expires:number;bytes:number};
const missing=():LyricsResponse=>({status:'missing',document:null,cacheHit:false,savedChoice:false});
const signature=(value:string)=>value.normalize('NFKC').toLocaleLowerCase('en').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const title=(value:string)=>value.replace(/\s*[([](?:official\s+(?:audio|video|music video)|lyrics?|lyric video|audio)[)\]]\s*$/i,'').trim();
const artist=(value:string)=>value.replace(/\s*-\s*Topic$/i,'').trim();
export const lyricsTrackKey=(track:NativeTrack)=>JSON.stringify([track.videoId,track.title,track.artist,track.duration,track.artists,track.album?.id]);

/** Same title/artist/duration policy as the existing Android provider.
 * Mismatched intros may offer plain text, never invented karaoke timing. */
export function matchIOSLyrics(value:unknown,track:NativeTrack,now=Date.now()):{document:LyricsDocument;difference:number;albumMatch:boolean}|null {
 if(!value||typeof value!=='object')return null;
 const r=value as Record<string,unknown>;
 if(typeof r.trackName!=='string'||typeof r.artistName!=='string'||r.trackName.length>1000||r.artistName.length>1000||typeof r.duration!=='number'||!Number.isFinite(r.duration)||r.duration<=0||r.duration>86400||typeof r.instrumental!=='boolean')return null;
 const primary=artist(track.artists?.[0]?.name||track.artist.split(', ')[0]);
 if(signature(title(r.trackName))!==signature(title(track.title))||![artist(track.artist),primary].map(signature).includes(signature(artist(r.artistName))))return null;
 const duration=Number.isFinite(track.duration)&&track.duration>0?track.duration:0,difference=duration?Math.abs(r.duration-duration):0;
 if(duration&&difference>10)return null;
 let parsed:ReturnType<typeof parseLyrics>={plainText:'',lines:[],offsetMs:0};
 if(!r.instrumental){
  if(typeof r.syncedLyrics==='string'&&r.syncedLyrics.trim()){try{parsed=parseLyrics(r.syncedLyrics,'lrc');}catch{/* A valid plain response can still be read. */}}
  if(!parsed.lines.length&&typeof r.plainLyrics==='string'&&r.plainLyrics.trim()){try{parsed=parseLyrics(r.plainLyrics,'txt');}catch{return null;}}
  if(!parsed.plainText.trim())return null;
  if(!duration||difference>2)parsed={plainText:parsed.plainText,lines:[],offsetMs:0};
 }
 const document:LyricsDocument={...parsed,provider:'lrclib',providerId:Number.isSafeInteger(r.id)&&Number(r.id)>0?Number(r.id):null,title:r.trackName,artist:r.artistName,fileName:null,instrumental:r.instrumental,fetchedAt:new Date(now).toISOString(),licenseVerified:false};
 return {document,difference,albumMatch:typeof r.albumName==='string'&&Boolean(track.album?.name)&&signature(r.albumName)===signature(track.album!.name)};
}

/** Separate native HTTP requests: no resolver admission, player or queue commands.
 * One active lookup plus the latest waiting track; obsolete waiters are dropped.
 * Capacitor's native HTTP transport buffers the body; size is checked on arrival. */
export class IOSLyricsClient {
 private cache=new Map<string,Entry>();
 private active:Job|null=null;
 private pending:Job|null=null;
 private blockedUntil=0;
 private nextAt=0;
 constructor(private transport:Transport,private now=Date.now,private delay=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms))){}
 lookup(track:NativeTrack,options:{signal?:AbortSignal;fresh?:boolean}={}):Promise<LyricsResponse>{
  if(options.signal?.aborted)return Promise.reject(new IOSLyricsError('LYRICS_CANCELLED'));
  if(!track.title.trim()||!track.artist.trim()||track.title.length>300||track.artist.length>300)return Promise.resolve(missing());
  const key=lyricsTrackKey(track),cached=this.cache.get(key);
  if(options.fresh)this.cache.delete(key);
  else if(cached&&cached.expires>this.now()){
   this.cache.delete(key);this.cache.set(key,cached);
   return Promise.resolve({...cached.value,cacheHit:true});
  }
  const existing=[this.active,this.pending].find(job=>job?.key===key&&job.consumers.size);
  const job=existing??{key,track,consumers:new Set<Consumer>()};
  return new Promise((resolve,reject)=>{
   const consumer:Consumer={resolve,reject,detach:()=>{}};
   const abort=()=>{job.consumers.delete(consumer);consumer.detach();reject(new IOSLyricsError('LYRICS_CANCELLED'));};
   consumer.detach=()=>options.signal?.removeEventListener('abort',abort);
   job.consumers.add(consumer);options.signal?.addEventListener('abort',abort,{once:true});
   if(existing)return;
   if(this.active){if(this.pending)this.finish(this.pending,null,new IOSLyricsError('LYRICS_CANCELLED'));this.pending=job;}
   else {this.active=job;void Promise.resolve().then(()=>this.run(job));}
  });
 }
 private interested(job:Job){if(!job.consumers.size)throw new IOSLyricsError('LYRICS_CANCELLED');}
 private finish(job:Job,value:LyricsResponse|null,error?:IOSLyricsError){
  for(const consumer of job.consumers){consumer.detach();if(error)consumer.reject(error);else consumer.resolve(value!);}
  job.consumers.clear();
 }
 private async remote(job:Job,path:'get'|'search',params:URLSearchParams):Promise<unknown|null>{
  this.interested(job);
  if(this.blockedUntil>this.now())throw new IOSLyricsError('LYRICS_RATE_LIMIT');
  if(this.nextAt>this.now())await this.delay(this.nextAt-this.now());
  this.interested(job);
  const url=`https://lrclib.net/api/${path}?${params}`;
  let reply:Reply;
  try{reply=await this.transport(url);}catch{throw new IOSLyricsError('LYRICS_UNAVAILABLE');}
  finally{this.nextAt=this.now()+350;}
  if(reply.url){const actual=new URL(reply.url);if(actual.origin!=='https://lrclib.net'||actual.pathname!==`/api/${path}`)throw new IOSLyricsError('LYRICS_INVALID_RESPONSE');}
  if(reply.status===429){
   const retry=Object.entries(reply.headers).find(([key])=>key.toLowerCase()==='retry-after')?.[1];
   const seconds=retry&&/^\d+$/.test(retry)?Number(retry):retry?(Date.parse(retry)-this.now())/1000:60;
   this.blockedUntil=this.now()+Math.max(1000,Math.min(300000,Number.isFinite(seconds)?seconds*1000:60000));
   throw new IOSLyricsError('LYRICS_RATE_LIMIT');
  }
  this.interested(job);
  if(reply.status===404||path==='get'&&reply.status===400)return null;
  if(reply.status!==200)throw new IOSLyricsError('LYRICS_UNAVAILABLE');
  const serialized=typeof reply.data==='string'?reply.data:JSON.stringify(reply.data);
  if(typeof serialized!=='string'||new TextEncoder().encode(serialized).length>2_000_000)throw new IOSLyricsError('LYRICS_INVALID_RESPONSE');
  try{return JSON.parse(serialized) as unknown;}catch{throw new IOSLyricsError('LYRICS_INVALID_RESPONSE');}
 }
 private save(key:string,value:LyricsResponse){
  const bytes=new TextEncoder().encode(JSON.stringify(value)).length;
  if(bytes>1_000_000)return;
  this.cache.delete(key);this.cache.set(key,{value,bytes,expires:this.now()+(value.document?24*3600000:120000)});
  let total=[...this.cache.values()].reduce((sum,item)=>sum+item.bytes,0);
  while(this.cache.size>30||total>1_000_000){const first=this.cache.keys().next().value!;total-=this.cache.get(first)!.bytes;this.cache.delete(first);}
 }
 private async run(job:Job){
  try{
   this.interested(job);
   const track=job.track,params=new URLSearchParams({track_name:title(track.title),artist_name:artist(track.artists?.[0]?.name||track.artist.split(', ')[0])});
   let match:ReturnType<typeof matchIOSLyrics>=null;
   if(Number.isFinite(track.duration)&&track.duration>=1&&track.duration<=3600){
    const exact=new URLSearchParams(params);exact.set('duration',String(Math.round(track.duration)));
    match=matchIOSLyrics(await this.remote(job,'get',exact),track,this.now());
   }
   if(!match){
    const records=await this.remote(job,'search',params);
    if(records!==null&&!Array.isArray(records))throw new IOSLyricsError('LYRICS_INVALID_RESPONSE');
    const candidates=(Array.isArray(records)?records:[]).slice(0,50).map(value=>matchIOSLyrics(value,track,this.now())).filter((value):value is NonNullable<typeof value>=>Boolean(value)).sort((a,b)=>a.difference-b.difference||Number(b.albumMatch)-Number(a.albumMatch)||Number(!a.document.lines.length)-Number(!b.document.lines.length));
    match=candidates[0]??null;
    const next=candidates[1];
    if(match&&next&&match.difference===next.difference&&match.albumMatch===next.albumMatch&&Boolean(match.document.lines.length)===Boolean(next.document.lines.length)&&JSON.stringify([match.document.plainText,match.document.lines,match.document.instrumental])!==JSON.stringify([next.document.plainText,next.document.lines,next.document.instrumental]))match=null;
   }
   this.interested(job);
   const value:LyricsResponse=match?{status:match.document.instrumental?'instrumental':'ready',document:match.document,cacheHit:false,savedChoice:false}:missing();
   this.save(job.key,value);this.finish(job,value);
  }catch(error){this.finish(job,null,error instanceof IOSLyricsError?error:new IOSLyricsError('LYRICS_UNAVAILABLE'));}
  finally{this.active=null;const next=this.pending;this.pending=null;if(next){this.active=next;void Promise.resolve().then(()=>this.run(next));}}
 }
}

export const iosLyrics=new IOSLyricsClient(async url=>CapacitorHttp.get({url,responseType:'text',connectTimeout:4000,readTimeout:8000,disableRedirects:true,headers:{Accept:'application/json','User-Agent':'RITVIO iOS lyrics client (https://github.com/salvo13200/RITVIO)'}}));
