import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,writeFile,access} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import net from 'node:net';
import {chromium,expect} from '@playwright/test';
const exec=promisify(execFile);const root=process.cwd();
const version=JSON.parse(await readFile('package.json','utf8')).version;
const setup=path.join(root,'release',`RITVIO-${version}-setup.exe`);
const previousIndex=process.argv.indexOf('--from-version');
const previousVersion=previousIndex<0?null:process.argv[previousIndex+1];
if(previousIndex>=0)assert(typeof previousVersion==='string'&&/^\d+\.\d+\.\d+$/.test(previousVersion)&&previousVersion!==version,'--from-version requires a different numeric release version.');
const previousSetup=previousVersion?path.join(root,'release',`RITVIO-${previousVersion}-setup.exe`):null;
const testRoot=path.join(root,'.packaging',`installer-test-${randomUUID()}`);
const installed=path.join(testRoot,'app');const profile=path.join(testRoot,'profile');
assert(process.platform==='win32','Questo test richiede Windows.');
assert(installed.startsWith(path.join(root,'.packaging')+path.sep),'Destinazione fuori dalla cartella di prova.');
const powershell=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
async function shell(script){return(await exec(powershell,['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:20000})).stdout.trim();}
const existing=await shell("@(Get-ChildItem 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall' -ErrorAction SilentlyContinue | Get-ItemProperty | Where-Object { $_.DisplayName -like 'RITVIO*' }).Count");
assert.equal(Number(existing),0,'È già presente RITVIO installato. Questo test non modifica installazioni esistenti.');
const running=await shell("@(Get-Process -Name RITVIO -ErrorAction SilentlyContinue).Count");
assert.equal(Number(running),0,'Chiudi RITVIO prima del test installer: il test non termina app dell’utente.');
const artifact=await readFile(setup);const checksum=(await readFile(setup+'.sha256','utf8')).split(' ')[0];
assert.equal(createHash('sha256').update(artifact).digest('hex'),checksum,'Checksum installer errato.');
if(previousSetup){const bytes=await readFile(previousSetup),expected=(await readFile(previousSetup+'.sha256','utf8')).split(' ')[0];assert.equal(createHash('sha256').update(bytes).digest('hex'),expected,'Previous installer checksum mismatch.');}
async function fingerprint(filename){try{return createHash('sha256').update(await readFile(filename)).digest('hex');}catch(error){if(error.code==='ENOENT')return null;throw error;}}
const personalFiles=['cache/mvp.sqlite','cache/mvp.sqlite-wal','player-state.json'].map(file=>path.join(process.env.APPDATA,'RITVIO',file));
const before=await Promise.all(personalFiles.map(fingerprint));
await mkdir(profile,{recursive:true});await writeFile(path.join(profile,'data-kept.txt'),'Dati della prova da conservare durante aggiornamento e disinstallazione.\n');
await writeFile(path.join(profile,'language-preference.json'),JSON.stringify({schema:1,preference:'en'})+'\n');
const temporary=path.join(testRoot,'temp');await mkdir(temporary,{recursive:true});
const installerEnv={...process.env,TEMP:temporary,TMP:temporary};
async function execute(executable,args=[],env=installerEnv){
  return new Promise((resolve,reject)=>{
    const child=spawn(executable,args,{cwd:testRoot,env,windowsHide:true,stdio:['ignore','pipe','pipe']});let out='';
    child.stdout.on('data',data=>out+=data);child.stderr.on('data',data=>out+=data);
    const timer=setTimeout(()=>{child.kill();reject(Error('Tempo esaurito durante la prova installer.'));},180000);
    child.on('error',error=>{clearTimeout(timer);reject(error);});child.on('close',code=>{clearTimeout(timer);if(code===0)resolve(out);else reject(Error(`Processo installer/app terminato con codice ${code}: ${out.slice(-600)}`));});
  });
}
async function exists(filename){try{await access(filename);return true;}catch{return false;}}
async function waitFor(predicate){const until=Date.now()+120000;while(Date.now()<until){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,1000));}throw Error('La disinstallazione non ha completato la rimozione dei file della prova.');}
async function bounded(task,ms=5000){let timer;try{return await Promise.race([task,new Promise(resolve=>{timer=setTimeout(resolve,ms);})]);}finally{clearTimeout(timer);}}
async function smoke(){
  const port=await new Promise((resolve,reject)=>{const server=net.createServer();server.on('error',reject);server.listen(0,'127.0.0.1',()=>{const value=server.address().port;server.close(error=>error?reject(error):resolve(value));});});
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!(/^(PYTHON|YOUTUBE_|RITVIO_|ELECTRON_|NODE_)/i.test(key))));
  Object.assign(env,{PATH:path.join(process.env.SystemRoot,'System32'),TEMP:temporary,TMP:temporary,RITVIO_TEST_CDP_PORT:String(port),RITVIO_TEST_HIDDEN:'true',RITVIO_TEST_USER_DATA:profile});
  const child=spawn(path.join(installed,'RITVIO.exe'),[],{cwd:testRoot,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='',launchError,browser;
  child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>output+=data);child.on('error',error=>{launchError=error;});
  try{
    await expect.poll(async()=>{if(launchError)throw launchError;if(child.exitCode!==null)throw Error(`App terminata: ${output.slice(-1000)}`);try{return(await fetch(`http://127.0.0.1:${port}/json/version`)).ok;}catch{return false;}},{timeout:90000}).toBe(true);
    browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    await expect.poll(()=>browser.contexts()[0]?.pages().length??0,{timeout:30000}).toBeGreaterThan(0);
    const page=browser.contexts()[0].pages()[0];
    await expect(page.locator('.brand')).toContainText('RITVIO',{timeout:45000});
    await expect(page.locator('html')).toHaveAttribute('lang','en');
    await expect(page.getByRole('textbox',{name:'Search music',exact:true})).toBeVisible();
    await expect(page.getByRole('heading',{name:'Global hits',exact:true})).toBeVisible({timeout:30000});
    await expect(page.locator('.home2')).not.toContainText('Italy hits');
    await expect(page.locator('.home2-features')).not.toContainText(/YouTube|YT Music/i);
    await page.getByRole('button',{name:'Settings',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Sources and attribution',exact:true})).toBeVisible();
    await expect(page.locator('.settings-sources')).toContainText('YouTube Music');
    const result=await page.evaluate(()=>({title:document.title,nodeExposed:typeof window.require!=='undefined'}));
    assert.equal(result.title,'RITVIO');assert.equal(result.nodeExposed,false);
    assert(await exists(path.join(profile,'cache/mvp.sqlite')),'Il backend installato non ha creato il database.');
  }finally{
    if(browser){try{const cdp=await browser.newBrowserCDPSession();await bounded(cdp.send('Browser.close').catch(()=>{}));}catch{}await bounded(browser.close().catch(()=>{}));}
    try{await expect.poll(()=>child.exitCode!==null,{timeout:20000}).toBe(true);}catch{child.kill();await expect.poll(()=>child.exitCode!==null,{timeout:10000}).toBe(true);}
    // A child resolver can outlive the main PID briefly. Wait for this isolated
    // installation's processes before updating; never touch a user's app.
    const ownedExecutable=path.join(installed,'RITVIO.exe').replaceAll("'","''");
    await expect.poll(async()=>Number(await shell(`@(Get-CimInstance Win32_Process -Filter "Name='RITVIO.exe'" | Where-Object { $_.ExecutablePath -eq '${ownedExecutable}' }).Count`)),{timeout:30000}).toBe(0);
    await writeFile(path.join(testRoot,`launch-${Date.now()}.log`),output);
  }
}
async function uninstall(){
  const uninstaller=path.join(installed,'Uninstall RITVIO.exe');if(!await exists(uninstaller))return;
  assert(path.resolve(uninstaller).startsWith(path.join(root,'.packaging')+path.sep),'Disinstallazione fuori dalla cartella di prova rifiutata.');
  await execute(uninstaller,['/S']);await waitFor(async()=>!await exists(path.join(installed,'RITVIO.exe')));
}
try{
  let previousDatabase;
  if(previousSetup){await execute(previousSetup,['/S',`/D=${installed}`]);await smoke();previousDatabase=await fingerprint(path.join(profile,'cache/mvp.sqlite'));assert(previousDatabase,'Previous installed version must create its database.');}
  await execute(setup,['/S',`/D=${installed}`]);assert(await exists(path.join(installed,'RITVIO.exe')));
  if(previousSetup)assert.equal(await fingerprint(path.join(profile,'cache/mvp.sqlite')),previousDatabase,'The installer update changed the existing database.');
  const quoted=path.join(installed,'RITVIO.exe').replaceAll("'","''");
  const metadata=JSON.parse(await shell(`(Get-Item -LiteralPath '${quoted}').VersionInfo | Select-Object ProductName,ProductVersion,FileVersion | ConvertTo-Json -Compress`));
  assert.equal(metadata.ProductName,'RITVIO');assert(metadata.ProductVersion.startsWith(version));
  await smoke();console.log('Installazione per utente e avvio con PATH pulito riusciti.');
  const dbBefore=await fingerprint(path.join(profile,'cache/mvp.sqlite'));
  await execute(setup,['/S',`/D=${installed}`]);assert.equal(await fingerprint(path.join(profile,'cache/mvp.sqlite')),dbBefore);
  await smoke();console.log('Reinstallazione/aggiornamento e avvio riusciti; dati di prova conservati.');
  await uninstall();assert(await exists(path.join(profile,'data-kept.txt')));assert(await exists(path.join(profile,'cache/mvp.sqlite')));
  assert.deepEqual(await Promise.all(personalFiles.map(fingerprint)),before,'I dati personali sono cambiati durante la prova installer.');
  const remaining=await shell("@(Get-ChildItem 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall' -ErrorAction SilentlyContinue | Get-ItemProperty | Where-Object { $_.DisplayName -like 'RITVIO*' }).Count");assert.equal(Number(remaining),0);
  console.log(JSON.stringify({setup,previousVersion,perUserInstallation:true,cleanPathLaunch:true,englishInstalledUi:true,globalHome:true,versionMetadata:true,reinstall:true,dataPreserved:true,personalDataUntouched:true,uninstall:true,registryClean:true,testRoot}));
}finally{await uninstall();}
