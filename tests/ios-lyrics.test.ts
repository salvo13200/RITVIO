import test from 'node:test';
import assert from 'node:assert/strict';
import {IOSLyricsClient,matchIOSLyrics} from '../apps/mobile/src/ios/lyrics-client';
import type {NativeTrack} from '../packages/domain/mobile';

const track:NativeTrack={videoId:'ritviotest1',title:'After the rain (Official Audio)',artist:'Luna Vale - Topic',duration:90,thumbnail:'',artists:[{id:'fixture-artist',name:'Luna Vale'}]};
const record={id:1,trackName:'After the rain',artistName:'Luna Vale',duration:90,instrumental:false,plainLyrics:'The city wakes\nWe start again',syncedLyrics:'[00:00]The city wakes\n[00:24]We start again'};
const reply=(data:unknown,status=200,headers:Record<string,string>={})=>({data,status,headers});
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

test('lyrics require the actual artist and title, preserving live/remix versions',()=>{
 assert.equal(matchIOSLyrics({...record,artistName:'Unrelated artist'},track),null);
 assert.equal(matchIOSLyrics({...record,trackName:'After the rain live'},track),null);
 assert.equal(matchIOSLyrics(record,track)!.document.lines[1].at,24);
 assert.equal(matchIOSLyrics({...record,duration:101},track),null);
});
test('uncertain duration keeps readable words without false synchronized timing',()=>{
 assert.equal(matchIOSLyrics({...record,duration:94},track)!.document.lines.length,0);
 assert.equal(matchIOSLyrics({...record,plainLyrics:null},{...track,duration:0})!.document.plainText,'The city wakes\nWe start again');
 assert.equal(matchIOSLyrics({...record,plainLyrics:null,syncedLyrics:'[invalid]'},track),null);
});
test('simultaneous readers share the lookup and the bounded cache',async()=>{
 let requests=0;const client=new IOSLyricsClient(async()=>{requests++;return reply(record);},Date.now,async()=>{});
 const [a,b]=await Promise.all([client.lookup(track),client.lookup(track)]);
 assert.equal(a.status,'ready');assert.equal(b.status,'ready');assert.equal(requests,1);
 assert.equal((await client.lookup(track)).cacheHit,true);assert.equal(requests,1);
});
test('rapid changes keep only the latest waiting track and ignore obsolete responses',async()=>{
 let release!:(value:ReturnType<typeof reply>)=>void;const requested:string[]=[];
 const client=new IOSLyricsClient(async url=>{requested.push(url);if(requested.length===1)return new Promise(resolve=>{release=resolve;});return reply({...record,trackName:'Third song'});},Date.now,async()=>{});
 const controller=new AbortController(),first=client.lookup(track,{signal:controller.signal});const firstClosed=assert.rejects(first,{code:'LYRICS_CANCELLED'});await tick();
 const second=client.lookup({...track,videoId:'ritviotest2',title:'Second song'});const secondClosed=assert.rejects(second,{code:'LYRICS_CANCELLED'});
 const third=client.lookup({...track,videoId:'ritviotest3',title:'Third song'});controller.abort();release(reply(record));
 await firstClosed;await secondClosed;assert.equal((await third).document!.title,'Third song');assert.equal(requested.length,2);assert.ok(!requested.some(url=>url.includes('Second')));
});
test('rate limits survive cancellation and cannot be bypassed by fresh retry',async()=>{
 let release!:(value:ReturnType<typeof reply>)=>void,calls=0;const client=new IOSLyricsClient(async()=>{calls++;return new Promise(resolve=>{release=resolve;});},()=>1000,async()=>{});
 const controller=new AbortController(),first=client.lookup(track,{signal:controller.signal});const closed=assert.rejects(first,{code:'LYRICS_CANCELLED'});await tick();
 controller.abort();release(reply(null,429,{'Retry-After':'60'}));await closed;await tick();
 await assert.rejects(client.lookup(track,{fresh:true}),{code:'LYRICS_RATE_LIMIT'});assert.equal(calls,1);
});
test('missing results expire and retry invalidates only their cache entry',async()=>{
 let now=1000,calls=0;const client=new IOSLyricsClient(async url=>{calls++;return url.includes('/get?')?reply(null,404):reply([]);},()=>now,async()=>{});
 assert.equal((await client.lookup(track)).status,'missing');await client.lookup(track);assert.equal(calls,2);
 await client.lookup(track,{fresh:true});assert.equal(calls,4);now+=120001;await client.lookup(track);assert.equal(calls,6);
});
test('ambiguous editions and oversized or redirected responses are not silently accepted',async()=>{
 const ambiguous=new IOSLyricsClient(async url=>url.includes('/get?')?reply(null,404):reply([record,{...record,id:2,syncedLyrics:'[00:00]Different recording'}]),Date.now,async()=>{});
 assert.equal((await ambiguous.lookup(track)).status,'missing');
 const large=new IOSLyricsClient(async()=>reply('x'.repeat(2_000_001)),Date.now,async()=>{});await assert.rejects(large.lookup(track),{code:'LYRICS_INVALID_RESPONSE'});
 const redirect=new IOSLyricsClient(async()=>({...reply(record),url:'https://other.example/api/get'}),Date.now,async()=>{});await assert.rejects(redirect.lookup(track),{code:'LYRICS_INVALID_RESPONSE'});
});
