import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {publishedDownloads} from '../packages/releases/catalog';
const output='.impeccable/review/site';
async function settle(page:Page){await page.evaluate(()=>document.fonts.ready);expect(await page.evaluate(async()=>{for(const image of document.images)image.loading='eager';await Promise.all(Array.from(document.images).map(image=>image.decode().catch(()=>{})));return Array.from(document.images).every(image=>image.naturalWidth>0);})).toBe(true);await expect.poll(()=>page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running'&&a.effect?.getComputedTiming().iterations!==Infinity).length)).toBe(0);}
test('desktop download choices, real images, keyboard gallery and sharing stay accessible',async({page,request})=>{
 const errors:string[]=[],external:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:5180'))external.push(r.url());});
 await page.goto('/');await settle(page);
 const android=page.getByRole('link',{name:'Download Android APK',exact:true}),windows=page.getByRole('link',{name:'Download Windows installer',exact:true});
 await expect(android).toHaveAttribute('href',publishedDownloads.android.download);await expect(windows).toHaveAttribute('href',publishedDownloads.windows.download);
 await expect(page.locator('[data-platform=ios] [data-download=ios]')).toHaveAttribute('href',publishedDownloads.ios!.download);
 await expect(page.locator('[data-channel=ios]')).toHaveText('iOS beta');
 for(const link of [android,windows]){const box=await link.boundingBox();expect(box!.y+box!.height).toBeLessThan(1000);}
 expect(external).toEqual([]);await expect(page.getByRole('button',{name:'Check latest releases'})).toBeVisible();
 const assetLinks=await page.locator('a[href*="/assets/"]').evaluateAll(links=>links.map(a=>(a as HTMLAnchorElement).href));
 for(const url of assetLinks)expect((await request.get(url)).status(),url).toBe(200);
 await page.getByRole('tab',{name:'Library',exact:true}).focus();await page.keyboard.press('ArrowRight');await expect(page.getByRole('tab',{name:'Lyrics',exact:true})).toBeFocused();await expect(page.locator('#feature-image')).toHaveAttribute('src',/mobile-lyrics/);await page.keyboard.press('End');await expect(page.getByRole('tab',{name:'Queue',exact:true})).toHaveAttribute('aria-selected','true');
 await page.getByRole('tab',{name:'Library',exact:true}).click();await page.evaluate(()=>scrollTo(0,0));await settle(page);
 await page.screenshot({path:output+'/desktop-full.png',fullPage:true,animations:'disabled'});await page.screenshot({path:output+'/desktop-hero.png',animations:'disabled'});
 await page.locator('#sharing').screenshot({path:output+'/desktop-sharing.png',animations:'disabled'});
 expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);expect(errors).toEqual([]);
});
test('Android-sized page keeps primary download early and wraps at 320px',async({browser})=>{
 const context=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36'}),page=await context.newPage();
 await page.goto('http://127.0.0.1:5180/');await settle(page);await expect(page.locator('[data-platform=android] .recommended')).toBeVisible();await expect(page.locator('[data-platform=windows] .recommended')).toBeHidden();
 const box=await page.locator('[data-download=android]').boundingBox();expect(box!.y+box!.height).toBeLessThan(852);await expect(page.locator('[data-download=windows]')).toBeVisible();
 await page.screenshot({path:output+'/mobile-full.png',fullPage:true,animations:'disabled'});await page.screenshot({path:output+'/mobile-hero.png',animations:'disabled'});await page.locator('#sharing').screenshot({path:output+'/mobile-sharing.png',animations:'disabled'});
 expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
 await page.setViewportSize({width:320,height:740});await page.evaluate(()=>scrollTo(0,0));await settle(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:output+'/mobile-320.png',animations:'disabled'});await context.close();
});
test('static project subpath works without JavaScript, including both downloads and image links',async({browser,request})=>{
 const context=await browser.newContext({javaScriptEnabled:false,viewport:{width:393,height:852}}),page=await context.newPage();await page.goto('http://127.0.0.1:5180/RITVIO/');
 await expect(page.getByRole('heading',{name:'Your music. With you.'})).toBeVisible();await expect(page.locator('[data-download=android]')).toHaveAttribute('href',publishedDownloads.android.download);await expect(page.locator('[data-download=windows]')).toHaveAttribute('href',publishedDownloads.windows.download);await expect(page.locator('#refresh-releases')).toBeHidden();
 await page.getByText('Other Windows formats',{exact:true}).click();await expect(page.getByRole('link',{name:'Portable ZIP',exact:true})).toHaveAttribute('href',publishedDownloads.windows.portableZip!);
 for(const image of await page.locator('img').evaluateAll(imgs=>imgs.map(img=>(img as HTMLImageElement).src)))expect((await request.get(image)).status(),image).toBe(200);
 for(const link of await page.locator('a[href*="/assets/"]').evaluateAll(links=>links.map(a=>(a as HTMLAnchorElement).href)))expect((await request.get(link)).status(),link).toBe(200);
 expect((await request.get('http://127.0.0.1:5180/RITVIO/does-not-exist')).status()).toBe(404);await context.close();
});
test('release refresh fails gracefully and never replaces official links with untrusted data',async({page})=>{
 let calls=0;await page.route('https://api.github.com/repos/salvo13200/RITVIO/releases?per_page=30',route=>{calls++;return route.fulfill({status:200,json:[{tag_name:'android-v99.0.0',html_url:'https://evil.invalid',assets:[]}]});});await page.goto('/');
 await page.getByRole('button',{name:'Check latest releases'}).click();await expect(page.getByRole('status')).toContainText('Keeping the verified links');await expect(page.locator('[data-download=android]')).toHaveAttribute('href',publishedDownloads.android.download);
 await page.getByRole('button',{name:'Check latest releases'}).click();expect(calls).toBe(1);await expect(page.getByRole('status')).toContainText('Checked recently');
});
test('enlarged text, reduced motion and installation disclosures remain usable',async({page},testInfo)=>{
 await page.setViewportSize({width:393,height:852});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');await page.evaluate(()=>document.documentElement.style.fontSize='150%');await settle(page);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 for(const title of ['How do I install on Android?','Which Windows download should I choose?','Does my library sync across devices?']){await page.getByText(title,{exact:true}).click();await expect(page.locator('details[open]')).not.toHaveCount(0);}
 await expect(page.getByText(/not Authenticode-signed/)).toBeVisible();await expect(page.getByText(/Windows and Android libraries are separate/)).toBeVisible();
 expect(await page.locator('.device-pair').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
 await writeFile(testInfo.outputPath('readability.json'),JSON.stringify({width:393,rootText:'150%',horizontalOverflow:false,reducedMotion:true}));
});
test('successful release refresh exposes only the new official packages and truthful stable labels',async({page})=>{
 const releases=(['android','windows']as const).map(platform=>{const version=platform==='android'?'1.4.0':'1.0.0',tag=`${platform}-v${version}`,name=platform==='android'?`RITVIO-Android-${version}.apk`:`RITVIO-${version}-setup.exe`;return{draft:false,prerelease:false,tag_name:tag,html_url:`https://github.com/salvo13200/RITVIO/releases/tag/${tag}`,assets:[{name,size:10_000_000,state:'uploaded',browser_download_url:`https://github.com/salvo13200/RITVIO/releases/download/${tag}/${name}`}]};});
 await page.route('https://api.github.com/repos/salvo13200/RITVIO/releases?per_page=30',route=>route.fulfill({json:releases}));await page.goto('/');await page.getByRole('button',{name:'Check latest releases'}).click();await expect(page.getByRole('status')).toContainText('checked just now');await expect(page.locator('[data-channel=android]')).toHaveText('Stable release');await expect(page.locator('[data-channel=windows]')).toHaveText('Stable release');await expect(page.locator('[data-download=windows]')).toHaveAttribute('href',releases[1].assets[0].browser_download_url);await page.getByText('Other Windows formats',{exact:true}).click();await expect(page.locator('[data-portable=zip]')).toBeHidden();
});
test.beforeAll(async()=>{await mkdir(output,{recursive:true});});

test('iPhone download is recommended with a short usable signing and renewal tutorial',async({browser})=>{
 const context=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'}),page=await context.newPage();
 await page.goto('http://127.0.0.1:5180/RITVIO/');await settle(page);
 await expect(page.locator('.download-choices > article').first()).toHaveAttribute('data-platform','ios');
 await expect(page.locator('[data-platform=ios] .recommended')).toBeVisible();
 await expect(page.locator('[data-platform=android] .recommended')).toBeHidden();
 await expect(page.locator('[data-platform=ios]')).toContainText('Windows PC or Mac required');
 await page.getByRole('link',{name:'Follow the tutorial',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Install on iPhone.',exact:true})).toBeInViewport();
 await expect(page.locator('.ios-steps > li')).toHaveCount(3);
 await expect(page.locator('.ios-steps')).toContainText('Free Apple-account signatures last 7 days');
 await expect(page.locator('.ios-steps')).toContainText('Developer Mode');
 await expect(page.locator('.ios-tutorial-footer')).toContainText('An IPA link alone cannot install');
 await expect(page.getByRole('link',{name:'Full iOS installation guide'})).toHaveAttribute('href','https://github.com/salvo13200/RITVIO/blob/main/docs/IOS.md');
 await page.locator('#ios-install').screenshot({path:output+'/ios-tutorial-mobile.png',animations:'disabled'});
 expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
 await page.setViewportSize({width:320,height:740});await page.evaluate(()=>document.documentElement.style.fontSize='150%');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await context.close();
});

test('untrusted iOS refresh cannot change the verified beta or stable downloads',async({page})=>{
 const snapshot=JSON.parse(await (await import('node:fs/promises')).readFile('packages/releases/published.json','utf8'));
 const ios=snapshot.releases.find((r:{tag_name:string})=>r.tag_name.startsWith('ios-'));
 ios.assets[0].browser_download_url='https://example.org/not-the-app.ipa';
 await page.route('https://api.github.com/repos/salvo13200/RITVIO/releases?per_page=30',route=>route.fulfill({json:snapshot.releases}));
 await page.goto('/');await page.getByRole('button',{name:'Check latest releases'}).click();
 await expect(page.getByRole('status')).toContainText('iOS beta was not returned');
 for(const platform of ['windows','android'] as const)await expect(page.locator(`[data-download=${platform}]`)).toHaveAttribute('href',publishedDownloads[platform].download);
 for(const link of await page.locator('[data-download=ios]').all())await expect(link).toHaveAttribute('href',publishedDownloads.ios!.download);
});
