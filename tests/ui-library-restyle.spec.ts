import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {readFile,mkdir} from 'node:fs/promises';
import {tracks} from './fixtures';
const base='http://127.0.0.1:5199',headers={authorization:'Bearer test-token-only'},shots='.impeccable/review/library-fixes-0.6.29';
const names=['Viaggio notturno','Senza fretta','Orizzonti','Città sospese','Sotto le stelle','Strade di casa'];
const songs=Array.from({length:125},(_,i)=>({...tracks[i%2],id:i?`liked:${i}`:tracks[0].id,title:i===0?'Luci lontane':i===1?'Senza fretta':`Orizzonte ${String(i).padStart(3,'0')}`,artist:i%2?'Elio Serra':'Nora',artists:[{id:'UCtestArtist01',name:i%2?'Elio Serra':'Nora'}],album:{id:'MPREb_test1',name:'Città sospese'},duration:252}));
const playlists=names.map((name,i)=>({id:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,name,description:i?'Una raccolta personale':'Luci della città, strade bagnate e pensieri che viaggiano.',visibility:'private',cover:null,artwork:[tracks[i%2].thumbnail],count:[18,24,12,8,16,20][i],durationSeconds:3600+i*120,updatedAt:new Date(Date.UTC(2026,9,14-i)).toISOString(),revision:1}));
const follows=[...['Nora','Mara','Elio Serra','Luca Ventura'].map((name,i)=>({id:`UCtestArtist0${i+1}`,name,kind:'artist',artwork:tracks[i%2].thumbnail,url:`https://music.youtube.com/channel/UCtestArtist0${i+1}`})),...['Città sospese','Notte aperta','Orizzonti','Riflessi','Sotto le stelle','Strade di casa'].map((name,i)=>({id:i?'MPREb_album'+i:'MPREb_test1',name,kind:'album',artwork:tracks[i%2].thumbnail,url:'https://music.youtube.com/browse/MPREb_test1'}))];
test.beforeEach(async({page,request})=>{
  await mkdir(shots,{recursive:true});await request.post(base+'/test-reset-library');await request.get(base+'/v1/search?q=Musica%20test',{headers});
  await page.addInitScript(({songs,base})=>{window.__RITVIO_TEST_CONFIG__={baseUrl:base,token:'test-token-only'};localStorage.setItem('ritvio-player-v1',JSON.stringify({state:{queue:[{...songs[0],queueId:'lib2-current',source:'collection'}],index:0,position:102,duration:252,volume:.6,muted:false,theme:'dark',uiLayout:{sidebarWidth:272,panelWidth:408,motion:'curated',sidebarCollapsed:false}},version:1}));const animate=Element.prototype.animate;(window as any).libraryMotion=[];Element.prototype.animate=function(...args:Parameters<typeof animate>){(window as any).libraryMotion.push({target:(this as HTMLElement).className,frames:args[0]});return animate.apply(this,args);};},{songs,base});
  await page.route('https://*.ytimg.com/**',async route=>route.fulfill({contentType:'image/png',body:await readFile(`docs/design/ui-1/preview/assets/${route.request().url().includes('testmusic02')?'sky':'city'}.png`)}));
  await page.route('**/v1/me/library',route=>route.fulfill({json:{profile:{id:'00000000-0000-4000-8000-000000000099',mode:'local',displayName:'Il mio spazio',avatar:null},likes:songs,playlists,follows,history:songs.slice(0,2).map((track,i)=>({id:'history-'+i,track,playedAt:'2026-10-14T10:00:00Z'}))}}));
  await page.route('**/v1/me/playlists/'+playlists[0].id,route=>route.fulfill({json:{...playlists[0],count:2,items:tracks.map((track,i)=>({id:'entry-'+i,track}))}}));
});
async function library(page:Page){await page.goto('/');await page.getByRole('button',{name:'La tua libreria',exact:true}).click();await expect(page.locator('.playlist-card')).toHaveCount(6);return page.locator('.library-page');}
async function capture(page:Page,name:string){await page.evaluate(()=>document.fonts.ready);await expect.poll(()=>page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running'&&a.effect?.getComputedTiming().iterations!==Infinity).length)).toBe(0);await page.locator('main').evaluate(el=>el.scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:shots+'/'+name+'.png'});}

test('LIB-2 grid/list and local sorting retain audio, filters and independent category views',async({page})=>{
  const root=await library(page);let catalog=0,playback=0;page.on('request',r=>{if(/\/v1\/(search|catalog\/search)/.test(r.url()))catalog++;if(r.url().includes('/playback'))playback++;});
  await expect(root.getByRole('button',{name:'Vista Griglia',exact:true})).toHaveAttribute('aria-pressed','true');await root.getByRole('button',{name:'Vista Elenco',exact:true}).click();await expect(root.locator('.library-view')).toHaveClass(/library-layout-list/);
  await root.getByRole('combobox',{name:'Ordina per'}).selectOption('name');await expect(root.locator('.playlist-card strong')).toHaveText(['Città sospese','Orizzonti','Senza fretta','Sotto le stelle','Strade di casa','Viaggio notturno']);await root.getByRole('searchbox',{name:'Cerca nelle tue playlist'}).fill('strade casa');await expect(root.locator('.playlist-card')).toHaveCount(1);
  await root.getByRole('tab',{name:'Preferiti',exact:true}).click();await expect(root.getByRole('button',{name:'Vista Elenco',exact:true})).toHaveAttribute('aria-pressed','true');await expect(root.locator('.library-track')).toHaveCount(60);await root.getByRole('button',{name:'Mostra altri 60'}).click();await expect(root.locator('.library-track')).toHaveCount(120);await root.getByRole('button',{name:'Vista Griglia',exact:true}).click();await expect(root.locator('.library-track')).toHaveCount(120);
  await root.getByRole('tab',{name:'Playlist',exact:true}).click();await expect(root.getByRole('button',{name:'Vista Elenco',exact:true})).toHaveAttribute('aria-pressed','true');await expect(root.getByRole('searchbox')).toHaveValue('strade casa');await expect(page.locator('.player-track strong')).toHaveText('Luci lontane');expect(catalog).toBe(0);expect(playback).toBe(0);
  await page.reload();await page.getByRole('button',{name:'La tua libreria',exact:true}).click();await expect(root.getByRole('button',{name:'Vista Griglia',exact:true})).toHaveAttribute('aria-pressed','true');
});
test('LIB-2 import disclosure preserves file/link flows and keyboard recovery',async({page})=>{
  const root=await library(page);await root.locator('#library-import-trigger').click();const chooser=page.waitForEvent('filechooser');await root.getByRole('button',{name:'Importa playlist',exact:true}).click();await(await chooser).setFiles({name:'Demo.ritvio.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'ritvio-playlist',version:1,exportedAt:'2026-10-14T10:00:00Z',playlist:{name:'Importazione di prova',description:'',cover:null,tracks:[]}}))});
  await expect(page.getByRole('dialog',{name:'Importa playlist',exact:true})).toBeVisible();await page.getByRole('button',{name:'Chiudi importazione',exact:true}).click();await root.locator('#library-import-trigger').click();await root.getByRole('button',{name:'Importa da link',exact:true}).click();await expect(root.locator('.remote-import')).toBeVisible();await capture(page,'import-link');await root.getByRole('button',{name:'Chiudi importazione da link',exact:true}).click();await expect(root.locator('.remote-import')).toHaveCount(0);await expect(page.locator('#library-import-trigger')).toBeFocused();
});
test('LIB-2 keyboard categories and lyrics remain reachable without a duplicate panel tab',async({page})=>{
  const root=await library(page);await expect(page.locator('.panel-tabs').getByRole('button',{name:'Testi',exact:true})).toHaveCount(0);await root.getByRole('tab',{name:'Playlist',exact:true}).focus();await page.keyboard.press('ArrowRight');await expect(root.getByRole('tab',{name:'Preferiti',exact:true})).toBeFocused();await page.keyboard.press('End');await expect(root.getByRole('tab',{name:'Cronologia',exact:true})).toHaveAttribute('aria-selected','true');await expect(root.locator('.history-entry')).toHaveCount(2);
  await page.locator('#lyrics-reader-trigger').click();await expect(page.locator('.lyrics-reader')).toBeVisible();await page.locator('#lyrics-reader-trigger').click();await expect(root).toBeVisible();await expect(page.locator('#lyrics-reader-trigger')).toBeFocused();
});
test('LIB-2 actual motion marks category and visible item order, reduced policy cancels it',async({page})=>{
  const root=await library(page);await page.evaluate(()=>{(window as any).libraryMotion=[];});await root.getByRole('combobox',{name:'Ordina per'}).selectOption('name');await expect.poll(()=>page.evaluate(()=>(window as any).libraryMotion.some((call:any)=>call.frames.some((frame:any)=>frame.transform?.startsWith('translate('))))).toBe(true);
  await root.getByRole('tab',{name:'Album',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).libraryMotion.some((call:any)=>call.target==='library-tab-indicator'))).toBe(true);await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>{(window as any).libraryMotion=[];});await root.getByRole('tab',{name:'Artisti',exact:true}).click();await root.getByRole('combobox',{name:'Ordina per'}).selectOption('name');expect(await page.evaluate(()=>(window as any).libraryMotion.some((call:any)=>call.target==='library-tab-indicator'||call.frames.some((frame:any)=>frame.transform)))).toBe(false);
});
test('LIB-2 approved compositions remain readable in dark/light and compact windows',async({page})=>{
  await page.setViewportSize({width:1586,height:992});await page.emulateMedia({reducedMotion:'reduce'});const root=await library(page);await capture(page,'grid-desktop');await root.getByRole('button',{name:'Vista Elenco',exact:true}).click();await capture(page,'list-desktop');
  for(const [tab,name] of [['Preferiti','favourites-desktop'],['Album','albums-desktop'],['Artisti','artists-desktop']]){await root.getByRole('tab',{name:tab,exact:true}).click();await capture(page,name);}
  const scan=await new AxeBuilder({page}).include('.library-page').analyze();expect(scan.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
  await page.getByRole('button',{name:'Impostazioni',exact:true}).click();await page.getByRole('button',{name:'Scuro',exact:true}).click();await page.keyboard.press('Escape');await root.getByRole('tab',{name:'Playlist',exact:true}).click();await root.getByRole('button',{name:'Vista Griglia',exact:true}).click();await capture(page,'grid-light');expect((await new AxeBuilder({page}).include('.library-page').analyze()).violations).toEqual([]);
  for(const width of [640,390]){await page.setViewportSize({width,height:940});if(await page.locator('#listening-panel').getAttribute('aria-hidden')==='false')await page.locator('.panel-tabs').getByRole('button',{name:'Nascondi pannello',exact:true}).click();await capture(page,'compact-'+width);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await root.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);}
});
test('LIB-2 late playlist play cannot override a newer transport intent',async({page})=>{
  const root=await library(page);let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);await page.route('**/v1/me/playlists/'+playlists[0].id,async route=>{await gate;await route.fulfill({json:{...playlists[0],count:2,items:tracks.map((track,i)=>({id:'late-'+i,track}))}});});
  try{await root.getByRole('button',{name:'Riproduci playlist: Viaggio notturno',exact:true}).focus();await page.keyboard.press('Enter');await page.locator('.transport').getByRole('button',{name:'Riproduci',exact:true}).click();await expect(page.locator('.transport').getByRole('button',{name:'Pausa',exact:true})).toBeVisible();release();await expect(root.locator('.playlist-item')).toHaveCount(2);await expect(page.locator('.player-track strong')).toHaveText('Luci lontane');}finally{release();}
});

test('LIB-2 favourites remain reachable through Library after first profile loading',async({page})=>{
  let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);await page.route('**/v1/me/library',async route=>{await gate;await route.fulfill({json:{profile:{id:'00000000-0000-4000-8000-000000000099',mode:'local',displayName:'Il mio spazio',avatar:null},likes:songs,playlists,follows,history:[]}});});
  try{await page.goto('/');await page.getByRole('button',{name:'La tua libreria',exact:true}).click();release();await page.getByRole('tab',{name:'Preferiti',exact:true}).click();await expect(page.getByRole('tab',{name:'Preferiti',exact:true})).toHaveAttribute('aria-selected','true');await expect(page.locator('.library-track')).toHaveCount(60);}finally{release();}
});

test('LIB-2 navigation labels stay visible and history remains compact at desktop and narrow sizes',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});const root=await library(page);
  for(const width of [1586,1366,640,390]){
    await page.setViewportSize({width,height:992});
    if(width<=640&&await page.locator('#listening-panel').getAttribute('aria-hidden')==='false')await page.locator('.panel-tabs').getByRole('button',{name:'Nascondi pannello',exact:true}).click();
    await root.getByRole('tab',{name:'Cronologia',exact:true}).click();await expect(root.locator('.history-entry')).toHaveCount(2);
    const geometry=await root.evaluate(el=>({
      tabs:[...el.querySelectorAll<HTMLElement>('.library-navigation [role=tab]')].map(node=>{const rect=node.getBoundingClientRect(),parent=node.parentElement!.getBoundingClientRect(),label=node.querySelector('span')!.getBoundingClientRect();return {left:rect.left,right:rect.right,width:rect.width,height:rect.height,parentLeft:parent.left,parentRight:parent.right,labelWidth:label.width};}),
      art:[...el.querySelectorAll<HTMLElement>('.history-entry .library-track-play')].map(node=>({width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height})),
      rows:[...el.querySelectorAll<HTMLElement>('.history-entry')].map(node=>node.getBoundingClientRect().height)
    }));
    expect(geometry.tabs).toHaveLength(7);
    for(const tab of geometry.tabs){expect(tab.width).toBeGreaterThanOrEqual(44);expect(tab.height).toBeGreaterThanOrEqual(44);expect(tab.left).toBeGreaterThanOrEqual(tab.parentLeft-1);expect(tab.right).toBeLessThanOrEqual(tab.parentRight+1);expect(tab.labelWidth).toBeGreaterThan(20);}
    for(const art of geometry.art){expect(art.width).toBeLessThanOrEqual(56);expect(art.height).toBeLessThanOrEqual(56);expect(art.width).toBeGreaterThanOrEqual(40);}
    for(const height of geometry.rows)expect(height).toBeLessThanOrEqual(110);
    expect(await root.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await capture(page,'history-'+width);
  }
  const scan=await new AxeBuilder({page}).include('.library-page').analyze();expect(scan.violations).toEqual([]);
});

test('LIB-2 missing artist portraits load from profiles with bounded requests and retain a failed-image fallback',async({page})=>{
  const artists=follows.filter(item=>item.kind==='artist').map((item,i)=>({...item,artwork:i===3?'https://yt3.ggpht.com/broken-portrait':null}));
  await page.route('**/v1/me/library',route=>route.fulfill({json:{profile:{id:'00000000-0000-4000-8000-000000000099',mode:'local',displayName:'Il mio spazio',avatar:null},likes:songs,playlists,follows:artists,history:[]}}));
  let current=0,peak=0,calls=0,release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
  await page.route('**/v1/me/catalog/artist/*/artwork',async route=>{
    calls++;current++;peak=Math.max(peak,current);const id=route.request().url().split('/').at(-2)!;await gate;current--;
    await route.fulfill({json:{resource:{...artists.find(item=>item.id===id),artwork:'https://yt3.ggpht.com/profile-'+id}}});
  });
  await page.route('https://yt3.ggpht.com/**',async route=>route.request().url().endsWith('/broken-portrait')?route.abort():route.fulfill({contentType:'image/png',body:await readFile('docs/design/ui-1/preview/assets/sky.png')}));
  await page.setViewportSize({width:1586,height:992});await page.emulateMedia({reducedMotion:'reduce'});const root=await library(page);
  try{
    await root.getByRole('tab',{name:'Artisti',exact:true}).click();await expect(root.locator('.artist-photo-loading')).toHaveCount(2);await capture(page,'artists-loading');expect(peak).toBe(2);release();
    await expect(root.locator('.library-resource-artist img')).toHaveCount(3);await expect(root.locator('.artist-photo-loading')).toHaveCount(0);
    const photos=await root.locator('.library-resource-artist img').evaluateAll(nodes=>nodes.map(node=>({src:(node as HTMLImageElement).src,loaded:(node as HTMLImageElement).naturalWidth>0})));
    expect(photos.every(photo=>photo.src.startsWith('https://yt3.ggpht.com/profile-'))).toBe(true);await expect.poll(()=>root.locator('.library-resource-artist img').evaluateAll(nodes=>nodes.every(node=>(node as HTMLImageElement).naturalWidth>0))).toBe(true);
    await expect(root.locator('.library-resource-artist').last().locator('.library-resource-art>svg')).toBeVisible();await capture(page,'artists-profile-photos');expect(calls).toBe(3);expect(peak).toBeLessThanOrEqual(2);
    await root.getByRole('tab',{name:'Playlist',exact:true}).click();await root.getByRole('tab',{name:'Artisti',exact:true}).click();await expect(root.locator('.library-resource-artist img')).toHaveCount(3);expect(calls).toBe(3);
    for(const width of [1586,1366,640,390]){
      await page.setViewportSize({width,height:992});if(width<=640&&await page.locator('#listening-panel').getAttribute('aria-hidden')==='false')await page.locator('.panel-tabs').getByRole('button',{name:'Nascondi pannello',exact:true}).click();
      const sizes=await root.locator('.library-resource-artist .library-resource-art').evaluateAll(nodes=>nodes.map(node=>({width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height})));
      for(const size of sizes){expect(size.width).toBeLessThanOrEqual(160);expect(size.height).toBeLessThanOrEqual(160);expect(size.width).toBeGreaterThanOrEqual(100);}
      expect(await root.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await capture(page,'artists-sized-'+width);
    }
  }finally{release();}
});
