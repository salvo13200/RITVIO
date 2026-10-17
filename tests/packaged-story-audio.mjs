import {expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
export async function runNativeStoryAudio({page,profile,version,mediaId,initialTitle='Me at the zoo',nextTitle='Big Buck Bunny'}){
  await page.evaluate(async({mediaId})=>{const config=await window.ritvio.configuration();const response=await fetch(`${config.baseUrl}/v1/me/lyrics/${mediaId}`,{method:'PUT',headers:{Authorization:`Bearer ${config.token}`,'Content-Type':'application/json'},body:JSON.stringify({text:'Prima riga originale\nSeconda riga di prova\nTerza riga originale\nUltima riga esclusa',format:'txt',fileName:'test-originale.txt'})});if(!response.ok)throw Error('Cannot seed test lyrics');},{mediaId});
  await page.evaluate(()=>{
    const records={element:null,errors:[],playRejected:[]};window.__storyAudio=records;
    const original=HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play=function(...args){
      if(records.element!==this){records.element=this;this.addEventListener('error',()=>records.errors.push({code:this.error?.code,message:this.error?.message}));}
      const promise=original.apply(this,args);void promise.catch(error=>records.playRejected.push({name:error.name,message:error.message}));return promise;
    };
  });
  const state=()=>page.evaluate(()=>{const a=window.__storyAudio.element;return a?{time:a.currentTime,paused:a.paused,ready:a.readyState,network:a.networkState,code:a.error?.code??null,errors:window.__storyAudio.errors,rejections:window.__storyAudio.playRejected}:null;});
  const status=[];page.on('response',response=>{if(/\/v1\/(stream|media)/.test(response.url()))status.push({status:response.status(),kind:response.url().includes('/stream/')?'stream':response.url().includes('playback')?'playback':'metadata'});});
  try{
    await page.getByRole('slider',{name:'Posizione del brano',exact:true}).fill('0');
    await page.locator('.play-button').click();await expect.poll(async()=>(await state())?.time??0,{timeout:45000}).toBeGreaterThan(.5);
    const before=await state();await page.locator('#story-share-trigger').click();await expect(page.locator('.story-dialog')).toBeVisible();
    await expect.poll(async()=>(await state())?.time??0,{timeout:10000}).toBeGreaterThan(before.time+2);
    await page.locator('.story-modes').getByRole('button',{name:'Testo',exact:true}).click();const inside=await state();
    await page.getByRole('button',{name:'Riga 1: Prima riga originale',exact:true}).click();await page.getByRole('button',{name:'Riga 2: Seconda riga di prova',exact:true}).click();
    await expect.poll(async()=>(await state())?.time??0,{timeout:5000}).toBeGreaterThan(inside.time+1);
    await page.getByRole('button',{name:'Chiudi condivisione'}).click();const after=await state();expect(after.paused).toBe(false);expect(after.code).toBe(null);expect(after.errors).toHaveLength(0);await expect(page.locator('.player-error')).not.toBeVisible();
    await expect(page.locator('.player-track strong')).toHaveText(initialTitle);
    const priorSource=await page.evaluate(()=>window.__storyAudio.element.currentSrc);
    await page.getByRole('button',{name:'Brano successivo',exact:true}).click();await expect(page.locator('.player-track strong')).toHaveText(nextTitle);
    await expect.poll(async()=>{const a=await state(),changed=await page.evaluate(prior=>window.__storyAudio.element.currentSrc!==prior,priorSource);return changed&&a&&!a.paused&&a.time>1&&a.code===null;},{timeout:45000}).toBe(true);await expect(page.locator('.player-error')).not.toBeVisible();const next=await state();expect(next.errors).toHaveLength(0);
    await page.locator('.play-button').click();
    const result={version,nativeLiveShare:true,lyricSelectionClosedWithoutExport:true,nextTrackPlaying:true,before,after,next,status};await writeFile(path.join(profile,'story-audio.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  }catch(error){await writeFile(path.join(profile,'story-audio-failure.json'),JSON.stringify({version,state:await state(),status},null,2));throw error;}
}
