import {_electron,expect} from '@playwright/test';
import electron from 'electron';
import {mkdir,readFile,writeFile,readdir,cp} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

// Isolated application root and userData: no access to the user's real SQLite/profile.
const root=process.cwd(),area=path.resolve(root,'.packaging',`l10n-l1-${Date.now()}`),profile=path.join(area,'profile');
if(!area.startsWith(path.resolve(root,'.packaging')+path.sep))throw Error('Invalid isolated test directory');
await mkdir(path.join(area,'apps/desktop'),{recursive:true});await mkdir(profile,{recursive:true});
for(const name of await readdir(path.join(root,'apps/desktop')))if(name.endsWith('.cjs'))await cp(path.join(root,'apps/desktop',name),path.join(area,'apps/desktop',name));
await cp(path.join(root,'dist'),path.join(area,'dist'),{recursive:true});
// Only external API dependencies resolve from this staging tree; pnpm workspace ancestors provide them.
await writeFile(path.join(area,'package.json'),'{"name":"ritvio-language-test","type":"module"}');
await writeFile(path.join(profile,'player-state.json'),JSON.stringify({version:1,state:{queue:[],index:-1,position:0,volume:.37,shuffle:false,repeat:'off',theme:'dark'}}));
const env={...process.env,RITVIO_NODE_PATH:process.execPath,RITVIO_TEST_HIDDEN:'true',RITVIO_TEST_USER_DATA:profile,YOUTUBE_RESOLVER_PYTHON:path.join(root,'.venv/Scripts/python.exe')};
delete env.RITVIO_DEV_URL;let desktop;
const launch=()=>_electron.launch({executablePath:electron,args:[path.join(area,'apps/desktop/main.cjs')],env,timeout:45000});
try{
 desktop=await launch();const page=await desktop.firstWindow();await expect(page.locator('.app')).toBeVisible({timeout:45000});
 const initial=await page.evaluate(()=>window.ritvio.readLanguage());assert.equal(initial.preference,'it');
 await page.evaluate(()=>{window.__languageEvents=[];window.ritvio.onLanguage(value=>window.__languageEvents.push(value));return window.ritvio.openMini();});
 await expect.poll(()=>desktop.windows().length,{timeout:20000}).toBe(2);const mini=desktop.windows().find(item=>item!==page);await expect(mini.locator('.mini-player')).toBeVisible();
 await mini.evaluate(()=>{window.__languageEvents=[];window.ritvio.onLanguage(value=>window.__languageEvents.push(value));});
 await page.evaluate(()=>{window.__languageShell=document.querySelector('.app');window.__languagePlayer=document.querySelector('.playerbar');});
 const before=await page.evaluate(()=>window.ritvio.readPlayer());
 await page.evaluate(()=>window.ritvio.writeLanguage('system'));await expect.poll(()=>mini.evaluate(()=>window.__languageEvents.at(-1)?.preference)).toBe('system');
 await mini.evaluate(()=>window.ritvio.writeLanguage('it'));await expect.poll(()=>page.evaluate(()=>window.__languageEvents.at(-1)?.preference)).toBe('it');
 assert.equal(await page.evaluate(()=>window.ritvio.writeLanguage('de').then(()=>false,error=>error.message.includes('LANGUAGE_NOT_READY'))),true);
 assert.equal(await page.evaluate(()=>window.ritvio.writeLanguage('../../it').then(()=>false,()=>true)),true);
 const state=await page.evaluate(()=>({sameShell:window.__languageShell===document.querySelector('.app'),samePlayer:window.__languagePlayer===document.querySelector('.playerbar'),lang:document.documentElement.lang}));assert.deepEqual(state,{sameShell:true,samePlayer:true,lang:'it'});
 assert.equal(await page.evaluate(()=>window.ritvio.readPlayer()),before);
 await desktop.close();desktop=await launch();const reopened=await desktop.firstWindow();await expect(reopened.locator('.app')).toBeVisible({timeout:45000});assert.equal((await reopened.evaluate(()=>window.ritvio.readLanguage())).preference,'it');
 const result={isolatedRoot:area,realElectron:true,mainAndMiniIpcSynchronized:true,mainTreeRetained:true,playerStateUnchanged:true,preferenceSurvivesRestart:true,unreleasedAndInvalidRejected:true,locale:'it',liveAudioClaimed:false};
 await writeFile(path.join(root,'data/analysis/l10n-l1-desktop.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await desktop?.close();}
