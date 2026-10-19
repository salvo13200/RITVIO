import {test,expect} from '@playwright/test';
import {fixture} from './helpers/mobile-fixture';

test('lyrics use actual player duration when catalog duration is missing',async({page})=>{
 await fixture(page);
 await page.evaluate(()=>{const w=window as any;w.__mobileState().items[0].duration=0;w.__mobileUpdate();});
 await page.getByRole('button',{name:/Apri il player:/}).click();await page.getByRole('button',{name:'Testi',exact:true}).click();
 await expect(page.getByRole('button',{name:/Vai a 1:40: Terza riga/})).toBeVisible();
 const calls=await page.evaluate(()=>(window as any).__mobileOperations as any[]);
 expect(calls.find(o=>o.method==='lyrics').track.duration).toBe(222);
 expect(calls.filter(o=>o.method==='playTracks'||o.method==='command')).toHaveLength(0);
});

test('plain-only lyrics are visible without fake synchronized controls',async({page})=>{
 await fixture(page);await page.evaluate(()=>{(window as any).__mobileNative.lyrics=async()=>({plainLyrics:'Verso di prova uno\nVerso di prova due',syncedLyrics:null,instrumental:false});});
 await page.getByRole('button',{name:/Apri il player:/}).click();await page.getByRole('button',{name:'Testi',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Testi',exact:true});await expect(dialog.locator('.plain-lyrics')).toContainText('Verso di prova uno');await expect(dialog.getByRole('button',{name:/Vai a /})).toHaveCount(0);
 const font=await dialog.locator('.plain-lyrics').evaluate(el=>parseFloat(getComputedStyle(el).fontSize));await dialog.getByRole('button',{name:'Leggibilità del testo'}).click();await dialog.getByRole('radio',{name:'Molto grande',exact:true}).check();expect(await dialog.locator('.plain-lyrics').evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThan(font);await expect(dialog.getByRole('button',{name:'Riprendi scorrimento'})).toHaveCount(0);
});

test('provider cooldown is distinguished from a missing lyric',async({page})=>{
 await fixture(page);await page.evaluate(()=>{(window as any).__mobileNative.lyrics=async()=>{throw Object.assign(new Error('Limited'),{code:'LYRICS_RATE_LIMIT'});};});
 await page.getByRole('button',{name:/Apri il player:/}).click();await page.getByRole('button',{name:'Testi',exact:true}).click();
 await expect(page.getByText('La fonte dei testi richiede una pausa. Riprova tra poco.')).toBeVisible();
 await expect(page.getByText('Testo non trovato per questo brano.')).toHaveCount(0);
});

test('retry after missing lyrics requests fresh data and preserves playback',async({page})=>{
 await fixture(page);await page.evaluate(()=>{(window as any).__storyNoLyrics=true;});
 await page.getByRole('button',{name:/Apri il player:/}).click();await page.getByRole('button',{name:'Testi',exact:true}).click();
 await expect(page.getByText('Testo non trovato per questo brano.')).toBeVisible();
 await page.evaluate(()=>{(window as any).__storyNoLyrics=false;});await page.getByRole('button',{name:'Riprova',exact:true}).click();
 await expect(page.getByRole('button',{name:/Vai a 1:40: Terza riga/})).toBeVisible();
 const result=await page.evaluate(()=>({calls:(window as any).__mobileOperations,state:(window as any).__mobileState()}));
 expect(result.calls.filter((o:any)=>o.method==='lyrics')).toHaveLength(2);expect(result.state.position).toBe(84);expect(result.state.playing).toBe(true);
});

test('duration becoming available invalidates the plain-only in-memory result',async({page})=>{
 await fixture(page);await page.evaluate(()=>{const w=window as any;w.__mobileState().items[0].duration=0;w.__mobileState().duration=0;w.__mobileUpdate();w.__mobileNative.lyrics=async(input:any)=>{w.__mobileOperations.push({method:'lyrics',...input});return input.track.duration?{plainLyrics:null,syncedLyrics:'[00:01.00]Testo sincronizzato',instrumental:false}:{plainLyrics:'Testo senza tempi',syncedLyrics:null,instrumental:false};};});
 await page.getByRole('button',{name:/Apri il player:/}).click();await page.getByRole('button',{name:'Testi',exact:true}).click();await expect(page.locator('.plain-lyrics')).toContainText('Testo senza tempi');
 await page.evaluate(()=>{const w=window as any;w.__mobileState().duration=200;w.__mobileUpdate();});
 await expect(page.getByRole('button',{name:/Vai a 0:01: Testo sincronizzato/})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).__mobileOperations.filter((o:any)=>o.method==='lyrics').map((o:any)=>o.track.duration))).toEqual([0,200]);
});
