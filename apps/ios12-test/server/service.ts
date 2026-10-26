import Fastify from 'fastify';
import {randomBytes,randomInt,timingSafeEqual} from 'node:crypto';
import {isIP} from 'node:net';
import {AppError} from '../../api/errors';
import {allowedStreamUrl} from '../../api/resolver';
import type {NativeTrack} from '../../../packages/domain/mobile';

export function privateAddress(value:string){
 const address=value.replace(/^::ffff:/,'');if(address==='::1')return true;
 if(isIP(address)!==4)return false;const [a,b]=address.split('.').map(Number);
 return a===10||a===127||a===192&&b===168||a===172&&b>=16&&b<=31;
}
export function descriptor(info:any,id:string,now=Date.now()){
 if(!info||info.id!==id||!allowedStreamUrl(info.url)||info.vcodec!=='none'||info.is_live||info.ext!=='m4a'||!/^mp4a|^aac/.test(info.acodec??''))throw new AppError(502,'UNSUPPORTED_STREAM','No compatible AAC stream.');
 const raw=Number(new URL(info.url).searchParams.get('expire'))*1000;
 const expires=Math.min(Number.isFinite(raw)&&raw>now?raw:now+300000,now+1800000)/1000;
 const headers:Record<string,string>={};for(const [key,value] of Object.entries(info.http_headers??{})){
  if(['user-agent','referer','origin','accept','accept-language'].includes(key.toLowerCase())&&typeof value==='string'&&value.length<=2048&&!/[\r\n]/.test(value))headers[key]=value;
 }
 return {url:info.url,headers,expires,container:'m4a',codec:info.acodec,protocol:'https'};
}
export function publicTrack(track:any):NativeTrack{
 if(!track||!/^[\w-]{11}$/.test(track.videoId)||typeof track.title!=='string'||!track.title.trim()||typeof track.artist!=='string')throw new AppError(502,'CATALOG_INVALID','Invalid track metadata.');
 const resource=(x:any)=>x&&typeof x.id==='string'&&typeof x.name==='string'?{id:x.id.slice(0,256),name:x.name.slice(0,256)}:undefined;
 return {videoId:track.videoId,title:track.title.slice(0,300),artist:track.artist.slice(0,300),thumbnail:`https://i.ytimg.com/vi/${track.videoId}/hqdefault.jpg`,duration:Math.max(0,Math.min(86400,Number(track.duration)||0)),artists:(track.artists??[]).slice(0,20).map(resource).filter(Boolean),...(resource(track.album)?{album:resource(track.album)}:{})};
}
type Backend={search(query:string):Promise<{items:any[]}>;resolve(id:string,fresh:boolean,signal:AbortSignal):Promise<any>;close():Promise<void>};
const equal=(a:string,b:string)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
export async function createPCTestService(backend:Backend,options:{pin?:string;hosts:string[];now?:()=>number}={hosts:['127.0.0.1']}){
 const now=options.now??Date.now,pin=options.pin??String(randomInt(100000,1000000)),created=now();
 if(!/^\d{6}$/.test(pin)||!options.hosts.length||options.hosts.some(x=>!privateAddress(x)))throw Error('Private IPv4 hosts and six-digit PIN required');
 let token='',paired=false,active=0;const rates=new Map<string,{time:number;count:number}>();
 const app=Fastify({logger:false,bodyLimit:4096,forceCloseConnections:true,requestIdHeader:false,ajv:{customOptions:{removeAdditional:false}}});
 app.addHook('onRequest',async(request)=>{
  const host=request.headers.host?.replace(/:\d+$/,'');
  if(!host||!options.hosts.includes(host)||!privateAddress(request.ip)||request.headers.origin)throw new AppError(403,'LOCAL_ONLY','Private native client required.');
  const pairing=request.url==='/v1/pair',setup=request.url==='/setup';
  if(setup){if(!/^127\./.test(request.ip)&&request.ip!=='::1'&&!request.ip.startsWith('::ffff:127.'))throw new AppError(403,'LOCAL_ONLY','Open setup on the PC.');return;}
  for(const [key,value] of rates)if(now()-value.time>=60000)rates.delete(key);
  const key=pairing?'pair':request.ip;if(!rates.has(key)&&rates.size>=128)throw new AppError(429,'RATE_LIMITED','Wait and retry.');
  const rate=rates.get(key)??{time:now(),count:0};rates.set(key,rate);
  if(++rate.count>(pairing?8:90))throw new AppError(429,'RATE_LIMITED','Wait one minute and retry.');
  if(!pairing&&!equal(request.headers.authorization??'',`Bearer ${token}`)||!pairing&&!paired)throw new AppError(401,'PC_PAIRING_REQUIRED','Connect to the PC again.');
 });
 app.addHook('onSend',async(_request,reply)=>{reply.header('Cache-Control','no-store');reply.header('X-Content-Type-Options','nosniff');reply.header('Referrer-Policy','no-referrer');});
 app.setErrorHandler((error,_request,reply)=>{const known=error instanceof AppError;reply.code(known?error.status:(error as any).validation?400:500).send({error:{code:known?error.code:'PC_REQUEST_FAILED',message:known?error.message:'The PC request could not complete.'}});});
 const body=(properties:Record<string,unknown>,required=Object.keys(properties))=>({body:{type:'object',additionalProperties:false,required,properties}});
 app.post<{Body:{pin:string}}>('/v1/pair',{schema:body({pin:{type:'string',pattern:'^[0-9]{6}$'}})},async(request)=>{
  if(paired||now()-created>15*60000||!equal(request.body.pin,pin))throw new AppError(401,'PAIRING_FAILED','Incorrect or expired code. Restart the PC helper for a new code.');
  paired=true;token=randomBytes(32).toString('hex');return {token,protocol:1,mode:'ios12-pc-test'};
 });
 app.get('/v1/status',async()=>({protocol:1,mode:'ios12-pc-test',ready:true}));
 app.get('/setup',async(_request,reply)=>reply.type('text/html').header('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'").send(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RITVIO PC test</title><style>body{background:#101117;color:#f6f3fb;font:18px system-ui;max-width:650px;margin:60px auto;padding:24px;line-height:1.6}h1{line-height:1.15}strong,code{color:#c8a6f5}code{font-size:28px;letter-spacing:4px}li{margin:12px 0}</style><h1>Connect your iPhone</h1><p>RITVIO · temporary iOS 12 test</p><ol><li>Keep this PC and the iPhone on the same private network.</li><li>In RITVIO PC Test enter the PC address: <strong>${options.hosts.filter(x=>!x.startsWith('127.')).join(' or ')||'127.0.0.1'}</strong>.</li><li>Port: <strong>${app.server.address()&&typeof app.server.address()==='object'?(app.server.address() as any).port:59212}</strong></li><li>Pairing code: <code>${paired?'PAIRED':pin}</code></li></ol><p>${paired?'The code has been consumed. Restart the helper to pair again.':'This code expires after 15 minutes and can be used once.'}</p><p>Keep the helper running. Search and stream resolution run here; audio plays on the iPhone. This does not verify the embedded iOS resolver.</p></html>`));
 async function bounded<T>(run:()=>Promise<T>){if(active>=3)throw new AppError(429,'BUSY','The PC is busy. Try again shortly.');active++;try{return await run();}finally{active--;}}
 app.post<{Body:{query:string}}>('/v1/search',{schema:body({query:{type:'string',minLength:3,maxLength:200}})},request=>bounded(async()=>({items:(await backend.search(request.body.query)).items.slice(0,20).map(publicTrack),cached:false})));
 app.post<{Body:{videoId:string;refresh?:boolean}}>('/v1/resolve',{schema:body({videoId:{type:'string',pattern:'^[A-Za-z0-9_-]{11}$'},refresh:{type:'boolean'}},['videoId'])},async(request,reply)=>{
  const controller=new AbortController();const abort=()=>{if(!reply.raw.writableEnded)controller.abort();};reply.raw.once('close',abort);
  try{return await bounded(async()=>descriptor(await backend.resolve(request.body.videoId,request.body.refresh===true,controller.signal),request.body.videoId));}finally{reply.raw.removeListener('close',abort);}
 });
 app.addHook('preClose',async()=>backend.close());return {app};
}
