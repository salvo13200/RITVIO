import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {mkdir} from 'node:fs/promises';
import {ritvioTrackLink} from '../packages/domain/track-sharing';
const output='.impeccable/review/a5';
const fragment=new URL(ritvioTrackLink({videoId:'abcdefghijk',title:'After the rain',artist:'Luna Vale'})).hash;
test.beforeAll(()=>mkdir(output,{recursive:true}));
test('song reference shows the source and official downloads without a provider request',async({page})=>{
 const external:string[]=[];page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:5180'))external.push(r.url());});
 await page.goto('/RITVIO/'+fragment);await expect(page.getByRole('heading',{name:'After the rain',exact:true})).toBeVisible();await expect(page.locator('#shared-song-artist')).toHaveText('Luna Vale');
 await expect(page.getByRole('link',{name:'Listen on YouTube'})).toHaveAttribute('href','https://www.youtube.com/watch?v=abcdefghijk');
 await expect(page.locator('[data-download=android]')).toBeVisible();await expect(page.locator('[data-download=windows]')).toBeVisible();
 expect(external).toEqual([]);expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
 await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:output+'/desktop.png',animations:'disabled'});
 await page.getByRole('link',{name:'Explore RITVIO',exact:true}).click();await expect(page.getByRole('heading',{name:'Your music. With you.'})).toBeVisible();
});
test('mobile reference remains readable at narrow width, with enlarged text and literal metadata',async({page})=>{
 await page.setViewportSize({width:393,height:852});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/RITVIO/'+fragment);await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:output+'/mobile.png',animations:'disabled'});
 const title='<img src=x onerror=alert(1)> '+ 'A long song title '.repeat(10);
 await page.goto('/RITVIO/'+new URL(ritvioTrackLink({videoId:'abcdefghijk',title,artist:'An artist with a long name '.repeat(6)})).hash);
 await page.setViewportSize({width:320,height:852});await page.evaluate(()=>document.documentElement.style.fontSize='150%');
 expect(await page.locator('.shared-song img').count()).toBe(0);await expect(page.locator('#shared-song-title')).toContainText('<img src=x');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);await page.screenshot({path:output+'/mobile-long.png',animations:'disabled'});
});
test('invalid parameters fall back safely, and missing metadata has a useful source link',async({page})=>{
 for(const hash of ['#track=../invalid','#track=abcdefghijk&redirect=https://evil.invalid','#track=abcdefghijk&track=12345678901']){
  await page.goto('/RITVIO/'+hash);await expect(page.locator('#shared-song-error')).toBeVisible();await expect(page.locator('#shared-song-source')).toBeHidden();await expect(page.locator('[data-download=android]')).toBeVisible();
 }
 await page.goto('/RITVIO/#track=abcdefghijk');await expect(page.getByRole('heading',{name:'A song for you'})).toBeVisible();await expect(page.locator('#shared-song-artist')).toHaveText('Track reference: abcdefghijk');
});
test('shared reference has an honest no-JavaScript fallback and retains static downloads',async({browser})=>{
 const context=await browser.newContext({javaScriptEnabled:false});const page=await context.newPage();await page.goto('http://127.0.0.1:5180/RITVIO/'+fragment);
 await expect(page.getByText('Opening a shared song?',{exact:false})).toBeVisible();await expect(page.locator('[data-download=android]')).toBeVisible();await expect(page.locator('#shared-song-source')).toBeHidden();await context.close();
});
