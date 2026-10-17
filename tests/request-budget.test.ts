import test from 'node:test';
import assert from 'node:assert/strict';
import {createApi} from '../apps/api/server';
import {requestBudget} from '../apps/api/request-budget';
import {testConfig,tracks,FixtureResolver} from './fixtures';
const headers={authorization:'Bearer test-token-only'};
test('production budgets isolate repeated playback and Range/seek from search and local page traffic',async()=>{
  const config=testConfig();let streamCalls=0;
  const {app,store}=await createApi({config,resolver:new FixtureResolver(config,''),streamFetch:async()=>{streamCalls++;return new Response(new Uint8Array([1,2,3]),{status:206,headers:{'Content-Type':'audio/mp4','Content-Range':'bytes 0-2/3'}});}});store.saveTrack(tracks[0]);
  try{
    for(let i=0;i<120;i++){
      assert.equal((await app.inject({url:`/v1/media/${tracks[0].id}`,headers})).statusCode,200);
      const result=await app.inject({method:'POST',url:`/v1/media/${tracks[0].id}/playback${i%2?'?prepare=true':''}`,headers});assert.equal(result.statusCode,200);
      assert.equal((await app.inject({url:result.json().url,headers:{range:'bytes=0-2'}})).statusCode,206);
    }
    assert.equal(streamCalls,120);
    assert.equal((await app.inject({url:'/v1/me/library',headers})).statusCode,200);
    assert.equal((await app.inject({url:'/v1/search?q=Musica%20test',headers})).statusCode,200);
  }finally{await app.close();}
});
test('exhausted provider and local budgets preserve playback, authentication and a truthful retry time',async()=>{
  const {app,store}=await createApi({config:testConfig(),resolver:new FixtureResolver(testConfig(),''),rateLimitPerMinute:2});store.saveTrack(tracks[0]);
  try{
    for(let i=0;i<2;i++){assert.equal((await app.inject({url:'/v1/search?q=Musica%20test',headers})).statusCode,200);assert.equal((await app.inject({url:'/v1/me/library',headers})).statusCode,200);}
    const blocked=await app.inject({url:'/v1/search?q=Musica%20test',headers});assert.equal(blocked.statusCode,429);assert.equal(blocked.json().error.code,'RATE_LIMIT');assert.ok(Number(blocked.headers['retry-after'])>0);assert.ok(Date.parse(blocked.json().error.retryAt)>Date.now());
    assert.equal((await app.inject({url:'/v1/me/library',headers})).statusCode,429);
    assert.equal((await app.inject({method:'POST',url:`/v1/media/${tracks[0].id}/playback`,headers})).statusCode,200);
    assert.equal((await app.inject({method:'POST',url:`/v1/media/${tracks[0].id}/playback`})).statusCode,401);
    assert.equal((await app.inject({url:'/v1/stream/'+ 'a'.repeat(64)})).statusCode,401);
  }finally{await app.close();}
});
test('essential exemptions are limited to actual playback methods and known path shapes',()=>{
  assert.equal(requestBudget('POST',`/v1/media/${tracks[0].id}/playback?prepare=true`),'essential');assert.equal(requestBudget('POST','/v1/me/listening/checkpoints'),'essential');
  assert.equal(requestBudget('DELETE',`/v1/media/${tracks[0].id}`),'local');assert.equal(requestBudget('GET','/v1/media/not-valid'),'local');assert.equal(requestBudget('GET','/v1/stream/'+ 'a'.repeat(64)),'essential');
  assert.equal(requestBudget('GET','/v1/search?q=test'),'catalog');assert.equal(requestBudget('GET',`/v1/me/lyrics/${tracks[0].id}`),'lyrics');assert.equal(requestBudget('GET',`/v1/me/metadata/track/${tracks[0].id}`),'metadata');
});
test('stream concurrency remains bounded independently of the minute budgets',async()=>{
  let started=0,release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
  const {app,store}=await createApi({config:testConfig(),resolver:new FixtureResolver(testConfig(),''),streamFetch:async()=>{started++;await gate;return new Response(new Uint8Array([1]),{headers:{'Content-Type':'audio/mp4'}});}});store.saveTrack(tracks[0]);
  const ticket=(await app.inject({method:'POST',url:`/v1/media/${tracks[0].id}/playback`,headers})).json().url;
  const base=await app.listen({host:'127.0.0.1',port:0});
  try{
    const requests=Array.from({length:16},()=>fetch(base+ticket).then(async r=>{await r.arrayBuffer();return r.status;}));
    const deadline=Date.now()+5000;while(started<16&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,5));assert.equal(started,16);
    const overflow=await fetch(base+ticket);assert.equal(overflow.status,429);assert.equal((await overflow.json()).error.code,'STREAM_BUSY');release();assert.deepEqual(await Promise.all(requests),Array(16).fill(200));
  }finally{release();app.server.closeAllConnections();await app.close();}
});
