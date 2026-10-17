import {initializeBrowserLanguage,browserLanguageHost} from './browser';
import type {LanguageHost} from './host';
import type {LocalizationRuntime} from './runtime';
/** A broken/older native bridge must never prevent the existing app from opening. */
export async function bootstrapLanguage(runtime:LocalizationRuntime,{host,hasExistingProfile=false,timeout=2500}:{host?:LanguageHost;hasExistingProfile?:boolean;timeout?:number}={}){
 const bounded:LanguageHost|undefined=host&&{...host,read:()=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Language host timeout')),timeout);Promise.resolve().then(()=>host.read()).then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});})};
 let controller;
 try{controller=await initializeBrowserLanguage(runtime,bounded??browserLanguageHost({hasExistingProfile}));}
 catch{controller=await initializeBrowserLanguage(runtime,browserLanguageHost({hasExistingProfile:true}));}
 const refresh=()=>{void controller.refresh().catch(()=>{});};window.addEventListener('languagechange',refresh);window.addEventListener('focus',refresh);
 const dispose=controller.dispose;controller.dispose=()=>{dispose();window.removeEventListener('languagechange',refresh);window.removeEventListener('focus',refresh);};
 window.addEventListener('beforeunload',()=>controller.dispose(),{once:true});return controller;
}
