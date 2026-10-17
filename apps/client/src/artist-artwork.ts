import {useEffect,useState,type RefObject} from 'react';
import type {FollowedResource} from '../../../packages/domain/index';
import {api} from './api';
import {useLibrary} from './library';

// Photos are requested only for visible artists. Two requests can run at once;
// this queue does not serialize playback or use its request budget.
let active=0;
const jobs:Array<()=>Promise<void>>=[];
const attempts=new Map<string,number>();
function pump(){while(active<2&&jobs.length){const job=jobs.shift()!;active++;void job().finally(()=>{active--;pump();});}}
export function useArtistArtwork(resource:FollowedResource,element:RefObject<HTMLElement|null>){
  const profile=useLibrary(s=>s.data?.profile.id);
  const [loading,setLoading]=useState(false);
  useEffect(()=>{
    setLoading(false);const node=element.current;if(!profile||resource.kind!=='artist'||resource.artwork||!node)return;
    const key=profile+':'+resource.id,controller=new AbortController();let mounted=true,visible=false,queued=false;
    const observer=new IntersectionObserver(entries=>{
      visible=entries.some(entry=>entry.isIntersecting);
      if(!visible||queued||(attempts.get(key)??0)>Date.now()-300000)return;
      queued=true;
      jobs.push(async()=>{
        if(!mounted||!visible||useLibrary.getState().data?.profile.id!==profile){queued=false;return;}
        const started=Date.now();attempts.set(key,started);if(attempts.size>500)attempts.delete(attempts.keys().next().value!);
        setLoading(true);
        try{
          const {resource:updated}=await api.catalog.artistArtwork(resource.id,controller.signal);
          if(!mounted||!updated||updated.kind!=='artist'||updated.id!==resource.id)return;
          useLibrary.setState(state=>state.data?.profile.id===profile?{data:{...state.data,follows:state.data.follows.map(item=>item.kind==='artist'&&item.id===updated.id?{...item,artwork:updated.artwork}:item)}}:{});
        }catch{if(controller.signal.aborted&&attempts.get(key)===started)attempts.delete(key); /* Keep saved artists; avoid retry loops. */ }
        finally{if(mounted)setLoading(false);}
      });pump();
    },{threshold:0.01});
    observer.observe(node);
    return()=>{mounted=false;observer.disconnect();controller.abort();};
  },[profile,resource.kind,resource.id,resource.artwork,element]);
  return loading;
}
