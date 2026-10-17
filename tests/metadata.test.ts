import {version} from '../package.json';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createApi} from '../apps/api/server';
import {normalizeGenres,compareMetadata} from '../packages/domain/metadata';
import {testConfig,FixtureResolver,tracks} from './fixtures';
const headers={authorization:'Bearer test-token-only'};
const candidate={id:7,kind:'track' as const,name:'Song (Live)',artist:'Artist',genre:normalizeGenres(['Electronic']),year:'2026',duration:120,album:'Album'};
test('genre normalization preserves subgenres and literal Unicode; comparison never strips edition or collaboration',()=>{
  assert.deepEqual(normalizeGenres([' Electronic ','electronic','Dream Pop','dream pop','日本の音楽','Music','HIP-HOP']).map(g=>g.name),['elettronica','dream pop','日本の音楽','hip hop']);
  const target={kind:'track' as const,id:'id',name:'Song',artists:['Artist'],year:'2026',duration:120};
  assert.equal(compareMetadata(candidate,target).quality,'weak');
  assert.equal(compareMetadata({...candidate,name:'Song'},target).quality,'strong');
  assert.equal(compareMetadata({...candidate,name:'Song',duration:150},target).quality,'partial');
  assert.equal(compareMetadata({...candidate,name:'Song'}, {...target,artists:['Artist','Another']} ).matches.artist,false);
});
async function fixture(fetcher:typeof fetch){const config=testConfig(),resolver=new FixtureResolver(config,'http://127.0.0.1:5199');const result=await createApi({config,resolver,metadataOptions:{fetch:fetcher,delay:async()=>{}}});result.store.saveTrack(tracks[1]);return result;}
const payload={results:[{wrapperType:'artist',artistId:7,artistName:'Artista test',primaryGenreName:'Electronic'},{wrapperType:'artist',artistId:8,artistName:'Artista test',primaryGenreName:'Rock'},{wrapperType:'artist',artistId:9,artistName:'<img src=x>',primaryGenreName:'Music'}]};
test('metadata suggestions remain unclassified until confirmed; profile genres override but never alter album/track or playback',async()=>{
  let calls=0;const {app,store}=await fixture((async(url,options)=>{calls++;assert.equal(new URL(String(url)).origin,'https://itunes.apple.com');assert.equal(options?.redirect,'error');assert.equal((options!.headers as any)['User-Agent'],`RITVIO/${version}`);return Response.json(payload);}) as typeof fetch);
  const base='/v1/me/metadata/artist/UCtestArtist01';
  try{
    let response=await app.inject({url:base,headers});assert.equal(response.json().status,'unclassified');assert.equal(calls,0);
    response=await app.inject({method:'POST',url:base+'/search',headers,payload:{}});assert.equal(response.statusCode,200);assert.equal(response.json().candidates.length,3);assert.deepEqual(response.json().genres,[]);assert.equal(response.json().candidates[0].quality,'partial');
    response=await app.inject({method:'PUT',url:base+'/selection',headers,payload:{providerId:7}});assert.equal(response.json().status,'confirmed');assert.equal(response.json().genres[0].name,'elettronica');
    response=await app.inject({method:'PUT',url:base+'/genres',headers,payload:{genres:['Dream Pop','dream pop','日本の音楽']}});assert.equal(response.json().status,'local');assert.equal(response.json().genres.length,2);
    response=await app.inject({url:`/v1/me/metadata/track/${tracks[1].id}`,headers});assert.deepEqual(response.json().genres,[]);
    response=await app.inject({url:'/v1/me/metadata/album/MPREb_test1',headers});assert.deepEqual(response.json().genres,[]);
    response=await app.inject({method:'POST',url:base+'/search',headers,payload:{}});assert.equal(calls,1);
    response=await app.inject({method:'DELETE',url:base+'/genres',headers});assert.equal(response.json().genres[0].name,'elettronica');
    response=await app.inject({method:'DELETE',url:base+'/selection',headers});assert.deepEqual(response.json().genres,[]);
    assert.equal(store.db.prepare('SELECT count(*) n FROM library_history').get()!.n,0);
  }finally{await app.close();}
});
test('metadata validation denies forged candidates, arbitrary owners/URLs, extra properties and oversized local edits',async()=>{
  const {app}=await fixture((async()=>Response.json(payload)) as typeof fetch);const base='/v1/me/metadata/artist/UCtestArtist01';
  try{for(const [method,path,body] of [['PUT','/selection',{providerId:999}],['POST','/search',{query:'Artist',url:'https://example.com'}],['PUT','/genres',{genres:Array(21).fill('Rock')}],['PUT','/genres',{genres:['x'.repeat(61)]}],['PUT','/genres',{genres:['Rock'],owner:'other'}]] as const){assert.equal((await app.inject({method,url:base+path,headers,payload:body})).statusCode,400);}
    assert.equal((await app.inject({url:base})).statusCode,401);assert.equal((await app.inject({url:base,headers:{...headers,origin:'https://evil.example'}})).statusCode,403);
  }finally{await app.close();}
});
test('expired iTunes results degrade gracefully on failure and manual genres remain available',async()=>{
  let failed=false,calls=0;const {app,store}=await fixture((async()=>{calls++;return failed?new Response(null,{status:503}):Response.json(payload);}) as typeof fetch);const base='/v1/me/metadata/artist/UCtestArtist01';
  try{
    await app.inject({method:'POST',url:base+'/search',headers,payload:{}});store.db.exec('UPDATE metadata_cache SET expires=0');failed=true;
    const response=await app.inject({method:'POST',url:base+'/search',headers,payload:{}});assert.equal(response.statusCode,200);assert.equal(response.json().cache.degraded,true);assert.equal(response.json().cache.stale,true);assert.equal(calls,2);
    assert.equal((await app.inject({method:'PUT',url:base+'/genres',headers,payload:{genres:['ambient']}})).json().genres[0].name,'ambient');
    const missing=await app.inject({method:'POST',url:base+'/search',headers,payload:{query:'different query'}});assert.equal(missing.statusCode,429);assert.equal(calls,2);
    assert.equal((await app.inject({url:base,headers})).json().genres[0].name,'ambient');
  }finally{await app.close();}
});
test('metadata search coalesces identical queries and caps response size',async()=>{
  let calls=0,release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
  const {app}=await fixture((async()=>{calls++;await gate;return Response.json(payload);}) as typeof fetch);const options={method:'POST' as const,url:'/v1/me/metadata/artist/UCtestArtist01/search',headers,payload:{}};
  try{await app.ready();const a=app.inject(options).then(r=>r),b=app.inject(options).then(r=>r);await new Promise(resolve=>setTimeout(resolve,30));release();assert.equal((await a).statusCode,200);assert.equal((await b).statusCode,200);assert.equal(calls,1);}finally{release();await app.close();}
  const large=await fixture((async()=>new Response('x'.repeat(1024*1024+1))) as typeof fetch);try{assert.equal((await large.app.inject(options)).statusCode,502);}finally{await large.app.close();}
});
test('genre overrides are isolated per profile in SQLite and empty override is explicit',async()=>{
  const config=testConfig();let owner='one';const ids={one:crypto.randomUUID(),two:crypto.randomUUID()};const resolver=new FixtureResolver(config,'http://127.0.0.1:5199');const {app,store}=await createApi({config,resolver,identityProvider:{resolve:async()=>({id:store.library.ensureProfile('online',ids[owner as keyof typeof ids]).id,mode:'online'})}});
  const base='/v1/me/metadata/artist/UCtestArtist01';try{
    await app.inject({method:'PUT',url:base+'/genres',headers,payload:{genres:['ambient']}});owner='two';assert.deepEqual((await app.inject({url:base,headers})).json().genres,[]);owner='one';assert.equal((await app.inject({url:base,headers})).json().genres[0].name,'ambient');
    const empty=await app.inject({method:'PUT',url:base+'/genres',headers,payload:{genres:[]}});assert.equal(empty.json().status,'local');assert.deepEqual(empty.json().localGenres,[]);
  }finally{await app.close();}
});
test('personal metadata limit preserves existing rows and pending provider queue rejects excess queries',async()=>{
  const {app,store}=await fixture((async()=>Response.json(payload)) as typeof fetch);const base='/v1/me/metadata/artist/UCtestArtist01';
  try{const owner=String(store.db.prepare("SELECT id FROM library_profiles WHERE mode='local'").get()!.id);
    store.db.prepare("WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<10000) INSERT INTO metadata_choices(owner,target,updated) SELECT ?,'artist:filler'||x,0 FROM n").run(owner);
    assert.equal((await app.inject({method:'PUT',url:base+'/genres',headers,payload:{genres:['ambient']}})).statusCode,400);
    assert.equal(store.db.prepare('SELECT count(*) n FROM metadata_choices').get()!.n,10000);
  }finally{await app.close();}
  let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);const queued=await fixture((async()=>{await gate;return Response.json(payload);}) as typeof fetch);
  try{await queued.app.ready();const requests=Array.from({length:7},(_,index)=>queued.app.inject({method:'POST',url:base+'/search',headers,payload:{query:`Artist ${index}`}}).then(r=>r));await new Promise(resolve=>setTimeout(resolve,30));release();const responses=await Promise.all(requests);assert.equal(responses.filter(r=>r.statusCode===429).length,1);assert.equal(responses.filter(r=>r.statusCode===200).length,6);}finally{release();await queued.app.close();}
});
