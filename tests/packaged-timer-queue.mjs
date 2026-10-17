import {chromium,expect} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdir,readFile,cp} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import net from 'node:net';
const root=process.cwd(),version=JSON.parse(await readFile('package.json','utf8')).version;
const exe=path.join(root,'release',`RITVIO-${version}-portatile.exe`),profile=path.join(root,'.packaging',`timer-queue-final-${randomUUID()}`);
const source=process.argv[2];if(!source||!path.resolve(source).startsWith(path.join(root,'.packaging','test-profile-')))throw Error('Serve una copia del profilo isolato della prova completa.');
await mkdir(path.join(profile,'cache'),{recursive:true});await cp(path.join(source,'cache','mvp.sqlite'),path.join(profile,'cache','mvp.sqlite'));await cp(path.join(source,'player-state.json'),path.join(profile,'player-state.json'));
const working=path.join(profile,'working'),temporary=path.join(profile,'temp');await mkdir(working);await mkdir(temporary);
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!(/^(PYTHON|YOUTUBE_|RITVIO_|ELECTRON_|NODE_)/i.test(key))));
Object.assign(env,{PATH:path.join(process.env.SystemRoot,'System32'),TEMP:temporary,TMP:temporary,RITVIO_TEST_HIDDEN:'true',RITVIO_TEST_USER_DATA:profile});
let child,browser,page;
async function launch(){const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));child=spawn(exe,[],{cwd:working,env:{...env,RITVIO_TEST_CDP_PORT:String(port)},windowsHide:true,stdio:'ignore'});child.on('error',e=>console.error(e));
  await expect.poll(async()=>{if(child.exitCode!==null)throw Error(`Avvio fallito: ${child.exitCode}`);try{return(await fetch(`http://127.0.0.1:${port}/json/version`,{signal:AbortSignal.timeout(1000)})).ok;}catch{return false;}},{timeout:90000,intervals:[500,1000,2000]}).toBe(true);
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);await expect.poll(()=>browser.contexts()[0]?.pages().length??0).toBeGreaterThan(0);page=browser.contexts()[0].pages()[0];await page.waitForLoadState('domcontentloaded');
}
async function bounded(work){let timer;try{await Promise.race([work,new Promise(resolve=>timer=setTimeout(resolve,5000))]);}finally{clearTimeout(timer);}}
async function close(){if(browser){const session=await browser.newBrowserCDPSession();await bounded(session.send('Browser.close').catch(()=>{}));await bounded(browser.close().catch(()=>{}));browser=undefined;}if(child){await expect.poll(()=>child.exitCode,{timeout:30000}).not.toBe(null);child=undefined;}}
async function api(route,method='GET',body){return page.evaluate(async({route,method,body})=>{const config=await window.ritvio.configuration();const response=await fetch(config.baseUrl+'/v1'+route,{method,headers:{Authorization:`Bearer ${config.token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok)throw Error(result.error?.message??`HTTP ${response.status}`);return result;},{route,method,body});}
try{
  await launch();console.log('EXE finale: timer/coda su copia isolata e PATH pulito.');
  const initial=await api('/me/library');let playbacks=0;page.on('request',r=>{if(r.url().includes('/playback'))playbacks++;});
  const state=async()=>JSON.parse(await page.evaluate(()=>window.ritvio.readPlayer())).state;
  await page.getByRole('button',{name:'Mostra coda di riproduzione',exact:true}).click();let queue=page.locator('.queue-tools');
  // The complete package test leaves the public 19-second test video paused.
  await expect(page.locator('.player-track strong')).toHaveText('Me at the zoo');
  while((await state()).repeat!=='track')await page.locator('.transport button').last().click();
  await queue.locator('.sleep-control summary').focus();await page.keyboard.press('Space');await expect(queue.locator('.sleep-control details')).toHaveAttribute('open','');await expect(page.getByRole('button',{name:'Riproduci',exact:true})).toBeVisible();await queue.getByRole('button',{name:'A fine brano',exact:true}).click();
  const oldEntry=(await state()).queue[(await state()).index].queueId;
  await page.getByRole('slider',{name:'Posizione del brano',exact:true}).fill('17');await page.getByRole('button',{name:'Riproduci',exact:true}).click();
  await expect(queue.locator('.sleep-control')).toContainText('Timer terminato. La musica è in pausa.',{timeout:60000});
  expect((await state()).queue[(await state()).index].queueId).toBe(oldEntry);await expect(page.getByRole('button',{name:'Riproduci',exact:true})).toBeVisible();
  console.log('Fine brano sullo stream reale: pausa, repeat singolo prevalso, nessun successivo.');
  await page.getByRole('textbox',{name:'Cerca musica'}).fill('Daft Punk Get Lucky');const result=page.locator('.tracks .track-row').first();await expect(result).toContainText('Daft Punk',{timeout:60000});const title=await result.locator('.track-name strong').innerText();
  await result.getByRole('button',{name:`Aggiungi alla coda: ${title}`,exact:true}).click();await result.getByRole('button',{name:`Aggiungi alla coda: ${title}`,exact:true}).click();await expect(queue.locator('.queue-row')).toHaveCount(3);
  await queue.locator('.queue-row').last().getByRole('button',{name:`Riproduci dopo: ${title}`,exact:true}).click();await queue.getByRole('button',{name:'30 min',exact:true}).click();const before=await state();expect(before.priorityIds).toHaveLength(1);expect(before.sleepTimer.kind).toBe('duration');
  await close();await launch();const restored=await state();expect(restored.queue).toEqual(before.queue);expect(restored.priorityIds).toEqual(before.priorityIds);expect(restored.sleepTimer).toEqual(before.sleepTimer);await expect(page.getByRole('button',{name:'Riproduci',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Mostra coda di riproduzione',exact:true}).click();queue=page.locator('.queue-tools');await queue.getByRole('button',{name:'Annulla timer',exact:true}).click();playbacks=0;page.on('request',r=>{if(r.url().includes('/playback'))playbacks++;});
  await page.getByRole('button',{name:'Brano successivo',exact:true}).click();await expect(page.locator('.player-track strong')).toHaveText(title);await expect.poll(async()=>Number(await page.getByRole('slider',{name:'Posizione del brano',exact:true}).inputValue()),{timeout:60000}).toBeGreaterThan(0);expect((await state()).queue[(await state()).index].queueId).toBe(before.priorityIds[0]);
  await page.getByRole('button',{name:'Pausa',exact:true}).click();playbacks=0;const position=await page.getByRole('slider',{name:'Posizione del brano',exact:true}).inputValue();
  await queue.getByRole('button',{name:'Salva coda come playlist',exact:true}).click();await queue.getByRole('textbox',{name:'Nome della playlist dalla coda',exact:true}).fill('Timer e coda - prova isolata');await queue.getByRole('button',{name:'Crea playlist dalla coda',exact:true}).click();await expect(queue.locator('.queue-feedback')).toContainText('Timer e coda - prova isolata',{timeout:15000});
  const library=await api('/me/library'),saved=library.playlists.find(p=>p.name==='Timer e coda - prova isolata');expect(saved.visibility).toBe('private');const full=await api(`/me/playlists/${saved.id}`);expect(full.items.map(i=>i.track.id)).toEqual(before.queue.map(i=>i.id));expect(new Set(full.items.map(i=>i.id)).size).toBe(3);
  await queue.getByRole('button',{name:'Seleziona gli altri',exact:true}).click();await queue.getByRole('button',{name:/Rimuovi selezionati/}).click();await expect(queue.locator('.queue-row')).toHaveCount(1);expect(await page.getByRole('slider',{name:'Posizione del brano',exact:true}).inputValue()).toBe(position);expect(playbacks).toBe(0);
  console.log('Priorità shuffle e timer persistono; playlist privata con duplicati e rimozione multipla preservano audio/posizione.');
  await queue.locator('.sleep-control summary').click();await queue.getByRole('spinbutton',{name:'Minuti personalizzati',exact:true}).fill('1');await queue.getByRole('button',{name:'Avvia timer',exact:true}).click();await page.getByRole('button',{name:'Riproduci',exact:true}).click();await expect(page.getByRole('button',{name:'Pausa',exact:true})).toBeVisible();
  await expect(queue.locator('.sleep-control')).toContainText('Timer terminato. La musica è in pausa.',{timeout:65000});await expect(page.getByRole('button',{name:'Riproduci',exact:true})).toBeVisible();expect((await state()).sleepTimer).toBe(null);
  const finalLibrary=await api('/me/library');expect(finalLibrary.likes).toHaveLength(initial.likes.length);expect(finalLibrary.playlists).toHaveLength(initial.playlists.length+1);
  await close();await launch();expect((await api('/me/playlists/'+saved.id)).items).toHaveLength(3);expect((await state()).queue).toHaveLength(1);expect((await state()).sleepTimer).toBe(null);await expect(page.getByRole('button',{name:'Riproduci',exact:true})).toBeVisible();
  console.log(JSON.stringify({exe,profile,cleanPath:true,realAudio:true,naturalEndOverridesRepeat:true,durationStopsAudio:true,priorityPersistence:true,duplicatePlaylistPersistence:true,batchPreservesPosition:true,personalProfileUntouched:true}));
}catch(e){if(page&&!page.isClosed()){console.error('UI failure: '+JSON.stringify(await page.evaluate(()=>({error:document.querySelector('.player-error')?.textContent??null,current:document.querySelector('.player-track strong')?.textContent,position:document.querySelector('.wave-timeline input')?.value})).catch(()=>({unavailable:true}))));await page.screenshot({path:path.join(profile,'failure.png'),timeout:10000}).catch(()=>{});}throw e;}finally{try{await close();}catch{if(child?.pid)spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}}
