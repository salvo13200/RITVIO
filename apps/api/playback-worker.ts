import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import path from 'node:path';
import type {Config} from './config';
import {AppError} from './errors';
type Pending={resolve:(value:any)=>void;reject:(error:unknown)=>void};
/** An idle worker releases memory after two minutes; an aborted operation kills its owned process. */
class Worker{
  private child:ChildProcessWithoutNullStreams;private buffer='';private readyPromise:Promise<void>;private pending?:Pending;
  private dead=false;private timer?:ReturnType<typeof setTimeout>;private readySettled=false;private rejectReady!:(e:unknown)=>void;
  busy=false;readyMs=0;private interpreterPid?:number;terminated=false;readonly closed:Promise<void>;
  constructor(private config:Config){
    const started=performance.now();
    this.child=spawn(config.python,['-u',config.playbackScript??path.join(path.dirname(config.catalogScript??path.join(config.root,'scripts/music-catalog.py')),'playback-worker.py'),config.node],{shell:false,windowsHide:true,cwd:config.electronNode?undefined:config.root,env:{...process.env,PYTHONIOENCODING:'utf-8',...(config.electronNode?{ELECTRON_RUN_AS_NODE:'1'}:{})}});
    this.closed=new Promise(resolve=>this.child.once('close',()=>{this.terminated=true;resolve();}));
    this.readyPromise=new Promise<void>((resolve,reject)=>{
      this.rejectReady=reject;
      this.child.stdout.on('data',chunk=>{
        this.buffer+=chunk.toString();if(this.buffer.length>2*1024*1024){this.stop();return;}
        let index:number;while((index=this.buffer.indexOf('\n'))>=0){const line=this.buffer.slice(0,index);this.buffer=this.buffer.slice(index+1);
          try{const message=JSON.parse(line);
            if(!this.readySettled&&message.ready===true){this.readySettled=true;this.interpreterPid=Number.isSafeInteger(message.pid)&&message.pid>0?message.pid:this.child.pid;this.readyMs=performance.now()-started;if(!this.busy){clearTimeout(this.timer);this.idle();}resolve();}
            else if(this.pending){const pending=this.pending;this.pending=undefined;if(message.ok===true)pending.resolve(message.info);else pending.reject(new AppError(502,message.code==='TRACK_UNAVAILABLE'?'TRACK_UNAVAILABLE':'RESOLVER_FAILED',message.code==='TRACK_UNAVAILABLE'?'Questo contenuto non è disponibile.':'Il servizio musicale non risponde. Controlla la connessione o aggiorna i resolver.'));}
          }catch{this.stop();}
        }
      });
    });
    // Drain diagnostics without logging provider data.
    this.child.stderr.on('data',()=>{});this.child.stdin.on('error',()=>this.stop());this.child.on('error',()=>this.stop());this.child.on('close',()=>this.stop());
    this.timer=setTimeout(()=>this.stop(new AppError(504,'RESOLVER_TIMEOUT','Il servizio musicale impiega troppo tempo a rispondere. Riprova.')),config.timeoutMs);this.timer.unref();
    void this.readyPromise.catch(()=>{});
  }
  get available(){return !this.dead&&!this.busy;}
  get alive(){return !this.dead;}
  get pid(){return this.dead?undefined:this.interpreterPid??this.child.pid;}
  ready(){return this.readyPromise;}
  private idle(){clearTimeout(this.timer);if(!this.busy&&!this.dead){this.timer=setTimeout(()=>this.stop(),120000);this.timer.unref();}}
  async run(videoId:string,signal:AbortSignal){
    this.busy=true;const abort=()=>this.stop(new AppError(409,'PLAYBACK_CANCELLED','Preparazione annullata.'));
    signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
    // One budget covers both cold startup and resolution.
    clearTimeout(this.timer);this.timer=setTimeout(()=>this.stop(new AppError(504,'RESOLVER_TIMEOUT','Il servizio musicale impiega troppo tempo a rispondere. Riprova.')),this.config.timeoutMs);this.timer.unref();
    try{await this.readyPromise;if(this.dead||signal.aborted)throw new AppError(409,'PLAYBACK_CANCELLED','Preparazione annullata.');return await new Promise<any>((resolve,reject)=>{this.pending={resolve,reject};this.child.stdin.write(JSON.stringify({videoId})+'\n');});}
    finally{signal.removeEventListener('abort',abort);if(this.dead)await this.closed;this.busy=false;this.idle();}
  }
  stop(error:unknown=new AppError(503,'RESOLVER_MISSING','Il resolver non è disponibile. Riprova.')){
    if(this.dead)return;this.dead=true;clearTimeout(this.timer);if(!this.readySettled){this.readySettled=true;this.rejectReady(error);}this.pending?.reject(error);this.pending=undefined;
    // Windows venv python.exe can be a launcher. Kill only this owned process tree,
    // including its interpreter/JS helper, rather than leaving detached children.
    if(process.platform==='win32'&&this.child.pid&&this.child.exitCode===null){const fallback=()=>{this.child.stdin.end();this.child.kill();};const killer=spawn('taskkill.exe',['/PID',String(this.child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore',shell:false});killer.on('error',fallback);killer.on('exit',code=>{if(code!==0)fallback();});}
    else this.child.kill();
  }
}
export class PlaybackWorkers{
  private workers:Worker[]=[];private closed=false;
  constructor(private config:Config){}
  private acquire(){if(this.closed)throw new AppError(409,'PLAYBACK_CANCELLED','Preparazione annullata.');this.workers=this.workers.filter(w=>!w.terminated);let worker=this.workers.find(w=>w.available);if(!worker){if(this.workers.length>=2)throw new AppError(429,'RESOLVER_BUSY','Il player sta preparando altri brani. Riprova tra poco.');worker=new Worker(this.config);this.workers.push(worker);}return worker;}
  async warm(){try{await (this.workers.find(w=>w.alive)??this.acquire()).ready();return true;}catch{return false;}}
  run(id:string,signal:AbortSignal){return this.acquire().run(id,signal);}
  diagnostics(){return this.workers.filter(w=>w.alive).map(w=>({pid:w.pid,busy:w.busy,readyMs:w.readyMs}));}
  async close(){this.closed=true;const workers=[...this.workers];for(const worker of workers)worker.stop();await Promise.all(workers.map(w=>w.closed));this.workers=[];}
}
