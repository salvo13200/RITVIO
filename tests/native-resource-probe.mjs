import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import path from 'node:path';
import {promisify} from 'node:util';

const exec=promisify(execFile);

// Query only numeric process relationships and resource counters. No command
// lines, titles, environment variables or paths enter the resulting report.
export async function readWindowsProcessTree(rootPid){
  assert.equal(process.platform,'win32','Native process sampling requires Windows');
  assert(Number.isSafeInteger(rootPid)&&rootPid>0,'Invalid native root PID');
  const script=`
$ErrorActionPreference='Stop'
$rows=@(Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,CreationDate)
$root=$rows | Where-Object { $_.ProcessId -eq ${rootPid} } | Select-Object -First 1
if(!$root){throw 'The native test root has exited'}
$owned=@{}; $owned[[int]$root.ProcessId]=$root
do {
  $added=$false
  foreach($row in $rows){
    $parent=$owned[[int]$row.ParentProcessId]
    if(!$owned.ContainsKey([int]$row.ProcessId) -and $parent -and $row.CreationDate -ge $parent.CreationDate){
      $owned[[int]$row.ProcessId]=$row; $added=$true
    }
  }
} while($added)
$counters=@(foreach($row in $owned.Values){
  try {
    $p=Get-Process -Id $row.ProcessId -ErrorAction Stop
    # A PID can be reused between CIM enumeration and Get-Process. Require
    # the creation times to identify the same process before using its data.
    if([Math]::Abs(($p.StartTime.ToUniversalTime()-$row.CreationDate.ToUniversalTime()).TotalMilliseconds) -gt 1){continue}
    [pscustomobject]@{
      pid=[int]$row.ProcessId; startedAt=$row.CreationDate.ToUniversalTime().Ticks.ToString()
      privateBytes=[double]$p.PrivateMemorySize64; workingSetBytes=[double]$p.WorkingSet64
      cpuMs=$p.TotalProcessorTime.TotalMilliseconds; handles=$p.HandleCount; threads=$p.Threads.Count
    }
  } catch { if($row.ProcessId -eq ${rootPid}){throw} }
})
[pscustomobject]@{
  rootPid=${rootPid}; rootStartedAt=$root.CreationDate.ToUniversalTime().Ticks.ToString()
  enumeratedCount=$owned.Count; processes=$counters
} | ConvertTo-Json -Depth 4 -Compress
`;
  const executable=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
  const {stdout}=await exec(executable,['-NoLogo','-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:10000,maxBuffer:1024*1024});
  return JSON.parse(stdout.replace(/^\uFEFF/,''));
}

export function validateProcessSnapshot(snapshot,rootPid,expectedStart){
  assert.equal(snapshot.rootPid,rootPid);
  assert.equal(typeof snapshot.rootStartedAt,'string');
  if(expectedStart!==undefined)assert.equal(snapshot.rootStartedAt,expectedStart,'Native root PID was reused');
  assert(Array.isArray(snapshot.processes)&&snapshot.processes.length>0);
  const ids=new Set();
  for(const p of snapshot.processes){
    assert(Number.isSafeInteger(p.pid)&&p.pid>0&&!ids.has(p.pid),'Duplicate or invalid process PID');ids.add(p.pid);
    assert.equal(typeof p.startedAt,'string');
    for(const key of ['privateBytes','workingSetBytes','cpuMs','handles','threads'])assert(Number.isFinite(p[key])&&p[key]>=0,`Invalid process counter: ${key}`);
  }
  assert(snapshot.processes.some(p=>p.pid===rootPid&&p.startedAt===snapshot.rootStartedAt),'Root resource counters are missing');
  return snapshot;
}

export function cpuCorePercent(previous,current){
  const elapsed=current.elapsedMs-previous.elapsedMs;
  assert(elapsed>0,'Process samples must advance in time');
  const old=new Map(previous.processes.map(p=>[`${p.pid}:${p.startedAt}`,p.cpuMs]));
  // Only comparable process lifetimes count. A newly created/reused PID is
  // not attributed CPU accumulated before the preceding observation.
  const delta=current.processes.reduce((sum,p)=>{
    const before=old.get(`${p.pid}:${p.startedAt}`);
    return sum+(before!==undefined?Math.max(0,p.cpuMs-before):0);
  },0);
  return delta/elapsed*100;
}

export function createNativeResourceProbe({cdp,rootPid,readTree=readWindowsProcessTree}){
  assert(Number.isSafeInteger(rootPid)&&rootPid>0);
  const samples=[],started=performance.now();let rootStartedAt;
  return {
    async sample(phase,{collectGarbage=false}={}){
      const began=performance.now();
      if(collectGarbage)await cdp.send('HeapProfiler.collectGarbage');
      const [raw,dom,performanceMetrics]=await Promise.all([readTree(rootPid),cdp.send('Memory.getDOMCounters'),cdp.send('Performance.getMetrics')]);
      validateProcessSnapshot(raw,rootPid,rootStartedAt);rootStartedAt=raw.rootStartedAt;
      const metrics=Object.fromEntries(performanceMetrics.metrics.map(m=>[m.name,m.value]));
      for(const key of ['JSHeapUsedSize','JSHeapTotalSize'])assert(Number.isFinite(metrics[key])&&metrics[key]>=0,`Missing renderer metric: ${key}`);
      for(const key of ['documents','nodes','jsEventListeners'])assert(Number.isFinite(dom[key])&&dom[key]>=0,`Missing DOM counter: ${key}`);
      const total=key=>raw.processes.reduce((sum,p)=>sum+p[key],0);
      const sample={phase,elapsedMs:performance.now()-started,probeDurationMs:performance.now()-began,forcedGarbageCollection:collectGarbage,
        processCount:raw.processes.length,enumeratedCount:raw.enumeratedCount,privateBytes:total('privateBytes'),workingSetBytes:total('workingSetBytes'),handles:total('handles'),threads:total('threads'),processes:raw.processes,
        renderer:{heapUsedBytes:metrics.JSHeapUsedSize,heapTotalBytes:metrics.JSHeapTotalSize,...dom}};
      if(samples.length)sample.cpuCorePercent=cpuCorePercent(samples.at(-1),sample);
      samples.push(sample);return sample;
    },
    report(){
      const span=read=>{const values=samples.map(read);return values.length?{first:values[0],last:values.at(-1),min:Math.min(...values),max:Math.max(...values),change:values.at(-1)-values[0]}:null;};
      return {scope:'Sampled descendants of the isolated native test root, including Electron and observed resolver children; excludes the test harness and unrelated apps. Sum of private bytes is committed private memory; summed working sets can double-count shared pages. CPU percent is core-equivalent over matching observed process lifetimes, may exceed 100, and omits children born/exited between samples. Renderer heap/DOM are separate from native media/GPU memory. Endpoint GC is explicit and is not performed during periodic samples. These observations alone cannot prove absence of memory leaks.',
        samples,summary:{sampleCount:samples.length,privateBytes:span(s=>s.privateBytes),workingSetBytes:span(s=>s.workingSetBytes),processCount:span(s=>s.processCount),handles:span(s=>s.handles),rendererHeapUsedBytes:span(s=>s.renderer.heapUsedBytes),nodes:span(s=>s.renderer.nodes),eventListeners:span(s=>s.renderer.jsEventListeners)}};
    },
  };
}
