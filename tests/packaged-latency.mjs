import {expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
export async function runNativeLatency({page,version,profile,nextTitle='Big Buck Bunny',initialPosition=0}){
  const diagnostics=()=>page.evaluate(async()=>{const config=await window.ritvio.configuration();return(await fetch(config.baseUrl+'/v1/playback/diagnostics',{headers:{Authorization:`Bearer ${config.token}`}})).json();});
  const initialDiagnostics=await diagnostics();
  const requests=[],responses=[];
  const isPlayback=url=>/\/v1\/media\/[^/]+\/playback(?:\?|$)/.test(url);
  page.on('request',request=>{if(isPlayback(request.url()))requests.push({prepared:request.url().includes('prepare=true'),at:performance.now()});});
  page.on('response',response=>{if(isPlayback(response.url()))responses.push({prepared:response.url().includes('prepare=true'),status:response.status()});});
  await page.evaluate(()=>{
    const w=window;w.__nativePlayback={records:[],clicked:0,audio:null};
    document.addEventListener('click',event=>{if(event.target.closest('.play-button,#queue-panel-trigger,.transport button[aria-label="Brano successivo"]'))w.__nativePlayback.clicked=performance.now();},true);
    const original=HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play=function(...args){
      w.__nativePlayback.audio=this;const clicked=w.__nativePlayback.clicked;
      const done=()=>{w.__nativePlayback.records.push({clickToPlayingMs:performance.now()-clicked});};this.addEventListener('playing',done,{once:true});
      const result=original.apply(this,args);void result.catch(()=>this.removeEventListener('playing',done));return result;
    };
  });
  const streamStatuses=[];page.on('response',response=>{if(response.url().includes('/v1/stream/'))streamStatuses.push({status:response.status(),type:response.headers()['content-type']});});
  const count=()=>page.evaluate(()=>window.__nativePlayback.records.length);
  try{await page.locator('.play-button').click();await expect.poll(count,{timeout:45000}).toBe(1);
  await page.getByRole('slider',{name:'Posizione del brano',exact:true}).fill('8');await expect.poll(()=>page.evaluate(()=>window.__nativePlayback.audio.currentTime),{timeout:10000}).toBeGreaterThanOrEqual(8);
  await page.locator('.play-button').click();await expect.poll(()=>page.evaluate(()=>window.__nativePlayback.audio.paused)).toBe(true);
  const beforeResume=requests.filter(r=>!r.prepared).length;
  await page.locator('.play-button').click();await expect.poll(count,{timeout:15000}).toBe(2);expect(requests.filter(r=>!r.prepared)).toHaveLength(beforeResume);
  if(version!=='0.6.23')await expect.poll(()=>responses.filter(r=>r.prepared&&r.status===200).length,{timeout:45000}).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Brano successivo',exact:true}).click();await expect.poll(count,{timeout:45000}).toBe(3);await expect(page.locator('.player-track strong')).toHaveText(nextTitle);
  const metrics=await page.evaluate(()=>({records:window.__nativePlayback.records,client:window.ritvioPlaybackMetrics??null}));
  if(version!=='0.6.23'){expect(requests.filter(r=>!r.prepared)).toHaveLength(1);expect(metrics.client.at(-1).prepared).toBe(true);}
  const resumeSamples=[metrics.records[1].clickToPlayingMs],nextSamples=[metrics.records[2].clickToPlayingMs];
  for(let pass=0;pass<2;pass++){
    await page.locator('.play-button').click();await expect.poll(()=>page.evaluate(()=>window.__nativePlayback.audio.paused)).toBe(true);const expected=await count()+1,prior=requests.filter(r=>!r.prepared).length;
    await page.locator('.play-button').click();await expect.poll(count,{timeout:15000}).toBe(expected);expect(requests.filter(r=>!r.prepared)).toHaveLength(prior);resumeSamples.push(await page.evaluate(()=>window.__nativePlayback.records.at(-1).clickToPlayingMs));
  }
  await page.getByRole('button',{name:'Ripetizione: disattivata',exact:true}).click();
  for(let pass=0;pass<2;pass++){
    // Give the descriptor preparation a chance to settle; this is a warm-change sample.
    const expected=await count()+1;await page.getByRole('button',{name:'Brano successivo',exact:true}).click();await expect.poll(count,{timeout:45000}).toBe(expected);nextSamples.push(await page.evaluate(()=>window.__nativePlayback.records.at(-1).clickToPlayingMs));
  }
  await page.locator('.play-button').click();
  await expect.poll(()=>page.evaluate(()=>window.__nativePlayback.audio.paused)).toBe(true);
  await page.evaluate(()=>{window.__nativeSeeks={requested:0,records:[]};window.__nativePlayback.audio.addEventListener('seeked',()=>{window.__nativeSeeks.records.push(performance.now()-window.__nativeSeeks.requested);});});
  for(const [index,target] of [8,2,11].entries()){
    await page.evaluate(()=>{window.__nativeSeeks.requested=performance.now();});
    await page.getByRole('slider',{name:'Posizione del brano',exact:true}).fill(String(target));
    await expect.poll(()=>page.evaluate(()=>window.__nativeSeeks.records.length),{timeout:15000}).toBe(index+1);
    expect(await page.evaluate(()=>window.__nativePlayback.audio.currentTime)).toBeCloseTo(target,1);
  }
  const seekSamples=await page.evaluate(()=>window.__nativeSeeks.records);
  const expectedAfterSeek=await count()+1;await page.locator('.play-button').click();await expect.poll(count,{timeout:15000}).toBe(expectedAfterSeek);
  await expect.poll(()=>page.evaluate(()=>window.__nativePlayback.audio.currentTime)).toBeGreaterThan(11.1);
  await page.locator('.play-button').click();
  const summarize=values=>{const sorted=[...values].sort((a,b)=>a-b);return {n:sorted.length,medianMs:sorted[Math.floor(sorted.length/2)],minMs:sorted[0],maxMs:sorted.at(-1),samplesMs:values};};
  const result={version,conditions:`Isolated Windows portable, real provider descriptors and audio through local proxy, two seeded non-musical test videos. DOM click to HTMLMediaElement playing event, not speaker output. One cold sample, three resumes and three track changes including playlist wrap. Three paused input-to-seeked samples and successful playback after seeking. ${initialDiagnostics.audioBuffer?'Bounded RAM audio preloading/ranges enabled.':'Baseline: descriptor-only prefetch.'} Small network-dependent sample, no universal latency or percentage claim.`,profile,coldStartPosition:initialPosition,liveSeekToEightSeconds:true,streamStatuses,coldMs:metrics.records[0].clickToPlayingMs,resumeMs:metrics.records[1].clickToPlayingMs,nextMs:metrics.records[2].clickToPlayingMs,resume:summarize(resumeSamples),warmChanges:summarize(nextSamples),seek:summarize(seekSamples),playableAfterSeek:true,resumeReusedStream:true,foregroundRequests:requests.filter(r=>!r.prepared).length,preparedRequests:requests.filter(r=>r.prepared).length,diagnostics:await diagnostics(),clientMetrics:await page.evaluate(()=>window.ritvioPlaybackMetrics??null)};
  await mkdir('data/analysis',{recursive:true});await writeFile(`data/analysis/playback-native-${version}${initialPosition?'-restore8':''}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));return result;
  }catch(error){await writeFile(`${profile}/latency-failure.json`,JSON.stringify({version,requests:requests.map(r=>({prepared:r.prepared})),responses,streamStatuses,state:await page.evaluate(()=>{const a=window.__nativePlayback.audio;return {records:window.__nativePlayback.records,paused:a?.paused,time:a?.currentTime,ready:a?.readyState,error:a?.error?.code,message:a?.error?.message};})},null,2));throw error;}
}
