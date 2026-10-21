import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {tracks} from './fixtures';
const base='http://127.0.0.1:5199',headers={authorization:'Bearer test-token-only'};
const shots='test-results/visual/ui-6-3';
const songs=tracks.map(track=>({...track,album:{id:'MPREb_test1',name:'Album test 1'}}));
test.beforeEach(async({page,request})=>{
  await mkdir(shots,{recursive:true});await request.post(base+'/test-reset-library');await request.get(base+'/v1/search?q=Musica%20test',{headers});
  await page.addInitScript(({songs,base})=>{
    window.__RITVIO_TEST_CONFIG__={baseUrl:base,token:'test-token-only'};
    localStorage.setItem('ritvio-player-v1',JSON.stringify({state:{queue:songs.map((track,index)=>({...track,queueId:'access-'+index,source:'collection'})),index:0,duration:12,position:4,playing:false,volume:.6,muted:false,uiLayout:{sidebarWidth:272,panelWidth:408,motion:'curated',sidebarCollapsed:false}},version:1}));
  },{songs,base});
  await page.route('https://*.ytimg.com/**',async route=>route.fulfill({contentType:'image/webp',body:await readFile('tests/fixtures/artwork/city.webp')}));
});
async function settle(page:Page){await page.evaluate(()=>document.fonts.ready);await expect.poll(()=>page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running'&&a.effect?.getComputedTiming().iterations!==Infinity).length)).toBe(0);}
async function scan(page:Page,state:string){await settle(page);const expected=state.startsWith('light-')?'light':state.startsWith('dark-')?'dark':undefined;if(expected)await expect(page.locator('html')).toHaveAttribute('data-theme',expected);const theme=await page.locator('html').getAttribute('data-theme');const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();if(expected)await expect(page.locator('html')).toHaveAttribute('data-theme',expected);await page.evaluate(()=>window.getSelection()?.removeAllRanges());await writeFile(`${shots}/axe-${state}.json`,JSON.stringify({url:page.url(),state,theme,violations:result.violations,incomplete:result.incomplete,passes:result.passes.map(rule=>rule.id)},null,2));if(!process.env.RITVIO_A11Y_REPORT_ONLY)expect(result.violations.map(rule=>({id:rule.id,nodes:rule.nodes.map(node=>({target:node.target,summary:node.failureSummary}))})),state).toEqual([]);}
test('automated checks across core surfaces in dark and light themes',async({page,request})=>{
  test.setTimeout(180000);
  const created=await request.post(base+'/v1/me/playlists',{headers,data:{name:'Raccolta dimostrativa'}});let playlist=await created.json();
  playlist=await(await request.post(`${base}/v1/me/playlists/${playlist.id}/items`,{headers:{...headers,'if-match':'"'+playlist.revision+'"'},data:{mediaId:tracks[0].id}})).json();
  for(const theme of ['dark','light']){
    await page.goto('/');if(theme==='light'){await page.getByRole('button',{name:'Impostazioni',exact:true}).click();await page.getByRole('button',{name:'Scuro',exact:true}).click();await page.getByRole('button',{name:'Torna alla musica',exact:true}).click();}
    await scan(page,theme+'-home');
    await page.getByRole('textbox',{name:'Cerca musica'}).fill('Musica test');await expect(page.locator('.track-row').first()).toBeVisible();await scan(page,theme+'-search');await page.screenshot({path:`${shots}/search-${theme}.png`});
    await page.getByRole('button',{name:'La tua libreria',exact:true}).click();await page.locator('.playlist-card').first().click();await expect(page.locator('.playlist-item')).toBeVisible();await scan(page,theme+'-playlist');
    await page.locator('.player-title-link').click();await expect(page.locator('.catalog-album')).toBeVisible();await scan(page,theme+'-album');if(theme==='light')await page.screenshot({path:shots+'/album-light.png'});
    await page.locator('.player-artist-link').first().click();await expect(page.locator('.catalog-artist')).toBeVisible();await scan(page,theme+'-artist');
    await page.locator('#lyrics-reader-trigger').click();await expect(page.locator('.lyrics-reader')).toBeVisible();await scan(page,theme+'-lyrics');
    await page.getByRole('button',{name:'Impostazioni',exact:true}).click();await scan(page,theme+'-preferences');
    await page.getByRole('tab',{name:'Audio',exact:true}).click();await scan(page,theme+'-audio');
    await page.getByRole('button',{name:'Torna alla musica',exact:true}).click();await page.locator('#queue-panel-trigger').click();await scan(page,theme+'-queue');
  }
});

test('album names navigate from search at desktop and compact widths and from both player surfaces',async({page})=>{
  await page.goto('/');let playback=0;page.on('request',request=>{if(request.url().includes('/v1/media/')&&request.url().includes('/playback')&&!request.url().includes('prepare=true'))playback++;});
  for(const width of [1440,640]){
    await page.setViewportSize({width,height:940});await page.getByRole('textbox',{name:'Cerca musica'}).fill('Musica test');await expect(page.locator('.track-row').first()).toBeVisible();
    const row=page.locator('.track-row').filter({has:page.getByRole('button',{name:'Riproduci Secondo brano',exact:true})}).first();
    const link=row.locator('.catalog-inline-link:visible').filter({hasText:'Album test 1'});await expect(link).toHaveCount(1);await link.focus();await link.press('Enter');await expect(page.locator('.catalog-album')).toBeVisible();await expect(page.getByRole('heading',{name:'Album test 1',exact:true})).toBeVisible();
  }
  await page.locator('.player-artist-link').first().click();await expect(page.locator('.catalog-artist')).toBeVisible();await page.locator('.player-album-link').press('Enter');await expect(page.locator('.catalog-album')).toBeVisible();
  await page.setViewportSize({width:1440,height:940});await page.locator('#now-panel-trigger').click();const panelLink=page.locator('.panel-body').getByRole('button',{name:'Apri album: Album test 1',exact:true});await panelLink.press('Enter');await expect(page.locator('.catalog-album')).toBeVisible();expect(playback).toBe(0);await expect(page.locator('.transport').getByRole('button',{name:'Riproduci',exact:true})).toBeVisible();
});

test('skip link, search shortcut, tabs, preferences and slider keys keep predictable focus',async({page})=>{
  await page.goto('/');await expect(page.locator('.skip-link')).toBeAttached();await page.keyboard.press('Tab');await expect(page.locator('.skip-link')).toBeFocused();await page.keyboard.press('Enter');await expect(page.locator('#main-content')).toBeFocused();
  await page.keyboard.press('Control+k');await expect(page.getByRole('textbox',{name:'Cerca musica'})).toBeFocused();
  await page.getByRole('button',{name:'Impostazioni',exact:true}).press('Enter');await expect(page.locator('#main-content')).toBeFocused();
  const appearance=page.getByRole('tab',{name:'Aspetto',exact:true});await appearance.focus();await appearance.press('ArrowRight');await expect(page.getByRole('tab',{name:'Riproduzione',exact:true})).toBeFocused();await page.keyboard.press('End');await expect(page.getByRole('tab',{name:'Privacy',exact:true})).toBeFocused();await page.keyboard.press('Escape');await expect(page.locator('#preferences-trigger')).toBeFocused();
  const seek=page.getByRole('slider',{name:'Posizione del brano',exact:true});await seek.focus();await seek.press('ArrowRight');await expect(seek).toHaveValue('9');await expect(seek).toHaveAttribute('aria-valuetext',/0:09/);await seek.press('Home');await expect(seek).toHaveValue('0');
  const volume=page.getByRole('slider',{name:'Volume',exact:true});await volume.focus();await volume.press('ArrowRight');await expect(volume).toHaveValue('0.61');await expect(volume).toHaveAttribute('aria-valuetext',/61/);await expect(page.locator('.transport').getByRole('button',{name:'Riproduci',exact:true})).toBeVisible();
  await settle(page);await page.screenshot({path:shots+'/keyboard-footer.png'});
});

test('modal traps focus, ignores playback shortcut and restores its opener on Escape',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'La tua libreria',exact:true}).click();const opener=page.locator('.library-header-actions').getByRole('button',{name:'Nuova playlist',exact:true});await opener.press('Enter');const modal=page.getByRole('dialog',{name:'Nuova playlist',exact:true});await expect(modal).toBeVisible();
  await page.getByRole('textbox',{name:'Nome playlist',exact:true}).fill('Playlist di prova');
  for(let step=0;step<7;step++){await page.keyboard.press('Tab');expect(await modal.evaluate(dialog=>dialog.contains(document.activeElement))).toBe(true);}
  await page.keyboard.press('Control+k');expect(await modal.evaluate(dialog=>dialog.contains(document.activeElement))).toBe(true);await scan(page,'dialog');await settle(page);await page.screenshot({path:shots+'/dialog-focus.png'});
  await page.keyboard.press('Escape');await expect(modal).not.toBeVisible();await expect(opener).toBeFocused();await expect(page.locator('.transport').getByRole('button',{name:'Riproduci',exact:true})).toBeVisible();
});

test('search announces loading and recoverable error without announcing the playback clock',async({page})=>{
  let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);await page.route('**/v1/search?*',async route=>{await gate;await route.fulfill({status:503,json:{error:{code:'provider_unavailable',message:'Catalogo dimostrativo temporaneamente indisponibile'}}});});
  await page.goto('/');await page.getByRole('textbox',{name:'Cerca musica'}).fill('Musica test');await expect(page.locator('.search-details [role=status]')).toContainText('Cerco');release();await expect(page.locator('.notice[role=alert]').first()).toBeVisible();await expect(page.locator('.notice').getByRole('button',{name:'Riprova',exact:true})).toBeVisible();await scan(page,'search-error');
  await expect(page.locator('.playerbar [role=status]')).toContainText(songs[0].title);await expect(page.locator('.timeline [role=status]')).toHaveCount(0);
});

test('reduced motion and compact windows preserve keyboard album access and content',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
  for(const width of [640,390]){await page.setViewportSize({width,height:600});await page.locator('#queue-panel-trigger').click();await page.locator('.panel-tabs').getByRole('button',{name:'Nascondi pannello',exact:true}).press('Enter');await expect(page.locator('#queue-panel-trigger')).toBeFocused();await expect(page.locator('#listening-panel')).toHaveAttribute('inert','');await page.locator('.player-album-link').press('Enter');await expect(page.locator('.catalog-album')).toBeVisible();await scan(page,'compact-'+width);await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect.poll(()=>page.evaluate(()=>document.querySelector('main')!.scrollWidth<=document.querySelector('main')!.clientWidth+1)).toBe(true);await expect(page.locator('.player-album-line')).toHaveAttribute('data-scroll','false');await page.screenshot({path:`${shots}/compact-${width}.png`});}
});

test('missing album metadata keeps playback available without invented album links',async({page})=>{
  await page.addInitScript(({base,songs})=>{window.__RITVIO_TEST_CONFIG__={baseUrl:base,token:'test-token-only'};localStorage.setItem('ritvio-player-v1',JSON.stringify({state:{queue:songs.map(({album,...track},index)=>({...track,queueId:'missing-'+index})),index:0,playing:false,position:0,volume:.6},version:1}));},{base,songs});
  await page.route('**/v1/search?*',async route=>{const response=await route.fetch(),body=await response.json();body.items=body.items.map(({album,...track}:{album?:unknown;id:string})=>track);await route.fulfill({json:body});});
  await page.goto('/');await expect(page.locator('.player-album-link')).toHaveCount(0);await page.getByRole('textbox',{name:'Cerca musica'}).fill('Musica test');await expect(page.locator('.track-row').first()).toBeVisible();await expect(page.locator('.track-row .track-album .catalog-inline-link')).toHaveCount(0);await expect(page.locator('.transport').getByRole('button',{name:'Riproduci',exact:true})).toBeVisible();
});
