import test from 'node:test';
import assert from 'node:assert/strict';
import {createPCTestService,privateAddress,descriptor,publicTrack} from '../apps/ios12-test/server/service';
import {parseFoundationStatus} from '../apps/mobile/src/ios/contract';
const track={videoId:'abcdefghijk',title:'Test song',artist:'Test artist',duration:30};
const info={id:track.videoId,url:'https://rr1.googlevideo.com/videoplayback?expire=9999999999',vcodec:'none',is_live:false,ext:'m4a',acodec:'mp4a.40.2',http_headers:{'User-Agent':'Test','Cookie':'must-not-pass'}};
async function fixture(){
 const calls:string[]=[];let closed=false,now=1000000;
 const {app}=await createPCTestService({search:async q=>{calls.push(q);return {items:[track]};},resolve:async id=>{calls.push(id);return info;},close:async()=>{closed=true;}},{pin:'123456',hosts:['127.0.0.1','192.168.1.10'],now:()=>now});
 const request=(url:string,payload?:Record<string,unknown>,token?:string,extra:Record<string,string>={})=>app.inject({method:payload===undefined?'GET':'POST',url,headers:{host:'127.0.0.1:59212',...(token?{authorization:`Bearer ${token}`}:{}) ,...extra},...(payload===undefined?{}:{payload})});
 const pair=async()=>{const response=await request('/v1/pair',{pin:'123456'});assert.equal(response.statusCode,200);return response.json().token as string;};
 return {app,request,pair,calls,advance:()=>now+=60001,closed:()=>closed};
}
test('one-time pairing protects metadata and descriptor routes; no desktop API is exposed',async()=>{
 const f=await fixture();try{
  assert.equal((await f.request('/v1/search',{query:'artist'})).statusCode,401);
  const token=await f.pair();assert.match(token,/^[a-f0-9]{64}$/);
  assert.equal((await f.request('/v1/pair',{pin:'123456'})).statusCode,401);
  assert.equal((await f.request('/v1/status',undefined,token)).json().ready,true);
  const response=await f.request('/v1/search',{query:'artist'},token);assert.equal(response.statusCode,200);assert.equal(response.json().items[0].videoId,track.videoId);
  assert.equal((await f.request('/v1/resolve',{videoId:track.videoId},token)).json().container,'m4a');
  assert.equal((await f.request('/v1/me/library',undefined,token)).statusCode,404);
 }finally{await f.app.close();assert.equal(f.closed(),true);}
});
test('rejects browser origins, hostile host headers, malformed payloads and wrong credentials',async()=>{
 const f=await fixture();try{const token=await f.pair();
  assert.equal((await f.request('/v1/search',{query:'artist'},token,{origin:'https://example.com'})).statusCode,403);
  assert.equal((await f.request('/v1/search',{query:'artist'},token,{host:'attacker.invalid:59212'})).statusCode,403);
  assert.equal((await f.request('/v1/search',{query:'artist'},'wrong')).statusCode,401);
  assert.equal((await f.request('/v1/resolve',{videoId:'../etc/passwd'},token)).statusCode,400);
  assert.equal((await f.request('/v1/search',{query:'ok',unknown:true},token)).statusCode,400);
  assert.deepEqual(f.calls,[]);
 }finally{await f.app.close();}
});
test('setup and pairing code remain PC-loopback-only; code attempts are bounded',async()=>{
 const f=await fixture();try{
  const setup=await f.request('/setup');assert.equal(setup.statusCode,200);assert.ok(setup.body.includes('123456'));assert.equal(setup.headers['cache-control'],'no-store');
  assert.equal((await f.app.inject({url:'/setup',remoteAddress:'192.168.1.20',headers:{host:'192.168.1.10:59212'}})).statusCode,403);
  for(let i=0;i<8;i++)assert.equal((await f.request('/v1/pair',{pin:'000000'})).statusCode,401);
  assert.equal((await f.request('/v1/pair',{pin:'123456'})).statusCode,429);
  f.advance();await f.pair();
 }finally{await f.app.close();}
});
test('only AAC, bounded public metadata and known HTTPS media hosts leave the PC',()=>{
 assert.equal(descriptor(info,track.videoId).headers.Cookie,undefined);
 for(const changed of [{url:'http://rr1.googlevideo.com/a'},{url:'https://googlevideo.com.attacker.invalid/a'},{url:'http://127.0.0.1/a'},{ext:'webm'},{acodec:'opus'},{vcodec:'avc1'},{id:'xxxxxxxxxxx'}])assert.throws(()=>descriptor({...info,...changed},track.videoId));
 const publicValue=publicTrack({...track,url:'private',cookie:'secret'});assert.equal('url' in publicValue,false);assert.equal('cookie' in publicValue,false);
 for(const address of ['10.0.0.5','172.16.1.4','192.168.1.5','127.0.0.1','::ffff:192.168.1.3'])assert.equal(privateAddress(address),true);
 for(const address of ['8.8.8.8','example.com','192.168.1.2.attacker','172.15.1.1','0.0.0.0'])assert.equal(privateAddress(address),false);
});
test('search cache is normalized and expires; PC-assisted capability is distinct from embedded resolution',async()=>{
 const f=await fixture();try{const token=await f.pair();
  await f.request('/v1/search',{query:'Artist  Name'},token);
  assert.equal((await f.request('/v1/search',{query:' artist name '},token)).json().cached,true);assert.equal(f.calls.length,1);
  f.advance();f.advance();await f.request('/v1/search',{query:'Artist Name'},token);assert.equal(f.calls.length,2);
 }finally{await f.app.close();}
 const value={platform:'ios',phase:'IOS-12-PC',version:'0.1.0',build:'1',bundleId:'it.ritvio.pctest',systemVersion:'12.5.8',environment:'device',minimumOS:'12.0',bundledAssets:true,capabilities:{resolver:false,playback:true,library:true,lyrics:false,sharing:false}};
 assert.equal(parseFoundationStatus(value).phase,'IOS-12-PC');assert.throws(()=>parseFoundationStatus({...value,capabilities:{...value.capabilities,resolver:true}}));
});
