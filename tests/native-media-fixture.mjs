import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {originalTone,toneRangeResponse,maxToneChunkBytes} from './native-tone.mjs';

/** Loopback-only original PCM. Media bytes never cross CDP in the HTTP arms. */
export async function createNativeMediaFixture(seconds){
  const wav=originalTone(seconds),pathname=`/controlled-${randomUUID()}.wav`;
  const stats={wavBytes:wav.length,httpResponses:0,interceptedResponses:0,bodyBytes:0,maxBodyBytes:0,invalidRequests:0};
  function response(range,intercepted=false){
    const result=toneRangeResponse(wav,range);
    stats[intercepted?'interceptedResponses':'httpResponses']++;
    stats.bodyBytes+=result.body.length;stats.maxBodyBytes=Math.max(stats.maxBodyBytes,result.body.length);
    if(result.status>=400)stats.invalidRequests++;
    return {...result,headers:{...result.headers,'content-type':'audio/wav','cache-control':'no-store'}};
  }
  const server=createServer((req,res)=>{
    if(req.url!==pathname||!['GET','HEAD'].includes(req.method)){res.writeHead(404);res.end();return;}
    const result=response(req.headers.range);
    res.writeHead(result.status,result.headers);res.end(req.method==='HEAD'?undefined:result.body);
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const address=server.address();assert(address&&typeof address==='object');
  const origin=`http://127.0.0.1:${address.port}`;
  return {origin,url:origin+pathname,response,report:()=>({...stats,maxAllowedBodyBytes:maxToneChunkBytes}),
    async close(){server.closeAllConnections();await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}};
}
