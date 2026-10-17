import test from 'node:test';
import assert from 'node:assert/strict';
import {createApi} from '../apps/api/server';
import {testConfig,FixtureResolver,tracks} from './fixtures';
import {mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {version} from '../package.json';
const headers={authorization:'Bearer test-token-only',origin:'http://127.0.0.1:5173'};
const base=`/v1/me/lyrics/${tracks[0].id}`;
const lyric={id:71,trackName:tracks[0].title,artistName:tracks[0].artist,albumName:'Album test 0',duration:12,instrumental:false,plainLyrics:'Riga originale\nSeconda riga',syncedLyrics:'[00:01]Riga originale\n[00:05]Seconda riga'};
async function fixture(fetcher:typeof fetch,extra:Parameters<typeof createApi>[0]={}){
  const config=extra.config??testConfig();const runtime=await createApi({config,devOrigin:headers.origin,resolver:new FixtureResolver(config,'unused'),rateLimitPerMinute:1000,...extra,lyricsOptions:{fetch:fetcher,delay:async()=>{},...extra.lyricsOptions}});
  for(const item of tracks)runtime.store.saveTrack(item);return runtime;
}
test('lyrics lookup accepts exact metadata, coalesces callers and reuses SQLite cache',async()=>{
  let calls=0;
  const {app}=await fixture(async(url,options)=>{calls++;assert.equal(new URL(String(url)).hostname,'lrclib.net');assert.equal(options?.redirect,'error');assert.ok((options?.headers as Record<string,string>)['User-Agent'].startsWith(`RITVIO/${version} (`));return Response.json(lyric);});
  try{
    const reads=await Promise.all([1,2,3].map(()=>app.inject({url:base,headers})));
    for(const read of reads){assert.equal(read.statusCode,200);assert.equal(read.json().status,'ready');assert.equal(read.json().document.provider,'lrclib');assert.equal(read.json().document.licenseVerified,false);assert.equal(read.json().document.lines.length,2);}
    assert.equal(calls,1);assert.equal((await app.inject({url:base,headers})).json().cacheHit,true);assert.equal(calls,1);
    assert.equal((await app.inject({url:`${base}?fresh=true`,headers})).json().cacheHit,false);assert.equal(calls,2);
  }finally{await app.close();}
});
test('uncertain editions and missing matches never silently select the first lyric',async()=>{
  let calls=0;const {app}=await fixture(async url=>{calls++;return String(url).includes('/get?')?new Response(null,{status:404}):Response.json([lyric,{...lyric,id:72}]);});
  try{const read=await app.inject({url:base,headers});assert.equal(read.json().status,'missing');assert.equal(read.json().document,null);assert.equal(calls,2);assert.equal((await app.inject({url:base,headers})).json().cacheHit,true);assert.equal(calls,2);}finally{await app.close();}
});
test('wrong title and duration are rejected while instrumental matches stay distinct',async()=>{
  const {app,store}=await fixture(async url=>String(url).includes('/get?')?Response.json({...lyric,trackName:'Versione live diversa',duration:200}):Response.json([]));
  try{assert.equal((await app.inject({url:base,headers})).json().status,'missing');store.db.exec('DELETE FROM lyrics_cache');}finally{await app.close();}
  const instrumental=await fixture(async()=>Response.json({...lyric,instrumental:true,plainLyrics:null,syncedLyrics:null}));
  try{const read=(await instrumental.app.inject({url:base,headers})).json();assert.equal(read.status,'instrumental');assert.equal(read.document.plainText,'');}finally{await instrumental.app.close();}
});
test('429 Retry-After stops both automatic and manual requests without caching failure',async()=>{
  let calls=0;const {app,store}=await fixture(async()=>{calls++;return new Response('Not JSON',{status:429,headers:{'retry-after':'120'}});},{lyricsOptions:{now:()=>100000}});
  try{
    const first=await app.inject({url:base,headers});assert.equal(first.statusCode,429);assert.equal(first.json().error.code,'LYRICS_RATE_LIMIT');assert.equal(first.json().error.retryAt,new Date(220000).toISOString());
    assert.equal((await app.inject({url:`${base}/search?title=Brano&artist=Artista`,headers})).statusCode,429);assert.equal(calls,1);
    assert.equal(store.db.prepare('SELECT count(*) n FROM lyrics_cache').get()!.n,0);
  }finally{await app.close();}
});
test('provider calls are sequential with the documented delay between requests',async()=>{
  let clock=0,inFlight=0,maxInFlight=0;const delays:number[]=[];
  const {app}=await fixture(async()=>{inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);await Promise.resolve();inFlight--;return Response.json([]);},{lyricsOptions:{now:()=>clock,delay:async ms=>{delays.push(ms);clock+=ms;}}});
  try{await Promise.all([1,2,3].map(i=>app.inject({url:`${base}/search?title=Brano${i}&artist=Artista`,headers})));assert.equal(maxInFlight,1);assert.deepEqual(delays,[300,300]);}finally{await app.close();}
});
test('manual version selection and personal imports are owner-scoped and removable',async()=>{
  const {app}=await fixture(async url=>String(url).endsWith('/get/71')?Response.json(lyric):new Response(null,{status:404}),{identityProvider:{resolve:async req=>({id:String(req.headers['x-fixture-owner']??'one'),mode:'online'})}});
  try{
    assert.equal((await app.inject({method:'POST',url:`${base}/select`,headers,payload:{providerId:71}})).json().document.providerId,71);
    const imported=await app.inject({method:'PUT',url:base,headers,payload:{text:'[00:02]<img src=x onerror=alert(1)>',format:'lrc',fileName:'test.lrc'}});
    assert.equal(imported.statusCode,200);assert.equal(imported.json().document.provider,'local');assert.equal(imported.json().document.lines[0].text,'<img src=x onerror=alert(1)>');
    assert.equal((await app.inject({url:base,headers})).json().document.fileName,'test.lrc');
    assert.equal((await app.inject({url:base,headers:{...headers,'x-fixture-owner':'two'}})).json().status,'missing');
    assert.equal((await app.inject({method:'DELETE',url:base,headers})).statusCode,200);assert.equal((await app.inject({url:base,headers})).json().status,'missing');
  }finally{await app.close();}
});
test('lyrics routes enforce authentication, shape, byte size, timestamps and provider IDs',async()=>{
  const {app}=await fixture(async()=>Response.json({...lyric,id:99}));
  try{
    assert.equal((await app.inject(base)).statusCode,401);assert.equal((await app.inject({url:base,headers:{...headers,origin:'https://evil.test'}})).statusCode,403);
    assert.equal((await app.inject({url:'/v1/me/lyrics/not-a-media-id',headers})).statusCode,400);
    for(const payload of [{text:'[00:99]Riga',format:'lrc',fileName:'test.lrc'},{text:'é'.repeat(100001),format:'txt',fileName:'test.txt'},{text:'Testo',format:'html',fileName:'test.html'}])assert.equal((await app.inject({method:'PUT',url:base,headers,payload})).statusCode,400);
    assert.equal((await app.inject({method:'POST',url:`${base}/select`,headers,payload:{providerId:'https://evil.test'}})).statusCode,400);
    assert.equal((await app.inject({method:'POST',url:`${base}/select`,headers,payload:{providerId:71}})).statusCode,503);
  }finally{await app.close();}
});
test('imported lyrics survive a real SQLite close and reopen with the same local profile',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'ritvio-lyrics-'));const config=testConfig({database:path.join(directory,'test.sqlite')});
  const first=await fixture(async()=>{throw Error('Should not call provider');},{config});
  await first.app.inject({method:'PUT',url:base,headers,payload:{text:'Testo personale originale',format:'txt',fileName:'originale.txt'}});await first.app.close();
  const second=await fixture(async()=>{throw Error('Should not call provider');},{config});
  try{const read=(await second.app.inject({url:base,headers})).json();assert.equal(read.document.plainText,'Testo personale originale');assert.equal(read.cacheHit,true);}finally{await second.app.close();}
});
test('provider queue is bounded and recovers after completing its pending searches',async()=>{
  let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
  const {app}=await fixture(async()=>{await gate;return Response.json([]);});
  try{const reads=Array.from({length:9},(_,i)=>app.inject({url:`${base}/search?title=Brano${i}&artist=Artista`,headers}));
    const rejected=await Promise.race(reads);assert.equal(rejected.statusCode,503);assert.equal(rejected.json().error.code,'LYRICS_BUSY');release();
    const replies=await Promise.all(reads);assert.equal(replies.filter(r=>r.statusCode===200).length,8);
    assert.equal((await app.inject({url:`${base}/search?title=Nuovo&artist=Artista`,headers})).statusCode,200);
  }finally{release();await app.close();}
});
