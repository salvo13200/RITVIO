import {cleanSystemLanguages,isPreference,type LanguagePreference,type LanguageHostState} from './languages';
import {connectLanguageHost,type LanguageHost,type LanguageController} from './host';
import type {LocalizationRuntime} from './runtime';
const key='ritvio.language.v1';
export function browserLanguageHost({hasExistingProfile=false,environment=window}:{hasExistingProfile?:boolean;environment?:Window}={}):LanguageHost{
 const initial:LanguagePreference=hasExistingProfile?'it':'system';let revision=0;let preference:LanguagePreference=initial;const listeners=new Set<(state:unknown)=>void>();
 function stored(){preference=initial;try{const value=JSON.parse(environment.localStorage.getItem(key)??'null');if(value?.schema===1&&isPreference(value.preference))preference=value.preference;}catch{}}
 stored();
 const snapshot=():LanguageHostState=>({schema:1,preference,systemLanguages:cleanSystemLanguages(environment.navigator.languages??[environment.navigator.language]),revision});
 const changed=()=>{stored();revision++;const state=snapshot();for(const listener of listeners)listener(state);};
 const storage=(event:StorageEvent)=>{if(event.key===key||event.key===null)changed();};
 return {async read(){const previous=preference;stored();if(previous!==preference)revision++;return snapshot();},async write(next){if(!isPreference(next))throw Error('Invalid language preference');environment.localStorage.setItem(key,JSON.stringify({schema:1,preference:next}));preference=next;revision++;return snapshot();},subscribe(listener){if(!listeners.size){environment.addEventListener('storage',storage);environment.addEventListener('languagechange',changed);}listeners.add(listener);return()=>{listeners.delete(listener);if(!listeners.size){environment.removeEventListener('storage',storage);environment.removeEventListener('languagechange',changed);}};}};
}
export async function initializeBrowserLanguage(runtime:LocalizationRuntime,host:LanguageHost):Promise<LanguageController>{
 const sync=()=>{document.documentElement.lang=runtime.getSnapshot().language;};sync();const unsubscribe=runtime.subscribe(sync);
 const controller=connectLanguageHost(runtime,host);try{await controller.ready;}catch(error){controller.dispose();unsubscribe();throw error;}
 const dispose=controller.dispose;controller.dispose=()=>{dispose();unsubscribe();};return controller;
}
