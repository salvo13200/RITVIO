import type {LocalizationRuntime} from './runtime';
/** Only UI source phrases are passed here. Song titles, lyrics and user data stay untouched. */
export function phraseTranslator(runtime:LocalizationRuntime){
 return (source:string,params:Readonly<Record<string,unknown>>={})=>{
  const count=typeof params.count==='number'?params.count:typeof params.p0==='number'&&source.includes('{p0} brani')?params.p0:undefined;
  const template=String(runtime.engine.t(source,{ns:'ui',nsSeparator:false,keySeparator:false,defaultValue:source,skipInterpolation:true,...(count===undefined?{}:{count})}));
  return template.replace(/\{(\w+)\}/g,(_match,name:string)=>String(params[name]??'{'+name+'}'));
 };
}
