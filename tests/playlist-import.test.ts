import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApi} from '../apps/api/server';
import {Store} from '../apps/api/store';
import {AppError} from '../apps/api/errors';
import {FixtureResolver,testConfig,tracks} from './fixtures';
import {playlistLink,importSelection,type RemotePlaylistPreview} from '../packages/domain/playlist-import';
import {normalizeRemotePlaylist,normalizeFlatPlaylist} from '../apps/api/playlist-import-normalize';
import {runResolverJson} from '../apps/api/resolver-process';
const identifier='PLremote_import_fixture01',url=`https://music.youtube.com/playlist?list=${identifier}`;
const headers={authorization:'Bearer test-token-only'};
const config=testConfig();
async function ready(app:Awaited<ReturnType<typeof createApi>>['app'],id:string,extra={}){
  for(let attempt=0;attempt<50;attempt++){const response=await app.inject({url:'/v1/me/playlist-imports/'+id,headers:{...headers,...extra}});const view=response.json();if(view.state!=='loading')return view;await new Promise(resolve=>setTimeout(resolve,5));}throw Error('Job did not finish');
}
const newInput={entryNumbers:[4,1,3],skipDuplicates:false,name:'Importazione di prova',targetId:null,targetRevision:null};
test('playlist links canonicalize only supported share URLs and reject host/path/auth/radio injection',()=>{
  for(const address of [url,`https://www.youtube.com/watch?v=testmusic01&list=${identifier}&index=8`,`https://youtu.be/testmusic01?list=${identifier}`])assert.equal(playlistLink(address).url,`https://www.youtube.com/playlist?list=${identifier}`);
  for(const address of [`http://youtube.com/playlist?list=${identifier}`,`https://youtube.com.evil.test/playlist?list=${identifier}`,`https://u:p@youtube.com/playlist?list=${identifier}`,`https://youtube.com:444/playlist?list=${identifier}`,`https://youtube.com/results?list=${identifier}`,url+'&list=PLanother12345','https://youtube.com/playlist?list=RDtestmusic01','https://youtube.com/playlist?list=LL','https://youtube.com/playlist?list=LM','https://youtube.com/playlist?list=PLbad%26injection'])assert.throws(()=>playlistLink(address));
});
test('remote metadata retains missing slots and duplicate order, caps rows and labels unknown completeness',()=>{
  const raw={title:'Test',description:'Description',author:'Creator',artwork:'https://evil.test/a.jpg',entries:[{title:'Missing',track:{videoId:'notvalid',title:'Missing'}},{title:'A',track:tracks[0]},{title:'A',track:tracks[0]}]};
  const preview=normalizeRemotePlaylist(raw,identifier,'youtube');assert.equal(preview.artwork,null);assert.equal(preview.partial,true);assert.equal(preview.entries[0].track,null);
  assert.deepEqual(importSelection(preview.entries,[3,2],false).tracks.map(t=>t.id),[tracks[0].id,tracks[0].id]);assert.equal(importSelection(preview.entries,[3,2],true).skipped,1);
  const capped=normalizeRemotePlaylist({...raw,reportedCount:1400,entries:Array.from({length:1001},()=>raw.entries[1])},identifier,'youtube');assert.equal(capped.entries.length,1000);assert.equal(capped.truncated,true);assert.equal(capped.partial,true);assert.throws(()=>normalizeRemotePlaylist({entries:[]},identifier,'youtube'));
});
test('YouTube flat metadata never imports private, live or malformed references and exposes unverified totals',()=>{
  const preview=normalizeFlatPlaylist({title:'YouTube list',entries:[{id:'testmusic01',title:'Video',channel:'Channel'},{id:'testmusic02',title:'Private',availability:'private'},{id:'testvideo03',title:'Live',is_live:true},null]},identifier);
  assert.equal(preview.provider,'youtube');assert.equal(preview.partial,true);assert.equal(preview.entries[0].track?.artist,'Channel');assert.deepEqual(preview.entries.slice(1).map(e=>e.track),[null,null,null]);assert.equal('url' in preview.entries[0].track!,false);
});
test('resolver cancellation terminates the actual metadata child process',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'ritvio-import-abort-')),marker=path.join(directory,'child.pid');const controller=new AbortController();let pid=0;
  const work=runResolverJson(testConfig({python:process.execPath,timeoutMs:10000}),['-e',"require('node:fs').writeFileSync(process.argv[1],String(process.pid));setInterval(()=>{},1000)",marker],undefined,controller.signal);
  const rejected=assert.rejects(work,(error:any)=>error.code==='IMPORT_CANCELLED');
  try{
    for(let attempt=0;attempt<100;attempt++){try{pid=Number(await readFile(marker,'utf8'));break;}catch{await new Promise(resolve=>setTimeout(resolve,20));}}
    assert(pid>0);controller.abort();await rejected;
    let exited=false;for(let attempt=0;attempt<100;attempt++){try{process.kill(pid,0);}catch{exited=true;break;}await new Promise(resolve=>setTimeout(resolve,20));}assert.equal(exited,true);
  }finally{controller.abort();await rejected;await rm(directory,{recursive:true,force:true});}
});
test('atomic import preserves old entries, rejects capacity/revision/owner without partial writes and leaves no-op undo intact',()=>{
  const store=new Store(':memory:');try{
    const lib=store.library,owner=lib.ensureProfile('local').id,other=lib.ensureProfile('online').id;
    const input={name:'New',description:'Source',targetId:null,targetRevision:null,skipDuplicates:false};
    const initial=lib.importRemote(owner,[tracks[0],tracks[1],tracks[0]],input).playlist;
    const removed=lib.remove(owner,initial.id,initial.revision,initial.items[2].id);
    const skip=lib.importRemote(owner,[tracks[0],tracks[0]],{...input,targetId:removed.id,targetRevision:removed.revision,skipDuplicates:true});assert.equal(skip.added,0);assert.equal(skip.playlist.revision,removed.revision);assert.deepEqual(skip.playlist.undo,removed.undo);
    const appended=lib.importRemote(owner,[tracks[1],tracks[0]],{...input,targetId:removed.id,targetRevision:removed.revision});assert.deepEqual(appended.playlist.items.slice(0,2),removed.items);assert.equal(appended.playlist.undo,null);
    assert.throws(()=>lib.importRemote(owner,[tracks[1]],{...input,targetId:initial.id,targetRevision:removed.revision}));assert.throws(()=>lib.importRemote(other,[tracks[1]],{...input,targetId:initial.id,targetRevision:appended.playlist.revision}));
    const full=lib.importRemote(owner,Array.from({length:1000},()=>tracks[0]),input).playlist;assert.throws(()=>lib.importRemote(owner,[tracks[1]],{...input,targetId:full.id,targetRevision:full.revision}));assert.equal(lib.playlist(owner,full.id).revision,full.revision);assert.equal(lib.playlist(owner,full.id).count,1000);
  }finally{store.close();}
});
test('API preview never changes library; selected save uses source order and one-job retries cannot duplicate imports',async()=>{
  const {app,store}=await createApi({config,resolver:new FixtureResolver(config,'unused')});try{
    assert.equal((await app.inject({method:'POST',url:'/v1/me/playlist-imports',payload:{url,fresh:false}})).statusCode,401);
    const start=await app.inject({method:'POST',url:'/v1/me/playlist-imports',headers,payload:{url,fresh:false}});assert.equal(start.statusCode,202);
    const view=await ready(app,start.json().id);assert.equal(view.state,'ready');const owner=store.library.ensureProfile('local').id;assert.equal(store.library.snapshot(owner).playlists.length,0);assert.equal(store.db.prepare('SELECT count(*) n FROM library_tracks').get()!.n,0);
    const route='/v1/me/playlist-imports/'+view.id+'/commit';
    assert.equal((await app.inject({method:'POST',url:route,headers,payload:{...newInput,entryNumbers:[2]}})).statusCode,400);
    const result=await app.inject({method:'POST',url:route,headers,payload:newInput});assert.equal(result.statusCode,201);const saved=result.json();assert.deepEqual(saved.playlist.items.map((i:any)=>i.track.id),[tracks[0].id,tracks[1].id,tracks[0].id]);assert.equal(saved.unavailable,1);assert.equal(saved.partial,true);
    const retry=await app.inject({method:'POST',url:route,headers,payload:newInput});assert.equal(retry.statusCode,200);assert.equal(retry.json().playlist.id,saved.playlist.id);assert.equal(store.library.snapshot(owner).playlists.length,1);
    assert.equal((await app.inject({method:'POST',url:route,headers,payload:{...newInput,name:'Different'}})).statusCode,409);
    assert.equal((await app.inject({method:'POST',url:'/v1/me/playlist-imports',headers,payload:{url:'https://127.0.0.1/playlist?list='+identifier,fresh:false}})).statusCode,400);
  }finally{await app.close();}
});
test('API imports are private to identity, reject changed destination and recheck duplicate skipping atomically',async()=>{
  let foreign=false;let owner='',other='';
  const {app,store}=await createApi({config,resolver:new FixtureResolver(config,'unused'),identityProvider:{resolve:async()=>({id:foreign?other:owner,mode:'online'})}});
  owner=store.library.ensureProfile('online',randomUUID()).id;other=store.library.ensureProfile('online',randomUUID()).id;
  try{
    const target=store.library.importPlaylist(owner,{name:'Destination',description:'',cover:null,tracks:[tracks[0]]});
    const start=(await app.inject({method:'POST',url:'/v1/me/playlist-imports',headers,payload:{url,fresh:false}})).json();const view=await ready(app,start.id);
    foreign=true;assert.equal((await app.inject({url:'/v1/me/playlist-imports/'+view.id,headers})).statusCode,404);foreign=false;
    const route='/v1/me/playlist-imports/'+view.id+'/commit',input={...newInput,targetId:target.id,targetRevision:target.revision,skipDuplicates:true};
    const changed=store.library.add(owner,target.id,target.revision,tracks[0]);assert.equal((await app.inject({method:'POST',url:route,headers,payload:input})).statusCode,409);assert.equal(store.library.playlist(owner,target.id).count,2);
    const saved=await app.inject({method:'POST',url:route,headers,payload:{...input,targetRevision:changed.revision}});assert.equal(saved.statusCode,201);assert.equal(saved.json().added,1);assert.equal(saved.json().skippedDuplicates,2);assert.equal(saved.json().playlist.count,3);
  }finally{await app.close();}
});
test('cancellation actually aborts an active resolver and save is impossible afterwards',async()=>{
  const resolver=new FixtureResolver(config,'unused');let aborted=false;
  resolver.playlistPreview=async(_id,signal)=>new Promise<RemotePlaylistPreview>((_resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(new AppError(409,'IMPORT_CANCELLED','Cancelled'));},{once:true}));
  const {app,store}=await createApi({config,resolver});try{
    const start=(await app.inject({method:'POST',url:'/v1/me/playlist-imports',headers,payload:{url,fresh:false}})).json();assert.equal(start.state,'loading');
    const cancelled=await app.inject({method:'DELETE',url:'/v1/me/playlist-imports/'+start.id,headers});assert.equal(cancelled.json().state,'cancelled');assert.equal(aborted,true);
    assert.equal((await app.inject({method:'POST',url:'/v1/me/playlist-imports/'+start.id+'/commit',headers,payload:newInput})).statusCode,404);assert.equal(store.library.snapshot(store.library.ensureProfile('local').id).playlists.length,0);
  }finally{await app.close();}
});
test('dated preview cache survives restart, explicit refresh uses provider and failures label cached fallback',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'ritvio-remote-cache-')),localConfig=testConfig({database:path.join(directory,'cache.sqlite')});let instance:Awaited<ReturnType<typeof createApi>>|undefined;
  try{
    instance=await createApi({config:localConfig,resolver:new FixtureResolver(localConfig,'unused')});let view=(await instance.app.inject({method:'POST',url:'/v1/me/playlist-imports',headers,payload:{url,fresh:false}})).json();await ready(instance.app,view.id);await instance.app.close();instance=undefined;
    const resolver=new FixtureResolver(localConfig,'unused');let calls=0;resolver.playlistPreview=async()=>{calls++;throw new AppError(503,'RESOLVER_FAILED','Offline');};
    instance=await createApi({config:localConfig,resolver});view=(await instance.app.inject({method:'POST',url:'/v1/me/playlist-imports',headers,payload:{url,fresh:false}})).json();assert.equal(view.state,'ready');assert.equal(view.preview.cache,'cached');assert.equal(calls,0);
    view=(await instance.app.inject({method:'POST',url:'/v1/me/playlist-imports',headers,payload:{url,fresh:true}})).json();view=await ready(instance.app,view.id);assert.equal(view.preview.cache,'stale');assert.equal(calls,1);
    await instance.app.close();instance=undefined;
  }finally{if(instance)await instance.app.close();await rm(directory,{recursive:true,force:true});}
});
