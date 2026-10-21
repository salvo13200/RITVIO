import {test,expect} from '@playwright/test';
import {fixture} from './helpers/mobile-fixture';
import {mkdir} from 'node:fs/promises';
import {sharedTrackMessage} from '../packages/domain/track-sharing';
test('track and lyric image sharing keep frozen song metadata, preserve selection and never command audio',async({page})=>{
 await fixture(page,{language:'en',artworkFiles:['tests/fixtures/artwork/city.webp','tests/fixtures/artwork/sky.webp','tests/fixtures/artwork/sunset.webp','tests/fixtures/artwork/city.webp']});
 await page.getByRole('button',{name:/^Open player:/}).click();await page.getByRole('button',{name:'Share',exact:true}).click();const dialog=page.getByRole('dialog').filter({has:page.locator('.mobile-story')});
 await expect(dialog.getByRole('button',{name:'Share image',exact:true})).toBeEnabled();await expect(dialog.getByText(/Shares include a short message/)).toBeVisible();await dialog.getByRole('button',{name:'Share image',exact:true}).click();
 await expect(dialog.getByRole('button',{name:'Share image',exact:true})).toBeEnabled();await expect(dialog.getByRole('status')).toContainText('opened');
 await mkdir('.impeccable/review/a5',{recursive:true});await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:'.impeccable/review/a5/android-track.png',animations:'disabled'});
 await page.evaluate(()=>{(window as any).__storyLyrics=Array.from({length:14},(_,i)=>'Original demo verse '+(i+1)).join('\n');});
 await dialog.getByRole('button',{name:'Lyrics',exact:true}).click();await dialog.getByRole('button',{name:/^Line 1:/}).click();await dialog.getByRole('button',{name:/^Line 4:/}).click();await dialog.getByRole('button',{name:'Preview card',exact:true}).click();
 await expect(dialog.getByRole('button',{name:'Share image',exact:true})).toBeEnabled();await dialog.getByRole('button',{name:'Share image',exact:true}).click();await dialog.getByRole('button',{name:'Share link',exact:true}).click();
 const calls=await page.evaluate(()=>(window as any).__mobileOperations as any[]),images=calls.filter(x=>x.method==='exportStory');expect(images).toHaveLength(2);
 for(const image of images){expect(image.track.videoId).toBe('abcdefghijk');expect(sharedTrackMessage(image.track)).toContain('https://salvo13200.github.io/RITVIO/#track=abcdefghijk');}
 expect(calls.filter(x=>x.method==='command'||x.method==='playTracks')).toHaveLength(0);expect(calls.find(x=>x.method==='share').track.videoId).toBe('abcdefghijk');
 await expect(dialog.getByRole('button',{name:'Share image',exact:true})).toBeEnabled();
 expect(await dialog.evaluate(element=>{const r=element.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&element.scrollWidth<=element.clientWidth;})).toBe(true);
 const button=await dialog.getByRole('button',{name:'Share link',exact:true}).boundingBox();expect(button!.x+button!.width).toBeLessThanOrEqual(393);
 await page.screenshot({path:'.impeccable/review/a5/android-verses.png',animations:'disabled'});await page.goBack();await expect(dialog.locator('.story-verse-list [aria-pressed=true]')).toHaveCount(4);
});
