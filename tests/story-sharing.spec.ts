import {test,expect,type Page} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const {validateStoryPng}=createRequire(import.meta.url)('../apps/desktop/story-export.cjs');
const review='test-results/visual/story-selection-0.6.32';
const originalLines=['Sotto la pioggia di neon','La città rallenta','resta accesa una finestra','porto il cielo nelle tasche','e ritorno verso casa','le strade parlano ancora'];
test.beforeEach(async({page,request})=>{
  await request.post('http://127.0.0.1:5199/test-reset-library');
  await page.addInitScript(()=>{window.__RITVIO_TEST_CONFIG__={baseUrl:'http://127.0.0.1:5199',token:'test-token-only'};});
  await page.route('https://i.ytimg.com/**',async route=>route.fulfill({body:await readFile('tests/fixtures/artwork/city.webp'),contentType:'image/webp'}));
  await page.route('**/v1/media/*/artwork',async route=>route.fulfill({body:await readFile('tests/fixtures/artwork/city.webp'),contentType:'image/webp'}));
  await page.route('**/v1/me/lyrics/*',route=>route.fulfill({json:{status:'ready',document:{provider:'local',providerId:null,plainText:originalLines.join('\n'),lines:[],offsetMs:0,title:'Secondo brano',artist:'Artista - Topic',fileName:'original.txt',instrumental:false,fetchedAt:new Date().toISOString(),licenseVerified:null},cacheHit:true,savedChoice:true}}));
});
async function open(page:Page){
  await page.goto('/');await page.getByRole('textbox',{name:'Cerca musica'}).fill('Musica test');await page.locator('.track-row').first().getByRole('button',{name:'Riproduci Secondo brano',exact:true}).click();await expect(page.getByRole('button',{name:'Pausa',exact:true})).toBeVisible();await page.getByRole('button',{name:'Pausa',exact:true}).click();await page.locator('#story-share-trigger').click();await expect(page.locator('.story-dialog')).toBeVisible();await expect(page.getByRole('button',{name:'Salva immagine',exact:true})).toBeEnabled();
}
async function select(page:Page){await page.locator('.story-modes').getByRole('button',{name:'Testo',exact:true}).click();await page.getByRole('button',{name:'Riga 2: La città rallenta',exact:true}).click();await page.getByRole('button',{name:'Riga 5: e ritorno verso casa',exact:true}).click();await expect(page.locator('.story-selection-heading output')).toHaveText('4/10 righe selezionate · 92 caratteri');await expect(page.getByRole('button',{name:'Salva immagine',exact:true})).toBeEnabled();}
async function save(page:Page,name:string){const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Salva immagine',exact:true}).click();const download=await downloadPromise;await mkdir(review,{recursive:true});const filename=`${review}/${name}.png`;await download.saveAs(filename);const bytes=await readFile(filename);validateStoryPng(bytes);expect(bytes.readUInt32BE(16)).toBe(1080);expect(bytes.readUInt32BE(20)).toBe(1920);return bytes;}
test('approved A / C cards export the exact preview, keep the opening track and never seek',async({page})=>{
  await page.setViewportSize({width:1586,height:992});await open(page);await mkdir(review,{recursive:true});await page.screenshot({path:`${review}/a-desktop.png`});const trackPng=await save(page,'a-export');
  await select(page);await page.screenshot({path:`${review}/c-desktop.png`});const lyricPng=await save(page,'c-export');expect(trackPng.equals(lyricPng)).toBe(false);
  let sought=0;await page.evaluate(()=>{document.querySelector('audio')?.addEventListener('seeking',()=>{(window as any).__shareSeeks=((window as any).__shareSeeks??0)+1;});});
  const preview=await page.locator('.story-preview canvas').evaluate((el:HTMLCanvasElement)=>el.toDataURL());
  // Force playback identity forward through the actual media-session handler while the dialog is open.
  await page.evaluate(async()=>{const modulePath='/src/store.ts';const {usePlayer}=await import(modulePath);usePlayer.getState().next();});
  await expect(page.locator('.player-track strong')).toHaveText('Primo & brano');await expect(page.locator('.story-preview canvas')).toHaveAttribute('aria-label',/Secondo brano/);
  expect(await page.locator('.story-preview canvas').evaluate((el:HTMLCanvasElement)=>el.toDataURL())).toBe(preview);expect(await page.locator('.story-selection-heading output').textContent()).toContain('92 caratteri');
  await page.getByRole('button',{name:'Nuova selezione'}).click();await page.getByRole('button',{name:'Riga 1: Sotto la pioggia di neon'}).click();expect(await page.evaluate(()=>(window as any).__shareSeeks??0)).toBe(0);
  await page.getByRole('button',{name:'Chiudi condivisione'}).click();await expect(page.locator('#story-share-trigger')).toBeFocused();
});
test('full text and missing text cannot leak into a saved image; reversed range remains contiguous',async({page})=>{
  await open(page);await page.locator('.story-modes').getByRole('button',{name:'Testo',exact:true}).click();await page.getByRole('button',{name:'Riga 1: Sotto la pioggia di neon'}).click();await page.getByRole('button',{name:'Riga 6: le strade parlano ancora'}).click();await expect(page.locator('.story-lines li.selected')).toHaveCount(1);await expect(page.getByRole('button',{name:'Salva immagine',exact:true})).toBeEnabled();await expect(page.locator('.story-warning')).toContainText('completo');
  await page.getByRole('button',{name:'Nuova selezione'}).click();await page.getByRole('button',{name:'Riga 5: e ritorno verso casa'}).click();await page.getByRole('button',{name:'Riga 2: La città rallenta'}).click();await expect(page.locator('.story-lines li.selected')).toHaveCount(4);await expect(page.getByRole('button',{name:'Salva immagine',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Chiudi condivisione'}).click();await page.unroute('**/v1/me/lyrics/*');await page.route('**/v1/me/lyrics/*',r=>r.fulfill({json:{status:'missing',document:null,cacheHit:true,savedChoice:false}}));await page.locator('#story-share-trigger').click();await page.locator('.story-modes').getByRole('button',{name:'Testo',exact:true}).click();await expect(page.locator('.story-lyrics-empty')).toContainText('non ci sono testi');await expect(page.getByRole('button',{name:'Salva immagine',exact:true})).toBeDisabled();await page.evaluate(async()=>{await Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});await page.screenshot({path:`${review}/missing-lyrics.png`});
});
test('artwork fallback is explicit, API failure does not report success and keyboard stays trapped',async({page})=>{
  await page.unroute('**/v1/media/*/artwork');await page.route('**/v1/media/*/artwork',r=>r.fulfill({status:502,json:{error:{message:'Assente'}}}));await page.goto('/');await page.getByRole('textbox',{name:'Cerca musica'}).fill('Musica test');await page.locator('.track-row').first().getByRole('button',{name:'Riproduci Secondo brano',exact:true}).click();await page.locator('#story-share-trigger').click();await expect(page.locator('.story-artwork-warning')).toBeVisible();await expect(page.getByRole('button',{name:'Salva immagine',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Usa senza copertina'}).click();await expect(page.getByRole('button',{name:'Salva immagine',exact:true})).toBeEnabled();await save(page,'fallback-export');
  for(let index=0;index<12;index++){await page.keyboard.press('Tab');expect(await page.evaluate(()=>!!document.activeElement?.closest('.story-dialog'))).toBe(true);}await page.keyboard.press('Escape');await expect(page.locator('.story-dialog')).toHaveCount(0);await expect(page.locator('#story-share-trigger')).toBeFocused();
});
test('compact and reduced-motion layouts retain the three actions and scroll the entire selector',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:640,height:600});await open(page);await select(page);await page.screenshot({path:`${review}/c-compact.png`});
  expect(await page.locator('.story-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);await page.getByRole('button',{name:'Chiudi condivisione'}).click();
  for(const selector of ['#lyrics-reader-trigger','#story-share-trigger'])await expect(page.locator(selector)).toBeVisible();const metrics=await page.locator('.player-track').evaluate(el=>({left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right,share:el.querySelector('#story-share-trigger')!.getBoundingClientRect().right}));expect(metrics.share).toBeLessThanOrEqual(metrics.right);
  await page.screenshot({path:`${review}/player-compact.png`});
  await page.setViewportSize({width:390,height:844});await page.locator('#story-share-trigger').click();await page.locator('.story-modes').getByRole('button',{name:'Testo',exact:true}).click();await page.screenshot({path:`${review}/c-mobile-ready.png`});expect(await page.locator('.story-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
});
test('cancelled native save stays neutral and a failed save reports a recoverable error',async({page})=>{
  await open(page);
  await page.evaluate(()=>{(window as any).__storyCalls=0;window.ritvio={exportStory:async()=>{(window as any).__storyCalls++;return {saved:false};}} as any;});
  await page.getByRole('button',{name:'Salva immagine',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__storyCalls)).toBe(1);await expect(page.getByRole('button',{name:'Salva immagine',exact:true})).toBeEnabled();await expect(page.getByRole('button',{name:'Immagine salvata',exact:true})).toHaveCount(0);
  await page.evaluate(()=>{window.ritvio={exportStory:async()=>{throw Error('Cartella non scrivibile');}} as any;});await page.getByRole('button',{name:'Salva immagine',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Cartella non scrivibile');await expect(page.getByRole('button',{name:'Salva immagine',exact:true})).toBeEnabled();
});
test('six long lyric rows exceed 150 characters and export completely on a palette surface',async({page})=>{
  const longRows=['Prima riga esclusa',...Array.from({length:6},(_,i)=>`Verso originale ${i+1}: la notte continua e le parole trovano spazio, fra le finestre accese e la strada di ritorno.`),'Ultima riga esclusa'];
  await page.unroute('**/v1/me/lyrics/*');await page.route('**/v1/me/lyrics/*',route=>route.fulfill({json:{status:'ready',document:{provider:'local',plainText:longRows.join('\n'),lines:[],instrumental:false},cacheHit:true,savedChoice:true}}));
  await page.setViewportSize({width:1586,height:992});await open(page);await page.locator('.story-modes').getByRole('button',{name:'Testo',exact:true}).click();
  await page.getByRole('button',{name:`Riga 2: ${longRows[1]}`,exact:true}).click();await page.getByRole('button',{name:`Riga 7: ${longRows[6]}`,exact:true}).click();
  const selected=longRows.slice(1,7).join('\n');await expect(page.locator('.story-selection-heading output')).toHaveText(`6/10 righe selezionate · ${Array.from(selected).length} caratteri`);await expect(page.getByRole('button',{name:'Salva immagine',exact:true})).toBeEnabled();
  await save(page,'long-lyrics-export');await page.screenshot({path:`${review}/long-lyrics-desktop.png`});
  const surface=await page.locator('.story-preview canvas').evaluate((canvas:HTMLCanvasElement)=>{const ctx=canvas.getContext('2d')!;return [200,400,600,800].map(x=>Array.from(ctx.getImageData(x,180,1,1).data).slice(0,3));});
  for(let color=0;color<3;color++)expect(Math.abs((surface[3][color]-surface[2][color])-(surface[1][color]-surface[0][color]))).toBeLessThan(5);
});

test('persistent anchor supports repeated expansion, ten rows and rejected extensions without changing the export',async({page})=>{
  const rows=Array.from({length:13},(_,i)=>`Verso ${i+1}: la città si accende`);
  await page.unroute('**/v1/me/lyrics/*');await page.route('**/v1/me/lyrics/*',route=>route.fulfill({json:{status:'ready',document:{provider:'local',plainText:rows.join('\n'),lines:[],instrumental:false},cacheHit:true,savedChoice:true}}));
  await page.setViewportSize({width:1586,height:992});await open(page);await page.locator('.story-modes').getByRole('button',{name:'Testo',exact:true}).click();
  const row=(n:number)=>page.getByRole('button',{name:`Riga ${n}: ${rows[n-1]}`,exact:true});
  await row(1).click();await row(2).click();await row(4).click();await expect(page.locator('.story-lines li.selected')).toHaveCount(4);
  await expect(row(1)).toHaveAttribute('aria-pressed','true');await expect(row(3)).toHaveAttribute('aria-pressed','true');
  await row(2).click();await expect(page.locator('.story-lines li.selected')).toHaveCount(2);
  await row(10).click();await expect(page.locator('.story-lines li.selected')).toHaveCount(10);
  const text=rows.slice(0,10).join('\n');await expect(page.locator('.story-selection-heading output')).toHaveText(`10/10 righe selezionate · ${Array.from(text).length} caratteri`);
  await expect(page.getByRole('button',{name:'Salva immagine',exact:true})).toBeEnabled();
  const before=await page.locator('canvas').evaluate((canvas:HTMLCanvasElement)=>canvas.toDataURL());
  await expect(row(11)).toHaveAttribute('aria-disabled','true');await row(11).focus();await page.keyboard.press('Space');
  await expect(page.locator('.story-warning')).toContainText('Massimo 10 righe consecutive');await expect(page.locator('.story-lines li.selected')).toHaveCount(10);
  expect(await page.locator('canvas').evaluate((canvas:HTMLCanvasElement)=>canvas.toDataURL())).toBe(before);
  await expect(page.getByRole('button',{name:'Salva immagine',exact:true})).toBeEnabled();await save(page,'ten-rows-export');await page.screenshot({path:`${review}/ten-rows-desktop.png`});
  await row(3).click();await expect(page.locator('.story-warning')).toHaveCount(0);await expect(page.locator('.story-lines li.selected')).toHaveCount(3);
  // Same-turn updates must publish only the latest range, and never a stale canvas.
  await page.evaluate(()=>{const buttons=document.querySelectorAll<HTMLButtonElement>('.story-lines button');for(const index of [6,8,3])buttons[index].click();});
  await expect(page.locator('.story-lines li.selected')).toHaveCount(4);await expect(page.getByRole('button',{name:'Salva immagine',exact:true})).toBeEnabled();
  await expect(page.locator('.story-preview canvas')).toHaveAttribute('aria-label',new RegExp(rows[3]));await save(page,'final-range-export');
  await page.getByRole('button',{name:'Nuova selezione'}).click();await expect(page.locator('.story-lines li.selected')).toHaveCount(0);await expect(page.getByRole('button',{name:'Salva immagine',exact:true})).toBeDisabled();
  await row(9).click();await row(6).click();await row(4).click();await expect(page.locator('.story-lines li.selected')).toHaveCount(6);await expect(row(9)).toHaveAttribute('aria-pressed','true');
});
