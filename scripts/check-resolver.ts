import {loadConfig} from '../apps/api/config';
import {Resolver} from '../apps/api/resolver';
const config=loadConfig();
const videoId=process.argv[2]||'jNQXAC9IVRw';
try {
  const result=await new Resolver(config).resolve(videoId);
  const response=await fetch(result.playback.url,{headers:{Range:'bytes=0-1023'},signal:AbortSignal.timeout(15000)});
  // A small in-memory range verifies reachability without saving or converting audio.
  const reader=response.body?.getReader();const first=await reader?.read();await reader?.cancel();
  console.log(JSON.stringify({videoId,title:result.track.title,expiresAt:result.playback.expiresAt,status:response.status,contentType:response.headers.get('content-type'),bytesRead:first?.value?.length??0},null,2));
  if(!response.ok||!first?.value?.length)process.exitCode=1;
}catch(e){console.error(e instanceof Error?e.message:String(e));process.exitCode=1;}
