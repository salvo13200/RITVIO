import {loadConfig} from '../apps/api/config';
import {Resolver} from '../apps/api/resolver';
import {writeFile} from 'node:fs/promises';
import {AppError} from '../apps/api/errors';
const resolver=new Resolver(loadConfig()),samples:unknown[]=[];
try{
  for(const videoId of process.argv.slice(2)){
    const started=performance.now();try{
      const value=await resolver.resolve(videoId);const response=await fetch(value.playback.url,{headers:{Range:'bytes=0-1023'},signal:AbortSignal.timeout(15000)});
      const reader=response.body?.getReader();const chunk=await reader?.read();await reader?.cancel();
      samples.push({videoId,status:response.status,contentType:response.headers.get('content-type'),bytes:chunk?.value?.length??0,ms:Math.round(performance.now()-started)});
    }catch(error){samples.push({videoId,error:error instanceof AppError?error.code:'STREAM_ERROR',ms:Math.round(performance.now()-started)});}
  }
}finally{await resolver.close();}
await writeFile('data/analysis/radio-stream-probe.json',JSON.stringify({scope:'first1024bytesinRAMonly,nosavedmediaorURLs',samples},null,2));console.log(JSON.stringify(samples));
