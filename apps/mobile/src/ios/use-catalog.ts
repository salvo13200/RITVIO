import {useEffect,useRef,useState} from 'react';
import {foundationBridge as bridge} from './native';
import {parseCatalog,type CatalogRequest,type CatalogResult} from './catalog-model';

type QueryState={key:string;value:CatalogResult|null;phase:'idle'|'loading'|'waiting'|'ready'|'error';error:unknown};
const cache=new Map<string,{until:number;value:CatalogResult}>();
let counter=0;
export function useCatalog(request:CatalogRequest|null,playbackLoading:boolean,enabled=true){
 const serialized=request?JSON.stringify(request):'',[attempt,setAttempt]=useState(0),[state,setState]=useState<QueryState>({key:'',value:null,phase:'idle',error:null});
 const retryRefresh=useRef(false);
 useEffect(()=>{
  if(!serialized||!enabled){setState({key:serialized,value:null,phase:'idle',error:null});return;}
  const input=JSON.parse(serialized) as CatalogRequest,key=JSON.stringify({...input,refresh:undefined}),previous=cache.get(key);
  const refresh=retryRefresh.current||Boolean(input.refresh);retryRefresh.current=false;
  if(!refresh&&previous&&previous.until>Date.now()){setState({key:serialized,value:previous.value,phase:'ready',error:null});return;}
  if(playbackLoading){retryRefresh.current=refresh;setState({key:serialized,value:null,phase:'waiting',error:null});return;}
  let active=true,timer=0,requestId='';
  const update=(next:Omit<QueryState,'key'>)=>{if(active)setState({key:serialized,...next});};
  update({value:null,phase:'loading',error:null});
  async function run(tries=0){
   if(!active)return;requestId=`ios-catalog-${Date.now()}-${++counter}`;
   try{
    const value=parseCatalog(await bridge.catalog({...input,...(refresh?{refresh:true}:{}),requestId}),input);
    if(!active)return;
    if(!('albumsUnavailable' in value&&value.albumsUnavailable)){
     cache.delete(key);cache.set(key,{until:Date.now()+(input.operation==='search-snapshot'||input.operation==='catalog-search'?120000:600000),value});
     while(cache.size>8)cache.delete(cache.keys().next().value!);
    }
    update({value,phase:'ready',error:null});
   }catch(error){
    if(!active)return;
    if(/BUSY|CANCELLED/.test(String((error as {code?:string})?.code??error))&&tries<3){timer=window.setTimeout(()=>void run(tries+1),200*2**tries);return;}
    update({value:null,phase:'error',error});
   }
  }
  timer=window.setTimeout(()=>void run(),input.operation==='search-snapshot'?350:0);
  return()=>{active=false;window.clearTimeout(timer);if(requestId)void bridge.cancelResolver({requestId}).catch(()=>{});};
 },[serialized,attempt,playbackLoading,enabled]);
 const visible=state.key===serialized?state:{key:serialized,value:null,phase:serialized?'loading':'idle',error:null} as QueryState;
 return {...visible,retry:()=>{retryRefresh.current=true;setAttempt(value=>value+1);}};
}
