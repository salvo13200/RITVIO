import { _electron,expect } from '@playwright/test';
import electronPath from 'electron';
import {mkdir} from 'node:fs/promises';
const launch=()=>_electron.launch({executablePath:electronPath,args:['apps/desktop/main.cjs'],env:{...process.env,RITVIO_NODE_PATH:process.execPath,RITVIO_TEST_HIDDEN:'true'},timeout:30000});
let desktop;
try {
  desktop=await launch();let page=await desktop.firstWindow();
  await expect(page.getByRole('heading',{name:'La tua musica'})).toBeVisible();
  const mute=page.getByRole('button',{name:'Disattiva audio',exact:true});
  if(await mute.count())await mute.click();
  await page.getByRole('textbox',{name:'Cerca musica'}).fill('Daft Punk Get Lucky');
  await expect(page.locator('.tracks .track-row').first()).toContainText('Daft Punk',{timeout:45000});
  await mkdir('data/analysis',{recursive:true});await page.screenshot({path:'data/analysis/mvp-resolver-search.png'});
  await page.getByRole('button',{name:'Home',exact:true}).click();
  await page.getByRole('textbox',{name:'Link YouTube'}).fill('https://www.youtube.com/watch?v=jNQXAC9IVRw');
  await page.getByRole('button',{name:'Apri e riproduci link'}).click();
  await expect(page.getByRole('textbox',{name:'Link YouTube'})).toHaveValue('',{timeout:45000});
  await expect(page.locator('.player-track strong')).toHaveText('Me at the zoo',{timeout:45000});
  await expect(page.locator('.play-button .spin')).toHaveCount(0,{timeout:45000});
  const slider=page.getByRole('slider',{name:'Posizione del brano'});
  await expect.poll(async()=>Number(await slider.inputValue()),{timeout:45000}).toBeGreaterThan(0);
  const before=Number(await slider.inputValue());
  await desktop.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].minimize());
  await expect.poll(async()=>Number(await slider.inputValue())).toBeGreaterThan(before+1);
  await page.getByRole('button',{name:'Pausa',exact:true}).click();
  await slider.fill('8');
  await expect.poll(async()=>Number(await slider.inputValue())).toBeGreaterThanOrEqual(8);
  await mkdir('data/analysis',{recursive:true});await page.screenshot({path:'data/analysis/mvp-live-player.png'});
  await desktop.close();desktop=await launch();page=await desktop.firstWindow();
  await expect(page.locator('.player-track strong')).toHaveText('Me at the zoo');
  await expect(page.getByRole('button',{name:'Riproduci',exact:true})).toBeVisible();
  await expect.poll(async()=>Number(await page.getByRole('slider',{name:'Posizione del brano'}).inputValue())).toBeGreaterThanOrEqual(8);
  const security=await page.evaluate(()=>({nodeExposed:typeof window.require!=='undefined',isolatedBridge:!!window.ritvio}));
  if(security.nodeExposed||!security.isolatedBridge)throw Error('Desktop isolation failed');
  console.log(JSON.stringify({liveMusicSearch:true,keyRequired:false,livePlayback:true,backgroundWhileMinimized:true,seek:true,restartRestoresPausedPosition:true,rendererIsolated:true}));
}finally {await desktop?.close();}

