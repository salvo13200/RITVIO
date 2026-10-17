import type {FastifyInstance} from 'fastify';
import type {Store} from './store';
import type {ContentResolver} from './resolver';
import {AppError} from './errors';
import {normalizeHomeIndex,normalizeHomeDetail} from './home-normalize';
import {homeCollectionIds,publicHomeCollectionIds,homeEdition,type HomeIndex,type HomeDetail,type HomeResult,type HomeCollectionId} from '../../packages/domain/home';
type Row={data:string|null;fetched:number;edition:string;retry:number;failures:number;error:string|null};
export class HomeCatalog{
  private flights=new Map<string,Promise<void>>();private closed=false;
  constructor(private store:Store,private resolver:ContentResolver,private now:()=>number=Date.now){
    store.db.exec('CREATE TABLE IF NOT EXISTS home_cache(key TEXT PRIMARY KEY,data TEXT,fetched INTEGER NOT NULL DEFAULT 0,edition TEXT NOT NULL DEFAULT \'\',retry INTEGER NOT NULL DEFAULT 0,failures INTEGER NOT NULL DEFAULT 0,error TEXT)');
  }
  private read(key:string):Row|null{return (this.store.db.prepare('SELECT * FROM home_cache WHERE key=?').get(key) as Row|undefined)??null;}
  private data<T>(row:Row|null):T|null{try{return row?.data&&row.fetched>this.now()-30*86400000?JSON.parse(row.data):null;}catch{return null;}}
  private result<T>(key:string,edition:string):HomeResult<T>{
    const row=this.read(key),data=this.data<T>(row);
    return {data,updatedAt:data&&row?new Date(row.fetched).toISOString():null,edition,refreshing:this.flights.has(key),stale:!!data&&(row?.edition!==edition||!!row.error),error:row?.error??null,retryAt:row&&row.retry>this.now()?new Date(row.retry).toISOString():null};
  }
  private refresh<T>(key:string,edition:string,load:()=>Promise<T>,partial:(data:T)=>boolean=()=>false):Promise<void>{
    const active=this.flights.get(key);if(active)return active;
    const work=(async()=>{try{
      const data=await load();if(this.closed)return;
      const warning=partial(data)?'Alcune raccolte non sono aggiornabili. Conserviamo le ultime disponibili.':null;
      this.store.db.prepare('INSERT INTO home_cache(key,data,fetched,edition,retry,failures,error) VALUES(?,?,?,?,?,0,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data,fetched=excluded.fetched,edition=excluded.edition,retry=excluded.retry,failures=0,error=excluded.error').run(key,JSON.stringify(data),this.now(),edition,this.now()+15*60000,warning);
    }catch(error){if(this.closed)return;const failures=(this.read(key)?.failures??0)+1,retry=this.now()+Math.min(15*60000,30000*2**Math.min(5,failures-1));
      this.store.db.prepare('INSERT INTO home_cache(key,retry,failures,error) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET retry=excluded.retry,failures=excluded.failures,error=excluded.error').run(key,retry,failures,error instanceof AppError?error.message:'Impossibile aggiornare le raccolte. Controlla la connessione e riprova.');
    }finally{this.flights.delete(key);}})();this.flights.set(key,work);return work;
  }
  async index(force=false):Promise<HomeResult<HomeIndex>>{
    const key='index:international-v1',edition=homeEdition(this.now()),row=this.read(key),previous=this.data<HomeIndex>(row);
    if(!this.closed&&(!row||row.retry<=this.now())&&(!previous||row?.edition!==edition||previous.missing.length>0||force)){
      const work=this.refresh(key,edition,async()=>{
        if(!this.resolver.homeIndex)throw new AppError(501,'HOME_UNSUPPORTED','Aggiorna il resolver per caricare la nuova Home.');
        const fresh=normalizeHomeIndex(await this.resolver.homeIndex());
        return {...fresh,collections:publicHomeCollectionIds.flatMap(id=>{const item=fresh.collections.find(c=>c.id===id)??previous?.collections.find(c=>c.id===id);return item?[item]:[];})};
      },data=>data.missing.length>0);
      if(!previous)await work;
    }
    return this.result(key,edition);
  }
  async detail(id:HomeCollectionId,force=false):Promise<HomeResult<HomeDetail>>{
    let index=await this.index();
    // A first detail read needs the settled descriptor, not last week's IDs.
    if(index.refreshing&&!this.data<HomeDetail>(this.read(`collection:${id}`))){await this.flights.get('index');index=await this.index();}
    const collection=index.data?.collections.find(c=>c.id===id);
    if(!collection)throw new AppError(503,'HOME_UNAVAILABLE','Questa raccolta non è ancora disponibile. Torna alla Home e riprova.');
    const key=`collection:${id}`,edition=JSON.stringify([index.edition,collection.playlistId,collection.albums.map(a=>a.id)]),row=this.read(key),previous=this.data<HomeDetail>(row);
    if(!this.closed&&(!previous||(!index.stale&&!index.refreshing))&&(!row||row.retry<=this.now())&&(!previous||row?.edition!==edition||force)){
      const work=this.refresh(key,edition,async()=>{
        if(!this.resolver.homeCollection)throw new AppError(501,'HOME_UNSUPPORTED','Aggiorna il resolver per aprire le raccolte.');
        const detail=normalizeHomeDetail(await this.resolver.homeCollection(collection),collection);
        if(detail.partial&&previous)throw new AppError(503,'HOME_PARTIAL','La nuova edizione è incompleta. Conserviamo quella precedente.');
        for(const track of detail.tracks)this.store.saveTrack(track);return detail;
      },detail=>detail.partial);
      if(!previous)await work;
    }
    const result=this.result<HomeDetail>(key,edition);result.edition=index.edition;
    result.stale=result.stale||index.stale||!!index.data?.missing.includes(id);
    result.error=result.error??index.error;
    result.refreshing=result.refreshing||index.refreshing;
    if(index.error&&index.retryAt)result.retryAt=index.retryAt;
    if(result.data)for(const track of result.data.tracks)this.store.saveTrack(track);
    return result;
  }
  async close(){this.closed=true;await Promise.allSettled(this.flights.values());}
}
export function registerHome(app:FastifyInstance,store:Store,resolver:ContentResolver,options:{now?:()=>number}={}){
  const home=new HomeCatalog(store,resolver,options.now);app.addHook('preClose',()=>home.close());
  app.get('/v1/home',()=>home.index());app.post('/v1/home/refresh',()=>home.index(true));
  app.get<{Params:{id:HomeCollectionId}}>('/v1/home/collections/:id',{schema:{params:{type:'object',additionalProperties:false,required:['id'],properties:{id:{enum:homeCollectionIds}}}}},r=>home.detail(r.params.id));
  app.post<{Params:{id:HomeCollectionId}}>('/v1/home/collections/:id/refresh',{schema:{params:{type:'object',additionalProperties:false,required:['id'],properties:{id:{enum:homeCollectionIds}}}}},r=>home.detail(r.params.id,true));
  return home;
}
