import { existsSync } from 'node:fs';
import { AppError } from './errors';
import type { Config } from './config';
import { videoIdPattern, type Playback, type Track } from '../../packages/domain/index';
import { mediaId } from './store';
import path from 'node:path';
import {runResolverJson} from './resolver-process';
import {PlaybackPreparation,type PreparationOptions} from './playback-preparation';
import {PlaybackWorkers} from './playback-worker';
import type {RadioCandidates} from '../../packages/domain/radio';
import type {CatalogKind,CatalogDetail,CatalogSearch,ArtistReleases,ArtistSearch,ArtistSearchKind} from '../../packages/domain/catalog';
import {catalogIdPattern} from '../../packages/domain/catalog';
import {normalizeCatalogSearch,normalizeCatalogDetail,catalogTrack,catalogResource} from './catalog-normalize';
import {rankSearch} from '../../packages/domain/search-ranking';
import type {MusicResource} from '../../packages/domain/index';
import type {RemotePlaylistPreview} from '../../packages/domain/playlist-import';
import {remotePlaylistIdPattern} from '../../packages/domain/playlist-import';
import {normalizeRemotePlaylist,normalizeFlatPlaylist} from './playlist-import-normalize';
import type {HomeCollection,HomeIndex,HomeDetail} from '../../packages/domain/home';
import {normalizeHomeIndex,normalizeHomeDetail} from './home-normalize';
import {situationIndex,situationPlaylists} from './situations-normalize';
import type {Situation,SituationPlaylist} from '../../packages/domain/situations';
export type Resolved = { track: Track; playback: Playback };
export type CatalogPage = {items:Track[];nextOffset:number|null};
export type SearchSnapshot={items:Track[];candidates:MusicResource[];truncated:boolean};
export interface ContentResolver {
  situations?():Promise<Situation[]>;
  situationPlaylists?(params:string):Promise<SituationPlaylist[]>;
  homeIndex?():Promise<HomeIndex>;
  homeCollection?(collection:HomeCollection):Promise<HomeDetail>;
  installed():Promise<boolean>;
  search(query:string,offset?:number):Promise<CatalogPage>;
  searchSnapshot?(query:string):Promise<SearchSnapshot>;
  resolve(videoId:string,fresh?:boolean,options?:PreparationOptions):Promise<Resolved>;
  close?():void|Promise<void>;
  diagnostics?():unknown;
  radio?(videoId:string):Promise<RadioCandidates>;
  catalogSearch?(query:string,kind:CatalogKind):Promise<CatalogSearch>;
  detail?(kind:CatalogKind,id:string):Promise<CatalogDetail>;
  releases?(id:string,section:'albums'|'singles'):Promise<ArtistReleases>;
  artistSearch?(id:string,query:string,kind:ArtistSearchKind):Promise<ArtistSearch>;
  playlistPreview?(id:string,signal:AbortSignal,phase:(provider:'youtube-music'|'youtube')=>void):Promise<RemotePlaylistPreview>;
}
export function allowedStreamUrl(value: string): boolean {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port==='443') && url.hostname.endsWith('.googlevideo.com'); }
  catch { return false; }
}
export class Resolver implements ContentResolver {
  private workers:PlaybackWorkers;
  private preparation:PlaybackPreparation<Resolved>;
  private searching=0;
  private lifetime=new AbortController();
  private processes=new Set<Promise<unknown>>();
  private closing:Promise<void>|undefined;
  constructor(private config: Config) {
    this.workers=new PlaybackWorkers(config);
    this.preparation=new PlaybackPreparation((_id,_fresh,signal)=>this.run(_id,signal),value=>Date.parse(value.playback.expiresAt)>Date.now()+60000);
  }
  async installed(): Promise<boolean> {
    if(this.config.python !== 'python' && !existsSync(this.config.python))return false;
    return this.workers.warm();
  }
  async resolve(videoId: string, fresh = false,options:PreparationOptions={}): Promise<Resolved> {
    if (!videoIdPattern.test(videoId)) throw new AppError(400,'INVALID_VIDEO','Link YouTube non valido.');
    return this.preparation.resolve(videoId,fresh,options);
  }
  diagnostics(){return {...this.preparation.diagnostics(),workers:this.workers.diagnostics()};}
  close(){return this.closing??=(async()=>{this.lifetime.abort();this.preparation.close();await Promise.allSettled([...this.processes,this.workers.close()]);})();}
  private execute(args:string[],input?:unknown,signal?:AbortSignal){
    const work=runResolverJson(this.config,args,input,signal?AbortSignal.any([signal,this.lifetime.signal]):this.lifetime.signal);
    this.processes.add(work);const remove=()=>{this.processes.delete(work);};void work.then(remove,remove);return work;
  }
  async search(query:string,offset=0):Promise<CatalogPage>{
    if(typeof query!=='string'||query.trim().length<3||query.length>200||!Number.isInteger(offset)||offset<0||offset>80||offset%20)throw new AppError(400,'INVALID_REQUEST','Ricerca non valida.');
    if(this.searching>=2)throw new AppError(429,'RESOLVER_BUSY','Altre ricerche sono in corso. Riprova tra poco.');
    this.searching++;
    try{
      const result=await this.execute([this.config.catalogScript ?? path.join(this.config.root,'scripts/music-catalog.py')],{query,offset});
      if(!Array.isArray(result.items)||result.items.length>20||(result.nextOffset!==null&&result.nextOffset!==offset+20))throw new AppError(502,'RESOLVER_OUTPUT','Risultati del catalogo non validi.');
      const resource=(value:any)=>value&&typeof value.id==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value.id)&&typeof value.name==='string'?{id:value.id,name:value.name.slice(0,300)}:undefined;
      const items:Track[]=result.items.filter((item:any)=>videoIdPattern.test(item.videoId)&&typeof item.title==='string'&&typeof item.artist==='string').map((item:any)=>({id:mediaId(item.videoId),videoId:item.videoId,title:item.title,artist:item.artist,thumbnail:`https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`,duration:Math.max(0,Number(item.duration)||0),canonicalUrl:`https://www.youtube.com/watch?v=${item.videoId}`,artists:Array.isArray(item.artists)?item.artists.map(resource).filter(Boolean):[],album:resource(item.album)}));
      return {items,nextOffset:result.nextOffset};
    }finally{this.searching--;}
  }
  private async catalogOperation(payload:unknown){
    if(this.searching>=2)throw new AppError(429,'RESOLVER_BUSY','Altre ricerche sono in corso. Riprova tra poco.');
    this.searching++;
    try{return await this.execute([this.config.catalogScript??path.join(this.config.root,'scripts/music-catalog.py')],payload);}finally{this.searching--;}
  }
  async homeIndex():Promise<HomeIndex>{return normalizeHomeIndex(await this.catalogOperation({operation:'home-index'}));}
  async situations():Promise<Situation[]>{return situationIndex(await this.catalogOperation({operation:'situation-index'}));}
  async situationPlaylists(params:string):Promise<SituationPlaylist[]>{return situationPlaylists(await this.catalogOperation({operation:'situation-playlists',params}));}
  async homeCollection(collection:HomeCollection):Promise<HomeDetail>{return normalizeHomeDetail(await this.catalogOperation({operation:'home-collection',collection}),collection);}
  async searchSnapshot(query:string):Promise<SearchSnapshot>{
    if(typeof query!=='string'||query.trim().length<3||query.length>200)throw new AppError(400,'INVALID_REQUEST','Ricerca non valida.');
    const value=await this.catalogOperation({operation:'search-snapshot',query});
    if(!value||!Array.isArray(value.items)||value.items.length>100||typeof value.truncated!=='boolean'||!Array.isArray(value.candidates)||value.candidates.length>20)throw new AppError(502,'CATALOG_INVALID','Risultati del catalogo non validi.');
    const seen=new Set<string>();
    const items=value.items.map(catalogTrack).filter((track:Track)=>{if(seen.has(track.id))return false;seen.add(track.id);return true;});
    return {items,candidates:value.candidates.map((item:any)=>catalogResource(item,'artist')),truncated:value.truncated};
  }
  async radio(videoId:string):Promise<RadioCandidates>{
    if(!videoIdPattern.test(videoId))throw new AppError(400,'INVALID_VIDEO','Brano di partenza non valido.');
    const value=await this.catalogOperation({operation:'radio',videoId});
    if(!value||value.videoId!==videoId||!Array.isArray(value.items)||value.items.length>51)throw new AppError(502,'CATALOG_INVALID','Suggerimenti radio non validi.');
    return {videoId,items:value.items.map(catalogTrack)};
  }
  async catalogSearch(query:string,kind:CatalogKind):Promise<CatalogSearch>{
    if(!['artist','album'].includes(kind)||query.trim().length<3||query.length>200)throw new AppError(400,'INVALID_REQUEST','Ricerca non valida.');
    const value=await this.catalogOperation({operation:'catalog-search',query,kind});
    if(kind==='artist')return normalizeCatalogSearch(value,kind);
    const data=normalizeCatalogSearch(value,kind,100);
    if(!Array.isArray(value.candidates)||value.candidates.length>20)throw new AppError(502,'CATALOG_INVALID','Risultati del catalogo non validi.');
    const ranked=rankSearch(query,data.items,value.candidates.map((item:any)=>catalogResource(item,'artist')));
    return {...ranked,items:ranked.items.slice(0,20),truncated:data.truncated||ranked.items.length>20};
  }
  async detail(kind:CatalogKind,id:string):Promise<CatalogDetail>{
    if(!['artist','album'].includes(kind)||!catalogIdPattern.test(id))throw new AppError(400,'INVALID_REQUEST','Identificativo del catalogo non valido.');
    return normalizeCatalogDetail(await this.catalogOperation({operation:'detail',kind,id}),kind,id);
  }
  async releases(id:string,section:'albums'|'singles'):Promise<ArtistReleases>{
    if(!catalogIdPattern.test(id)||!['albums','singles'].includes(section))throw new AppError(400,'INVALID_REQUEST','Pubblicazioni non valide.');
    return normalizeCatalogSearch(await this.catalogOperation({operation:'releases',kind:'artist',id,section}),'album',100);
  }
  async artistSearch(id:string,query:string,kind:ArtistSearchKind):Promise<ArtistSearch>{
    if(!catalogIdPattern.test(id)||query.length>200||!['track','album'].includes(kind))throw new AppError(400,'INVALID_REQUEST','Ricerca artista non valida.');
    const value=await this.catalogOperation({operation:'artist-search',kind:'artist',id,query,searchKind:kind});
    if(!value||value.kind!==kind||!Array.isArray(value.items)||value.items.length>100||typeof value.truncated!=='boolean')throw new AppError(502,'CATALOG_INVALID','Il catalogo ha restituito dati incompleti.');
    if(kind==='album'){
      const normalized=normalizeCatalogSearch(value,'album',100);
      return {kind,...normalized,items:normalized.items.filter(item=>item.artists.some(artist=>artist.id===id))};
    }
    const seen=new Set<string>();
    return {kind,items:value.items.map(catalogTrack).filter((track:Track)=>{
      if(!track.artists?.some(artist=>artist.id===id)||seen.has(track.id))return false;
      seen.add(track.id);return true;
    }),truncated:value.truncated};
  }
  async playlistPreview(id:string,signal:AbortSignal,phase:(provider:'youtube-music'|'youtube')=>void):Promise<RemotePlaylistPreview>{
    if(!remotePlaylistIdPattern.test(id))throw new AppError(400,'INVALID_PLAYLIST_LINK','Link playlist non valido.');
    if(this.searching>=2)throw new AppError(429,'RESOLVER_BUSY','Altre ricerche sono in corso. Riprova tra poco.');
    this.searching++;
    try{
      phase('youtube-music');
      try{return normalizeRemotePlaylist(await this.execute([path.join(path.dirname(this.config.catalogScript??path.join(this.config.root,'scripts/music-catalog.py')),'playlist-catalog.py')],{id},signal),id,'youtube-music');}
      catch(error){if(signal.aborted||error instanceof AppError&&['RESOLVER_MISSING','RESOLVER_BUSY'].includes(error.code))throw error;}
      phase('youtube');
      const raw=await this.execute(['-m','yt_dlp','--ignore-config','--no-plugin-dirs','--flat-playlist','--skip-download','--dump-single-json','--no-cache-dir','--ignore-errors','--no-warnings','--socket-timeout','12','--retries','0','--playlist-end','1001','--',`https://www.youtube.com/playlist?list=${id}`],undefined,signal);
      return normalizeFlatPlaylist(raw,id);
    }finally{this.searching--;}
  }
  private run(videoId: string,signal:AbortSignal): Promise<Resolved> {
    return this.workers.run(videoId,signal).then(info=>{
      if (info.id !== videoId || !info.url || !allowedStreamUrl(info.url) || info.vcodec !== 'none' || info.is_live) throw new AppError(502,'NO_AUDIO_STREAM','Il video non offre un flusso audio compatibile.');
      const exp = Number(new URL(info.url).searchParams.get('expire')) * 1000;
      const expiresAt = new Date(Math.min(Number.isFinite(exp) && exp>Date.now()?exp:Date.now()+300000,Date.now()+1800000)).toISOString();
      return {track:{id:mediaId(videoId),videoId,title:info.track||info.title||'Brano YouTube',artist:info.artist||info.channel||info.uploader||'YouTube',thumbnail:`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,duration:Number(info.duration)||0,canonicalUrl:`https://www.youtube.com/watch?v=${videoId}`},
        playback:{mode:'youtube-audio-resolver',accessMethod:'unofficial-extraction',provider:'youtube',videoId,url:info.url,expiresAt,capabilities:{background:true,seek:true,volume:true,equalizer:false,offline:false}}};
    });
  }
}
