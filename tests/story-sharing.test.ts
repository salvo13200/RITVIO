import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {deflateSync} from 'node:zlib';
import {excerptRows,selectedExcerpt,chooseExcerpt,excerptRange} from '../packages/domain/story-sharing';
import {createApi} from '../apps/api/server';
import {FixtureResolver,testConfig,tracks} from './fixtures';
const {validateStoryPng,storyFilename}=createRequire(import.meta.url)('../apps/desktop/story-export.cjs');
function crc(buffer:Buffer){let crc=0xffffffff;for(const byte of buffer){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function chunk(name:string,data:Buffer){const out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);out.write(name,4);data.copy(out,8);out.writeUInt32BE(crc(out.subarray(4,-4)),out.length-4);return out;}
function png(width=1080,height=1920){const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.alloc((width*4+1)*height))),chunk('IEND',Buffer.alloc(0))]);}
test('sharing selects a contiguous interval, reverse endpoints, blank rows and Unicode count',()=>{
  const rows=excerptRows({plainText:'  prima\r\n\r\n🎵 seconda\r\nterza  '});assert.deepEqual(rows,['prima','','🎵 seconda','terza']);
  const first=chooseExcerpt(rows,null,2),selection=chooseExcerpt(rows,first.selection,0).selection;
  const range=excerptRange(selection);assert.deepEqual(range,{start:0,end:2});
  const result=selectedExcerpt(rows,range);assert.equal(result.text,'prima\n\n🎵 seconda');assert.equal(result.characters,16);assert.equal(result.lines,3);assert.equal(result.problem,null);
  assert.equal(selectedExcerpt(rows,{start:0,end:3}).problem,'whole');assert.equal(selectedExcerpt(rows,{start:9,end:9}).problem,'empty');
});
test('sharing accepts ten original rows, rejects eleven and has no character limit',()=>{
  assert.equal(selectedExcerpt(['one','two'],{start:0,end:1}).problem,'whole');assert.equal(selectedExcerpt(['','one','two',''],{start:1,end:2}).problem,'whole');
  assert.equal(selectedExcerpt(['x'.repeat(150),'other'],{start:0,end:0}).problem,null);assert.equal(selectedExcerpt(['x'.repeat(1500),'other'],{start:0,end:0}).problem,null);
  assert.equal(selectedExcerpt(Array(8).fill('Un verso lungo '.repeat(10)),{start:0,end:5}).problem,null);
  assert.equal(selectedExcerpt(Array(12).fill('x'),{start:0,end:9}).problem,null);assert.equal(selectedExcerpt(Array(12).fill('x'),{start:0,end:10}).problem,'lines');
});
test('sharing keeps its anchor through repeated clicks, rejects invalid extensions atomically and resets explicitly',()=>{
  const rows=Array.from({length:12},(_,i)=>`Verso ${i+1}`);
  let state=chooseExcerpt(rows,null,0);
  for(const end of [1,3,1,9]){state=chooseExcerpt(rows,state.selection,end);assert.deepEqual(excerptRange(state.selection),{start:0,end});assert.equal(state.problem,null);}
  const accepted=state.selection;state=chooseExcerpt(rows,state.selection,10);assert.equal(state.problem,'lines');assert.deepEqual(state.selection,accepted);
  state=chooseExcerpt(rows,state.selection,2);assert.deepEqual(state.selection,{anchor:0,focus:2});assert.equal(state.problem,null);
  state=chooseExcerpt(rows,null,5);state=chooseExcerpt(rows,state.selection,2);assert.deepEqual(excerptRange(state.selection),{start:2,end:5});
  assert.equal(chooseExcerpt(rows,state.selection,NaN).problem,'empty');assert.deepEqual(chooseExcerpt(rows,state.selection,-1).selection,state.selection);
  const first=chooseExcerpt(['uno','due','tre'],null,0);const whole=chooseExcerpt(['uno','due','tre'],first.selection,2);assert.equal(whole.problem,'whole');assert.deepEqual(whole.selection,first.selection);
  assert.equal(chooseExcerpt(['unico'],null,0).selection,null);
});
test('desktop export accepts real exact-size PNG and rejects corruption, oversized data and path titles',()=>{
  const valid=png();assert.deepEqual(validateStoryPng(new Uint8Array(valid)),valid);
  assert.throws(()=>validateStoryPng(png(2,2)));assert.throws(()=>validateStoryPng(Buffer.alloc(8_000_001)));assert.throws(()=>validateStoryPng(valid.subarray(0,-1)));const damaged=Buffer.from(valid);damaged[40]^=1;assert.throws(()=>validateStoryPng(damaged));
  assert.equal(storyFilename('../../CON:test\\bad'),'RITVIO - .. .. CON test bad.png');assert.ok(!storyFilename('a/b').includes('/'));assert.throws(()=>storyFilename({}));
});
test('artwork proxy requires auth, uses known track URL, caches and coalesces, refuses HTML/large bodies',async()=>{
  const config=testConfig(),resolver=new FixtureResolver(config,'http://localhost');let calls=0,mode='png';
  const {app,store}=await createApi({config,resolver,artworkFetch:async(url,options)=>{calls++;assert.equal(options?.redirect,'error');assert.equal(new URL(String(url)).hostname,'i.ytimg.com');if(mode==='html')return new Response('<script>no</script>');if(mode==='large')return new Response(Buffer.alloc(3_000_001));if(mode==='redirect')return new Response(null,{status:302,headers:{Location:'https://127.0.0.1/private'}});return new Response(png());}});
  const headers={authorization:`Bearer ${config.token}`},url=`/v1/media/${tracks[0].id}/artwork`;store.saveTrack(tracks[0]);
  try{
    assert.equal((await app.inject({url})).statusCode,401);
    const responses=await Promise.all([app.inject({url,headers}),app.inject({url,headers})]);responses.forEach(response=>assert.equal(response.statusCode,200));assert.equal(calls,1);assert.equal(responses[0].headers['content-type'],'image/png');
    assert.equal((await app.inject({url,headers})).statusCode,200);assert.equal(calls,1);
    store.saveTrack({...tracks[0],thumbnail:'https://127.0.0.1/private'});assert.equal((await app.inject({url,headers})).statusCode,404);assert.equal(calls,1);
    store.saveTrack({...tracks[0],thumbnail:'https://i.ytimg.com/new.jpg'});mode='html';
    assert.equal((await app.inject({url,headers})).statusCode,502);
    mode='large';assert.equal((await app.inject({url,headers})).statusCode,502);
    mode='redirect';assert.equal((await app.inject({url,headers})).statusCode,502);
    assert.equal((await app.inject({url:url.replace(tracks[0].id,'missing'),headers})).statusCode,404);
  }finally{await app.close();}
});
