import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
import {tracks} from './fixtures';
const base='http://127.0.0.1:5199',headers={authorization:'Bearer test-token-only'};
test.beforeEach(async({page,request})=>{
  await request.post(`${base}/test-reset-library`);
  await page.addInitScript(({tracks,base})=>{
    window.__RITVIO_TEST_CONFIG__={baseUrl:base,token:'test-token-only'};
    if(!localStorage.getItem('ritvio-player-v1'))localStorage.setItem('ritvio-player-v1',JSON.stringify({state:{queue:tracks.map((track,i)=>({...track,queueId:`ui3-${i}`,source:'collection'})),index:0,position:4,playing:false,volume:.6,muted:true,uiLayout:{sidebarWidth:272,panelWidth:408,motion:'curated',sidebarCollapsed:false}},version:1}));
  },{tracks,base});
  await page.route('https://*.ytimg.com/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><rect width="320" height="320" fill="#736d91"/></svg>'}));
});
async function collection(request:APIRequestContext,count=12){
  await request.get(`${base}/v1/search?q=Musica%20test`,{headers});
  let data=(await request.post(`${base}/v1/me/playlists`,{headers,data:{name:'Raccolta UI-3'}})).json();let playlist=await data;
  for(let i=0;i<count;i++)playlist=await(await request.post(`${base}/v1/me/playlists/${playlist.id}/items`,{headers:{...headers,'if-match':`"${playlist.revision}"`},data:{mediaId:tracks[i%2].id}})).json();
  return playlist;
}
async function openCollection(page:Page){await page.goto('/');await page.getByRole('button',{name:'Raccolta UI-3',exact:true}).click();await expect(page.locator('.playlist-item').first()).toBeVisible();}
test('resume time and progress follow real seek while playback stays paused',async({page})=>{
  await page.goto('/');const slider=page.getByRole('slider',{name:'Posizione del brano'});await expect(slider).toBeEnabled();await slider.fill('8');
  await expect(page.locator('.resume-progress time')).toContainText('0:08');await expect(page.locator('.resume-progress progress')).toHaveAttribute('value','8');await expect(page.getByRole('button',{name:'Riproduci',exact:true})).toBeVisible();
});
test('timeline remains visible when muted; classic volume fills to its real value',async({page})=>{
  await page.setViewportSize({width:1586,height:992});await page.goto('/');
  const timeline=page.locator('.wave-timeline'),volume=page.locator('.player-extras .wave-volume');
  await expect(timeline.locator('.wave-fill')).toHaveCSS('opacity','1');
  expect(await timeline.evaluate(el=>Number((el as HTMLElement).style.getPropertyValue('--wave-amplitude')))).toBeGreaterThan(.5);
  await page.getByRole('slider',{name:'Posizione del brano',exact:true}).fill('8');
  await expect(timeline.locator('.wave-fill')).toHaveCSS('clip-path',/inset\(0px 33\.333/);
  await page.locator('.player-extras').getByRole('slider',{name:'Volume',exact:true}).fill('0.4');
  expect(await volume.locator('.volume-fill').evaluate(el=>el.getBoundingClientRect().width/el.parentElement!.getBoundingClientRect().width)).toBeCloseTo(.4,2);
  await expect(volume.locator('svg')).toHaveCount(0);
});
test('clock directly opens timer and mobile controls do not collide in either timer state',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');const clock=page.locator('.player-extras').getByRole('button',{name:'Timer di spegnimento',exact:true});
  const separate=async()=>{const a=await page.locator('#lyrics-reader-trigger').boundingBox(),b=await clock.boundingBox();expect(a&&b).toBeTruthy();expect(a!.x+a!.width).toBeLessThanOrEqual(b!.x);};
  await separate();await clock.click();const popup=page.locator('.timer-popover');await expect(popup.getByRole('button',{name:'15 min',exact:true})).toBeVisible();await popup.getByRole('button',{name:'15 min',exact:true}).click();await expect(clock).toHaveAttribute('aria-pressed','true');await page.keyboard.press('Escape');await separate();
  await clock.click();await popup.getByRole('button',{name:'Annulla timer',exact:true}).click();await expect(clock).toHaveAttribute('aria-pressed','false');
});
test('playlist exposes one title, six complete rows and an advanced duration filter',async({page,request})=>{
  await page.setViewportSize({width:1586,height:992});await collection(request);await openCollection(page);await expect(page.getByRole('heading',{name:'Raccolta UI-3',exact:true})).toHaveCount(1);
  const complete=await page.locator('.playlist-item').evaluateAll(rows=>rows.filter(el=>{const r=el.getBoundingClientRect();return r.top>=70&&r.bottom<=innerHeight-104;}).length);expect(complete).toBeGreaterThanOrEqual(6);
  const sort=page.getByRole('combobox',{name:'Ordina per'});expect((await sort.boundingBox())!.width).toBeGreaterThanOrEqual(200);
  await page.locator('.duration-filter-control summary').click();await page.getByRole('combobox',{name:'Durata del brano'}).selectOption('short');await expect(page.locator('.playlist-item')).toHaveCount(12);
});
test('track menu labels, playlist tools and row removal remain usable',async({page,request})=>{
  await collection(request,2);await openCollection(page);const row=page.locator('.playlist-item').first();await row.getByRole('button',{name:'Opzioni di ascolto: Primo & brano'}).click();
  const menu=page.locator('.listening-options:popover-open');for(const text of ['Copia link','Sposta su Primo & brano','Sposta giù Primo & brano','Rimuovi dalla playlist: Primo & brano'])await expect(menu.getByText(text,{exact:true})).toBeVisible();
  await menu.getByRole('button',{name:'Rimuovi dalla playlist: Primo & brano'}).click();await expect(page.locator('.playlist-item')).toHaveCount(1);await expect(page.getByRole('button',{name:/Annulla.*1/})).toBeVisible();
});
test('copy link keeps its confirmation visible and accessible inside the menu',async({page,request,context})=>{
  await context.grantPermissions(['clipboard-read','clipboard-write']);await collection(request,1);await openCollection(page);
  await page.locator('.playlist-item').getByRole('button',{name:'Opzioni di ascolto: Primo & brano'}).click();
  const menu=page.locator('.listening-options:popover-open');await menu.getByRole('button',{name:'Copia link YouTube: Primo & brano'}).click();
  await expect(menu).toBeVisible();await expect(menu.getByRole('status')).toHaveText('Link copiato');
  await expect(menu.getByRole('button',{name:'Copia link YouTube: Primo & brano'})).toContainText('Link copiato');
  expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(tracks[0].canonicalUrl);
});
test('unknown collection duration is not reported as zero',async({page,request})=>{
  const playlist=await collection(request,1);await page.route(`**/v1/me/playlists/${playlist.id}`,async route=>{const result=await route.fetch();await route.fulfill({response:result,json:{...await result.json(),durationSeconds:null}});});await openCollection(page);
  await expect(page.locator('.playlist-hero')).toContainText('Durata non disponibile');await expect(page.locator('.playlist-hero')).not.toContainText('0:00');
});
test('combined search shows artist and attributed albums while preserving weaker matches',async({page})=>{
  await page.goto('/');await page.getByRole('textbox',{name:'Cerca musica'}).fill('Artista test');await expect(page.locator('.catalog-search-tabs').getByRole('button',{name:'Tutto',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.highlight-artist')).toContainText('Artista test');await expect(page.locator('.highlight-album')).toHaveCount(1);await expect(page.locator('.tracks .track-row')).toHaveCount(3);await expect(page.getByRole('heading',{name:'Altre corrispondenze',exact:true})).toBeVisible();await expect(page.locator('.search-track-group').last()).toContainText('Altro interprete');
});
