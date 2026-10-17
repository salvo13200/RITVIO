import {chromium,expect} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdir,readFile,cp} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';
import net from 'node:net';
const root=process.cwd(),version=JSON.parse(await readFile('package.json','utf8')).version;
const exe=path.join(root,'release',`RITVIO-${version}-portatile.exe`),profile=path.join(root,'.packaging',`library-browser-final-${randomUUID()}`);
const source=path.resolve(process.argv[2]??'');
if(!source.startsWith(path.join(root,'.packaging','timer-queue-final-')))throw Error('Serve un profilo isolato della prova timer/coda, non il profilo personale.');
await mkdir(path.join(profile,'cache'),{recursive:true});await cp(path.join(source,'cache','mvp.sqlite'),path.join(profile,'cache','mvp.sqlite'));await cp(path.join(source,'player-state.json'),path.join(profile,'player-state.json'));
const db=new DatabaseSync(path.join(profile,'cache','mvp.sqlite'));
const owner=db.prepare("SELECT id FROM library_profiles WHERE mode='local'").get().id;
const first=JSON.parse(db.prepare('SELECT data FROM library_tracks LIMIT 1').get().data);
const seedIds=[];db.exec('BEGIN');
try{
  for(let i=0;i<300;i++){
    const id=randomUUID(),videoId='lb'+String(i).padStart(9,'0');seedIds.push(id);
    const track={...first,id,videoId,title:`Prova Città ${String(i).padStart(3,'0')}`,artist:i%2?'Artista Beta':'Artista Alfa',artists:[],album:undefined,thumbnail:'',canonicalUrl:`https://www.youtube.com/watch?v=${videoId}`,duration:[120,240,480,0][i%4]};
    db.prepare('INSERT INTO library_tracks VALUES(?,?)').run(id,JSON.stringify(track));db.prepare('INSERT INTO library_likes VALUES(?,?,?)').run(owner,id,Date.now()+i);
  }
  db.exec('COMMIT');
}catch(error){db.exec('ROLLBACK');throw error;}finally{db.close();}
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
async function api(route){return page.evaluate(async route=>{const config=await window.ritvio.configuration();const response=await fetch(config.baseUrl+'/v1'+route,{headers:{Authorization:`Bearer ${config.token}`}});const result=await response.json();if(!response.ok)throw Error(result.error?.message??`HTTP ${response.status}`);return result;},route);}
try{
  await launch();const initial=await api('/me/library');let catalogRequests=0,playbacks=0;page.on('request',r=>{if(/\/v1\/(search|catalog\/search)/.test(r.url()))catalogRequests++;if(r.url().includes('/playback'))playbacks++;});
  await page.getByRole('button',{name:'La tua libreria',exact:true}).click();await page.getByRole('tab',{name:'Preferiti',exact:true}).click();let library=page.locator('.library-page');
  await expect(library.locator('.library-track')).toHaveCount(60);await expect(library.locator('.library-browser-status')).toContainText(`${initial.likes.length} elementi su ${initial.likes.length}`);
  await library.getByRole('searchbox',{name:'Cerca nei brani piaciuti'}).fill('prova citta 220 alfa');await expect(library.locator('.library-track')).toHaveCount(1);await expect(library.locator('.library-track-title>button>strong')).toHaveText('Prova Città 220');
  await library.getByRole('button',{name:'Reimposta filtri',exact:true}).click();await library.getByRole('combobox',{name:'Durata del brano'}).selectOption('unknown');await expect(library.locator('.library-browser-status')).toContainText(`75 elementi su ${initial.likes.length}`);
  await library.getByRole('button',{name:'Reimposta filtri',exact:true}).click();await library.getByRole('combobox',{name:'Ordina per'}).selectOption('name');await library.getByRole('button',{name:'Mostra altri 60',exact:true}).click();await expect(library.locator('.library-track')).toHaveCount(120);
  await library.locator('.library-track').nth(90).scrollIntoViewIfNeeded();const scroll=await page.locator('main').evaluate(el=>el.scrollTop);expect(scroll).toBeGreaterThan(1000);
  await page.getByRole('button',{name:'Home',exact:true}).click();await page.getByRole('button',{name:'La tua libreria',exact:true}).click();await expect(library.locator('.library-track')).toHaveCount(120);await expect(library.getByRole('combobox',{name:'Ordina per'})).toHaveValue('name');await expect.poll(()=>page.locator('main').evaluate(el=>el.scrollTop)).toBeCloseTo(scroll,0);
  const playlist=initial.playlists.find(p=>p.name==='Timer e coda - prova isolata');if(!playlist)throw Error('Profilo sorgente non proveniente dal test timer/coda finale.');const original=await api(`/me/playlists/${playlist.id}`);
  await page.getByRole('tab',{name:'Playlist',exact:true}).click();await library.getByRole('searchbox',{name:'Cerca nelle tue playlist'}).fill('Timer e coda');await library.locator('.playlist-card').click();await library.getByRole('combobox',{name:'Ordina per'}).selectOption('name');
  await expect(library.locator('.playlist-item').first()).toHaveAttribute('draggable','false');for(const button of await library.getByRole('button',{name:/^Sposta (su|giù) /}).all())await expect(button).toBeDisabled();
  await library.getByRole('searchbox',{name:'Cerca in questa playlist'}).fill(original.items[1].track.title);await expect(library.locator('.playlist-item')).toHaveCount(2);const filtered=await api(`/me/playlists/${playlist.id}`);expect(filtered.items).toEqual(original.items);expect(filtered.revision).toBe(original.revision);
  await library.getByRole('button',{name:'Reimposta filtri',exact:true}).click();await expect(library.locator('.playlist-item')).toHaveCount(3);await expect(library.locator('.playlist-item .library-track-title>button>strong')).toHaveText(original.items.map(item=>item.track.title));
  await library.getByRole('button',{name:'Torna alla libreria',exact:true}).click();await expect(library.getByRole('searchbox',{name:'Cerca nelle tue playlist'})).toHaveValue('Timer e coda');expect(catalogRequests).toBe(0);expect(playbacks).toBe(0);
  // Resume the real track already persisted by the prior package test.
  const beforePosition=Number(await page.getByRole('slider',{name:'Posizione del brano',exact:true}).inputValue());await page.getByRole('button',{name:'Riproduci',exact:true}).click();await expect.poll(async()=>Number(await page.getByRole('slider',{name:'Posizione del brano',exact:true}).inputValue()),{timeout:60000}).toBeGreaterThan(beforePosition+0.25);await page.getByRole('button',{name:'Pausa',exact:true}).click();
  const position=await page.getByRole('slider',{name:'Posizione del brano',exact:true}).inputValue();playbacks=0;await library.getByRole('searchbox',{name:'Cerca nelle tue playlist'}).fill('assente');await expect(library.getByRole('heading',{name:'Nessuna corrispondenza',exact:true})).toBeVisible();expect(playbacks).toBe(0);expect(await page.getByRole('slider',{name:'Posizione del brano',exact:true}).inputValue()).toBe(position);
  await close();await launch();const final=await api('/me/library');expect(final.likes.map(t=>t.id)).toEqual(initial.likes.map(t=>t.id));expect(final.playlists).toEqual(initial.playlists);await expect(page.getByRole('button',{name:'Riproduci',exact:true})).toBeVisible();
  console.log(JSON.stringify({exe,profile,cleanPath:true,localSearchNoCatalogRequests:true,progressiveBatches:true,filtersAndScrollSurviveNavigation:true,durationFilter:true,duplicatePlaylistUnchanged:true,realAudioResumes:true,dataPersistsAfterRestart:true,viewStateSessionOnly:true,personalProfileUntouched:true}));
}catch(error){if(page&&!page.isClosed())await page.screenshot({path:path.join(profile,'failure.png'),timeout:10000}).catch(()=>{});throw error;}finally{try{await close();}catch{if(child?.pid)spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}}
