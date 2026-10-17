import {expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
export async function runNativeHome({page,profile,capture,version}){
  const audioBefore=await page.evaluate(()=>{const a=window.__storyAudio?.element??document.querySelector('audio');return {src:a?.currentSrc,paused:a?.paused,time:a?.currentTime};});
  await expect(page.locator('.home2-feature')).toHaveCount(2,{timeout:40000});
  await expect(page.getByRole('heading',{name:'Hit Italia',exact:true})).toBeVisible();
  await capture('native-home.png');
  let mediaRequests=0;const request=r=>{if(/^\/v1\/media\/[^/]+\/playback/.test(new URL(r.url()).pathname))mediaRequests++;};page.on('request',request);
  try{
    await page.getByRole('button',{name:'Apri Hit Italia',exact:true}).click();await expect(page.locator('.home2-detail .catalog-track').first()).toBeVisible({timeout:40000});
    const count=await page.locator('.home2-detail .catalog-track').count();expect(count).toBeGreaterThan(20);expect(mediaRequests).toBe(0);
    await page.getByRole('button',{name:'Salva una copia',exact:true}).click();await expect(page.locator('.home2-notice')).toContainText('Copia privata salvata',{timeout:20000});expect(mediaRequests).toBe(0);
    await page.getByRole('button',{name:'Aggiungi alla coda',exact:true}).click();await expect(page.locator('.home2-notice')).toContainText('Brani aggiunti');
    const audioAfter=await page.evaluate(()=>{const a=window.__storyAudio?.element??document.querySelector('audio');return {src:a?.currentSrc,paused:a?.paused,time:a?.currentTime};});expect(audioAfter.src).toBe(audioBefore.src);expect(audioAfter.paused).toBe(audioBefore.paused);
    await capture('native-home-collection.png');
    await page.getByRole('button',{name:'Torna alla Home',exact:true}).click();await page.getByRole('button',{name:'Apri Nuove uscite',exact:true}).click();await expect(page.locator('.home2-album-grid>button').first()).toBeVisible({timeout:40000});const albums=await page.locator('.home2-album-grid>button').count(),releaseTracks=await page.locator('.home2-detail .catalog-track').count();expect(albums).toBeGreaterThan(0);expect(releaseTracks).toBeGreaterThan(0);expect(mediaRequests).toBe(0);
    await capture('native-home-releases.png');
    const evidence={version,realHome:true,chartTracks:count,releaseTracks,releaseAlbums:albums,saveIndependentCopy:true,enqueuePreservesCurrent:!!audioBefore.src,audioStateCaptured:!!audioBefore.src,metadataOnlyPlaybackRequests:mediaRequests,profile};await writeFile(path.join(profile,'home.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
  }finally{page.off('request',request);}
}
