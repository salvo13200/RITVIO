import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {fixture} from './helpers/ios-fixture';
const track=(index:number)=>({videoId:`ritviotest${index}`,title:['After the rain','Slow motion','Golden hour','Night swim'][index-1],artist:['Luna Vale','North Avenue','June Atlas','Luna Vale'][index-1],duration:90,thumbnail:`https://i.ytimg.com/vi/ritviotest${index}/hqdefault.jpg`});
const seed=()=>({revision:1,likes:[track(1),track(2)],recent:[track(4)],follows:[],playlists:['Night drive','Slow mornings','After hours','Somewhere quiet'].map((name,i)=>({id:`12345678-1234-1234-1234-123456789ab${i}`,name,description:i===0?'A personal collection':'',revision:1,updatedAt:1000+i,items:i===0?[track(1),track(2),track(1)]:[track(i+1)],cover:null}))});
async function library(page:Page){await page.getByRole('button',{name:'Library',exact:true}).click();await expect(page.getByRole('heading',{name:'Your library',exact:true})).toBeVisible();}
async function named(page:Page,name:string){await page.getByRole('textbox',{name:'Name',exact:true}).fill(name);await page.getByRole('button',{name:'Save',exact:true}).click();}
test('approved collection shelf, list/search preference and navigation preserve the native session',async({page})=>{
 const errors=await fixture(page,{withLibrary:true,librarySeed:seed()});await library(page);
 await expect(page.locator('.is-grid .ios-personal-playlist')).toHaveCount(4);await expect(page.getByTestId('mini-player')).toBeVisible();
 await page.getByRole('button',{name:'List view',exact:true}).click();await page.getByRole('searchbox',{name:'Search your playlists'}).fill('morning');await expect(page.locator('.ios-personal-playlist')).toHaveCount(1);
 await page.reload();await library(page);await expect(page.locator('.is-list')).toBeVisible();await expect(page.locator('.ios-personal-playlist')).toHaveCount(4);
 await page.getByRole('button',{name:'Night drive, 3 songs',exact:true}).click();await expect(page.getByRole('heading',{name:'Night drive',exact:true})).toBeVisible();
 await page.goBack();await expect(page.getByRole('heading',{name:'Your library',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).__iosOperations.filter((op:any)=>op.method==='playTracks'||op.type==='pause').length)).toBe(0);expect(errors).toEqual([]);
});
test('create, save a song, add to a personal playlist and reload use real UI actions',async({page})=>{
 await fixture(page,{withLibrary:true});await library(page);await page.getByRole('button',{name:'Create playlist',exact:true}).first().click();await named(page,'My collection');
 await expect(page.getByRole('heading',{name:'My collection',exact:true})).toBeVisible();await page.getByRole('button',{name:'Back to library'}).click();
 await page.getByRole('button',{name:'Search',exact:true}).click();await page.getByRole('searchbox').fill('luna');await page.getByRole('button',{name:'More options: Slow motion'}).click();await page.getByRole('button',{name:'Like song',exact:true}).click();
 await page.getByRole('button',{name:'More options: Slow motion'}).click();await page.getByRole('button',{name:'Add to playlist',exact:true}).click();await page.getByRole('dialog',{name:'Choose a playlist'}).getByRole('button',{name:/My collection/}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);await page.reload();await library(page);await page.getByRole('button',{name:'My collection, 1 song',exact:true}).click();await expect(page.getByRole('button',{name:'Play: Slow motion',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).__iosLibrary().likes.length)).toBe(1);
});
test('duplicate playlist occurrences reorder by index and stale gestures never commit',async({page})=>{
 await fixture(page,{withLibrary:true,librarySeed:seed()});await library(page);await page.getByRole('button',{name:'Night drive, 3 songs',exact:true}).click();
 const from=(await page.getByRole('button',{name:'Reorder: After the rain',exact:true}).nth(1).boundingBox())!,to=(await page.getByRole('button',{name:'Reorder: Slow motion',exact:true}).boundingBox())!;
 await page.mouse.move(from.x+22,from.y+22);await page.mouse.down();await page.mouse.move(to.x+22,to.y+22,{steps:12});await page.mouse.up();
 await expect.poll(()=>page.evaluate(()=>(window as any).__iosLibrary().playlists[0].items.map((x:any)=>x.videoId))).toEqual(['ritviotest1','ritviotest1','ritviotest2']);
 const grip=page.getByRole('button',{name:'Reorder: Slow motion',exact:true}),box=(await grip.boundingBox())!;await page.mouse.move(box.x+22,box.y+22);await page.mouse.down();await page.mouse.move(box.x+22,box.y-80,{steps:8});
 await page.evaluate(()=>{const lib=(window as any).__iosLibrary();lib.revision++;lib.playlists[0].revision++;(window as any).__iosLibraryEmit(lib);});await expect(page.locator('.ios-library-entry.is-lifted')).toHaveCount(0);await page.mouse.up();
 expect(await page.evaluate(()=>(window as any).__iosOperations.filter((x:any)=>x.method==='libraryCommand'&&x.type==='move').length)).toBe(1);
});
test('stale edits and failed writes preserve stored data; personal photo cancellation preserves playback',async({page})=>{
 await fixture(page,{withLibrary:true,librarySeed:seed()});await library(page);await page.getByRole('button',{name:'Playlist options: Night drive',exact:true}).click();await page.getByRole('button',{name:'Edit details',exact:true}).click();
 await page.getByRole('textbox',{name:'Name',exact:true}).fill('My unsaved edit');await page.evaluate(()=>{const value=(window as any).__iosLibrary();value.revision++;value.playlists[0].revision++;value.playlists[0].name='Changed elsewhere';(window as any).__iosLibraryEmit(value);});await expect(page.getByRole('button',{name:'Save',exact:true})).toBeDisabled();await expect(page.getByRole('alert')).toContainText('playlist changed');
 expect(await page.evaluate(()=>(window as any).__iosLibrary().playlists[0].name)).toBe('Changed elsewhere');await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.getByRole('button',{name:'Playlist options: Changed elsewhere',exact:true}).click();await page.getByRole('button',{name:'Choose playlist photo'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 expect(await page.evaluate(()=>(window as any).__iosLibrary().playlists[0].cover)).toBeNull();expect(await page.evaluate(()=>(window as any).__iosOperations.filter((x:any)=>x.method==='playTracks'||['seek','pause','clear'].includes(x.type)).length)).toBe(0);
 await page.getByRole('button',{name:'Create playlist',exact:true}).first().click();await page.evaluate(()=>{(window as any).__iosFailLibrary=true;});await named(page,'Cannot save');await expect(page.getByRole('dialog')).toBeVisible();expect(await page.evaluate(()=>(window as any).__iosLibrary().playlists.length)).toBe(4);
});
test('saving the effective queue order creates a playlist without audio commands',async({page})=>{
 await fixture(page,{withLibrary:true});await page.evaluate(()=>(window as any).__iosEmit({order:[0,3,1,2,4]}));await page.getByRole('button',{name:'Open player: After the rain'}).first().click();await page.getByRole('button',{name:'Queue',exact:true}).first().click();await page.getByRole('button',{name:'Save queue as playlist'}).click();await named(page,'From the queue');await expect(page.getByRole('dialog',{name:'Queue',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).__iosLibrary().playlists[0].items.map((x:any)=>x.videoId))).toEqual(['ritviotest1','ritviotest4','ritviotest2','ritviotest3','ritviotest5']);
 expect(await page.evaluate(()=>(window as any).__iosOperations.filter((x:any)=>x.method==='playTracks'||x.type).length)).toBe(0);
});
test('successful personal photos, photo removal, deletion confirmation and history do not alter songs',async({page})=>{
 await fixture(page,{withLibrary:true,librarySeed:seed()});await library(page);await page.evaluate(()=>{(window as any).__iosArtworkSuccess=true;});
 await page.getByRole('button',{name:'Playlist options: Night drive',exact:true}).click();await page.getByRole('button',{name:'Choose playlist photo'}).click();await expect(page.getByRole('status')).toContainText('photo saved');
 expect(await page.evaluate(()=>(window as any).__iosLibrary().playlists[0].cover)).toContain('ritviotest4');expect(await page.evaluate(()=>(window as any).__iosLibrary().likes[0].thumbnail)).toContain('ritviotest1');
 await page.getByRole('button',{name:'Playlist options: Night drive',exact:true}).click();await page.getByRole('button',{name:'Remove personal photo'}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__iosLibrary().playlists[0].cover)).toBeNull();
 await page.getByRole('button',{name:'Playlist options: Night drive',exact:true}).click();await page.getByRole('button',{name:'Delete playlist',exact:true}).click();await page.getByRole('button',{name:'Cancel',exact:true}).click();expect(await page.evaluate(()=>(window as any).__iosLibrary().playlists.length)).toBe(4);
 await page.getByRole('button',{name:'Recently played',exact:true}).click();await expect(page.getByRole('button',{name:'Play: Night swim',exact:true})).toBeVisible();await page.getByRole('button',{name:'Clear listening history',exact:true}).click();await page.getByRole('dialog',{name:'Clear recently played?'}).getByRole('button',{name:'Clear listening history'}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__iosLibrary().recent.length)).toBe(0);expect(await page.evaluate(()=>(window as any).__iosLibrary().likes.length)).toBe(2);
});
test('compact large-text library, edit sheet and reduced motion remain readable and accessible',async({page})=>{
 await page.setViewportSize({width:375,height:667});await page.emulateMedia({reducedMotion:'reduce'});await fixture(page,{withLibrary:true,librarySeed:seed(),scale:1.65});await library(page);
 expect(await page.locator('.ios-playlist-collections').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(page.getByRole('button',{name:'Library',exact:true})).toBeInViewport();
 let scan=await new AxeBuilder({page}).include('.ios-app').analyze();expect(scan.violations).toEqual([]);
 await page.getByRole('button',{name:'Create playlist',exact:true}).first().click();await page.getByRole('textbox',{name:'Name',exact:true}).fill('Readable');await expect(page.getByRole('button',{name:'Save',exact:true})).toBeInViewport();
 scan=await new AxeBuilder({page}).include('.ios-app').analyze();expect(scan.violations).toEqual([]);await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
});
