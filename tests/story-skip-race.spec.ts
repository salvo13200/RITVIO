import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
test('closing lyric sharing then skipping ignores a late error from the outgoing audio resource',async({page,request})=>{
  await request.post('http://127.0.0.1:5199/test-reset-library');await page.addInitScript(()=>{window.__RITVIO_TEST_CONFIG__={baseUrl:'http://127.0.0.1:5199',token:'test-token-only'};});
  await page.route('**/v1/media/*/artwork',async r=>r.fulfill({body:await readFile('docs/design/ui-1/preview/assets/city.png'),contentType:'image/png'}));
  await page.route('**/playback?prepare=true',r=>r.fulfill({status:503,json:{error:{code:'BUSY',message:'Preparing fixture'}}}));
  await page.goto('/');await page.getByRole('textbox',{name:'Cerca musica'}).fill('Musica test');await page.locator('.track-row').first().getByRole('button',{name:'Riproduci Secondo brano',exact:true}).click();
  const sample=()=>page.evaluate(async()=>{const p='/src/player.tsx';const a=(await import(p)).audio;return {time:a.currentTime,error:a.error?.code??null,paused:a.paused};});
  await expect.poll(async()=>(await sample()).time).toBeGreaterThan(.5);
  await page.locator('#story-share-trigger').click();await page.locator('.story-modes').getByRole('button',{name:'Testo',exact:true}).click();await page.getByRole('button',{name:'Riga 1: Prima riga originale',exact:true}).click();await page.getByRole('button',{name:'Chiudi condivisione'}).click();
  let release!:()=>void,entered=0,fresh=0;const gate=new Promise<void>(resolve=>release=resolve);
  await page.route('**/v1/media/*/playback**',async route=>{if(route.request().url().includes('prepare=true'))return route.fulfill({status:503,json:{error:{code:'BUSY',message:'Fixture'}}});if(route.request().url().includes('fresh=true'))fresh++;else{entered++;await gate;}return route.continue();});
  try{
    await page.getByRole('button',{name:'Brano successivo',exact:true}).click();await expect.poll(()=>entered).toBe(1);
    // A queued browser media error still belongs to the previous source until
    // the new descriptor has been installed. Its arrival must not refresh the incoming track.
    await page.evaluate(async()=>{const p='/src/player.tsx',a=(await import(p)).audio;Object.defineProperty(a,'error',{configurable:true,get:()=>({code:2,message:'Outgoing connection closed'})});a.dispatchEvent(new Event('error'));delete (a as any).error;});
    release();await expect.poll(async()=>(await sample()).paused).toBe(false);await expect.poll(async()=>(await sample()).time).toBeGreaterThan(.5);await expect(page.locator('.player-track strong')).toHaveText('Primo & brano');await expect(page.locator('.player-error')).not.toBeVisible();expect(fresh).toBe(0);
  }finally{release();}
});
