import type {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import type {Profile,Track,PersonalLibrary,PersonalPlaylist,PlaylistSummary,PlaylistVisibility,FollowedResource} from '../../packages/domain/index';
import {AppError} from './errors';
export const librarySchema=`
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS library_profiles(id TEXT PRIMARY KEY,mode TEXT NOT NULL CHECK(mode IN ('local','online')),name TEXT NOT NULL,avatar TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS library_local_profile ON library_profiles(mode) WHERE mode='local';
CREATE TABLE IF NOT EXISTS library_tracks(id TEXT PRIMARY KEY,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS library_likes(owner TEXT NOT NULL REFERENCES library_profiles(id),track TEXT NOT NULL REFERENCES library_tracks(id),created INTEGER NOT NULL,PRIMARY KEY(owner,track));
CREATE TABLE IF NOT EXISTS library_playlists(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES library_profiles(id),name TEXT NOT NULL,description TEXT NOT NULL,visibility TEXT NOT NULL CHECK(visibility IN ('private','public')),cover TEXT,revision INTEGER NOT NULL,updated INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS library_playlists_owner ON library_playlists(owner,updated);
CREATE TABLE IF NOT EXISTS library_items(id TEXT PRIMARY KEY,playlist TEXT NOT NULL REFERENCES library_playlists(id) ON DELETE CASCADE,track TEXT NOT NULL REFERENCES library_tracks(id),position INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS library_items_order ON library_items(playlist,position);
CREATE TABLE IF NOT EXISTS library_playlist_undo(playlist TEXT PRIMARY KEY REFERENCES library_playlists(id) ON DELETE CASCADE,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS library_follows(owner TEXT NOT NULL REFERENCES library_profiles(id),kind TEXT NOT NULL CHECK(kind IN ('artist','album')),resource TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(owner,kind,resource));
CREATE TABLE IF NOT EXISTS library_history(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES library_profiles(id),track TEXT NOT NULL REFERENCES library_tracks(id),played INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS library_history_owner ON library_history(owner,played);
PRAGMA user_version=3;`;
type Row=Record<string,unknown>;
type EntryRef={id:string;track:string};
type PlaylistUndo={revision:number;count:number;items:EntryRef[];target:{id:string;revision:number;name:string;items:EntryRef[]}|null};
export class LibraryStore {
  constructor(private db:DatabaseSync){db.exec(librarySchema);}
  private transaction<T>(work:()=>T):T {this.db.exec('BEGIN IMMEDIATE');try{const result=work();this.db.exec('COMMIT');return result;}catch(error){this.db.exec('ROLLBACK');throw error;}}
  ensureProfile(mode:Profile['mode'],id=randomUUID(),name='Il mio spazio'):Profile {
    const existing=mode==='local'?this.db.prepare("SELECT * FROM library_profiles WHERE mode='local'").get():this.db.prepare('SELECT * FROM library_profiles WHERE id=?').get(id);
    if(existing)return this.profile(existing);
    this.db.prepare('INSERT INTO library_profiles VALUES(?,?,?,NULL)').run(id,mode,name);return this.getProfile(id);
  }
  private profile(row:Row):Profile{return {id:String(row.id),mode:row.mode as Profile['mode'],displayName:String(row.name),avatar:row.avatar as string|null};}
  getProfile(owner:string):Profile {const row=this.db.prepare('SELECT * FROM library_profiles WHERE id=?').get(owner);if(!row)throw new AppError(401,'PROFILE_REQUIRED','Profilo non disponibile.');return this.profile(row);}
  updateProfile(owner:string,name:string,avatar:string|null):Profile {this.getProfile(owner);this.db.prepare('UPDATE library_profiles SET name=?,avatar=? WHERE id=?').run(name,avatar,owner);return this.getProfile(owner);}
  saveTrack(track:Track){this.db.prepare('INSERT INTO library_tracks VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(track.id,JSON.stringify(track));}
  getTrack(id:string):Track|undefined {const row=this.db.prepare('SELECT data FROM library_tracks WHERE id=?').get(id);return row?JSON.parse(String(row.data)):undefined;}
  like(owner:string,track:Track,value:boolean){this.getProfile(owner);if(value){this.transaction(()=>{this.saveTrack(track);const count=Number(this.db.prepare('SELECT count(*) n FROM library_likes WHERE owner=?').get(owner)!.n);if(count>=5000&&!this.db.prepare('SELECT 1 FROM library_likes WHERE owner=? AND track=?').get(owner,track.id))throw new AppError(400,'LIBRARY_LIMIT','Puoi salvare fino a 5.000 brani piaciuti.');this.db.prepare('INSERT OR IGNORE INTO library_likes VALUES(?,?,?)').run(owner,track.id,Date.now());});}else this.db.prepare('DELETE FROM library_likes WHERE owner=? AND track=?').run(owner,track.id);}
  follow(owner:string,resource:FollowedResource,value:boolean){this.getProfile(owner);if(value){const count=Number(this.db.prepare('SELECT count(*) n FROM library_follows WHERE owner=?').get(owner)!.n);if(count>=5000&&!this.db.prepare('SELECT 1 FROM library_follows WHERE owner=? AND kind=? AND resource=?').get(owner,resource.kind,resource.id))throw new AppError(400,'LIBRARY_LIMIT','Puoi seguire fino a 5.000 artisti e album.');this.db.prepare('INSERT INTO library_follows VALUES(?,?,?,?) ON CONFLICT(owner,kind,resource) DO UPDATE SET data=excluded.data').run(owner,resource.kind,resource.id,JSON.stringify(resource));}else this.db.prepare('DELETE FROM library_follows WHERE owner=? AND kind=? AND resource=?').run(owner,resource.kind,resource.id);}
  followed(owner:string,kind:'artist'|'album',id:string):FollowedResource|null {this.getProfile(owner);const row=this.db.prepare('SELECT data FROM library_follows WHERE owner=? AND kind=? AND resource=?').get(owner,kind,id);return row?JSON.parse(String(row.data)):null;}
  updateArtistArtwork(owner:string,id:string,artwork:string|null):FollowedResource|null {const resource=this.followed(owner,'artist',id);if(!resource)return null;const updated={...resource,artwork};this.db.prepare('UPDATE library_follows SET data=? WHERE owner=? AND kind=? AND resource=?').run(JSON.stringify(updated),owner,'artist',id);return updated;}
  record(owner:string,track:Track,event:string){this.getProfile(owner);this.transaction(()=>{this.saveTrack(track);this.db.prepare('INSERT OR IGNORE INTO library_history(id,owner,track,played) VALUES(?,?,?,?)').run(event,owner,track.id,Date.now());this.db.prepare('DELETE FROM library_history WHERE owner=? AND id NOT IN (SELECT id FROM library_history WHERE owner=? ORDER BY played DESC,rowid DESC LIMIT 5000)').run(owner,owner);});}
  clearHistory(owner:string){this.db.prepare('DELETE FROM library_history WHERE owner=?').run(owner);if(this.db.prepare("SELECT 1 FROM sqlite_master WHERE name='listening_sessions'").get()){this.db.prepare('DELETE FROM listening_sessions WHERE owner=?').run(owner);this.db.prepare('UPDATE listening_settings SET epoch=epoch+1 WHERE owner=?').run(owner);}for(const table of ['taste_mixes','taste_candidates','taste_discovery'])if(this.db.prepare("SELECT 1 FROM sqlite_master WHERE name=?").get(table))this.db.prepare(`DELETE FROM ${table} WHERE owner=?`).run(owner);}
  private summary(row:Row,stats?:Row,artwork?:string[]):PlaylistSummary {
    const aggregate=stats??this.db.prepare(`SELECT count(*) n,SUM(CASE WHEN json_extract(t.data,'$.duration')>0 THEN json_extract(t.data,'$.duration') ELSE 0 END) seconds,SUM(CASE WHEN json_extract(t.data,'$.duration')>0 THEN 0 ELSE 1 END) missing FROM library_items i JOIN library_tracks t ON t.id=i.track WHERE i.playlist=?`).get(String(row.id))!;
    const count=Number(aggregate.n??0);
    const artworks=artwork??this.db.prepare('SELECT t.data FROM library_items i JOIN library_tracks t ON t.id=i.track WHERE i.playlist=? ORDER BY i.position LIMIT 4').all(String(row.id)).map(t=>(JSON.parse(String(t.data)) as Track).thumbnail);
    return {id:String(row.id),name:String(row.name),description:String(row.description),visibility:row.visibility as PlaylistVisibility,cover:row.cover as string|null,artwork:artworks,count,revision:Number(row.revision),updatedAt:new Date(Number(row.updated)).toISOString(),durationSeconds:Number(aggregate.missing??0)>0?null:Number(aggregate.seconds??0)};
  }
  snapshot(owner:string):PersonalLibrary {
    // Two bounded batch queries replace per-playlist artwork/aggregate queries.
    // Duration is unknown when even one entry lacks it, rather than understated.
    const stats=new Map(this.db.prepare(`SELECT i.playlist,count(*) n,SUM(CASE WHEN json_extract(t.data,'$.duration')>0 THEN json_extract(t.data,'$.duration') ELSE 0 END) seconds,SUM(CASE WHEN json_extract(t.data,'$.duration')>0 THEN 0 ELSE 1 END) missing FROM library_items i JOIN library_playlists p ON p.id=i.playlist JOIN library_tracks t ON t.id=i.track WHERE p.owner=? GROUP BY i.playlist`).all(owner).map(r=>[String(r.playlist),r]));
    const artwork=new Map<string,string[]>();
    for(const r of this.db.prepare(`SELECT playlist,data FROM (SELECT i.playlist,t.data,ROW_NUMBER() OVER(PARTITION BY i.playlist ORDER BY i.position) position FROM library_items i JOIN library_playlists p ON p.id=i.playlist JOIN library_tracks t ON t.id=i.track WHERE p.owner=?) WHERE position<=4 ORDER BY playlist,position`).all(owner)){
      const id=String(r.playlist),images=artwork.get(id)??[];images.push((JSON.parse(String(r.data)) as Track).thumbnail);artwork.set(id,images);
    }
    return {profile:this.getProfile(owner),likes:this.db.prepare('SELECT t.data FROM library_likes l JOIN library_tracks t ON t.id=l.track WHERE l.owner=? ORDER BY l.created DESC,l.rowid DESC').all(owner).map(r=>JSON.parse(String(r.data))),
      playlists:this.db.prepare('SELECT * FROM library_playlists WHERE owner=? ORDER BY updated DESC,rowid DESC').all(owner).map(r=>this.summary(r,stats.get(String(r.id))??{n:0,seconds:0,missing:0},artwork.get(String(r.id))??[])),
      follows:this.db.prepare('SELECT data FROM library_follows WHERE owner=? ORDER BY rowid DESC').all(owner).map(r=>JSON.parse(String(r.data))),
      history:this.db.prepare('SELECT h.id,h.played,t.data FROM library_history h JOIN library_tracks t ON t.id=h.track WHERE h.owner=? ORDER BY h.played DESC,h.rowid DESC LIMIT 100').all(owner).map(r=>({id:String(r.id),track:JSON.parse(String(r.data)),playedAt:new Date(Number(r.played)).toISOString()}))};
  }
  private owned(owner:string,id:string):Row {const row=this.db.prepare('SELECT * FROM library_playlists WHERE id=? AND owner=?').get(id,owner);if(!row)throw new AppError(404,'PLAYLIST_NOT_FOUND','Playlist non trovata.');return row;}
  playlist(owner:string,id:string):PersonalPlaylist {
    const row=this.owned(owner,id),journal=this.db.prepare('SELECT data FROM library_playlist_undo WHERE playlist=?').get(id);
    const undo=journal?JSON.parse(String(journal.data)) as PlaylistUndo:null;
    return {...this.summary(row),undo:undo?{count:undo.count,kind:undo.target?'move':'remove',targetName:undo.target?.name??null}:null,items:this.db.prepare('SELECT i.id,t.data FROM library_items i JOIN library_tracks t ON t.id=i.track WHERE i.playlist=? ORDER BY i.position').all(id).map(r=>({id:String(r.id),track:JSON.parse(String(r.data))}))};
  }
  create(owner:string,name:string):PersonalPlaylist {this.getProfile(owner);if(Number(this.db.prepare('SELECT count(*) n FROM library_playlists WHERE owner=?').get(owner)!.n)>=100)throw new AppError(400,'LIBRARY_LIMIT','Puoi creare fino a 100 playlist.');const id=randomUUID();this.db.prepare("INSERT INTO library_playlists VALUES(?,?,?,'','private',NULL,1,?)").run(id,owner,name,Date.now());return this.playlist(owner,id);}
  private edit(owner:string,id:string,revision:number,work:()=>void):PersonalPlaylist {
    return this.transaction(()=>{this.checkRevision(owner,id,revision);this.invalidateUndo(id);work();this.bump(id);return this.playlist(owner,id);});
  }
  update(owner:string,id:string,revision:number,patch:{name:string;description:string;visibility:PlaylistVisibility;cover:string|null}) {return this.edit(owner,id,revision,()=>{this.db.prepare('UPDATE library_playlists SET name=?,description=?,visibility=?,cover=? WHERE id=?').run(patch.name,patch.description,patch.visibility,patch.cover,id);});}
  add(owner:string,id:string,revision:number,track:Track){return this.edit(owner,id,revision,()=>{const count=Number(this.db.prepare('SELECT count(*) n FROM library_items WHERE playlist=?').get(id)!.n);if(count>=1000)throw new AppError(400,'PLAYLIST_LIMIT','Questa playlist ha raggiunto 1.000 brani.');this.saveTrack(track);this.db.prepare('INSERT INTO library_items VALUES(?,?,?,?)').run(randomUUID(),id,track.id,count);});}
  remove(owner:string,id:string,revision:number,item:string){return this.removeMany(owner,id,revision,[item]);}
  private checkRevision(owner:string,id:string,revision:number){const row=this.owned(owner,id);if(Number(row.revision)!==revision)throw new AppError(409,'REVISION_CONFLICT','La playlist è cambiata. Ricarica e ripeti la modifica.');return row;}
  private bump(id:string){this.db.prepare('UPDATE library_playlists SET revision=revision+1,updated=? WHERE id=?').run(Date.now(),id);}
  private invalidateUndo(id:string){
    // A later edit of either side invalidates a move journal, never overwrites it.
    this.db.prepare("DELETE FROM library_playlist_undo WHERE playlist=? OR json_extract(data,'$.target.id')=?").run(id,id);
  }
  private entryRefs(id:string):EntryRef[]{return this.db.prepare('SELECT id,track FROM library_items WHERE playlist=? ORDER BY position').all(id).map(r=>({id:String(r.id),track:String(r.track)}));}
  private selection(items:EntryRef[],ids:string[]):EntryRef[]{
    const keys=new Set(ids);
    if(!ids.length||ids.length>1000||keys.size!==ids.length)throw new AppError(400,'INVALID_SELECTION','Seleziona da 1 a 1.000 elementi distinti.');
    const selected=items.filter(item=>keys.has(item.id));
    if(selected.length!==ids.length)throw new AppError(404,'ITEM_NOT_FOUND','Uno dei brani non è più presente. Ricarica la playlist.');
    return selected;
  }
  private writeEntries(id:string,items:EntryRef[]){
    this.db.prepare('DELETE FROM library_items WHERE playlist=?').run(id);
    const insert=this.db.prepare('INSERT INTO library_items VALUES(?,?,?,?)');
    items.forEach((item,index)=>insert.run(item.id,id,item.track,index));
  }
  private journal(id:string,undo:PlaylistUndo){this.db.prepare('INSERT OR REPLACE INTO library_playlist_undo VALUES(?,?)').run(id,JSON.stringify(undo));}
  removeMany(owner:string,id:string,revision:number,ids:string[]){
    return this.transaction(()=>{
      this.checkRevision(owner,id,revision);const before=this.entryRefs(id);this.selection(before,ids);const selected=new Set(ids);
      this.invalidateUndo(id);this.writeEntries(id,before.filter(item=>!selected.has(item.id)));this.bump(id);
      this.journal(id,{revision:revision+1,count:ids.length,items:before,target:null});return this.playlist(owner,id);
    });
  }
  transfer(owner:string,id:string,revision:number,input:import('../../packages/domain/playlist-tools').PlaylistTransfer){
    return this.transaction(()=>{
      this.checkRevision(owner,id,revision);const targetRow=this.checkRevision(owner,input.targetId,input.targetRevision);
      if(input.mode==='move'&&id===input.targetId)throw new AppError(400,'SAME_PLAYLIST','Per spostare scegli una playlist diversa.');
      const before=this.entryRefs(id),selected=this.selection(before,input.itemIds),targetBefore=this.entryRefs(input.targetId);
      if(targetBefore.length+selected.length>1000)throw new AppError(400,'PLAYLIST_LIMIT','La destinazione supererebbe il limite di 1.000 brani. Nessun elemento è stato modificato.');
      this.invalidateUndo(input.targetId);
      this.writeEntries(input.targetId,[...targetBefore,...selected.map(item=>({...item,id:randomUUID()}))]);this.bump(input.targetId);
      if(input.mode==='move'){
        this.invalidateUndo(id);const keys=new Set(input.itemIds);this.writeEntries(id,before.filter(item=>!keys.has(item.id)));this.bump(id);
        this.journal(id,{revision:revision+1,count:selected.length,items:before,target:{id:input.targetId,revision:input.targetRevision+1,items:targetBefore,name:String(targetRow.name)}});
      }
      return {source:this.playlist(owner,id),target:this.playlist(owner,input.targetId)};
    });
  }
  undo(owner:string,id:string,revision:number){
    return this.transaction(()=>{
      this.checkRevision(owner,id,revision);const row=this.db.prepare('SELECT data FROM library_playlist_undo WHERE playlist=?').get(id);
      if(!row)throw new AppError(409,'UNDO_UNAVAILABLE','Non c’è una rimozione da annullare. Una modifica successiva può averla invalidata.');
      const saved=JSON.parse(String(row.data)) as PlaylistUndo;
      if(saved.revision!==revision)throw new AppError(409,'REVISION_CONFLICT','La playlist è cambiata. Impossibile annullare questa rimozione.');
      if(saved.target){this.checkRevision(owner,saved.target.id,saved.target.revision);this.invalidateUndo(saved.target.id);this.writeEntries(saved.target.id,saved.target.items);this.bump(saved.target.id);}
      this.invalidateUndo(id);this.writeEntries(id,saved.items);this.bump(id);return this.playlist(owner,id);
    });
  }
  duplicate(owner:string,id:string,revision:number,name:string){
    return this.transaction(()=>{
      const original=this.checkRevision(owner,id,revision),copy=this.create(owner,name.trim());
      this.db.prepare('UPDATE library_playlists SET description=?,cover=? WHERE id=?').run(String(original.description),original.cover as string|null,copy.id);
      this.writeEntries(copy.id,this.entryRefs(id).map(item=>({...item,id:randomUUID()})));return this.playlist(owner,copy.id);
    });
  }
  private setOrder(id:string,items:string[]){items.forEach((item,index)=>this.db.prepare('UPDATE library_items SET position=? WHERE id=? AND playlist=?').run(index,item,id));}
  reorder(owner:string,id:string,revision:number,items:string[]){return this.edit(owner,id,revision,()=>{const existing=this.db.prepare('SELECT id FROM library_items WHERE playlist=?').all(id).map(r=>String(r.id));if(items.length!==existing.length||new Set(items).size!==items.length||items.some(item=>!existing.includes(item)))throw new AppError(400,'INVALID_ORDER','L’ordine deve contenere ogni brano una sola volta.');this.setOrder(id,items);});}
  delete(owner:string,id:string,revision:number){this.transaction(()=>{const row=this.owned(owner,id);if(Number(row.revision)!==revision)throw new AppError(409,'REVISION_CONFLICT','La playlist è cambiata. Ricaricala prima di eliminarla.');this.invalidateUndo(id);this.db.prepare('DELETE FROM library_playlists WHERE id=? AND owner=?').run(id,owner);});}
  importPlaylist(owner:string,input:{name:string;description:string;cover:string|null;tracks:Track[]}):PersonalPlaylist{
    return this.transaction(()=>{
      const playlist=this.create(owner,input.name.trim());
      this.db.prepare('UPDATE library_playlists SET description=?,cover=? WHERE id=?').run(input.description.trim(),input.cover,playlist.id);
      const insert=this.db.prepare('INSERT INTO library_items VALUES(?,?,?,?)');
      input.tracks.forEach((track,index)=>{if(!this.getTrack(track.id))this.saveTrack(track);insert.run(randomUUID(),playlist.id,track.id,index);});
      return this.playlist(owner,playlist.id);
    });
  }
  importRemote(owner:string,tracks:Track[],input:{name:string;description:string;targetId:string|null;targetRevision:number|null;skipDuplicates:boolean}){
    return this.transaction(()=>{
      this.getProfile(owner);
      const target=input.targetId?this.playlist(owner,input.targetId):null;
      if(target)this.checkRevision(owner,target.id,input.targetRevision!);
      const seen=new Set(target?.items.map(item=>item.track.videoId)??[]);let skipped=0;
      const accepted=tracks.filter(track=>{if(input.skipDuplicates&&seen.has(track.videoId)){skipped++;return false;}seen.add(track.videoId);return true;});
      if((target?.count??0)+accepted.length>1000)throw new AppError(400,'PLAYLIST_LIMIT','La destinazione supererebbe 1.000 elementi. Riduci la selezione: non è stato salvato alcun brano.');
      if(!accepted.length&&target)return {playlist:target,added:0,skippedDuplicates:skipped};
      if(target){
        this.invalidateUndo(target.id);
        const insert=this.db.prepare('INSERT INTO library_items VALUES(?,?,?,?)');
        accepted.forEach((track,index)=>{if(!this.getTrack(track.id))this.saveTrack(track);insert.run(randomUUID(),target.id,track.id,target.count+index);});
        this.bump(target.id);return {playlist:this.playlist(owner,target.id),added:accepted.length,skippedDuplicates:skipped};
      }
      // Inline creation keeps this entire import in one transaction.
      const playlist=this.create(owner,input.name.trim());
      this.db.prepare('UPDATE library_playlists SET description=? WHERE id=?').run(input.description,playlist.id);
      const insert=this.db.prepare('INSERT INTO library_items VALUES(?,?,?,?)');
      accepted.forEach((track,index)=>{if(!this.getTrack(track.id))this.saveTrack(track);insert.run(randomUUID(),playlist.id,track.id,index);});
      return {playlist:this.playlist(owner,playlist.id),added:accepted.length,skippedDuplicates:skipped};
    });
  }
}
