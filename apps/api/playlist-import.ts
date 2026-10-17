import {randomUUID} from 'node:crypto';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import type {Store} from './store';
import type {IdentityProvider} from './identity';
import type {ContentResolver} from './resolver';
import {AppError} from './errors';
import {playlistLink,type RemotePlaylistJob,type RemotePlaylistPreview,type RemotePlaylistCommit} from '../../packages/domain/playlist-import';
type Job={owner:string;expires:number;controller:AbortController;view:RemotePlaylistJob;work?:Promise<void>;commitKey?:string};
const uuid={type:'string',pattern:'^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'};
const object=(properties:Record<string,unknown>)=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
const nullable=(type:unknown)=>({anyOf:[type,{type:'null'}]});
export function registerPlaylistImport(app:FastifyInstance,store:Store,resolver:ContentResolver,identity:IdentityProvider){
  const jobs=new Map<string,Job>();
  const principal=async(request:FastifyRequest)=>(await identity.resolve(request)).id;
  const prune=()=>{for(const [id,job] of jobs)if(job.expires<Date.now()){job.controller.abort();jobs.delete(id);}};
  const get=(owner:string,id:string)=>{prune();const job=jobs.get(id);if(!job||job.owner!==owner)throw new AppError(404,'IMPORT_NOT_FOUND','L’anteprima è scaduta o non è disponibile. Leggi di nuovo il link.');return job;};
  app.post<{Body:{url:string;fresh:boolean}}>('/v1/me/playlist-imports',{schema:{body:object({url:{type:'string',minLength:1,maxLength:2048},fresh:{type:'boolean'}})}},async(request,reply)=>{
    const owner=await principal(request);let link;try{link=playlistLink(request.body.url);}catch(error){throw new AppError(400,'INVALID_PLAYLIST_LINK',(error as Error).message);}
    prune();if(jobs.size>=20||[...jobs.values()].filter(j=>j.view.state==='loading').length>=2)throw new AppError(429,'IMPORT_BUSY','Sono già in corso altre importazioni. Annullale oppure attendi.');
    if(!resolver.playlistPreview)throw new AppError(503,'IMPORT_UNAVAILABLE','Il resolver installato non supporta le playlist.');
    const id=randomUUID(),controller=new AbortController(),view:RemotePlaylistJob={id,state:'loading',phase:'youtube-music',preview:null,error:null,result:null};
    const job:Job={owner,expires:Date.now()+15*60000,controller,view};jobs.set(id,job);
    const key='remote-playlist:'+link.id;
    const cached=store.cached(key),snapshot=cached?.data as unknown as RemotePlaylistPreview|undefined;
    if(snapshot&&cached!.expires>Date.now()&&!request.body.fresh){view.preview={...snapshot,cache:'cached'};view.state='ready';view.phase='ready';}
    else job.work=(async()=>{
      try{
        const preview=await resolver.playlistPreview!(link.id,controller.signal,phase=>{if(view.state==='loading')view.phase=phase;});
        if(controller.signal.aborted||view.state!=='loading')return;
        view.preview=preview;store.cache(key,preview,6*3600000);
        store.db.prepare("DELETE FROM search_cache WHERE key LIKE 'remote-playlist:%' AND key NOT IN (SELECT key FROM search_cache WHERE key LIKE 'remote-playlist:%' ORDER BY fetched DESC LIMIT 20)").run();
        view.state='ready';view.phase='ready';
      }catch(error){
        if(controller.signal.aborted||view.state!=='loading')return;
        if(snapshot&&error instanceof AppError&&error.status>=500&&error.code!=='TRACK_UNAVAILABLE'){
          view.preview={...snapshot,cache:'stale'};view.state='ready';view.phase='ready';
        }else{view.state='failed';view.error=error instanceof AppError?error.message:'La playlist non è accessibile. Controlla il link e riprova.';}
      }
    })();
    return reply.code(202).send(view);
  });
  app.get<{Params:{id:string}}>('/v1/me/playlist-imports/:id',{schema:{params:object({id:uuid})}},async request=>get(await principal(request),request.params.id).view);
  app.delete<{Params:{id:string}}>('/v1/me/playlist-imports/:id',{schema:{params:object({id:uuid})}},async request=>{
    const job=get(await principal(request),request.params.id);if(job.view.state!=='imported'){job.controller.abort();job.view.state='cancelled';job.view.preview=null;job.view.error=null;}jobs.delete(request.params.id);return job.view;
  });
  app.post<{Params:{id:string};Body:RemotePlaylistCommit}>('/v1/me/playlist-imports/:id/commit',{bodyLimit:15000,schema:{params:object({id:uuid}),body:object({entryNumbers:{type:'array',minItems:1,maxItems:1000,uniqueItems:true,items:{type:'integer',minimum:1,maximum:1000}},skipDuplicates:{type:'boolean'},name:{type:'string',maxLength:100},targetId:nullable(uuid),targetRevision:nullable({type:'integer',minimum:1,maximum:999999999})})}},async(request,reply)=>{
    const owner=await principal(request),job=get(owner,request.params.id),input=request.body,key=JSON.stringify(input);
    if(job.view.state==='imported'){if(job.commitKey!==key)throw new AppError(409,'IMPORT_ALREADY_SAVED','Questa anteprima è già stata salvata. Apri la playlist o avvia una nuova importazione.');return job.view.result;}
    if(job.view.state!=='ready'||!job.view.preview)throw new AppError(409,'IMPORT_NOT_READY','Attendi l’anteprima oppure leggi di nuovo il link.');
    if(input.targetId===null?!input.name.trim()||input.targetRevision!==null:input.targetRevision===null)throw new AppError(400,'INVALID_DESTINATION','Scegli una destinazione valida e un nome per la nuova playlist.');
    const preview=job.view.preview,chosen=new Set(input.entryNumbers),entries=preview.entries.filter(e=>chosen.has(e.number));
    if(entries.length!==input.entryNumbers.length||entries.some(e=>!e.track))throw new AppError(400,'INVALID_SELECTION','La selezione contiene elementi indisponibili. Controlla l’anteprima.');
    const outcome=store.library.importRemote(owner,entries.map(e=>e.track!),{...input,description:preview.description});
    job.view.result={...outcome,unavailable:preview.entries.filter(e=>!e.track).length,excluded:preview.entries.filter(e=>e.track).length-entries.length,partial:preview.partial};
    job.view.state='imported';job.commitKey=key;
    return reply.code(201).send(job.view.result);
  });
  return {close:async()=>{for(const job of jobs.values())job.controller.abort();await Promise.allSettled([...jobs.values()].map(j=>j.work));jobs.clear();}};
}
