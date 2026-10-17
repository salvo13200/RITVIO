import {test,expect,type Page} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import {tracks,radioTracks} from './fixtures';
const base='http://127.0.0.1:5199',headers={authorization:'Bearer test-token-only'};
test.beforeEach(async({page,request})=>{
  await request.post(base+'/test-reset-library');await request.get(base+'/v1/search?q=Musica%20test',{headers});
  await page.addInitScript(track=>{window.__RITVIO_TEST_CONFIG__={baseUrl:'http://127.0.0.1:5199',token:'test-token-only'};if(!localStorage.getItem('ritvio-player-v1'))localStorage.setItem('ritvio-player-v1',JSON.stringify({version:1,state:{queue:[{...track,queueId:'autoplay-seed',source:'collection'}],index:0,position:0,volume:.1}}));},tracks[0]);
  await page.emulateMedia({reducedMotion:'reduce'});
});
const toggle=(page:Page)=>page.locator('.queue-body').getByRole('switch',{name:'Continua con brani simili'});
async function state(page:Page){return page.evaluate(async()=>{const path='/src/store.ts';const s=(await import(path)).usePlayer.getState();return {queue:s.queue,index:s.index,playing:s.playing,position:s.position,activation:s.activation,enabled:s.autoplayEnabled,waiting:s.autoplayWaiting};});}
async function open(page:Page){await page.goto('/');await page.locator('#queue-panel-trigger').click();}
test('autoplay: default off, optional batch preserves audio, labels origin and can be disabled without removing queue',async({page})=>{
  let calls=0;page.on('request',r=>{if(r.url().includes('/v1/catalog/radio/'))calls++;});await open(page);await expect(toggle(page)).toHaveAttribute('aria-checked','false');await page.locator('.play-button').click();await expect.poll(async()=>(await state(page)).position).toBeGreaterThan(1);expect(calls).toBe(0);const before=await state(page);
  await toggle(page).click();await expect(page.locator('.queue-body .autoplay-status')).toContainText('5 brani aggiunti');const after=await state(page);expect(after.queue).toHaveLength(6);expect(after.queue[0].queueId).toBe(before.queue[0].queueId);expect(after.activation).toBe(before.activation);expect(after.position).toBeGreaterThanOrEqual(before.position);expect(calls).toBe(1);await expect(page.locator('.queue-autoplay-origin').filter({hasText:'Autoplay · da Primo & brano'})).toHaveCount(5);await expect(page.locator('.queue-autoplay-origin').first()).toBeVisible();
  await toggle(page).click();expect((await state(page)).queue).toEqual(after.queue);await page.reload();await page.locator('#queue-panel-trigger').click();await expect(toggle(page)).toHaveAttribute('aria-checked','false');expect((await state(page)).playing).toBe(false);
});
test('autoplay: prepared extension advances at natural end with a real synthetic audio start',async({page})=>{
  await open(page);await toggle(page).click();await page.locator('.play-button').click();await expect(page.locator('.queue-body .autoplay-status')).toContainText('5 brani aggiunti');
  await page.getByRole('slider',{name:'Posizione del brano'}).press('End');await expect(page.locator('.player-track strong')).toHaveText('Secondo brano');await expect.poll(async()=>(await state(page)).position).toBeGreaterThan(0);expect((await state(page)).enabled).toBe(true);await expect(page.locator('.player-error')).not.toBeVisible();
  await expect(page.locator('.queue-row.current .queue-autoplay-origin')).toBeVisible();await expect(page.locator('.queue-row.current .queue-autoplay-origin')).toContainText('In riproduzione · Autoplay · da Primo & brano');
});
test('autoplay: late response waits after natural end and continues once; switching off cancels that wait',async({page})=>{
  let release!:()=>void;const gate=new Promise<void>(r=>release=r);let entered=0;
  await page.route('**/v1/catalog/radio/*',async route=>{entered++;const response=await route.fetch();await gate;await route.fulfill({response}).catch(()=>{});});
  await open(page);await toggle(page).click();await page.locator('.play-button').click();await expect.poll(()=>entered).toBe(1);await page.getByRole('slider',{name:'Posizione del brano'}).press('End');await expect(page.locator('.queue-body .autoplay-status')).toContainText('La coda è terminata');expect((await state(page)).waiting).toBe(true);
  release();await expect(page.locator('.player-track strong')).toHaveText('Secondo brano');await expect.poll(async()=>(await state(page)).position).toBeGreaterThan(0);await expect(page.locator('.player-error')).not.toBeVisible();
});
test('autoplay: a disabled pending request cannot restart audio or add late candidates',async({page})=>{
  let release!:()=>void;const gate=new Promise<void>(r=>release=r);let entered=0;
  await page.route('**/v1/catalog/radio/*',async route=>{entered++;const response=await route.fetch();await gate;await route.fulfill({response}).catch(()=>{});});
  await open(page);await toggle(page).click();await page.locator('.play-button').click();await expect.poll(()=>entered).toBe(1);await page.getByRole('slider',{name:'Posizione del brano'}).press('End');await expect.poll(async()=>(await state(page)).waiting).toBe(true);await toggle(page).click();release();expect((await state(page)).waiting).toBe(false);expect((await state(page)).queue).toHaveLength(1);expect((await state(page)).playing).toBe(false);
});
test('autoplay: failures stay separate from audio, do not spin, and explicit retry works while paused',async({page})=>{
  let calls=0;await page.route('**/v1/catalog/radio/*',route=>{calls++;return calls===1?route.fulfill({status:503,json:{error:{code:'RESOLVER_FAILED',message:'Catalogo temporaneamente non disponibile'}}}):route.continue();});
  await open(page);await toggle(page).click();await page.locator('.play-button').click();await expect(page.locator('.queue-body .autoplay-status')).toContainText('Catalogo temporaneamente');await expect.poll(async()=>(await state(page)).position).toBeGreaterThan(2);await expect(page.locator('.player-error')).not.toBeVisible();await page.getByRole('slider',{name:'Posizione del brano'}).press('End');await expect.poll(async()=>(await state(page)).playing).toBe(false);expect(calls).toBe(1);
  await page.locator('.queue-body').getByRole('button',{name:'Riprova suggerimenti'}).click();await expect(page.locator('.queue-body .autoplay-status')).toContainText('5 brani aggiunti');expect((await state(page)).playing).toBe(false);expect(calls).toBe(2);
});
test('autoplay: repeat and sleep timer suspend requests, and clear upcoming disables consent',async({page})=>{
  let calls=0;page.on('request',r=>{if(r.url().includes('/v1/catalog/radio/'))calls++;});await open(page);await page.evaluate(async()=>{const path='/src/store.ts';const s=(await import(path)).usePlayer.getState();s.armSleep('track');s.setAutoplay(true);});await page.locator('.play-button').click();await expect(page.locator('.queue-body .autoplay-status')).toContainText('timer di spegnimento');await expect.poll(async()=>(await state(page)).position).toBeGreaterThan(1);expect(calls).toBe(0);
  await page.getByRole('slider',{name:'Posizione del brano'}).press('End');await expect.poll(async()=>(await state(page)).playing).toBe(false);expect((await state(page)).waiting).toBe(false);
  const attempts=await page.evaluate(async()=>{const path='/src/playback-metrics.ts';return (await import(path)).playbackMetrics().length;});
  await page.evaluate(async()=>{const path='/src/store.ts';(await import(path)).usePlayer.setState({repeat:'track'});});await page.locator('.play-button').click();await expect(page.locator('.queue-body .autoplay-status')).toContainText('ripetizione');
  await expect.poll(()=>page.evaluate(async()=>{const path='/src/playback-metrics.ts';return (await import(path)).playbackMetrics().length;})).toBeGreaterThan(attempts);
  await expect.poll(()=>page.evaluate(async()=>{const path='/src/playback-metrics.ts';return (await import(path)).playbackMetrics().at(-1)?.outcome;})).toBe('playing');
  await expect.poll(async()=>(await state(page)).position).toBeGreaterThan(1);expect(calls).toBe(0);
  await page.evaluate(async track=>{const path='/src/store.ts';const store=(await import(path)).usePlayer;store.setState({repeat:'off'});store.getState().enqueue(track);store.getState().clearUpcoming();},radioTracks[0]);await expect(toggle(page)).toHaveAttribute('aria-checked','false');
});
test('autoplay: excluded tracks and recently played editions are filtered using current state',async({page})=>{
  await open(page);await page.evaluate(async track=>{const path='/src/store.ts';const s=(await import(path)).usePlayer.getState();s.excludeTrack(track);(await import(path)).usePlayer.setState({recent:[{...track,videoId:'otheralias1'}]});},radioTracks[0]);await toggle(page).click();await page.locator('.play-button').click();await expect(page.locator('.queue-body .autoplay-status')).toContainText('4 brani aggiunti');
  expect((await state(page)).queue.some((track:{videoId:string})=>track.videoId===radioTracks[0].videoId)).toBe(false);
});
test('autoplay: switch synchronizes settings, survives paused restart and passes scoped accessibility in both themes',async({page})=>{
  await open(page);await toggle(page).focus();await page.keyboard.press('Space');await expect(toggle(page)).toHaveAttribute('aria-checked','true');await page.getByRole('button',{name:'Impostazioni',exact:true}).click();await page.getByRole('tab',{name:'Riproduzione',exact:true}).click();await expect(page.locator('.preferences-page').getByRole('switch',{name:'Continua con brani simili'})).toHaveAttribute('aria-checked','true');await page.reload();expect((await state(page)).playing).toBe(false);await page.locator('#queue-panel-trigger').click();await expect(toggle(page)).toHaveAttribute('aria-checked','true');
  await mkdir('test-results/visual/autoplay-0.6.27',{recursive:true});
  await page.evaluate(async ({seed,candidates})=>{const path='/src/store.ts',store=(await import(path)).usePlayer,s=store.getState();s.appendAutoplay(seed,candidates,s.autoplayRevision);s.select(1);store.setState({playing:false});s.prioritize(store.getState().queue[2].queueId);}, {seed:{...tracks[0],title:'Primo & brano — versione originale con ospiti e un finale molto lungo'},candidates:[tracks[1],...radioTracks]});
  await expect(page.locator('.queue-row.current .queue-autoplay-origin')).toContainText('In riproduzione · Autoplay');await expect(page.locator('.queue-row.upcoming .queue-autoplay-origin')).toContainText('Riproduci dopo · Autoplay');
  for(const mode of ['desktop','light','compact'] as const){await page.setViewportSize({width:mode==='compact'?640:1440,height:940});await page.evaluate(async theme=>{const path='/src/store.ts';(await import(path)).usePlayer.setState({theme});},mode==='light'?'light':'dark');const bounds=await page.locator('.queue-body .autoplay-control').evaluate(e=>({scroll:e.scrollWidth,client:e.clientWidth}));expect(bounds.scroll).toBeLessThanOrEqual(bounds.client+1);for(const marker of await page.locator('.queue-autoplay-origin').all()){await expect(marker).toBeVisible();const box=await marker.evaluate(e=>{const b=e.getBoundingClientRect(),p=e.parentElement!.getBoundingClientRect();return {left:b.left,right:b.right,parentLeft:p.left,parentRight:p.right,height:b.height,line:Number.parseFloat(getComputedStyle(e).lineHeight)};});expect(box.left).toBeGreaterThanOrEqual(box.parentLeft-1);expect(box.right).toBeLessThanOrEqual(box.parentRight+1);expect(box.height).toBeLessThanOrEqual(box.line+1);}const a11y=await new AxeBuilder({page}).include('.queue-body .autoplay-control').analyze();expect(a11y.violations).toEqual([]);await page.screenshot({path:'test-results/visual/autoplay-0.6.27/'+mode+'.png'});}
});
test('autoplay: overflowing origins scroll like the player, pause on hover or focus, and respect reduced motion',async({page})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});await open(page);await page.evaluate(async ({seed,candidates})=>{const path='/src/store.ts',store=(await import(path)).usePlayer,s=store.getState();s.setAutoplay(true);s.appendAutoplay(seed,candidates,store.getState().autoplayRevision);}, {seed:{...tracks[0],title:'Titolo molto lungo del brano originale con ospiti, una versione speciale e un finale esteso'},candidates:radioTracks});
  const line=page.locator('.queue-autoplay-origin').first(),run=line.locator('.marquee-run');await expect(line).toHaveAttribute('data-scroll','true');await expect(line).toHaveAttribute('title',/Autoplay.*Titolo molto lungo/);await expect.poll(()=>run.evaluate(e=>getComputedStyle(e).animationName)).toBe('player-name-scroll');
  await line.hover();await expect.poll(()=>run.evaluate(e=>getComputedStyle(e).animationPlayState)).toBe('paused');await line.locator('..').focus();await expect.poll(()=>run.evaluate(e=>getComputedStyle(e).animationPlayState)).toBe('paused');
  await page.emulateMedia({reducedMotion:'reduce'});await expect(line).toHaveAttribute('data-scroll','false');await expect.poll(()=>run.evaluate(e=>getComputedStyle(e).animationName)).toBe('none');
  await page.emulateMedia({reducedMotion:'no-preference'});await page.evaluate(async()=>{const path='/src/store.ts';(await import(path)).usePlayer.getState().setUILayout({motion:'essential'});});await expect(line).toHaveAttribute('data-scroll','false');
});
