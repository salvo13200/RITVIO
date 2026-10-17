import {Resolver} from '../apps/api/resolver';
import {loadConfig} from '../apps/api/config';
const resolver=new Resolver(loadConfig());
for(const videoId of ['jNQXAC9IVRw']){
  const resolved=await resolver.resolve(videoId);
  const response=await fetch(resolved.playback.url,{headers:{Range:'bytes=0-63',Origin:'http://127.0.0.1:5199'},signal:AbortSignal.timeout(20000)});
  console.log(JSON.stringify({videoId,status:response.status,cors:response.headers.get('access-control-allow-origin'),range:response.headers.get('content-range'),type:response.headers.get('content-type')}));
  await response.body?.cancel();
}
