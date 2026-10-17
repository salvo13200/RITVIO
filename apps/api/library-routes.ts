import type {FastifyInstance,FastifyRequest} from 'fastify';
import type {Store} from './store';
import type {IdentityProvider} from './identity';
import {AppError} from './errors';
const uuid={type:'string',pattern:'^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'};
const name={type:'string',minLength:1,maxLength:100,pattern:'\\S'};
const image={anyOf:[{type:'null'},{type:'string',maxLength:196608,pattern:'^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$'}]};
const body=(properties:Record<string,unknown>,required=Object.keys(properties))=>({type:'object',additionalProperties:false,required,properties});
export function validateImage(value:string|null){
  if(value===null)return;
  const [,mime,data]=value.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/)!;
  const buffer=Buffer.from(data,'base64');
  const valid=mime==='image/png'?buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):mime==='image/jpeg'?buffer[0]===255&&buffer[1]===216&&buffer[2]===255:buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP';
  if(!valid)throw new AppError(400,'INVALID_IMAGE','Scegli una copertina PNG, JPEG o WebP valida.');
}
export function registerLibraryRoutes(app:FastifyInstance,store:Store,identity:IdentityProvider){
  const library=store.library;
  const owner=async(request:FastifyRequest)=>(await identity.resolve(request)).id;
  const revision=(request:FastifyRequest)=>{const header=request.headers['if-match'];if(!header)throw new AppError(428,'REVISION_REQUIRED','Ricarica la playlist prima di modificarla.');const match=typeof header==='string'&&header.match(/^"([1-9][0-9]{0,8})"$/);if(!match)throw new AppError(400,'INVALID_REVISION','Revisione della playlist non valida.');return Number(match[1]);};
  const track=(id:string)=>{const found=store.getTrack(id);if(!found)throw new AppError(404,'MEDIA_NOT_FOUND','Cerca nuovamente il brano prima di salvarlo.');return found;};
  app.get('/v1/me/library',async request=>library.snapshot(await owner(request)));
  app.patch<{Body:{displayName:string;avatar:string|null}}>('/v1/me/profile',{bodyLimit:210000,schema:{body:body({displayName:name,avatar:image})}},async request=>{validateImage(request.body.avatar);return library.updateProfile(await owner(request),request.body.displayName.trim(),request.body.avatar);});
  app.put<{Params:{mediaId:string};Body:{liked:boolean}}>('/v1/me/likes/:mediaId',{schema:{params:body({mediaId:uuid}),body:body({liked:{type:'boolean'}})}},async request=>{library.like(await owner(request),track(request.params.mediaId),request.body.liked);return {ok:true};});
  app.post<{Body:{mediaId:string;eventId:string}}>('/v1/me/history',{schema:{body:body({mediaId:uuid,eventId:uuid})}},async request=>{const principal=await owner(request);const settings=store.db.prepare('SELECT private FROM listening_settings WHERE owner=?').get(principal);if(!settings?.private)library.record(principal,track(request.body.mediaId),request.body.eventId);return {ok:true};});
  app.delete('/v1/me/history',async request=>{library.clearHistory(await owner(request));return {ok:true};});
  app.put<{Body:{kind:'artist'|'album';resourceId:string;mediaId:string;followed:boolean}}>('/v1/me/follows',{schema:{body:body({kind:{type:'string',enum:['artist','album']},resourceId:{type:'string',pattern:'^[A-Za-z0-9_-]{1,160}$'},mediaId:uuid,followed:{type:'boolean'}})}},async request=>{
    const {kind,resourceId,mediaId,followed}=request.body;const item=track(mediaId);
    const resource=kind==='artist'?item.artists?.find(a=>a.id===resourceId):item.album?.id===resourceId?item.album:undefined;
    if(!resource)throw new AppError(400,'RESOURCE_NOT_FOUND','Artista o album non disponibile nei metadati di questo brano.');
    library.follow(await owner(request),{...resource,kind,artwork:kind==='album'?item.thumbnail:null,url:`https://music.youtube.com/browse/${encodeURIComponent(resource.id)}`},followed);return {ok:true};
  });
  app.delete<{Params:{kind:'artist'|'album';id:string}}>('/v1/me/follows/:kind/:id',{schema:{params:body({kind:{type:'string',enum:['artist','album']},id:{type:'string',pattern:'^[A-Za-z0-9_-]{1,160}$'}})}},async request=>{library.follow(await owner(request),{id:request.params.id,kind:request.params.kind,name:'',url:'',artwork:null},false);return {ok:true};});
  app.post<{Body:{name:string}}>('/v1/me/playlists',{schema:{body:body({name})}},async(request,reply)=>reply.code(201).send(library.create(await owner(request),request.body.name.trim())));
  app.post<{Body:{name:string;mediaIds:string[]}}>('/v1/me/playlists/from-queue',{bodyLimit:50000,schema:{body:body({name,mediaIds:{type:'array',minItems:1,maxItems:1000,items:uuid}})}},async(request,reply)=>{const principal=await owner(request),tracks=request.body.mediaIds.map(track);return reply.code(201).send(library.importPlaylist(principal,{name:request.body.name.trim(),description:'',cover:null,tracks}));});
  app.get<{Params:{id:string}}>('/v1/me/playlists/:id',{schema:{params:body({id:uuid})}},async request=>library.playlist(await owner(request),request.params.id));
  app.patch<{Params:{id:string};Body:{name:string;description:string;visibility:'private'|'public';cover:string|null}}>('/v1/me/playlists/:id',{bodyLimit:215000,schema:{params:body({id:uuid}),body:body({name,description:{type:'string',maxLength:1000},visibility:{type:'string',enum:['private','public']},cover:image})}},async request=>{validateImage(request.body.cover);return library.update(await owner(request),request.params.id,revision(request),{...request.body,name:request.body.name.trim(),description:request.body.description.trim()});});
  app.delete<{Params:{id:string}}>('/v1/me/playlists/:id',{schema:{params:body({id:uuid})}},async request=>{library.delete(await owner(request),request.params.id,revision(request));return {ok:true};});
  app.post<{Params:{id:string};Body:{mediaId:string}}>('/v1/me/playlists/:id/items',{schema:{params:body({id:uuid}),body:body({mediaId:uuid})}},async request=>library.add(await owner(request),request.params.id,revision(request),track(request.body.mediaId)));
  app.delete<{Params:{id:string;itemId:string}}>('/v1/me/playlists/:id/items/:itemId',{schema:{params:body({id:uuid,itemId:uuid})}},async request=>library.remove(await owner(request),request.params.id,revision(request),request.params.itemId));
  app.put<{Params:{id:string};Body:{itemIds:string[]}}>('/v1/me/playlists/:id/order',{bodyLimit:50000,schema:{params:body({id:uuid}),body:body({itemIds:{type:'array',maxItems:1000,items:uuid,uniqueItems:true}})}},async request=>library.reorder(await owner(request),request.params.id,revision(request),request.body.itemIds));
  const selection={type:'array',minItems:1,maxItems:1000,items:uuid,uniqueItems:true};
  app.post<{Params:{id:string};Body:{itemIds:string[]}}>('/v1/me/playlists/:id/remove-items',{bodyLimit:50000,schema:{params:body({id:uuid}),body:body({itemIds:selection})}},async request=>library.removeMany(await owner(request),request.params.id,revision(request),request.body.itemIds));
  app.post<{Params:{id:string};Body:import('../../packages/domain/playlist-tools').PlaylistTransfer}>('/v1/me/playlists/:id/transfer',{bodyLimit:50000,schema:{params:body({id:uuid}),body:body({mode:{type:'string',enum:['copy','move']},itemIds:selection,targetId:uuid,targetRevision:{type:'integer',minimum:1,maximum:999999999}})}},async request=>library.transfer(await owner(request),request.params.id,revision(request),request.body));
  app.post<{Params:{id:string}}>('/v1/me/playlists/:id/undo',{schema:{params:body({id:uuid})}},async request=>library.undo(await owner(request),request.params.id,revision(request)));
  app.post<{Params:{id:string};Body:{name:string}}>('/v1/me/playlists/:id/duplicate',{schema:{params:body({id:uuid}),body:body({name})}},async(request,reply)=>reply.code(201).send(library.duplicate(await owner(request),request.params.id,revision(request),request.body.name.trim())));
}
