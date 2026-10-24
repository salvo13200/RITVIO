import {readFile,writeFile,mkdir,copyFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runtime=path.join(root,'apps/mobile/ios/App/Runtime'),cache=path.join(root,'.local/ios-deps');
const lock=JSON.parse(await readFile(path.join(root,'third-party/ios/runtime-lock.json'),'utf8'));
function run(file,args){return new Promise((resolve,reject)=>{const child=spawn(file,args,{cwd:root,stdio:'inherit',windowsHide:true});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(`${file} failed (${code})`)));});}
async function download(item){
 const target=path.join(cache,item.file);let bytes;
 try{bytes=await readFile(target);}catch(error){if(error.code!=='ENOENT')throw error;}
 if(bytes&&createHash('sha256').update(bytes).digest('hex')===item.sha256)return target;
 const response=await fetch(item.url,{signal:AbortSignal.timeout(120000)});if(!response.ok)throw Error(`Could not download ${item.file}: ${response.status}`);
 bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>128*1024*1024||createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw Error(`Checksum mismatch: ${item.file}`);
 await writeFile(target,bytes);return target;
}
export async function prepareIOSResolver(){
 await mkdir(runtime,{recursive:true});await mkdir(cache,{recursive:true});
 const archive=await download(lock.python),quick=await download(lock.quickjs);
 if(process.platform==='darwin')await run('tar',['-xzf',archive,'-C',runtime]);
 await mkdir(path.join(runtime,'quickjs'),{recursive:true});await run('tar',['-xf',quick,'-C',path.join(runtime,'quickjs'),'--strip-components','1']);
 await writeFile(path.join(runtime,'quickjs/ritvio-quickjs-config.h'),`#define CONFIG_VERSION "${lock.quickjs.version}"\n`);
 const wheels=[];for(const item of lock.wheels)wheels.push(await download(item));
 const python=process.platform==='win32'?path.join(root,'.venv/Scripts/python.exe'):'python3';
 await run(python,[path.join(root,'scripts/prepare-ios-wheels.py'),path.join(runtime,'site-packages'),...wheels]);
 const app=path.join(runtime,'app');await mkdir(app,{recursive:true});
 await copyFile(path.join(root,'apps/mobile/android/app/src/main/python/ritvio_resolver.py'),path.join(app,'ritvio_resolver.py'));
 await copyFile(path.join(root,'apps/mobile/ios/resolver/ios_resolver.py'),path.join(app,'ios_resolver.py'));
 for(const [from,to] of [['music-catalog.py','music_catalog.py'],['home_catalog.py','home_catalog.py'],['playlist-catalog.py','playlist_catalog.py']]){
  await copyFile(path.join(root,'scripts',from),path.join(app,to));
 }
 await copyFile(path.join(root,'apps/mobile/android/app/src/main/python/discovery_catalog.py'),path.join(app,'discovery_catalog.py'));
 const files=['ritvio_resolver.py','ios_resolver.py','music_catalog.py','home_catalog.py','playlist_catalog.py','discovery_catalog.py'];
 const sources=[];for(const file of files)sources.push({file,sha256:createHash('sha256').update(await readFile(path.join(app,file))).digest('hex')});
 await writeFile(path.join(app,'runtime_manifest.json'),JSON.stringify({schema:1,python:lock.python.version,quickjs:lock.quickjs.version,wheels:lock.wheels.map(({name,version,sha256})=>({name,version,sha256})),sources},null,2)+'\n');
 console.log(JSON.stringify({resolverPrepared:true,nativeFramework:process.platform==='darwin',python:lock.python.version,quickjs:lock.quickjs.version,wheels:lock.wheels.length}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await prepareIOSResolver();
