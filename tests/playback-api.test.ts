import test from 'node:test';
import assert from 'node:assert/strict';
import {createApi} from '../apps/api/server';
import {PlaybackPreparation} from '../apps/api/playback-preparation';
import type {ContentResolver,Resolved} from '../apps/api/resolver';
import {testConfig,tracks,FixtureResolver} from './fixtures';
async function waitUntil(check:()=>boolean){const deadline=Date.now()+5000;while(!check()&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,5));assert.equal(check(),true,'API preparation readiness');}
test('authenticated preparation and foreground requests share work; disconnecting the speculative consumer preserves foreground playback',async()=>{
  const config=testConfig(),fixture=new FixtureResolver(config,'fixture');let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);let started=0,joined=false;
  const preparation=new PlaybackPreparation<Resolved>(async id=>{started++;await gate;return fixture.resolve(id);},()=>true);
  const provider:ContentResolver={installed:async()=>true,search:fixture.search.bind(fixture),resolve:(id,fresh,options)=>{if(options?.priority==='foreground')joined=true;return preparation.resolve(id,fresh,options);},diagnostics:()=>preparation.diagnostics(),close:()=>preparation.close()};
  const {app,store}=await createApi({config,resolver:provider});store.saveTrack(tracks[0]);
  await app.listen({host:'127.0.0.1',port:0});const port=(app.server.address() as {port:number}).port,base=`http://127.0.0.1:${port}`,headers={authorization:`Bearer ${config.token}`};
  try{
    assert.equal((await fetch(base+'/v1/playback/diagnostics')).status,401);
    assert.equal((await fetch(base+`/v1/media/${tracks[0].id}/playback?prepare=false`,{method:'POST',headers})).status,400);
    const controller=new AbortController(),background=fetch(base+`/v1/media/${tracks[0].id}/playback?prepare=true`,{method:'POST',headers,signal:controller.signal});const abandoned=assert.rejects(background);
    await waitUntil(()=>started>0);
    const foreground=fetch(base+`/v1/media/${tracks[0].id}/playback`,{method:'POST',headers});await waitUntil(()=>joined);
    controller.abort();await abandoned;release();const response=await foreground;assert.equal(response.status,200);assert.match((await response.json()).url,/^\/v1\/stream\/[a-f0-9]{64}$/);assert.equal(started,1);
    const diagnostics=await (await fetch(base+'/v1/playback/diagnostics',{headers})).json();assert.equal(diagnostics.samples[0].priority,'foreground');assert.equal(JSON.stringify(diagnostics).includes('googlevideo'),false);
  }finally{release();app.server.closeAllConnections();await app.close();}
});
