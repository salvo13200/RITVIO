import {AppError} from './errors';
export type PreparationOptions={priority?:'foreground'|'prefetch';signal?:AbortSignal};
type Consumer<T>={priority:'foreground'|'prefetch';resolve:(value:T)=>void;reject:(error:unknown)=>void;clean:()=>void};
type Job<T>={id:string;fresh:boolean;controller:AbortController;consumers:Set<Consumer<T>>;started:boolean;created:number};
const cancelled=()=>new AppError(409,'PLAYBACK_CANCELLED','Preparazione annullata.');
/** Two bounded slots, shared work and foreground priority. Cache never touches disk. */
export class PlaybackPreparation<T>{
  private cache=new Map<string,T>();private jobs=new Map<string,Job<T>>();private active=0;private closed=false;
  private samples:{durationMs:number;waitMs:number;priority:string;outcome:string}[]=[];private hits=0;
  constructor(private load:(id:string,fresh:boolean,signal:AbortSignal)=>Promise<T>,private valid:(value:T)=>boolean){}
  resolve(id:string,fresh=false,options:PreparationOptions={}):Promise<T>{
    if(this.closed||options.signal?.aborted)return Promise.reject(cancelled());
    const priority=options.priority??'foreground',cached=this.cache.get(id);
    if(!fresh&&cached&&this.valid(cached)){this.cache.delete(id);this.cache.set(id,cached);this.hits++;return Promise.resolve(cached);}
    if(cached)this.cache.delete(id);
    let job=this.jobs.get(id);
    if(job?.controller.signal.aborted){this.jobs.delete(id);job=undefined;}
    if(!job){
      if(priority==='prefetch'&&[...this.jobs.values()].some(j=>!j.controller.signal.aborted))return Promise.reject(new AppError(429,'RESOLVER_BUSY','Preparazione in attesa.'));
      if(this.jobs.size>=8)return Promise.reject(new AppError(429,'RESOLVER_BUSY','Il player sta preparando altri brani. Riprova tra poco.'));
      job={id,fresh,controller:new AbortController(),consumers:new Set(),started:false,created:performance.now()};this.jobs.set(id,job);
    }
    const selected=job;
    const promise=new Promise<T>((resolve,reject)=>{
      const consumer:Consumer<T>={priority,resolve,reject,clean:()=>options.signal?.removeEventListener('abort',abort)};
      const abort=()=>{consumer.clean();selected.consumers.delete(consumer);reject(cancelled());if(!selected.consumers.size){selected.controller.abort();if(!selected.started&&this.jobs.get(id)===selected)this.jobs.delete(id);}};
      selected.consumers.add(consumer);options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();
    });
    if(priority==='foreground')for(const other of this.jobs.values())if(other!==selected&&![...other.consumers].some(c=>c.priority==='foreground'))this.cancel(other);
    this.pump();return promise;
  }
  private cancel(job:Job<T>){job.controller.abort();for(const c of job.consumers){c.clean();c.reject(cancelled());}job.consumers.clear();if(!job.started&&this.jobs.get(job.id)===job)this.jobs.delete(job.id);}
  private pump(){
    if(this.closed)return;
    const pending=[...this.jobs.values()].filter(j=>!j.started&&!j.controller.signal.aborted&&j.consumers.size).sort((a,b)=>Number([...b.consumers].some(c=>c.priority==='foreground'))-Number([...a.consumers].some(c=>c.priority==='foreground'))||a.created-b.created);
    for(const job of pending){
      if(this.active>=2)break;job.started=true;this.active++;const started=performance.now();
      void Promise.resolve().then(()=>this.load(job.id,job.fresh,job.controller.signal)).then(value=>{
        if(job.controller.signal.aborted)return;
        if(this.jobs.get(job.id)===job)this.jobs.delete(job.id);
        this.cache.delete(job.id);this.cache.set(job.id,value);while(this.cache.size>30)this.cache.delete(this.cache.keys().next().value!);
        for(const c of job.consumers){c.clean();c.resolve(value);}this.record(job,started,'ready');
      },error=>{if(this.jobs.get(job.id)===job)this.jobs.delete(job.id);for(const c of job.consumers){c.clean();c.reject(error);}this.record(job,started,job.controller.signal.aborted?'cancelled':'failed');}).finally(()=>{
        job.consumers.clear();this.active--;if(this.jobs.get(job.id)===job)this.jobs.delete(job.id);this.pump();
      });
    }
  }
  private record(job:Job<T>,started:number,outcome:string){this.samples.push({durationMs:performance.now()-started,waitMs:started-job.created,priority:[...job.consumers].some(c=>c.priority==='foreground')?'foreground':'prefetch',outcome});this.samples=this.samples.slice(-100);}
  diagnostics(){return {cacheHits:this.hits,cached:this.cache.size,active:this.active,pending:[...this.jobs.values()].filter(j=>!j.started).length,samples:[...this.samples]};}
  close(){this.closed=true;for(const job of this.jobs.values())this.cancel(job);this.jobs.clear();this.cache.clear();}
}
