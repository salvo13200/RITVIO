import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {expect} from '@playwright/test';
import {connectNativeCDP} from './native-cdp.mjs';
import {createNativeByteFixture} from './native-media-fixture.mjs';
import {originalStereoTone,recordNativeOpus} from './native-opus.mjs';
import {createNativeResourceProbe} from './native-resource-probe.mjs';

/** Real player controls and HTTP audio; raw CDP never enables Network. */
export async function runNativeSwitchControl({page,close,launch,disconnect,reconnect,getNative,profile,codec,cycles}){
  assert(['pcm','opus'].includes(codec));assert(Number.isInteger(cycles)&&cycles>=2&&cycles<=60);
  const original=codec==='opus'?await recordNativeOpus(page):{bytes:originalStereoTone(),metadata:{mimeType:'audio/wav',sampleRate:48000,channels:2,duration:24}};
  await writeFile(path.join(profile,codec==='opus'?'original-tone.webm':'original-tone.wav'),original.bytes);
  // A fresh process keeps encoder/recording allocations out of the comparison.
  await close();page=await launch();await expect(page.getByRole('heading',{name:'La tua musica'})).toBeVisible();const native=getNative();
  const fixture=await createNativeByteFixture(original.bytes,{contentType:original.metadata.mimeType,extension:codec==='opus'?'webm':'wav'});
  const tracks=JSON.parse(await readFile(path.join(profile,'player-state.json'),'utf8')).state.queue;
  let raw,detached=false,descriptorRequests=0,descriptorFailure,originalError;
  const descriptor=id=>({mode:'youtube-audio-resolver',accessMethod:'unofficial-extraction',provider:'youtube',videoId:tracks.find(t=>t.id===id)?.videoId,url:fixture.urlFor(id),expiresAt:new Date(Date.now()+3600000).toISOString(),capabilities:{background:true,seek:true,volume:true,equalizer:true,offline:false}});
  const samples=[],switches=[],reportFile=path.join(profile,'switch-control.json');
  const conditions={codec,cycles,queueItems:tracks.length,networkDomainEnabled:false,mediaTransport:'ordinary loopback HTTP, no media fulfillment',hiddenWindow:true,syntheticOriginalStereo:true,recordingProcessExcluded:true,metadata:original.metadata,
    limits:'One synthetic 24-second stereo resource with distinct URLs per track; finite local HTTP ranges, not WAN/provider latency or broad codec coverage. Raw CDP remains attached for control and endpoint metrics, without Network collection. No audible-output or visible-FPS claim.'};
  async function checkpoint(complete=false,extra={}){await writeFile(reportFile,JSON.stringify({complete,conditions,descriptorRequests,transport:fixture.report(),samples,switches,...extra},null,2));}
  try{
    const url=page.url();let cspOverrides=0,policyFailure;
    await page.route(url,async route=>{try{
      const requestHeaders=Object.fromEntries(Object.entries(route.request().headers()).filter(([key])=>!['if-none-match','if-modified-since'].includes(key)));
      const response=await route.fetch({headers:requestHeaders}),headers=response.headers();assert.equal(response.status(),200);assert.equal(cspOverrides++,0);assert(/media-src [^;]+/.test(headers['content-security-policy']));headers['content-security-policy']=headers['content-security-policy'].replace(/media-src ([^;]+)/,`media-src $1 ${fixture.origin}`);await route.fulfill({response,headers});
    }catch(error){policyFailure=error;await route.abort();}});
    await page.reload().catch(error=>{throw policyFailure??error;});await expect(page.locator('.player-track strong')).toHaveText(tracks[0].title);await page.unroute(url);assert.equal(cspOverrides,1);
    await page.evaluate(()=>{const original=HTMLMediaElement.prototype.play;window.__nativeSwitchAudio={audio:null,errors:0,lastSeek:null};const observed=new WeakSet();HTMLMediaElement.prototype.play=function(...args){const state=window.__nativeSwitchAudio;state.audio=this;if(!observed.has(this)){observed.add(this);this.addEventListener('error',()=>state.errors++);this.addEventListener('seeked',()=>{state.lastSeek={at:performance.now(),position:this.currentTime};});}return original.apply(this,args);};});
    await page.route('**/v1/media/*/playback*',route=>{descriptorRequests++;const id=new URL(route.request().url()).pathname.split('/')[3];assert(tracks.some(t=>t.id===id));return route.fulfill({json:descriptor(id)});});
    await page.locator('#queue-panel-trigger').click();await expect(page.locator('.queue-row')).toHaveCount(61);await page.locator('#now-panel-trigger').click();
    await page.locator('.transport').getByRole('button',{name:'Riproduci',exact:true}).click();
    await expect.poll(async()=>Number(await page.getByRole('slider',{name:'Posizione del brano',exact:true}).inputValue()),{timeout:10000}).toBeGreaterThan(8);
    raw=await connectNativeCDP(native.endpoint,page.url());
    raw.on('Fetch.requestPaused',event=>{
      const id=new URL(event.request.url).pathname.split('/')[3];
      if(!tracks.some(t=>t.id===id)){descriptorFailure=Error('Unknown synthetic playback ID');void raw.page.send('Fetch.failRequest',{requestId:event.requestId,errorReason:'BlockedByClient'}).catch(()=>{});return;}
      descriptorRequests++;
      void raw.page.send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:200,responseHeaders:[{name:'content-type',value:'application/json'}],body:Buffer.from(JSON.stringify(descriptor(id))).toString('base64')}).catch(error=>{descriptorFailure=error;});
    });
    await raw.page.send('Fetch.enable',{patterns:[{urlPattern:'*/v1/media/*/playback*',requestStage:'Request'}]});
    await page.unrouteAll({behavior:'wait'});await disconnect();detached=true;
    await raw.page.send('Performance.enable');
    const probe=createNativeResourceProbe({cdp:raw.page,browserCdp:raw.browser,rootPid:native.rootPid});
    async function state(){if(descriptorFailure)throw descriptorFailure;return raw.evaluate(`(()=>{const s=window.__nativeSwitchAudio,a=s.audio;return {title:document.querySelector('.player-track strong')?.textContent,errors:s.errors,lastSeek:s.lastSeek,position:a?.currentTime,duration:Number.isFinite(a?.duration)?a.duration:null,paused:a?.paused,seeking:a?.seeking,readyState:a?.readyState,resource:a?.currentSrc?new URL(a.currentSrc).searchParams.get('item'):null};})()`);}
    async function wait(check,label,timeout=10000){const end=performance.now()+timeout;let value;while(performance.now()<end){value=await state();assert.equal(value.errors,0,'Synthetic media must not produce decoder errors');if(check(value))return value;await delay(100);}throw Error(`${label}: ${JSON.stringify(value)}`);}
    async function click(name){await raw.evaluate(`(()=>{const b=[...document.querySelectorAll('.transport button')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(name)});if(!b)throw Error('Transport control unavailable');b.click();})()`);}
    async function next(index){const started=performance.now();await click('Brano successivo');const value=await wait(s=>s.title===tracks[index].title&&s.resource===tracks[index].id&&!s.paused&&!s.seeking&&s.readyState>=3&&s.position>.1,'Next must render and play the matching item');return {index,startMs:performance.now()-started,position:value.position,duration:value.duration};}
    async function seekFive(){const before=(await state()).lastSeek?.at??-1;await raw.evaluate(`document.querySelector('.playerbar input[aria-label="Posizione del brano"]').focus()`);for(const key of ['Home','ArrowRight']){await raw.page.send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:key==='Home'?36:39});await raw.page.send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:key==='Home'?36:39});}return wait(s=>!s.seeking&&s.readyState>=3&&s.lastSeek?.at>before&&Math.abs(s.lastSeek.position-5)<.3,'A new seeked event must confirm the five-second target');}
    // Discard two initial changes and allow startup/font/decoder caches to settle.
    await next(1);await delay(2000);await next(2);await delay(2000);
    let rendererIdentity;
    async function sample(phase,gc=false){const item=await probe.sample(phase,{collectGarbage:gc});const renderer=item.processes.filter(p=>p.kind==='renderer');assert.equal(renderer.length,1);const identity=`${renderer[0].pid}:${renderer[0].startedAt}`;if(rendererIdentity)assert.equal(identity,rendererIdentity);else rendererIdentity=identity;samples.push(item);await checkpoint();console.log(JSON.stringify({scope:'native-switch-control',codec,phase,completedSwitches:switches.length,rendererMiB:Math.round(renderer[0].privateBytes/1048576),heapMiB:Number((item.renderer.heapUsedBytes/1048576).toFixed(2))}));}
    await sample('baseline',true);const started=performance.now();let seeks=0;
    for(let cycle=0;cycle<cycles;cycle++){
      const result=await next(cycle+3);await delay(6000);const value=await wait(s=>s.position>result.position+4&&!s.paused,'Playback must keep advancing');
      if(cycle%3===0){const seekStarted=performance.now();await seekFive();result.seekMs=performance.now()-seekStarted;seeks++;}
      switches.push({...result,advancedSeconds:value.position-result.position});
      if((cycle+1)%5===0)await sample('periodic');
    }
    await sample('switching-end',true);const elapsedSeconds=(performance.now()-started)/1000;
    await click('Pausa');await seekFive();await delay(20000);const paused=await state();assert(paused.paused);assert(Math.abs(paused.position-5)<.1);await sample('paused-idle',true);
    const transport=fixture.report();assert.equal(transport.invalidRequests,0);assert.equal(transport.interceptedResponses,0);assert(transport.distinctItems>=cycles+3);assert(transport.maxBodyBytes<=transport.maxAllowedBodyBytes);
    await checkpoint(true,{elapsedSeconds,completedSwitches:switches.length,completedSeeks:seeks,finalIndex:cycles+2,pausedPosition:paused.position,cspOverrides});
    return {elapsedSeconds,completedSwitches:switches.length,completedSeeks:seeks,reportFile};
  }catch(error){originalError=error;throw error;}
  finally{
    const errors=[];
    try{await raw?.close();}catch(error){errors.push(error);}
    if(detached)try{await reconnect();}catch(error){errors.push(error);}
    try{await fixture.close();}catch(error){errors.push(error);}
    if(errors.length)throw new AggregateError(originalError?[originalError,...errors]:errors,'Switch-control cleanup failed');
  }
}
