import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeMediaFixture} from './native-media-fixture.mjs';

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
