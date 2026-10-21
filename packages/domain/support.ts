export type SupportKind='bug'|'visual'|'idea';
export type SupportContext={platform:'android'|'windows';version:string};
export const supportIssues='https://github.com/salvo13200/RITVIO/issues';
const templates={bug:'bug_report.yml',visual:'visual_feedback.yml',idea:'feature_request.yml'} as const;
const versionPattern=/^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[a-zA-Z0-9.-]{1,20})?$/;
export function supportContext(input:SupportContext):SupportContext{
 if(!['android','windows'].includes(input.platform)||!versionPattern.test(input.version))throw Error('Invalid support context');
 return {platform:input.platform,version:input.version};
}
export function issueContext(input:SupportContext):string{
 const context=supportContext(input);return `RITVIO ${context.version}\nPlatform: ${context.platform==='android'?'Android':'Windows'}`;
}
export function supportIssueUrl(kind:SupportKind,input:SupportContext):string{
 if(!Object.hasOwn(templates,kind))throw Error('Invalid report kind');
 const params=new URLSearchParams({template:templates[kind],context:issueContext(input)});
 if(kind==='bug')params.set('version',input.version);
 return `${supportIssues}/new?${params}`;
}
export function isSupportUrl(value:unknown):value is string{
 if(value===supportIssues)return true;
 if(typeof value!=='string'||value.length>1500)return false;
 try{
  const url=new URL(value),context=url.searchParams.get('context')??'',match=/^RITVIO ([\dA-Za-z.-]+)\nPlatform: (Android|Windows)$/.exec(context);
  const kind=(Object.keys(templates) as SupportKind[]).find(key=>templates[key]===url.searchParams.get('template'));
  return !!match&&!!kind&&value===supportIssueUrl(kind,{platform:match[2]==='Android'?'android':'windows',version:match[1]});
 }catch{return false;}
}
const numbers=new Set(['cacheHits','cached','active','pending','networkResolutions','joinedRequests','pendingRequests','lastResolutionMs','lastForegroundResolutionMs','lastBackgroundResolutionMs','cachedDescriptors','cooldownRemainingMs','bufferedAheadMs','attempts','bytes','maxBytes','perStreamBytes','streams','parts','hits','misses','upstreamRequests','warmStarted','warmCompleted','warmCancelled','warmFailed','startMs','rebufferMs','backBufferMs','maxForwardBufferMs','targetBufferBytes','nextPreloadMs','restoreMs','descriptorMs','firstDataMs','playingMs','seekedMs','readyMs','audioPositionAdvancingMs','durationMs','waitMs']);
const flags=new Set(['preloading','pending','warming','prepared','bufferedSeekHint','requiresAudio']);
const enums:Record<string,readonly string[]>={mode:['new','resume','refresh','seek'],action:['track','seek','resume','next','previous','play'],outcome:['pending','playing','seeked','failed','cancelled','ready','success'],priority:['foreground','prefetch']};
const groups=new Set(['resolver','renderer','audioBuffer','recovery','policy']);
/** Deliberately copy known scalar fields only; never serialize arbitrary native/provider objects. */
export function safePlaybackTimings(input:unknown,depth=0,budget={remaining:64}):Record<string,unknown>{
 if(!input||typeof input!=='object'||Array.isArray(input)||depth>3)return {};
 const result:Record<string,unknown>={};
 for(const [key,value] of Object.entries(input)){
  if(budget.remaining<=0)break;
  if(numbers.has(key)&&typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=10_000_000_000){result[key]=Math.round(value*10)/10;budget.remaining--;}
  else if(flags.has(key)&&typeof value==='boolean'){result[key]=value;budget.remaining--;}
  else if(Object.hasOwn(enums,key)&&typeof value==='string'&&enums[key].includes(value)){result[key]=value;budget.remaining--;}
  else if(groups.has(key)){const clean=safePlaybackTimings(value,depth+1,budget);if(Object.keys(clean).length)result[key]=clean;}
  else if(key==='samples'&&Array.isArray(value)){
   const samples=value.slice(-5).map(item=>safePlaybackTimings(item,depth+1,budget)).filter(item=>Object.keys(item).length);
   if(samples.length)result.samples=samples;
  }
 }
 return result;
}
export function supportReport(kind:SupportKind,input:SupportContext,timings?:unknown):string{
 if(!Object.hasOwn(templates,kind))throw Error('Invalid report kind');
 const report:Record<string,unknown>={schema:1,app:'RITVIO',...supportContext(input),kind};
 if(timings!==undefined){const clean=safePlaybackTimings(timings);if(Object.keys(clean).length)report.playback=clean;}
 const text=JSON.stringify(report,null,2);
 if(text.length>6000)throw Error('Support report too large');
 return text;
}
