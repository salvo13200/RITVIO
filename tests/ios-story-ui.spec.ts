import {test,expect,type Page} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {fixture} from './helpers/ios-fixture';

const folder='.local/ios-sharing-browser-preview';
const verses=['Streetlights fade into the morning','I hear the city breathing slow','After the rain, we start again','And let the quiet take us home','No need to hurry through the silence','There is a rhythm in the road','We keep a little light between us','The morning finds an open door','The streets remember every footstep','We take the long way home once more','The sky is opening above us','A little longer on this road'];
async function setup(page:Page,scale=1){
 await page.route('https://**',route=>route.abort());
 await page.route('https://lrclib.net/api/**',route=>{
  const query=new URL(route.request().url()).searchParams;
  return route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({id:2001,trackName:query.get('track_name'),artistName:query.get('artist_name'),duration:90,instrumental:false,plainLyrics:verses.join('\n'),syncedLyrics:null})});
 });
 // Exercise the older WebKit canvas path. This is a browser fixture, not an iPhone run.
 await page.addInitScript(()=>{Object.defineProperty(CanvasRenderingContext2D.prototype,'roundRect',{value:undefined,configurable:true});Object.defineProperty(window,'createImageBitmap',{value:undefined,configurable:true});});
 return fixture(page,{withLibrary:true,lyrics:true,sharing:true,scale});
}
async function shot(page:Page,name:string){await mkdir(folder,{recursive:true});await page.screenshot({animations:'disabled',path:`${folder}/${name}.png`});}
async function quietTransport(page:Page){expect(await page.evaluate(()=>(window as any).__iosOperations.filter((x:any)=>['playTracks','enqueue','saveQueue'].includes(x.method)||typeof x.type==='string'))).toEqual([]);}
async function inside(page:Page){
 const rect=await page.locator('.ios-story').evaluate(element=>({height:element.clientHeight,scroll:element.scrollHeight,width:element.clientWidth,scrollWidth:element.scrollWidth}));
 expect(rect.scroll).toBeLessThanOrEqual(rect.height+1);expect(rect.scrollWidth).toBeLessThanOrEqual(rect.width+1);
 const buttons=page.locator('.ios-story button:visible');for(const button of await buttons.all()){const box=await button.boundingBox();expect(box!.height).toBeGreaterThanOrEqual(43);if(!await button.evaluate(element=>Boolean(element.closest('ol')))){expect(box!.y).toBeGreaterThanOrEqual(0);expect(box!.y+box!.height).toBeLessThanOrEqual(page.viewportSize()!.height+1);}}
}

for(const scale of [1,1.6])test(`sharing frozen song, contiguous selection, native-result feedback and layout ${scale}`,async({page})=>{
 await page.setViewportSize(scale===1?{width:375,height:667}:{width:402,height:874});const errors=await setup(page,scale);
 await page.getByRole('button',{name:'Open player: After the rain'}).first().click();await page.getByRole('button',{name:'Share song',exact:true}).click();
 const sheet=page.locator('.ios-story');await expect(sheet.locator('canvas')).toHaveClass('is-ready');await inside(page);await shot(page,`song-${scale}`);
 await page.evaluate(()=>{const current=(window as any).__iosState();(window as any).__iosEmit({index:1,position:0,playing:true});});
 await expect(sheet.locator('.ios-story-identity strong')).toHaveText('After the rain');
 await page.getByRole('button',{name:'Lyrics',exact:true}).click();const rows=sheet.locator('ol li button');await expect(rows).toHaveCount(12);
 await rows.nth(0).click();await rows.nth(3).click();await expect(sheet.locator('ol button[aria-pressed=true]')).toHaveCount(4);
 await rows.nth(10).click();await expect(sheet.getByRole('alert')).toHaveText('Choose up to 10 consecutive lines.');await expect(sheet.locator('ol button[aria-pressed=true]')).toHaveCount(4);
 await rows.nth(3).click();await inside(page);await shot(page,`selection-${scale}`);
 await sheet.locator('ol').evaluate(element=>{element.scrollTop=140;});const scroll=await sheet.locator('ol').evaluate(element=>element.scrollTop);
 await page.getByRole('button',{name:'Preview',exact:true}).click();await expect(sheet.locator('canvas')).toHaveClass('is-ready');await inside(page);await shot(page,`lyrics-four-${scale}`);
 await page.getByRole('button',{name:'Back to selection',exact:true}).click();await expect(sheet.locator('ol button[aria-pressed=true]')).toHaveCount(4);expect(await sheet.locator('ol').evaluate(element=>element.scrollTop)).toBe(scroll);
 await page.getByRole('button',{name:'Reset selection'}).click();await rows.nth(1).click();await page.getByRole('button',{name:'Preview',exact:true}).click();await expect(sheet.locator('canvas')).toHaveClass('is-ready');await shot(page,`lyrics-one-${scale}`);
 if(scale===1){
  await page.evaluate(()=>{(window as any).__iosStoryDeferred=true;});await page.getByRole('button',{name:'Save to Photos',exact:true}).click();await expect(page.getByRole('button',{name:'Saving image',exact:true})).toBeDisabled();await expect(page.getByText('Image saved to Photos.',{exact:true})).toHaveCount(0);
  await page.evaluate(()=>{(window as any).__iosStoryComplete();(window as any).__iosStoryDeferred=false;});await expect(page.getByText('Image saved to Photos.',{exact:true})).toBeVisible();await shot(page,'saved');
  const png=await page.evaluate(()=>(window as any).__iosStoryPNG as string);const bytes=Buffer.from(png,'base64');expect(bytes.subarray(0,8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));expect(bytes.readUInt32BE(16)).toBe(1080);expect(bytes.readUInt32BE(20)).toBe(1920);await writeFile(`${folder}/export-one.png`,bytes);
 }
 if(scale>1){await page.evaluate(()=>{(window as any).__iosStoryDenied=true;});await page.getByRole('button',{name:'Save to Photos',exact:true}).click();await expect(sheet.getByRole('alert')).toContainText('Allow RITVIO to add photos');await inside(page);await shot(page,'photos-denied-large-text');}
 await quietTransport(page);await page.getByRole('button',{name:'Close sharing',exact:true}).click();await expect(page.getByRole('dialog',{name:'Now playing',exact:true})).toBeVisible();await quietTransport(page);expect(errors).toEqual([]);
});

test('export recovery, landscape safe areas, renderer adaptive shape and Photos denial',async({page})=>{
 const errors=await setup(page);await page.getByRole('button',{name:'Open player: After the rain'}).first().click();await page.getByRole('button',{name:'Share song',exact:true}).click();const sheet=page.locator('.ios-story');await expect(sheet.locator('canvas')).toHaveClass('is-ready');
 await page.evaluate(()=>{(window as any).__iosStoryDenied=true;});await page.getByRole('button',{name:'Save to Photos',exact:true}).click();await expect(sheet.getByRole('alert')).toContainText('Allow RITVIO to add photos');await inside(page);await shot(page,'photos-denied');await page.getByRole('button',{name:'Open Settings',exact:true}).click();
 await page.evaluate(()=>{(window as any).__iosStoryDenied=false;(window as any).__iosStoryCancelled=true;});await page.getByRole('button',{name:'Share',exact:true}).click();await expect(page.getByText('Sharing cancelled.',{exact:true})).toBeVisible();
 await page.setViewportSize({width:852,height:393});await page.evaluate(()=>{const prior=(window as any).__ios.foundationStatus;(window as any).__ios.foundationStatus=async()=>({...await prior(),safeArea:{top:0,right:59,bottom:21,left:59}});dispatchEvent(new Event('resize'));});
 await expect.poll(()=>sheet.evaluate(element=>parseFloat(getComputedStyle(element).paddingLeft))).toBeGreaterThanOrEqual(59);await inside(page);await shot(page,'landscape-song');await page.getByRole('button',{name:'Lyrics',exact:true}).click();await expect(sheet.locator('ol li button')).toHaveCount(12);await sheet.locator('ol li button').nth(0).click();await sheet.locator('ol li button').nth(3).click();await inside(page);await shot(page,'landscape-selection');await page.getByRole('button',{name:'Preview',exact:true}).click();await expect(sheet.locator('canvas')).toHaveClass('is-ready');await inside(page);await shot(page,'landscape-lyrics');
 const layout=await page.evaluate(async(moduleURL)=>{
  const {renderStory}=await import(moduleURL);
  const track={title:'After the rain',artist:'Luna Vale'},canvas=document.createElement('canvas');
  const one=await renderStory(canvas,track,null,'lyrics','One short line');const four=await renderStory(canvas,track,null,'lyrics','One short line\nAnother quiet line\nAnd one more line\nWe start again');return {one,four,size:[canvas.width,canvas.height]};
 },`/@fs/${process.cwd().replace(/\\/g,'/')}/packages/browser/story-canvas.ts`);expect(layout.one.layout.height).toBeLessThan(layout.four.layout.height);expect(layout.size).toEqual([1080,1920]);
 await page.getByRole('button',{name:'Close sharing'}).click();await page.setViewportSize({width:375,height:667});await page.evaluate(()=>{(window as any).__iosStoryCoverFailure=true;});await page.getByRole('button',{name:'Share song',exact:true}).click();await expect(page.getByText('Cover unavailable. Retry or use RITVIO colors.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Save to Photos'})).toBeDisabled();await page.getByRole('button',{name:'Use RITVIO colors',exact:true}).click();await expect(page.getByRole('button',{name:'Save to Photos'})).toBeEnabled();await shot(page,'cover-fallback');await quietTransport(page);expect(errors).toEqual([]);
});

test('sharing the visible reader reuses its document and returns without changing audio',async({page})=>{
 let calls=0;page.on('request',request=>{if(request.url().startsWith('https://lrclib.net/api/'))calls++;});
 const errors=await setup(page);await page.getByRole('button',{name:'Open player: After the rain'}).first().click();await page.getByRole('button',{name:'Open lyrics',exact:true}).click();await expect(page.locator('.ios-lyrics-plain')).toBeVisible();const before=calls;
 await page.getByRole('button',{name:'Share lyrics',exact:true}).click();await expect(page.locator('.ios-story ol li button')).toHaveCount(12);expect(calls).toBe(before);
 await page.getByRole('button',{name:'Close sharing'}).click();await expect(page.getByRole('dialog',{name:'Lyrics',exact:true})).toBeVisible();await expect(page.locator('.ios-lyrics-plain')).toBeVisible();await quietTransport(page);expect(errors).toEqual([]);
});
