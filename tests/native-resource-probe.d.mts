export interface ProcessCounters {
  pid:number; startedAt:string; privateBytes:number; workingSetBytes:number;
  cpuMs:number; handles:number; threads:number;
}
export interface ProcessSnapshot {
  rootPid:number; rootStartedAt:string; enumeratedCount:number; processes:ProcessCounters[];
}
export function readWindowsProcessTree(rootPid:number):Promise<ProcessSnapshot>;
export function validateProcessSnapshot(snapshot:ProcessSnapshot,rootPid:number,expectedStart?:string):ProcessSnapshot;
export function cpuCorePercent(previous:{elapsedMs:number;processes:ProcessCounters[]},current:{elapsedMs:number;processes:ProcessCounters[]}):number;
export function createNativeResourceProbe(options:{
  cdp:{send(method:string):Promise<any>}; rootPid:number; readTree?:(pid:number)=>Promise<ProcessSnapshot>;
}):{
  sample(phase:string,options?:{collectGarbage?:boolean}):Promise<{
    phase:string; elapsedMs:number; probeDurationMs:number; forcedGarbageCollection:boolean;
    processCount:number; enumeratedCount:number; privateBytes:number; workingSetBytes:number;
    handles:number; threads:number; processes:ProcessCounters[];
    renderer:{heapUsedBytes:number; heapTotalBytes:number; documents:number; nodes:number; jsEventListeners:number};
    cpuCorePercent?:number;
  }>;
  report():{scope:string;samples:unknown[];summary:{sampleCount:number;[key:string]:unknown}};
};
