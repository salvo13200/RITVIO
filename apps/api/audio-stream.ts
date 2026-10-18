import {randomBytes} from 'node:crypto';
import {Readable} from 'node:stream';
import type {FastifyInstance} from 'fastify';
import type {Playback} from '../../packages/domain/index';
import {allowedStreamUrl} from './resolver';
import {AppError} from './errors';
import {AudioRangeBuffer} from './audio-range-buffer';

const audioTypes=['audio/mp4','audio/webm','audio/mpeg','audio/ogg','audio/wav','application/octet-stream'];
const warmBytes=512*1024;
function responseSpan(response:Response){
  const type=response.headers.get('content-type')?.split(';')[0].trim();
  if(!type||!audioTypes.includes(type)||!['identity',null].includes(response.headers.get('content-encoding')))return;
  const length=Number(response.headers.get('content-length'));
  if(response.status===200&&Number.isSafeInteger(length)&&length>0)return {type,start:0,end:length-1,total:length};
  const match=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range')??'');
  if(response.status!==206||!match)return;
  const [start,end,total]=match.slice(1).map(Number);
  if([start,end,total].every(Number.isSafeInteger)&&start>=0&&end>=start&&end<total&&(!response.headers.has('content-length')||length===end-start+1))return {type,start,end,total};
}

export const streamTicketPath=/^\/v1\/stream\/([a-f0-9]{64})$/;
export function validAudioRange(value:string|undefined){
  if(value===undefined)return true;
  const parts=/^bytes=(\d*)-(\d*)$/.exec(value);
  if(!parts||(!parts[1]&&!parts[2]))return false;
  const start=parts[1]?Number(parts[1]):null,end=parts[2]?Number(parts[2]):null;
  return (start===null||Number.isSafeInteger(start))&&(end===null||Number.isSafeInteger(end))&&(start===null?end!>0:end===null||end>=start);
}

// An opaque, expiring capability for HTMLAudio, which cannot add Authorization.
// Only a descriptor obtained through the authenticated playback endpoint can mint it.
export function createAudioStreams(app:FastifyInstance,fetchStream:typeof fetch=fetch,now=Date.now){
  const tickets=new Map<string,{url:string;expires:number}>();
  const active=new Set<AbortController>();
  const buffer=new AudioRangeBuffer(now);
  let warming:{url:string;controller:AbortController;done:Promise<void>}|undefined;
  let upstreamRequests=0,warmStarted=0,warmCompleted=0,warmCancelled=0,warmFailed=0;
  const stopWarm=()=>warming?.controller.abort();
  const upstream=async(initialUrl:string,range:string|undefined,signal:AbortSignal)=>{
    let url=initialUrl;
    for(let redirects=0;redirects<=3;redirects++){
      if(!allowedStreamUrl(url))throw new AppError(502,'INVALID_STREAM','Il servizio musicale ha restituito un flusso non valido.');
      upstreamRequests++;
      const response=await fetchStream(url,{redirect:'manual',signal,headers:range?{Range:range}:{}});
      if([301,302,303,307,308].includes(response.status)){
        const location=response.headers.get('location');await response.body?.cancel();
        if(!location||redirects===3)throw new AppError(502,'INVALID_STREAM','Il servizio musicale non risponde. Riprova.');
        url=new URL(location,url).href;continue;
      }
      if(![200,206,416].includes(response.status)){
        await response.body?.cancel();throw new AppError(502,'STREAM_UNAVAILABLE','Il flusso non è disponibile. Riprendi il brano per aggiornarlo.');
      }
      const type=response.headers.get('content-type')?.split(';')[0].trim();
      if(response.status!==416&&(!response.body||!type||!audioTypes.includes(type))){
        await response.body?.cancel();throw new AppError(502,'INVALID_STREAM','Il servizio musicale ha restituito un flusso non valido.');
      }
      return response;
    }
    throw new AppError(502,'INVALID_STREAM','Il servizio musicale non risponde. Riprova.');
  };
  /** One small speculative range. Failure never fails playback or retries in a loop. */
  const prepare=async(playback:Playback,signal:AbortSignal)=>{
    if(signal.aborted||!allowedStreamUrl(playback.url))return;
    const cached=buffer.take(playback.url,`bytes=0-${warmBytes-1}`);
    if(cached&&cached.end+1>=Math.min(warmBytes,cached.total))return;
    if(warming?.url===playback.url&&!warming.controller.signal.aborted)return warming.done;
    stopWarm();
    const controller=new AbortController(),abort=()=>controller.abort();
    signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
    const timeout=setTimeout(abort,5000);timeout.unref();warmStarted++;
    const job={url:playback.url,controller,done:Promise.resolve()};warming=job;
    job.done=(async()=>{
      let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
      try{
        const response=await upstream(playback.url,`bytes=0-${warmBytes-1}`,controller.signal),span=responseSpan(response);
        if(!span||response.status!==206||span.start!==0||span.end>=warmBytes){await response.body?.cancel();warmFailed++;return;}
        reader=response.body!.getReader();let offset=0;
        while(offset<=span.end){
          const {done,value}=await reader.read();if(done)break;
          if(controller.signal.aborted||offset+value.length>span.end+1)throw Error('Incomplete audio preparation');
          buffer.put(playback.url,Date.parse(playback.expiresAt),span.type,span.total,offset,value);offset+=value.length;
        }
        if(offset===span.end+1)warmCompleted++;else warmFailed++;
      }catch{if(controller.signal.aborted)warmCancelled++;else warmFailed++;}
      finally{await reader?.cancel().catch(()=>{});clearTimeout(timeout);signal.removeEventListener('abort',abort);if(warming===job)warming=undefined;}
    })();
    return job.done;
  };
  const prune=()=>{for(const [key,ticket] of tickets)if(ticket.expires<=now())tickets.delete(key);};
  const authorized=(url:string)=>{prune();return tickets.has(streamTicketPath.exec(url)?.[1]??'');};
  const issue=(playback:Playback):Playback=>{
    if(!allowedStreamUrl(playback.url))throw new AppError(502,'INVALID_STREAM','Il servizio musicale ha restituito un flusso non valido.');
    const expires=Math.min(Date.parse(playback.expiresAt),now()+30*60*1000);
    if(!Number.isFinite(expires)||expires<=now())throw new AppError(502,'EXPIRED_STREAM','Il flusso è scaduto. Riprova.');
    prune();while(tickets.size>=128)tickets.delete(tickets.keys().next().value!);
    const key=randomBytes(32).toString('hex');tickets.set(key,{url:playback.url,expires});
    return {...playback,url:`/v1/stream/${key}`,expiresAt:new Date(expires).toISOString(),capabilities:{...playback.capabilities,equalizer:true}};
  };
  app.get<{Params:{ticket:string}}>('/v1/stream/:ticket',async(request,reply)=>{
    const ticket=tickets.get(request.params.ticket);
    if(!ticket||ticket.expires<=now())throw new AppError(401,'EXPIRED_STREAM','Il flusso è scaduto. Riprendi il brano.');
    if(!validAudioRange(request.headers.range))throw new AppError(416,'INVALID_RANGE','Intervallo audio non valido.');
    // User playback/seek always takes priority over a speculative network transfer.
    stopWarm();
    const cached=request.headers.range?buffer.take(ticket.url,request.headers.range):undefined;
    if(cached){
      reply.code(206).header('Content-Type',cached.type).header('Content-Length',cached.end-cached.start+1)
        .header('Content-Range',`bytes ${cached.start}-${cached.end}/${cached.total}`).header('Accept-Ranges','bytes')
        .header('Cache-Control','no-store').header('Referrer-Policy','no-referrer').header('X-Content-Type-Options','nosniff').header('X-Ritvio-Buffer','hit');
      return reply.send(Readable.from(cached.chunks,{objectMode:false,highWaterMark:64*1024}));
    }
    for(const pending of active)if(pending.signal.aborted)active.delete(pending);
    if(active.size>=16)throw new AppError(429,'STREAM_BUSY','Ci sono troppi flussi audio aperti. Attendi un momento e riprova.');
    const controller=new AbortController();active.add(controller);
    const cancel=()=>controller.abort();reply.raw.once('close',cancel);
    const timer=setTimeout(cancel,Math.min(15000,ticket.expires-now()));timer.unref();
    let lifetime:ReturnType<typeof setTimeout>|undefined;
    try{
      const response=await upstream(ticket.url,request.headers.range,controller.signal);
      clearTimeout(timer);
      reply.code(response.status).header('Cache-Control','no-store').header('Referrer-Policy','no-referrer').header('X-Content-Type-Options','nosniff');
      for(const header of ['content-type','content-length','content-range','accept-ranges']){const value=response.headers.get(header);if(value)reply.header(header,value);}
      if(response.status===416){await response.body?.cancel();active.delete(controller);reply.raw.removeListener('close',cancel);return reply.send();}
      lifetime=setTimeout(cancel,Math.max(1,ticket.expires-now()));lifetime.unref();
      const input=Readable.fromWeb(response.body! as Parameters<typeof Readable.fromWeb>[0],{highWaterMark:64*1024}),span=responseSpan(response);
      const body=span?Readable.from((async function*(){
        let position=span.start;
        for await(const chunk of input){
          if(position+chunk.length>span.end+1)throw Error('Invalid audio range length');
          if(!controller.signal.aborted)buffer.put(ticket.url,ticket.expires,span.type,span.total,position,chunk);
          position+=chunk.length;yield chunk;
        }
        if(position!==span.end+1)throw Error('Incomplete audio range');
      })(),{objectMode:false,highWaterMark:64*1024}):input;
      const cleanup=()=>{clearTimeout(lifetime);active.delete(controller);reply.raw.removeListener('close',cancel);};
      body.once('close',cleanup);body.once('error',cancel);
      reply.raw.once('close',()=>{body.destroy();cleanup();});
      return reply.send(body);
    }catch(error){
      active.delete(controller);reply.raw.removeListener('close',cancel);
      if(error instanceof AppError)throw error;
      throw new AppError(502,'STREAM_UNAVAILABLE','Il servizio musicale non risponde. Riprendi il brano o riprova più tardi.');
    }finally{clearTimeout(timer);}
  });
  app.addHook('preClose',async()=>{stopWarm();for(const controller of active)controller.abort();tickets.clear();buffer.clear();});
  return {authorized,issue,prepare,diagnostics:()=>({...buffer.diagnostics(),upstreamRequests,warmStarted,warmCompleted,warmCancelled,warmFailed,warming:!!warming})};
}
