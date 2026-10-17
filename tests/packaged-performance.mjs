import {expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
function originalTone(seconds=240){
  const samples=seconds*8000,buffer=Buffer.alloc(44+samples*2);
  buffer.write('RIFF');buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(8000,24);buffer.writeUInt32LE(16000,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(samples*2,40);
  for(let sample=0;sample<samples;sample++)buffer.writeInt16LE(Math.round(Math.sin(sample*2*Math.PI*220/8000)*800),44+sample*2);
  return buffer;
}
/** Controlled original PCM and provider failure; no YouTube audio is fetched by this soak. */
export async function runNativeSoak({page:initialPage,close,launch,profile}){
  let page=initialPage,failPlayback=false;
  const wav=originalTone();
  await page.route('**/native-original-tone.wav',route=>{
    const range=route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/),start=range?Number(range[1]):0,end=range?Math.min(range[2]?Number(range[2]):wav.length-1,wav.length-1):wav.length-1;
    return route.fulfill({status:range?206:200,contentType:'audio/wav',headers:{'accept-ranges':'bytes','access-control-allow-origin':'*',...(range?{'content-range':`bytes ${start}-${end}/${wav.length}`}:{})},body:wav.subarray(start,end+1)});
  });
  await page.route('**/v1/media/*/playback*',route=>failPlayback?route.fulfill({status:503,json:{error:{code:'RESOLVER_FAILED',message:'Errore controllato del provider di prova'}}}):route.fulfill({json:{mode:'youtube-audio-resolver',accessMethod:'unofficial-extraction',provider:'youtube',videoId:'jNQXAC9IVRw',url:'/native-original-tone.wav',expiresAt:new Date(Date.now()+600000).toISOString(),capabilities:{background:true,seek:true,volume:true,equalizer:true,offline:false}}}));
  await page.route('**/v1/me/lyrics/*',route=>route.fulfill({json:{status:'missing',document:null,savedChoice:false}}));
  const transport=()=>page.locator('.transport');
  const seek=()=>page.getByRole('slider',{name:'Posizione del brano',exact:true});
  await transport().getByRole('button',{name:'Riproduci',exact:true}).click();await expect(transport().getByRole('button',{name:'Pausa',exact:true})).toBeVisible();await expect.poll(async()=>Number(await seek().inputValue()),{timeout:10000}).toBeGreaterThan(8);
  const started=performance.now(),firstPosition=Number(await seek().inputValue());let cycles=0;
  while(performance.now()-started<60000){
    await page.getByRole('button',{name:'Impostazioni',exact:true}).click();await expect(page.locator('.preferences-page')).toBeVisible();await page.getByRole('tab',{name:'Audio',exact:true}).click();await expect(page.locator('.audio-controls')).toBeVisible();await page.getByRole('button',{name:'Torna alla musica',exact:true}).click();
    await page.locator('#lyrics-reader-trigger').click();await expect(page.locator('.lyrics-reader')).toBeVisible();await page.locator('#lyrics-reader-trigger').click();
    await page.locator('#queue-panel-trigger').click();await expect(page.locator('.queue-row')).toHaveCount(61);await expect(transport().getByRole('button',{name:'Pausa',exact:true})).toBeVisible();await page.locator('#now-panel-trigger').click();cycles++;await page.waitForTimeout(500);
  }
  const lastPosition=Number(await seek().inputValue());expect(lastPosition).toBeGreaterThan(firstPosition);
  failPlayback=true;await transport().getByRole('button',{name:'Brano successivo',exact:true}).click();await expect(page.locator('.player-error')).toContainText('Errore controllato');failPlayback=false;await page.locator('.player-error').getByRole('button',{name:'Riprova',exact:true}).click();await expect(transport().getByRole('button',{name:'Pausa',exact:true})).toBeVisible();await expect.poll(async()=>Number(await seek().inputValue()),{timeout:10000}).toBeGreaterThan(0);
  await transport().getByRole('button',{name:'Pausa',exact:true}).click();await seek().press('Home');await seek().press('ArrowRight');await expect(seek()).toHaveValue('5');
  await close();page=await launch();await expect(page.locator('.transport').getByRole('button',{name:'Riproduci',exact:true})).toBeVisible();await expect(page.getByRole('slider',{name:'Posizione del brano',exact:true})).toHaveValue('5');await page.locator('#queue-panel-trigger').click();await expect(page.locator('.queue-row')).toHaveCount(61);
  const saved=JSON.parse(await readFile(path.join(profile,'player-state.json'),'utf8'));expect(saved.state.queue).toHaveLength(500);expect(saved.state.index).toBe(1);expect(saved.state.position).toBe(5);
  return {durationSeconds:(performance.now()-started)/1000,continuousNavigationSeconds:60,cycles,firstPosition,lastPosition,originalSyntheticPCM:true,controlledProviderErrorRecovered:true,queueCountAfterRestart:500,visibleCurrentAndUpcomingAfterRestart:61,currentIndexAfterRestart:1,positionAfterRestart:5,noAutoplay:true};
}
