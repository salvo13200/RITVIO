import {test,expect,type Page} from '@playwright/test';
import {fixture} from './helpers/mobile-fixture';
import {mkdir} from 'node:fs/promises';
const output='test-results/android-artwork';
async function loaded(page:Page,selector:string){await expect.poll(()=>page.locator(selector).evaluate((image:HTMLImageElement)=>image.complete&&image.naturalWidth>0)).toBe(true);}
async function calls(page:Page){return page.evaluate(()=>(window as any).__mobileOperations as any[]);}
test('track cover changes persist, can be restored, and never issue playback commands',async({page})=>{
 await fixture(page);await page.getByRole('button',{name:/Apri il player:/}).click();const player=page.locator('.full-player');
 await player.getByRole('button',{name:'Cambia copertina brano'}).click();await expect(player.locator('.player-cover img')).toHaveAttribute('src',/custom-cover/);
 expect((await calls(page)).filter(c=>['command','playTracks'].includes(c.method))).toHaveLength(0);
 await mkdir(output,{recursive:true});await loaded(page,'.player-cover img');await page.screenshot({path:output+'/player-custom-cover.png'});
 await page.getByRole('button',{name:'Chiudi il player'}).click();await page.reload();await expect(page.locator('.compact-player img')).toHaveAttribute('src',/custom-cover/);
 await page.getByRole('button',{name:'Libreria',exact:true}).click();await page.getByRole('button',{name:/Di notte/}).click();await page.locator('.playlist-page').getByRole('button',{name:'Opzioni: A luci spente'}).click();await page.getByRole('button',{name:'Ripristina copertina brano'}).click();await expect(page.locator('.sheet-track img')).not.toHaveAttribute('src',/custom-cover/);
});
test('playlist cover can be changed, survives restart and is removed independently of song artwork',async({page})=>{
 await fixture(page);await page.getByRole('button',{name:'Libreria',exact:true}).click();await page.getByRole('button',{name:/Di notte/}).click();
 await page.getByRole('button',{name:'Cambia copertina playlist'}).click();await expect(page.locator('.detail-hero>.artwork img')).toHaveAttribute('src',/custom-cover/);
 await mkdir(output,{recursive:true});await loaded(page,'.detail-hero>.artwork img');await page.screenshot({path:output+'/playlist-cover.png'});
 await page.reload();await page.getByRole('button',{name:'Libreria',exact:true}).click();await page.getByRole('button',{name:/Di notte/}).click();await expect(page.locator('.detail-hero>.artwork img')).toHaveAttribute('src',/custom-cover/);
 await page.getByRole('button',{name:'Rinomina playlist'}).click();await page.getByRole('button',{name:'Ripristina copertina playlist'}).click();await page.getByRole('button',{name:'Chiudi Rinomina playlist'}).click();await expect(page.locator('.detail-hero>.artwork img')).not.toHaveAttribute('src',/custom-cover/);
 expect((await calls(page)).filter(c=>['command','playTracks'].includes(c.method))).toHaveLength(0);
});
test('cancelling or failing the photo picker preserves artwork and playback',async({page})=>{
 await fixture(page);await page.getByRole('button',{name:/Apri il player:/}).click();const art=page.locator('.player-cover img'),before=await art.getAttribute('src');
 await page.evaluate(()=>{(window as any).__artworkCancelled=true;});await page.getByRole('button',{name:'Cambia copertina brano'}).click();await expect(art).toHaveAttribute('src',before!);
 await page.evaluate(()=>{(window as any).__artworkCancelled=false;(window as any).__artworkFailed=true;});await page.getByRole('button',{name:'Cambia copertina brano'}).click();await expect(page.getByRole('status')).toHaveText('Invalid image');await expect(art).toHaveAttribute('src',before!);
});
test('only Play indicates buffering in both full and compact players; real errors remain actionable',async({page})=>{
 await fixture(page);await page.evaluate(()=>{const w=window as any;w.__mobileState().loading=true;w.__mobileUpdate();});
 await expect(page.locator('.compact-player small')).toHaveText('Luna Riva');await expect(page.locator('.compact-play')).toHaveAttribute('aria-busy','true');
 await page.getByRole('button',{name:/Apri il player:/}).click();await expect(page.locator('.play-primary')).toHaveAttribute('aria-busy','true');await expect(page.locator('.playback-note')).toHaveCount(0);
 await page.evaluate(()=>{const w=window as any;w.__mobileState().error='Il flusso audio non è disponibile. Riprova o scegli un altro brano.';w.__mobileUpdate();});await expect(page.getByRole('alert')).toBeVisible();await expect(page.locator('.full-player').getByRole('button',{name:'Riprova',exact:true})).toBeVisible();
});
test('genres and moods open provider playlists and real tracks without triggering playback until requested',async({page})=>{
 await fixture(page);await page.getByRole('button',{name:'Cerca',exact:true}).click();await page.locator('.search-page').getByRole('button',{name:'Pop',exact:true}).click();await expect(page.locator('.browse-page h1')).toHaveText('Pop');await page.getByRole('button',{name:'Pop per te'}).click();await expect(page.locator('.browse-page .track-row')).toHaveCount(3);
 expect((await calls(page)).filter(c=>c.method==='playTracks')).toHaveLength(0);await page.locator('.browse-page').getByRole('button',{name:'Ascolta',exact:true}).click();expect((await calls(page)).filter(c=>c.method==='playTracks')).toHaveLength(1);
 await page.getByRole('button',{name:'Indietro',exact:true}).click();await page.getByRole('button',{name:'Indietro',exact:true}).click();await page.locator('.search-page').getByRole('button',{name:'Concentrazione',exact:true}).click();await expect(page.getByRole('button',{name:'Concentrazione profonda'})).toBeVisible();
 await mkdir(output,{recursive:true});await page.screenshot({path:output+'/mood-playlists.png'});
});
test('unavailable high resolution cover falls back once and later track changes recover',async({page})=>{
 await fixture(page);await page.route('**/maxresdefault.jpg*',route=>route.fulfill({status:404,body:''}));await page.evaluate(()=>{const w=window as any;w.__mobileState().items.forEach((item:any)=>item.thumbnail+='?fallback-test');w.__mobileUpdate();});await page.getByRole('button',{name:/Apri il player:/}).click();await expect(page.locator('.player-cover img')).toHaveAttribute('src',/hqdefault.jpg/);await expect(page.locator('.player-cover img')).toBeVisible();
 await page.evaluate(()=>{const w=window as any;w.__mobileState().index=1;w.__mobileUpdate();});await expect(page.locator('.player-cover img')).toHaveAttribute('src',/12345678901\/hqdefault/);
});
