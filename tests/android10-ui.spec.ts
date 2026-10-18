import {test,expect,type Page} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {fixture} from './helpers/mobile-fixture';
const output='test-results/visual/android-10';
async function open(page:Page){await page.getByRole('button',{name:/Apri il player:/}).click();return page.getByRole('dialog',{name:'In ascolto',exact:true});}
async function calls(page:Page){return page.evaluate(()=>(window as any).__mobileOperations as any[]);}

test('rapid native track updates retain a single artwork owner and the correct metadata',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await fixture(page,{queueLength:4});await open(page);
 const result=await page.evaluate(async()=>{
  const w=window as any,owner=document.querySelector('.player-cover>.artwork'),image=owner!.querySelector('img');let maximum=0,clones=0;
  const observer=new MutationObserver(()=>{maximum=Math.max(maximum,document.querySelectorAll('.full-player .player-cover img').length);clones+=document.querySelectorAll('.artwork-flight').length;});observer.observe(document.querySelector('.full-player')!,{childList:true,subtree:true});
  for(let i=0;i<80;i++){const state=w.__mobileState();state.index=i%4;state.position=i;w.__mobileUpdate();await new Promise(requestAnimationFrame);}
  observer.disconnect();return{maximum,clones,sameOwner:owner===document.querySelector('.player-cover>.artwork'),sameImage:image===document.querySelector('.player-cover img'),id:w.__mobileState().items[w.__mobileState().index].videoId};
 });
 expect(result).toEqual({maximum:1,clones:0,sameOwner:true,sameImage:true,id:'34567890123'});await expect(page.locator('.player-cover img')).toHaveAttribute('src',/34567890123/);await expect(page.locator('.full-player h1')).toHaveText('Stanze vuote');expect(errors).toEqual([]);
 await page.getByRole('button',{name:'Brano precedente'}).click();await expect.poll(async()=>(await calls(page)).some(o=>o.type==='previous')).toBe(true);
 await page.getByRole('dialog',{name:'In ascolto',exact:true}).getByRole('button',{name:'Brano successivo'}).click();await expect.poll(async()=>(await calls(page)).some(o=>o.type==='next')).toBe(true);
});

test('animation failure and suspension cannot duplicate or hide artwork or trap dismissal',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await fixture(page);
 await page.evaluate(()=>{const animate=Element.prototype.animate;Element.prototype.animate=function(...args:any[]){if(this.classList.contains('artwork')||this.classList.contains('full-player'))throw new Error('Simulated WebView animation interruption');return (animate as any).apply(this,args);};});
 for(let i=0;i<3;i++){await open(page);await expect(page.locator('.player-cover img')).toBeVisible();await expect(page.locator('.full-player img')).toHaveCount(1);await page.getByRole('button',{name:'Chiudi il player'}).click();await expect(page.locator('.full-player')).toHaveCount(0);}
 expect(errors).toEqual([]);expect((await calls(page)).filter(o=>o.method==='command'||o.method==='playTracks')).toHaveLength(0);expect(await page.evaluate(()=>document.documentElement.style.overflow)).toBe('');
});

test('unfinished animations have a bounded lifetime and Back restores page scroll',async({page})=>{
 await fixture(page);await page.evaluate(()=>{const animate=Element.prototype.animate;Element.prototype.animate=function(...args:any[]){const animation=(animate as any).apply(this,args);Object.defineProperty(animation,'finished',{value:new Promise(()=>{})});return animation;};});await open(page);
 await expect.poll(()=>page.locator('.player-cover>.artwork').evaluate(el=>el.getAnimations().length)).toBe(0);await page.getByRole('button',{name:'Testi',exact:true}).click();await page.getByRole('button',{name:'Chiudi Testi'}).click();expect(await page.evaluate(()=>document.documentElement.style.overflow)).toBe('hidden');await page.getByRole('button',{name:'Chiudi il player'}).click();await expect(page.locator('.full-player')).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.style.overflow)).toBe('');
});

test('player stays fixed at compact, large-text and landscape sizes with every control inside',async({page})=>{
 await fixture(page);const full=await open(page);await mkdir(output,{recursive:true});
 for(const size of [{width:393,height:852,font:100},{width:360,height:640,font:130},{width:320,height:568,font:100},{width:393,height:852,font:200},{width:740,height:360,font:100}]){
  await page.setViewportSize(size);await page.evaluate(font=>{document.documentElement.style.fontSize=`${font}%`;},size.font);
  await expect(full).toHaveCSS('overflow-y','hidden');
  const bounds=await full.evaluate(el=>({height:el.clientHeight,scrollHeight:el.scrollHeight,width:el.clientWidth,scrollWidth:el.scrollWidth,buttons:[...el.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect();return{name:b.getAttribute('aria-label')||b.textContent,x:r.x,y:r.y,w:r.width,h:r.height};})}));
  expect(bounds.scrollHeight,JSON.stringify(size)).toBeLessThanOrEqual(bounds.height+1);expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.width+1);
  for(const b of bounds.buttons.filter(b=>b.w>0&&b.h>0)){expect(b.y+b.h,`${JSON.stringify(size)} ${b.name}`).toBeLessThanOrEqual(size.height+1);expect(b.x+b.w).toBeLessThanOrEqual(size.width+1);expect(b.w).toBeGreaterThanOrEqual(48);expect(b.h).toBeGreaterThanOrEqual(48);}
  await page.screenshot({path:`${output}/web-player-${size.width}x${size.height}-text${size.font}.png`,animations:'disabled'});
  await page.mouse.move(size.width/2,size.height/2);await page.mouse.wheel(0,450);expect(await full.evaluate(el=>el.scrollTop)).toBe(0);
 }
});

test('lyrics scroll independently while the player and underlying page remain still',async({page})=>{
 await fixture(page);await page.evaluate(()=>{(window as any).__mobileNative.lyrics=async()=>({plainLyrics:Array.from({length:60},(_,i)=>`Verso ${i+1} del testo di prova`).join('\n'),syncedLyrics:null,instrumental:false});});const full=await open(page);await page.getByRole('button',{name:'Testi',exact:true}).click();const content=page.locator('.sheet-content');await expect(page.locator('.plain-lyrics')).toBeVisible();await content.hover();await page.mouse.wheel(0,500);await expect.poll(()=>content.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);expect(await full.evaluate(el=>el.scrollTop)).toBe(0);await page.goBack();await expect(full).toBeVisible();expect(await full.evaluate(el=>el.scrollTop)).toBe(0);
});

test('loading, playback errors and missing artwork keep a fixed usable player',async({page})=>{
 await fixture(page);const full=await open(page);
 for(const size of [{width:360,height:640},{width:740,height:360}]){
  await page.setViewportSize(size);await page.evaluate(()=>{const w=window as any;w.__mobileState().loading=false;w.__mobileState().error='Il flusso audio non è riproducibile. Riprova.';w.__mobileState().items[0].thumbnail=null;w.__mobileUpdate();});
  await expect(page.locator('.player-cover img')).toHaveCount(0);await expect(full.getByRole('button',{name:'Riprova',exact:true})).toBeVisible();
  const metrics=await full.evaluate(el=>({scroll:el.scrollHeight,height:el.clientHeight}));expect(metrics.scroll,JSON.stringify({size,metrics})).toBeLessThanOrEqual(metrics.height+1);const retry=(await full.getByRole('button',{name:'Riprova',exact:true}).boundingBox())!;expect(retry.y+retry.height).toBeLessThanOrEqual(size.height+1);
  await full.getByRole('button',{name:'Riprova',exact:true}).click();await page.evaluate(()=>{const w=window as any;w.__mobileState().error=null;w.__mobileState().loading=true;w.__mobileUpdate();});await expect(full.getByText('Preparazione del brano…')).toHaveCount(0);await expect(full.locator(".play-primary")).toHaveAttribute("aria-busy","true");expect(await full.evaluate(el=>el.scrollHeight<=el.clientHeight+1)).toBe(true);
 }
});

test('missing lyrics are not remembered as a permanent empty result after reopening',async({page})=>{
 await fixture(page);await page.evaluate(()=>{(window as any).__storyNoLyrics=true;});await open(page);await page.getByRole('button',{name:'Testi',exact:true}).click();await expect(page.getByText('Testo non trovato per questo brano.')).toBeVisible();await page.getByRole('button',{name:'Chiudi Testi'}).click();await page.evaluate(()=>{(window as any).__storyNoLyrics=false;});await page.getByRole('button',{name:'Testi',exact:true}).click();await expect(page.getByRole('button',{name:/Vai a 1:40: Terza riga/})).toBeVisible();expect((await calls(page)).filter(o=>o.method==='lyrics')).toHaveLength(2);
});

test('artist filtering has an honest empty state and name sorting covers followed artists',async({page})=>{
 await fixture(page);await page.getByRole('button',{name:'Libreria',exact:true}).click();await page.getByRole('button',{name:'Artisti',exact:true}).click();await page.getByRole('button',{name:'Cerca nella libreria'}).click();await page.getByRole('searchbox',{name:'Filtra libreria'}).fill('inesistente');await expect(page.getByRole('heading',{name:'Nessuna corrispondenza'})).toBeVisible();await page.getByRole('button',{name:'Cerca nella libreria'}).click();await expect(page.getByRole('button',{name:'Apri artista: Luna Riva'})).toBeVisible();await expect(page.getByRole('heading',{name:'Nessuna corrispondenza'})).toHaveCount(0);
 await page.getByRole('button',{name:'Modalità elenco'}).click();await page.screenshot({path:`${output}/web-library-artists-list.png`,animations:'disabled'});
});

test('album keeps unavailable track numbers and plays the exact selected available entry',async({page})=>{
 await fixture(page);await page.evaluate(()=>{const w=window as any,api=w.__mobileNative,original=api.catalog;api.catalog=async(input:any)=>{const value=await original(input);if(input.operation==='detail'&&input.kind==='album'){value.entries.splice(1,0,{number:2,title:'Traccia ritirata',duration:200,track:null});value.entries[2].number=3;value.partial=true;}return value;};});await page.getByRole('button',{name:'Libreria',exact:true}).click();await page.getByRole('button',{name:'Notti chiare Album',exact:true}).click();await expect(page.locator('.unavailable-track')).toContainText('Traccia ritirata');await expect(page.locator('.track-row .track-number')).toHaveText(['1','3']);await page.getByRole('button',{name:'Riproduci Orizzonti',exact:true}).click();const played=(await calls(page)).find(o=>o.method==='playTracks');expect(played.index).toBe(1);expect(played.items[played.index].title).toBe('Orizzonti');await page.screenshot({path:`${output}/web-album-partial.png`,animations:'disabled'});
});
