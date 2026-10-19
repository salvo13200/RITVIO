import {test,expect,type Page} from '@playwright/test';
import {tracks,toneWav} from './fixtures';
const base='http://127.0.0.1:5199';
test.beforeEach(async({page,request})=>{
  await request.post(base+'/test-reset-library');
  await page.addInitScript(()=>{localStorage.setItem('ritvio.language.v1',JSON.stringify({schema:1,preference:'it'}));window.__RITVIO_TEST_CONFIG__={baseUrl:'http://127.0.0.1:5199',token:'test-token-only'};});
});
async function choose(page:Page){await page.goto('/');await page.getByRole('textbox',{name:'Cerca musica'}).fill('Musica test');await page.getByRole('button',{name:'Riproduci Secondo brano',exact:true}).click();}
async function advancing(page:Page){await expect.poll(()=>page.getByRole('slider',{name:'Posizione del brano'}).inputValue().then(Number)).toBeGreaterThan(0);await expect(page.locator('.player-error')).not.toBeVisible();}
const failure=(code='RESOLVER_FAILED')=>({status:503,json:{error:{code,message:'Controlled temporary network failure'}}});

test('resilience: a transient descriptor failure recovers without losing the selected track',async({page})=>{
 let calls=0;await page.route('**/v1/media/*/playback**',route=>{if(route.request().url().includes('prepare=true'))return route.continue();return ++calls===1?route.fulfill(failure()):route.continue();});
 await choose(page);await advancing(page);expect(calls).toBe(2);await expect(page.locator('.player-track strong')).toHaveText('Secondo brano');
});
test('resilience: automatic retries stop after two attempts and a later online event cannot restart them',async({page})=>{
 let calls=0;await page.route('**/v1/media/*/playback**',route=>{calls++;return route.fulfill(failure());});
 await choose(page);await expect(page.locator('.player-error')).toBeVisible();expect(calls).toBe(3);
 await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.waitForTimeout(1200);expect(calls).toBe(3);
});
test('resilience: provider rate limits are shown without automatic request amplification',async({page})=>{
 let calls=0;await page.route('**/v1/media/*/playback**',route=>{calls++;return route.fulfill({...failure('RATE_LIMITED'),status:429});});
 await choose(page);await expect(page.locator('.player-error')).toBeVisible();await page.waitForTimeout(1300);expect(calls).toBe(1);
});
test('resilience: pausing cancels a delayed retry and manual resume still works',async({page})=>{
 let calls=0;await page.route('**/v1/media/*/playback**',route=>{if(route.request().url().includes('prepare=true'))return route.continue();return ++calls===1?route.fulfill(failure()):route.continue();});
 await choose(page);await expect.poll(()=>calls).toBe(1);await page.getByRole('button',{name:'Pausa',exact:true}).click();
 await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.waitForTimeout(1300);expect(calls).toBe(1);
 await page.getByRole('button',{name:'Riproduci',exact:true}).click();await advancing(page);expect(calls).toBe(2);
});
test('resilience: choosing another track cancels retries belonging to its predecessor',async({page})=>{
 let failed=0;await page.route(`**/v1/media/${tracks[1].id}/playback**`,route=>{failed++;return route.fulfill(failure());});
 await choose(page);await expect.poll(()=>failed).toBe(1);await page.getByRole('button',{name:'Riproduci Primo & brano',exact:true}).click();await advancing(page);
 await page.waitForTimeout(1300);expect(failed).toBe(1);await expect(page.locator('.player-track strong')).toHaveText('Primo & brano');
});
test('resilience: a seek made while the descriptor is loading survives metadata arrival',async({page})=>{
 let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);let waiting=false;
 await page.route('**/v1/media/*/playback**',async route=>{if(route.request().url().includes('prepare=true'))return route.continue();const response=await route.fetch();waiting=true;await gate;await route.fulfill({response}).catch(()=>{});});
 try{await choose(page);await expect.poll(()=>waiting).toBe(true);await page.evaluate(async()=>{const path='/src/player.tsx';(await import(path)).seek(6);});release();
 await expect.poll(()=>page.evaluate(async()=>{const path='/src/player.tsx';return(await import(path)).audio.currentTime;})).toBeGreaterThanOrEqual(6);await expect(page.locator('.player-error')).not.toBeVisible();
 }finally{release();}
});
test('resilience: rapid paused seeks preserve the last position and do not restart playback',async({page})=>{
 await choose(page);await advancing(page);await page.getByRole('button',{name:'Pausa',exact:true}).click();
 await page.evaluate(async()=>{const path='/src/player.tsx';const p=await import(path);p.seek(1);p.seek(8);p.seek(3);});
 await expect.poll(()=>page.evaluate(async()=>{const path='/src/player.tsx';const a=(await import(path)).audio;return a.paused&&!a.seeking&&Math.abs(a.currentTime-3)<.05;})).toBe(true);
 await page.getByRole('button',{name:'Riproduci',exact:true}).click();await expect.poll(()=>page.getByRole('slider',{name:'Posizione del brano'}).inputValue().then(Number)).toBeGreaterThan(3);
});
test('resilience: an offline retry waits for connectivity and resumes only the current intent',async({page})=>{
 await page.addInitScript(()=>{(window as any).__offline=true;Object.defineProperty(navigator,'onLine',{get:()=>!(window as any).__offline});});
 let calls=0;await page.route('**/v1/media/*/playback**',route=>{if(route.request().url().includes('prepare=true'))return route.continue();return ++calls===1?route.fulfill(failure()):route.continue();});
 await choose(page);await expect.poll(()=>calls).toBe(1);await page.waitForTimeout(1300);expect(calls).toBe(1);
 await page.evaluate(()=>{(window as any).__offline=false;window.dispatchEvent(new Event('online'));});await advancing(page);expect(calls).toBe(2);
});

test('resilience: returning to the app resumes a suspended audio graph only for active playback',async({page})=>{
 await choose(page);await advancing(page);
 const contextState=()=>page.evaluate(async()=>{const path='/src/audio-engine.ts';return(await import(path)).audioEngine()?.context.state;});
 await page.evaluate(async()=>{const path='/src/audio-engine.ts';await(await import(path)).audioEngine()?.context.suspend();});await expect.poll(contextState).toBe('suspended');
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect.poll(contextState).toBe('running');
 await page.getByRole('button',{name:'Pausa',exact:true}).click();await page.evaluate(async()=>{const path='/src/audio-engine.ts';await(await import(path)).audioEngine()?.context.suspend();window.dispatchEvent(new Event('focus'));});
 await page.waitForTimeout(200);await expect.poll(contextState).toBe('suspended');await expect(page.getByRole('button',{name:'Riproduci',exact:true})).toBeVisible();
});

test('resilience: a pending track uses its own duration instead of clamping to the previous recording',async({page})=>{
 await choose(page);await advancing(page);
 const wav=toneWav(80);await page.route('**/resilience-long.wav',route=>{
  const range=route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/),start=Number(range?.[1]??0),end=Math.min(range?.[2]?Number(range[2]):wav.length-1,wav.length-1);
  return route.fulfill({status:range?206:200,contentType:'audio/wav',headers:{'access-control-allow-origin':'*','accept-ranges':'bytes','content-length':String(end-start+1),...(range?{'content-range':`bytes ${start}-${end}/${wav.length}`}:{})},body:wav.subarray(start,end+1)});
 });
 let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);let pending=false;
 await page.route('**/v1/media/*/playback**',async route=>{if(route.request().url().includes('prepare=true'))return route.continue();const response=await route.fetch(),descriptor=await response.json();pending=true;await gate;await route.fulfill({response,json:{...descriptor,url:base+'/resilience-long.wav'}}).catch(()=>{});});
 try{
  await page.evaluate(async track=>{const path='/src/store.ts';(await import(path)).usePlayer.getState().play({...track,duration:80});},tracks[0]);await expect.poll(()=>pending).toBe(true);
  await page.evaluate(async()=>{const path='/src/player.tsx';(await import(path)).seek(50);});
  await expect(page.getByRole('slider',{name:'Posizione del brano'})).toHaveValue('50');release();
  await expect.poll(()=>page.evaluate(async()=>{const path='/src/player.tsx';return(await import(path)).audio.currentTime;})).toBeGreaterThanOrEqual(50);
 }finally{release();}
});

test('resilience: prolonged offline waiting terminates and does not revive playback on reconnect',async({page})=>{
 test.setTimeout(45000);await page.addInitScript(()=>Object.defineProperty(navigator,'onLine',{get:()=>false}));
 let calls=0;await page.route('**/v1/media/*/playback**',route=>{calls++;return route.fulfill(failure());});
 await choose(page);await expect(page.locator('.player-error')).toBeVisible({timeout:35000});expect(calls).toBe(1);
 await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.waitForTimeout(200);expect(calls).toBe(1);await expect(page.getByRole('button',{name:'Riproduci',exact:true})).toBeVisible();
});

test('resilience: stale media events cannot skip the current track or leave its loading indicator stuck',async({page})=>{
 await choose(page);await advancing(page);
 await page.evaluate(async()=>{const path='/src/player.tsx';const audio=(await import(path)).audio;audio.dispatchEvent(new Event('ended'));audio.dispatchEvent(new Event('waiting'));});
 await page.waitForTimeout(200);await expect(page.locator('.player-track strong')).toHaveText('Secondo brano');
 expect(await page.evaluate(async()=>{const path='/src/store.ts';return(await import(path)).usePlayer.getState().loading;})).toBe(false);await advancing(page);
});
