import {createInstance,type Resource,type i18n} from 'i18next';
import {availableLanguages,fallbackLanguage,formatLocale,isPreference,resolveLanguage,type Language,type LanguagePreference} from './languages';
export type LocalizationSnapshot=Readonly<{preference:LanguagePreference;language:Language;locale:string;revision:number}>;
export type LocalizationRuntime={engine:i18n;getSnapshot:()=>LocalizationSnapshot;subscribe:(listener:()=>void)=>()=>void;apply:(preference:LanguagePreference,system:readonly string[])=>Promise<void>;available:readonly Language[]};
export function createLocalization({resources,available=availableLanguages,fallback=fallbackLanguage,preference='it',systemLanguages=[]}:{resources:Resource;available?:readonly Language[];fallback?:Language;preference?:LanguagePreference;systemLanguages?:readonly string[]}):LocalizationRuntime{
 if(!isPreference(preference))throw Error('Invalid language preference');
 const enabled=Object.freeze([...available]);
 for(const language of enabled)if(!resources[language]||!Object.keys(resources[language]).length)throw Error(`Missing local resources: ${language}`);
 const engine=createInstance(),initial=resolveLanguage(preference,systemLanguages,enabled,fallback);
 void engine.init({resources,lng:initial,supportedLngs:[...enabled],fallbackLng:fallback,load:'languageOnly',initAsync:false,defaultNS:'common',ns:Object.keys(resources[fallback]??{}),keySeparator:false,returnEmptyString:false,saveMissing:false,interpolation:{escapeValue:false}});
 let snapshot:LocalizationSnapshot=Object.freeze({preference,language:initial,locale:formatLocale(initial,systemLanguages),revision:0});
 const listeners=new Set<()=>void>();let pending=Promise.resolve();
 return {engine,available:enabled,getSnapshot:()=>snapshot,subscribe(listener){listeners.add(listener);return()=>{listeners.delete(listener);};},apply(nextPreference,system){
  if(!isPreference(nextPreference))return Promise.reject(Error('Invalid language preference'));
  const languages=[...system];const work=pending.catch(()=>{}).then(async()=>{
   const language=resolveLanguage(nextPreference,languages,enabled,fallback),locale=formatLocale(language,languages);
   if(nextPreference===snapshot.preference&&language===snapshot.language&&locale===snapshot.locale)return;
   if(engine.language!==language)await engine.changeLanguage(language);
   snapshot=Object.freeze({preference:nextPreference,language,locale,revision:snapshot.revision+1});for(const listener of [...listeners])listener();
  });pending=work;return work;
 }};
}
