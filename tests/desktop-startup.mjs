import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import net from 'node:net';
import {chromium,expect} from '@playwright/test';

const root=process.cwd(),exec=promisify(execFile);
assert.equal(process.platform,'win32','The startup probe requires Windows.');
function option(name,fallback){const index=process.argv.indexOf(name);return index<0?fallback:process.argv[index+1];}
const version=option('--version',JSON.parse(await readFile('package.json','utf8')).version);
const count=Number(option('--samples','3'));
const folderInput=option('--folder-exe',undefined),folderOnly=process.argv.includes('--folder-only');
const folderExe=folderInput?path.resolve(folderInput):undefined;
assert(/^\d+\.\d+\.\d+$/.test(version),'Invalid version.');
assert(Number.isInteger(count)&&count>=1&&count<=10,'--samples must be an integer from 1 to 10.');
assert(!folderOnly||folderExe,'--folder-only requires --folder-exe.');
if(folderExe)assert(folderExe.startsWith(path.join(root,'.packaging')+path.sep)&&path.basename(folderExe)==='RITVIO.exe','Folder executable must belong to this workspace staging directory.');
const testRoot=path.join(root,'.packaging',`startup-${randomUUID()}`);
const installed=path.join(testRoot,'app'),installedExe=path.join(installed,'RITVIO.exe');
const portable=path.join(root,'release',`RITVIO-${version}-portatile.exe`),setup=path.join(root,'release',`RITVIO-${version}-setup.exe`);
const executables={portable,installed:installedExe,...folderExe?{folder:folderExe}:{}};
const kinds=folderOnly?['folder']:Object.keys(executables);
const reportFile=path.join(root,`test-results/startup/${folderOnly?'folder':'desktop'}-${version}.json`);
const powershell=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
const quote=value=>"'"+value.replaceAll("'","''")+"'";
async function shell(script){return(await exec(powershell,['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:30000})).stdout.trim();}
async function registrations(){return JSON.parse(await shell("ConvertTo-Json -InputObject @(Get-ChildItem 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall' -ErrorAction SilentlyContinue | Get-ItemProperty | Where-Object { $_.DisplayName -like 'RITVIO*' } | Select-Object InstallLocation,UninstallString)"));}
assert.equal((await registrations()).length,0,'An installation already exists; this probe will not replace it.');
assert.equal(Number(await shell("@(Get-Process -Name RITVIO -ErrorAction SilentlyContinue).Count")),0,'A personal RITVIO app is open; this probe will not stop it.');
// The real NSIS install also manages shortcuts. A portable user can have a
// personal shortcut even without an installed-app registration.
if(!folderOnly)assert.equal(Number(await shell("$locations = @([Environment]::GetFolderPath('DesktopDirectory'),[Environment]::GetFolderPath('CommonDesktopDirectory'),[Environment]::GetFolderPath('Programs'),[Environment]::GetFolderPath('CommonPrograms')); $links = @($locations | ForEach-Object { Join-Path $_ 'RITVIO.lnk'; Join-Path $_ 'RITVIO/RITVIO.lnk' }); @($links | Where-Object { Test-Path -LiteralPath $_ }).Count")),0,'Existing RITVIO shortcuts found; use a disposable test environment instead.');
assert(installed.startsWith(path.join(root,'.packaging')+path.sep));
const digest=async file=>createHash('sha256').update(await readFile(file)).digest('hex');
const digests={};
for(const file of folderOnly?[folderExe]:[portable,setup]){const hash=await digest(file);if(!folderOnly)assert.equal(hash,(await readFile(file+'.sha256','utf8')).trim().split(/\s/)[0],`Checksum mismatch: ${path.basename(file)}`);digests[path.basename(file)]=hash;}
const personalFiles=['cache/mvp.sqlite','cache/mvp.sqlite-wal','player-state.json','language-preference.json'].map(file=>path.join(process.env.APPDATA,'RITVIO',file));
async function fingerprint(file){try{return await digest(file);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
const before=await Promise.all(personalFiles.map(fingerprint));
await mkdir(testRoot,{recursive:true});
await writeFile(path.join(testRoot,'personal-fingerprints-before.json'),JSON.stringify(before));
const temp=path.join(testRoot,'installer-temp');await mkdir(temp,{recursive:true});
const installerEnv={...process.env,TEMP:temp,TMP:temp};
async function installer(file,args){await exec(file,args,{cwd:testRoot,env:installerEnv,windowsHide:true,timeout:180000,maxBuffer:1048576});}
async function port(){return new Promise((resolve,reject)=>{const server=net.createServer();server.on('error',reject);server.listen(0,'127.0.0.1',()=>{const value=server.address().port;server.close(error=>error?reject(error):resolve(value));});});}
async function bounded(task,ms=5000){let timer;try{return await Promise.race([task,new Promise(resolve=>{timer=setTimeout(resolve,ms);})]);}finally{clearTimeout(timer);}}
const samples=[];
let installedByProbe=false;
let result;
async function sample(kind,index){
  const profile=path.join(testRoot,`${kind}-${index}`),temporary=path.join(profile,'temp');
  await mkdir(temporary,{recursive:true});
  await writeFile(path.join(profile,'language-preference.json'),JSON.stringify({schema:1,preference:'en'}));
  const debugPort=await port();
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!(/^(PYTHON|YOUTUBE_|RITVIO_|ELECTRON_|NODE_)/i.test(key))));
  Object.assign(env,{PATH:path.join(process.env.SystemRoot,'System32'),TEMP:temporary,TMP:temporary,RITVIO_TEST_HIDDEN:'true',RITVIO_TEST_USER_DATA:profile,RITVIO_TEST_CDP_PORT:String(debugPort)});
  let browser,output='',devtoolsAdvertisedMs;
  const started=performance.now(),child=spawn(executables[kind],[],{cwd:testRoot,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let launchError;child.on('error',error=>{launchError=error;});
  for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{const value=chunk.toString();output+=value;if(devtoolsAdvertisedMs===undefined&&value.includes('DevTools listening'))devtoolsAdvertisedMs=performance.now()-started;});
  try{
    await expect.poll(async()=>{if(launchError)throw launchError;if(child.exitCode!==null)throw Error(`Test process exited with code ${child.exitCode}`);try{return(await fetch(`http://127.0.0.1:${debugPort}/json/version`,{signal:AbortSignal.timeout(500)})).ok;}catch{return false;}},{timeout:120000,intervals:[100]}).toBe(true);
    const debugReadyMs=performance.now()-started;
    browser=await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
    await expect.poll(()=>browser.contexts()[0]?.pages().length??0,{timeout:30000,intervals:[100]}).toBeGreaterThan(0);
    const page=browser.contexts()[0].pages()[0];
    await expect(page.getByRole('textbox',{name:'Search music',exact:true})).toBeVisible({timeout:45000});
    await expect(page.locator('.brand')).toContainText('RITVIO');
    const controlsReadyMs=performance.now()-started;
    const renderer=await page.evaluate(()=>({navigation:performance.getEntriesByType('navigation').map(({responseEnd,domContentLoadedEventEnd,loadEventEnd})=>({responseEnd,domContentLoadedEventEnd,loadEventEnd})),paint:performance.getEntriesByType('paint').map(({name,startTime})=>({name,startTime}))}));
    await page.getByRole('button',{name:'Settings',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Sources and attribution',exact:true})).toBeVisible();
    const settingsUsableMs=performance.now()-started;
    const record={kind,index,devtoolsAdvertisedMs,debugReadyMs,controlsReadyMs,settingsUsableMs,renderer};samples.push(record);
    console.log(JSON.stringify(record));
  }finally{
    if(browser){try{const cdp=await browser.newBrowserCDPSession();await bounded(cdp.send('Browser.close').catch(()=>{}));}catch{}await bounded(browser.close().catch(()=>{}));}
    try{await expect.poll(()=>child.exitCode,{timeout:30000}).not.toBe(null);}catch(error){if(child.pid)await exec('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true}).catch(()=>{});throw error;}
    await writeFile(path.join(profile,'process.log'),output);
  }
}
try{
  let installationMs;
  if(!folderOnly){installedByProbe=true;const installStarted=performance.now();await installer(setup,['/S',`/D=${installed}`]);installationMs=performance.now()-installStarted;}
  for(const exe of folderOnly?[folderExe]:[installedExe,...folderExe?[folderExe]:[]])assert.equal(JSON.parse(await shell(`(Get-Item -LiteralPath ${quote(exe)}).VersionInfo | Select-Object ProductVersion | ConvertTo-Json -Compress`)).ProductVersion.startsWith(version),true);
  for(let index=1;index<=count;index++)for(const kind of index%2?kinds:[...kinds].reverse())await sample(kind,index);
  const summary={};
  for(const kind of kinds){summary[kind]={};for(const metric of ['devtoolsAdvertisedMs','debugReadyMs','controlsReadyMs','settingsUsableMs']){const values=samples.filter(value=>value.kind===kind&&Number.isFinite(value[metric])).map(value=>value[metric]).sort((a,b)=>a-b);summary[kind][metric]={n:values.length,min:values[0],median:values[Math.floor(values.length/2)],max:values.at(-1)};}}
  result={version,digests,installationMs,complete:false,conditions:'Sequential launches, alternating order for the installer/portable comparison, fresh English profile for every launch, clean PATH, hidden native windows, existing OS/Defender filesystem caches retained. Controls-ready means Search music is visible in the hidden renderer, not a visible-window or cold-boot measurement. Debug startup includes Windows process/security/loader work and portable extraction, not extraction alone. Home network collections and audible playback are not readiness criteria.',summary,samples};
  await mkdir(path.dirname(reportFile),{recursive:true});await writeFile(reportFile,JSON.stringify(result,null,2));
}finally{
  if(installedByProbe){
    const current=await registrations();assert(current.every(item=>{
      const executable=item.UninstallString?.match(/^"([^"]+)"(?:\s|$)/)?.[1];
      return executable&&path.resolve(executable).toLowerCase()===path.join(installed,'Uninstall RITVIO.exe').toLowerCase()&&(!item.InstallLocation||path.resolve(item.InstallLocation).toLowerCase()===installed.toLowerCase());
    }),'A different installation appeared; refusing to uninstall it.');
    await installer(path.join(installed,'Uninstall RITVIO.exe'),['/S']);
    await expect.poll(async()=>{try{await stat(installedExe);return false;}catch(error){if(error.code==='ENOENT')return true;if(['EPERM','EACCES'].includes(error.code))return false;throw error;}},{timeout:120000}).toBe(true);
    assert.equal((await registrations()).length,0,'Test registration was not cleaned up.');
  }
  assert.deepEqual(await Promise.all(personalFiles.map(fingerprint)),before,'Personal data changed during the probe.');
}
Object.assign(result,{complete:true,personalDataUntouched:true,isolatedInstallationRemoved:installedByProbe});
await writeFile(reportFile,JSON.stringify(result,null,2));
console.log(JSON.stringify({complete:true,version,personalDataUntouched:true,isolatedInstallationRemoved:installedByProbe,report:reportFile}));
