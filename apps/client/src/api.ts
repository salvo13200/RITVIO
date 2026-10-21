import {t,noticeText} from './i18n';
import type {UpdateBridge} from './updates';
import type {MiniBridge} from '../../../packages/domain/mini';
import type {LanguageBridge} from '../../../packages/i18n/bridge';
import type {Situation, SituationKey,SituationPlaylist,SituationTracks,SituationResult} from '../../../packages/domain/situations';
import type {RadioCandidates} from '../../../packages/domain/radio';
import type { ApiConfiguration, Track, SearchResponse, Playback, RuntimeStatus, FollowedResource } from '../../../packages/domain/index';
import {createLibraryClient} from '../../../packages/api-client/index';
import type {LyricsResponse,LyricsCandidate,LyricsFormat} from '../../../packages/domain/lyrics';
import type {CatalogKind,CatalogDetail,CatalogSearch,CatalogResult,ArtistReleases} from '../../../packages/domain/catalog';
import type {MetadataKind,MetadataSnapshot} from '../../../packages/domain/metadata';
import type {ActivityCheckpoint,ActivitySettings,ActivitySnapshot} from '../../../packages/domain/activity';
import type {TasteSnapshot,TasteSettings,MixRequest,TasteMix,TasteFeedback} from '../../../packages/domain/taste';
import type {HomeIndex,HomeDetail,HomeResult,HomeCollectionId} from '../../../packages/domain/home';
declare global {
  interface Window {
    ritvio?: MiniBridge & Partial<UpdateBridge> & Partial<LanguageBridge> & { supportOpen?:(url:string)=>Promise<void>;supportCopy?:(text:string)=>Promise<void>;configuration: () => Promise<ApiConfiguration>; onMediaKey: (callback: (key: string) => void) => () => void; openYouTube: (videoId: string) => Promise<void>; openLyricsSource:(id:number)=>Promise<void>; openMetadataSource:(kind:MetadataKind,id:number)=>Promise<void>; readPlayer: () => Promise<string|null>; writePlayer: (value: string) => Promise<void>; removePlayer: () => Promise<void>;copyTrackLink:(track:{videoId:string;title?:string;artist?:string},withText?:boolean)=>Promise<void>;exportPlaylist:(id:string)=>Promise<{saved:boolean}>;exportStory:(bytes:Uint8Array,title:string)=>Promise<{saved:boolean}> };
    __RITVIO_TEST_CONFIG__?: ApiConfiguration;
  }
}
export class ApiError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
let configuration: Promise<ApiConfiguration> | undefined;
async function config() {
  configuration ??= window.ritvio ? window.ritvio.configuration() : window.__RITVIO_TEST_CONFIG__ ? Promise.resolve(window.__RITVIO_TEST_CONFIG__) : Promise.reject(new ApiError('DESKTOP_REQUIRED',t("api.avvia.ritvio.con.il.comando.dev.o.start")));
  return configuration;
}
async function request<T>(pathname: string, options: RequestInit = {}): Promise<T> {
  const {baseUrl,token} = await config();
  let response: Response;
  try { response=await fetch(`${baseUrl}/v1${pathname}`,{...options,headers:{Authorization:`Bearer ${token}`,...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}}); }
  catch(error) { if (error instanceof DOMException && error.name==='AbortError') throw error; throw new ApiError('NETWORK_ERROR',t("api.il.servizio.locale.non.risponde.riavvia.ritvio")); }
  const data=await response.json();
  if (!response.ok) throw new ApiError(data.error?.code ?? 'UNKNOWN',noticeText(data.error?.message ?? t("api.operazione.non.riuscita")));
  return data;
}
function track(media: any): Track {
  return {id:media.id,videoId:media.externalId,title:media.title,artist:media.creatorName || 'YouTube',thumbnail:media.artworkUrl,duration:media.durationSeconds || 0,canonicalUrl:media.canonicalUrl,artists:media.artists,album:media.album};
}
export const api = {
  playbackDiagnostics:()=>request<Record<string,unknown>>('/playback/diagnostics'),
  situations:{index:(signal?:AbortSignal)=>request<SituationResult<Situation[]>>('/situations',{signal}),playlists:(id:SituationKey,signal?:AbortSignal)=>request<SituationResult<SituationPlaylist[]>>(`/situations/${id}`,{signal}),tracks:(id:SituationKey,playlistId:string,signal?:AbortSignal)=>request<SituationResult<SituationTracks>>(`/situations/${id}/playlists/${playlistId}`,{signal})},
  home:{
    get:(signal?:AbortSignal)=>request<HomeResult<HomeIndex>>('/home',{signal}),
    refresh:(signal?:AbortSignal)=>request<HomeResult<HomeIndex>>('/home/refresh',{method:'POST',signal}),
    collection:(id:HomeCollectionId,signal?:AbortSignal)=>request<HomeResult<HomeDetail>>(`/home/collections/${id}`,{signal}),
    refreshCollection:(id:HomeCollectionId,signal?:AbortSignal)=>request<HomeResult<HomeDetail>>(`/home/collections/${id}/refresh`,{method:'POST',signal}),
  },
  artwork:async(id:string,signal?:AbortSignal)=>{
    const {baseUrl,token}=await config();
    const response=await fetch(`${baseUrl}/v1/media/${encodeURIComponent(id)}/artwork`,{signal,headers:{Authorization:`Bearer ${token}`}});
    if(!response.ok){const data=await response.json();throw new ApiError(data.error?.code??'ARTWORK_UNAVAILABLE',data.error?.message??t('story.artworkMissing'));}
    return response.blob();
  },
  taste:{
    get:(signal?:AbortSignal)=>request<TasteSnapshot>('/me/taste',{signal}),
    settings:(data:Omit<TasteSettings,'resetAt'>)=>request<TasteSettings>('/me/taste/settings',{method:'PUT',body:JSON.stringify(data)}),
    mix:(data:MixRequest,signal?:AbortSignal)=>request<TasteMix>('/me/taste/mix',{method:'POST',body:JSON.stringify(data),signal}),
    discover:()=>request<{added:number;failed:number}>('/me/taste/discover',{method:'POST'}),
    feedback:(id:string,value:TasteFeedback)=>request('/me/taste/feedback/'+encodeURIComponent(id),{method:'PUT',body:JSON.stringify({value})}),
    reset:()=>request<TasteSettings>('/me/taste',{method:'DELETE'}),
  },
  metadata:{
    get:(kind:MetadataKind,id:string,signal?:AbortSignal)=>request<MetadataSnapshot>(`/me/metadata/${kind}/${encodeURIComponent(id)}`,{signal}),
    search:(kind:MetadataKind,id:string,query:string,signal?:AbortSignal)=>request<MetadataSnapshot>(`/me/metadata/${kind}/${encodeURIComponent(id)}/search`,{method:'POST',body:JSON.stringify({query}),signal}),
    select:(kind:MetadataKind,id:string,providerId:number,signal?:AbortSignal)=>request<MetadataSnapshot>(`/me/metadata/${kind}/${encodeURIComponent(id)}/selection`,{method:'PUT',body:JSON.stringify({providerId}),signal}),
    genres:(kind:MetadataKind,id:string,genres:string[],signal?:AbortSignal)=>request<MetadataSnapshot>(`/me/metadata/${kind}/${encodeURIComponent(id)}/genres`,{method:'PUT',body:JSON.stringify({genres}),signal}),
    reset:(kind:MetadataKind,id:string,field:'selection'|'genres',signal?:AbortSignal)=>request<MetadataSnapshot>(`/me/metadata/${kind}/${encodeURIComponent(id)}/${field}`,{method:'DELETE',signal}),
  },
  activity:{
    get:()=>request<ActivitySnapshot>('/me/listening'),
    checkpoint:(data:ActivityCheckpoint)=>request<{accepted:boolean;epoch:number}>('/me/listening/checkpoints',{method:'POST',body:JSON.stringify(data)}),
    settings:(data:Pick<ActivitySettings,'privateMode'|'retentionDays'>)=>request<ActivitySettings>('/me/listening/settings',{method:'PUT',body:JSON.stringify(data)}),
    exclude:(id:string,excluded:boolean)=>request(`/me/listening/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({excluded})}),
    clear:()=>request<ActivitySettings>('/me/listening',{method:'DELETE'}),
  },
  catalog:{
    artistArtwork:(id:string,signal?:AbortSignal)=>request<{resource:FollowedResource|null}>(`/me/catalog/artist/${encodeURIComponent(id)}/artwork`,{method:'POST',signal}),
    radio:(videoId:string,signal?:AbortSignal)=>request<CatalogResult<RadioCandidates>>(`/catalog/radio/${encodeURIComponent(videoId)}`,{signal}),
    artistAlbums:(id:string,q:string,signal?:AbortSignal)=>request<CatalogResult<CatalogSearch>>(`/catalog/artist/${encodeURIComponent(id)}/search?${new URLSearchParams({q,kind:'album'})}`,{signal}),
    search:(q:string,kind:CatalogKind,signal?:AbortSignal)=>request<CatalogResult<CatalogSearch>>(`/catalog/search?${new URLSearchParams({q,kind})}`,{signal}),
    detail:(kind:CatalogKind,id:string,signal?:AbortSignal)=>request<CatalogResult<CatalogDetail>>(`/catalog/${kind}/${encodeURIComponent(id)}`,{signal}),
    releases:(id:string,section:'albums'|'singles',signal?:AbortSignal)=>request<CatalogResult<ArtistReleases>>(`/catalog/artist/${encodeURIComponent(id)}/releases/${section}`,{signal}),
    follow:(kind:CatalogKind,id:string,followed:boolean)=>request(`/me/catalog/${kind}/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify({followed})}),
  },
  lyrics:{
    get:(id:string,signal?:AbortSignal,fresh=false)=>request<LyricsResponse>(`/me/lyrics/${encodeURIComponent(id)}${fresh?'?fresh=true':''}`,{signal}),
    search:(id:string,title:string,artist:string,signal?:AbortSignal)=>request<{items:LyricsCandidate[]}>(`/me/lyrics/${encodeURIComponent(id)}/search?${new URLSearchParams({title,artist})}`,{signal}),
    select:(id:string,providerId:number,signal?:AbortSignal)=>request<LyricsResponse>(`/me/lyrics/${encodeURIComponent(id)}/select`,{method:'POST',body:JSON.stringify({providerId}),signal}),
    import:(id:string,text:string,format:LyricsFormat,fileName:string,signal?:AbortSignal)=>request<LyricsResponse>(`/me/lyrics/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify({text,format,fileName}),signal}),
    remove:(id:string,signal?:AbortSignal)=>request(`/me/lyrics/${encodeURIComponent(id)}`,{method:'DELETE',signal}),
  },
  library:createLibraryClient(request),
  status: () => request<RuntimeStatus>('/runtime'),
  search: async (q: string, cursor?: string, signal?: AbortSignal): Promise<SearchResponse> => {
    const params=new URLSearchParams({q,type:'track',...(cursor?{cursor}:{})});
    const result=await request<any>(`/search?${params}`,{signal});
    return {...result,items:result.items.map(track)};
  },
  searchArtist:async(id:string,q:string,signal?:AbortSignal):Promise<SearchResponse>=>{
    const result=await request<CatalogResult<{kind:'track';items:Track[];truncated:boolean}>>(`/catalog/artist/${encodeURIComponent(id)}/search?${new URLSearchParams({q,kind:'track'})}`,{signal});
    return {items:result.data.items,nextCursor:null,cache:result.cache};
  },
  fromLink: async (videoId: string) => track(await request('/links/resolve',{method:'POST',body:JSON.stringify({videoId})})),
  playback: async (id: string, fresh=false, signal?:AbortSignal,prepare=false) => {
    const params=new URLSearchParams({...fresh?{fresh:'true'}:{},...prepare?{prepare:'true'}:{}});
    const descriptor=await request<Playback>(`/media/${encodeURIComponent(id)}/playback${params.size?'?'+params:''}`,{method:'POST',signal});
    const {baseUrl}=await config();return {...descriptor,url:new URL(descriptor.url,baseUrl).href};
  },
  restore: async (item: Track, signal?:AbortSignal,localOnly=false) => {
    try { return track(await request(`/media/${encodeURIComponent(item.id)}`,{signal})); }
    catch (error) { if (!localOnly&&error instanceof ApiError && error.code==='MEDIA_NOT_FOUND') return track(await request('/links/resolve',{method:'POST',body:JSON.stringify({videoId:item.videoId}),signal})); throw error; }
  },
};
