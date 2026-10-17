import {test,expect,type Page} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
import {tracks} from './fixtures';
const base='http://127.0.0.1:5199',headers={authorization:'Bearer test-token-only'};
const version=JSON.parse(await readFile('package.json','utf8')).version;
const shots=`.impeccable/review/ui-5-${version}`;
test.beforeEach(async({page,request})=>{
  await mkdir(shots,{recursive:true});await request.post(base+'/test-reset-library');await request.get(base+'/v1/search?q=Musica%20test',{headers});
  await page.addInitScript(({tracks,base})=>{
    window.__RITVIO_TEST_CONFIG__={baseUrl:base,token:'test-token-only'};
    if(!localStorage.getItem('ritvio-player-v1'))localStorage.setItem('ritvio-player-v1',JSON.stringify({state:{queue:[tracks[1],tracks[0]].map((track,i)=>({...track,queueId:'ui5-'+i,source:'collection'})),index:0,duration:12,position:4,volume:.6,muted:false,playing:false,uiLayout:{sidebarWidth:272,panelWidth:408,motion:'curated',sidebarCollapsed:false}},version:1}));
  },{tracks,base});
  await page.route('https://*.ytimg.com/**',async route=>route.fulfill({contentType:'image/png',body:await readFile('docs/design/ui-1/preview/assets/city.png')}));
});
async function lyrics(page:Page){await page.goto('/');if(await page.locator('#listening-panel').getAttribute('aria-hidden')==='true')await page.locator('#now-panel-trigger').click();await page.locator('#lyrics-reader-trigger').click();await expect(page.locator('main .lyrics-reader')).toBeVisible();}
async function preferences(page:Page){await page.getByRole('button',{name:'Impostazioni',exact:true}).click();await expect(page.getByRole('tab',{name:'Audio',exact:true})).toBeVisible();await page.getByRole('tab',{name:'Audio',exact:true}).click();}
const state=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('ritvio-player-v1')!).state);
async function capture(page:Page,name:string){await page.evaluate(()=>{window.scrollTo({left:0,top:0,behavior:'instant'});document.querySelector('main')?.scrollTo({left:0,top:0,behavior:'instant'});return document.fonts.ready;});await expect.poll(()=>page.evaluate(()=>window.scrollX)).toBe(0);await expect.poll(()=>page.evaluate(()=>document.querySelector('.app')!.scrollLeft)).toBe(0);await expect.poll(()=>page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running'&&a.effect?.getComputedTiming().iterations!==Infinity).length)).toBe(0);await page.screenshot({path:shots+'/'+name+'.png'});}
test('central lyrics keep sync, manual reading, keyboard and line seeks isolated from transport',async({page})=>{
  await lyrics(page);const reader=page.locator('.lyrics-reader');await expect(reader.locator('.lyric-line[aria-current=true]')).toHaveText('Seconda riga di prova');
  const before=await state(page);await reader.locator('.lyrics-scroll').focus();await page.keyboard.press('ArrowDown');expect((await state(page)).volume).toBe(before.volume);expect((await state(page)).position).toBe(before.position);await expect(reader.getByRole('button',{name:'Riprendi scorrimento',exact:true})).toBeVisible();
  await reader.getByRole('button',{name:'Riprendi scorrimento',exact:true}).click();await expect(reader.getByRole('button',{name:'Scorrimento attivo',exact:true})).toBeVisible();
  await reader.locator('.lyric-line').last().click();expect((await state(page)).position).toBe(8);await expect(page.locator('.transport').getByRole('button',{name:'Riproduci',exact:true})).toBeVisible();await reader.getByRole('button',{name:'Testo',exact:true}).click();await expect(reader.locator('.lyrics-plain')).toContainText('Ultima riga originale');await expect(reader.locator('.lyric-line')).toHaveCount(0);
});
test('versions and personal import remain available; invalid imports preserve the document',async({page})=>{
  await lyrics(page);const reader=page.locator('.lyrics-reader');await reader.getByRole('button',{name:'Azioni dei testi'}).click();await reader.getByRole('button',{name:'Cerca versione'}).click();await reader.getByRole('button',{name:'Cerca testi',exact:true}).click();await reader.locator('.lyrics-candidates>button').click();await expect(reader.locator('.lyrics-remove')).toBeVisible();
  await reader.locator('input[type=file]').setInputFiles({name:'personale.txt',mimeType:'text/plain',buffer:Buffer.from('Testo personale originale\nSeconda riga personale')});await expect(reader.locator('.lyrics-plain')).toHaveText('Testo personale originale\nSeconda riga personale');await expect(reader.locator('.lyrics-source')).toContainText('personale.txt');
  await reader.locator('input[type=file]').setInputFiles({name:'errato.lrc',mimeType:'text/plain',buffer:Buffer.from('File senza tempi validi')});await expect(reader.getByRole('alert')).toBeVisible();await expect(reader.locator('.lyrics-plain')).toContainText('Testo personale originale');
  await page.reload();await expect(page.locator('.panel-tabs')).toBeVisible();await page.locator('#lyrics-reader-trigger').click();await expect(page.locator('.lyrics-plain')).toContainText('Testo personale originale');await page.locator('.lyrics-remove').click();await expect(page.locator('.lyric-line')).toHaveCount(3);
});
test('five vertical bands, preset, bypass and auxiliary controls persist without activating playback',async({page})=>{
  await page.goto('/');await preferences(page);const panel=page.locator('.audio-workspace'),bass=panel.getByRole('slider',{name:'Bassi, 80 Hz',exact:true});
  await panel.getByRole('combobox',{name:'Preset'}).selectOption('warm');expect((await state(page)).audioPreferences.bands).toEqual([4,2,0,-1,-2]);await bass.press('ArrowUp');expect(Number(await bass.inputValue())).toBe(4.5);
  await panel.getByRole('switch').click();await expect(panel.getByRole('switch')).toHaveAttribute('aria-checked','true');await panel.getByRole('slider',{name:'Preamplificazione',exact:true}).fill('-3');await panel.getByRole('slider',{name:'Bilanciamento',exact:true}).fill('0.25');await panel.getByRole('button',{name:'Bypass',exact:true}).click();await expect(panel.getByRole('switch')).toHaveAttribute('aria-checked','false');
  const saved=(await state(page)).audioPreferences;await page.reload();await preferences(page);expect((await state(page)).audioPreferences).toEqual(saved);await expect(page.locator('.transport').getByRole('button',{name:'Riproduci',exact:true})).toBeVisible();
  await page.locator('.audio-workspace').getByRole('button',{name:'Azzera regolazioni'}).click();const cleared=(await state(page)).audioPreferences;expect(cleared.bands).toEqual([0,0,0,0,0]);expect(cleared.preamp).toBe(0);expect(cleared.pan).toBe(0);expect(cleared.enabled).toBe(false);
});
test('preference categories support keyboard, close/back, theme and essential motion',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Impostazioni',exact:true}).click();const tabs=page.getByRole('tablist',{name:'Categorie delle preferenze'});await tabs.getByRole('tab',{name:'Aspetto'}).focus();await page.keyboard.press('ArrowRight');await expect(tabs.getByRole('tab',{name:'Riproduzione'})).toBeFocused();await expect(page.getByRole('tabpanel')).toContainText('Ogni voce della coda');
  await page.keyboard.press('End');await expect(tabs.getByRole('tab',{name:'Privacy'})).toBeFocused();await expect(page.getByRole('tabpanel')).toContainText('Ascolto privato');await page.keyboard.press('Home');await page.getByRole('button',{name:'Scuro',exact:true}).click();await page.getByRole('combobox',{name:'Animazioni',exact:true}).selectOption('essential');await expect(page.locator('html')).toHaveAttribute('data-theme','light');await expect(page.locator('html')).toHaveAttribute('data-motion','essential');await page.keyboard.press('Escape');await expect(page.locator('.preferences-page')).toHaveCount(0);await expect(page.getByRole('button',{name:'Impostazioni',exact:true})).toBeFocused();
});
test('wide and portrait images fill song cards and the enlarged listening panel; failures have a fallback',async({page})=>{
  await page.unroute('https://*.ytimg.com/**');await page.route('https://*.ytimg.com/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200"><rect width="600" height="200" fill="#8860a8"/></svg>'}));await page.goto('/');
  const images=page.locator('.resume-banner .cover img,.recent-card .cover img,.now-artwork .cover img');await expect(images.first()).toBeVisible();expect(await images.evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).objectFit==='cover'))).toBe(true);
  const size=await page.locator('.now-artwork').evaluate(el=>({width:el.getBoundingClientRect().width,parent:el.parentElement!.getBoundingClientRect().width}));expect(size.width).toBeCloseTo(size.parent,0);const ratios=await images.evaluateAll(nodes=>nodes.map(el=>{const img=el.getBoundingClientRect(),box=el.parentElement!.getBoundingClientRect();return [img.width/box.width,img.height/box.height]}));ratios.forEach(r=>r.forEach(v=>expect(v).toBeCloseTo(1,2)));
  await page.unroute('https://*.ytimg.com/**');await page.route('https://*.ytimg.com/**',route=>route.fulfill({status:404}));await page.reload();await expect(page.locator('.now-artwork .cover')).toHaveAttribute('data-artwork','fallback');await expect(page.locator('.now-artwork .cover>svg')).toBeVisible();
});
const demoLines=['La città respira piano','Sotto un cielo che ci aspetta','E ogni luce trova il suo nome','Mentre il tempo cambia strada','Restiamo qui ancora un momento','Prima che cominci il giorno'];
test('approved compositions are captured at desktop intermediate compact and light sizes with original demo text',async({page,request})=>{
  test.setTimeout(60000);
  for(const name of ['Classici personali','Da ascoltare','Mappe mentali','Notte intera','Orizzonti','Viaggio notturno']){const p=await(await request.post(base+'/v1/me/playlists',{headers,data:{name}})).json();await request.post(base+'/v1/me/playlists/'+p.id+'/items',{headers:{...headers,'if-match':'"'+p.revision+'"'},data:{mediaId:tracks[1].id}});}
  await page.addInitScript(({tracks})=>{const songs=[tracks[1],tracks[0]].map((tr,i)=>({...tr,title:i?'Vetro e pioggia':'Luci lontane',artist:'Nora',artists:[{id:'UCtestArtist01',name:'Nora'}],album:{id:'MPREb_test1',name:'Città sospese'},duration:252,queueId:'demo-'+i,source:'collection'}));localStorage.setItem('ritvio-player-v1',JSON.stringify({state:{queue:songs,recent:songs,index:0,duration:252,position:102,volume:.6,muted:false,playing:false,audioPreferences:{enabled:true,bands:[2,0,-1,1,1.5],preamp:-3,pan:0},uiLayout:{sidebarWidth:272,panelWidth:408,motion:'curated',sidebarCollapsed:false}},version:1}));},{tracks});
  await page.route('**/v1/me/lyrics/*',route=>route.fulfill({json:{status:'ready',document:{provider:'local',providerId:null,title:'Luci lontane',artist:'Nora',fileName:'testo-originale.lrc',instrumental:false,plainText:demoLines.join('\n'),lines:demoLines.map((text,i)=>({at:i*41,text})),offsetMs:0,fetchedAt:Date.now(),licenseVerified:null},cacheHit:true,savedChoice:true}}));
  for(const width of [1586,1440,1280,1060,390]){
    await page.setViewportSize({width,height:width===390?844:992});await lyrics(page);const reader=page.locator('.lyrics-reader');
    await expect(reader.locator('.lyric-line')).toHaveCount(6);await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    if([1586,1440,1280,390].includes(width))await capture(page,'lyrics-'+width);
    await preferences(page);await expect(page.locator('.audio-bands .audio-band')).toHaveCount(5);await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const bounds=await page.locator('.audio-workspace').evaluate(el=>({scroll:el.scrollWidth,width:el.clientWidth}));expect(bounds.scroll).toBeLessThanOrEqual(bounds.width+1);if([1586,1440,1280,390].includes(width))await capture(page,'audio-'+width);
  }
  await page.setViewportSize({width:1586,height:992});await page.getByRole('tab',{name:'Aspetto',exact:true}).click();await page.getByRole('button',{name:'Scuro',exact:true}).click();await page.getByRole('tab',{name:'Audio',exact:true}).click();await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await capture(page,'audio-light');await page.getByRole('button',{name:'Torna alla musica'}).click();await expect(page.locator('.lyrics-reader')).toBeVisible();await capture(page,'lyrics-light');await page.emulateMedia({reducedMotion:'reduce'});expect(await page.locator('.lyric-line').first().evaluate(el=>getComputedStyle(el).transitionDuration)).toBe('0s');
});
test('missing and network-error lyrics offer real recovery and preserve navigation',async({page})=>{
  await page.route('**/v1/me/lyrics/*',route=>route.fulfill({status:503,json:{error:{code:'UNAVAILABLE',message:'Testo non disponibile. Riprova.'}}}));await lyrics(page);await expect(page.locator('.lyrics-reader').getByRole('alert')).toContainText('Riprova');await page.unroute('**/v1/me/lyrics/*');await page.locator('.lyrics-reader').getByRole('button',{name:'Azioni dei testi'}).click();await page.locator('.lyrics-reader').getByRole('button',{name:'Riprova a caricare il testo'}).click();await expect(page.locator('.lyric-line')).toHaveCount(3);
  await page.locator('.transport').getByRole('button',{name:'Brano successivo',exact:true}).click();await expect(page.locator('.lyrics-reader')).toContainText('Testo non trovato');await expect(page.locator('.lyrics-reader').getByRole('button',{name:'Azioni dei testi'})).toBeVisible();
});

test('real fixture audio continues through lyrics and preferences without replacing the stream',async({page})=>{
  await page.goto('/');await page.getByRole('slider',{name:'Posizione del brano',exact:true}).fill('0');await page.locator('.transport').getByRole('button',{name:'Riproduci',exact:true}).click();
  const snapshot=()=>page.evaluate(async()=>{const modulePath='/src/player.tsx';const {audio}=await import(modulePath);return {src:audio.src,paused:audio.paused,time:audio.currentTime};});
  await expect.poll(async()=>(await snapshot()).paused).toBe(false);const start=await snapshot();
  await page.locator('#lyrics-reader-trigger').click();await preferences(page);await expect(page.locator('.transport').getByRole('button',{name:'Pausa',exact:true})).toBeVisible();
  await expect.poll(async()=>(await snapshot()).time).toBeGreaterThan(start.time);expect((await snapshot()).src).toBe(start.src);await page.locator('.transport').getByRole('button',{name:'Pausa',exact:true}).click();
});

test('long lyrics scroll down and up with the cursor in the empty space to their right',async({page})=>{
  const lines=Array.from({length:40},(_,i)=>({at:i*10,text:`Riga originale di prova ${i+1}`}));
  await page.route('**/v1/me/lyrics/*',route=>route.fulfill({json:{status:'ready',document:{provider:'local',providerId:null,title:tracks[1].title,artist:tracks[1].artist,fileName:'lungo.lrc',instrumental:false,plainText:lines.map(l=>l.text).join('\n'),lines,offsetMs:0,fetchedAt:Date.now(),licenseVerified:null},cacheHit:true,savedChoice:true}}));
  await lyrics(page);const area=page.locator('.lyrics-reader .lyrics-scroll');await expect(area.locator('.lyric-line')).toHaveCount(40);
  const box=await area.boundingBox();expect(box).not.toBeNull();
  const metrics=await area.evaluate(el=>({client:el.clientHeight,scroll:el.scrollHeight}));
  expect(metrics.scroll).toBeGreaterThan(metrics.client+200);
  await area.evaluate(el=>el.scrollTo({top:0,behavior:'instant'}));
  await page.mouse.move(box!.x+box!.width-24,Math.min(box!.y+150,700));await page.mouse.wheel(0,350);
  await expect.poll(()=>area.evaluate(el=>el.scrollTop)).toBeGreaterThan(100);
  await expect(page.getByRole('button',{name:'Riprendi scorrimento',exact:true})).toBeVisible();
  const after=await area.evaluate(el=>el.scrollTop);await page.mouse.wheel(0,-250);await expect.poll(()=>area.evaluate(el=>el.scrollTop)).toBeLessThan(after-50);
  await page.getByRole('button',{name:'Testo',exact:true}).click();await area.evaluate(el=>el.scrollTo({top:0,behavior:'instant'}));await page.mouse.move(box!.x+box!.width-24,Math.min(box!.y+150,700));await page.mouse.wheel(0,350);await expect.poll(()=>area.evaluate(el=>el.scrollTop)).toBeGreaterThan(100);
  const before=await state(page);await area.focus();await page.keyboard.press('PageDown');expect((await state(page)).position).toBe(before.position);expect((await state(page)).volume).toBe(before.volume);
});

test('footer lyrics toggle sits beside the heart, returns to the previous page and stays visible at every size',async({page})=>{
  for(const width of [1440,1060,780,390]){
    await page.setViewportSize({width,height:940});await page.goto('/');await page.getByRole('button',{name:'Cerca',exact:true}).click();
    const trigger=page.locator('#lyrics-reader-trigger');await expect(trigger).toBeVisible();await expect(trigger).toHaveAccessibleName('Mostra testi');
    expect(await trigger.evaluate(el=>el.previousElementSibling?.querySelector('svg')?.classList.contains('lucide-heart'))).toBe(true);
    const bounds=await trigger.boundingBox();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(width);
    const before=await state(page);await trigger.focus();await page.keyboard.press('Enter');await expect(page.locator('main .lyrics-reader')).toBeVisible();await expect(trigger).toHaveAttribute('aria-pressed','true');await expect(trigger).toHaveAttribute('aria-expanded','true');await expect(trigger).toHaveAccessibleName('Nascondi testi');
    await trigger.click();await expect(page.locator('.lyrics-reader')).toHaveCount(0);await expect(page.locator('.search-starts')).toBeVisible();await expect(trigger).toBeFocused();await expect(trigger).toHaveAttribute('aria-pressed','false');
    expect((await state(page)).position).toBe(before.position);expect((await state(page)).volume).toBe(before.volume);await expect(page.locator('.transport').getByRole('button',{name:'Riproduci',exact:true})).toBeVisible();
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
});

test('footer lyrics toggle is disabled before choosing a track',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('ritvio-player-v1',JSON.stringify({state:{queue:[],index:0,playing:false},version:1})));await page.goto('/');await expect(page.locator('#lyrics-reader-trigger')).toBeVisible();await expect(page.locator('#lyrics-reader-trigger')).toBeDisabled();
});
