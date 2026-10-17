import {test,expect,type Page} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
const {version}=JSON.parse(await readFile('package.json','utf8'));
import {tracks} from './fixtures';
const base='http://127.0.0.1:5199',headers={authorization:'Bearer test-token-only'};
test.beforeEach(async({page,request})=>{
  await mkdir(`test-results/visual/player-controls-${version}`,{recursive:true});
  await request.post(`${base}/test-reset-library`);
  await page.addInitScript(({tracks,base})=>{
    window.__RITVIO_TEST_CONFIG__={baseUrl:base,token:'test-token-only'};
    localStorage.setItem('ritvio-player-v1',JSON.stringify({state:{queue:tracks.map((track,i)=>({...track,duration:7320,queueId:`controls-${i}`,source:'collection'})),index:0,duration:7320,position:102,playing:false,volume:.6,muted:true,uiLayout:{sidebarWidth:272,panelWidth:408,motion:'curated',sidebarCollapsed:false}},version:1}));
  },{tracks,base});
  await page.route('https://*.ytimg.com/**',async route=>route.fulfill({contentType:'image/webp',body:await readFile('tests/fixtures/artwork/city.webp')}));
});
async function capture(page:Page,name:string){await page.evaluate(()=>document.fonts.ready);await expect.poll(()=>page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running'&&a.effect?.getComputedTiming().iterations!==Infinity).length)).toBe(0);await page.screenshot({path:`test-results/visual/player-controls-${version}/${name}.png`});}
async function contained(page:Page){
  const result=await page.locator('.wave-time-preview').evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);const ink=range.getBoundingClientRect(),box=el.getBoundingClientRect(),slider=el.parentElement!.getBoundingClientRect();return {inkLeft:ink.left,inkRight:ink.right,left:box.left,right:box.right,sliderLeft:slider.left,sliderRight:slider.right};});
  expect(result.inkLeft).toBeGreaterThanOrEqual(result.left+2);expect(result.inkRight).toBeLessThanOrEqual(result.right-2);expect(result.left).toBeGreaterThanOrEqual(result.sliderLeft-.5);expect(result.right).toBeLessThanOrEqual(result.sliderRight+.5);
}
test('long-time preview stays inside the bubble and rail at both edges and all target widths',async({page})=>{
  await page.goto('/');const slider=page.getByRole('slider',{name:'Posizione del brano'});
  for(const width of [1586,1440,1060,390]){
    await page.setViewportSize({width,height:width===390?844:992});const box=(await slider.boundingBox())!;
    await page.mouse.move(box.x+box.width-2,box.y+box.height/2);await expect(page.locator('.wave-time-preview')).toBeVisible();await expect(page.locator('.wave-time-preview')).toContainText(/\d{3}:\d{2}/);await contained(page);if(width===1586||width===390)await capture(page,`preview-${width}`);
    await page.mouse.move(box.x+2,box.y+box.height/2);await contained(page);
  }
  await page.setViewportSize({width:1586,height:992});await page.getByRole('button',{name:'Impostazioni',exact:true}).click();await page.getByRole('button',{name:'Scuro',exact:true}).click();await page.keyboard.press('Escape');const box=(await slider.boundingBox())!;await page.mouse.move(box.x+box.width-2,box.y+14);await contained(page);await capture(page,'preview-light');
});
test('drag previews until release; Escape and track changes cannot commit a stale gesture',async({page})=>{
  await page.goto('/');const slider=page.getByRole('slider',{name:'Posizione del brano'}),position=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ritvio-player-v1')!).state.position);
  const box=(await slider.boundingBox())!;await page.mouse.move(box.x+box.width*.2,box.y+14);await page.mouse.down();await page.mouse.move(box.x+box.width*.8,box.y+14);await expect(page.locator('.wave-timeline')).toHaveAttribute('data-dragging','true');expect(await position()).toBe(102);await contained(page);await capture(page,'drag-desktop');await page.mouse.up();expect(await position()).toBeGreaterThan(102);
  await slider.press('Home');expect(await position()).toBe(0);await slider.press('ArrowRight');expect(await position()).toBe(5);
  await page.mouse.move(box.x+box.width*.4,box.y+14);await page.mouse.down();await page.mouse.move(box.x+box.width*.9,box.y+14);await page.keyboard.press('Escape');await page.mouse.up();expect(await position()).toBe(5);
  await page.mouse.move(box.x+box.width*.4,box.y+14);await page.mouse.down();await page.locator('.transport').getByRole('button',{name:'Brano successivo',exact:true}).evaluate((el:HTMLButtonElement)=>el.click());await page.mouse.up();await expect(page.locator('.player-track strong')).toHaveText('Secondo brano');expect(await position()).toBeLessThan(1);
});
test('timeline changes height during real fixture playback while every bar keeps its horizontal position',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Attiva audio',exact:true}).click();await page.getByRole('button',{name:'Riproduci',exact:true}).click();const timeline=page.locator('.wave-timeline');await expect(timeline).toHaveAttribute('data-animated','true');
  const sample=()=>timeline.locator('.wave-rail .wave-flow').evaluateAll(elements=>elements.map(el=>{const matrix=(el as SVGGraphicsElement).getCTM()!;return {x:matrix.e,h:matrix.d};}));const before=await sample();await page.waitForTimeout(280);const after=await sample();expect(after.some((value,i)=>Math.abs(value.h-before[i].h)>.005)).toBe(true);after.forEach((value,i)=>expect(value.x).toBeCloseTo(before[i].x,4));
  await expect(page.locator('.player-extras .wave-volume')).toHaveAttribute('data-animated','false');await expect(page.locator('.player-extras .wave-volume svg')).toHaveCount(0);
  await page.emulateMedia({reducedMotion:'reduce'});await expect(timeline).toHaveAttribute('data-animated','false');expect(await timeline.evaluate(el=>el.getAnimations({subtree:true}).some(a=>a.playState==='running'))).toBe(false);
  await page.getByRole('button',{name:'Pausa',exact:true}).click();
});
test('classic volume remains static, filled and operable by keyboard, including settings and mute',async({page})=>{
  await page.setViewportSize({width:1586,height:992});await page.goto('/');const group=page.locator('.player-extras .wave-volume'),volume=group.getByRole('slider',{name:'Volume',exact:true});
  const ratio=()=>group.locator('.volume-fill').evaluate(el=>el.getBoundingClientRect().width/el.parentElement!.getBoundingClientRect().width);await volume.fill('0.4');expect(await ratio()).toBeCloseTo(.4,2);await volume.press('End');expect(Number(await volume.inputValue())).toBe(1);await volume.press('Home');expect(Number(await volume.inputValue())).toBe(0);await volume.fill('0.6');expect(await ratio()).toBeCloseTo(.6,2);
  await expect(group.locator('.volume-fill')).toHaveCSS('opacity','0.65');await page.getByRole('button',{name:'Attiva audio',exact:true}).click();await expect(group.locator('.volume-fill')).toHaveCSS('opacity','1');expect(await group.evaluate(el=>el.getAnimations({subtree:true}).length)).toBe(0);
  await page.getByRole('button',{name:'Impostazioni',exact:true}).click();await page.getByRole('tab',{name:'Audio',exact:true}).click();const settings=page.locator('.settings-volume .wave-volume');await expect(settings.locator('svg')).toHaveCount(0);await settings.getByRole('slider').fill('0.25');await page.keyboard.press('Escape');expect(Number(await volume.inputValue())).toBe(.25);await capture(page,'volume-desktop');
});
test('updated real app shell for UI-5 comps has the approved artwork and static-volume footer',async({page,request})=>{
  await request.get(`${base}/v1/search?q=Musica%20test`,{headers});
  for(const name of ['Classici personali','Da ascoltare','Mappe mentali','Notte intera','Orizzonti','Viaggio notturno']){const playlist=await(await request.post(`${base}/v1/me/playlists`,{headers,data:{name}})).json();await request.post(`${base}/v1/me/playlists/${playlist.id}/items`,{headers:{...headers,'if-match':`"${playlist.revision}"`},data:{mediaId:tracks[0].id}});}
  await page.addInitScript(tracks=>{const songs=tracks.map((track,i)=>({...track,title:i?'Vetro e pioggia':'Luci lontane',artist:'Nora',duration:252,artists:[{id:'UCtestArtist01',name:'Nora'}],album:{id:'MPREb_test1',name:'Città sospese'},queueId:`reference-${i}`,source:'collection'}));localStorage.setItem('ritvio-player-v1',JSON.stringify({state:{queue:songs,recent:songs,index:0,duration:252,position:102,playing:false,volume:.6,muted:false,uiLayout:{sidebarWidth:272,panelWidth:408,motion:'curated',sidebarCollapsed:false}},version:1}));},tracks);
  await page.setViewportSize({width:1586,height:992});await page.goto('/');await expect(page.locator('.sidebar-playlists>button')).toHaveCount(6);await expect(page.locator('.player-extras .volume-fill')).toBeVisible();await capture(page,'ui5-reference');
});
test('Save and Saved keep the heart separated from the label in the listening panel',async({page,request})=>{
  await request.get(`${base}/v1/search?q=Musica%20test`,{headers});await page.goto('/');const button=page.locator('.panel-body .like-with-label');
  const gap=()=>button.evaluate(el=>el.querySelector('span')!.getBoundingClientRect().left-el.querySelector('svg')!.getBoundingClientRect().right);
  await expect(button).toHaveText('Salva');expect(await gap()).toBeGreaterThanOrEqual(7.9);await button.click();await expect(button).toHaveText('Salvato');expect(await gap()).toBeGreaterThanOrEqual(7.9);await capture(page,'saved-desktop');
  await page.setViewportSize({width:390,height:844});await expect(button).toBeVisible();expect(await gap()).toBeGreaterThanOrEqual(7.9);await capture(page,'saved-compact');await button.click();await expect(button).toHaveText('Salva');expect(await gap()).toBeGreaterThanOrEqual(7.9);
});
