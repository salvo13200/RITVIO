import {useCallback,useEffect,useRef,useState} from 'react';
import {foundationBridge as bridge} from './native';
import {acceptLibrary,parseLibrary,type IOSLibrary,type LibraryAction} from './library-model';
import {libraryError,type LibraryCopy} from './library-copy';

export function useLibrary(enabled:boolean,text:LibraryCopy,announce:(message:string)=>void){
 const [value,setValue]=useState<IOSLibrary|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const active=useRef(true),locked=useRef(false),copy=useRef(text),notice=useRef(announce);copy.current=text;notice.current=announce;
 const apply=useCallback((raw:unknown)=>{const state=parseLibrary(raw);if(active.current){setValue(previous=>acceptLibrary(previous,state));setError('');}return state;},[]);
 const reload=useCallback(async()=>{try{return apply(await bridge.library());}catch(error){if(active.current)setError(libraryError(error,copy.current));return null;}},[apply]);
 useEffect(()=>{active.current=true;if(!enabled)return;let listener:{remove:()=>Promise<void>}|undefined,disposed=false;
  void reload();void bridge.addListener('library',raw=>{if(!disposed){try{apply(raw);}catch{setError(copy.current.loadError);}}}).then(value=>{if(disposed)void value.remove();else listener=value;}).catch(()=>{});
  const refresh=()=>{if(document.visibilityState!=='hidden')void reload();};document.addEventListener('visibilitychange',refresh);window.addEventListener('focus',refresh);
  return()=>{disposed=true;active.current=false;void listener?.remove();document.removeEventListener('visibilitychange',refresh);window.removeEventListener('focus',refresh);};
 },[enabled,reload,apply]);
 async function run(action:()=>Promise<unknown>,message?:string){
  if(locked.current)return null;locked.current=true;setBusy(true);
  try{const result=apply(await action());if(message&&active.current)notice.current(message);return result;}
  catch(error){if(active.current)notice.current(libraryError(error,copy.current));await reload();return null;}
  finally{locked.current=false;if(active.current)setBusy(false);}
 }
 return {value,error,busy,reload,receive:apply,command:(action:LibraryAction,message?:string)=>run(()=>bridge.libraryCommand(action),message),
  saveQueue:(name:string,revision:number)=>run(()=>bridge.saveQueue({name,revision}),text.queueSaved),
  removeCover:(id:string,revision:number)=>run(()=>bridge.removeArtwork({kind:'playlist',id,revision}),text.coverRemoved),
  async chooseCover(id:string,revision:number){if(locked.current)return;locked.current=true;setBusy(true);try{const result=await bridge.chooseArtwork({kind:'playlist',id,revision});if(!result.cancelled&&result.library){apply(result.library);notice.current(copy.current.coverSaved);}}catch(error){notice.current(libraryError(error,copy.current));await reload();}finally{locked.current=false;if(active.current)setBusy(false);}}
 };
}
export type LibraryController=ReturnType<typeof useLibrary>;
