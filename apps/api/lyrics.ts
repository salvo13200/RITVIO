import {version} from '../../package.json';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import type {Store} from './store';
import type {IdentityProvider} from './identity';
import type {Track} from '../../packages/domain/index';
import {parseLyrics,type LyricsDocument,type LyricsResponse,type LyricsCandidate,type LyricsFormat} from '../../packages/domain/lyrics';
import {AppError} from './errors';

type RecordData={id:number;trackName:string;artistName:string;albumName:string;duration:number;instrumental:boolean;plainLyrics?:string|null;syncedLyrics?:string|null};
type Options={fetch?:typeof fetch;now?:()=>number;delay?:(ms:number)=>Promise<void>};
const signature=(value:string)=>value.normalize('NFKC').toLocaleLowerCase('en').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const artistName=(track:Track)=>track.artist.replace(/\s*-\s*Topic$/i,'').trim();
const trackName=(track:Track)=>track.title.replace(/\s*[([](?:official\s+(?:audio|video|music video)|lyrics?|lyric video|audio)[)\]]\s*$/i,'').trim();
const result=(document:LyricsDocument|null,cacheHit=false,savedChoice=false):LyricsResponse=>({status:document?(document.instrumental?'instrumental':'ready'):'missing',document,cacheHit,savedChoice});
export function registerLyricsRoutes(app:FastifyInstance,store:Store,identity:IdentityProvider,options:Options={}){
  store.db.exec(`CREATE TABLE IF NOT EXISTS lyrics_cache(key TEXT PRIMARY KEY,data TEXT NOT NULL,expires INTEGER NOT NULL,created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS lyrics_overrides(owner TEXT NOT NULL,video TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(owner,video));`);
  const now=options.now??Date.now,fetcher=options.fetch??fetch,delay=options.delay??(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
  let tail:Promise<unknown>=Promise.resolve(),nextAt=0,blockedUntil=0,closed=false,pending=0;
  const active=new Set<AbortController>(),inflight=new Map<string,Promise<LyricsResponse>>();
  app.addHook('preClose',async()=>{closed=true;for(const controller of active)controller.abort();});
  const owner=async(req:FastifyRequest)=>(await identity.resolve(req)).id;
  const track=(id:string)=>{const found=store.getTrack(id)??store.library.getTrack(id);if(!found)throw new AppError(404,'MEDIA_NOT_FOUND','Cerca nuovamente il brano prima di aprire i testi.');return found;};
  const cache=(key:string):{found:boolean;document:LyricsDocument|null}=>{
    const row=store.db.prepare('SELECT data FROM lyrics_cache WHERE key=? AND expires>?').get(key,now());
    return row?{found:true,document:JSON.parse(String(row.data))}:{found:false,document:null};
  };
  const saveCache=(key:string,document:LyricsDocument|null)=>{
    if(closed)throw new AppError(503,'LYRICS_UNAVAILABLE','Il servizio dei testi si sta chiudendo.');
    store.db.prepare('INSERT OR REPLACE INTO lyrics_cache VALUES(?,?,?,?)').run(key,JSON.stringify(document),now()+(document?7*86400000:6*3600000),now());
    store.db.prepare('DELETE FROM lyrics_cache WHERE key NOT IN (SELECT key FROM lyrics_cache ORDER BY created DESC LIMIT 1000)').run();
  };
  const override=(who:string,item:Track,document:LyricsDocument)=>{
    const count=Number(store.db.prepare('SELECT count(*) n FROM lyrics_overrides WHERE owner=?').get(who)!.n);
    if(count>=1000&&!store.db.prepare('SELECT 1 FROM lyrics_overrides WHERE owner=? AND video=?').get(who,item.videoId))throw new AppError(400,'LYRICS_LIMIT','Puoi conservare fino a 1.000 testi personali. Rimuovine uno prima di aggiungerne altri.');
    store.db.prepare('INSERT INTO lyrics_overrides VALUES(?,?,?) ON CONFLICT(owner,video) DO UPDATE SET data=excluded.data').run(who,item.videoId,JSON.stringify(document));
  };
  async function remote(path:string):Promise<unknown|null>{
    if(pending>=8)throw new AppError(503,'LYRICS_BUSY','Ci sono già diverse ricerche di testi in corso. Attendi qualche secondo.');
    pending++;
    const run=tail.then(async()=>{
      if(closed)throw new AppError(503,'LYRICS_UNAVAILABLE','Il servizio dei testi si sta chiudendo.');
      if(blockedUntil>now())throw new AppError(429,'LYRICS_RATE_LIMIT','La fonte dei testi richiede una pausa. Riprova più tardi.',new Date(blockedUntil).toISOString());
      if(nextAt>now())await delay(nextAt-now());
      if(closed)throw new AppError(503,'LYRICS_UNAVAILABLE','Il servizio dei testi si sta chiudendo.');
      const controller=new AbortController();active.add(controller);const timer=setTimeout(()=>controller.abort(),10000);
      try{
        const response=await fetcher(`https://lrclib.net/api/${path}`,{signal:controller.signal,redirect:'error',headers:{'User-Agent':`RITVIO/${version} (private Windows desktop client)`,'Accept':'application/json'}});
        if(response.status===429){
          const retry=response.headers.get('retry-after');const seconds=retry&&/^\d+$/.test(retry)?Number(retry):retry?Math.ceil((Date.parse(retry)-now())/1000):60;
          blockedUntil=now()+Math.max(1000,Math.min(86400000,Number.isFinite(seconds)?seconds*1000:60000));
          await response.body?.cancel();throw new AppError(429,'LYRICS_RATE_LIMIT','La fonte dei testi richiede una pausa. Riprova più tardi.',new Date(blockedUntil).toISOString());
        }
        if(response.status===404){await response.body?.cancel();return null;}
        if(!response.ok){await response.body?.cancel();throw Error('Provider unavailable');}
        const reader=response.body?.getReader();if(!reader)throw Error('Empty response');
        const chunks:Uint8Array[]=[];let size=0;
        try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>2_000_000){await reader.cancel();throw Error('Provider response too large');}chunks.push(value);}}finally{reader.releaseLock();}
        return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
      }catch(error){if(error instanceof AppError)throw error;throw new AppError(503,'LYRICS_UNAVAILABLE','La fonte dei testi non risponde. Puoi riprovare o importare un file LRC/TXT.');}
      finally{clearTimeout(timer);active.delete(controller);nextAt=now()+300;}
    });
    tail=run.catch(()=>{});try{return await run;}finally{pending--;}
  }
  function record(value:unknown):RecordData{
    if(!value||typeof value!=='object')throw new AppError(503,'LYRICS_INVALID_RESPONSE','La fonte ha restituito un testo non valido.');
    const r=value as RecordData;
    if(!Number.isSafeInteger(r.id)||r.id<1||typeof r.trackName!=='string'||typeof r.artistName!=='string'||r.trackName.length>1000||r.artistName.length>1000||typeof r.instrumental!=='boolean'||!Number.isFinite(r.duration)||r.duration<0||r.duration>86400)throw new AppError(503,'LYRICS_INVALID_RESPONSE','La fonte ha restituito dati non validi.');
    return {...r,albumName:typeof r.albumName==='string'?r.albumName.slice(0,1000):''};
  }
  function document(r:RecordData):LyricsDocument|null{
    let parsed={plainText:'',lines:[] as LyricsDocument['lines'],offsetMs:0};
    if(!r.instrumental){
      try{if(typeof r.syncedLyrics==='string'&&r.syncedLyrics.trim())parsed=parseLyrics(r.syncedLyrics,'lrc');}catch{/* Plain lyrics can still be valid when timing data is malformed. */}
      if(!parsed.lines.length){if(typeof r.plainLyrics!=='string'||!r.plainLyrics.trim())return null;try{parsed=parseLyrics(r.plainLyrics,'txt');}catch{return null;}}
    }
    return {...parsed,provider:'lrclib',providerId:r.id,title:r.trackName,artist:r.artistName,fileName:null,instrumental:r.instrumental,fetchedAt:new Date(now()).toISOString(),licenseVerified:false};
  }
  const matches=(r:RecordData,item:Track)=>signature(r.trackName)===signature(trackName(item))&&signature(r.artistName)===signature(artistName(item))&&item.duration>0&&Math.abs(r.duration-item.duration)<=2;
  async function automatic(item:Track,fresh=false):Promise<LyricsResponse>{
    const key=JSON.stringify([trackName(item),artistName(item),item.album?.name??'',item.duration]);const hit=cache(key);
    if(hit.found&&!fresh)return result(hit.document,true);
    const running=inflight.get(key);if(running)return running;
    const task=(async()=>{
      const params=new URLSearchParams({track_name:trackName(item),artist_name:artistName(item),...(item.album?.name?{album_name:item.album.name}:{}),...(item.duration>0&&item.duration<=3600?{duration:String(item.duration)}:{})});
      const value=await remote(`get?${params}`);let found:LyricsDocument|null=null;
      if(value){const r=record(value);if(matches(r,item))found=document(r);}
      if(!found){const records=await remote(`search?${new URLSearchParams({track_name:trackName(item),artist_name:artistName(item)})}`);
        if(records!==null&&!Array.isArray(records))throw new AppError(503,'LYRICS_INVALID_RESPONSE','La fonte ha restituito dati non validi.');
        const exact=(Array.isArray(records)?records:[]).slice(0,20).map(record).filter(r=>matches(r,item));
        // Two equally plausible editions need the listener's explicit selection.
        if(exact.length===1)found=document(exact[0]);
      }
      saveCache(key,found);return result(found);
    })();inflight.set(key,task);try{return await task;}finally{inflight.delete(key);}
  }
  const uuid={type:'string',pattern:'^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'};
  const params={type:'object',additionalProperties:false,required:['mediaId'],properties:{mediaId:uuid}};
  const base='/v1/me/lyrics/:mediaId';
  app.get<{Params:{mediaId:string};Querystring:{fresh?:string}}>(base,{schema:{params,querystring:{type:'object',additionalProperties:false,properties:{fresh:{type:'string',enum:['true']}}}}},async req=>{
    const who=await owner(req),item=track(req.params.mediaId),row=store.db.prepare('SELECT data FROM lyrics_overrides WHERE owner=? AND video=?').get(who,item.videoId);
    return row?result(JSON.parse(String(row.data)),true,true):automatic(item,req.query.fresh==='true');
  });
  app.get<{Params:{mediaId:string};Querystring:{title:string;artist:string}}>(`${base}/search`,{schema:{params,querystring:{type:'object',additionalProperties:false,required:['title','artist'],properties:{title:{type:'string',minLength:1,maxLength:200},artist:{type:'string',minLength:1,maxLength:200}}}}},async req=>{
    await owner(req);track(req.params.mediaId);
    const values=await remote(`search?${new URLSearchParams({track_name:req.query.title,artist_name:req.query.artist})}`);
    if(values!==null&&!Array.isArray(values))throw new AppError(503,'LYRICS_INVALID_RESPONSE','La fonte ha restituito dati non validi.');
    return {items:(Array.isArray(values)?values:[]).slice(0,20).map(record).map((r):LyricsCandidate=>({id:r.id,title:r.trackName,artist:r.artistName,album:r.albumName,duration:r.duration,instrumental:r.instrumental,synced:typeof r.syncedLyrics==='string'&&!!r.syncedLyrics.trim()}))};
  });
  app.post<{Params:{mediaId:string};Body:{providerId:number}}>(`${base}/select`,{schema:{params,body:{type:'object',additionalProperties:false,required:['providerId'],properties:{providerId:{type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER}}}}},async req=>{
    const who=await owner(req),item=track(req.params.mediaId),value=await remote(`get/${req.body.providerId}`);
    if(!value)throw new AppError(404,'LYRICS_NOT_FOUND','Questo testo non è più disponibile.');
    const r=record(value);if(r.id!==req.body.providerId)throw new AppError(503,'LYRICS_INVALID_RESPONSE','La fonte ha restituito un testo diverso da quello scelto.');
    const selected=document(r);if(!selected)throw new AppError(404,'LYRICS_NOT_FOUND','Questo risultato non contiene testo leggibile.');
    override(who,item,selected);return result(selected,false,true);
  });
  app.put<{Params:{mediaId:string};Body:{text:string;format:LyricsFormat;fileName:string}}>(base,{bodyLimit:1_300_000,schema:{params,body:{type:'object',additionalProperties:false,required:['text','format','fileName'],properties:{text:{type:'string',minLength:1,maxLength:200000},format:{type:'string',enum:['txt','lrc']},fileName:{type:'string',minLength:1,maxLength:100}}}}},async req=>{
    const who=await owner(req),item=track(req.params.mediaId);let parsed;
    try{parsed=parseLyrics(req.body.text,req.body.format);}catch(error){throw new AppError(400,(error as Error).message,(error as Error).message==='LYRICS_TOO_LARGE'?'Il testo supera il limite di 200 KB o 5.000 righe sincronizzate.':'Scegli un file TXT con testo o un LRC con timestamp validi.');}
    const saved:LyricsDocument={...parsed,provider:'local',providerId:null,title:item.title,artist:item.artist,fileName:req.body.fileName,instrumental:false,fetchedAt:new Date(now()).toISOString(),licenseVerified:null};override(who,item,saved);return result(saved,false,true);
  });
  app.delete<{Params:{mediaId:string}}>(base,{schema:{params}},async req=>{const who=await owner(req),item=track(req.params.mediaId);store.db.prepare('DELETE FROM lyrics_overrides WHERE owner=? AND video=?').run(who,item.videoId);return{ok:true};});
}
