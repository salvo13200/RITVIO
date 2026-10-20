import {test} from 'node:test';
import assert from 'node:assert/strict';
import {originalTone,toneRangeResponse,maxToneChunkBytes} from './native-tone.mjs';

test('bounded PCM responses reconstruct the original WAV without gaps, including its final chunk',()=>{
  const wav=originalTone(60),parts:Buffer[]=[];
  assert.equal(wav.readUInt32LE(4)+8,wav.length);
  assert.equal(wav.readUInt32LE(40),60*16000);
  let offset=0;
  while(offset<wav.length){
    const response=toneRangeResponse(wav,`bytes=${offset}-`);
    assert.equal(response.status,206);assert(response.body.length<=maxToneChunkBytes);
    const [,start,end,total]=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers['content-range'])!;
    assert.equal(Number(start),offset);assert.equal(Number(total),wav.length);
    assert.equal(Number(end)-Number(start)+1,response.body.length);
    parts.push(response.body);offset=Number(end)+1;
  }
  assert(parts.length>1);assert.deepEqual(Buffer.concat(parts),wav);
});

test('PCM fixture supports short explicit/suffix ranges and rejects unsafe or unsupported requests',()=>{
  const wav=originalTone(60);
  assert.deepEqual(toneRangeResponse(wav,'bytes=40-60').body,wav.subarray(40,61));
  assert.deepEqual(toneRangeResponse(wav,'bytes=-128').body,wav.subarray(-128));
  for(const range of ['bytes=-0','bytes=9-8',`bytes=${wav.length}-`,'bytes=0-1,3-4','bytes=-','bytes=9007199254740992-'])assert.equal(toneRangeResponse(wav,range).status,416);
  assert.equal(toneRangeResponse(wav).status,400,'Large bodies cannot silently fall back to one huge debugger message');
  assert.equal(toneRangeResponse(originalTone(1)).status,200);
  for(const seconds of [0,-1,Infinity,1.5,7321])assert.throws(()=>originalTone(seconds),/duration/);
});
