import {expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
function tone(){
  const size=120*8000*2,b=Buffer.alloc(44+size);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(size,40);for(let i=0;i<size/2;i++)b.writeInt16LE(Math.round(Math.sin(i*Math.PI*440/8000)*500),44+i*2);return b;
}
/** Isolated native IPC/transport verification with our own PCM, no remote audio. */
export async function runNativeQuality({page,version,profile,mediaId,capture}){
  const wav=tone(),context=page.context();
  await page.route('**/ritvio-quality.wav',route=>{
    const range=route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/),start=range?Number(range[1]):0,end=range?Math.min(range[2]?Number(range[2]):wav.length-1,wav.length-1):wav.length-1;
    return route.fulfill({status:range?206:200,contentType:'audio/wav',headers:{'accept-ranges':'bytes',...(range?{'content-range':`bytes ${start}-${end}/${wav.length}`}:{})},body:wav.subarray(start,end+1)});
  });
  await page.route('**/v1/media/*/playback*',route=>route.fulfill({json:{mode:'youtube-audio-resolver',accessMethod:'unofficial-extraction',provider:'youtube',videoId:'jNQXAC9IVRw',url:'/ritvio-quality.wav',expiresAt:new Date(Date.now()+600000).toISOString(),capabilities:{background:true,seek:true,volume:true,equalizer:true,offline:false}}}));
  await page.evaluate(()=>{
    const original=HTMLMediaElement.prototype.play;window.__qualityNative={elements:[],audio:null,errors:[]};HTMLMediaElement.prototype.play=function(...args){const r=window.__qualityNative;r.audio=this;if(!r.elements.includes(this)){r.elements.push(this);this.addEventListener('error',()=>r.errors.push(this.error?.code));}return original.apply(this,args);};
  });
  await page.evaluate(async id=>{const c=await window.ritvio.configuration();const r=await fetch(`${c.baseUrl}/v1/me/lyrics/${id}`,{method:'PUT',headers:{Authorization:`Bearer ${c.token}`,'Content-Type':'application/json'},body:JSON.stringify({text:'Prima riga originale\nSeconda riga originale',format:'txt',fileName:'originale.txt'})});if(!r.ok)throw Error('Lyrics seed failed');},mediaId);
  await page.locator('.play-button').click();await expect.poll(()=>page.evaluate(()=>window.__qualityNative.audio?.currentTime??0),{timeout:15000}).toBeGreaterThan(8);
  await page.getByRole('button',{name:'Vista immersiva',exact:true}).click();await expect(page.locator('.immersive .lyrics-reader')).toBeVisible();
  const before=await page.evaluate(()=>({src:window.__qualityNative.audio.currentSrc,time:window.__qualityNative.audio.currentTime}));
  await context.addInitScript(()=>{window.__miniAudioConstructed=0;const NativeAudio=window.Audio;window.Audio=new Proxy(NativeAudio,{construct(target,args){window.__miniAudioConstructed++;return Reflect.construct(target,args);}});});
  const opened=context.waitForEvent('page');await page.getByRole('button',{name:'Apri mini-player',exact:true}).click();const mini=await opened;await mini.waitForLoadState('domcontentloaded');await expect(mini.locator('.mini-song strong')).toHaveText('Me at the zoo');
  expect(await mini.evaluate(()=>window.__miniAudioConstructed)).toBe(0);
  const denied=await mini.evaluate(async()=>{const r={};for(const name of ['configuration','readPlayer'])try{await window.ritvio[name]();r[name]=false;}catch{r[name]=true;}return r;});expect(denied).toEqual({configuration:true,readPlayer:true});
  await mini.getByRole('button',{name:'Pausa',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.__qualityNative.audio.paused)).toBe(true);
  await mini.getByRole('slider',{name:'Volume',exact:true}).fill('0.3');await expect.poll(()=>page.evaluate(()=>window.__qualityNative.audio.volume)).toBe(.3);
  await mini.getByRole('slider',{name:'Posizione del brano',exact:true}).focus();await mini.keyboard.press('Home');await mini.keyboard.press('ArrowRight');await expect.poll(()=>page.evaluate(()=>window.__qualityNative.audio.currentTime)).toBe(1);
  await mini.getByRole('button',{name:'Sempre in primo piano',exact:true}).click();await expect(mini.getByRole('button',{name:'Sempre in primo piano',exact:true})).toHaveAttribute('aria-pressed','true');
  await mini.getByRole('button',{name:'Riproduci',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.__qualityNative.audio.currentTime)).toBeGreaterThan(1);
  expect(await page.evaluate(()=>window.__qualityNative.audio.currentSrc)).toBe(before.src);expect(await page.evaluate(()=>window.__qualityNative.elements.length)).toBe(1);
  await mini.getByRole('button',{name:'Brano successivo',exact:true}).click();await expect(page.locator('.player-track strong')).toHaveText('Big Buck Bunny');await expect(mini.locator('.mini-song strong')).toHaveText('Big Buck Bunny');
  const closed=mini.waitForEvent('close');await mini.getByRole('button',{name:'Apri finestra principale',exact:true}).click();await closed;await expect(page.locator('.immersive')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>window.__qualityNative.audio.currentTime)).toBeGreaterThan(.5);await page.locator('.play-button').click();expect(await page.evaluate(()=>window.__qualityNative.errors)).toEqual([]);
  const result={version,profile,originalPCM:true,immersiveKeptAudio:true,miniNoAudioEngine:true,privilegedIPCRejected:denied,miniPauseVolumeSeekPinNextRestore:true,oneAudioElement:true};await writeFile(path.join(profile,'quality-native.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
