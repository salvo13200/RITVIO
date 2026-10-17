import {test,expect,type Page} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {fixture} from './helpers/mobile-fixture';
const output=process.env.RITVIO_ANDROID10==='1'?'test-results/visual/android-10/regression-android8-ui.spec':'test-results/visual/android-8';
async function player(page:Page){await page.getByRole('button',{name:/Apri il player:/}).click();await expect(page.locator('.artwork-flight')).toHaveCount(0);return page.getByRole('dialog',{name:'In ascolto',exact:true});}
async function calls(page:Page){return page.evaluate(()=>(window as any).__mobileOperations as any[]);}
async function search(page:Page){await page.getByRole('button',{name:'Cerca',exact:true}).click();await page.getByRole('searchbox').fill('Luna Riva');await expect(page.getByRole('heading',{name:'Brani',exact:true})).toBeVisible();}

test('main player omits volume while Audio keeps deliberate gain control',async({page})=>{
 await fixture(page);const full=await player(page);await expect(full.getByRole('slider')).toHaveCount(1);await expect(full.getByRole('slider',{name:'Volume del player'})).toHaveCount(0);await full.getByRole('button',{name:'Audio',exact:true}).click();await expect(page.getByRole('dialog',{name:'Audio',exact:true}).getByRole('slider',{name:'Volume del player'})).toBeVisible();await page.getByRole('button',{name:'Chiudi Audio'}).click();await expect(full).toBeVisible();expect((await calls(page)).filter(o=>o.method==='command'||o.method==='playTracks')).toHaveLength(0);
});

test('header drag dismisses without disturbing queue and reduced motion closes directly',async({page})=>{
 await fixture(page);await player(page);const label=page.locator('.full-header>span'),box=(await label.boundingBox())!;
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+160,{steps:8});await page.mouse.up();await expect(page.getByRole('dialog',{name:'In ascolto',exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>(window as any).__mobileState().position)).toBe(84);expect((await calls(page)).filter(o=>o.method==='command'||o.method==='playTracks')).toHaveLength(0);
 await page.evaluate(()=>{document.documentElement.dataset.reduceMotion='true';});await player(page);await page.getByRole('button',{name:'Chiudi il player'}).click();await expect(page.getByRole('dialog',{name:'In ascolto',exact:true})).toHaveCount(0);
});

test('cancelled header drag restores the player and never becomes a seek',async({page})=>{
 await fixture(page);const full=await player(page);const header=page.locator('.full-header'),box=(await page.locator('.full-header>span').boundingBox())!;
 await page.mouse.move(box.x+10,box.y+10);await page.mouse.down();await page.mouse.move(box.x+10,box.y+50,{steps:4});await header.dispatchEvent('pointercancel',{pointerId:1});await page.mouse.up();await expect(full).toHaveCSS('transform','none');await expect(full).toBeVisible();expect((await calls(page)).filter(o=>o.method==='command')).toHaveLength(0);
});

test('player identity opens the real album and Back preserves playback',async({page})=>{
 await fixture(page);const full=await player(page);await full.getByRole('button',{name:'Apri album del brano: A luci spente',exact:true}).click();await expect(page.locator('.detail-page h1')).toHaveText('Notti chiare');await page.goBack();await expect(page.getByRole('dialog',{name:'In ascolto',exact:true})).toBeVisible();expect((await calls(page)).filter(o=>o.method==='command'||o.method==='playTracks')).toHaveLength(0);
});

test('search focus stays inside its container on touch and keyboard with long queries',async({page})=>{
 await fixture(page);await page.getByRole('button',{name:'Cerca',exact:true}).click();await page.setViewportSize({width:360,height:740});const field=page.getByRole('searchbox');await field.tap();await field.fill('Un nome molto lungo che supera lo spazio disponibile della ricerca');await expect(field).toHaveCSS('outline-style','none');await expect(page.locator('.search-field')).toHaveCSS('border-top-color','rgb(189, 145, 244)');await field.press('Tab');await page.keyboard.press('Shift+Tab');await expect(field).toBeFocused();
 const bounds=await field.evaluate(el=>{const a=el.getBoundingClientRect(),b=el.closest('.search-field')!.getBoundingClientRect();return{inside:a.left>=b.left&&a.right<=b.right&&a.top>=b.top&&a.bottom<=b.bottom,overflow:document.documentElement.scrollWidth>innerWidth};});expect(bounds).toEqual({inside:true,overflow:false});await page.getByRole('button',{name:'Cancella ricerca'}).click();await expect(field).toHaveValue('');
});

test('search overview links to full results without losing credited-artist priority',async({page})=>{
 await fixture(page);await search(page);await expect(page.locator('.search-page .track-row')).toHaveCount(2);await page.getByRole('button',{name:'Mostra tutti: Brani'}).click();await expect(page.locator('.search-page .track-row')).toHaveCount(3);await expect(page.locator('.search-page .track-main').first()).toHaveAccessibleName('Riproduci A luci spente');await expect(page.getByRole('searchbox')).toHaveValue('Luna Riva');await expect(page.locator('.search-page .filter[aria-pressed=true]')).toHaveText('Brani');expect((await calls(page)).filter(o=>o.method==='playTracks')).toHaveLength(0);
});

test('wave positions stay fixed horizontally while playing and seek commits once',async({page})=>{
 await fixture(page);await player(page);const bars=page.locator('.wave-played>rect');const before=await bars.evaluateAll(nodes=>nodes.slice(0,12).map(n=>n.getAttribute('x')));const slider=page.getByRole('slider',{name:'Posizione del brano'});await slider.fill('100');await expect(page.locator('.seek-tooltip')).toHaveText('1:40');expect((await calls(page)).filter(o=>o.type==='seek')).toHaveLength(0);await slider.dispatchEvent('pointerup');expect((await calls(page)).filter(o=>o.type==='seek')).toHaveLength(1);expect(await bars.evaluateAll(nodes=>nodes.slice(0,12).map(n=>n.getAttribute('x')))).toEqual(before);
});

test('captures current player and focused search with large browser text and honest provenance',async({page})=>{
 await fixture(page);await mkdir(output,{recursive:true});await page.evaluate(()=>document.fonts.ready);const full=await player(page);await expect(full).toHaveCSS('opacity','1');await expect(page.locator('.player-cover img')).toBeVisible();await page.screenshot({path:`${output}/web-player-393.png`,animations:'disabled'});await page.getByRole('button',{name:'Chiudi il player'}).click();await expect(full).toHaveCount(0);await search(page);await page.getByRole('searchbox').focus();await page.screenshot({path:`${output}/web-search-focus-393.png`,animations:'disabled'});
 await page.setViewportSize({width:360,height:740});await page.evaluate(()=>{document.documentElement.style.fontSize='130%';const w=window as any;w.__mobileState().items[0].title='Un titolo molto lungo da leggere e aprire nel suo album';w.__mobileState().items[0].artist='Artista dal nome lungo con altri interpreti';w.__mobileUpdate();});await page.screenshot({path:`${output}/web-search-text130-360.png`,animations:'disabled'});const large=await player(page);await expect(large).toHaveCSS('opacity','1');expect(await large.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await page.screenshot({path:`${output}/web-player-text130-360.png`,animations:'disabled'});await large.getByRole('button',{name:'Timer',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:`${output}/web-player-text130-360-end.png`,animations:'disabled'});await large.getByRole('button',{name:'Timer',exact:true}).click();await expect(page.getByRole('dialog',{name:'Timer di spegnimento',exact:true}).getByRole('button',{name:'Alla fine del brano'})).toBeVisible();
});
