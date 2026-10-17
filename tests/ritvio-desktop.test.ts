import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,writeFile,readFile,rm,access} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {DatabaseSync} from 'node:sqlite';
const require=createRequire(import.meta.url),{migrateLegacyProfile}=require('../apps/desktop/legacy-profile.cjs'),{cleanSnapshot,cleanCommand}=require('../apps/desktop/mini-player.cjs');
test('RITVIO copies an active WAL database and player once without touching legacy data or an existing profile',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'ritvio-migration-')),old=path.join(root,'SPOTYFREE'),next=path.join(root,'RITVIO');await mkdir(path.join(old,'cache'),{recursive:true});const db=new DatabaseSync(path.join(old,'cache/mvp.sqlite'));
  try{db.exec("PRAGMA journal_mode=WAL; CREATE TABLE library(name TEXT); INSERT INTO library VALUES('La mia playlist')");await writeFile(path.join(old,'player-state.json'),JSON.stringify({version:1,state:{position:42,volume:.37,queue:[]}}));assert.equal(await migrateLegacyProfile(root,next),true);const copied=new DatabaseSync(path.join(next,'cache/mvp.sqlite'));assert.equal(copied.prepare('SELECT name FROM library').get()!.name,'La mia playlist');copied.close();assert.equal(JSON.parse(await readFile(path.join(next,'player-state.json'),'utf8')).state.position,42);db.exec("INSERT INTO library VALUES('Nuovo dato precedente')");assert.equal(await migrateLegacyProfile(root,next),false);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM library').get()!.n,2);await access(path.join(next,'legacy-migration.json'));}finally{db.close();await rm(root,{recursive:true,force:true});}
});
test('failed legacy player validation is recoverable and cannot replace a valid RITVIO profile',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'ritvio-migration-')),old=path.join(root,'SPOTYFREE'),next=path.join(root,'RITVIO');await mkdir(path.join(old,'cache'),{recursive:true});const db=new DatabaseSync(path.join(old,'cache/mvp.sqlite'));db.exec('CREATE TABLE data(value TEXT)');db.close();
  try{await writeFile(path.join(old,'player-state.json'),'not-json');await assert.rejects(migrateLegacyProfile(root,next));await writeFile(path.join(old,'player-state.json'),'{"version":1}');assert.equal(await migrateLegacyProfile(root,next),true);await writeFile(path.join(next,'player-state.json'),'{"personal":"keep"}');assert.equal(await migrateLegacyProfile(root,next),false);assert.equal(JSON.parse(await readFile(path.join(next,'player-state.json'),'utf8')).personal,'keep');}finally{await rm(root,{recursive:true,force:true});}
});
test('mini-player transport accepts only whitelisted finite commands and strips untrusted snapshot fields',()=>{
  for(const input of [{type:'script',value:'alert(1)'},{type:'seek',value:Infinity},{type:'volume',value:'1'},null])assert.throws(()=>cleanCommand(input));
  assert.deepEqual(cleanCommand({type:'volume',value:3}),{type:'volume',value:1});assert.deepEqual(cleanCommand({type:'seek',value:-3}),{type:'seek',value:0});
  const cleaned=cleanSnapshot({videoId:'javascript:bad',title:'Brano',position:-20,volume:Infinity,url:'https://tracker.invalid',theme:'unexpected'});assert.equal(cleaned.videoId,null);assert.equal(cleaned.position,0);assert.equal(cleaned.volume,0);assert.equal(cleaned.theme,'dark');assert.equal('url' in cleaned,false);
});
