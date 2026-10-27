import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {fixture} from './helpers/ios-fixture';
async function search(page:import('@playwright/test').Page,query='luna'){await page.getByRole('button',{name:'Search',exact:true}).click();await page.getByRole('searchbox').fill(query);await expect(page.getByRole('button',{name:'Open artist: Luna Vale',exact:true})).toBeVisible();}
test('unified search opens identity-bound album, preserves unavailable positions and duplicate occurrences',async({page})=>{
 const errors=await fixture(page,{withLibrary:true});await search(page);await page.getByRole('button',{name:'Albums',exact:true}).click();await page.getByRole('button',{name:'Open album: Night scenes',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Night scenes',exact:true})).toBeVisible();await expect(page.locator('.ios-album-tracks li')).toHaveCount(4);await expect(page.locator('.ios-album-tracks li').nth(1)).toContainText('Unavailable');
 expect(await page.evaluate(()=>(window as any).__iosOperations.filter((op:any)=>op.method==='playTracks').length)).toBe(0);
 const more=page.getByRole('button',{name:'More options: After the rain',exact:true}).nth(1);await more.scrollIntoViewIfNeeded();const scroll=await page.locator('.ios-content').evaluate(element=>element.scrollTop);
 await more.click();await expect(page.getByRole('dialog')).toBeVisible();await expect(page.locator('.ios-album-tracks li')).toHaveCount(4);await page.getByRole('button',{name:'Cancel',exact:true}).click();
 expect(Math.abs(await page.locator('.ios-content').evaluate(element=>element.scrollTop)-scroll)).toBeLessThan(2);
 await page.getByRole('button',{name:'Play: After the rain',exact:true}).nth(1).click();
 const operation=await page.evaluate(()=>(window as any).__iosOperations.findLast((op:any)=>op.method==='playTracks'));
 expect(operation.index).toBe(2);expect(operation.items.map((item:any)=>item.videoId)).toEqual(['ritviotest1','ritviotest2','ritviotest1']);
 await page.getByRole('button',{name:'Back',exact:true}).click();await expect(page.getByRole('searchbox')).toHaveValue('luna');await expect(page.getByRole('button',{name:'Albums',exact:true})).toHaveAttribute('aria-pressed','true');expect(errors).toEqual([]);
});
test('artist discography precedes songs, all releases retain artist ID, saved resources survive reload',async({page})=>{
 await fixture(page,{withLibrary:true});await search(page);await page.getByRole('button',{name:'Open artist: Luna Vale',exact:true}).click();await expect(page.getByRole('heading',{name:'Luna Vale',exact:true})).toBeVisible();
 const heads=await page.locator('.ios-catalog-page h2').allTextContents();expect(heads.slice(0,3)).toEqual(['Albums','Singles & EPs','Songs']);
 await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByRole('button',{name:'Saved',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'See all',exact:true}).first().click();await expect(page.locator('.ios-catalog-page .ios-resource')).toHaveCount(9);
 expect(await page.evaluate(()=>(window as any).__iosOperations.findLast((op:any)=>op.operation==='releases').id)).toBe('fixture-artist');
 await page.getByRole('button',{name:'Open album: Night scenes',exact:true}).click();await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByRole('button',{name:'Saved',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Library',exact:true}).click();await expect(page.getByRole('button',{name:'Open artist: Luna Vale',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Open album: Night scenes',exact:true})).toBeVisible();await page.reload();await page.getByRole('button',{name:'Library',exact:true}).click();await expect(page.getByRole('button',{name:'Open artist: Luna Vale',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).__iosLibrary().follows.length)).toBe(2);expect(await page.evaluate(()=>(window as any).__iosOperations.filter((op:any)=>op.method==='playTracks').length)).toBe(0);
});
test('player album and credited artist links navigate without restarting audio',async({page})=>{
 await fixture(page,{withLibrary:true});await page.getByRole('button',{name:'Open player: After the rain'}).first().click();await page.locator('.ios-player-album button').click();await expect(page.getByRole('heading',{name:'Night scenes'})).toBeVisible();
 await page.getByRole('button',{name:'Open player: After the rain'}).click();await page.locator('.ios-player-artist button').click();await expect(page.getByRole('heading',{name:'Luna Vale',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).__iosOperations.filter((op:any)=>op.method==='playTracks'||op.type).length)).toBe(0);
});
test('metadata waits for playback, recovers bounded busy errors, refreshes and rejects stale responses',async({page})=>{
 await fixture(page,{withLibrary:true});await page.evaluate(()=>(window as any).__iosEmit({loading:true}));await page.getByRole('button',{name:'Search',exact:true}).click();await page.getByRole('searchbox').fill('luna');await expect(page.getByText('Waiting for playback to finish loading…')).toBeVisible();
 expect(await page.evaluate(()=>(window as any).__iosOperations.filter((op:any)=>op.method==='catalog').length)).toBe(0);
 await page.evaluate(()=>{(window as any).__iosCatalogBusy=true;(window as any).__iosEmit({loading:false});});await expect(page.getByText('Playback has priority. Try again in a moment.')).toBeVisible();
 expect(await page.evaluate(()=>(window as any).__iosOperations.filter((op:any)=>op.method==='catalog').length)).toBe(4);
 await page.evaluate(()=>{(window as any).__iosCatalogBusy=false;});await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.getByRole('button',{name:'Open artist: Luna Vale',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).__iosOperations.findLast((op:any)=>op.method==='catalog').refresh)).toBe(true);
 await page.getByRole('searchbox').fill('slower');await page.waitForTimeout(400);await page.getByRole('searchbox').fill('empty');await expect(page.getByRole('heading',{name:'No results here'})).toBeVisible();await page.waitForTimeout(700);await expect(page.getByRole('heading',{name:'No results here'})).toBeVisible();
});
test('compact and large text catalog remain readable and keyboard reachable',async({page})=>{
 await page.setViewportSize({width:375,height:667});const errors=await fixture(page,{withLibrary:true,scale:1.6});await search(page);await page.getByRole('button',{name:'Albums',exact:true}).click();await page.getByRole('button',{name:'Open album: Night scenes',exact:true}).click();await expect(page.getByRole('heading',{name:'Night scenes',exact:true})).toBeVisible();
 expect(await page.locator('.ios-content').evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);
 const result=await new AxeBuilder({page}).include('.ios-app').withTags(['wcag2a','wcag2aa']).analyze();expect(result.violations).toEqual([]);expect(errors).toEqual([]);
});
