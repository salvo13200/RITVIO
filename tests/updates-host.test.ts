import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const require=createRequire(import.meta.url),{createUpdateAccess,officialWindowsUrl}=require('../apps/desktop/updates.cjs');
test('Windows host persists separately, uses a fixed endpoint and validates external actions',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'ritvio-updates-'));
  try{
    const opened:string[]=[],requests:any[]=[];
    const host=createUpdateAccess(directory,'0.7.5',{openExternal:async(url:string)=>{opened.push(url);},fetchImpl:async(...args:any[])=>{requests.push(args);return new Response('[]',{status:200,headers:{etag:'"r1"'}});}});
    assert.deepEqual(await host.read(),{version:'0.7.5',stored:null});await host.write('{"schema":1,"autoCheck":false}');
    assert.equal((await host.read()).stored,await readFile(path.join(directory,'updates-v1.json'),'utf8'));
    await host.fetch('"r0"');assert.equal(requests[0][0],'https://api.github.com/repos/salvo13200/RITVIO/releases?per_page=30');assert.equal(requests[0][1].headers['If-None-Match'],'"r0"');assert.equal(requests[0][1].redirect,'error');
    await assert.rejects(host.fetch('bad\r\nheader'));await assert.rejects(host.write('{"schema":2}'));
    const valid='https://github.com/salvo13200/RITVIO/releases/download/windows-v1.0.0/RITVIO-1.0.0-setup.exe';await host.open(valid);assert.deepEqual(opened,[valid]);
    for(const invalid of [valid+'?x=1',valid.replace('github.com','github.com.evil.test'),valid.replace('RITVIO-1.0.0-setup.exe','other.exe'),'file:///C:/app.exe',valid.replace('windows-v','android-v')]){assert.equal(officialWindowsUrl(invalid),false);await assert.rejects(host.open(invalid));}
  }finally{await rm(directory,{recursive:true,force:true});}
});
test('Windows host refuses oversized responses and does not follow rate-limit responses',async()=>{
  const host=createUpdateAccess('unused','0.7.5',{fetchImpl:async()=>new Response('x'.repeat(2_000_001))});await assert.rejects(host.fetch());
  const limited=createUpdateAccess('unused','0.7.5',{now:()=>1000,fetchImpl:async()=>new Response('ignored',{status:429,headers:{'retry-after':'60'}})});
  assert.deepEqual(await limited.fetch(),{status:429,body:'',etag:undefined,retryAt:61_000});
});
