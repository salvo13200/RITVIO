import {chromium,expect} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdir,readFile,cp} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import net from 'node:net';
const root=process.cwd(),version=JSON.parse(await readFile('package.json','utf8')).version;
const exe=path.join(root,'release',`RITVIO-${version}-portatile.exe`),profile=path.join(root,'.packaging',`playlist-tools-final-${randomUUID()}`);
const source=path.resolve(process.argv[2]??'');
if(!source.startsWith(path.join(root,'.packaging','library-browser-final-')))throw Error('Serve un profilo isolato della prova libreria, non il profilo personale.');
await mkdir(path.join(profile,'cache'),{recursive:true});await cp(path.join(source,'cache','mvp.sqlite'),path.join(profile,'cache','mvp.sqlite'));await cp(path.join(source,'player-state.json'),path.join(profile,'player-state.json'));
const working=path.join(profile,'working'),temporary=path.join(profile,'temp');await mkdir(working);await mkdir(temporary);
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!(/^(PYTHON|YOUTUBE_|RITVIO_|ELECTRON_|NODE_)/i.test(key))));
Object.assign(env,{PATH:path.join(process.env.SystemRoot,'System32'),TEMP:temporary,TMP:temporary,RITVIO_TEST_HIDDEN:'true',RITVIO_TEST_USER_DATA:profile});
let child,browser,page;
async function launch(){
  const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
  child=spawn(exe,[],{cwd:working,env:{...env,RITVIO_TEST_CDP_PORT:String(port)},windowsHide:true,stdio:'ignore'});
  child.on('error',error=>console.error(error));
  await expect.poll(async()=>{if(child.exitCode!==null)throw Error(`Avvio fallito: ${child.exitCode}`);try{return(await fetch(`http://127.0.0.1:${port}/json/version`,{signal:AbortSignal.timeout(1000)})).ok;}catch{return false;}},{timeout:90000,intervals:[500,1000,2000]}).toBe(true);
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);await expect.poll(()=>browser.contexts()[0]?.pages().length??0).toBeGreaterThan(0);page=browser.contexts()[0].pages()[0];await page.waitForLoadState('domcontentloaded');
}
async function bounded(work){let timer;try{await Promise.race([work,new Promise(resolve=>timer=setTimeout(resolve,5000))]);}finally{clearTimeout(timer);}}
async function close(){if(browser){const session=await browser.newBrowserCDPSession();await bounded(session.send('Browser.close').catch(()=>{}));await bounded(browser.close().catch(()=>{}));browser=undefined;}if(child){await expect.poll(()=>child.exitCode,{timeout:30000}).not.toBe(null);child=undefined;}}
async function api(route,method='GET',data,revision){return page.evaluate(async ({route,method,data,revision})=>{const config=await window.ritvio.configuration();const response=await fetch(config.baseUrl+'/v1'+route,{method,headers:{Authorization:`Bearer ${config.token}`,...(data?{'Content-Type':'application/json'}:{}),...(revision?{'If-Match':`"${revision}"`}:{})},body:data?JSON.stringify(data):undefined});const result=await response.json();if(!response.ok)throw Error(result.error?.message??`HTTP ${response.status}`);return result;},{route,method,data,revision});}
try{
  await launch();const initial=await api('/me/library'),existing=initial.playlists.find(p=>p.name==='Timer e coda - prova isolata');if(!existing)throw Error('Serve il profilo QA libreria previsto.');
  const original=await api('/me/playlists/'+existing.id),originalData=JSON.stringify(original.items),mediaIds=original.items.map(item=>item.track.id);
  const sourcePlaylist=await api('/me/playlists/from-queue','POST',{name:'Playlist avanzate - prova isolata',mediaIds});
  const destination=await api('/me/playlists/from-queue','POST',{name:'Destinazione - prova isolata',mediaIds:[mediaIds[0]]});
  // API fixture creation bypasses the client store; reload before testing UI mutations.
  await page.reload();await page.waitForLoadState('domcontentloaded');
  let catalogRequests=0,playbacks=0;page.on('request',r=>{if(/\/v1\/(search|catalog\/search)/.test(r.url()))catalogRequests++;if(r.url().includes('/playback'))playbacks++;});
  await page.getByRole('button',{name:'La tua libreria',exact:true}).click();let library=page.locator('.library-page');await library.getByRole('searchbox',{name:'Cerca nelle tue playlist'}).fill('Playlist avanzate - prova isolata');await library.locator('.playlist-card').click();await expect(library.locator('.playlist-item')).toHaveCount(3);
  await page.getByRole('button',{name:'Riproduci',exact:true}).click();await expect(page.getByRole('button',{name:'Pausa',exact:true})).toBeVisible();
  const position=page.getByRole('slider',{name:'Posizione del brano',exact:true});const beforePosition=Number(await position.inputValue());await expect.poll(async()=>Number(await position.inputValue()),{timeout:30000,intervals:[500,1000]}).toBeGreaterThan(beforePosition+0.25);playbacks=0;
  await library.getByRole('button',{name:'Seleziona brani',exact:true}).click();await library.getByRole('button',{name:'Seleziona risultati (3)',exact:true}).click();await library.getByRole('button',{name:'Sposta in playlist',exact:true}).click();const plan=library.locator('.playlist-plan');await plan.getByRole('combobox',{name:'Playlist di destinazione'}).selectOption(destination.id);await expect(plan).toContainText('da 1 a 4 elementi');await plan.getByRole('button',{name:'Conferma spostamento',exact:true}).click();await expect(library.locator('.playlist-item')).toHaveCount(0);await expect(library.getByRole('button',{name:'Annulla ultima rimozione (3)',exact:true})).toBeVisible();
  const moved=await api('/me/playlists/'+sourcePlaylist.id),movedTarget=await api('/me/playlists/'+destination.id);expect(moved.undo.kind).toBe('move');expect(movedTarget.items.map(item=>item.track.id)).toEqual([mediaIds[0],...mediaIds]);expect(playbacks).toBe(0);await expect(page.getByRole('button',{name:'Pausa',exact:true})).toBeVisible();await page.getByRole('button',{name:'Pausa',exact:true}).click();
  await close();await launch();library=page.locator('.library-page');await page.getByRole('button',{name:'La tua libreria',exact:true}).click();await library.getByRole('searchbox',{name:'Cerca nelle tue playlist'}).fill('Playlist avanzate - prova isolata');await library.locator('.playlist-card').click();await library.getByRole('button',{name:'Annulla ultima rimozione (3)',exact:true}).click();await expect(library.locator('.playlist-item')).toHaveCount(3);
  let restored=await api('/me/playlists/'+sourcePlaylist.id);expect(restored.items).toEqual(sourcePlaylist.items);expect((await api('/me/playlists/'+destination.id)).items).toEqual(destination.items);
  await library.getByRole('button',{name:'Copie ripetute (1)',exact:true}).click();await library.locator('.playlist-plan').getByRole('button',{name:'Rimuovi copie spuntate',exact:true}).click();await expect(library.locator('.playlist-item')).toHaveCount(2);await library.getByRole('button',{name:'Annulla ultima rimozione (1)',exact:true}).click();await expect(library.locator('.playlist-item')).toHaveCount(3);
  await library.getByRole('button',{name:'Duplica playlist',exact:true}).click();await library.getByRole('textbox',{name:'Nome della copia',exact:true}).fill('Copia privata - prova isolata');await library.getByRole('button',{name:'Crea copia privata',exact:true}).click();await expect(library.locator('.playlist-hero')).toContainText('Copia privata - prova isolata');
  const final=await api('/me/library'),copySummary=final.playlists.find(p=>p.name==='Copia privata - prova isolata'),copy=await api('/me/playlists/'+copySummary.id);expect(copy.visibility).toBe('private');expect(copy.items.map(item=>item.track.id)).toEqual(mediaIds);expect(copy.items[0].id).not.toBe(sourcePlaylist.items[0].id);expect(final.likes).toEqual(initial.likes);expect(JSON.stringify((await api('/me/playlists/'+existing.id)).items)).toBe(originalData);await expect(page.getByRole('button',{name:'Riproduci',exact:true})).toBeVisible();expect(catalogRequests).toBe(0);
  console.log(JSON.stringify({exe,profile,cleanPath:true,atomicMove:true,undoBothSidesAfterRestart:true,exactEntryIdsAndDuplicatesRestored:true,duplicateCleanupReversible:true,privateCopyIndependent:true,existingLibraryPreserved:true,realAudioResumesAndEditsDoNotRestartIt:true,noCatalogQueriesForOrganization:true,focusedFeatureQa:true,personalProfileUntouched:true}));
}finally{await close();}
