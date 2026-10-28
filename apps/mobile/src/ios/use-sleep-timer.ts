import {useCallback,useEffect,useRef,useState} from 'react';
import {foundationBridge as bridge} from './native';
import {acceptSleepTimer,parseSleepTimer,type SleepMode,type SleepMinutes,type SleepTimerState} from './sleep-model';

export function useSleepTimer(enabled:boolean){
 const [value,setValue]=useState<SleepTimerState|null>(null),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false);
 const alive=useRef(false),generation=useRef(0),latest=useRef<SleepTimerState|null>(null),lock=useRef(false);
 const receive=useCallback((raw:unknown)=>{const next=parseSleepTimer(raw);latest.current=acceptSleepTimer(latest.current,next);setValue(latest.current);setError(null);},[]);
 const refresh=useCallback(async()=>{const run=generation.current;try{const raw=await bridge.sleepTimer();if(alive.current&&run===generation.current)receive(raw);}catch{if(alive.current&&run===generation.current)setError('unavailable');}},[receive]);
 useEffect(()=>{
  if(!enabled)return;alive.current=true;const run=++generation.current;let listener:{remove:()=>Promise<void>}|undefined;
  void bridge.addListener('sleepTimer',raw=>{if(alive.current&&run===generation.current)try{receive(raw);}catch{setError('unavailable');}}).then(handle=>{if(alive.current&&run===generation.current)listener=handle;else void handle.remove();}).catch(()=>{if(alive.current&&run===generation.current)setError('unavailable');});
  void refresh();const foreground=()=>{if(!document.hidden)void refresh();};document.addEventListener('visibilitychange',foreground);
  return()=>{alive.current=false;generation.current++;void listener?.remove();document.removeEventListener('visibilitychange',foreground);latest.current=null;};
 },[enabled,receive,refresh]);
 async function configure(mode:SleepMode,minutes?:SleepMinutes){
  if(!enabled||!latest.current||lock.current)return false;lock.current=true;setBusy(true);setError(null);const run=generation.current;
  try{const raw=await bridge.setSleepTimer({mode,...(minutes?{minutes}:{}),revision:latest.current.revision});if(!alive.current||run!==generation.current)return false;receive(raw);return true;}
  catch(failure){if(alive.current&&run===generation.current){const changed=(failure as {code?:string})?.code==='TIMER_CHANGED';if(changed)await refresh();setError(changed?'changed':'write');}return false;}
  finally{lock.current=false;if(alive.current&&run===generation.current)setBusy(false);}
 }
 return {value,error,busy,refresh,configure};
}
