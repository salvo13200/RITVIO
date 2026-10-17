import {test,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
test('opening, editing and closing sharing preserves actively decoded audio',async({page,request})=>{
  await request.post('http://127.0.0.1:5199/test-reset-library');
  await page.addInitScript(()=>{window.__RITVIO_TEST_CONFIG__={baseUrl:'http://127.0.0.1:5199',token:'test-token-only'};});
  await page.route('**/v1/media/*/artwork',async route=>route.fulfill({body:await readFile('tests/fixtures/artwork/city.webp'),contentType:'image/webp'}));
  await page.goto('/');await page.getByRole('textbox',{name:'Cerca musica'}).fill('Musica test');await page.locator('.track-row').first().getByRole('button',{name:'Riproduci Secondo brano',exact:true}).click();
  const sample=()=>page.evaluate(async()=>{const modulePath='/src/player.tsx',statePath='/src/store.ts';const a=(await import(modulePath)).audio,s=(await import(statePath)).usePlayer.getState();return {time:a.currentTime,paused:a.paused,source:a.currentSrc,error:a.error?.code??null,playing:s.playing,message:s.error};});
  await expect.poll(async()=>(await sample()).time).toBeGreaterThan(.5);const before=await sample();
  const events:string[]=[];page.on('console',m=>{if(m.type()==='error')events.push(m.text());});
  let foreground=0;page.on('request',request=>{if(/\/playback/.test(request.url())&&!request.url().includes('prepare=true'))foreground++;});
  try{
    await page.locator('#story-share-trigger').click();await expect(page.locator('.story-dialog')).toBeVisible();await expect(page.getByRole('button',{name:'Salva immagine',exact:true})).toBeEnabled();
    await expect.poll(async()=>(await sample()).time).toBeGreaterThan(before.time+1.2);await page.locator('.story-modes').getByRole('button',{name:'Testo',exact:true}).click();
    await expect(page.getByRole('button',{name:'Riga 1: Prima riga originale',exact:true})).toBeVisible();await page.getByRole('button',{name:'Riga 1: Prima riga originale',exact:true}).click();await page.getByRole('button',{name:'Riga 2: Seconda riga di prova',exact:true}).click();
    const inside=await sample();await expect.poll(async()=>(await sample()).time).toBeGreaterThan(inside.time+.6);await page.getByRole('button',{name:'Chiudi condivisione'}).click();
    const after=await sample();expect(after.paused).toBe(false);expect(after.error).toBe(null);expect(after.message).toBe(null);expect(after.source).toBe(before.source);expect(foreground).toBe(0);
  }catch(error){await writeFile('data/analysis/story-audio-failure.json',JSON.stringify({before,after:await sample(),events,foreground},null,2));throw error;}
});
test('closing while artwork is pending cancels only sharing, then next playback succeeds',async({page,request})=>{
  await request.post('http://127.0.0.1:5199/test-reset-library');await page.addInitScript(()=>{window.__RITVIO_TEST_CONFIG__={baseUrl:'http://127.0.0.1:5199',token:'test-token-only'};});
  let release!:()=>void,entered=0;const gate=new Promise<void>(resolve=>release=resolve);
  await page.route('**/v1/media/*/artwork',async route=>{entered++;await gate;await route.fulfill({body:await readFile('tests/fixtures/artwork/city.webp'),contentType:'image/webp'}).catch(()=>{});});
  await page.goto('/');await page.getByRole('textbox',{name:'Cerca musica'}).fill('Musica test');await page.locator('.track-row').first().getByRole('button',{name:'Riproduci Secondo brano',exact:true}).click();
  const sample=()=>page.evaluate(async()=>{const p='/src/player.tsx';const a=(await import(p)).audio;return {time:a.currentTime,paused:a.paused,error:a.error?.code??null};});
  await expect.poll(async()=>(await sample()).time).toBeGreaterThan(.5);
  let resolverCalls=0;page.on('request',r=>{if(r.url().includes('/links/resolve'))resolverCalls++;});
  try{await page.locator('#story-share-trigger').click();await expect.poll(()=>entered).toBe(1);await page.locator('.story-modes').getByRole('button',{name:'Testo',exact:true}).click();await page.getByRole('button',{name:'Riga 1: Prima riga originale',exact:true}).click();await page.getByRole('button',{name:'Chiudi condivisione'}).click();await page.getByRole('button',{name:'Brano successivo',exact:true}).click();release();await expect(page.locator('.player-track strong')).toHaveText('Primo & brano');await expect.poll(async()=>(await sample()).paused).toBe(false);await expect.poll(async()=>(await sample()).time).toBeGreaterThan(.5);expect((await sample()).error).toBe(null);await expect(page.locator('.player-error')).not.toBeVisible();expect(resolverCalls).toBe(0);}finally{release();}
});
