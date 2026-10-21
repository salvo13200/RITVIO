import mobilePackage from '../apps/mobile/package.json' with {type:'json'};
import desktopPackage from '../package.json' with {type:'json'};
import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {fixture} from './helpers/mobile-fixture';
import {mkdir,writeFile} from 'node:fs/promises';
const endpoint='https://api.github.com/repos/salvo13200/RITVIO/releases?per_page=30';
function releases(platform:'android'|'windows',version:string,preview=false){
 const tag=`${platform}-v${version}`,name=platform==='android'?`RITVIO-Android-${version}.apk`:`RITVIO-${version}-setup.exe`,base='https://github.com/salvo13200/RITVIO';
 return [{draft:false,prerelease:preview,tag_name:tag,html_url:`${base}/releases/tag/${tag}`,body:'A simpler way to keep RITVIO up to date. Your library stays on this device.',assets:[{name,state:'uploaded',size:100,browser_download_url:`${base}/releases/download/${tag}/${name}`}]}];
}
async function desktop(page:Page){
 await page.addInitScript(()=>{window.__RITVIO_TEST_CONFIG__={baseUrl:'http://127.0.0.1:5199',token:'test-token-only'};localStorage.setItem('ritvio.language.v1',JSON.stringify({schema:1,preference:'en'}));(window as any).__openedUpdate=null;window.open=((url:string)=>{(window as any).__openedUpdate=url;return null;}) as any;});
 await page.goto('http://127.0.0.1:5173');await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('tab',{name:'Updates',exact:true}).click();
}
async function mobile(page:Page){
 await page.setViewportSize({width:393,height:852});await fixture(page,{language:'en'});await page.getByRole('button',{name:'Settings',exact:true}).click();
}
test('desktop checks only on request, opens the official installer and keeps update options after reload',async({page})=>{
 let requests=0;await page.route(endpoint,route=>{requests++;return route.fulfill({json:releases('windows','1.1.0')});});
 await desktop(page);const section=page.locator('.update-settings');await expect(section).toContainText(`Installed version: ${desktopPackage.version}`);expect(requests).toBe(0);
 await section.getByRole('button',{name:'Check for updates',exact:true}).click();await expect(section).toContainText('RITVIO 1.1.0 is available');
 await section.getByRole('button',{name:'Download update',exact:true}).click();expect(await page.evaluate(()=>(window as any).__openedUpdate)).toMatch(/windows-v1\.1\.0\/RITVIO-1\.1\.0-setup\.exe$/);
 await section.getByRole('checkbox',{name:/Check at startup/}).check();await expect(section.getByRole('checkbox',{name:/Check at startup/})).toBeChecked();
 await page.evaluate(()=>document.fonts.ready);
 const session=await page.context().newCDPSession(page);await session.send('DOM.enable');await session.send('CSS.enable');const domDocument=await session.send('DOM.getDocument');const node=await session.send('DOM.querySelector',{nodeId:domDocument.root.nodeId,selector:'.update-title'});const used=await session.send('CSS.getPlatformFontsForNode',{nodeId:node.nodeId});await session.detach();
 await writeFile('test-results/updates/desktop-font.json',JSON.stringify(used,null,2));expect(used.fonts.some(font=>font.familyName.includes('Ancizar Sans')&&font.isCustomFont)).toBe(true);
 await page.screenshot({path:'.impeccable/review/updates-desktop.png',animations:'disabled'});
 expect((await new AxeBuilder({page}).include('.preferences-page').analyze()).violations).toEqual([]);
 await page.reload();await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('tab',{name:'Updates',exact:true}).click();await expect(page.locator('.update-settings').getByRole('checkbox',{name:/Check at startup/})).toBeChecked();expect(requests).toBe(1);
});
test('Android settings use a separate preview channel and never issue playback commands',async({page})=>{
 test.setTimeout(120000);
 let requests=0;await page.route(endpoint,route=>{requests++;return route.fulfill({json:releases('android','1.5.0',true)});});
 await mobile(page);const section=page.locator('.update-settings');await expect(section).toContainText(`Installed version: ${mobilePackage.version}`);expect(requests).toBe(0);
 await section.getByRole('button',{name:'Check for updates',exact:true}).click();await expect(section).toContainText('No newer release found on this channel.');
 await section.getByRole('checkbox',{name:/Include preview releases/}).check();await expect(section).toContainText('RITVIO 1.5.0 is available');await expect(section.getByText('Preview release',{exact:true})).toBeVisible();
 await section.getByRole('button',{name:'Download update',exact:true}).click();expect(await page.evaluate(()=>(window as any).__testOpenedUpdate)).toMatch(/android-v1\.5\.0\/RITVIO-Android-1\.5\.0\.apk$/);
 await section.scrollIntoViewIfNeeded();await page.screenshot({path:'.impeccable/review/updates-mobile.png',animations:'disabled'});
 await test.step('scan update settings accessibility',async()=>{expect((await new AxeBuilder({page}).include('.update-settings').analyze()).violations).toEqual([]);});
 expect(await page.evaluate(()=>(window as any).__mobileOperations.filter((o:any)=>['command','playTracks'].includes(o.method)))).toHaveLength(0);
 await page.getByRole('button',{name:'Close Settings',exact:true}).click();await expect(page.locator('.update-notice')).toBeVisible();await page.locator('.update-notice').getByRole('button',{name:'Hide notification for this version'}).click();await expect(page.locator('.update-notice')).toHaveCount(0);
 await page.reload();await expect(page.locator('.update-notice')).toHaveCount(0);expect(requests).toBe(1);
});
test('offline checks keep the controls usable and reduced motion does not animate the indicator',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.route(endpoint,route=>route.abort('internetdisconnected'));await mobile(page);
 const section=page.locator('.update-settings');await section.getByRole('button',{name:'Check for updates',exact:true}).click();await expect(section.getByRole('status')).toContainText('Could not reach GitHub');await expect(section.getByRole('button',{name:'Check for updates',exact:true})).toBeEnabled();
 await section.getByRole('checkbox',{name:/Check at startup/}).check();await expect(section.getByRole('checkbox',{name:/Check at startup/})).toBeChecked();
 expect(await page.locator('.update-spinning').count()).toBe(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('mobile large text and desktop light theme keep the new settings within their surface',async({page})=>{
 await page.route(endpoint,route=>route.fulfill({json:releases('android','1.5.0')}));await mobile(page);await page.evaluate(()=>document.documentElement.style.fontSize='150%');
 const section=page.locator('.update-settings');await section.getByRole('button',{name:'Check for updates',exact:true}).click();await expect(section).toContainText('RITVIO 1.5.0 is available');await section.getByRole('checkbox',{name:/Check at startup/}).scrollIntoViewIfNeeded();expect(await section.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await page.screenshot({path:'.impeccable/review/updates-mobile-large.png',animations:'disabled'});
 await page.setViewportSize({width:1440,height:940});await desktop(page);await page.getByRole('tab',{name:'Appearance',exact:true}).click();await page.getByRole('button',{name:'Dark',exact:true}).click();await page.getByRole('tab',{name:'Updates',exact:true}).click();
 await page.screenshot({path:'.impeccable/review/updates-desktop-light.png',animations:'disabled'});expect((await new AxeBuilder({page}).include('.update-settings').analyze()).violations).toEqual([]);
});
test.beforeAll(async()=>{await mkdir('.impeccable/review',{recursive:true});});
