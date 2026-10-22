export interface ProcessCounters {
  pid:number; startedAt:string; privateBytes:number; workingSetBytes:number;
  cpuMs:number; handles:number; threads:number; kind?:string;
}
export interface ProcessSnapshot {
  rootPid:number; rootStartedAt:string; enumeratedCount:number; processes:ProcessCounters[];
}
export function readWindowsProcessTree(rootPid:number,options?:{
  execute?:(file:string,args:string[],options:{windowsHide:boolean;timeout:number;maxBuffer:number})=>Promise<{stdout:string}>;
}):Promise<ProcessSnapshot>;
export function validateProcessSnapshot(snapshot:ProcessSnapshot,rootPid:number,expectedStart?:string):ProcessSnapshot;
export function cpuCorePercent(previous:{elapsedMs:number;processes:ProcessCounters[]},current:{elapsedMs:number;processes:ProcessCounters[]}):number;
export function createNativeResourceProbe(options:{
  cdp:{send(method:string):Promise<any>}; browserCdp?:{send(method:string):Promise<any>}; rootPid:number; readTree?:(pid:number)=>Promise<ProcessSnapshot>;
}):{
  sample(phase:string,options?:{collectGarbage?:boolean}):Promise<{
    phase:string; elapsedMs:number; probeDurationMs:number; forcedGarbageCollection:boolean;
    rootPid:number; rootStartedAt:string; processRolesAvailable:boolean;
    processCount:number; enumeratedCount:number; privateBytes:number; workingSetBytes:number;
    handles:number; threads:number; processes:ProcessCounters[];
    renderer:{heapUsedBytes:number; heapTotalBytes:number; documents:number; nodes:number; jsEventListeners:number};
    cpuCorePercent?:number;
  }>;
  report():{scope:string;samples:unknown[];summary:{sampleCount:number;[key:string]:unknown}};
};
