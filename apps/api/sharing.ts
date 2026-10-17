import type {FastifyInstance,FastifyRequest} from 'fastify';
import type {Store} from './store';
import {mediaId} from './store';
import type {IdentityProvider} from './identity';
import type {PlaylistFile} from '../../packages/domain/sharing';
import {playlistFileLimit} from '../../packages/domain/sharing';
import type {PersonalPlaylist,Track} from '../../packages/domain/index';
import {AppError} from './errors';
import {validateImage} from './library-routes';
const uuid={type:'string',pattern:'^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'};
const text=(maxLength:number,minLength=0)=>({type:'string',maxLength,minLength});
const object=(properties:Record<string,unknown>)=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
export const playlistFileSchema=object({
  format:{type:'string',enum:['ritvio-playlist','spotyfree-playlist']},version:{type:'integer',const:1},exportedAt:{type:'string',format:'date-time'},
  playlist:object({name:{...text(100,1),pattern:'\\S'},description:text(1000),cover:{anyOf:[{type:'null'},{type:'string',maxLength:196608,pattern:'^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$'}]},
    tracks:{type:'array',maxItems:1000,items:object({videoId:{type:'string',pattern:'^[A-Za-z0-9_-]{11}$'},title:{...text(1000,1),pattern:'\\S'},artist:{...text(1000,1),pattern:'\\S'},duration:{type:'number',minimum:0,maximum:31536000}})}}),
});
export function exportPlaylist(playlist:PersonalPlaylist):PlaylistFile{
  return {format:'ritvio-playlist',version:1,exportedAt:new Date().toISOString(),playlist:{name:playlist.name,description:playlist.description,cover:playlist.cover,
    tracks:playlist.items.map(({track})=>({videoId:track.videoId,title:track.title.trim().slice(0,1000)||'Brano YouTube',artist:track.artist.trim().slice(0,1000)||'YouTube',duration:Number.isFinite(track.duration)?Math.max(0,Math.min(31536000,track.duration)):0}))}};
}
function importedTrack(item:PlaylistFile['playlist']['tracks'][number]):Track{
  return {id:mediaId(item.videoId),videoId:item.videoId,title:item.title.trim(),artist:item.artist.trim(),duration:item.duration,thumbnail:`https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`,canonicalUrl:`https://www.youtube.com/watch?v=${item.videoId}`};
}
export function registerSharingRoutes(app:FastifyInstance,store:Store,identity:IdentityProvider){
  const owner=async(request:FastifyRequest)=>(await identity.resolve(request)).id;
  app.get<{Params:{id:string}}>('/v1/me/playlists/:id/export',{schema:{params:object({id:uuid})}},async request=>{
    const file=exportPlaylist(store.library.playlist(await owner(request),request.params.id));
    if(Buffer.byteLength(JSON.stringify(file,null,2)+'\n')>playlistFileLimit)throw new AppError(413,'PLAYLIST_FILE_LIMIT','Questa playlist è troppo grande per un file condivisibile.');
    return file;
  });
  app.post<{Body:PlaylistFile}>('/v1/me/playlists/import',{bodyLimit:playlistFileLimit,schema:{body:playlistFileSchema}},async(request,reply)=>{
    validateImage(request.body.playlist.cover);
    const result=store.library.importPlaylist(await owner(request),{...request.body.playlist,tracks:request.body.playlist.tracks.map(importedTrack)});
    return reply.code(201).send(result);
  });
}
