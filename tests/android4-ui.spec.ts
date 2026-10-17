import {test,expect,type Page} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {fixture} from './helpers/mobile-fixture';


async function openRadio(page:Page){await page.getByRole('button',{name:'Cerca',exact:true}).click();await page.getByRole('searchbox').fill('Luna Riva');await page.getByRole('button',{name:'Opzioni: A luci spente'}).click();await page.getByRole('button',{name:'Radio del brano',exact:true}).click();return page.getByRole('dialog',{name:'Radio del brano',exact:true});}
async function openQueue(page:Page){await page.getByRole('button',{name:/Apri il player:/}).click();await page.getByRole('button',{name:'Apri coda'}).click();return page.getByRole('dialog',{name:'Coda',exact:true});}
async function state(page:Page){return page.evaluate(()=>(window as any).__mobileState());}

test('autoplay is off by default and enabling it preserves the current audio',async({page})=>{
 await fixture(page);const dialog=await openQueue(page);const control=dialog.getByRole('switch',{name:'Autoplay'});await expect(control).toHaveAttribute('aria-checked','false');await control.click();await expect(control).toHaveAttribute('aria-checked','true');expect((await state(page)).position).toBe(84);expect((await state(page)).playing).toBe(true);await page.reload();await expect(page.getByRole('switch',{name:'Autoplay'})).toHaveAttribute('aria-checked','true');
});
test('radio starts only after preparation and preserves existing audio while pending',async({page})=>{
 await fixture(page);await page.evaluate(()=>{(window as any).__radioDeferred=true;});const dialog=await openRadio(page);await dialog.getByRole('button',{name:'Avvia radio'}).click();await expect(dialog.getByRole('button',{name:'Preparo la radio…'})).toBeDisabled();expect((await state(page)).position).toBe(84);expect((await state(page)).items).toHaveLength(2);
 await page.evaluate(()=>(window as any).__mobileCompleteRadio());await expect(dialog.getByText('La radio è pronta.')).toBeVisible();const s=await state(page);expect(s.discovery.enabled).toBe(true);expect(s.items[0].title).toBe('A luci spente');expect(s.items).toHaveLength(3);expect(s.position).toBe(0);expect(s.repeat).toBe('off');
});
test('closing a pending radio prevents a late reply from replacing the queue',async({page})=>{
 await fixture(page);await page.evaluate(()=>{(window as any).__radioDeferred=true;});const dialog=await openRadio(page);await dialog.getByRole('button',{name:'Avvia radio'}).click();await dialog.getByRole('button',{name:'Chiudi Radio del brano'}).click();await expect(dialog).toHaveCount(0);await page.evaluate(()=>(window as any).__mobileCompleteRadio());expect((await state(page)).position).toBe(84);expect((await state(page)).items).toHaveLength(2);expect((await state(page)).discovery.enabled).toBe(false);
});
test('turning off autoplay keeps current and manually added duplicate occurrences',async({page})=>{
 await fixture(page,{queueLength:4});await page.evaluate(()=>{const s=(window as any).__mobileState();s.items[1]={...s.items[2]};s.automatic=[1,3];s.discovery.enabled=true;(window as any).__mobileUpdate();});const dialog=await openQueue(page);await expect(dialog.locator('.queue-source')).toHaveCount(2);await dialog.getByRole('switch',{name:'Autoplay'}).click();const s=await state(page);expect(s.items.map((t:any)=>t.title)).toEqual(['A luci spente','Fiori d’inverno']);expect(s.position).toBe(84);expect(s.playing).toBe(true);
});
test('empty radio and provider failure do not replace or restart the queue',async({page})=>{
 await fixture(page);await page.evaluate(()=>{(window as any).__radioResult='empty';});const dialog=await openRadio(page);await dialog.getByRole('button',{name:'Avvia radio'}).click();await expect(dialog.getByRole('status')).toContainText('Nessun nuovo suggerimento');expect((await state(page)).position).toBe(84);expect((await state(page)).items).toHaveLength(2);
 await page.evaluate(()=>{(window as any).__radioResult='error';});await dialog.getByRole('button',{name:'Avvia radio'}).click();await expect(dialog.getByRole('button',{name:/Riprova tra/})).toBeDisabled();expect((await state(page)).position).toBe(84);
});
test('captures radio and autoplay sheets at phone widths with explicit browser provenance',async({page})=>{
 const output=process.env.RITVIO_ANDROID10==='1'?'test-results/visual/android-10/regression-android4-ui.spec':process.env.RITVIO_ANDROID8==='1'?'test-results/visual/android-8/regression-radio':process.env.RITVIO_ANDROID7==='1'?'test-results/visual/android-7/regression-radio':process.env.RITVIO_MOBILE_REVIEW==='1'?'test-results/visual/android-review/regression-radio':test.info().config.configFile?.match(/android[56]/)?'test-results/visual/android-6/regression-radio':'test-results/visual/android-4';
 await fixture(page);await mkdir(output,{recursive:true});await page.evaluate(()=>document.fonts.load('16px "Ancizar Sans"'));const radio=await openRadio(page);await expect(radio).toHaveCSS('opacity','1');await page.screenshot({path:`${output}/web-radio-393.png`,animations:'disabled'});await radio.getByRole('button',{name:'Chiudi Radio del brano'}).click();await page.getByRole('button',{name:'Chiudi Opzioni del brano'}).click();const queue=await openQueue(page);await queue.getByRole('switch',{name:'Autoplay'}).click();await page.screenshot({path:`${output}/web-autoplay-393.png`,animations:'disabled'});await page.setViewportSize({width:360,height:740});await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>{const s=(window as any).__mobileState();s.discovery.suspended='timer';(window as any).__mobileUpdate();});await page.screenshot({path:`${output}/web-autoplay-timer-360.png`,animations:'disabled'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
