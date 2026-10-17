import {isPreference,parseHostState,type LanguageHostState,type LanguagePreference} from './languages';
import type {LocalizationRuntime} from './runtime';
export type LanguageHost={read:()=>Promise<unknown>;write:(preference:LanguagePreference)=>Promise<unknown>;subscribe:(listener:(state:unknown)=>void)=>()=>void};
export type LanguageController={ready:Promise<void>;setPreference:(preference:LanguagePreference)=>Promise<void>;refresh:()=>Promise<void>;dispose:()=>void};
export function connectLanguageHost(runtime:LocalizationRuntime,host:LanguageHost,onError:(error:unknown)=>void=()=>{}):LanguageController{
 let disposed=false,latest=-1,pending=Promise.resolve();
 function apply(value:unknown):Promise<void>{const state=parseHostState(value);if(!state)return Promise.reject(Error('Invalid language host state'));const work=pending.catch(()=>{}).then(async()=>{if(disposed||state.revision<latest)return;latest=state.revision;await runtime.apply(state.preference,state.systemLanguages);});pending=work;return work;}
 const unsubscribe=host.subscribe(value=>{void apply(value).catch(onError);});
 const refresh=async()=>{if(disposed)return;await apply(await host.read());};
 const ready=refresh();
 return {ready,refresh,async setPreference(preference){if(disposed)throw Error('Language controller disposed');if(!isPreference(preference))throw Error('Invalid language preference');if(preference!=='system'&&!runtime.available.includes(preference))throw Error('LANGUAGE_NOT_READY');await apply(await host.write(preference));},dispose(){if(disposed)return;disposed=true;unsubscribe();}};
}
export type {LanguageHostState};
