import type {PersonalLibrary,PersonalPlaylist,PlaylistSummary,Profile,Track,FollowedResource} from '../domain/index';
import type {PlaylistFile} from '../domain/sharing';
export type Transport=<T>(path:string,options?:RequestInit)=>Promise<T>;
export function createLibraryClient(request:Transport){
  const json=(method:string,value:unknown):RequestInit=>({method,body:JSON.stringify(value)});
  const edit=(playlist:PlaylistSummary,options:RequestInit):RequestInit=>({...options,headers:{'If-Match':`"${playlist.revision}"`}});
  const url=(playlist:PlaylistSummary)=>`/me/playlists/${encodeURIComponent(playlist.id)}`;
  return {
    snapshot:()=>request<PersonalLibrary>('/me/library'),
    startImport:(url:string,fresh=false)=>request<import('../domain/playlist-import').RemotePlaylistJob>('/me/playlist-imports',json('POST',{url,fresh})),
    importStatus:(id:string,signal?:AbortSignal)=>request<import('../domain/playlist-import').RemotePlaylistJob>('/me/playlist-imports/'+encodeURIComponent(id),{signal}),
    cancelImport:(id:string)=>request<import('../domain/playlist-import').RemotePlaylistJob>('/me/playlist-imports/'+encodeURIComponent(id),{method:'DELETE'}),
    commitImport:(id:string,input:import('../domain/playlist-import').RemotePlaylistCommit)=>request<import('../domain/playlist-import').RemotePlaylistResult>('/me/playlist-imports/'+encodeURIComponent(id)+'/commit',json('POST',input)),
    export:(id:string)=>request<PlaylistFile>(`/me/playlists/${encodeURIComponent(id)}/export`),
    import:(file:PlaylistFile)=>request<PersonalPlaylist>('/me/playlists/import',json('POST',file)),
    profile:(displayName:string,avatar:string|null)=>request<Profile>('/me/profile',json('PATCH',{displayName,avatar})),
    like:(track:Track,liked:boolean)=>request(`/me/likes/${encodeURIComponent(track.id)}`,json('PUT',{liked})),
    record:(track:Track,eventId:string)=>request('/me/history',json('POST',{mediaId:track.id,eventId})),
    clearHistory:()=>request('/me/history',{method:'DELETE'}),
    follow:(track:Track,kind:'artist'|'album',resourceId:string,followed:boolean)=>request('/me/follows',json('PUT',{mediaId:track.id,kind,resourceId,followed})),
    unfollow:(resource:FollowedResource)=>request(`/me/follows/${resource.kind}/${encodeURIComponent(resource.id)}`,{method:'DELETE'}),
    fromQueue:(name:string,mediaIds:string[])=>request<PersonalPlaylist>('/me/playlists/from-queue',json('POST',{name,mediaIds})),
    create:(name:string)=>request<PersonalPlaylist>('/me/playlists',json('POST',{name})),
    playlist:(id:string)=>request<PersonalPlaylist>(`/me/playlists/${encodeURIComponent(id)}`),
    update:(playlist:PersonalPlaylist,patch:Pick<PersonalPlaylist,'name'|'description'|'visibility'|'cover'>)=>request<PersonalPlaylist>(url(playlist),edit(playlist,json('PATCH',patch))),
    delete:(playlist:PersonalPlaylist)=>request(url(playlist),edit(playlist,{method:'DELETE'})),
    add:(playlist:PlaylistSummary,track:Track)=>request<PersonalPlaylist>(`${url(playlist)}/items`,edit(playlist,json('POST',{mediaId:track.id}))),
    remove:(playlist:PersonalPlaylist,itemId:string)=>request<PersonalPlaylist>(`${url(playlist)}/items/${encodeURIComponent(itemId)}`,edit(playlist,{method:'DELETE'})),
    reorder:(playlist:PersonalPlaylist,itemIds:string[])=>request<PersonalPlaylist>(`${url(playlist)}/order`,edit(playlist,json('PUT',{itemIds}))),
    removeMany:(playlist:PersonalPlaylist,itemIds:string[])=>request<PersonalPlaylist>(`${url(playlist)}/remove-items`,edit(playlist,json('POST',{itemIds}))),
    transfer:(playlist:PersonalPlaylist,input:import('../domain/playlist-tools').PlaylistTransfer)=>request<import('../domain/playlist-tools').PlaylistTransferResult>(`${url(playlist)}/transfer`,edit(playlist,json('POST',input))),
    undo:(playlist:PersonalPlaylist)=>request<PersonalPlaylist>(`${url(playlist)}/undo`,edit(playlist,{method:'POST'})),
    duplicate:(playlist:PersonalPlaylist,name:string)=>request<PersonalPlaylist>(`${url(playlist)}/duplicate`,edit(playlist,json('POST',{name}))),
  };
}
