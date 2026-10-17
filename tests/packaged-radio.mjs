import {expect} from '@playwright/test';
import {writeFile,mkdir} from 'node:fs/promises';
export async function runNativeRadio({page,version,profile,capture}){
  await page.emulateMedia({reducedMotion:'reduce'});
  const streams=[];page.on('response',response=>{if(response.url().includes('/v1/stream/'))streams.push({status:response.status(),contentType:response.headers()['content-type']});});
  await page.evaluate(()=>{window.__radioNativeAudio={audio:null,rejections:[]};const original=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(...args){window.__radioNativeAudio.audio=this;const result=original.apply(this,args);void result.catch(error=>window.__radioNativeAudio.rejections.push({name:error.name}));return result;};});
  try{
  const queries=[];page.on('request',r=>{if(r.url().includes('/v1/catalog/radio/'))queries.push(r.url().split('/radio/')[1]);});
  await page.getByRole('textbox',{name:'Cerca musica'}).fill('Daft Punk One More Time');
  const row=page.locator('.track-row').first();await expect(row).toBeVisible({timeout:45000});
  const seedTitle=await row.locator('.track-name strong').innerText();
  await row.locator('button[popovertarget]').click();await page.locator('[popover]:popover-open .radio-menu-button').click();
  await expect(page.locator('.radio-summary')).toContainText(/\d+ suggerimenti/,{timeout:60000});
  await expect(page.locator('.player-track strong')).toHaveText(seedTitle);
  await expect.poll(()=>page.getByRole('slider',{name:'Posizione del brano'}).inputValue().then(Number),{timeout:45000}).toBeGreaterThan(1);
  // Verify prefetch in the shipped diagnostics, without logging signed URLs.
  const diagnostics=await page.evaluate(async()=>{const c=await window.ritvio.configuration();return(await fetch(c.baseUrl+'/v1/playback/diagnostics',{headers:{Authorization:`Bearer ${c.token}`}})).json();});
  await page.getByRole('button',{name:'Brano successivo',exact:true}).click();await expect(page.locator('.player-track strong')).not.toHaveText(seedTitle);
  await expect.poll(()=>page.getByRole('slider',{name:'Posizione del brano'}).inputValue().then(Number),{timeout:45000}).toBeGreaterThan(1);
  await page.getByRole('button',{name:'Pausa',exact:true}).click();
  const count=await page.locator('.queue-row').count();expect(count).toBeGreaterThan(1);expect(count).toBeLessThanOrEqual(26);expect(queries).toHaveLength(1);
  await capture('radio-native.png');
  await page.getByRole('button',{name:'Chiudi radio e mantieni la coda'}).click();await expect(page.locator('.radio-summary')).not.toBeVisible();expect(await page.locator('.queue-row').count()).toBe(count);
  const result={version,profile,scope:'real catalog radio and two real audio starts in isolated Windows portable; no latency guarantee',seedTitle,queueVisibleRows:count,radioRequests:queries.length,diagnostics,streams,screenshot:'radio-native.png'};
  await mkdir('data/analysis',{recursive:true});await writeFile(`data/analysis/radio-native-${version}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  }catch(error){
    const audio=await page.evaluate(()=>{const s=window.__radioNativeAudio,a=s?.audio;return {rejections:s?.rejections,audio:a?{paused:a.paused,readyState:a.readyState,networkState:a.networkState,error:a.error?.code,currentTime:a.currentTime,duration:Number.isFinite(a.duration)?a.duration:null}:null,userActivation:{active:navigator.userActivation.isActive,ever:navigator.userActivation.hasBeenActive},metrics:window.ritvioPlaybackMetrics};});
    await writeFile('data/analysis/radio-native-failure.json',JSON.stringify({version,profile,streams,...audio},null,2));throw error;
  }
}
