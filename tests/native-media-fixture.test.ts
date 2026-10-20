import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeMediaFixture,createNativeByteFixture} from './native-media-fixture.mjs';

test('loopback PCM and intercepted PCM return identical bounded byte ranges',async()=>{
  const fixture=await createNativeMediaFixture(30);
  try{
    const intercepted=fixture.response('bytes=0-',true);
    const actual=await fetch(fixture.url,{headers:{Range:'bytes=0-'}});
    assert.equal(actual.status,206);
    assert.equal(actual.headers.get('content-range'),intercepted.headers['content-range']);
    assert.deepEqual(Buffer.from(await actual.arrayBuffer()),intercepted.body);
    assert.equal((await fetch(fixture.origin+'/other')).status,404);
    const invalid=await fetch(fixture.url,{headers:{Range:'bytes=99999999-'}});
    assert.equal(invalid.status,416);await invalid.arrayBuffer();
    const stats=fixture.report();assert.equal(stats.interceptedResponses,1);assert.equal(stats.httpResponses,2);
    assert.equal(stats.maxBodyBytes,256*1024);assert.equal(stats.invalidRequests,1);
  }finally{await fixture.close();}
});

test('distinct track URLs preserve compressed bytes and reject unrelated paths and unsafe keys',async()=>{
  const bytes=Buffer.from('original synthetic compressed fixture bytes'),fixture=await createNativeByteFixture(bytes,{contentType:'audio/webm;codecs=opus',extension:'webm'});
  try{
    for(const key of ['track-1','track-2']){
      const response=await fetch(fixture.urlFor(key),{headers:{Range:'bytes=0-'}});
      assert.equal(response.headers.get('content-type'),'audio/webm;codecs=opus');assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
    }
    assert.equal(fixture.report().distinctItems,2);
    assert.throws(()=>fixture.urlFor('../bad'));
    assert.equal((await fetch(fixture.url+'?bad=key')).status,404);
  }finally{await fixture.close();}
});

test('HTTP fixture retains support for hour-long PCM without fulfilling its whole body',async()=>{
  const fixture=await createNativeByteFixture(Buffer.alloc(60*1024*1024),{contentType:'audio/wav',extension:'wav'});
  try{const response=fixture.response('bytes=0-');assert.equal(response.status,206);assert.equal(response.body.length,256*1024);assert.equal(fixture.report().mediaBytes,60*1024*1024);}finally{await fixture.close();}
});
