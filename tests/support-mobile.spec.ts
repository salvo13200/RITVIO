import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {mkdir} from 'node:fs/promises';
import {fixture} from './helpers/mobile-fixture';
const operations=(page:any)=>page.evaluate(()=>(window as any).__mobileOperations as any[]);
test('Android review/copy and all three help routes preserve playback without exposing private data',async({page})=>{
 await fixture(page,{language:'en'});await page.getByRole('button',{name:'Settings',exact:true}).click();const section=page.locator('.support-settings');
 expect((await operations(page)).filter((x:any)=>x.method==='readPlaybackDiagnostics')).toHaveLength(0);
 await section.getByRole('checkbox',{name:/Include playback timings/}).check();await expect(section.getByRole('textbox')).toHaveValue(/bufferedAheadMs/);
 const text=await section.getByRole('textbox').inputValue();for(const secret of ['PRIVATE','private','signed.invalid'])expect(text).not.toContain(secret);
 await section.getByRole('button',{name:'Copy report',exact:true}).click();await expect(section.getByRole('status')).toHaveText('Report copied');
 for(const kind of ['bug','visual','idea']){await section.getByLabel('What would you like to send?').selectOption(kind);await section.getByRole('button',{name:'Continue on GitHub',exact:true}).click();}
 const calls=await operations(page);expect(calls.filter((x:any)=>x.method==='supportOpen')).toHaveLength(3);expect(calls.find((x:any)=>x.method==='supportCopy').text).toBe(text);expect(calls.filter((x:any)=>['command','playTracks'].includes(x.method))).toHaveLength(0);
 await page.getByRole('button',{name:'Help & feedback',exact:true}).click();await expect(section.getByRole('heading')).toBeFocused();expect((await new AxeBuilder({page}).include('.support-settings').analyze()).violations).toEqual([]);await mkdir('.impeccable/review/a6',{recursive:true});await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:'.impeccable/review/a6/mobile.png',animations:'disabled'});
});
test('Android rejects late reads after opt-out or close and recovers copy/open failures',async({page})=>{
 await fixture(page,{language:'en'});await page.evaluate(()=>{const w=window as any;w.__mobileNative.readPlaybackDiagnostics=()=>new Promise(resolve=>{w.__finishTimings=()=>resolve({cacheHits:99});});});await page.getByRole('button',{name:'Settings',exact:true}).click();const section=page.locator('.support-settings'),box=section.getByRole('checkbox',{name:/Include playback timings/});
 await box.check();await box.uncheck();await page.evaluate(()=>(window as any).__finishTimings());await expect(section.getByRole('textbox')).not.toHaveValue(/playback/);
 await page.evaluate(()=>{(window as any).__diagnosticsError=true;});await section.getByRole('button',{name:'Copy report',exact:true}).click();await expect(section.getByRole('alert')).toContainText('Could not copy');await page.evaluate(()=>{(window as any).__diagnosticsError=false;(window as any).__supportOpenError=true;});await section.getByRole('button',{name:'Copy report',exact:true}).click();await expect(section.getByRole('status')).toHaveText('Report copied');await section.getByRole('button',{name:'Continue on GitHub',exact:true}).click();await expect(section.getByRole('alert')).toContainText('Could not open');
 await box.check();await page.getByRole('button',{name:'Close Settings',exact:true}).click();await page.evaluate(()=>(window as any).__finishTimings());await expect(page.locator('.support-settings')).toHaveCount(0);
});
test('Android help supports 320px, enlarged text, reduced motion and keyboard focus',async({page})=>{
 await fixture(page,{language:'en'});await page.setViewportSize({width:320,height:852});await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>document.documentElement.style.fontSize='150%');await page.getByRole('button',{name:'Settings',exact:true}).click();const section=page.locator('.support-settings');
 await section.getByRole('textbox').focus();expect(await section.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await new AxeBuilder({page}).include('.support-settings').analyze()).violations).toEqual([]);await page.screenshot({path:'.impeccable/review/a6/mobile-large.png',animations:'disabled'});
});
