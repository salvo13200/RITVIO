import {spawn} from 'node:child_process';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {writeFile,mkdir} from 'node:fs/promises';
import {loadConfig} from '../apps/api/config';
import {Resolver} from '../apps/api/resolver';
import {AppError} from '../apps/api/errors';
const config=loadConfig(),id=process.argv[2]??'jNQXAC9IVRw',label=process.argv[3]??'before';
if(!/^[a-z0-9-]+$/i.test(label))throw Error('Etichetta non valida');
const imports:number[]=[];
for(let i=0;i<3;i++){
  const started=performance.now();
  await new Promise<void>((resolve,reject)=>{const child=spawn(config.python,['-c','import yt_dlp'],{windowsHide:true,stdio:'ignore'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('Import failed')));});
  imports.push(performance.now()-started);
}
const resolver=new Resolver(config),samples:unknown[]=[];const workerMemory:{workingSetBytes:number;privateBytes:number}[]=[];
let warmMs:number|undefined;
if(process.argv.includes('--warm')){const started=performance.now();await resolver.installed();warmMs=performance.now()-started;}
try{
  for(const [name,fresh] of [['cold',false],['fresh',true],['cached',false]] as const){
    const started=performance.now();
    try{
      const result=await resolver.resolve(id,fresh);const resolvedMs=performance.now()-started;
      const streamStarted=performance.now();
      const response=await fetch(result.playback.url,{headers:{Range:'bytes=0-1023'},signal:AbortSignal.timeout(15000)});
      const reader=response.body?.getReader();const first=await reader?.read();await reader?.cancel();
      samples.push({name,resolvedMs,firstBytesMs:performance.now()-streamStarted,status:response.status,bytes:first?.value?.length??0});
    }catch(error){samples.push({name,elapsedMs:performance.now()-started,error:error instanceof AppError?error.code:'STREAM_ERROR'});}
  }
  if(process.platform==='win32')for(const worker of resolver.diagnostics().workers){if(worker.pid){try{const result=await promisify(execFile)('powershell.exe',['-NoProfile','-Command',`$workerProcess = [System.Diagnostics.Process]::GetProcessById(${worker.pid}); @{ workingSetBytes=$workerProcess.WorkingSet64; privateBytes=$workerProcess.PrivateMemorySize64 } | ConvertTo-Json -Compress`],{windowsHide:true});workerMemory.push(JSON.parse(result.stdout.trim()));}catch{}}}
}finally{await resolver.close();}
const report={label,videoId:id,conditions:'Sequential real resolver resolutions; first 1024 bytes requested in memory, no saved audio. Three isolated Python imports approximate startup overhead. Optional warm explicitly readies the resolver before first resolution. Worker working set and private committed bytes measured on Windows before shutdown, not whole-app RAM. No URL, token or provider diagnostic persisted.',importsMs:imports,warmMs,workerMemory,samples};
await mkdir('data/analysis',{recursive:true});await writeFile(`data/analysis/playback-${label}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
