import {test,expect} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
import {ritvioTrackLink,sharedTrackMessage} from '../packages/domain/track-sharing';
test('desktop copies the public song link and accompanying message without changing playback',async({page,context,request})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);await request.post('http://127.0.0.1:5199/test-reset-library');
 await page.addInitScript(()=>{window.__RITVIO_TEST_CONFIG__={baseUrl:'http://127.0.0.1:5199',token:'test-token-only'};localStorage.setItem('ritvio.language.v1',JSON.stringify({schema:1,preference:'en'}));});
 await page.route('https://i.ytimg.com/**',async r=>r.fulfill({body:await readFile('tests/fixtures/artwork/city.webp'),contentType:'image/webp'}));
 await page.route('**/v1/media/*/artwork',async r=>r.fulfill({body:await readFile('tests/fixtures/artwork/city.webp'),contentType:'image/webp'}));
 await page.goto('/');await page.getByRole('textbox',{name:'Search music'}).fill('Musica test');await page.locator('.track-row').first().getByRole('button',{name:'Play Secondo brano',exact:true}).click();await expect(page.getByRole('button',{name:'Pause',exact:true})).toBeVisible();
 await page.locator('#story-share-trigger').click();const dialog=page.locator('.story-dialog');await expect(dialog.getByRole('button',{name:'Save image',exact:true})).toBeEnabled();
 await dialog.getByRole('button',{name:'Copy link',exact:true}).click();const link=await page.evaluate(()=>navigator.clipboard.readText());expect(new URL(link).hostname).toBe('salvo13200.github.io');
 await dialog.getByRole('button',{name:'Copy text + link',exact:true}).click();const text=await page.evaluate(()=>navigator.clipboard.readText());expect(text).toContain('Shared with RITVIO');expect(text).toContain(link);
 const params=new URLSearchParams(new URL(link).hash.slice(1)),track={videoId:params.get('track')!,title:params.get('title')!,artist:params.get('artist')!};expect(link).toBe(ritvioTrackLink(track));expect(text.replace(/\r\n/g,'\n')).toBe(sharedTrackMessage(track));
 await mkdir('.impeccable/review/a5',{recursive:true});await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:'.impeccable/review/a5/desktop-composer.png',animations:'disabled'});
 await dialog.getByRole('button',{name:'Close sharing',exact:true}).click();await expect(page.getByRole('button',{name:'Pause',exact:true})).toBeVisible();
 await page.locator('.track-row').first().getByRole('button',{name:'Listening options: Secondo brano',exact:true}).click();await page.locator('.listening-options:popover-open').getByRole('button',{name:'Copy RITVIO link: Secondo brano',exact:true}).click();await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toBe(link);
});
