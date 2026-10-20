import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {originalTone,toneRangeResponse,maxToneChunkBytes} from './native-tone.mjs';

/** Loopback-only original PCM. Media bytes never cross CDP in the HTTP arms. */
export async function createNativeMediaFixture(seconds){
  const fixture=await createNativeByteFixture(originalTone(seconds),{contentType:'audio/wav',extension:'wav'});
  return {...fixture,report:()=>({...fixture.report(),wavBytes:fixture.report().mediaBytes})};
}

export async function createNativeByteFixture(data,{contentType,extension}){
  assert(Buffer.isBuffer(data)&&data.length>0&&data.length<=128*1024*1024);
  assert(['audio/wav','audio/webm;codecs=opus'].includes(contentType));
  assert(['wav','webm'].includes(extension));
  const pathname=`/controlled-${randomUUID()}.${extension}`,items=new Set();
  const stats={mediaBytes:data.length,httpResponses:0,interceptedResponses:0,bodyBytes:0,maxBodyBytes:0,invalidRequests:0};
  function response(range,intercepted=false){
    const result=toneRangeResponse(data,range);
    stats[intercepted?'interceptedResponses':'httpResponses']++;
    stats.bodyBytes+=result.body.length;stats.maxBodyBytes=Math.max(stats.maxBodyBytes,result.body.length);
    if(result.status>=400)stats.invalidRequests++;
    return {...result,headers:{...result.headers,'content-type':contentType,'cache-control':'no-store'}};
  }
  const server=createServer((req,res)=>{
    const url=new URL(req.url,'http://127.0.0.1');
    if(url.pathname!==pathname||!['GET','HEAD'].includes(req.method)||[...url.searchParams.keys()].some(k=>k!=='item')||!(/^[a-zA-Z0-9-]{1,80}$/).test(url.searchParams.get('item')??'default')){res.writeHead(404);res.end();return;}
    if(req.method==='GET')items.add(url.searchParams.get('item')??'default');
    const result=response(req.headers.range);
    res.writeHead(result.status,result.headers);res.end(req.method==='HEAD'?undefined:result.body);
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const address=server.address();assert(address&&typeof address==='object');
  const origin=`http://127.0.0.1:${address.port}`;
  return {origin,url:origin+pathname,response,urlFor(key){assert(/^[a-zA-Z0-9-]{1,80}$/.test(key));return origin+pathname+'?item='+key;},report:()=>({...stats,distinctItems:items.size,maxAllowedBodyBytes:maxToneChunkBytes}),
    async close(){server.closeAllConnections();await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}};
}
