import {mkdir,readFile,writeFile,cp,rm,readdir,stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build,Platform,Arch} from 'electron-builder';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
// Avoid the builder's default ultra-compression memory spike on modest PCs.
process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL??='1';
await import('./collect-licenses.mjs');
const staging=path.join(root,'.packaging');const appDir=path.join(staging,'app');
const runtime=path.join(staging,'runtime/python');const cache=path.join(staging,'downloads');
const pythonVersion='3.13.16';
const pythonSha256='97dae5274cc54867065e8d5a3226e48c35017ed332a0fdb0e27d5b5821961297';
function run(command,args,options={}){const result=spawnSync(command,args,{cwd:root,stdio:'inherit',shell:false,windowsHide:true,...options});if(result.error)throw result.error;if(result.status!==0)throw Error(`Comando fallito (${result.status}): ${path.basename(command)}`);}
async function reset(directory){
  const resolved=path.resolve(directory);
  if(!resolved.startsWith(`${staging}${path.sep}`))throw Error('Pulizia fuori dalla cartella di build rifiutata');
  await rm(resolved,{recursive:true,force:true});await mkdir(resolved,{recursive:true});
}
async function download(url,filename,sha256){
  let bytes=existsSync(filename)?await readFile(filename):undefined;
  const valid=data=>!sha256||createHash('sha256').update(data).digest('hex')===sha256;
  if(!bytes||!valid(bytes)){
    console.log(`Download ${new URL(url).pathname.split('/').at(-1)}`);
    const response=await fetch(url,{signal:AbortSignal.timeout(120000)});if(!response.ok)throw Error(`Download fallito: ${response.status}`);
    bytes=Buffer.from(await response.arrayBuffer());if(!valid(bytes))throw Error('Checksum runtime Python non valido');await writeFile(filename,bytes);
  }
}
await mkdir(cache,{recursive:true});
const requirements=await readFile(path.join(root,'requirements-resolver.txt'),'utf8');
const runtimeKey=createHash('sha256').update(pythonVersion+requirements).digest('hex');
const ready=path.join(runtime,'ritvio-runtime.json');
if(!existsSync(ready)||JSON.parse(await readFile(ready,'utf8')).key!==runtimeKey){
  await reset(runtime);
  const archive=path.join(cache,`python-${pythonVersion}-embed-amd64.zip`);
  await download(`https://www.python.org/ftp/python/${pythonVersion}/python-${pythonVersion}-embed-amd64.zip`,archive,pythonSha256);
  // zipfile extracts only this verified official archive into a checked build directory.
  const python=path.join(root,'.venv/Scripts/python.exe');if(!existsSync(python))throw Error('Esegui prima setup:resolver sul PC di sviluppo.');
  run(python,['-c','import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])',archive,runtime]);
  await writeFile(path.join(runtime,'python313._pth'),'python313.zip\n.\nsite-packages\n');
  run(python,['-m','pip','install','--only-binary=:all:','--target',path.join(runtime,'site-packages'),'-r',path.join(root,'requirements-resolver.txt')]);
  run(path.join(runtime,'python.exe'),['-c','import sys,yt_dlp,ytmusicapi,requests; print("Runtime incluso:",sys.version.split()[0])']);
  await writeFile(ready,JSON.stringify({key:runtimeKey,pythonVersion,pythonSha256},null,2));
}
await mkdir(appDir,{recursive:true});
for(const directory of ['dist','apps','scripts'])await reset(path.join(appDir,directory));
await cp(path.join(root,'dist/client'),path.join(appDir,'dist/client'),{recursive:true});
await cp(path.join(root,'dist/api.mjs'),path.join(appDir,'dist/api.mjs'));
// Ship every desktop module, including local dependencies added with new features.
const desktopSource=path.join(root,'apps/desktop'),desktopTarget=path.join(appDir,'apps/desktop');
for(const name of await readdir(desktopSource))if(name.endsWith('.cjs'))await cp(path.join(desktopSource,name),path.join(desktopTarget,name));
for(const name of await readdir(desktopTarget)){
  const source=await readFile(path.join(desktopTarget,name),'utf8');
  for(const match of source.matchAll(/require\(['"](\.[^'"]+)['"]\)/g))if(!existsSync(path.resolve(desktopTarget,match[1])))throw Error(`Modulo desktop mancante nel pacchetto: ${name} → ${match[1]}`);
}
console.log('Dipendenze desktop incluse e verificate');
const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const deps=Object.fromEntries(['fastify','@fastify/cors','@fastify/static','dotenv'].map(name=>[name,pkg.dependencies[name]]));
await writeFile(path.join(appDir,'package.json'),JSON.stringify({name:'ritvio',version:pkg.version,private:true,description:'RITVIO — music at your own pace',author:'RITVIO',license:pkg.license,main:'apps/desktop/main.cjs',dependencies:deps},null,2));
await writeFile(path.join(appDir,'.npmrc'),'node-linker=hoisted\n');
// Keep dependency discovery inside this staging project. Otherwise pnpm's
// collector can climb to the monorepo and package Android/development modules,
// including paths too long for NSIS's atomic update directory.
await writeFile(path.join(appDir,'pnpm-workspace.yaml'),'packages:\n  - "."\n');
const pnpm=process.env.npm_execpath;if(!pnpm)throw Error('Avvia la build con pnpm package:windows.');
run(process.execPath,[pnpm,'--dir',appDir,'install','--prod','--ignore-workspace','--ignore-scripts']);
const notices=path.join(staging,'notices');await reset(notices);
await cp(path.join(root,'third-party'),path.join(notices,'third-party'),{recursive:true});
for(const name of ['LICENSE','THIRD_PARTY_NOTICES.md','PRIVACY.md'])await cp(path.join(root,name),path.join(notices,name));
if(!existsSync(path.join(root,'node_modules/electron/dist/electron.exe')))run(process.execPath,[path.join(root,'node_modules/electron/install.js')]);
await cp(path.join(root,'node_modules/electron/dist/LICENSE'),path.join(notices,'Electron-LICENSE.txt'));
await cp(path.join(root,'node_modules/electron/dist/LICENSES.chromium.html'),path.join(notices,'Chromium-LICENSES.html'));
await cp(path.join(runtime,'LICENSE.txt'),path.join(notices,'Python-LICENSE.txt'));
for(const name of [...Object.keys(pkg.dependencies),'tailwindcss']){
  const base=path.join(root,'node_modules',name);const target=path.join(notices,'Frontend-and-Node',name);
  await mkdir(target,{recursive:true});await cp(path.join(base,'package.json'),path.join(target,'package.json'));
  for(const filename of await readdir(base))if(/^(LICENSE|LICENCE|COPYING|NOTICE)/i.test(filename))await cp(path.join(base,filename),path.join(target,filename),{recursive:true});
}
// Check our sibling catalog import under the same isolated Python as the EXE.
run(path.join(runtime,'python.exe'),['-c','import runpy,sys; runpy.run_path(sys.argv[1]); import home_catalog; print("Modulo Home incluso disponibile")',path.join(root,'scripts/music-catalog.py')]);
const packages=[];
for(const name of await readdir(path.join(runtime,'site-packages'))){
  if(!name.endsWith('.dist-info'))continue;
  const base=path.join(runtime,'site-packages',name);const meta=await readFile(path.join(base,'METADATA'),'utf8');
  packages.push({name:meta.match(/^Name: (.+)$/m)?.[1],version:meta.match(/^Version: (.+)$/m)?.[1],license:meta.match(/^License-Expression: (.+)$/m)?.[1]??meta.match(/^License: (.+)$/m)?.[1]??'Vedi METADATA e licenses'});
  await cp(base,path.join(notices,'Python-packages',name),{recursive:true});
}
await writeFile(path.join(notices,'COMPONENTI.json'),JSON.stringify({electron:pkg.devDependencies.electron,python:pythonVersion,packages,nodePackages:deps},null,2));
await writeFile(path.join(notices,'LEGGIMI.txt'),'RITVIO contiene runtime e librerie di terze parti. Le rispettive licenze sono incluse qui e nelle cartelle node_modules e runtime/python/site-packages. I moduli Python, incluso mutagen (GPL-2.0-or-later), contengono il loro codice sorgente. Le licenze del software non concedono diritti sui contenuti musicali.\n');
// Never replace an unpacked app the user may be running. Each build owns its
// intermediate output; only finished distributable artifacts go to release.
const windowsOutput=path.join(staging,`windows-${pkg.version}-${Date.now()}`);
await build({targets:Platform.WINDOWS.createTarget(['portable','nsis'],Arch.x64),config:{
  appId:'it.ritvio.desktop',productName:'RITVIO',electronVersion:pkg.devDependencies.electron,
  electronDist:path.join(root,'node_modules/electron/dist'),directories:{app:appDir,output:windowsOutput,buildResources:path.join(root,'build-resources')},
  asar:true,npmRebuild:false,nodeGypRebuild:false,publish:null,compression:'normal',
  files:['package.json','apps/desktop/**','dist/**','node_modules/**','!node_modules/@capacitor/**'],
  extraResources:[{from:runtime,to:'runtime/python',filter:['**/*','!**/__pycache__/**','!**/*.pyc','!**/bin/**']},
    {from:path.join(root,'scripts/music-catalog.py'),to:'scripts/music-catalog.py'},
    {from:path.join(root,'scripts/home_catalog.py'),to:'scripts/home_catalog.py'},
    {from:path.join(root,'scripts/playlist-catalog.py'),to:'scripts/playlist-catalog.py'},
    {from:path.join(root,'scripts/playback-worker.py'),to:'scripts/playback-worker.py'},
    {from:notices,to:'licenze'}],
  win:{target:['portable','nsis'],executableName:'RITVIO',icon:path.join(root,'build-resources/icon.ico'),signAndEditExecutable:true,signExecutable:false,requestedExecutionLevel:'asInvoker'},
  // In the pinned builder 26.15.3, true omits UNPACK_DIR_NAME and uses NSIS's
  // unique $PLUGINSDIR for each launch. false uses a shared directory per build.
  portable:{artifactName:'RITVIO-${version}-portatile.${ext}',requestExecutionLevel:'user',unpackDirName:true},
  nsis:{artifactName:'RITVIO-${version}-setup.${ext}',oneClick:false,perMachine:false,allowElevation:false,allowToChangeInstallationDirectory:true,
    installerLanguages:['en_US','it_IT'],language:'1033',displayLanguageSelector:true,packElevateHelper:false,runAfterFinish:false,
    createDesktopShortcut:true,createStartMenuShortcut:true,deleteAppDataOnUninstall:false,include:path.join(root,'build-resources/installer.nsh')},
}});
for(const variant of ['portatile','setup']){
  const exe=path.join(root,'release',`RITVIO-${pkg.version}-${variant}.exe`);
  await mkdir(path.dirname(exe),{recursive:true});
  await cp(path.join(windowsOutput,path.basename(exe)),exe);
  await writeFile(`${exe}.sha256`,`${createHash('sha256').update(await readFile(exe)).digest('hex')}  ${path.basename(exe)}\n`);
  console.log(`EXE pronto: ${exe} (${Math.round((await stat(exe)).size/1048576)} MiB)`);
}
