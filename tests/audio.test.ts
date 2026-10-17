import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {createApi} from '../apps/api/server';
import {createAudioStreams,validAudioRange} from '../apps/api/audio-stream';
import {defaultAudio,cleanAudio,audioPreset} from '../packages/domain/audio';
import {testConfig,FixtureResolver,tracks,toneWav} from './fixtures';
import type {Playback} from '../packages/domain/index';

const headers={authorization:'Bearer test-token-only',origin:'http://127.0.0.1:5173'};
const descriptor=(expires=Date.now()+60000,url='https://fixture.googlevideo.com/audio'):Playback=>({mode:'youtube-audio-resolver',accessMethod:'unofficial-extraction',provider:'youtube',videoId:tracks[0].videoId,url,expiresAt:new Date(expires).toISOString(),capabilities:{background:true,seek:true,volume:true,equalizer:false,offline:false}});
test('audio preferences migrate safely and bound damaged or hostile persisted values',()=>{
  assert.deepEqual(cleanAudio(undefined),defaultAudio());
  assert.deepEqual(cleanAudio({enabled:'yes',bands:[NaN,Infinity,-99,99,'1'],preamp:100,pan:-4}),{enabled:false,bands:[0,0,-12,12,0],preamp:6,pan:-1});
  assert.deepEqual(cleanAudio({enabled:true,bands:[2],preamp:-99,pan:Infinity}),{enabled:true,bands:[2,0,0,0,0],preamp:-12,pan:0});
  assert.equal(audioPreset(defaultAudio()),'flat');assert.equal(audioPreset({...defaultAudio(),bands:[1,2,3,4,5]}),'custom');
});
test('stream ranges are single, bounded integer byte ranges',()=>{
  for(const value of [undefined,'bytes=0-','bytes=5-10','bytes=-64'])assert.equal(validAudioRange(value),true);
  for(const value of ['bytes=','bytes=-','bytes=5-2','bytes=0-1,2-3','bytes=-0','bytes=9007199254740992-','bytes=1.5-','items=0-1'])assert.equal(validAudioRange(value),false,value);
});
test('audio tickets are bounded, expire and only mint from trusted HTTPS descriptors',async()=>{
  const app=Fastify();let time=Date.now();const streams=createAudioStreams(app,fetch,()=>time);
  try{
    const first=streams.issue(descriptor());assert.equal(streams.authorized(first.url),true);assert.equal(first.capabilities.equalizer,true);
    assert.equal(streams.authorized(first.url+'?url=https://evil.test'),false);
    for(let i=0;i<128;i++)streams.issue(descriptor());assert.equal(streams.authorized(first.url),false);
    const last=streams.issue(descriptor(time+1000));time+=1001;assert.equal(streams.authorized(last.url),false);
    for(const url of ['http://r1.googlevideo.com/audio','https://localhost/audio','https://googlevideo.com.evil.test/audio'])assert.throws(()=>streams.issue(descriptor(time+10000,url)),/non valido/);
    assert.throws(()=>streams.issue(descriptor(time-1)),/scaduto/);
  }finally{await app.close();}
});
test('authenticated playback streams preserve Range and bytes without cookies or upstream URL exposure',async()=>{
  const config=testConfig();const seen:RequestInit[]=[];const wav=toneWav(1);
  const {app}=await createApi({config,devOrigin:headers.origin,resolver:new FixtureResolver(config,''),streamFetch:async(_url,options)=>{
    seen.push(options!);return new Response(wav.subarray(0,64),{status:206,headers:{'Content-Type':'audio/wav','Content-Length':'64','Accept-Ranges':'bytes','Content-Range':`bytes 0-63/${wav.length}`,'Set-Cookie':'secret=never'}});
  }});
  try{
    await app.inject({method:'POST',url:'/v1/links/resolve',headers,payload:{videoId:tracks[0].videoId}});
    const playback=await app.inject({method:'POST',url:`/v1/media/${tracks[0].id}/playback`,headers});
    const stream=playback.json().url;assert.match(stream,/^\/v1\/stream\/[a-f0-9]{64}$/);assert.equal(playback.body.includes('googlevideo'),false);
    assert.equal((await app.inject({method:'POST',url:`/v1/media/${tracks[0].id}/playback`})).statusCode,401);
    const response=await app.inject({url:stream,headers:{origin:headers.origin,range:'bytes=0-63'}});
    assert.equal(response.statusCode,206);assert.deepEqual(response.rawPayload,wav.subarray(0,64));assert.equal(response.headers['content-range'],`bytes 0-63/${wav.length}`);
    assert.equal(response.headers['set-cookie'],undefined);assert.equal(response.headers['cache-control'],'no-store');
    assert.equal(response.headers['access-control-allow-origin'],headers.origin);assert.deepEqual(seen[0].headers,{Range:'bytes=0-63'});assert.equal(seen[0].redirect,'manual');
    assert.equal((await app.inject({url:stream,headers:{origin:'https://evil.test'}})).statusCode,403);
    assert.equal((await app.inject({url:stream,headers:{range:'bytes=0-2,4-6'}})).statusCode,416);
    assert.equal((await app.inject({url:'/v1/stream/'+ '0'.repeat(64)})).statusCode,401);
    assert.equal((await app.inject({url:stream+'?url=https://evil.test'})).statusCode,401);
    assert.equal(seen.length,1);
  }finally{await app.close();}
});
test('stream redirects cannot escape Googlevideo and HTML/error bodies never reach the decoder',async()=>{
  for(const mode of ['redirect','html','expired','range'] as const){
    const config=testConfig();let calls=0;
    const {app}=await createApi({config,devOrigin:headers.origin,resolver:new FixtureResolver(config,''),streamFetch:async()=>{
      calls++;
      if(mode==='redirect')return new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}});
      if(mode==='html')return new Response('<html>upstream secret</html>',{headers:{'Content-Type':'text/html'}});
      if(mode==='expired')return new Response('upstream secret',{status:403});
      return new Response(null,{status:416,headers:{'Content-Range':'bytes */10'}});
    }});
    try{
      await app.inject({method:'POST',url:'/v1/links/resolve',headers,payload:{videoId:tracks[0].videoId}});
      const url=(await app.inject({method:'POST',url:`/v1/media/${tracks[0].id}/playback`,headers})).json().url;
      const response=await app.inject({url});assert.equal(response.statusCode,mode==='range'?416:502);assert.equal(calls,1);assert.equal(response.body.includes('secret'),false);
      if(mode==='range')assert.equal(response.headers['content-range'],'bytes */10');
    }finally{await app.close();}
  }
});
test('closing a downstream audio request aborts its upstream streaming request',async()=>{
  const config=testConfig();let upstream:AbortSignal|undefined;
  const {app}=await createApi({config,devOrigin:headers.origin,resolver:new FixtureResolver(config,''),streamFetch:async(_url,options)=>{
    upstream=options!.signal!;let interval:ReturnType<typeof setInterval>;
    return new Response(new ReadableStream<Uint8Array>({start(controller){interval=setInterval(()=>controller.enqueue(new Uint8Array(1024)),10);upstream!.addEventListener('abort',()=>{clearInterval(interval);controller.error(Error('cancelled'));},{once:true});},cancel(){clearInterval(interval);}}),{headers:{'Content-Type':'audio/mp4'}});
  }});
  try{
    await app.inject({method:'POST',url:'/v1/links/resolve',headers,payload:{videoId:tracks[0].videoId}});
    const url=(await app.inject({method:'POST',url:`/v1/media/${tracks[0].id}/playback`,headers})).json().url;
    const base=await app.listen({host:'127.0.0.1',port:0});const controller=new AbortController();
    const response=await fetch(base+url,{signal:controller.signal});await response.body!.getReader().read();controller.abort();
    for(let i=0;i<100&&!upstream?.aborted;i++)await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(upstream?.aborted,true);
  }finally{await app.close();}
});
