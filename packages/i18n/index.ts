import it from './it.json';
import {resources} from './resources-desktop';
import {createLocalization} from './runtime';
export * from './languages';
export {createLocalization} from './runtime';
export const localization=createLocalization({resources});
export let locale=localization.getSnapshot().locale;
localization.subscribe(()=>{locale=localization.getSnapshot().locale;});
export const messages=it;
export type MessageKey=keyof typeof it;
export function t(key:MessageKey,params:Readonly<Record<string,unknown>>={}):string{
 // Legacy interpolation is deliberately one pass: artist/title values can contain braces.
 const template=String(localization.engine.t(key,{ns:'legacy',skipInterpolation:true,...(typeof params.count==='number'?{count:params.count}:{})}));
 return template.replace(/\{(\w+)\}/g,(_match,name:string)=>String(params[name]??'{'+name+'}'));
}
