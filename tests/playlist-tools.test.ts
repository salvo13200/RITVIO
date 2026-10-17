import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Store} from '../apps/api/store';
import {createApi} from '../apps/api/server';
import {tracks,testConfig,FixtureResolver} from './fixtures';
import {duplicatePlaylistItems,selectedPlaylistItems} from '../packages/domain/playlist-tools';

function seeded(store:Store){
  const lib=store.library,owner=lib.ensureProfile('local').id;
  const source=lib.importPlaylist(owner,{name:'Sorgente',description:'Descrizione',cover:null,tracks:[tracks[0],tracks[1],tracks[0]]});
  const target=lib.importPlaylist(owner,{name:'Destinazione',description:'',cover:null,tracks:[tracks[1]]});return {lib,owner,source,target};
}
test('playlist duplicate detection preserves editions and selection uses saved entry order',()=>{
  const items=[{id:'1',track:tracks[0]},{id:'2',track:tracks[1]},{id:'3',track:tracks[0]},{id:'4',track:{...tracks[0],id:randomUUID()}}];
  assert.deepEqual(duplicatePlaylistItems(items).map(item=>item.id),['3']);assert.deepEqual(selectedPlaylistItems(items,['3','1','missing']).map(item=>item.id),['1','3']);
});
test('atomic batch removal and persisted undo restore exact IDs and original duplicate order',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'ritvio-playlist-undo-')),filename=path.join(directory,'profile.sqlite');let store=new Store(filename);
  try{
    const {lib,owner,source}=seeded(store);
    const removed=lib.removeMany(owner,source.id,source.revision,[source.items[2].id,source.items[0].id]);
    assert.deepEqual(removed.items.map(item=>item.id),[source.items[1].id]);assert.deepEqual(removed.undo,{count:2,kind:'remove',targetName:null});
    assert.throws(()=>lib.undo(owner,source.id,source.revision),/cambiata/);
    store.close();store=new Store(filename);const saved=store.library.playlist(owner,source.id);assert.equal(saved.undo?.count,2);
    const restored=store.library.undo(owner,source.id,saved.revision);assert.deepEqual(restored.items,source.items);assert.equal(restored.undo,null);assert.equal(restored.revision,saved.revision+1);
    assert.throws(()=>store.library.undo(owner,source.id,restored.revision),/rimozione da annullare/);
  }finally{store.close();await rm(directory,{recursive:true,force:true});}
});
test('cross-playlist move and undo are atomic and restore both sides without losing intentional copies',()=>{
  const store=new Store(':memory:');try{
    const {lib,owner,source,target}=seeded(store);
    const moved=lib.transfer(owner,source.id,source.revision,{mode:'move',targetId:target.id,targetRevision:target.revision,itemIds:[source.items[2].id,source.items[0].id]});
    assert.deepEqual(moved.source.items.map(item=>item.track.id),[tracks[1].id]);assert.deepEqual(moved.target.items.map(item=>item.track.id),[tracks[1].id,tracks[0].id,tracks[0].id]);
    assert.notEqual(moved.target.items[1].id,source.items[0].id);assert.equal(moved.source.undo?.kind,'move');
    const restored=lib.undo(owner,source.id,moved.source.revision);assert.deepEqual(restored.items,source.items);assert.deepEqual(lib.playlist(owner,target.id).items,target.items);
    const movedAgain=lib.transfer(owner,source.id,restored.revision,{mode:'move',targetId:target.id,targetRevision:lib.playlist(owner,target.id).revision,itemIds:[restored.items[0].id]});
    const changedTarget=lib.add(owner,target.id,movedAgain.target.revision,tracks[0]);assert.equal(lib.playlist(owner,source.id).undo,null);
    assert.throws(()=>lib.undo(owner,source.id,movedAgain.source.revision),/rimozione da annullare/);assert.deepEqual(lib.playlist(owner,target.id),changedTarget);
  }finally{store.close();}
});
test('transfer validation rolls back both playlists for stale revisions, foreign targets, missing items and limits',()=>{
  const store=new Store(':memory:');try{
    const {lib,owner,source,target}=seeded(store);const foreign=lib.ensureProfile('online',randomUUID(),'Altro'),foreignPlaylist=lib.create(foreign.id,'Non tua');
    const valid={mode:'move' as const,targetId:target.id,targetRevision:target.revision,itemIds:[source.items[0].id]};
    for(const input of [{...valid,targetRevision:2},{...valid,itemIds:[randomUUID()]},{...valid,itemIds:[source.items[0].id,source.items[0].id]},{...valid,targetId:foreignPlaylist.id},{...valid,targetId:source.id}])assert.throws(()=>lib.transfer(owner,source.id,source.revision,input));
    assert.deepEqual(lib.playlist(owner,source.id),source);assert.deepEqual(lib.playlist(owner,target.id),target);
    const full=lib.importPlaylist(owner,{name:'Piena',description:'',cover:null,tracks:Array(1000).fill(tracks[1])});
    assert.throws(()=>lib.transfer(owner,source.id,source.revision,{...valid,targetId:full.id,targetRevision:full.revision}),/1.000/);
    assert.deepEqual(lib.playlist(owner,source.id),source);assert.equal(lib.playlist(owner,full.id).count,1000);
    assert.throws(()=>lib.removeMany(owner,source.id,source.revision,[source.items[0].id,randomUUID()]));assert.deepEqual(lib.playlist(owner,source.id),source);
  }finally{store.close();}
});
test('copy permits intentional same-playlist duplicates and duplicate playlist is private and independent',()=>{
  const store=new Store(':memory:');try{
    const {lib,owner,source}=seeded(store);const updated=lib.update(owner,source.id,source.revision,{name:source.name,description:source.description,cover:null,visibility:'public'});
    const copy=lib.duplicate(owner,source.id,updated.revision,'Copia');assert.equal(copy.visibility,'private');assert.equal(copy.description,source.description);assert.deepEqual(copy.items.map(item=>item.track),source.items.map(item=>item.track));assert.notEqual(copy.items[0].id,source.items[0].id);
    const same=lib.transfer(owner,copy.id,copy.revision,{mode:'copy',targetId:copy.id,targetRevision:copy.revision,itemIds:[copy.items[2].id,copy.items[0].id]});
    assert.deepEqual(same.target.items.map(item=>item.track.id),[tracks[0].id,tracks[1].id,tracks[0].id,tracks[0].id,tracks[0].id]);assert.equal(same.source.revision,copy.revision+1);
    const removed=lib.remove(owner,copy.id,same.source.revision,copy.items[0].id);assert.equal(removed.undo?.count,1);
    const edited=lib.update(owner,copy.id,removed.revision,{name:'Rinominata',description:'',cover:null,visibility:'private'});assert.equal(edited.undo,null);assert.equal(lib.playlist(owner,source.id).count,3);
  }finally{store.close();}
});
test('playlist tools API requires auth and revisions, validates bounded selection and isolates identities',async()=>{
  const config=testConfig();let actor={id:randomUUID(),mode:'online' as const};
  const {app,store}=await createApi({config,resolver:new FixtureResolver(config,'http://fixture.test'),identityProvider:{resolve:async()=>actor}});
  const headers={authorization:'Bearer test-token-only'};
  try{
    const lib=store.library;lib.ensureProfile('online',actor.id,'Uno');const source=lib.importPlaylist(actor.id,{name:'Test',description:'',cover:null,tracks});
    const route=`/v1/me/playlists/${source.id}`;
    assert.equal((await app.inject({method:'POST',url:route+'/remove-items',payload:{itemIds:[source.items[0].id]}})).statusCode,401);
    assert.equal((await app.inject({method:'POST',url:route+'/remove-items',headers,payload:{itemIds:[source.items[0].id]}})).statusCode,428);
    const edit={...headers,'if-match':'"1"'};
    for(const ids of [[],[source.items[0].id,source.items[0].id],Array(1001).fill(source.items[0].id)])assert.equal((await app.inject({method:'POST',url:route+'/remove-items',headers:edit,payload:{itemIds:ids}})).statusCode,400);
    const removed=await app.inject({method:'POST',url:route+'/remove-items',headers:edit,payload:{itemIds:[source.items[0].id]}});assert.equal(removed.statusCode,200);assert.equal(removed.json().undo.count,1);
    assert.equal((await app.inject({method:'POST',url:route+'/undo',headers:edit})).statusCode,409);
    assert.equal((await app.inject({method:'POST',url:route+'/undo',headers:{...headers,'if-match':'"2"'}})).statusCode,200);
    assert.equal((await app.inject({method:'POST',url:route+'/duplicate',headers:{...headers,'if-match':'"3"'},payload:{name:'Copia'}})).statusCode,201);
    actor={id:randomUUID(),mode:'online'};lib.ensureProfile('online',actor.id,'Due');
    for(const suffix of ['undo','duplicate','remove-items','transfer']){
      const payload=suffix==='duplicate'?{name:'Altra'}:suffix==='remove-items'?{itemIds:[source.items[0].id]}:suffix==='transfer'?{mode:'copy',itemIds:[source.items[0].id],targetId:source.id,targetRevision:3}:undefined;
      assert.equal((await app.inject({method:'POST',url:route+'/'+suffix,headers:{...headers,'if-match':'"3"'},payload})).statusCode,404);
    }
  }finally{await app.close();}
});
