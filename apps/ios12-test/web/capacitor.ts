/** Narrow WKScriptMessage adapter; does not bundle the iOS-15 Capacitor runtime. */
type Reply={id?:string;ok?:boolean;value?:unknown;error?:string;event?:string};
type HostWindow=Window&{webkit?:{messageHandlers?:{ritvio?:{postMessage:(message:unknown)=>void}}};__ritvioReceive?:(message:Reply)=>void};
const host=window as HostWindow;
let sequence=0;
const pending=new Map<string,{resolve:(value:any)=>void;reject:(error:Error)=>void;timer:number}>();
const listeners=new Map<string,Set<(value:any)=>void>>();
host.__ritvioReceive=message=>{
 if(message.event){listeners.get(message.event)?.forEach(listener=>listener(message.value));return;}
 const entry=pending.get(message.id??'');if(!entry)return;pending.delete(message.id!);clearTimeout(entry.timer);
 if(message.ok)entry.resolve(message.value);else entry.reject(Object.assign(new Error(message.error??'Native request failed'),{code:message.error}));
};
export function nativeCall<T=any>(method:string,data:Record<string,unknown>={}):Promise<T>{
 const target=host.webkit?.messageHandlers?.ritvio;
 if(!target)return Promise.reject(Object.assign(new Error('Native bridge unavailable'),{code:'NATIVE_UNAVAILABLE'}));
 if(pending.size>=64)return Promise.reject(Object.assign(new Error('Native bridge busy'),{code:'BUSY'}));
 const id=String(++sequence);return new Promise((resolve,reject)=>{
  const timer=window.setTimeout(()=>{pending.delete(id);reject(Object.assign(new Error('Native request timed out'),{code:'PC_UNREACHABLE'}));},75000);
  pending.set(id,{resolve,reject,timer});try{target.postMessage({id,method,data});}catch(error){pending.delete(id);clearTimeout(timer);reject(error);}
 });
}
export type PluginListenerHandle={remove:()=>Promise<void>};
export function registerPlugin<T>(_name:string):T{return new Proxy({}, {get(_target,method){
 if(method==='then')return undefined;
 if(method==='addListener')return async(event:string,listener:(value:any)=>void)=>{const set=listeners.get(event)??new Set();listeners.set(event,set);set.add(listener);return {remove:async()=>{set.delete(listener);}};};
 return (data?:Record<string,unknown>)=>nativeCall(String(method),data);
}}) as T;}
export const Capacitor={getPlatform:()=> 'ios',isNativePlatform:()=>true,convertFileSrc:(value:string)=>value.startsWith('file://')?`ritvio12://library/${value.split('/').pop()}`:value};
