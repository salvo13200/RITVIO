import {useCallback,useEffect,useRef,useState} from 'react';
import {foundationBridge as bridge} from './native';
import {acceptDiscovery,parseDiscovery,type DiscoveryCommand,type DiscoveryState} from './discovery-model';
export function useDiscovery(enabled:boolean){
 const [value,setValue]=useState<DiscoveryState|null>(null),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false);
 const alive=useRef(false),generation=useRef(0),latest=useRef<DiscoveryState|null>(null),lock=useRef(false);
 const receive=useCallback((raw:unknown)=>{latest.current=acceptDiscovery(latest.current,parseDiscovery(raw));setValue(latest.current);setError(null);},[]);
 const refresh=useCallback(async()=>{const run=generation.current;try{const raw=await bridge.discoveryState();if(alive.current&&run===generation.current)receive(raw);}catch{if(alive.current&&run===generation.current)setError('unavailable');}},[receive]);
 useEffect(()=>{
  if(!enabled)return;alive.current=true;const run=++generation.current;let listener:{remove:()=>Promise<void>}|undefined;
  void bridge.addListener('discovery',raw=>{if(alive.current&&run===generation.current)try{receive(raw);}catch{setError('unavailable');}}).then(handle=>{if(alive.current&&run===generation.current)listener=handle;else void handle.remove();}).catch(()=>{if(alive.current&&run===generation.current)setError('unavailable');});
  void refresh();const foreground=()=>{if(!document.hidden)void refresh();};document.addEventListener('visibilitychange',foreground);
  return()=>{alive.current=false;generation.current++;void listener?.remove();document.removeEventListener('visibilitychange',foreground);latest.current=null;};
 },[enabled,refresh,receive]);
 async function send(command:DiscoveryCommand){
  if(!enabled||lock.current)return false;lock.current=true;setBusy(true);setError(null);const run=generation.current;
  try{const raw=await bridge.discoveryCommand(command);if(!alive.current||run!==generation.current)return false;receive(raw);return true;}
  catch(failure){if(alive.current&&run===generation.current){await refresh();setError(String((failure as {code?:string})?.code??'unavailable'));}return false;}
  finally{lock.current=false;if(alive.current&&run===generation.current)setBusy(false);}
 }
 function cancelRadio(requestId:string){const run=generation.current;void bridge.discoveryCommand({type:'cancel',requestId}).then(raw=>{if(alive.current&&run===generation.current)receive(raw);}).catch(()=>{});}
 return {value,error,busy,refresh,send,cancelRadio};
}
