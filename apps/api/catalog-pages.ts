import type {FastifyInstance} from 'fastify';
import type {Store} from './store';
import type {ContentResolver} from './resolver';
import type {IdentityProvider} from './identity';
import {AppError} from './errors';
import type {RadioCandidates} from '../../packages/domain/radio';
import {catalogTrack} from './catalog-normalize';
import type {CatalogDetail,CatalogResult,CatalogSearch,CatalogKind,ArtistReleases,ArtistSearchKind,ArtistSearch} from '../../packages/domain/catalog';
const idSchema={type:'string',pattern:'^[A-Za-z0-9_-]{1,160}$'};
const kindSchema={type:'string',enum:['artist','album']};
const schema=(properties:Record<string,unknown>,required=Object.keys(properties))=>({type:'object',additionalProperties:false,required,properties});
export function registerCatalogPages(app:FastifyInstance,store:Store,resolver:ContentResolver,identity:IdentityProvider){
  store.db.exec(`CREATE TABLE IF NOT EXISTS catalog_pages(key TEXT PRIMARY KEY,data TEXT NOT NULL,fetched INTEGER NOT NULL,expires INTEGER NOT NULL);DELETE FROM catalog_pages WHERE fetched<(unixepoch()-2592000)*1000;`);
  const flights=new Map<string,Promise<CatalogResult<any>>>();let closed=false;
  app.addHook('preClose',async()=>{closed=true;});
  const saveTracks=(data:any)=>{for(const track of data.tracks??[])store.saveTrack(track);for(const entry of data.entries??[])if(entry.track)store.saveTrack(entry.track);if(data.kind==='track'||data.videoId)for(const track of data.items??[])store.saveTrack(track);};
  async function cached<T>(key:string,load:()=>Promise<T>,ttl=86400000):Promise<CatalogResult<T>>{
    const row=store.db.prepare('SELECT * FROM catalog_pages WHERE key=? AND fetched>?').get(key,Date.now()-30*86400000);
    const wrap=(data:T,hit:boolean,degraded:boolean,fetched:number,expires:number)=>({data,cache:{hit,degraded,fetchedAt:new Date(fetched).toISOString(),expiresAt:new Date(expires).toISOString()}});
    if(row&&Number(row.expires)>Date.now()){const data=JSON.parse(String(row.data));saveTracks(data);return wrap(data,true,false,Number(row.fetched),Number(row.expires));}
    if(flights.has(key))return flights.get(key)!;
    const work=(async()=>{try{
      const data=await load();if(closed)throw new AppError(503,'CATALOG_CLOSED','Il servizio locale si sta chiudendo.');
      saveTracks(data);const now=Date.now();store.db.prepare('INSERT OR REPLACE INTO catalog_pages VALUES(?,?,?,?)').run(key,JSON.stringify(data),now,now+ttl);
      store.db.exec('DELETE FROM catalog_pages WHERE key IN (SELECT key FROM catalog_pages ORDER BY fetched DESC,rowid DESC LIMIT -1 OFFSET 500)');
      return wrap(data,false,false,now,now+ttl);
    }catch(error){if(!closed&&row&&error instanceof AppError&&(error.status===429||error.status>=500)){const data=JSON.parse(String(row.data));saveTracks(data);return wrap(data,true,true,Number(row.fetched),Number(row.expires));}throw error;}finally{flights.delete(key);}})();
    flights.set(key,work);return work;
  }
  const unsupported=()=>new AppError(501,'CATALOG_UNSUPPORTED','Aggiorna il resolver per esplorare artisti e album.');
  const detail=(kind:CatalogKind,id:string)=>cached<CatalogDetail>(JSON.stringify(['detail-v1',kind,id]),()=>resolver.detail?resolver.detail(kind,id):Promise.reject(unsupported()));
  app.post<{Params:{id:string}}>('/v1/me/catalog/artist/:id/artwork',{schema:{params:schema({id:idSchema})}},async request=>{
    const owner=(await identity.resolve(request)).id,{id}=request.params;
    if(!store.library.followed(owner,'artist',id))throw new AppError(404,'RESOURCE_NOT_FOUND','Questo artista non è nella tua libreria.');
    const result=await detail('artist',id);
    if(result.data.kind!=='artist'||result.data.id!==id)throw new AppError(502,'CATALOG_INVALID','Profilo artista non valido.');
    // Recheck after the provider request: a late photo must never restore an unfollowed artist.
    return {resource:store.library.updateArtistArtwork(owner,id,result.data.artwork),cache:result.cache};
  });
  app.get<{Params:{videoId:string}}>('/v1/catalog/radio/:videoId',{schema:{params:schema({videoId:{type:'string',pattern:'^[A-Za-z0-9_-]{11}$'}})}},request=>{
    const videoId=request.params.videoId;
    return cached<RadioCandidates>(JSON.stringify(['radio-v1',videoId]),async()=>{
      if(!resolver.radio)throw new AppError(501,'RADIO_UNSUPPORTED','Il resolver non supporta la radio del brano.');
      const data=await resolver.radio(videoId);
      if(data.videoId!==videoId||!Array.isArray(data.items)||data.items.length>51)throw new AppError(502,'CATALOG_INVALID','Suggerimenti radio non validi.');
      // Do not persist caller-specific exclusions in the shared catalog cache.
      const seen=new Set<string>();return {videoId,items:data.items.map(catalogTrack).filter(track=>{if(track.videoId===videoId||seen.has(track.videoId))return false;seen.add(track.videoId);return true;})};
    },3600000);
  });
  app.get<{Querystring:{q:string;kind:CatalogKind}}>('/v1/catalog/search',{schema:{querystring:schema({q:{type:'string',minLength:3,maxLength:200},kind:kindSchema})}},request=>{
    const q=request.query.q.trim().replace(/\s+/g,' ');if(q.length<3)throw new AppError(400,'INVALID_REQUEST','Digita almeno 3 caratteri.');
    return cached<CatalogSearch>(JSON.stringify(['search-v3',request.query.kind,q.toLocaleLowerCase('it')]),()=>resolver.catalogSearch?resolver.catalogSearch(q,request.query.kind):Promise.reject(unsupported()),6*3600000);
  });
  app.get<{Params:{id:string};Querystring:{q:string;kind:ArtistSearchKind}}>('/v1/catalog/artist/:id/search',{schema:{params:schema({id:idSchema}),querystring:schema({q:{type:'string',maxLength:200},kind:{type:'string',enum:['track','album']}})}},request=>{
    const {id}=request.params,{kind}=request.query,q=request.query.q.trim().replace(/\s+/g,' ');
    return cached<ArtistSearch>(JSON.stringify(['artist-search-v1',id,kind,q.toLocaleLowerCase('it')]),async()=>{
      if(!resolver.artistSearch)throw unsupported();
      const data=await resolver.artistSearch(id,q,kind);
      // Enforce attribution even for alternate/future resolver implementations.
      if(data.kind!==kind)throw new AppError(502,'CATALOG_INVALID','Tipo di risultato non valido.');
      return {...data,items:data.items.filter(item=>item.artists?.some(artist=>artist.id===id))} as ArtistSearch;
    },6*3600000);
  });
  app.get<{Params:{kind:CatalogKind;id:string}}>('/v1/catalog/:kind/:id',{schema:{params:schema({kind:kindSchema,id:idSchema})}},request=>detail(request.params.kind,request.params.id));
  app.get<{Params:{id:string;section:'albums'|'singles'}}>('/v1/catalog/artist/:id/releases/:section',{schema:{params:schema({id:idSchema,section:{type:'string',enum:['albums','singles']}})}},request=>cached<ArtistReleases>(JSON.stringify(['releases-v1',request.params.id,request.params.section]),()=>resolver.releases?resolver.releases(request.params.id,request.params.section):Promise.reject(unsupported())));
  app.put<{Params:{kind:CatalogKind;id:string};Body:{followed:boolean}}>('/v1/me/catalog/:kind/:id',{schema:{params:schema({kind:kindSchema,id:idSchema}),body:schema({followed:{type:'boolean'}})}},async request=>{
    const owner=(await identity.resolve(request)).id;const {kind,id}=request.params;
    if(!request.body.followed){store.library.follow(owner,{id,kind,name:'',artwork:null,url:''},false);return {ok:true};}
    const {data}=await detail(kind,id);store.library.follow(owner,{id,kind,name:data.name,artwork:data.artwork,url:`https://music.youtube.com/browse/${encodeURIComponent(id)}`},true);return {ok:true};
  });
}
