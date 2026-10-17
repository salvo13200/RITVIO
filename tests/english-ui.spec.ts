import {test,expect} from '@playwright/test';
import {fixture} from './helpers/mobile-fixture';
const capture='test-results/visual/english-release';
async function english(page:import('@playwright/test').Page){await page.getByRole('button',{name:'Impostazioni',exact:true}).click();await page.getByRole('combobox',{name:'Lingua',exact:true}).selectOption('en');await expect(page.locator('html')).toHaveAttribute('lang','en');await expect(page.getByRole('combobox',{name:'Language',exact:true})).toHaveValue('en');}
test('English settings persist and navigation, filters, artist and album links work',async({page})=>{
 await fixture(page);await english(page);await page.screenshot({path:capture+'/mobile-settings-en.png',animations:'disabled'});
 await page.getByRole('button',{name:'Close Settings',exact:true}).click();await expect(page.getByRole('heading',{name:'Your listening continues'})).toBeVisible();await expect(page.locator('.home-weekly-shelf .cover-card').first()).toContainText('Global hits');await expect(page.locator('.home-weekly-shelf')).not.toContainText('Italy');await page.screenshot({path:capture+'/mobile-home-en.png',animations:'disabled'});
 await page.getByRole('navigation').getByRole('button',{name:'Search',exact:true}).click();await page.getByRole('searchbox').fill('Luna Riva');await expect(page.getByRole('button',{name:'Artists',exact:true})).toBeVisible();await page.getByRole('button',{name:'Artists',exact:true}).click();await expect(page.getByRole('button',{name:'Open artist: Luna Riva'})).toBeVisible();await page.getByRole('button',{name:'Open artist: Luna Riva'}).click();await expect(page.getByRole('heading',{name:'Discography'})).toBeVisible();
 await page.reload();await expect(page.locator('html')).toHaveAttribute('lang','en');await page.getByRole('navigation').getByRole('button',{name:'Library',exact:true}).click();await expect(page.getByRole('heading',{name:'Your library'})).toBeVisible();await page.getByRole('button',{name:'Albums',exact:true}).click();await expect(page.locator('.library-page .cover-card')).toHaveCount(1);
});

test('stored native audio errors remain readable and translate in both player layouts',async({page})=>{
 await fixture(page);await page.evaluate(()=>{const w=window as any;w.__mobileState().error='Il flusso audio non è disponibile. Riprova o scegli un altro brano.';w.__mobileUpdate();w.__mobileLanguage('en');});
 const translated='The audio stream is unavailable. Try again or choose another track.';
 await expect(page.locator('.audio-error>span')).toHaveText(translated);
 await page.getByRole('button',{name:/Open player:/}).click();await expect(page.locator('.player-status .inline-error>p')).toHaveText(translated);
 expect(await page.evaluate(()=>(window as any).__mobileOperations.filter((o:any)=>['command','playTracks'].includes(o.method)))).toHaveLength(0);
});

test('provider attribution appears in Settings and never under Home collections',async({page})=>{
 await fixture(page);await english(page);
 await expect(page.getByRole('heading',{name:'Sources and attribution'})).toBeVisible();
 await expect(page.locator('.settings-sources')).toContainText('YouTube Music');
 await page.getByRole('button',{name:'Close Settings',exact:true}).click();
 await expect(page.locator('.home-page')).not.toContainText(/YouTube|YT Music/i);
 await page.getByRole('button',{name:'Open collection: Global hits',exact:true}).click();
 await expect(page.locator('.detail-page')).not.toContainText(/YouTube|YT Music/i);
});
test('real mobile player stays mounted across English and Italian with queue and audio commands unchanged',async({page})=>{
 await fixture(page);await page.getByRole('button',{name:/Apri il player:/}).click();await expect(page.getByRole('dialog',{name:'In ascolto',exact:true})).toBeVisible();
 const before=await page.evaluate(()=>{const w=window as any;w.__enPlayer=document.querySelector('.full-player');w.__enArtwork=document.querySelector('.player-cover img');return JSON.stringify(w.__mobileState());});
 await page.evaluate(()=>(window as any).__mobileLanguage('en'));await expect(page.getByRole('dialog',{name:'Now playing',exact:true})).toBeVisible();await expect(page.getByRole('dialog',{name:'Now playing',exact:true}).getByRole('button',{name:'Next track',exact:true})).toBeVisible();await page.screenshot({path:capture+'/mobile-player-en.png',animations:'disabled'});
 expect(await page.evaluate(()=>{const w=window as any;return{state:JSON.stringify(w.__mobileState()),player:document.querySelector('.full-player')===w.__enPlayer,art:document.querySelector('.player-cover img')===w.__enArtwork,commands:w.__mobileOperations.filter((o:any)=>['command','playTracks'].includes(o.method)).length};})).toEqual({state:before,player:true,art:true,commands:0});
 await page.getByRole('button',{name:'Lyrics',exact:true}).click();await expect(page.getByRole('dialog',{name:'Lyrics',exact:true})).toBeVisible();await page.getByRole('button',{name:'Close Lyrics',exact:true}).click();await page.getByRole('button',{name:'Share',exact:true}).click();await expect(page.getByRole('dialog',{name:'Share track',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Save image',exact:true})).toBeVisible();
 await page.evaluate(()=>(window as any).__mobileLanguage('it'));await expect(page.locator('html')).toHaveAttribute('lang','it');await expect(page.getByRole('dialog',{name:'Condividi brano',exact:true})).toBeVisible();
});
