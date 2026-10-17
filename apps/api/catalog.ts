import {createHmac} from 'node:crypto';
import type {SearchResponse} from '../../packages/domain/index';
import type {Config} from './config';
import type {ContentResolver} from './resolver';
import {Store} from './store';
import {AppError} from './errors';
import {rankSearch} from '../../packages/domain/search-ranking';
export class ResolverCatalog {
  private flights=new Map<string,Promise<SearchResponse>>();
  constructor(private config:Config,private store:Store,private resolver:ContentResolver){}
  private cursor(query:string,offset:string,snapshot?:number){
    const data=Buffer.from(JSON.stringify({query:query.toLocaleLowerCase('it'),offset:Number(offset),...(snapshot?{snapshot}:{})})).toString('base64url');
    return `${data}.${createHmac('sha256',this.config.token).update(data).digest('base64url')}`;
  }
  private offset(query:string,cursor?:string){
    if(!cursor)return {offset:0,snapshot:undefined as number|undefined};
    const [data,signature,...extra]=cursor.split('.');
    if(extra.length||!signature||signature!==createHmac('sha256',this.config.token).update(data).digest('base64url'))throw new AppError(400,'INVALID_CURSOR','La pagina è scaduta. Ripeti la ricerca.');
    try{
      const parsed=JSON.parse(Buffer.from(data,'base64url').toString());
      if(parsed.query!==query.toLocaleLowerCase('it')||!Number.isInteger(parsed.offset)||parsed.offset<20||parsed.offset>80||parsed.offset%20)throw Error();
      if(parsed.snapshot!==undefined&&(!Number.isSafeInteger(parsed.snapshot)||parsed.snapshot<1))throw Error();
      return {offset:parsed.offset as number,snapshot:parsed.snapshot as number|undefined};
    }catch{throw new AppError(400,'INVALID_CURSOR','Pagina di ricerca non valida.');}
  }
  async search(query:string,cursor?:string):Promise<SearchResponse>{
    const q=query.trim().replace(/\s+/g,' ');
    if(q.length<3||q.length>200)throw new AppError(400,'INVALID_REQUEST','Digita da 3 a 200 caratteri.');
    const {offset,snapshot}=this.offset(q,cursor);
    if(this.resolver.searchSnapshot)return this.rankedSearch(q,offset,snapshot);
    const key=JSON.stringify(['resolver-music-v1',q.toLocaleLowerCase('it'),offset]);
    const cached=this.store.cached(key);
    const wrap=(hit:boolean,degraded:boolean,value=cached!):SearchResponse=>({items:value.data.items,nextCursor:value.data.nextCursor?this.cursor(q,value.data.nextCursor):null,cache:{hit,degraded,fetchedAt:new Date(value.fetched).toISOString(),expiresAt:new Date(value.expires).toISOString()}});
    if(cached&&cached.expires>Date.now())return wrap(true,false);
    const active=this.flights.get(key);if(active)return active;
    const work=(async()=>{
      try{
        const result=await this.resolver.search(q,offset);
        for(const track of result.items)this.store.saveTrack(track);
        this.store.cache(key,{items:result.items,nextCursor:result.nextOffset===null?null:String(result.nextOffset)},this.config.searchTtlMs);
        return wrap(false,false,this.store.cached(key)!);
      }catch(error){
        if(cached&&error instanceof AppError&&(error.status===429||error.status>=500))return wrap(true,true);
        throw error;
      }finally{this.flights.delete(key);}
    })();
    this.flights.set(key,work);return work;
  }
  private async rankedSearch(q:string,offset:number,snapshot?:number):Promise<SearchResponse>{
    const key=JSON.stringify(['resolver-ranked-v1',q.toLocaleLowerCase('it')]),cached=this.store.cached(key);
    const expired=()=>new AppError(400,'INVALID_CURSOR','La pagina è scaduta. Ripeti la ricerca.');
    const wrap=(value:NonNullable<ReturnType<Store['cached']>>,hit:boolean,degraded:boolean):SearchResponse=>{
      const next=offset+20<value.data.items.length&&offset<80?this.cursor(q,String(offset+20),value.fetched):null;
      const items=value.data.items.slice(offset,offset+20);for(const track of items)this.store.saveTrack(track);
      return {items,nextCursor:next,priorityArtist:value.data.priorityArtist,truncated:value.data.truncated,cache:{hit,degraded,fetchedAt:new Date(value.fetched).toISOString(),expiresAt:new Date(value.expires).toISOString()}};
    };
    // Later pages read the same persisted, ordered snapshot, including after
    // restart. Never refetch/reorder mid-scroll or reuse a replaced snapshot.
    if(offset){if(!cached||snapshot!==cached.fetched)throw expired();return wrap(cached,true,false);}
    if(cached&&cached.expires>Date.now())return wrap(cached,true,false);
    const active=this.flights.get(key);if(active)return active;
    const work=(async()=>{try{
      const result=await this.resolver.searchSnapshot!(q);
      if(!Array.isArray(result.items)||result.items.length>100||!Array.isArray(result.candidates)||result.candidates.length>20||typeof result.truncated!=='boolean')throw new AppError(502,'CATALOG_INVALID','Risultati del catalogo non validi.');
      const seen=new Set<string>(),unique=result.items.filter(track=>{if(seen.has(track.id))return false;seen.add(track.id);return true;});
      const ranked=rankSearch(q,unique,result.candidates);
      this.store.cache(key,{...ranked,nextCursor:null,truncated:result.truncated},this.config.searchTtlMs);
      this.store.db.exec('DELETE FROM search_cache WHERE key IN (SELECT key FROM search_cache ORDER BY fetched DESC,rowid DESC LIMIT -1 OFFSET 500)');
      return wrap(this.store.cached(key)!,false,false);
    }catch(error){if(cached&&error instanceof AppError&&(error.status===429||error.status>=500))return wrap(cached,true,true);throw error;}finally{this.flights.delete(key);}})();
    this.flights.set(key,work);return work;
  }
}
