import {expect} from '@playwright/test';
import {writeFile,mkdir} from 'node:fs/promises';
export async function runNativeRequestStress({page,version,profile,mediaId,expectLocalLimit}){
  const result=await page.evaluate(async({mediaId})=>{
    const config=await window.ritvio.configuration(),headers={Authorization:'Bearer '+config.token};let completed=0,requests=0;
    for(let cycle=0;cycle<120;cycle++){
      const calls=[['media',()=>fetch(config.baseUrl+'/v1/media/'+mediaId,{headers}),200],['playback',()=>fetch(config.baseUrl+'/v1/media/'+mediaId+'/playback',{method:'POST',headers}),200]];let ticket;
      for(const [stage,run,expected] of calls){const response=await run();requests++;const data=await response.json();if(response.status!==expected)return {completed,requests,blocked:{stage,status:response.status,code:data.error?.code??data.code}};if(stage==='playback')ticket=data.url;}
      // Invalid Range must fail locally, with no audio or additional CDN request.
      const response=await fetch(new URL(ticket,config.baseUrl),{headers:{Range:'bytes=5-2'}});requests++;const data=await response.json();if(response.status!==416)return {completed,requests,blocked:{stage:'range',status:response.status,code:data.error?.code??data.code}};completed++;
    }
    return {completed,requests,blocked:null};
  },{mediaId});
  if(expectLocalLimit){expect(result.blocked?.code).toBe('RATE_LIMIT');expect(result.completed).toBeLessThan(120);}
  else {expect(result.blocked).toBeNull();expect(result.completed).toBe(120);expect(result.requests).toBe(360);}
  const record={version,profile,conditions:'Isolated Windows portable, default production budgets; 120 sequential metadata/playback/invalid-Range cycles, one real video resolved then reused from resolver cache. Range validation occurs before upstream audio fetch. No repeated audio download or saved media.',expectLocalLimit,...result};
  await mkdir('data/analysis',{recursive:true});await writeFile(`data/analysis/skip-native-${version}.json`,JSON.stringify(record,null,2));console.log(JSON.stringify(record));
}
