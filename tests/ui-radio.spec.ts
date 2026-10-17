import {test,expect,type Page} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {tracks,radioTracks} from './fixtures';
import type {QueueItem} from '../packages/domain/index';
const base='http://127.0.0.1:5199',headers={authorization:'Bearer test-token-only'};
test.beforeEach(async({page,request})=>{
  await request.post(base+'/test-reset-library');await request.get(base+'/v1/search?q=Musica%20test',{headers});
  await page.addInitScript(track=>{window.__RITVIO_TEST_CONFIG__={baseUrl:'http://127.0.0.1:5199',token:'test-token-only'};if(!localStorage.getItem('ritvio-player-v1'))localStorage.setItem('ritvio-player-v1',JSON.stringify({version:1,state:{queue:[{...track,queueId:'radio-seed',source:'collection'}],index:0,position:3,volume:.1}}));},tracks[1]);
});
async function state(page:Page){return page.evaluate(async()=>{const path='/src/store.ts';const s=(await import(path)).usePlayer.getState();return {queue:s.queue,index:s.index,playing:s.playing,position:s.position,activation:s.activation,radio:s.radioSession,shuffle:s.shuffle,repeat:s.repeat};});}
const startButton=(page:Page)=>page.locator('.player-extras').getByRole('button',{name:'Avvia radio da Secondo brano',exact:true});
test('radio: explicit start preserves paused seed, filters exclusions, supports queue edits, close and paused restart',async({page})=>{
  await page.goto('/');await page.evaluate(async track=>{const path='/src/store.ts';(await import(path)).usePlayer.getState().excludeTrack(track);},radioTracks[1]);
  const before=await state(page);await startButton(page).click();await expect(page.getByRole('region',{name:'Radio del brano'})).toBeVisible();await expect(page.locator('.radio-summary')).toContainText('4 suggerimenti');
  const after=await state(page);expect(after.queue).toHaveLength(5);expect(after.activation).toBe(before.activation);expect(after.position).toBe(before.position);expect(after.playing).toBe(false);expect(after.repeat).toBe('off');expect(after.queue.some((t:QueueItem)=>t.videoId===radioTracks[1].videoId)).toBe(false);
  await page.reload();await page.locator('#queue-panel-trigger').click();await expect(page.locator('.radio-summary')).toContainText('4 suggerimenti');expect((await state(page)).playing).toBe(false);
  await page.getByRole('button',{name:'Modifica coda',exact:true}).click();await page.getByRole('button',{name:'Rimuovi Scoperta radio 1',exact:true}).click();await expect(page.locator('.radio-summary')).toContainText('3 suggerimenti');
  const queue=(await state(page)).queue;await page.getByRole('button',{name:'Chiudi radio e mantieni la coda'}).click();await expect(page.locator('.radio-summary')).not.toBeVisible();expect((await state(page)).queue).toEqual(queue);
});
test('radio: current audio continues while loading, and prepared next radio entry is reused',async({page})=>{
  let release!:()=>void;const gate=new Promise<void>(r=>release=r);let entered=0,requests:string[]=[];
  await page.route('**/v1/catalog/radio/*',async route=>{entered++;const response=await route.fetch();await gate;await route.fulfill({response}).catch(()=>{});});
  await page.route('**/v1/media/*/playback**',async route=>{requests.push(route.request().url());const response=await route.fetch(),body=await response.json();body.expiresAt=new Date(Date.now()+600000).toISOString();await route.fulfill({response,json:body});});
  await page.goto('/');await page.getByRole('button',{name:'Riproduci',exact:true}).click();await expect.poll(async()=>(await state(page)).position).toBeGreaterThan(3);
  await startButton(page).click();await expect.poll(()=>entered).toBe(1);const before=(await state(page)).position;await expect.poll(async()=>(await state(page)).position).toBeGreaterThan(before+.5);
  release();await expect(page.locator('.radio-summary')).toContainText('5 suggerimenti');await expect.poll(()=>requests.filter(u=>u.includes('prepare=true')).length).toBe(1);
  expect(requests.filter(u=>!u.includes('prepare=true'))).toHaveLength(1);await page.getByRole('button',{name:'Brano successivo',exact:true}).click();await expect(page.locator('.player-track strong')).toHaveText('Primo & brano');
  await expect.poll(async()=>page.evaluate(async()=>{const path='/src/playback-metrics.ts';return (await import(path)).playbackMetrics().at(-1)?.prepared;})).toBe(true);
});
test('radio: cancel and a new transport command prevent a late result replacing the queue',async({page})=>{
  let release!:()=>void;const gate=new Promise<void>(r=>release=r);let entered=0;
  await page.route('**/v1/catalog/radio/*',async route=>{entered++;await gate;await route.fulfill({json:{data:{videoId:tracks[1].videoId,items:radioTracks},cache:{hit:false,degraded:false,fetchedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()}}}).catch(()=>{});});
  await page.goto('/');await startButton(page).click();await expect.poll(()=>entered).toBe(1);await expect(page.locator('.radio-summary')).toContainText('Cerco brani simili');
  await page.getByRole('button',{name:'Annulla ricerca radio'}).click();release();await expect(page.locator('.radio-summary')).not.toBeVisible();expect((await state(page)).queue).toHaveLength(1);
  await page.unroute('**/v1/catalog/radio/*');
  let entered2=0,release2!:()=>void;const gate2=new Promise<void>(r=>release2=r);
  await page.route('**/v1/catalog/radio/*',async route=>{entered2++;const response=await route.fetch();await gate2;await route.fulfill({response}).catch(()=>{});});
  await startButton(page).click();await expect.poll(()=>entered2).toBe(1);await page.evaluate(async track=>{const path='/src/store.ts';(await import(path)).usePlayer.getState().play(track);},tracks[0]);release2();await expect(page.locator('.player-track strong')).toHaveText('Primo & brano');expect((await state(page)).radio).toBe(null);expect((await state(page)).queue).toHaveLength(1);
});
test('radio: provider failure and empty results preserve queue and allow explicit retry',async({page})=>{
  let calls=0;await page.route('**/v1/catalog/radio/*',async route=>{calls++;if(calls===1)return route.fulfill({status:503,json:{error:{code:'RESOLVER_FAILED',message:'Catalogo non disponibile. Riprova tra poco.'}}});if(calls===2)return route.fulfill({json:{data:{videoId:tracks[1].videoId,items:[]},cache:{hit:false,degraded:false,fetchedAt:new Date().toISOString(),expiresAt:new Date().toISOString()}}});return route.continue();});
  await page.goto('/');const before=(await state(page)).queue;await startButton(page).click();await expect(page.locator('.radio-summary [role=alert]')).toContainText('Catalogo non disponibile');expect((await state(page)).queue).toEqual(before);
  await page.getByRole('button',{name:'Riprova radio'}).click();await expect(page.locator('.radio-summary [role=alert]')).toContainText('Nessun suggerimento');expect((await state(page)).queue).toEqual(before);
  await page.getByRole('button',{name:'Riprova radio'}).click();await expect(page.locator('.radio-summary')).toContainText('5 suggerimenti');
});
test('radio: search menu is keyboard accessible; finite queue does not request additional radio',async({page})=>{
  let calls=0;page.on('request',r=>{if(r.url().includes('/catalog/radio/'))calls++;});
  await page.goto('/');await page.getByRole('textbox',{name:'Cerca musica'}).fill('Musica test');const menu=page.locator('.track-row').filter({has:page.getByRole('button',{name:'Riproduci Secondo brano',exact:true})}).locator('button[popovertarget]');await menu.focus();await page.keyboard.press('Enter');
  const radio=page.locator('[popover]:popover-open').getByRole('button',{name:'Avvia radio da Secondo brano'});await radio.focus();await page.keyboard.press('Enter');await expect(page.locator('.radio-summary')).toContainText('5 suggerimenti');
  await page.evaluate(async()=>{const path='/src/store.ts';const s=(await import(path)).usePlayer.getState();s.select(s.queue.length-1);s.next(true);});expect((await state(page)).playing).toBe(false);expect(calls).toBe(1);
});
test('radio: visual matrix, wrapped labels and reduced motion use the incumbent system',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');await startButton(page).click();await expect(page.locator('.radio-summary')).toContainText('5 suggerimenti');await mkdir('.impeccable/review/radio-0.6.26',{recursive:true});
  for(const mode of ['desktop','light','compact'] as const){
    await page.setViewportSize({width:mode==='compact'?640:1440,height:940});await page.evaluate(async theme=>{const path='/src/store.ts';(await import(path)).usePlayer.setState({theme});},mode==='light'?'light':'dark');
    const bounds=await page.locator('.radio-summary').evaluate(e=>({scroll:e.scrollWidth,client:e.clientWidth}));expect(bounds.scroll).toBeLessThanOrEqual(bounds.client+1);
    await page.screenshot({path:'.impeccable/review/radio-0.6.26/'+mode+'.png'});
  }
  expect(await page.locator('.radio-summary').evaluate(e=>e.getAnimations().filter(a=>a.playState==='running').length)).toBe(0);
});
