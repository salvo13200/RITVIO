import type {FastifyInstance} from 'fastify';
import type {Store} from './store';
import type {ContentResolver} from './resolver';
import {AppError} from './errors';
import {situationIndex,situationPlaylists} from './situations-normalize';
import {normalizeHomeDetail} from './home-normalize';
import {situationKeys,type Situation,type SituationKey,type SituationPlaylist,type SituationTracks,type SituationResult} from '../../packages/domain/situations';
type Row={data:string|null;fetched:number;retry:number;failures:number;error:string|null};
export class SituationsCatalog{
  private flights=new Map<string,Promise<void>>();private closed=false;
  constructor(private store:Store,private resolver:ContentResolver,private now:()=>number=Date.now){store.db.exec('CREATE TABLE IF NOT EXISTS situation_cache(key TEXT PRIMARY KEY,data TEXT,fetched INTEGER NOT NULL DEFAULT 0,retry INTEGER NOT NULL DEFAULT 0,failures INTEGER NOT NULL DEFAULT 0,error TEXT)');}
  private async cached<T>(key:string,ttl:number,load:()=>Promise<T>):Promise<SituationResult<T>>{
    const read=()=>this.store.db.prepare('SELECT * FROM situation_cache WHERE key=?').get(key) as Row|undefined;
    const usable=(row:Row|undefined):T|null=>{try{return row?.data&&row.fetched>this.now()-30*86400000?JSON.parse(row.data):null;}catch{return null;}};
    const row=read(),old=usable(row);
    if(!this.closed&&(!row||row.retry<=this.now())&&(!old||row!.fetched+ttl<=this.now()||!!row!.error)){
      let work=this.flights.get(key);
      if(!work){work=(async()=>{try{const data=await load();if(this.closed)return;this.store.db.prepare('INSERT INTO situation_cache(key,data,fetched,retry,failures,error) VALUES(?,?,?,?,0,NULL) ON CONFLICT(key) DO UPDATE SET data=excluded.data,fetched=excluded.fetched,retry=excluded.retry,failures=0,error=NULL').run(key,JSON.stringify(data),this.now(),this.now()+30000);this.store.db.prepare('DELETE FROM situation_cache WHERE key IN (SELECT key FROM situation_cache ORDER BY fetched DESC LIMIT -1 OFFSET 96)').run();}catch(e){if(this.closed)return;const failures=(read()?.failures??0)+1;this.store.db.prepare('INSERT INTO situation_cache(key,retry,failures,error) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET retry=excluded.retry,failures=excluded.failures,error=excluded.error').run(key,this.now()+Math.min(900000,30000*2**Math.min(5,failures-1)),failures,e instanceof AppError?e.message:'Impossibile aggiornare le raccolte. Controlla la connessione e riprova.');}finally{this.flights.delete(key);}})();this.flights.set(key,work);}
      if(!old)await work;
    }
    const latest=read(),data=usable(latest);return {data,updatedAt:data&&latest?new Date(latest.fetched).toISOString():null,stale:!!data&&(latest!.fetched+ttl<=this.now()||!!latest!.error),refreshing:this.flights.has(key),error:latest?.error??null,retryAt:latest&&latest.retry>this.now()?new Date(latest.retry).toISOString():null};
  }
  async index(){return this.cached<Situation[]>('index',86400000,async()=>{if(!this.resolver.situations)throw new AppError(501,'SITUATION_UNSUPPORTED','Le raccolte per situazioni non sono disponibili in questo resolver.');return situationIndex({items:await this.resolver.situations()});});}
  async playlists(id:SituationKey){
    let index=await this.index();if(index.refreshing){await this.flights.get('index');index=await this.index();}
    const category=index.data?.find(item=>item.id===id);if(!category)throw new AppError(503,'SITUATION_UNAVAILABLE','Questa situazione non è disponibile nel catalogo. Prova un altro momento.');
    const result=await this.cached<SituationPlaylist[]>(`list:${id}:${category.params}`,86400000,async()=>{if(!this.resolver.situationPlaylists)throw new AppError(501,'SITUATION_UNSUPPORTED','Aggiorna il resolver per queste raccolte.');return situationPlaylists({items:await this.resolver.situationPlaylists(category.params)});});
    result.stale=result.stale||index.stale;result.error=result.error??index.error;return result;
  }
  async tracks(id:SituationKey,playlistId:string){
    const lists=await this.playlists(id),playlist=lists.data?.find(item=>item.id===playlistId);if(!playlist)throw new AppError(404,'SITUATION_PLAYLIST_UNKNOWN','Questa playlist non è presente nella raccolta corrente. Riapri la situazione.');
    const result=await this.cached<SituationTracks>(`tracks:${playlistId}`,6*3600000,async()=>{
      if(!this.resolver.homeCollection)throw new AppError(501,'SITUATION_UNSUPPORTED','Aggiorna il resolver per riprodurre la raccolta.');
      const collection={id:'trending' as const,playlistId,country:null,sourceTitle:playlist.title,artwork:playlist.artwork,albums:[]};
      const detail=normalizeHomeDetail(await this.resolver.homeCollection(collection),collection);
      if(detail.partial)throw new AppError(503,'SITUATION_PARTIAL','La raccolta è incompleta. Riprova più tardi.');
      for(const track of detail.tracks)this.store.saveTrack(track);return {playlist,tracks:detail.tracks,partial:false};
    });
    result.stale=result.stale||lists.stale;result.error=result.error??lists.error;if(result.data)for(const track of result.data.tracks)this.store.saveTrack(track);return result;
  }
  async close(){this.closed=true;await Promise.allSettled(this.flights.values());}
}
export function registerSituations(app:FastifyInstance,store:Store,resolver:ContentResolver){
  const catalog=new SituationsCatalog(store,resolver);app.addHook('preClose',()=>catalog.close());
  const properties={id:{enum:situationKeys}};
  app.get('/v1/situations',()=>catalog.index());
  app.get<{Params:{id:SituationKey}}>('/v1/situations/:id',{schema:{params:{type:'object',required:['id'],additionalProperties:false,properties}}},r=>catalog.playlists(r.params.id));
  app.get<{Params:{id:SituationKey;playlistId:string}}>('/v1/situations/:id/playlists/:playlistId',{schema:{params:{type:'object',required:['id','playlistId'],additionalProperties:false,properties:{...properties,playlistId:{type:'string',pattern:'^[A-Za-z0-9_-]{1,160}$'}}}}},r=>catalog.tracks(r.params.id,r.params.playlistId));
}
