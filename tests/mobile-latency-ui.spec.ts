import {test,expect} from '@playwright/test';
import {fixture} from './helpers/mobile-fixture';
import {mkdir} from 'node:fs/promises';

test('scrubbing previews many positions but sends one seek only on release',async({page})=>{
 await fixture(page);await page.getByRole('button',{name:/Apri il player:/}).click();const slider=page.getByRole('slider',{name:'Posizione del brano'});const bounds=await slider.boundingBox();expect(bounds).not.toBeNull();
 const calls=()=>page.evaluate(()=>(window as any).__mobileOperations.filter((call:any)=>call.method==='command'&&call.type==='seek'));
 await page.mouse.move(bounds!.x+5,bounds!.y+bounds!.height/2);await page.mouse.down();await page.mouse.move(bounds!.x+bounds!.width*.75,bounds!.y+bounds!.height/2,{steps:12});
 await expect(page.locator('.seek-tooltip')).toBeVisible();expect(await calls()).toHaveLength(0);await page.mouse.up();await expect.poll(async()=>(await calls()).length).toBe(1);expect((await calls())[0].value).toBeGreaterThan(140);
 await expect(page.locator('.seek-tooltip')).toHaveCount(0);
});

test('copying playback diagnostics keeps playback untouched and is available in English',async({page})=>{
 await fixture(page,{language:'en'});await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Copy playback diagnostics'}).click();
 await expect(page.getByRole('status')).toHaveText('Playback diagnostics copied');
 const operations=await page.evaluate(()=>(window as any).__mobileOperations);expect(operations.filter((call:any)=>call.method==='copyPlaybackDiagnostics')).toHaveLength(1);expect(operations.filter((call:any)=>['command','playTracks'].includes(call.method))).toHaveLength(0);
 await mkdir('test-results/android-latency',{recursive:true});await page.screenshot({path:'test-results/android-latency/settings-en.png'});
});

test('a clipboard failure is actionable without stopping music',async({page})=>{
 await fixture(page);await page.evaluate(()=>{(window as any).__diagnosticsError=true;});await page.getByRole('button',{name:'Impostazioni',exact:true}).click();await page.getByRole('button',{name:'Copia diagnostica audio'}).click();await expect(page.getByRole('status')).toHaveText('Could not copy diagnostics');
 expect(await page.evaluate(()=>(window as any).__mobileOperations.filter((call:any)=>['command','playTracks'].includes(call.method)))).toHaveLength(0);
});
