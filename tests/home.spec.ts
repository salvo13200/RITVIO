import {test,expect,type Page} from '@playwright/test';
import {mkdir,readFile} from 'node:fs/promises';
const review='test-results/visual/home-0.6.33';
async function settle(page:Page){await page.evaluate(async()=>{await Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});}
test.beforeEach(async({page,request})=>{
  page.on('pageerror',error=>console.log('HOME_PAGE_ERROR',error.stack));
  await request.post('http://127.0.0.1:5199/test-reset-library');
  await page.addInitScript(()=>{localStorage.setItem('ritvio.language.v1',JSON.stringify({schema:1,preference:'it'}));window.__RITVIO_TEST_CONFIG__={baseUrl:'http://127.0.0.1:5199',token:'test-token-only'};});
  await page.route('**/v1/home',async route=>{const response=await route.fetch(),json=await response.json();for(const c of json.data?.collections??[])c.artwork=`https://i.ytimg.com/vi/${c.id==='releases'?'homealbum01':c.id==='global'?'homeworld01':'homeitaly01'}/mqdefault.jpg`;await route.fulfill({json});});
  await page.route('https://i.ytimg.com/**',async route=>{const url=route.request().url(),asset=url.includes('homealbum')?'sky':url.includes('homeworld')?'sunset':'city';await route.fulfill({body:await readFile(`tests/fixtures/artwork/${asset}.webp`),contentType:'image/webp'});});
  await mkdir(review,{recursive:true});
});
test('Home A has real collection actions, no eager audio, and a readable closed-panel desktop',async({page})=>{
  const playback:string[]=[];page.on('request',r=>{if(/^\/v1\/media\/[^/]+\/playback/.test(new URL(r.url()).pathname))playback.push(r.url());});
  await page.setViewportSize({width:1586,height:992});await page.goto('/');
  await expect(page.locator('.home2-feature')).toHaveCount(2,{timeout:30000});await expect(page.locator('.home2-world-grid>.home2-shelf-card')).toHaveCount(2);
  await expect(page.getByRole('heading',{name:'Hit globali',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Nuove uscite',exact:true})).toBeVisible();
  await expect(page.locator('.home2-features')).not.toContainText(/YouTube|YT Music/i);
  await expect(page.locator('.app')).toHaveClass(/without-panel/);await settle(page);await page.screenshot({path:`${review}/home-desktop.png`});
  expect(playback).toHaveLength(0);await expect(page.locator('.home2')).not.toContainText('Hit Italia');
  await page.locator('.home2-features').getByRole('button',{name:'Apri Hit globali',exact:true}).click();
  await expect(page.locator('.home2-detail')).toBeVisible();await expect(page.locator('.home2-detail .catalog-track')).toHaveCount(2);expect(playback).toHaveLength(0);
  await settle(page);await page.screenshot({path:`${review}/collection-desktop.png`});
  await page.getByRole('button',{name:'Salva una copia',exact:true}).click();await expect(page.locator('.home2-detail .home2-notice')).toContainText('Copia privata salvata');expect(playback).toHaveLength(0);
  await page.getByRole('button',{name:'Aggiungi alla coda',exact:true}).click();await expect(page.locator('.home2-notice')).toContainText('Brani aggiunti');
  await page.locator('.home2-detail-actions').getByRole('button',{name:'Ascolta',exact:true}).click();await expect(page.getByRole('button',{name:'Pausa',exact:true})).toBeVisible();await page.getByRole('button',{name:'Pausa',exact:true}).click();
  await page.getByRole('button',{name:'Torna alla Home',exact:true}).click();await expect(page.locator('.home2-recent-grid>button')).toHaveCount(1);await settle(page);await page.screenshot({path:`${review}/home-recent.png`});
});
test('New releases open a playable selection and full albums without replacing the current queue',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Apri Nuove uscite',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Esplora tutti gli album e i singoli'})).toBeVisible();await expect(page.locator('.home2-release-note')).toContainText('data di uscita completa');
  await settle(page);await page.screenshot({path:`${review}/releases-desktop.png`});
  await page.locator('.home2-album-grid button').first().click();await expect(page.locator('.catalog-page')).toBeVisible();
  await page.locator('.history-controls button').first().click();await expect(page.locator('.home2-detail')).toBeVisible();
});
test('Compact, narrow and reduced-motion layouts retain readable covers and actions',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:1280,height:800});await page.goto('/');await expect(page.locator('.home2-feature')).toHaveCount(2);await settle(page);await page.screenshot({path:`${review}/home-1280.png`});
  expect(await page.locator('main').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await page.setViewportSize({width:640,height:720});await settle(page);await page.screenshot({path:`${review}/home-640.png`});expect(await page.locator('.home2').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await page.getByRole('button',{name:'Apri Hit globali',exact:true}).click();await expect(page.locator('.home2-detail-actions')).toBeVisible();expect(await page.locator('main').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);await settle(page);await page.screenshot({path:`${review}/collection-640.png`});
  await page.getByRole('button',{name:'Torna alla Home',exact:true}).click();await page.setViewportSize({width:390,height:844});await settle(page);await page.screenshot({path:`${review}/home-390.png`});expect(await page.locator('main').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
});
test('Unavailable source is actionable and does not invent chart or release contents',async({page})=>{
  await page.route('**/v1/home',r=>r.fulfill({json:{data:null,updatedAt:null,edition:'2026-10-09',refreshing:false,stale:false,error:'Connessione non disponibile.',retryAt:null}}));
  await page.goto('/');await expect(page.locator('.home2-notice')).toContainText('Connessione');await expect(page.locator('.home2-unavailable')).toHaveCount(2);await expect(page.getByRole('button',{name:'Aggiorna le raccolte della Home'})).toBeEnabled();await settle(page);await page.screenshot({path:`${review}/home-offline.png`});
});
test('Opening with Ascolta starts only the requested collection and returns focus to the Home route',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Ascolta Hit globali',exact:true}).click();await expect(page.locator('.home2-detail')).toBeVisible();await expect(page.getByRole('button',{name:'Pausa',exact:true})).toBeVisible();await expect(page.locator('.player-track strong')).toHaveText('Primo & brano');
});
test('A retained collection visibly warns that its source could not update',async({page})=>{
  await page.route('**/v1/home/collections/global',async route=>{const response=await route.fetch(),json=await response.json();await route.fulfill({json:{...json,stale:true,error:'La fonte non è disponibile. Conserviamo la raccolta precedente.',refreshing:false}});});
  await page.setViewportSize({width:1586,height:992});await page.goto('/');await page.getByRole('button',{name:'Apri Hit globali',exact:true}).click();
  await expect(page.locator('.home2-detail .home2-notice')).toContainText('raccolta precedente');await expect(page.locator('.home2-detail .catalog-track')).toHaveCount(2);
  await settle(page);await page.screenshot({path:`${review}/collection-stale.png`});
});
