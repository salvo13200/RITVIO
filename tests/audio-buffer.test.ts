import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {AudioRangeBuffer} from '../apps/api/audio-range-buffer';
import {createAudioStreams} from '../apps/api/audio-stream';
import type {Playback} from '../packages/domain/index';
const data=Buffer.from(Array.from({length:1200000},(_,i)=>i%251));
const descriptor=(url='https://fixture.googlevideo.com/one'):Playback=>({mode:'youtube-audio-resolver',accessMethod:'unofficial-extraction',provider:'youtube',videoId:'testmusic01',url,expiresAt:new Date(Date.now()+600000).toISOString(),capabilities:{background:true,seek:true,volume:true,equalizer:false,offline:false}});
const join=(range:ReturnType<AudioRangeBuffer['take']>)=>range&&Buffer.concat(range.chunks);

test('RAM ranges preserve arbitrary offsets, suffixes and gaps; overlap never combines incorrect bytes',()=>{
  const cache=new AudioRangeBuffer(()=>0);
  cache.put('a',100,'audio/mp4',data.length,0,data.subarray(0,100000));
  cache.put('a',100,'audio/mp4',data.length,200000,data.subarray(200000,260000));
  for(const [start,end] of [[0,500],[543,1500],[65530,70000],[99990,100010],[210000,220000]]){
    const range=cache.take('a',`bytes=${start}-${end}`)!;assert.deepEqual(join(range),data.subarray(start,range.end+1));assert.ok(range.end<=end);
  }
  assert.equal(cache.take('a','bytes=110000-120000'),undefined);
  cache.put('a',100,'audio/mp4',data.length,data.length-50,data.subarray(-50));
  assert.deepEqual(join(cache.take('a','bytes=-20')),data.subarray(-20));
  cache.put('a',100,'audio/mp4',data.length,100,Buffer.from([1,2,3]));
  assert.deepEqual(join(cache.take('a','bytes=100-102')),Buffer.from([1,2,3]));
});

test('RAM storage is bounded by total bytes, per-stream bytes, entries and fragment count, and expires',()=>{
  let time=0;const cache=new AudioRangeBuffer(()=>time,400000,200000,2);
  for(let i=0;i<20;i++)cache.put('a',100,'audio/mp4',data.length,i*50000,data.subarray(i*50000,(i+1)*50000));
  assert.ok(cache.diagnostics().bytes<=200000);assert.equal(cache.take('a','bytes=0-10'),undefined);
  cache.put('b',100,'audio/mp4',data.length,0,data.subarray(0,200000));
  cache.put('c',100,'audio/mp4',data.length,0,data.subarray(0,200000));
  assert.ok(cache.diagnostics().bytes<=400000);assert.equal(cache.diagnostics().streams,2);
  for(let i=0;i<1000;i++)cache.put('c',100,'audio/mp4',data.length,i,Buffer.from([i%251]));
  assert.ok(cache.diagnostics().parts<=512);
  time=101;assert.equal(cache.take('c','bytes=999-999'),undefined);assert.equal(cache.diagnostics().bytes,0);
});

test('overlapping delivery preserves already buffered bytes before and after a replacement',()=>{
  const cache=new AudioRangeBuffer(()=>0),original=data.subarray(0,100000),replacement=Buffer.alloc(15000,197);
  cache.put('a',100,'audio/mp4',data.length,0,original);
  cache.put('a',100,'audio/mp4',data.length,60000,replacement);
  const expected=Buffer.from(original);replacement.copy(expected,60000);
  const retained=cache.take('a','bytes=0-99999');
  assert.ok(retained,'a backward seek to the buffered prefix must stay a RAM hit');
  assert.equal(retained.end,99999,'an overlap must not create gaps in previously received audio');
  assert.deepEqual(join(retained),expected);
  assert.equal(cache.diagnostics().bytes,original.length,'overwritten bytes must not be counted twice');
});

test('signed URL changes and representation changes cannot reuse stale audio',()=>{
  const cache=new AudioRangeBuffer(()=>0);cache.put('signed-one',100,'audio/mp4',100,0,Buffer.alloc(100,1));
  assert.equal(cache.take('signed-two','bytes=0-'),undefined);
  cache.put('signed-one',100,'audio/mp4',200,100,Buffer.alloc(100,2));
  assert.equal(cache.take('signed-one','bytes=0-'),undefined);
  assert.deepEqual(join(cache.take('signed-one','bytes=100-199')),Buffer.alloc(100,2));
  cache.clear();assert.equal(cache.diagnostics().bytes,0);
});

function provider(calls:string[]){return async(_url:unknown,options?:RequestInit)=>{
  const range=(options?.headers as {Range?:string})?.Range;calls.push(range??'full');
  const match=/^bytes=(\d+)-(\d*)$/.exec(range??'');
  const start=Number(match?.[1]??0),end=Math.min(data.length-1,match?.[2]?Number(match[2]):data.length-1);
  return new Response(data.subarray(start,end+1),{status:match?206:200,headers:{'Content-Type':'audio/mp4','Content-Length':String(end-start+1),'Accept-Ranges':'bytes',...(match?{'Content-Range':`bytes ${start}-${end}/${data.length}`}:{})}});
};}

test('preloading fetches only 512 KiB; a prepared next track starts from RAM and the next range continues exactly',async()=>{
  const calls:string[]=[],app=Fastify(),streams=createAudioStreams(app,provider(calls));
  try{
    const media=descriptor();await streams.prepare(media,new AbortController().signal);assert.deepEqual(calls,['bytes=0-524287']);
    const ticket=streams.issue(media),first=await app.inject({url:ticket.url,headers:{range:'bytes=0-'}});
    assert.equal(first.statusCode,206);assert.equal(first.headers['x-ritvio-buffer'],'hit');assert.equal(first.headers['content-range'],`bytes 0-524287/${data.length}`);
    assert.deepEqual(first.rawPayload,data.subarray(0,524288));assert.equal(calls.length,1);
    const rest=await app.inject({url:ticket.url,headers:{range:'bytes=524288-'}});
    assert.deepEqual(rest.rawPayload,data.subarray(524288));assert.equal(calls.length,2);
    const seek=await app.inject({url:ticket.url,headers:{range:'bytes=600000-601000'}});
    assert.equal(seek.headers['x-ritvio-buffer'],'hit');assert.deepEqual(seek.rawPayload,data.subarray(600000,601001));assert.equal(calls.length,2);
    assert.equal(streams.diagnostics().warmCompleted,1);assert.ok(!JSON.stringify(streams.diagnostics()).includes('googlevideo'));
  }finally{await app.close();}
});

test('an overlapping origin response does not force later backward seeks to repeat a network request',async()=>{
  const calls:string[]=[],app=Fastify(),fetch=provider(calls);
  let releaseFirst!:()=>void,releaseSecond!:()=>void;
  const firstGate=new Promise<void>(resolve=>releaseFirst=resolve),secondGate=new Promise<void>(resolve=>releaseSecond=resolve);
  const streams=createAudioStreams(app,async(url,options)=>{
    const response=await fetch(url,options);
    if(calls.length===1)await firstGate;else if(calls.length===2)await secondGate;
    return response;
  });
  const waitFor=async(count:number)=>{for(let i=0;i<100&&calls.length<count;i++)await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.length,count);};
  try{
    const ticket=streams.issue(descriptor());
    const first=app.inject({url:ticket.url,headers:{range:'bytes=0-99999'}}).then(value=>value);await waitFor(1);
    // Both origin reads begin before either body has reached RAM, as on rapid seeks.
    const second=app.inject({url:ticket.url,headers:{range:'bytes=70000-150000'}}).then(value=>value);await waitFor(2);
    releaseFirst();await first;releaseSecond();await second;
    assert.equal(calls.length,2);
    const backward=await app.inject({url:ticket.url,headers:{range:'bytes=66000-69000'}});
    assert.equal(backward.headers['x-ritvio-buffer'],'hit');
    assert.deepEqual(backward.rawPayload,data.subarray(66000,69001));
    assert.equal(calls.length,2,'the old fragment must survive the overlapping response');
  }finally{releaseFirst();releaseSecond();await app.close();}
});

test('an origin ignoring Range is cancelled before consuming its full body and still plays normally',async()=>{
  let cancelled=0;const app=Fastify();const streams=createAudioStreams(app,async()=>new Response(new ReadableStream({start(c){c.enqueue(data);c.close();},cancel(){cancelled++;}}),{headers:{'Content-Type':'audio/mp4','Content-Length':String(data.length)}}));
  try{await streams.prepare(descriptor(),new AbortController().signal);assert.equal(streams.diagnostics().bytes,0);assert.equal(cancelled,1);
    const response=await app.inject({url:streams.issue(descriptor()).url});assert.equal(response.statusCode,200);assert.deepEqual(response.rawPayload,data);
  }finally{await app.close();}
});

test('an obsolete speculative transfer is aborted without failing or replacing current audio',async()=>{
  let speculativeSignal:AbortSignal|undefined;
  const calls:string[]=[],normal=provider(calls),app=Fastify();
  const streams=createAudioStreams(app,async(url,options)=>{
    if(String(url).endsWith('/slow')){speculativeSignal=options?.signal!;return new Promise<Response>((_resolve,reject)=>{options?.signal?.addEventListener('abort',()=>reject(Error('cancelled')),{once:true});});}
    return normal(url,options);
  });
  try{
    const warm=streams.prepare(descriptor('https://fixture.googlevideo.com/slow'),new AbortController().signal);
    const selected=await app.inject({url:streams.issue(descriptor()).url,headers:{range:'bytes=0-100'}});await warm;
    assert.equal(speculativeSignal?.aborted,true);assert.equal(selected.statusCode,206);assert.deepEqual(selected.rawPayload,data.subarray(0,101));assert.equal(streams.diagnostics().warmCancelled,1);
  }finally{await app.close();}
});
