import manifest from './manifest.json';
export const languageCodes=['it','en','es','fr','de'] as const;
export type Language=typeof languageCodes[number];
export type LanguagePreference=Language|'system';
export const languageManifest=manifest;
export const availableLanguages=Object.freeze(manifest.available as Language[]);
export const fallbackLanguage=manifest.fallback as Language;
export function isLanguage(value:unknown):value is Language{return typeof value==='string'&&(languageCodes as readonly string[]).includes(value);}
export function isPreference(value:unknown):value is LanguagePreference{return value==='system'||isLanguage(value);}
export function normalizeLanguage(value:unknown):Language|null{
 if(typeof value!=='string'||value.length>100)return null;
 try{const language=new Intl.Locale(value.replaceAll('_','-')).language.toLowerCase();return isLanguage(language)?language:null;}catch{return null;}
}
export function cleanSystemLanguages(value:unknown):string[]{return Array.isArray(value)?value.filter((item):item is string=>typeof item==='string'&&item.length>0&&item.length<=100).slice(0,20):[];}
export function resolveLanguage(preference:LanguagePreference,system:readonly string[],available:readonly Language[],fallback:Language):Language{
 if(!available.length||!available.includes(fallback))throw Error('Invalid available languages');
 if(preference!=='system')return available.includes(preference)?preference:fallback;
 for(const tag of system){const language=normalizeLanguage(tag);if(language&&available.includes(language))return language;}
 return fallback;
}
export function formatLocale(language:Language,system:readonly string[]):string{
 for(const tag of system)try{const locale=new Intl.Locale(tag.replaceAll('_','-'));if(locale.language===language)return locale.toString();}catch{}
 return manifest.languages.find(item=>item.code===language)!.locale;
}
export type LanguageHostState={schema:1;preference:LanguagePreference;systemLanguages:string[];revision:number};
export function parseHostState(value:unknown):LanguageHostState|null{
 if(!value||typeof value!=='object')return null;const state=value as Record<string,unknown>;
 if(state.schema!==1||!isPreference(state.preference)||!Number.isSafeInteger(state.revision)||(state.revision as number)<0)return null;
 if(!Array.isArray(state.systemLanguages)||state.systemLanguages.some(item=>typeof item!=='string'||!item||item.length>100)||state.systemLanguages.length>20)return null;
 return {schema:1,preference:state.preference,systemLanguages:[...state.systemLanguages] as string[],revision:state.revision as number};
}
