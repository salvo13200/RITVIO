import {expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {originalTone,toneRangeResponse,maxToneChunkBytes} from './native-tone.mjs';
/** Controlled original PCM and provider failure; no YouTube audio is fetched by this soak. */
export async function runNativeSoak({page:initialPage,close,launch,profile,seconds=60,resourceProbe,restartResourceProbe,retainedHeap=false}){
  if(!Number.isInteger(seconds)||seconds<60||seconds>7200)throw Error('Controlled soak duration must be 60–7200 seconds');
  let page=initialPage,failPlayback=false,descriptorSequence=0,failedMediaResponses=0;
  const wav=originalTone(Math.max(240,seconds+120));
  const toneTransport={wavBytes:wav.length,maxAllowedBodyBytes:maxToneChunkBytes,maxObservedBodyBytes:0,rangeResponses:0,invalidRequests:0};
  await page.route('**/native-original-tone.wav*',route=>{
    // A prepared descriptor can skip the descriptor endpoint entirely. Fail its
    // actual media too, and use distinct URLs so the outgoing decoded media
    // cannot accidentally satisfy the next item's controlled fault.
    if(failPlayback){failedMediaResponses++;return route.fulfill({status:503,body:'Controlled media failure'});}
    const response=toneRangeResponse(wav,route.request().headers().range);
    toneTransport.maxObservedBodyBytes=Math.max(toneTransport.maxObservedBodyBytes,response.body.length);
    if(response.status===206)toneTransport.rangeResponses++;else if(response.status>=400)toneTransport.invalidRequests++;
    return route.fulfill({...response,contentType:'audio/wav'});
  });
  await page.route('**/v1/media/*/playback*',route=>failPlayback?route.fulfill({status:503,json:{error:{code:'RESOLVER_FAILED',message:'Errore controllato del provider di prova'}}}):route.fulfill({json:{mode:'youtube-audio-resolver',accessMethod:'unofficial-extraction',provider:'youtube',videoId:'jNQXAC9IVRw',url:`/native-original-tone.wav?descriptor=${++descriptorSequence}`,expiresAt:new Date(Date.now()+(seconds+600)*1000).toISOString(),capabilities:{background:true,seek:true,volume:true,equalizer:true,offline:false}}}));
  await page.route('**/v1/me/lyrics/*',route=>route.fulfill({json:{status:'missing',document:null,savedChoice:false}}));
  const transport=()=>page.locator('.transport');
  const seek=()=>page.getByRole('slider',{name:'Posizione del brano',exact:true});
  await transport().getByRole('button',{name:'Riproduci',exact:true}).click();await expect(transport().getByRole('button',{name:'Pausa',exact:true})).toBeVisible();await expect.poll(async()=>Number(await seek().inputValue()),{timeout:10000}).toBeGreaterThan(8);
  async function navigate(){
    await page.getByRole('button',{name:'Impostazioni',exact:true}).click();await expect(page.locator('.preferences-page')).toBeVisible();await page.getByRole('tab',{name:'Audio',exact:true}).click();await expect(page.locator('.audio-controls')).toBeVisible();await page.getByRole('button',{name:'Torna alla musica',exact:true}).click();
    await page.locator('#lyrics-reader-trigger').click();await expect(page.locator('.lyrics-reader')).toBeVisible();await page.locator('#lyrics-reader-trigger').click();
    await page.locator('#queue-panel-trigger').click();await expect(page.locator('.queue-row')).toHaveCount(61);await expect(transport().getByRole('button',{name:'Pausa',exact:true})).toBeVisible();await page.locator('#now-panel-trigger').click();await page.waitForTimeout(500);
  }
  async function sampleResources(phase){
    if(!resourceProbe)return;
    const sample=await resourceProbe.sample(phase,{collectGarbage:retainedHeap&&['baseline','navigation-end'].includes(phase)});
    await writeFile(path.join(profile,'soak-resources.json'),JSON.stringify({phase,sessionComplete:false,...resourceProbe.report()},null,2));
    console.log(JSON.stringify({scope:'controlled-native-resources',phase,processes:sample.processCount,privateMiB:Math.round(sample.privateBytes/1048576),rendererHeapMiB:Math.round(sample.renderer.heapUsedBytes/1048576),nodes:sample.renderer.nodes,eventListeners:sample.renderer.jsEventListeners}));
  }
  if(resourceProbe){await navigate();await sampleResources('baseline');}
  const started=performance.now(),firstPosition=Number(await seek().inputValue());let cycles=0,lastProgressAt=started,previousPosition=firstPosition,maxProgressSampleIntervalMs=0,nextProgressAt=started+30000;
  while(performance.now()-started<seconds*1000){
    await navigate();cycles++;
    const now=performance.now(),position=Number(await seek().inputValue());
    if(position>previousPosition){maxProgressSampleIntervalMs=Math.max(maxProgressSampleIntervalMs,now-lastProgressAt);lastProgressAt=now;previousPosition=position;}
    else expect(now-lastProgressAt,'Playback must keep advancing during the controlled session').toBeLessThan(10000);
    if(now>=nextProgressAt){await sampleResources('periodic');console.log(JSON.stringify({scope:'controlled-native-soak',elapsedSeconds:Math.round((now-started)/1000),targetSeconds:seconds,cycles}));nextProgressAt=now+30000;}
  }
  const navigationSeconds=(performance.now()-started)/1000,lastPosition=Number(await seek().inputValue()),audioAdvancedSeconds=lastPosition-firstPosition;
  expect(toneTransport.invalidRequests).toBe(0);expect(toneTransport.maxObservedBodyBytes).toBeLessThanOrEqual(maxToneChunkBytes);expect(toneTransport.rangeResponses).toBeGreaterThan(1);
  expect(audioAdvancedSeconds,'Media time must track actual elapsed time, not merely advance once').toBeGreaterThan(navigationSeconds*.9-2);
  await sampleResources('navigation-end');
  const navigationResources=resourceProbe?.report();
  await writeFile(path.join(profile,'soak-navigation.json'),JSON.stringify({phase:'navigation-complete',requestedNavigationSeconds:seconds,continuousNavigationSeconds:navigationSeconds,audioAdvancedSeconds,maxProgressSampleIntervalMs,cycles,originalSyntheticPCM:true,resources:resourceProbe?.report(),remainingChecks:['controlled-failure-and-retry','paused-restart-and-queue']},null,2));
  failPlayback=true;await transport().getByRole('button',{name:'Brano successivo',exact:true}).click();await expect(page.locator('.player-error')).toContainText('Errore controllato',{timeout:15000});expect(failedMediaResponses,'The prepared media must actually encounter the controlled fault').toBeGreaterThan(0);failPlayback=false;await page.locator('.player-error').getByRole('button',{name:'Riprova',exact:true}).click();await expect(transport().getByRole('button',{name:'Pausa',exact:true})).toBeVisible();await expect.poll(async()=>Number(await seek().inputValue()),{timeout:10000}).toBeGreaterThan(0);
  await sampleResources('recovery-playing');
  await transport().getByRole('button',{name:'Pausa',exact:true}).click();await seek().press('Home');await seek().press('ArrowRight');await expect(seek()).toHaveValue('5');
  if(resourceProbe){console.log(JSON.stringify({scope:'controlled-native-soak',phase:'paused-idle',seconds:30}));await page.waitForTimeout(30000);await sampleResources('paused-idle');await expect(transport().getByRole('button',{name:'Riproduci',exact:true})).toBeVisible();await expect(seek()).toHaveValue('5');}
  await close();page=await launch();await expect(page.locator('.transport').getByRole('button',{name:'Riproduci',exact:true})).toBeVisible();await expect(page.getByRole('slider',{name:'Posizione del brano',exact:true})).toHaveValue('5');await page.locator('#queue-panel-trigger').click();await expect(page.locator('.queue-row')).toHaveCount(61);
  if(restartResourceProbe){await page.locator('#now-panel-trigger').click();await page.waitForTimeout(500);}
  const restartedProbe=restartResourceProbe?await restartResourceProbe():undefined;
  if(restartedProbe){await restartedProbe.sample('restarted-paused',{collectGarbage:retainedHeap});await writeFile(path.join(profile,'soak-restart-resources.json'),JSON.stringify({phase:'restarted-paused',sessionComplete:false,...restartedProbe.report()},null,2));}
  const saved=JSON.parse(await readFile(path.join(profile,'player-state.json'),'utf8'));expect(saved.state.queue).toHaveLength(500);expect(saved.state.index).toBe(1);expect(saved.state.position).toBe(5);
  const result={durationSeconds:(performance.now()-started)/1000,requestedNavigationSeconds:seconds,continuousNavigationSeconds:navigationSeconds,audioAdvancedSeconds,maxProgressSampleIntervalMs,cycles,firstPosition,lastPosition,originalSyntheticPCM:true,scope:'Controlled generated PCM in a hidden isolated Windows portable; not a real-provider, OS suspend, audible-output or physical-phone trial',failedMediaResponses,controlledProviderErrorRecovered:true,queueCountAfterRestart:500,visibleCurrentAndUpcomingAfterRestart:61,currentIndexAfterRestart:1,positionAfterRestart:5,noAutoplay:true,resources:resourceProbe?.report(),navigationResources,restartedResources:restartedProbe?.report()};
  result.toneTransport={...toneTransport};
  await writeFile(path.join(profile,'soak-complete.json'),JSON.stringify(result,null,2));return result;
}
