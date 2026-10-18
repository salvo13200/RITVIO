import {test,expect} from '@playwright/test';
import {tracks} from './fixtures';
import {writeFile} from 'node:fs/promises';
const base='http://127.0.0.1:5199',headers={authorization:'Bearer test-token-only'};
test.beforeEach(async({page,request})=>{
  await request.post(base+'/test-reset-library');
  await page.addInitScript(()=>{localStorage.setItem('ritvio.language.v1',JSON.stringify({schema:1,preference:'it'}));window.__RITVIO_TEST_CONFIG__={baseUrl:'http://127.0.0.1:5199',token:'test-token-only'};});
});
async function start(page:import('@playwright/test').Page){await page.goto('/');await page.getByRole('textbox',{name:'Cerca musica'}).fill('Musica test');await page.getByRole('button',{name:'Riproduci Secondo brano',exact:true}).click();await expect.poll(()=>page.getByRole('slider',{name:'Posizione del brano'}).inputValue().then(Number)).toBeGreaterThan(0);}
async function metrics(page:import('@playwright/test').Page){return page.evaluate(async()=>{const path='/src/playback-metrics.ts';return (await import(path)).playbackMetrics();});}
test('preparation: next descriptor is prepared without playing it, then reused with no new playback request',async({page})=>{
  const calls:string[]=[];
  await page.route('**/v1/media/*/playback**',async route=>{calls.push(route.request().url());const response=await route.fetch(),descriptor=await response.json();descriptor.expiresAt=new Date(Date.now()+600000).toISOString();await route.fulfill({response,json:descriptor});});
  await start(page);await expect.poll(()=>calls.filter(url=>url.includes('prepare=true')).length).toBe(1);
  await expect.poll(async()=>{const path='/src/player.tsx';return page.evaluate(async path=>(await import(path)).audio.currentTime,path);}).toBeGreaterThan(1.5);
  await expect(page.locator('.player-track strong')).toHaveText('Secondo brano');
  const before=await metrics(page);expect(before.filter((s:{outcome:string})=>s.outcome==='playing')).toHaveLength(1);
  await page.getByRole('button',{name:'Brano successivo',exact:true}).click();await expect(page.locator('.player-track strong')).toHaveText('Primo & brano');await expect.poll(async()=>(await metrics(page)).at(-1)?.outcome).toBe('playing');
  expect(calls).toHaveLength(2);expect((await metrics(page)).at(-1).prepared).toBe(true);
  expect(JSON.stringify(await metrics(page))).not.toMatch(/https?:|token|googlevideo|descriptor"/);
});
test('preparation: background failure never stops current audio or presents a player error',async({page})=>{
  let failed=0;await page.route('**/v1/media/*/playback**',route=>{if(route.request().url().includes('prepare=true')){failed++;return route.fulfill({status:503,json:{error:{code:'RESOLVER_FAILED',message:'Controlled background failure'}}});}return route.continue();});
  await start(page);await expect.poll(()=>failed).toBe(1);await expect.poll(()=>page.getByRole('slider',{name:'Posizione del brano'}).inputValue().then(Number)).toBeGreaterThan(2);await expect(page.locator('.player-error')).not.toBeVisible();
});
test('preparation: a prepared URL that becomes unusable is refreshed once at actual playback',async({page})=>{
  const calls:string[]=[];await page.route('**/v1/media/*/playback**',async route=>{
    calls.push(route.request().url());const response=await route.fetch(),descriptor=await response.json();descriptor.expiresAt=new Date(Date.now()+600000).toISOString();if(route.request().url().includes('prepare=true'))descriptor.url=base+'/missing-tone.wav';await route.fulfill({response,json:descriptor});
  });
  await start(page);await expect.poll(()=>calls.filter(url=>url.includes('prepare=true')).length).toBe(1);await expect.poll(()=>page.getByRole('slider',{name:'Posizione del brano'}).inputValue().then(Number)).toBeGreaterThan(1.5);
  await page.getByRole('button',{name:'Brano successivo',exact:true}).click();await expect.poll(async()=>(await metrics(page)).at(-1)?.outcome).toBe('playing');expect(calls.filter(url=>url.includes('fresh=true'))).toHaveLength(1);await expect(page.locator('.player-error')).not.toBeVisible();expect((await metrics(page)).at(-1).mode).toBe('refresh');
});
test('preparation: late abandoned response cannot replace a newly selected track',async({page})=>{
  let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);let entered=0;let pending:Promise<void>|undefined;
  await page.route('**/v1/media/*/playback**',route=>{
    if(!route.request().url().includes('prepare=true'))return route.continue();
    entered++;pending=(async()=>{const response=await route.fetch();await gate;await route.fulfill({response}).catch(()=>{});})();return pending;
  });
  await start(page);await expect.poll(()=>entered).toBe(1);
  await page.getByRole('button',{name:'Riproduci Secondo brano',exact:true}).click();release();await pending;
  await expect(page.locator('.player-track strong')).toHaveText('Secondo brano');await expect.poll(()=>page.getByRole('slider',{name:'Posizione del brano'}).inputValue().then(Number)).toBeGreaterThan(0);await expect(page.locator('.player-error')).not.toBeVisible();
});
test('preparation: pausing cancels pending background work and resume prepares the next item again',async({page})=>{
  let count=0,release!:()=>void,pending:Promise<void>|undefined;const gate=new Promise<void>(resolve=>release=resolve);
  await page.route('**/v1/media/*/playback**',route=>{
    if(!route.request().url().includes('prepare=true'))return route.continue();
    count++;const first=count===1;
    const response=(async()=>{const result=await route.fetch();if(first)await gate;const descriptor=await result.json();descriptor.expiresAt=new Date(Date.now()+600000).toISOString();await route.fulfill({response:result,json:descriptor}).catch(()=>{});})();if(first)pending=response;return response;
  });
  await start(page);await expect.poll(()=>count).toBe(1);await page.getByRole('button',{name:'Pausa',exact:true}).click();release();await pending;
  await page.getByRole('button',{name:'Riproduci',exact:true}).click();await expect.poll(()=>count).toBe(2);await expect(page.locator('.player-error')).not.toBeVisible();
});
test('preparation: fifty real player skips stay playable under production request budgets',async({page,request})=>{
  test.setTimeout(90000);await request.get(base+'/v1/search?q=Musica%20test',{headers});await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(tracks=>{localStorage.setItem('ritvio-player-v1',JSON.stringify({version:1,state:{queue:Array.from({length:51},(_,i)=>({...tracks[i%2],queueId:'stress-'+i,source:'collection'})),index:0,playing:false,position:0,volume:.2}}));},tracks);
  let mediaRequests=0;page.on('request',r=>{if(r.url().includes('/v1/media/')||r.url().includes('/v1/stream/'))mediaRequests++;});
  await page.goto('/');await page.locator('.play-button').click();
  const position=page.getByRole('slider',{name:'Posizione del brano'});
  for(let i=0;i<51;i++){
    try{await expect(page.locator('.player-error')).not.toBeVisible();await expect.poll(()=>position.inputValue().then(Number)).toBeGreaterThan(0);}
    catch(error){
      const diagnostic=await page.evaluate(async()=>{const playerPath='/src/player.tsx',statePath='/src/store.ts',metricsPath='/src/playback-metrics.ts';const audio=(await import(playerPath)).audio,s=(await import(statePath)).usePlayer.getState();return {index:s.index,activation:s.activation,playing:s.playing,loading:s.loading,position:s.position,error:s.error,audio:{currentTime:audio.currentTime,paused:audio.paused,readyState:audio.readyState,networkState:audio.networkState,error:audio.error?.code??null},metrics:(await import(metricsPath)).playbackMetrics().slice(-4)};});
      await writeFile('data/analysis/skip-browser-diagnostic.json',JSON.stringify({iteration:i,mediaRequests,...diagnostic},null,2));throw error;
    }
    if(i<50)await page.getByRole('button',{name:'Brano successivo',exact:true}).click();
  }
  expect(mediaRequests).toBeGreaterThan(90);await expect(page.locator('.player-error')).not.toBeVisible();
});
