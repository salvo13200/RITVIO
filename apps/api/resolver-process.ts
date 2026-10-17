import {spawn} from 'node:child_process';
import type {Config} from './config';
import {AppError} from './errors';
export function runResolverJson(config:Config,args:string[],input?:unknown,signal?:AbortSignal):Promise<any>{
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(new AppError(409,'IMPORT_CANCELLED','Importazione annullata.'));return;}
    const child=spawn(config.python,args,{cwd:config.electronNode?undefined:config.root,shell:false,windowsHide:true,env:{...process.env,PYTHONIOENCODING:'utf-8',...(config.electronNode?{ELECTRON_RUN_AS_NODE:'1'}:{})}});
    let stdout='';let stderr='';let settled=false;
    const clean=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);};
    const fail=(error:AppError)=>{if(settled)return;settled=true;clean();child.kill();reject(error);};
    const timer=setTimeout(()=>fail(new AppError(504,'RESOLVER_TIMEOUT','Il servizio musicale impiega troppo tempo a rispondere. Riprova.')),config.timeoutMs);
    const abort=()=>fail(new AppError(409,'IMPORT_CANCELLED','Importazione annullata.'));
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    child.on('error',()=>fail(new AppError(503,'RESOLVER_MISSING','Installa i resolver con setup:resolver.')));
    child.stdin.on('error',()=>{});
    child.stdin.end(input===undefined?undefined:JSON.stringify(input));
    child.stdout.on('data',chunk=>{stdout+=chunk.toString();if(stdout.length>8*1024*1024)fail(new AppError(502,'RESOLVER_OUTPUT','Risposta del resolver troppo grande.'));});
    child.stderr.on('data',chunk=>{if(stderr.length<10000)stderr+=chunk.toString();});
    child.on('close',code=>{
      if(settled)return;settled=true;clean();
      if(code!==0){
        const missing=/No module named|not found|cannot find/i.test(stderr);
        const restricted=/private|unavailable|sign in|age.restricted|not available|removed/i.test(stderr);
        return reject(new AppError(missing?503:restricted?502:503,missing?'RESOLVER_MISSING':restricted?'TRACK_UNAVAILABLE':'RESOLVER_FAILED',missing?'Installa i resolver con setup:resolver.':restricted?'Questo contenuto non è disponibile.':'Il servizio musicale non risponde. Controlla la connessione o aggiorna i resolver.'));
      }
      try{resolve(JSON.parse(stdout));}catch{reject(new AppError(502,'RESOLVER_OUTPUT','Risposta del resolver non valida.'));}
    });
  });
}
