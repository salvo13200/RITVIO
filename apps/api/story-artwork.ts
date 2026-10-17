import type {FastifyInstance} from 'fastify';
import type {Store} from './store';
import {catalogArtwork} from './catalog-normalize';
import {AppError} from './errors';

const byteLimit=3_000_000;
function imageType(bytes:Buffer){
  if(bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){const w=bytes.readUInt32BE(16),h=bytes.readUInt32BE(20);return w>0&&h>0&&w<=8192&&h<=8192&&w*h<=16_000_000?'image/png':null;}
  if(bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
  if(bytes.length>=12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return 'image/webp';
  return null;
}
/** Only artwork of known tracks, never a user-supplied fetch URL. Redirects are refused. */
export function registerStoryArtwork(app:FastifyInstance,store:Store,fetchImage:typeof fetch=fetch){
  const cache=new Map<string,{bytes:Buffer;type:string;expires:number}>(),flights=new Map<string,Promise<{bytes:Buffer;type:string;expires:number}>>();
  const controllers=new Set<AbortController>();
  app.addHook('preClose',async()=>{for(const controller of controllers)controller.abort();});
  app.get<{Params:{id:string}}>('/v1/media/:id/artwork',async(request,reply)=>{
    const track=store.getTrack(request.params.id);
    if(!track)throw new AppError(404,'MEDIA_NOT_FOUND','Apri di nuovo il brano e riprova.');
    const url=catalogArtwork(track.thumbnail);
    if(!url)throw new AppError(404,'ARTWORK_MISSING','La copertina del brano non è disponibile.');
    let value=cache.get(url);
    if(!value||value.expires<Date.now()){
      let flight=flights.get(url);
      if(!flight){
        if(flights.size>=4)throw new AppError(503,'ARTWORK_BUSY','Sto preparando altre copertine. Riprova fra qualche secondo.');
        const controller=new AbortController();controllers.add(controller);
        flight=(async()=>{
          try{
            const response=await fetchImage(url,{redirect:'error',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(7000)]),headers:{Accept:'image/jpeg,image/png,image/webp'}});
            if(!response.ok||!response.body)throw Error('Unavailable');
            if(Number(response.headers.get('content-length'))>byteLimit)throw Error('Too large');
            const reader=response.body.getReader(),chunks:Buffer[]=[];let size=0;
            try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>byteLimit)throw Error('Too large');chunks.push(Buffer.from(value));}}
            finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
            const bytes=Buffer.concat(chunks),type=imageType(bytes);
            if(!type)throw Error('Invalid image');
            const result={bytes,type,expires:Date.now()+86400000};cache.delete(url);cache.set(url,result);
            while(cache.size>12)cache.delete(cache.keys().next().value!);
            return result;
          }catch{throw new AppError(502,'ARTWORK_UNAVAILABLE','La copertina non è disponibile. Riprova oppure usa la card senza copertina.');}
          finally{controllers.delete(controller);flights.delete(url);}
        })();flights.set(url,flight);
      }value=await flight;
    }
    return reply.type(value.type).header('Cache-Control','private, max-age=86400').header('X-Content-Type-Options','nosniff').send(value.bytes);
  });
}
