import {test,expect,type Page} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {tracks} from './fixtures';
const base='http://127.0.0.1:5199',headers={authorization:'Bearer test-token-only'},label=process.env.RITVIO_PERF_LABEL??'after';
const folder='test-results/native',shots='test-results/visual/ui-6-4';
test.beforeEach(async({page,request})=>{
  await mkdir(folder,{recursive:true});await request.post(base+'/test-reset-library');await request.get(base+'/v1/search?q=Musica%20test',{headers});
  await page.addInitScript(({base,tracks})=>{
    window.__RITVIO_TEST_CONFIG__={baseUrl:base,token:'test-token-only'};
    localStorage.setItem('ritvio-player-v1',JSON.stringify({state:{queue:Array.from({length:500},(_,i)=>({...tracks[i%2],queueId:'perf-'+i,source:'collection'})),index:0,duration:12,position:0,playing:false,volume:.6,muted:false},version:1}));
    const holder=window as unknown as {perfCounts:Record<string,number>;stringifyMs:number;serializedWrites:number};holder.perfCounts={};holder.stringifyMs=0;holder.serializedWrites=0;
    const stringify=JSON.stringify;
    JSON.stringify=function(value,...args:Parameters<typeof stringify> extends [unknown,...infer R]?R:never){const start=performance.now();const result=stringify(value,...args);if(value&&typeof value==='object'&&'state' in value&&'version' in value){holder.stringifyMs+=performance.now()-start;holder.serializedWrites++;}return result;} as typeof stringify;
  },{base,tracks});
  await page.route('**/src/*.tsx*',async route=>{const response=await route.fetch(),body=await response.text();const instrumented=body.replace(/function (PlayerBar|HomePage|QueuePanel|PreferencesPage|AnimatedCover|ScrollingLine|WaveSlider|PlayerTimeline|ResumeProgress)\([\s\S]*?\)\s*\{/g,(match,name)=>match+`globalThis.perfCounts[${JSON.stringify(name)}]=(globalThis.perfCounts[${JSON.stringify(name)}]||0)+1;`);await route.fulfill({response,body:instrumented});});
  await page.route('https://*.ytimg.com/**',async route=>route.fulfill({contentType:'image/webp',body:await readFile('tests/fixtures/artwork/city.webp')}));
});

async function audioState(page:Page){return page.evaluate(async()=>{const path='/src/player.tsx',{audio}=await import(path);const holder=window as unknown as {perfAudio?:HTMLAudioElement};holder.perfAudio??=audio;return {same:holder.perfAudio===audio,src:audio.src,paused:audio.paused,time:audio.currentTime};});}
async function capture(page:Page,name:string){await page.evaluate(()=>document.fonts.ready);await expect(page.locator('.player-track .animated-cover')).toHaveAttribute('aria-busy','false');await expect.poll(()=>page.evaluate(()=>document.getAnimations().filter(animation=>animation.playState==='running'&&animation.effect?.getComputedTiming().iterations!==Infinity).length)).toBe(0);await page.screenshot({path:`${shots}/${name}.png`});}
test('secondary modules load on demand and late page loading does not redirect the player',async({page})=>{
  const moduleRequests:string[]=[];page.on('request',request=>{if(/\/src\/(library-ui|preferences-page|catalog-pages|lyrics)\.tsx/.test(request.url()))moduleRequests.push(request.url());});
  let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);await page.route('**/src/preferences-page.tsx*',async route=>{await gate;await route.continue();});
  await page.goto('/');await expect(page.locator('.resume-banner')).toBeVisible();expect(moduleRequests).toEqual([]);
  await page.locator('.transport').getByRole('button',{name:'Riproduci',exact:true}).click();await expect.poll(async()=>(await audioState(page)).paused).toBe(false);const before=await audioState(page);
  await page.getByRole('button',{name:'Impostazioni',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Caricamento della pagina…'})).toBeVisible();await page.getByRole('button',{name:'Home',exact:true}).click();await expect(page.locator('.resume-banner')).toBeVisible();release();await page.evaluate(async()=>{const modulePath='/src/preferences-page.tsx';await import(modulePath);});await expect.poll(()=>moduleRequests.length).toBeGreaterThan(0);const after=await audioState(page);expect(after.same).toBe(true);expect(after.src).toBe(before.src);expect(after.paused).toBe(false);await expect(page.locator('.preferences-page')).toHaveCount(0);await expect.poll(async()=>(await audioState(page)).time).toBeGreaterThan(before.time);await page.locator('.transport').getByRole('button',{name:'Pausa',exact:true}).click();
});

test('a failed deferred page gives honest recovery while audio and other navigation continue',async({page})=>{
  await page.route('**/src/preferences-page.tsx*',route=>route.abort('failed'));
  await page.goto('/');await page.locator('.transport').getByRole('button',{name:'Riproduci',exact:true}).click();await expect.poll(async()=>(await audioState(page)).paused).toBe(false);const before=await audioState(page);await page.getByRole('button',{name:'Impostazioni',exact:true}).click();await expect(page.locator('.notice[role=alert]')).toContainText('Questa pagina non è stata caricata');await expect(page.getByRole('button',{name:'Ricarica app',exact:true})).toBeVisible();expect((await audioState(page)).same).toBe(true);await expect.poll(async()=>(await audioState(page)).time).toBeGreaterThan(before.time);await page.locator('.transport').getByRole('button',{name:'Pausa',exact:true}).click();await mkdir(shots,{recursive:true});await capture(page,'deferred-error');await page.getByRole('button',{name:'Home',exact:true}).click();await expect(page.locator('.resume-banner')).toBeVisible();
});

test('preserved desktop and compact surfaces are captured with all 500 queue entries reachable',async({page})=>{
  await mkdir(shots,{recursive:true});await page.goto('/');await expect(page.locator('.resume-banner')).toBeVisible();await capture(page,'home-desktop');
  await page.locator('#queue-panel-trigger').click();await expect(page.locator('.queue-row')).toHaveCount(500);await capture(page,'queue-desktop');await page.locator('[data-queue-id="perf-499"]').scrollIntoViewIfNeeded();await expect(page.locator('[data-queue-id="perf-499"]')).toBeInViewport();
  await page.getByRole('button',{name:'Impostazioni',exact:true}).click();await page.getByRole('tab',{name:'Audio',exact:true}).click();await expect(page.locator('.audio-controls')).toBeVisible();await capture(page,'audio-desktop');await page.getByRole('button',{name:'Torna alla musica',exact:true}).click();await page.setViewportSize({width:640,height:600});await page.locator('#lyrics-reader-trigger').click();await expect(page.locator('.lyrics-reader')).toBeVisible();await capture(page,'lyrics-compact');
});
async function pulse(page:Page){return page.evaluate(async()=>{
  const path='/src/store.ts',store=(await import(path)).usePlayer;
  const holder=window as unknown as {perfCounts:Record<string,number>;stringifyMs:number;serializedWrites:number};holder.perfCounts={};holder.stringifyMs=0;holder.serializedWrites=0;
  const frameGaps:number[]=[],updateMs:number[]=[];let last=performance.now();
  for(let i=0;i<60;i++){await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));const now=performance.now();frameGaps.push(now-last);last=now;const start=performance.now();store.setState({position:((i+1)%45)/4});updateMs.push(performance.now()-start);await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));}
  return {counts:{...holder.perfCounts},stringifyMs:holder.stringifyMs,serializedWrites:holder.serializedWrites,updateMs,frameGaps,queue:store.getState().queue.length,position:store.getState().position};
});}
test('clock updates with 500 queue items are measured independently of static regions',async({page})=>{
  test.setTimeout(90000);await page.goto('/');await expect(page.locator('.resume-banner')).toBeVisible();await page.evaluate(()=>document.fonts.ready);
  const home=await pulse(page);await page.locator('#queue-panel-trigger').click();await expect(page.locator('.queue-row')).toHaveCount(500);const queue=await pulse(page);
  await page.getByRole('button',{name:'Impostazioni',exact:true}).click();await expect(page.locator('.preferences-page')).toBeVisible();const preferences=await pulse(page);
  await writeFile(`${folder}/RUNTIME-${label}.json`,JSON.stringify({environment:'Edge headless/Vite development build; test-instrumented function entries and JSON serialization, 60 RAF-paced synthetic position updates per surface, 500 queue items, not real-time audio/FPS guarantee',home,queue,preferences},null,2));
  expect(home.queue).toBe(500);expect(queue.queue).toBe(500);
  if(label!=='before'){expect(home.counts.HomePage??0).toBe(0);expect(queue.counts.QueuePanel??0).toBe(0);expect(preferences.counts.PreferencesPage??0).toBe(0);expect(home.counts.PlayerBar??0).toBe(0);expect(home.counts.PlayerTimeline).toBeGreaterThan(0);}
});
