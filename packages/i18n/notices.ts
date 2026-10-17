import type {LocalizationRuntime} from './runtime';
import {phraseTranslator} from './phrases';
/** Localise controlled messages, including Italian errors returned by an older local service. */
export function noticeTranslator(runtime:LocalizationRuntime){
 const phrase=phraseTranslator(runtime);let patterns:{expression:RegExp;source:string;names:string[]}[]|undefined;
 return (message:string|null|undefined):string=>{
  if(!message)return '';
  const source=message.replace(/^Error invoking remote method '[^']+': Error: /,'');
  if(runtime.engine.exists(source,{ns:'ui',nsSeparator:false,keySeparator:false}))return phrase(source);
  for(const language of runtime.available){
   const catalog=runtime.engine.getResourceBundle(language,'ui') as Record<string,string>|undefined;
   if(catalog){const key=Object.keys(catalog).find(key=>catalog[key]===source);if(key)return phrase(key);}
   const legacy=runtime.engine.getResourceBundle(language,'legacy') as Record<string,string>|undefined;
   if(legacy){const key=Object.keys(legacy).find(key=>legacy[key]===source);if(key)return String(runtime.engine.t(key,{ns:'legacy',skipInterpolation:true}));}
  }
  patterns??=runtime.available.flatMap(language=>Object.entries(runtime.engine.getResourceBundle(language,'ui')??{}).filter(([,value])=>/\{p\d+\}/.test(String(value))).map(([key,value])=>{const names:string[]=[];const parts=String(value).split(/(\{p\d+\})/g);const expression=parts.map(part=>/^\{p\d+\}$/.test(part)?(names.push(part.slice(1,-1)),'([\\s\\S]*?)'):part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('');return {source:key,names,expression:new RegExp('^'+expression+'$')};}));
  for(const item of patterns){const match=item.expression.exec(source);if(match)return phrase(item.source,Object.fromEntries(item.names.map((name,index)=>[name,match[index+1]])));}
  return source;
 };
}
