import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {fixture} from './helpers/ios-fixture';

const verses=['Streetlights fade into the morning','I hear the city breathing slow','After the rain, we start again','And let the quiet take us home','No need to hurry through the silence','There is a rhythm in the road','We keep a little light between us','The morning finds an open door','The streets remember every footstep','We take the long way home once more'];
for(const scale of [1,1.6])test(`lyrics reference A browser layout and reading controls at scale ${scale}`,async({page})=>{
 await page.setViewportSize(scale===1?{width:375,height:667}:{width:402,height:874});
 await page.route('https://**',route=>route.abort());
 let mode:'synced'|'plain'|'missing'|'instrumental'|'error'='synced';
 await page.route('https://lrclib.net/api/**',async route=>{
  if(mode==='error'){await route.abort();return;}
  if(mode==='missing'){await route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},status:route.request().url().includes('/get?')?404:200,body:route.request().url().includes('/get?')?'null':'[]'});return;}
  const query=new URL(route.request().url()).searchParams;
  await route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({id:2001,trackName:query.get('track_name'),artistName:query.get('artist_name'),duration:90,instrumental:mode==='instrumental',plainLyrics:verses.join('\n'),syncedLyrics:mode==='plain'?null:verses.map((line,i)=>`[${String(Math.floor(i*8/60)).padStart(2,'0')}:${String(i*8%60).padStart(2,'0')}]${line}`).join('\n')})});
 });
 const errors=await fixture(page,{withLibrary:true,lyrics:true,scale});
 await page.getByRole('button',{name:'Open player: After the rain'}).first().click();await page.getByRole('button',{name:'Open lyrics',exact:true}).click();
 const reader=page.getByRole('dialog',{name:'Lyrics',exact:true}),area=page.getByRole('region',{name:'Track lyrics'});
 await expect(reader.locator('.ios-lyric-line')).toHaveCount(10);
 await expect.poll(()=>page.evaluate(()=>(window as any).__iosOperations.filter((x:any)=>['playTracks','enqueue'].includes(x.method)||typeof x.type==='string').length)).toBe(0);
 const folder='.local/ios-lyrics-browser-preview';await mkdir(folder,{recursive:true});
 await page.screenshot({animations:'disabled',path:`${folder}/reader-${scale===1?'compact':'large-text'}.png`});
 const geometry=await reader.evaluate(element=>({height:element.clientHeight,scroll:element.scrollHeight}));expect(geometry.scroll).toBe(geometry.height);
 await area.hover();await page.mouse.wheel(0,400);await expect(page.getByRole('button',{name:'Resume auto-scroll'})).toBeVisible();
 await page.getByRole('button',{name:'Resume auto-scroll'}).click();await expect(page.getByRole('button',{name:'Resume auto-scroll'})).toHaveCount(0);
 await page.getByRole('button',{name:'Lyrics appearance'}).click();await expect(page.getByRole('dialog',{name:'Lyrics appearance'})).toBeVisible();
 await page.getByLabel('Large',{exact:true}).check();await page.getByRole('button',{name:'Done',exact:true}).click();
 await expect(reader).toBeVisible();await expect(page.locator('.ios-lyrics')).toHaveClass(/ios-lyrics-size-large/);
 await page.getByRole('button',{name:'Next song',exact:true}).last().click();await expect(reader.locator('.ios-lyrics-identity h1')).toHaveText('Slow motion');
 await expect(reader.locator('.ios-lyric-line')).toHaveCount(10);
 if(scale===1){
  mode='plain';await page.getByRole('button',{name:'Next song',exact:true}).last().click();await expect(reader.locator('.ios-lyrics-plain')).toBeVisible();await page.screenshot({animations:'disabled',path:`${folder}/plain.png`});
  mode='missing';await page.getByRole('button',{name:'Next song',exact:true}).last().click();await expect(reader.getByRole('heading',{name:'Lyrics not found',exact:true})).toBeVisible();await page.screenshot({animations:'disabled',path:`${folder}/missing.png`});
  mode='instrumental';await page.getByRole('button',{name:'Next song',exact:true}).last().click();await expect(reader.getByRole('heading',{name:'Instrumental track',exact:true})).toBeVisible();await page.screenshot({animations:'disabled',path:`${folder}/instrumental.png`});
  mode='error';await page.evaluate(()=>{const state=(window as any).__iosState();(window as any).__iosEmit({items:[{...state.items[0],videoId:'ritviotest9',title:'A new recording'}],index:0,order:[0],queueRevision:state.queueRevision+1});});await expect(reader.getByRole('heading',{name:'Lyrics could not load',exact:true})).toBeVisible();await page.screenshot({animations:'disabled',path:`${folder}/error.png`});
  await page.setViewportSize({width:852,height:393});await expect(reader).toBeVisible();await page.screenshot({animations:'disabled',path:`${folder}/landscape.png`});
  await page.evaluate(()=>{const prior=(window as any).__ios.foundationStatus;(window as any).__ios.foundationStatus=async()=>({...await prior(),safeArea:{top:0,right:59,bottom:21,left:59}});dispatchEvent(new Event('resize'));});
  await expect.poll(()=>reader.evaluate(element=>parseFloat(getComputedStyle(element).paddingLeft))).toBeGreaterThanOrEqual(59);
  const left=await reader.locator('.ios-lyrics-top button').first().boundingBox(),right=await reader.locator('.ios-lyrics-top button').last().boundingBox();expect(left!.x).toBeGreaterThanOrEqual(59);expect(right!.x+right!.width).toBeLessThanOrEqual(852-59);
  await page.screenshot({animations:'disabled',path:`${folder}/landscape-safe-area.png`});
  await page.setViewportSize({width:402,height:874});await expect.poll(()=>reader.evaluate(element=>parseFloat(getComputedStyle(element).paddingLeft))).toBeGreaterThanOrEqual(59);
  
 }
 await page.getByRole('button',{name:'Back to player'}).click();await expect(page.getByRole('dialog',{name:'Now playing',exact:true})).toBeVisible();
 expect(errors).toEqual([]);
});
