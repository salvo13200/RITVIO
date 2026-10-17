import {randomBytes} from 'node:crypto';
import {Readable} from 'node:stream';
import type {FastifyInstance} from 'fastify';
import type {Playback} from '../../packages/domain/index';
import {allowedStreamUrl} from './resolver';
import {AppError} from './errors';

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
    for(const pending of active)if(pending.signal.aborted)active.delete(pending);
    if(active.size>=16)throw new AppError(429,'STREAM_BUSY','Ci sono troppi flussi audio aperti. Attendi un momento e riprova.');
    const controller=new AbortController();active.add(controller);
    const cancel=()=>controller.abort();reply.raw.once('close',cancel);
    const timer=setTimeout(cancel,Math.min(15000,ticket.expires-now()));timer.unref();
    let lifetime:ReturnType<typeof setTimeout>|undefined;
    try{
      let url=ticket.url,response:Response|undefined;
      for(let redirects=0;redirects<=3;redirects++){
        if(!allowedStreamUrl(url))throw new AppError(502,'INVALID_STREAM','Il servizio musicale ha restituito un flusso non valido.');
        response=await fetchStream(url,{redirect:'manual',signal:controller.signal,headers:request.headers.range?{Range:request.headers.range}:{}});
        if(![301,302,303,307,308].includes(response.status))break;
        const location=response.headers.get('location');await response.body?.cancel();
        if(!location||redirects===3)throw new AppError(502,'INVALID_STREAM','Il servizio musicale non risponde. Riprova.');
        url=new URL(location,url).href;
      }
      clearTimeout(timer);
      if(!response||![200,206,416].includes(response.status)){
        await response?.body?.cancel();throw new AppError(502,'STREAM_UNAVAILABLE','Il flusso non è disponibile. Riprendi il brano per aggiornarlo.');
      }
      const type=response.headers.get('content-type')?.split(';')[0].trim();
      if(response.status!==416&&(!response.body||!type||!['audio/mp4','audio/webm','audio/mpeg','audio/ogg','audio/wav','application/octet-stream'].includes(type))){
        await response.body?.cancel();throw new AppError(502,'INVALID_STREAM','Il servizio musicale ha restituito un flusso non valido.');
      }
      reply.code(response.status).header('Cache-Control','no-store').header('Referrer-Policy','no-referrer').header('X-Content-Type-Options','nosniff');
      for(const header of ['content-type','content-length','content-range','accept-ranges']){const value=response.headers.get(header);if(value)reply.header(header,value);}
      if(response.status===416){await response.body?.cancel();active.delete(controller);reply.raw.removeListener('close',cancel);return reply.send();}
      lifetime=setTimeout(cancel,Math.max(1,ticket.expires-now()));lifetime.unref();
      const body=Readable.fromWeb(response.body! as Parameters<typeof Readable.fromWeb>[0],{highWaterMark:64*1024});
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
  app.addHook('preClose',async()=>{for(const controller of active)controller.abort();tickets.clear();});
  return {authorized,issue};
}
