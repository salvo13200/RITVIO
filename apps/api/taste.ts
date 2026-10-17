import type {FastifyInstance,FastifyRequest} from 'fastify';
import {createHash} from 'node:crypto';
import type {Store} from './store';
import type {ActivityStore} from './activity';
import type {IdentityProvider} from './identity';
import type {ResolverCatalog} from './catalog';
import type {Track} from '../../packages/domain/index';
import {isExcluded} from '../../packages/domain/listening';
import {defaultTasteSettings,tasteProfile,buildTasteMix,recentTasteVideos,type TasteSettings,type TasteInput,type TasteSnapshot,type TasteCandidate,type TasteMix,type MixRequest,type TasteFeedback} from '../../packages/domain/taste';
import {AppError} from './errors';
export class TasteStore{
  private flights=new Map<string,Promise<{added:number;failed:number}>>();
  constructor(private store:Store,private activity:ActivityStore,private catalog:ResolverCatalog){store.db.exec(`
    CREATE TABLE IF NOT EXISTS taste_settings(owner TEXT PRIMARY KEY REFERENCES library_profiles(id),data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS taste_feedback(owner TEXT NOT NULL REFERENCES library_profiles(id),media TEXT NOT NULL REFERENCES library_tracks(id),value INTEGER NOT NULL,PRIMARY KEY(owner,media));
    CREATE TABLE IF NOT EXISTS taste_candidates(owner TEXT NOT NULL REFERENCES library_profiles(id),media TEXT NOT NULL REFERENCES library_tracks(id),query TEXT NOT NULL,updated INTEGER NOT NULL,PRIMARY KEY(owner,media));
    CREATE TABLE IF NOT EXISTS taste_mixes(owner TEXT NOT NULL REFERENCES library_profiles(id),key TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(owner,key));
    CREATE TABLE IF NOT EXISTS taste_discovery(owner TEXT PRIMARY KEY REFERENCES library_profiles(id),updated INTEGER NOT NULL);`);}
  settings(owner:string):TasteSettings{this.store.library.getProfile(owner);const row=this.store.db.prepare('SELECT data FROM taste_settings WHERE owner=?').get(owner);return row?JSON.parse(String(row.data)):{...defaultTasteSettings};}
  update(owner:string,input:Omit<TasteSettings,'resetAt'>){const value={...input,resetAt:this.settings(owner).resetAt};this.save(owner,value);return value;}
  private save(owner:string,value:TasteSettings){this.store.db.prepare('INSERT OR REPLACE INTO taste_settings VALUES(?,?)').run(owner,JSON.stringify(value));this.store.db.prepare('DELETE FROM taste_mixes WHERE owner=?').run(owner);}
  reset(owner:string){const settings={...defaultTasteSettings,resetAt:Math.max(Date.now(),this.settings(owner).resetAt+1)};this.save(owner,settings);for(const table of ['taste_feedback','taste_candidates','taste_discovery'])this.store.db.prepare(`DELETE FROM ${table} WHERE owner=?`).run(owner);return settings;}
  feedback(owner:string,id:string,value:TasteFeedback){this.settings(owner);const track=this.candidates(owner).find(c=>c.track.id===id)?.track;if(!track)throw new AppError(404,'TASTE_TRACK_NOT_FOUND','Brano non presente nei candidati del tuo profilo.');this.store.library.saveTrack(track);if(value)this.store.db.prepare('INSERT OR REPLACE INTO taste_feedback VALUES(?,?,?)').run(owner,id,value);else this.store.db.prepare('DELETE FROM taste_feedback WHERE owner=? AND media=?').run(owner,id);this.store.db.prepare('DELETE FROM taste_mixes WHERE owner=?').run(owner);}
  input(owner:string):TasteInput{
    const settings=this.settings(owner),entries=this.activity.entries(owner);
    const likes=new Set(this.store.db.prepare('SELECT track FROM library_likes WHERE owner=?').all(owner).map(r=>String(r.track)));
    const saved=new Set(this.store.db.prepare('SELECT DISTINCT i.track FROM library_items i JOIN library_playlists p ON p.id=i.playlist WHERE p.owner=?').all(owner).map(r=>String(r.track)));
    const genres:Record<string,string[]>={};
    for(const row of this.store.db.prepare('SELECT target,selection,genres FROM metadata_choices WHERE owner=?').all(owner)){
      const values=row.genres!==null?JSON.parse(String(row.genres)):row.selection?JSON.parse(String(row.selection)).genre??[]:[];
      genres[String(row.target)]=values.map((g:{name:string})=>g.name);
    }
    const feedback=Object.fromEntries(this.store.db.prepare('SELECT media,value FROM taste_feedback WHERE owner=?').all(owner).map(r=>[String(r.media),Number(r.value) as TasteFeedback]));
    return {settings,entries,likes,saved,genres,feedback,now:Date.now()};
  }
  candidates(owner:string):TasteCandidate[]{
    this.settings(owner);this.store.db.prepare('DELETE FROM taste_candidates WHERE owner=? AND updated<?').run(owner,Date.now()-30*86400000);
    const own=this.store.db.prepare(`SELECT t.data FROM library_tracks t WHERE t.id IN (
      SELECT track FROM library_likes WHERE owner=? UNION SELECT i.track FROM library_items i JOIN library_playlists p ON p.id=i.playlist WHERE p.owner=?
      UNION SELECT media FROM listening_sessions WHERE owner=? AND excluded=0 AND json_extract(data,'$.startedAt')>=? AND json_extract(data,'$.listenedMs')>0
      UNION SELECT media FROM taste_feedback WHERE owner=?) LIMIT 20000`).all(owner,owner,owner,Math.max(this.settings(owner).resetAt,Date.now()-this.settings(owner).days*86400000),owner);
    const values=new Map<string,TasteCandidate>(own.map(r=>{const track=JSON.parse(String(r.data)) as Track;return [track.id,{track,discovered:false}];}));
    for(const row of this.store.db.prepare('SELECT t.data,c.query FROM taste_candidates c JOIN library_tracks t ON t.id=c.media WHERE c.owner=? ORDER BY c.updated DESC LIMIT 200').all(owner)){const track=JSON.parse(String(row.data)) as Track;if(!values.has(track.id))values.set(track.id,{track,discovered:true,query:String(row.query)});}
    return [...values.values()];
  }
  snapshot(owner:string):TasteSnapshot{const input=this.input(owner);const feedback=this.store.db.prepare('SELECT t.data,f.value FROM taste_feedback f JOIN library_tracks t ON t.id=f.media WHERE f.owner=?').all(owner).map(r=>({track:JSON.parse(String(r.data)) as Track,value:Number(r.value) as TasteFeedback}));return {settings:input.settings,profile:tasteProfile(input),candidateCount:this.candidates(owner).length,discoveredAt:Number(this.store.db.prepare('SELECT updated FROM taste_discovery WHERE owner=?').get(owner)?.updated??0)||null,privateMode:this.activity.settings(owner).privateMode,feedback};}
  mix(owner:string,request:MixRequest):TasteMix{
    const input=this.input(owner),date=new Date(input.now).toISOString().slice(0,10);
    // Listening grows during a day without reshuffling a prepared mix. Privacy,
    // exclusions, classification, explicit preferences and feedback invalidate it.
    const version={settings:input.settings,epoch:this.activity.settings(owner).epoch,excluded:input.entries.filter(e=>e.excluded).map(e=>e.id),likes:[...input.likes].sort(),saved:[...input.saved].sort(),genres:input.genres,feedback:input.feedback,filters:request.exclusions,kind:request.kind,genre:request.genre??null,date};
    const key=createHash('sha256').update(JSON.stringify(version)).digest('hex');
    const row=this.store.db.prepare('SELECT data FROM taste_mixes WHERE owner=? AND key=?').get(owner,key);
    const cached=row&&!request.refresh?JSON.parse(String(row.data)) as TasteMix:null;
    const result=cached?{...cached,cached:true}:buildTasteMix(input,this.candidates(owner),request,date);
    if(!cached){this.store.db.prepare('INSERT OR REPLACE INTO taste_mixes VALUES(?,?,?)').run(owner,key,JSON.stringify(result));this.store.db.prepare('DELETE FROM taste_mixes WHERE owner=? AND key NOT IN (SELECT key FROM taste_mixes WHERE owner=? ORDER BY rowid DESC LIMIT 10)').run(owner,owner);}
    // Recent listens may have changed since generation. Never serve newly excluded
    // or disliked items, even if an older snapshot remains in the database.
    const recent=recentTasteVideos(input);
    const items=result.items.filter(item=>!isExcluded(item.track,request.exclusions)&&input.feedback[item.track.id]!==-1&&(input.settings.allowRecent||!recent.has(item.track.videoId)));
    return {...result,items,discoveryCount:items.filter(i=>i.fresh).length};
  }
  discover(owner:string){
    const active=this.flights.get(owner);if(active)return active;
    const input=this.input(owner),privateMode=this.activity.settings(owner).privateMode;
    if(privateMode)throw new AppError(409,'TASTE_PRIVATE','Disattiva la sessione privata per cercare candidati dai tuoi gusti.');
    const last=Number(this.store.db.prepare('SELECT updated FROM taste_discovery WHERE owner=?').get(owner)?.updated??0);
    if(Date.now()-last<60000)throw new AppError(429,'TASTE_COOLDOWN','Attendi un minuto prima di cercare altri candidati.');
    const profile=tasteProfile(input),seeds=profile.artists.map(a=>a.name);
    if(!seeds.length)for(const c of this.candidates(owner))if(input.likes.has(c.track.id)||input.saved.has(c.track.id)||input.feedback[c.track.id]===1)seeds.push(...(c.track.artists?.map(a=>a.name)??[c.track.artist]));
    const queries=[...new Set(seeds.map(s=>s.trim()))].filter(s=>s.length>=3&&s.length<=190).slice(0,3);
    if(!queries.length)throw new AppError(409,'TASTE_NO_SEEDS','Ascolta o salva qualche brano prima di cercare nuovi candidati.');
    const resetAt=input.settings.resetAt,epoch=this.activity.settings(owner).epoch;
    this.store.db.prepare('INSERT OR REPLACE INTO taste_discovery VALUES(?,?)').run(owner,Date.now());
    const work=(async()=>{let added=0,failed=0;try{
      for(const query of queries){
        if(this.settings(owner).resetAt!==resetAt||this.activity.settings(owner).epoch!==epoch)return {added:0,failed:queries.length};
        try{const result=await this.catalog.search(query);
          // Do not restore derived data after a reset, history clear or privacy toggle.
          if(this.settings(owner).resetAt!==resetAt||this.activity.settings(owner).epoch!==epoch)return {added:0,failed:queries.length};
          for(const track of result.items){this.store.library.saveTrack(track);const exists=this.store.db.prepare('SELECT 1 FROM taste_candidates WHERE owner=? AND media=?').get(owner,track.id);this.store.db.prepare('INSERT OR REPLACE INTO taste_candidates VALUES(?,?,?,?)').run(owner,track.id,query,Date.now());if(!exists)added++;}
          if(result.cache.degraded)failed++;
        }catch{failed++;}
      }
      this.store.db.prepare('DELETE FROM taste_candidates WHERE owner=? AND media NOT IN (SELECT media FROM taste_candidates WHERE owner=? ORDER BY updated DESC,rowid DESC LIMIT 200)').run(owner,owner);
      this.store.db.prepare('DELETE FROM taste_mixes WHERE owner=?').run(owner);
      return {added,failed};
    }finally{this.flights.delete(owner);}})();this.flights.set(owner,work);return work;
  }
}
export function registerTaste(app:FastifyInstance,store:Store,identity:IdentityProvider,activity:ActivityStore,catalog:ResolverCatalog){
  const taste=new TasteStore(store,activity,catalog),owner=async(r:FastifyRequest)=>(await identity.resolve(r)).id;
  const object=(properties:Record<string,unknown>,required=Object.keys(properties))=>({type:'object',additionalProperties:false,required,properties});
  const string=(maxLength:number)=>({type:'string',minLength:1,maxLength});
  app.get('/v1/me/taste',async r=>taste.snapshot(await owner(r)));
  app.put<{Body:Omit<TasteSettings,'resetAt'>}>('/v1/me/taste/settings',{schema:{body:object({days:{enum:[30,90,180]},genreLevel:{enum:['artist','track']},discoveryPercent:{enum:[25,50,75]},allowRecent:{type:'boolean'},variety:{type:'boolean'}})}},async r=>taste.update(await owner(r),r.body));
  app.delete('/v1/me/taste',async r=>taste.reset(await owner(r)));
  app.put<{Params:{id:string};Body:{value:TasteFeedback}}>('/v1/me/taste/feedback/:id',{schema:{params:object({id:{type:'string',pattern:'^[a-fA-F0-9-]{36}$'}}),body:object({value:{enum:[-1,0,1]}})}},async r=>{taste.feedback(await owner(r),r.params.id,r.body.value);return {ok:true};});
  app.post('/v1/me/taste/discover',async r=>taste.discover(await owner(r)));
  app.post<{Body:MixRequest}>('/v1/me/taste/mix',{bodyLimit:8*1024*1024,schema:{body:object({kind:{enum:['familiar','discovery','genre']},genre:string(60),refresh:{type:'boolean'},exclusions:object({tracks:{type:'array',maxItems:5000,items:object({videoId:{type:'string',pattern:'^[A-Za-z0-9_-]{11}$'},title:string(500),artist:string(500)})},artists:{type:'array',maxItems:5000,items:object({id:string(500),name:string(500),match:{enum:['id','name']}})}})},['kind','exclusions'])}},async r=>{if(r.body.kind==='genre'&&!r.body.genre)throw new AppError(400,'TASTE_GENRE_REQUIRED','Scegli un genere confermato.');return taste.mix(await owner(r),r.body);});
  return taste;
}
