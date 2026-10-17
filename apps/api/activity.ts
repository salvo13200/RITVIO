import type {FastifyInstance,FastifyRequest} from 'fastify';
import type {Store} from './store';
import type {IdentityProvider} from './identity';
import type {ActivityCheckpoint,ActivityEntry,ActivitySettings,ActivitySnapshot} from '../../packages/domain/activity';
import {AppError} from './errors';
const day=86400000;
export class ActivityStore {
  constructor(private store:Store){
    if(!store.db.prepare('PRAGMA table_info(library_history)').all().some(row=>row.name==='measured'))store.db.exec('ALTER TABLE library_history ADD COLUMN measured INTEGER NOT NULL DEFAULT 0');
    store.db.exec(`CREATE TABLE IF NOT EXISTS listening_settings(owner TEXT PRIMARY KEY REFERENCES library_profiles(id),private INTEGER NOT NULL DEFAULT 0,retention INTEGER NOT NULL DEFAULT 180,epoch INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS listening_sessions(owner TEXT NOT NULL REFERENCES library_profiles(id),id TEXT NOT NULL,media TEXT NOT NULL REFERENCES library_tracks(id),data TEXT NOT NULL,updated INTEGER NOT NULL,excluded INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(owner,id));
      CREATE INDEX IF NOT EXISTS listening_sessions_updated ON listening_sessions(owner,updated);`);
    // A process exit cannot manufacture a completion or a skip.
    const rows=store.db.prepare('SELECT owner,id,data FROM listening_sessions').all();
    const update=store.db.prepare('UPDATE listening_sessions SET data=? WHERE owner=? AND id=?');
    for(const row of rows){const data=JSON.parse(String(row.data)) as ActivityCheckpoint;if(!data.closed)update.run(JSON.stringify({...data,closed:true,reason:'interrupted'}),String(row.owner),String(row.id));}
  }
  settings(owner:string):ActivitySettings{
    this.store.library.getProfile(owner);
    this.store.db.prepare('INSERT OR IGNORE INTO listening_settings(owner) VALUES(?)').run(owner);
    const row=this.store.db.prepare('SELECT * FROM listening_settings WHERE owner=?').get(owner)!;
    return {privateMode:!!row.private,retentionDays:Number(row.retention) as ActivitySettings['retentionDays'],epoch:Number(row.epoch)};
  }
  private prune(owner:string,days:number){
    this.store.db.prepare('DELETE FROM library_history WHERE owner=? AND measured=1 AND played<?').run(owner,Date.now()-days*day);
    this.store.db.prepare('DELETE FROM listening_sessions WHERE owner=? AND updated<?').run(owner,Date.now()-days*day);
    this.store.db.prepare('DELETE FROM listening_sessions WHERE owner=? AND id NOT IN (SELECT id FROM listening_sessions WHERE owner=? ORDER BY updated DESC,rowid DESC LIMIT 20000)').run(owner,owner);
  }
  changeSettings(owner:string,privateMode:boolean,retentionDays:ActivitySettings['retentionDays']){
    const old=this.settings(owner);
    if(privateMode!==old.privateMode){
      const rows=this.store.db.prepare('SELECT id,data FROM listening_sessions WHERE owner=?').all(owner);
      for(const row of rows){if(!(JSON.parse(String(row.data)) as ActivityCheckpoint).closed){this.store.db.prepare('DELETE FROM listening_sessions WHERE owner=? AND id=?').run(owner,String(row.id));this.store.db.prepare('DELETE FROM library_history WHERE owner=? AND id=?').run(owner,String(row.id));}}
    }
    this.store.db.prepare('UPDATE listening_settings SET private=?,retention=?,epoch=? WHERE owner=?').run(Number(privateMode),retentionDays,old.epoch+(privateMode!==old.privateMode?1:0),owner);
    this.prune(owner,retentionDays);return this.settings(owner);
  }
  checkpoint(owner:string,input:ActivityCheckpoint){
    const settings=this.settings(owner);
    if(settings.privateMode||settings.epoch!==input.epoch)return {accepted:false,epoch:settings.epoch};
    const now=Date.now();
    if(input.updatedAt<input.startedAt||input.updatedAt>now+60000||input.startedAt<now-settings.retentionDays*day||input.listenedMs>input.updatedAt-input.startedAt+1000||input.closed!==(input.reason!==null))throw new AppError(400,'INVALID_LISTENING','Sessione di ascolto non valida.');
    const row=this.store.db.prepare('SELECT data FROM listening_sessions WHERE owner=? AND id=?').get(owner,input.id);
    if(row){const previous=JSON.parse(String(row.data)) as ActivityCheckpoint;
      if(previous.mediaId!==input.mediaId||previous.startedAt!==input.startedAt)throw new AppError(409,'LISTENING_CONFLICT','Identità della sessione di ascolto diversa.');
      if(previous.sequence>=input.sequence)return {accepted:true,epoch:settings.epoch};
      if(input.listenedMs<previous.listenedMs||input.seeks<previous.seeks||input.updatedAt<previous.updatedAt||(previous.closed&&previous.reason!=='interrupted'&&!input.closed))throw new AppError(409,'LISTENING_CONFLICT','La sessione di ascolto è già stata aggiornata.');
    }
    const track=this.store.getTrack(input.mediaId);if(!track)throw new AppError(404,'MEDIA_NOT_FOUND','Brano non disponibile. Ripeti la ricerca.');
    this.store.library.saveTrack(track);
    this.store.db.prepare('INSERT INTO listening_sessions(owner,id,media,data,updated) VALUES(?,?,?,?,?) ON CONFLICT(owner,id) DO UPDATE SET data=excluded.data,updated=excluded.updated').run(owner,input.id,input.mediaId,JSON.stringify(input),input.updatedAt);
    if(input.listenedMs>0){this.store.library.record(owner,track,input.id);this.store.db.prepare('UPDATE library_history SET measured=1 WHERE owner=? AND id=?').run(owner,input.id);}
    this.prune(owner,settings.retentionDays);return {accepted:true,epoch:settings.epoch};
  }
  exclude(owner:string,id:string,value:boolean){this.settings(owner);const result=this.store.db.prepare('UPDATE listening_sessions SET excluded=? WHERE owner=? AND id=?').run(Number(value),owner,id);if(!result.changes)throw new AppError(404,'LISTENING_NOT_FOUND','Sessione non trovata.');}
  clear(owner:string){this.settings(owner);this.store.library.clearHistory(owner);return this.settings(owner);}
  entries(owner:string):ActivityEntry[]{
    const settings=this.settings(owner);this.prune(owner,settings.retentionDays);
    const rows=this.store.db.prepare('SELECT s.*,t.data track FROM listening_sessions s JOIN library_tracks t ON t.id=s.media WHERE s.owner=? ORDER BY s.updated ASC,s.rowid ASC').all(owner);
    const previous=new Map<string,number[]>();
    return rows.map(row=>{const data=JSON.parse(String(row.data)) as ActivityCheckpoint,track=JSON.parse(String(row.track));
      const recent=(previous.get(data.mediaId)??[]).filter(time=>data.startedAt-time>=0&&data.startedAt-time<30*60000);
      const excluded=!!row.excluded,replay=recent.length>0;const tasteWeight=excluded?0:recent.length===0?1:recent.length===1?.25:0;
      if(!excluded&&data.listenedMs>0)previous.set(data.mediaId,[...recent,data.startedAt]);
      return {...data,track,excluded,replay,tasteWeight} as ActivityEntry;
    });
  }
  snapshot(owner:string):ActivitySnapshot{
    const settings=this.settings(owner),all=this.entries(owner);
    const count=(reason:string)=>all.filter(item=>item.reason===reason).length;
    return {settings,items:all.slice(-100).reverse(),summary:{sessions:all.length,listenedMs:all.reduce((n,item)=>n+item.listenedMs,0),completed:count('completed'),skips:count('skip'),errors:count('error'),interrupted:count('interrupted'),replays:all.filter(item=>item.replay||item.reason==='replay').length,excluded:all.filter(item=>item.excluded).length},legacyStarts:Number(this.store.db.prepare('SELECT count(*) n FROM library_history WHERE owner=? AND measured=0').get(owner)!.n)};
  }
}
export function registerActivity(app:FastifyInstance,store:Store,identity:IdentityProvider){
  const activity=new ActivityStore(store),owner=async(r:FastifyRequest)=>(await identity.resolve(r)).id;
  const uuid={type:'string',pattern:'^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'};
  const object=(properties:Record<string,unknown>)=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
  const integer=(max:number)=>({type:'integer',minimum:0,maximum:max});
  app.get('/v1/me/listening',async r=>activity.snapshot(await owner(r)));
  app.put<{Body:{privateMode:boolean;retentionDays:ActivitySettings['retentionDays']}}>('/v1/me/listening/settings',{schema:{body:object({privateMode:{type:'boolean'},retentionDays:{type:'integer',enum:[90,180,365]}})}},async r=>activity.changeSettings(await owner(r),r.body.privateMode,r.body.retentionDays));
  app.post<{Body:ActivityCheckpoint}>('/v1/me/listening/checkpoints',{schema:{body:object({id:uuid,mediaId:uuid,epoch:integer(2147483647),sequence:integer(2147483647),startedAt:integer(9999999999999),updatedAt:integer(9999999999999),listenedMs:integer(86400000),durationMs:integer(86400000),seeks:integer(100000),closed:{type:'boolean'},reason:{anyOf:[{type:'null'},{type:'string',enum:['completed','skip','replay','change','error','interrupted']}]}})}},async r=>activity.checkpoint(await owner(r),r.body));
  app.patch<{Params:{id:string};Body:{excluded:boolean}}>('/v1/me/listening/:id',{schema:{params:object({id:uuid}),body:object({excluded:{type:'boolean'}})}},async r=>{activity.exclude(await owner(r),r.params.id,r.body.excluded);return {ok:true};});
  app.delete('/v1/me/listening',async r=>activity.clear(await owner(r)));
  return activity;
}
