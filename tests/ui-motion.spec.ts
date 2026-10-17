import {test,expect,type Page} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {tracks} from './fixtures';
const base='http://127.0.0.1:5199',headers={authorization:'Bearer test-token-only'},shots='.impeccable/review/ui-6-2';
const title='Luci lontane — registrazione dal vivo con orchestra, ospiti e un finale da ricordare';
const artist='Il collettivo delle città sospese con musicisti e ospiti della notte';
const songs=tracks.map((track,i)=>({...track,title:i?'Un altro orizzonte':title,artist,artists:[{id:'UCtestArtist01',name:artist}],album:{id:'MPREb_test1',name:'Album test 1'}}));
test.beforeEach(async({page,request})=>{
  await mkdir(shots,{recursive:true});await request.post(base+'/test-reset-library');await request.get(base+'/v1/search?q=Musica%20test',{headers});
  await page.addInitScript(({songs,base})=>{
    window.__RITVIO_TEST_CONFIG__={baseUrl:base,token:'test-token-only'};
    localStorage.setItem('ritvio-player-v1',JSON.stringify({state:{queue:Array.from({length:4},(_,i)=>({...songs[i%2],queueId:'motion-'+i,source:'collection'})),index:0,duration:12,position:4,playing:false,volume:.6,muted:false,uiLayout:{sidebarWidth:272,panelWidth:408,motion:'curated',sidebarCollapsed:false}},version:1}));
    const original=Element.prototype.animate;
    (window as unknown as {motionCalls:unknown[]}).motionCalls=[];
    Element.prototype.animate=function(...args:Parameters<typeof original>){(window as unknown as {motionCalls:unknown[]}).motionCalls.push({target:(this as HTMLElement).className,frames:args[0],options:args[1]});return original.apply(this,args);};
  },{songs,base});
  await page.route('https://*.ytimg.com/**',async route=>route.fulfill({contentType:'image/png',body:await readFile(`docs/design/ui-1/preview/assets/${route.request().url().includes('testmusic02')?'sky':'city'}.png`)}));
});
async function settle(page:Page){await page.evaluate(()=>document.fonts.ready);try{await expect.poll(()=>page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running'&&a.effect?.getComputedTiming().iterations!==Infinity).length)).toBe(0);}catch(error){console.log(await page.evaluate(()=>document.getAnimations().map(a=>({id:a.id,state:a.playState,timing:a.effect?.getComputedTiming(),target:(a.effect as KeyframeEffect)?.target?.getAttribute('class')}))));throw error;}}
async function capture(page:Page,name:string){await settle(page);await page.screenshot({path:shots+'/'+name+'.png'});}
async function record(page:Page){return page.evaluate(()=>(window as unknown as {motionCalls:{target:string;frames:Keyframe[];options:KeyframeAnimationOptions}[]}).motionCalls);}

test('overflow names scroll, pause for reading and stay unique and clickable',async({page})=>{
  await page.goto('/');const line=page.locator('.player-title-line'),artists=page.locator('.player-artist-line');await expect(line).toHaveAttribute('data-scroll','true');await expect(artists).toHaveAttribute('data-scroll','true');await expect(page.locator('.player-track strong')).toHaveCount(1);
  const width=(await line.boundingBox())!.width;await line.locator('.marquee-run').evaluate(el=>{const animation=el.getAnimations()[0],timing=animation.effect!.getComputedTiming();animation.currentTime=Number(timing.duration)*.5+Number(timing.delay);});
  await expect.poll(()=>line.locator('.marquee-run').evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).m41)).toBeLessThan(-20);await line.hover();await expect.poll(()=>line.locator('.marquee-run').evaluate(el=>el.getAnimations()[0]?.playState)).toBe('paused');expect((await line.boundingBox())!.width).toBe(width);
  await line.getByRole('button').focus();await expect.poll(()=>line.locator('.marquee-run').evaluate(el=>el.getAnimations().length)).toBe(0);await expect(line.getByRole('button')).toHaveAccessibleName('Apri il brano nell’album: '+title);await capture(page,'footer-names');
  await page.locator('#lyrics-reader-trigger').focus();await expect(line).toHaveAttribute('data-scroll','true');
});

test('title opens the matching album row and artist opens its page without autoplay',async({page})=>{
  await page.goto('/');let playback=0;page.on('request',r=>{if(r.url().includes('/v1/media/')&&r.url().includes('/playback')&&!r.url().includes('prepare=true'))playback++;});
  await page.locator('.player-title-link').press('Enter');await expect(page.locator('.catalog-album')).toBeVisible();const row=page.locator(`[data-album-track-id="${tracks[0].id}"]`);await expect(row).toHaveAttribute('data-jump-target','true');await expect(row.locator('.catalog-track-play')).toBeFocused();await expect(row).toBeInViewport();await capture(page,'album-target');
  await page.locator('.player-artist-link').press('Enter');await expect(page.locator('.catalog-artist h1')).toHaveText('Artista test');await expect(page.locator('.transport').getByRole('button',{name:'Riproduci',exact:true})).toBeVisible();expect(playback).toBe(0);
  await page.locator('.player-title-link').click();await expect(row.locator('.catalog-track-play')).toBeFocused();
});

test('metadata-free names open a bounded real search instead of inventing album or artist links',async({page})=>{
  await page.addInitScript(({songs})=>{const state=JSON.parse(localStorage.getItem('ritvio-player-v1')!).state;state.queue[0]={...state.queue[0],album:undefined,artists:undefined,artist:songs[0].artist};localStorage.setItem('ritvio-player-v1',JSON.stringify({state,version:1}));},{songs});
  await page.goto('/');await page.locator('.player-title-link').click();await expect(page.getByRole('textbox',{name:'Cerca musica'})).toHaveValue((title+' '+artist).slice(0,200));await expect(page.locator('.catalog-album')).toHaveCount(0);
  await page.locator('.player-artist-link').press('Enter');await expect(page.getByRole('textbox',{name:'Cerca musica'})).toHaveValue(artist);await expect(page.locator('.catalog-artist')).toHaveCount(0);
});

test('essential, reduced, hidden and fitting names do not keep optional movement running',async({page})=>{
  await page.goto('/');await expect(page.locator('.player-title-line')).toHaveAttribute('data-scroll','true');await page.getByRole('button',{name:'Impostazioni',exact:true}).click();await page.getByRole('combobox',{name:'Animazioni',exact:true}).selectOption('essential');await expect(page.locator('.player-title-line')).toHaveAttribute('data-scroll','false');
  await page.evaluate(()=>(window as unknown as {motionCalls:unknown[]}).motionCalls=[]);await page.getByRole('button',{name:'Torna alla musica'}).click();expect((await record(page)).flatMap(c=>c.frames).every(frame=>!frame.transform&&!frame.clipPath)).toBe(true);
  await page.getByRole('button',{name:'Impostazioni',exact:true}).click();await page.getByRole('combobox',{name:'Animazioni',exact:true}).selectOption('curated');await page.emulateMedia({reducedMotion:'reduce'});await expect(page.locator('.player-title-line')).toHaveAttribute('data-scroll','false');await page.emulateMedia({reducedMotion:'no-preference'});
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});await expect(page.locator('.player-title-line')).toHaveAttribute('data-scroll','false');await expect.poll(()=>page.evaluate(()=>document.getAnimations().filter(a=>a.id.startsWith('ui-')&&a.playState==='running').length)).toBe(0);
  await page.evaluate(()=>{delete (document as unknown as {hidden?:boolean}).hidden;document.dispatchEvent(new Event('visibilitychange'));});await page.locator('.transport').getByRole('button',{name:'Brano successivo',exact:true}).click();await page.setViewportSize({width:1586,height:992});await expect(page.locator('.player-title-line')).toHaveAttribute('data-overflow','false');
});

test('new artwork waits for loading, transitions once and shows a truthful failure fallback',async({page})=>{
  let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
  await page.route('https://i.ytimg.com/vi/testmusic02/**',async route=>{await gate;await route.fulfill({contentType:'image/png',body:await readFile('docs/design/ui-1/preview/assets/sky.png')});});
  await page.goto('/');await expect(page.locator('.now-artwork .cover-incoming')).toHaveJSProperty('complete',true);
  await page.locator('.transport').getByRole('button',{name:'Brano successivo',exact:true}).click();await page.locator('.transport').getByRole('button',{name:'Pausa',exact:true}).click();await expect(page.locator('.now-artwork .cover-retained')).toHaveAttribute('src',songs[0].thumbnail);await expect(page.locator('.now-artwork .animated-cover')).toHaveAttribute('aria-busy','true');await capture(page,'artwork-waiting');release();
  await expect(page.locator('.now-artwork .animated-cover')).toHaveAttribute('aria-busy','false');await settle(page);await expect(page.locator('.now-artwork .cover-retained')).toHaveCount(0);expect((await record(page)).some(c=>c.frames.some(frame=>frame.clipPath==='inset(0 0 0 6%)'))).toBe(true);await capture(page,'artwork-ready');
  await page.unroute('https://*.ytimg.com/**');await page.route('https://*.ytimg.com/**',route=>route.fulfill({status:404}));await page.reload();await expect(page.locator('.now-artwork .animated-cover')).toHaveAttribute('data-artwork','fallback');await expect(page.locator('.now-artwork .cover-retained')).toHaveCount(0);
});

test('native menus and page/panel feedback preserve keyboard focus and rapid switching',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'La tua libreria',exact:true}).click();await page.getByRole('button',{name:'Home',exact:true}).click();await page.locator('#queue-panel-trigger').click();await page.locator('#now-panel-trigger').click();await settle(page);expect((await record(page)).some(c=>c.frames.some(frame=>frame.clipPath==='inset(0 0 2% 0)'))).toBe(true);expect((await record(page)).some(c=>c.frames.some(frame=>frame.transform==='translateX(10px)'))).toBe(true);
  const menu=page.locator('.panel-body').getByRole('button',{name:'Opzioni di ascolto: '+title,exact:true});await menu.press('Enter');await expect(page.locator('.listening-options:popover-open')).toBeVisible();await capture(page,'menu-open');await page.keyboard.press('Escape');await expect(menu).toBeFocused();
  await page.setViewportSize({width:640,height:600});await page.locator('#lyrics-reader-trigger').click();await expect(page.locator('.lyrics-reader')).toBeVisible();await capture(page,'compact-lyrics');await page.locator('#lyrics-reader-trigger').click();await expect(page.locator('.lyrics-reader')).toHaveCount(0);
});

test('queue and asynchronous playlist reorders explain the new order without replacing playback',async({page,request})=>{
  const created=await(await request.post(base+'/v1/me/playlists',{headers,data:{name:'Movimento di prova'}})).json();let playlist=created;for(const track of tracks)playlist=await(await request.post(base+'/v1/me/playlists/'+created.id+'/items',{headers:{...headers,'if-match':'"'+playlist.revision+'"'},data:{mediaId:track.id}})).json();
  await page.goto('/');await page.getByRole('button',{name:'Movimento di prova',exact:true}).click();await expect(page.locator('.playlist-item')).toHaveCount(2);const itemIds=await page.locator('.playlist-item').evaluateAll(nodes=>nodes.map(el=>(el as HTMLElement).dataset.playlistItemId));await page.locator('.playlist-item').first().getByRole('button',{name:'Opzioni di ascolto: '+tracks[0].title,exact:true}).click();await page.locator('.listening-options:popover-open').getByRole('button',{name:'Sposta giù '+tracks[0].title,exact:true}).click();await expect.poll(()=>page.locator('.playlist-item').first().getAttribute('data-playlist-item-id')).toBe(itemIds[1]);await settle(page);
  await page.locator('#queue-panel-trigger').click();await expect(page.locator('.queue-tools')).toBeVisible();await page.evaluate(async()=>{const path='/src/queue-motion.ts';const {moveWithMotion}=await import(path);const storePath='/src/store.ts';const {usePlayer}=await import(storePath);await moveWithMotion(document.querySelector('.queue-tools'),()=>usePlayer.getState().move(1,2));});await expect(page.locator('.queue-row:not(.current)').first()).toHaveAttribute('data-queue-id','motion-2');await settle(page);
  const evidence=await record(page);for(const target of ['playlist-item','queue-row'])expect(evidence.some(c=>c.target.startsWith(target)&&c.frames.some(f=>typeof f.transform==='string'&&f.transform.startsWith('translateY(')))).toBe(true);await expect(page.locator('.transport').getByRole('button',{name:'Riproduci',exact:true})).toBeVisible();await writeFile(shots+'/MOTION-EVIDENCE.json',JSON.stringify(evidence,null,2));
});

test('actual fixture audio continues while footer links and panels navigate',async({page})=>{
  await page.goto('/');await page.locator('.transport').getByRole('button',{name:'Riproduci',exact:true}).click();
  const snapshot=()=>page.evaluate(async()=>{const path='/src/player.tsx';const {audio}=await import(path);const holder=window as unknown as {originalAudio?:HTMLAudioElement};holder.originalAudio??=audio;return {same:holder.originalAudio===audio,src:audio.src,time:audio.currentTime,paused:audio.paused};});
  await expect.poll(async()=>(await snapshot()).paused).toBe(false);const first=await snapshot();await page.locator('.player-title-link').press('Enter');await expect(page.locator('.catalog-album')).toBeVisible();await page.locator('.player-artist-link').press('Enter');await expect(page.locator('.catalog-artist')).toBeVisible();await page.locator('#lyrics-reader-trigger').click();await expect(page.locator('.lyrics-reader')).toBeVisible();
  const last=await snapshot();expect(last.same).toBe(true);expect(last.src).toBe(first.src);expect(last.paused).toBe(false);await expect.poll(async()=>(await snapshot()).time).toBeGreaterThan(first.time);await page.locator('.transport').getByRole('button',{name:'Pausa',exact:true}).click();
});

test('a late cover from a skipped track cannot replace the latest selection',async({page})=>{
  let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);await page.route('https://i.ytimg.com/vi/testmusic02/**',async route=>{await gate;await route.fulfill({contentType:'image/png',body:await readFile('docs/design/ui-1/preview/assets/sky.png')});});
  await page.goto('/');await expect(page.locator('.now-artwork .animated-cover')).toHaveAttribute('aria-busy','false');const next=page.locator('.transport').getByRole('button',{name:'Brano successivo',exact:true});await next.click();await expect(page.locator('.now-artwork .animated-cover')).toHaveAttribute('aria-busy','true');await next.click();await page.locator('.transport').getByRole('button',{name:'Pausa',exact:true}).click();await expect(page.locator('.now-artwork .cover-incoming')).toHaveAttribute('src',songs[0].thumbnail);release();await settle(page);await expect(page.locator('.now-artwork .cover-incoming')).toHaveAttribute('src',songs[0].thumbnail);await expect(page.locator('.player-track strong')).toHaveText(title);
});
