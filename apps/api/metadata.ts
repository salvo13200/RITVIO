import {version} from '../../package.json';
import type {FastifyInstance} from 'fastify';
import type {Store} from './store';
import type {ContentResolver} from './resolver';
import type {IdentityProvider} from './identity';
import type {CatalogDetail} from '../../packages/domain/catalog';
import {compareMetadata,normalizeGenres,type MetadataKind,type MetadataTarget,type MetadataCandidate,type MetadataSnapshot} from '../../packages/domain/metadata';
import {AppError} from './errors';
export type MetadataOptions={fetch?:typeof fetch;delay?:(ms:number)=>Promise<void>;now?:()=>number};
type Cache={items:Omit<MetadataCandidate,'quality'|'matches'>[];fetched:number;expires:number;degraded:boolean};
export function registerMetadata(app:FastifyInstance,store:Store,resolver:ContentResolver,identity:IdentityProvider,options:MetadataOptions={}){
  const now=options.now??Date.now,wait=options.delay??(ms=>new Promise<void>(resolve=>setTimeout(resolve,ms))),fetcher=options.fetch??fetch;
  store.db.exec(`CREATE TABLE IF NOT EXISTS metadata_cache(key TEXT PRIMARY KEY,data TEXT NOT NULL,fetched INTEGER NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS metadata_choices(owner TEXT NOT NULL REFERENCES library_profiles(id),target TEXT NOT NULL,selection TEXT,genres TEXT,updated INTEGER NOT NULL,PRIMARY KEY(owner,target));
    CREATE TABLE IF NOT EXISTS metadata_searches(owner TEXT NOT NULL REFERENCES library_profiles(id),target TEXT NOT NULL,data TEXT NOT NULL,fetched INTEGER NOT NULL,expires INTEGER NOT NULL,PRIMARY KEY(owner,target));`);
  let closed=false,lastStart=0,cooldown=0,pending=0,tail:Promise<unknown>=Promise.resolve();
  const flights=new Map<string,Promise<Cache>>();
  app.addHook('preClose',async()=>{closed=true;});
  const targetKey=(kind:MetadataKind,id:string)=>`${kind}:${id}`;
  async function target(kind:MetadataKind,id:string):Promise<MetadataTarget>{
    if(kind==='track'){const track=store.getTrack(id);if(!track)throw new AppError(404,'MEDIA_NOT_FOUND','Brano non disponibile. Ripeti la ricerca.');return {kind,id,name:track.title,artists:track.artists?.map(a=>a.name)??[track.artist.replace(/ - Topic$/,'')],year:null,duration:track.duration||null};}
    const row=store.db.prepare('SELECT data FROM catalog_pages WHERE key=?').get(JSON.stringify(['detail-v1',kind,id]));
    const data:CatalogDetail=row?JSON.parse(String(row.data)):await resolver.detail!(kind,id);
    return {kind,id,name:data.name,artists:kind==='artist'?[data.name]:data.artists.map(a=>a.name),year:data.year,duration:null};
  }
  function parse(raw:any,kind:MetadataKind):Omit<MetadataCandidate,'quality'|'matches'>[]{
    if(!Array.isArray(raw?.results))throw new AppError(502,'METADATA_INVALID','Risposta metadati non valida. Riprova più tardi.');
    const result:Omit<MetadataCandidate,'quality'|'matches'>[]=[];
    for(const item of raw.results.slice(0,40)){
      if(kind==='artist'?item.wrapperType!=='artist':kind==='album'?item.wrapperType!=='collection':item.kind!=='song')continue;
      const id=kind==='artist'?item.artistId:kind==='album'?item.collectionId:item.trackId;
      const name=kind==='artist'?item.artistName:kind==='album'?item.collectionName:item.trackName;
      if(!Number.isSafeInteger(id)||id<1||typeof name!=='string'||!name.trim()||name.length>300||result.some(c=>c.id===id))continue;
      result.push({id,kind,name,artist:typeof item.artistName==='string'?item.artistName.slice(0,300):'',genre:normalizeGenres(typeof item.primaryGenreName==='string'?[item.primaryGenreName]:[]),year:typeof item.releaseDate==='string'&&/^\d{4}-/.test(item.releaseDate)?item.releaseDate.slice(0,4):null,duration:typeof item.trackTimeMillis==='number'&&item.trackTimeMillis>0&&item.trackTimeMillis<=86400000?item.trackTimeMillis/1000:null,album:typeof item.collectionName==='string'?item.collectionName.slice(0,300):null});
    }return result;
  }
  async function search(kind:MetadataKind,query:string):Promise<Cache>{
    const key=JSON.stringify(['itunes-v1','US',kind,query.toLocaleLowerCase('it-IT')]),time=now();
    const row=store.db.prepare('SELECT * FROM metadata_cache WHERE key=? AND fetched>?').get(key,time-30*86400000);
    const read=():Cache=>({items:JSON.parse(String(row!.data)),fetched:Number(row!.fetched),expires:Number(row!.expires),degraded:false});
    if(row&&Number(row.expires)>time)return read();
    if(flights.has(key))return flights.get(key)!;
    if(pending>=6)throw new AppError(429,'METADATA_BUSY','Sono già in corso altre ricerche di metadati. Attendi e riprova.');
    pending++;
    const work=tail.then(async()=>{
      try{
        if(closed)throw new AppError(503,'METADATA_CLOSED','Il servizio locale si sta chiudendo.');
        if(cooldown>now())throw new AppError(429,'METADATA_LIMIT','iTunes richiede una pausa. Riprova tra poco.');
        await wait(Math.max(0,lastStart+3200-now()));if(closed)throw new AppError(503,'METADATA_CLOSED','Il servizio locale si sta chiudendo.');lastStart=now();
        const url=new URL('https://itunes.apple.com/search');url.search=new URLSearchParams({term:query,media:'music',entity:kind==='artist'?'musicArtist':kind==='album'?'album':'song',country:'US',limit:'40',lang:'en_us'}).toString();
        const response=await fetcher(url,{headers:{'User-Agent':`RITVIO/${version}`,'Accept':'application/json'},signal:AbortSignal.timeout(10000),redirect:'error'});
        if(!response.ok){if(response.status===429||response.status>=500){const retry=Number(response.headers.get('retry-after'));cooldown=now()+Math.min(300000,Math.max(60000,Number.isFinite(retry)?retry*1000:0));}throw new AppError(response.status===429?429:502,'METADATA_UNAVAILABLE','iTunes non è disponibile. I dati locali restano salvati: riprova più tardi.');}
        const reader=response.body?.getReader();if(!reader)throw new Error('Empty response');let size=0;const parts:Uint8Array[]=[];
        try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1024*1024)throw new Error('Response too large');parts.push(value);}}finally{await reader.cancel().catch(()=>{});}
        const items=parse(JSON.parse(Buffer.concat(parts).toString('utf8')),kind),fetched=now(),expires=fetched+(items.length?7*86400000:3600000);
        if(closed)throw new AppError(503,'METADATA_CLOSED','Il servizio locale si sta chiudendo.');
        store.db.prepare('INSERT OR REPLACE INTO metadata_cache VALUES(?,?,?,?)').run(key,JSON.stringify(items),fetched,expires);
        store.db.exec('DELETE FROM metadata_cache WHERE key IN (SELECT key FROM metadata_cache ORDER BY fetched DESC,rowid DESC LIMIT -1 OFFSET 500)');
        return {items,fetched,expires,degraded:false};
      }catch(error){if(row&&!closed)return {...read(),degraded:true};if(error instanceof AppError)throw error;throw new AppError(502,'METADATA_UNAVAILABLE','La ricerca iTunes non risponde. Riprova più tardi; i tuoi generi locali restano salvati.');}
      finally{pending--;flights.delete(key);}
    });tail=work.catch(()=>{});flights.set(key,work);return work;
  }
  function snapshot(owner:string,resource:MetadataTarget,degraded=false):MetadataSnapshot{
    const key=targetKey(resource.kind,resource.id),choice=store.db.prepare('SELECT * FROM metadata_choices WHERE owner=? AND target=?').get(owner,key),searched=store.db.prepare('SELECT * FROM metadata_searches WHERE owner=? AND target=?').get(owner,key);
    const selected=choice?.selection?JSON.parse(String(choice.selection)):null,localGenres=choice?.genres!==null&&choice?.genres!==undefined?JSON.parse(String(choice.genres)):null;
    const candidates:MetadataCandidate[]=searched?JSON.parse(String(searched.data)):[];
    return {target:resource,selected,localGenres,candidates,genres:localGenres??selected?.genre??[],status:localGenres!==null?'local':selected?'confirmed':candidates.length?'suggested':'unclassified',updatedAt:choice?new Date(Number(choice.updated)).toISOString():null,cache:searched?{fetchedAt:new Date(Number(searched.fetched)).toISOString(),expiresAt:new Date(Number(searched.expires)).toISOString(),stale:Number(searched.expires)<=now(),degraded}:null};
  }
  function change(owner:string,key:string,field:'selection'|'genres',value:unknown){
    if(!store.db.prepare('SELECT 1 FROM metadata_choices WHERE owner=? AND target=?').get(owner,key)&&Number(store.db.prepare('SELECT count(*) n FROM metadata_choices WHERE owner=?').get(owner)!.n)>=10000)throw new AppError(400,'METADATA_LIMIT','Limite di 10.000 risorse con metadati personali raggiunto.');
    store.db.prepare('INSERT OR IGNORE INTO metadata_choices(owner,target,updated) VALUES(?,?,?)').run(owner,key,now());
    store.db.prepare(`UPDATE metadata_choices SET ${field}=?,updated=? WHERE owner=? AND target=?`).run(value===null?null:JSON.stringify(value),now(),owner,key);
  }
  const schema=(properties:Record<string,unknown>,required=Object.keys(properties))=>({type:'object',additionalProperties:false,properties,required});
  const params=schema({kind:{type:'string',enum:['artist','album','track']},id:{type:'string',pattern:'^[A-Za-z0-9_-]{1,160}$'}}),base='/v1/me/metadata/:kind/:id';
  type Params={kind:MetadataKind;id:string};
  async function context(request:{params:Params}){const owner=(await identity.resolve(request as any)).id;return {owner,resource:await target(request.params.kind,request.params.id)};}
  app.get<{Params:Params}>(base,{schema:{params}},async r=>{const {owner,resource}=await context(r);return snapshot(owner,resource);});
  app.post<{Params:Params;Body:{query?:string}}>(base+'/search',{schema:{params,body:schema({query:{type:'string',minLength:3,maxLength:200}},[])}},async r=>{
    const {owner,resource}=await context(r),query=(r.body.query??[resource.kind==='artist'?'':resource.artists.join(' '),resource.name].filter(Boolean).join(' ')).normalize('NFC').trim().replace(/\s+/g,' ').slice(0,200);
    if(query.length<3)throw new AppError(400,'INVALID_REQUEST','Inserisci almeno tre caratteri per cercare metadati.');
    const found=await search(resource.kind,query);const items=found.items.map(item=>compareMetadata(item,resource)).sort((a,b)=>['strong','partial','weak'].indexOf(a.quality)-['strong','partial','weak'].indexOf(b.quality)).slice(0,20);
    store.db.prepare('INSERT OR REPLACE INTO metadata_searches VALUES(?,?,?,?,?)').run(owner,targetKey(resource.kind,resource.id),JSON.stringify(items),found.fetched,found.expires);
    store.db.prepare('DELETE FROM metadata_searches WHERE owner=? AND target IN (SELECT target FROM metadata_searches WHERE owner=? ORDER BY fetched DESC,rowid DESC LIMIT -1 OFFSET 500)').run(owner,owner);
    return snapshot(owner,resource,found.degraded);
  });
  app.put<{Params:Params;Body:{providerId:number}}>(base+'/selection',{schema:{params,body:schema({providerId:{type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER}})}},async r=>{
    const {owner,resource}=await context(r),key=targetKey(resource.kind,resource.id),row=store.db.prepare('SELECT data FROM metadata_searches WHERE owner=? AND target=?').get(owner,key);
    const candidate:MetadataCandidate|undefined=row?JSON.parse(String(row.data)).find((c:MetadataCandidate)=>c.id===r.body.providerId):undefined;
    if(!candidate)throw new AppError(400,'METADATA_SELECTION','Cerca i metadati e scegli uno dei risultati disponibili.');
    change(owner,key,'selection',candidate);return snapshot(owner,resource);
  });
  app.put<{Params:Params;Body:{genres:string[]}}>(base+'/genres',{schema:{params,body:schema({genres:{type:'array',maxItems:20,items:{type:'string',minLength:1,maxLength:60}}})}},async r=>{const {owner,resource}=await context(r);change(owner,targetKey(resource.kind,resource.id),'genres',normalizeGenres(r.body.genres));return snapshot(owner,resource);});
  for(const field of ['selection','genres'] as const)app.delete<{Params:Params}>(base+'/'+field,{schema:{params}},async r=>{const {owner,resource}=await context(r);change(owner,targetKey(resource.kind,resource.id),field,null);return snapshot(owner,resource);});
}
