import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {cpuCorePercent,createNativeResourceProbe,readWindowsProcessTree,validateProcessSnapshot,type ProcessCounters} from './native-resource-probe.mjs';

const processCounters=(pid:number,startedAt:string,cpuMs=0):ProcessCounters=>({pid,startedAt,cpuMs,privateBytes:100,workingSetBytes:150,handles:10,threads:2});
const snapshot=()=>({rootPid:11,rootStartedAt:'100',enumeratedCount:2,processes:[processCounters(11,'100'),processCounters(12,'101')]});

test('resource samples reject a reused root, missing root, duplicate PIDs and invalid counters',()=>{
  assert.throws(()=>validateProcessSnapshot(snapshot(),11,'different'),/reused/);
  assert.throws(()=>validateProcessSnapshot({...snapshot(),processes:[processCounters(12,'101')]},11),/missing/);
  assert.throws(()=>validateProcessSnapshot({...snapshot(),processes:[processCounters(11,'100'),processCounters(11,'100')]},11),/Duplicate/);
  assert.throws(()=>validateProcessSnapshot({...snapshot(),processes:[{...processCounters(11,'100'),privateBytes:NaN}]},11),/Invalid/);
});

test('CPU intervals exclude recycled or new processes and retain core-equivalent units',()=>{
  const previous={elapsedMs:0,processes:[processCounters(11,'100',100),processCounters(12,'101',20)]};
  const current={elapsedMs:1000,processes:[processCounters(11,'100',1600),processCounters(12,'new',9000),processCounters(13,'new',10000)]};
  assert.equal(cpuCorePercent(previous,current),150);
  assert.throws(()=>cpuCorePercent(current,current),/advance/);
});

test('periodic sampling does not force GC, combines only the supplied process tree, and keeps endpoint observations',async()=>{
  const sent:string[]=[];
  const cdp={async send(method:string){sent.push(method);return method==='Performance.getMetrics'?{metrics:[{name:'JSHeapUsedSize',value:200},{name:'JSHeapTotalSize',value:500}]}:{documents:1,nodes:30,jsEventListeners:7};}};
  const probe=createNativeResourceProbe({cdp,rootPid:11,readTree:async()=>snapshot()});
  const first=await probe.sample('baseline',{collectGarbage:true});
  assert.equal(first.privateBytes,200);assert.equal(first.workingSetBytes,300);assert.equal(first.processCount,2);
  assert.equal(first.renderer.heapUsedBytes,200);assert.equal(first.renderer.jsEventListeners,7);
  await probe.sample('periodic');
  assert.equal(sent.filter(method=>method==='HeapProfiler.collectGarbage').length,1);
  assert.equal(probe.report().summary.sampleCount,2);
  assert.deepEqual(probe.report().summary.privateBytes,{first:200,last:200,min:200,max:200,change:0});
});

test('incomplete renderer metrics fail instead of reporting misleading zero memory',async()=>{
  const probe=createNativeResourceProbe({rootPid:11,readTree:async()=>snapshot(),cdp:{async send(method:string){return method==='Performance.getMetrics'?{metrics:[]}:{documents:1,nodes:2,jsEventListeners:3};}}});
  await assert.rejects(probe.sample('baseline'),/Missing renderer metric/);
  assert.equal(probe.report().summary.sampleCount,0);
});

test('Windows sampling includes an owned descendant and excludes a live sibling process',{skip:process.platform!=='win32',timeout:20000},async()=>{
  const code=`const {spawn}=require('node:child_process');const c=spawn(process.execPath,['-e','setTimeout(()=>{},30000)'],{stdio:'ignore',windowsHide:true});process.send({descendant:c.pid});process.on('message',()=>{c.once('exit',()=>process.exit());c.kill();});process.on('disconnect',()=>{c.kill();process.exit();});`;
  const root=spawn(process.execPath,['-e',code],{stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});
  const sibling=spawn(process.execPath,['-e','setTimeout(()=>{},30000)'],{stdio:'ignore',windowsHide:true});
  try{
    const [message]=await once(root,'message') as [{descendant:number}];
    const result=await readWindowsProcessTree(root.pid!);
    validateProcessSnapshot(result,root.pid!);
    assert(result.processes.some(p=>p.pid===message.descendant));
    assert(!result.processes.some(p=>p.pid===sibling.pid||p.pid===process.pid));
    assert(result.processes.every(p=>p.privateBytes>0&&p.workingSetBytes>0));
  }finally{
    const rootExited=once(root,'exit'),siblingExited=once(sibling,'exit');
    if(root.connected)root.send('stop');else root.kill();
    sibling.kill();
    await Promise.all([rootExited,siblingExited]);
  }
});
