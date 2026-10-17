import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {tracks} from './fixtures';
const base='http://127.0.0.1:5199',headers={authorization:'Bearer test-token-only'};
const longTitle='Luci lontane — una notte senza fine, versione dal vivo con orchestra e un finale da ricordare';
const longArtist='Nora e il collettivo delle città sospese insieme agli ospiti della sera';
const songs=tracks.map((tr,i)=>({...tr,title:i?'UnaParolaMoltoLungaSenzaSpazi'.repeat(5):longTitle,artist:longArtist,artists:[{id:'UCtestArtist01',name:longArtist}],album:{id:'MPREb_test1',name:'Città sospese — edizione completa, rarità e registrazioni dal vivo'}}));
const version=JSON.parse(await readFile('package.json','utf8')).version;
const shots=`test-results/visual/ui-6-1-${version}`;
test.beforeEach(async({page,request})=>{
  await mkdir(shots,{recursive:true});await request.post(base+'/test-reset-library');await request.get(base+'/v1/search?q=Musica%20test',{headers});
  await page.addInitScript(({songs,base})=>{
    window.__RITVIO_TEST_CONFIG__={baseUrl:base,token:'test-token-only'};
    localStorage.setItem('ritvio-player-v1',JSON.stringify({state:{queue:Array.from({length:12},(_,i)=>({...songs[i%2],queueId:'read-'+i,source:'collection'})),recent:songs,index:0,duration:12,position:4,playing:false,volume:.6,muted:false,uiLayout:{sidebarWidth:272,panelWidth:408,motion:'curated',sidebarCollapsed:false}},version:1}));
  },{songs,base});
  await page.route('https://*.ytimg.com/**',async route=>route.fulfill({contentType:'image/webp',body:await readFile('tests/fixtures/artwork/city.webp')}));
  await page.route('**/v1/search?*',async route=>{const response=await route.fetch(),body=await response.json();body.items=body.items.map((tr:typeof tracks[number],i:number)=>({...tr,...songs[i%2],id:tr.id,videoId:tr.videoId}));await route.fulfill({json:body});});
  await page.route('**/v1/me/playlists/*',async route=>{if(route.request().method()!=='GET')return route.continue();const response=await route.fetch(),body=await response.json();if(body.items)body.items=body.items.map((entry:{track:typeof tracks[number]},i:number)=>({...entry,track:{...entry.track,...songs[i%2]}}));await route.fulfill({json:body});});
});
async function collections(request:APIRequestContext){
  let first='';for(let i=0;i<4;i++){
    const created=await request.post(base+'/v1/me/playlists',{headers,data:{name:`Raccolta ${i+1} — le notti delle città sospese, ricordi e registrazioni da ascoltare insieme`}});expect(created.ok()).toBe(true);let p=await created.json();if(!first)first=p.id;
    for(let j=0;j<8;j++)p=await(await request.post(base+'/v1/me/playlists/'+p.id+'/items',{headers:{...headers,'if-match':'"'+p.revision+'"'},data:{mediaId:tracks[j%2].id}})).json();
  }return first;
}
async function settle(page:Page){await page.evaluate(()=>document.fonts.ready);await expect.poll(()=>page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running'&&a.effect?.getComputedTiming().iterations!==Infinity).length)).toBe(0);}
async function shot(page:Page,name:string){await settle(page);await page.screenshot({path:shots+'/'+name+'.png'});}
async function contained(page:Page,selector:string){return page.locator(selector).evaluateAll(nodes=>nodes.every(el=>{
  const bounds=el.getBoundingClientRect();if(!bounds.width)return true;const owner=el.closest('.library-browser-tools,.highlight-card,.library-track-title,.track-name')?.getBoundingClientRect();
  return !!owner&&bounds.left>=owner.left-1&&bounds.right<=owner.right+1;
}));}
async function footerFits(page:Page,width:number){
  await settle(page);
  const metrics=await page.locator('.playerbar').evaluate(el=>{
    const buttons=Array.from(el.querySelectorAll<HTMLElement>('.icon-button')).filter(e=>e.getBoundingClientRect().width>0);
    const rects=buttons.map(e=>e.getBoundingClientRect());const overlaps=rects.some((a,i)=>rects.slice(i+1).some(b=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1));
    const text=el.querySelector<HTMLElement>('.player-track>div:not(.cover)')!.getBoundingClientRect();
    return {overlaps,nameWidth:text.width,contained:rects.every(r=>r.left>=0&&r.right<=innerWidth),mic:el.querySelector('#lyrics-reader-trigger')?.getBoundingClientRect().width};
  });expect(metrics.overlaps,`Footer controls at ${width}px`).toBe(false);expect(metrics.contained).toBe(true);expect(metrics.mic).toBeGreaterThanOrEqual(28);if(width>=801)expect(metrics.nameWidth).toBeGreaterThanOrEqual(119);
}
async function audit(page:Page){return page.evaluate(()=>{
  const rect=(el:Element)=>{const b=el.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height};};
  const measure=(selector:string)=>Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(el=>el.getBoundingClientRect().width>0).map(el=>({text:el.textContent?.slice(0,80),...rect(el),scroll:el.scrollWidth,client:el.clientWidth}));
  const footer=Array.from(document.querySelectorAll<HTMLElement>('.playerbar .icon-button')).filter(el=>el.getBoundingClientRect().width>0).map(el=>({label:el.getAttribute('aria-label'),...rect(el)}));
  return {viewport:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth,mainWidth:document.querySelector('main')?.clientWidth,player:measure('.player-track>div:not(.cover)'),rowNames:measure('.track-name,.library-track-title'),headers:measure('.page-heading,.playlist-hero'),footer};
});}
test('long names remain contained across home search collections queue and footer',async({page,request})=>{
  test.setTimeout(90000);await collections(request);const evidence=[];
  for(const width of [1440,1280,1060,780,680,640,390]){
    await page.setViewportSize({width,height:940});await page.goto('/');await expect(page.locator('.resume-banner')).toBeVisible();await footerFits(page,width);if(width===1440||width===680)await shot(page,'home-'+width);evidence.push({view:'home',...await audit(page)});
    await page.getByRole('textbox',{name:'Cerca musica'}).fill('Musica test');await expect(page.locator('.tracks .track-row').first()).toBeVisible();expect(await contained(page,'.track-name-play,.highlight-actions>button')).toBe(true);if([1280,780,390].includes(width))await shot(page,'search-'+width);evidence.push({view:'search',...await audit(page)});
    await page.getByRole('button',{name:'La tua libreria',exact:true}).click();await expect(page.locator('.playlist-card')).toHaveCount(4);expect(await contained(page,'.library-local-search,.library-browser-controls>.library-browser-select')).toBe(true);if([1440,390].includes(width))await shot(page,'library-'+width);evidence.push({view:'library',...await audit(page)});
    await page.locator('.playlist-card').first().click();await expect(page.locator('.playlist-item')).toHaveCount(8);expect(await contained(page,'.library-track-title>button,.library-local-search,.library-browser-controls>.library-browser-select')).toBe(true);if([1280,390].includes(width))await shot(page,'playlist-'+width);evidence.push({view:'playlist',...await audit(page)});
    await expect.poll(()=>page.evaluate(()=>document.querySelector('main')!.scrollWidth<=document.querySelector('main')!.clientWidth+1)).toBe(true);
  }
  await page.setViewportSize({width:1440,height:940});await page.locator('#queue-panel-trigger').click();await expect(page.locator('.queue-tools')).toBeVisible();await shot(page,'queue-1440');evidence.push({view:'queue',...await audit(page)});
  await writeFile(shots+'/METRICS.json',JSON.stringify(evidence,null,2));
});

test('full names remain available and compact row actions work with keyboard',async({page,request})=>{
  await collections(request);await page.setViewportSize({width:1280,height:940});await page.goto('/');await expect(page.locator('.player-track strong')).toHaveAttribute('title',longTitle);
  await page.getByRole('button',{name:'La tua libreria',exact:true}).click();await expect(page.locator('.playlist-card').first()).toHaveAttribute('title',/registrazioni da ascoltare insieme/);await page.locator('.playlist-card').first().click();
  const row=page.locator('.playlist-item').first();await expect(row.locator('.library-track-title strong')).toHaveAttribute('title',longTitle);await expect(row.locator('.catalog-inline-link').first()).toHaveAttribute('title',longArtist);
  const menu=row.getByRole('button',{name:`Opzioni di ascolto: ${longTitle}`,exact:true});await menu.focus();await page.keyboard.press('Enter');await expect(page.locator('.listening-options:popover-open')).toBeVisible();await page.keyboard.press('Escape');await expect(menu).toBeFocused();
  await page.setViewportSize({width:640,height:600});await footerFits(page,640);await page.locator('#lyrics-reader-trigger').click();await expect(page.locator('.lyrics-reader')).toBeVisible();await page.locator('#lyrics-reader-trigger').click();await expect(page.locator('.playlist-item')).toHaveCount(8);
});

test('long query and resizable panels preserve row and toolbar space in the light theme',async({page,request})=>{
  await collections(request);await page.setViewportSize({width:1280,height:940});await page.goto('/');await page.getByRole('separator',{name:'Ridimensiona la libreria',exact:true}).press('End');
  await page.getByRole('textbox',{name:'Cerca musica'}).fill('UnaQuerySenzaSpazi'.repeat(10));await expect(page.locator('.tracks .track-row').first()).toBeVisible();expect(await contained(page,'.track-name-play,.highlight-actions>button')).toBe(true);await expect.poll(()=>page.evaluate(()=>document.querySelector('main')!.scrollWidth<=document.querySelector('main')!.clientWidth+1)).toBe(true);
  await page.getByRole('button',{name:'Impostazioni',exact:true}).click();await page.getByRole('button',{name:'Scuro',exact:true}).click();await page.getByRole('button',{name:'Torna alla musica',exact:true}).click();await page.getByRole('button',{name:'La tua libreria',exact:true}).click();await shot(page,'library-light');
  await page.locator('.playlist-card').first().click();await page.locator('.duration-filter-control summary').click();await expect(page.getByRole('combobox',{name:'Durata del brano',exact:true})).toBeVisible();await page.getByRole('combobox',{name:'Durata del brano',exact:true}).selectOption('short');await expect(page.locator('.playlist-item')).toHaveCount(8);expect(await contained(page,'.library-local-search,.library-browser-controls>.library-browser-select')).toBe(true);
});
