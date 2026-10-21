import desktopPackage from '../package.json' with {type:'json'};
import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {mkdir} from 'node:fs/promises';
import {isSupportUrl} from '../packages/domain/support';
async function open(page:Page){
 await page.addInitScript(()=>{window.__RITVIO_TEST_CONFIG__={baseUrl:'http://127.0.0.1:5199',token:'test-token-only'};localStorage.setItem('ritvio.language.v1',JSON.stringify({schema:1,preference:'en'}));(window as any).__helpUrls=[];window.open=((url:string)=>{(window as any).__helpUrls.push(url);return null;}) as any;});
 await page.goto('/');await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('tab',{name:'Help',exact:true}).click();return page.locator('.support-settings');
}
test('desktop report is inspectable, opt-in and opens only context-prefilled forms',async({page,context})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);let reads=0;
 await page.route('**/v1/playback/diagnostics',route=>{reads++;return route.fulfill({json:{cacheHits:5,resolver:{networkResolutions:2},title:'PRIVATE TITLE',token:'PRIVATE TOKEN',url:'https://private.invalid/signed'}});});
 const section=await open(page);expect(reads).toBe(0);const preview=section.getByRole('textbox',{name:'Review your report'});expect(JSON.parse(await preview.inputValue())).toEqual({schema:1,app:'RITVIO',platform:'windows',version:desktopPackage.version,kind:'bug'});
 await section.getByRole('checkbox',{name:/Include playback timings/}).check();await expect(preview).toHaveValue(/"cacheHits": 5/);expect(await preview.inputValue()).not.toContain('PRIVATE');expect(await preview.inputValue()).not.toContain('private.invalid');expect(reads).toBe(1);
 await section.getByRole('button',{name:'Copy report',exact:true}).click();expect(await page.evaluate(()=>navigator.clipboard.readText()).then(s=>s.replace(/\r\n/g,'\n'))).toBe(await preview.inputValue());
 for(const kind of ['bug','visual','idea']){await section.getByLabel('What would you like to send?').selectOption(kind);await section.getByRole('button',{name:'Continue on GitHub',exact:true}).click();await expect(section.getByRole('status')).toHaveText('GitHub form requested. Review and submit it there.');}
 const urls=await page.evaluate(()=>(window as any).__helpUrls as string[]);expect(urls).toHaveLength(3);for(const url of urls){expect(isSupportUrl(url)).toBe(true);expect(url).not.toContain('cacheHits');}
 await section.getByRole('button',{name:'Check existing reports',exact:true}).click();expect((await page.evaluate(()=>(window as any).__helpUrls)).at(-1)).toBe('https://github.com/salvo13200/RITVIO/issues');await expect(section.getByRole('status')).toHaveText('Existing reports requested. Browse them on GitHub.');
 expect((await new AxeBuilder({page}).include('.preferences-page').analyze()).violations).toEqual([]);
 await mkdir('.impeccable/review/a6',{recursive:true});await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:'.impeccable/review/a6/desktop.png',animations:'disabled'});
});
test('desktop failures can recover and enlarged light-theme help stays contained',async({page})=>{
 let fail=true;await page.route('**/v1/playback/diagnostics',route=>fail?route.abort():route.fulfill({json:{cacheHits:2}}));const section=await open(page);
 await section.getByRole('checkbox',{name:/Include playback timings/}).check();await expect(section.getByRole('alert')).toContainText('Could not read timings');fail=false;await section.getByRole('button',{name:'Retry',exact:true}).click();await expect(section.getByRole('textbox')).toHaveValue(/cacheHits/);
 await page.setViewportSize({width:820,height:940});await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>{document.documentElement.style.fontSize='150%';document.documentElement.dataset.theme='light';});
 expect(await section.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);expect((await new AxeBuilder({page}).include('.support-settings').analyze()).violations).toEqual([]);
 await page.evaluate(()=>document.fonts.ready);expect(await page.locator('.preference-tabs button').evaluateAll(buttons=>buttons.every(button=>button.scrollWidth<=button.clientWidth))).toBe(true);
 await page.screenshot({path:'.impeccable/review/a6/desktop-large.png',animations:'disabled'});
});
