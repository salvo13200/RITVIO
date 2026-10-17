import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {existsSync} from 'node:fs';
import {PlaybackWorkers} from '../apps/api/playback-worker';
import {testConfig} from './fixtures';
const python=path.resolve('.venv/Scripts/python.exe');
const config=testConfig({python:existsSync(python)?python:'python',playbackScript:path.resolve('tests/playback-worker-fixture.py'),timeoutMs:2000});
test('worker reuse, abort replacement and provider crash are bounded and shutdown terminates owned workers',async()=>{
  const pool=new PlaybackWorkers(config);
  try{
    assert.equal(await pool.warm(),true);const pid=pool.diagnostics()[0].pid;
    assert.equal((await pool.run('testmusic01',new AbortController().signal)).id,'testmusic01');assert.equal(pool.diagnostics()[0].pid,pid);
    const abort=new AbortController(),slow=pool.run('slow0000001',abort.signal);const cancelled=assert.rejects(slow,e=>(e as {code:string}).code==='PLAYBACK_CANCELLED');abort.abort();await cancelled;
    assert.equal((await pool.run('testmusic02',new AbortController().signal)).id,'testmusic02');assert.notEqual(pool.diagnostics()[0].pid,pid);
    await assert.rejects(pool.run('break000001',new AbortController().signal));assert.equal((await pool.run('testmusic01',new AbortController().signal)).id,'testmusic01');
    const pids=pool.diagnostics().map(w=>w.pid);pool.close();assert.deepEqual(pool.diagnostics(),[]);
    const deadline=Date.now()+5000;
    for(const pid of pids){let alive=true;while(alive&&Date.now()<deadline){try{process.kill(pid!,0);await new Promise(resolve=>setTimeout(resolve,20));}catch{alive=false;}}assert.equal(alive,false,'Owned interpreter must terminate');}
  }finally{await pool.close();}
});
test('timeout releases the slot and a subsequent request gets a fresh worker',async()=>{
  const workerConfig={...config,timeoutMs:5000},pool=new PlaybackWorkers(workerConfig);
  try{assert.equal(await pool.warm(),true);workerConfig.timeoutMs=500;await assert.rejects(pool.run('slow0000001',new AbortController().signal),e=>(e as {code:string}).code==='RESOLVER_TIMEOUT');workerConfig.timeoutMs=5000;assert.equal((await pool.run('testmusic01',new AbortController().signal)).id,'testmusic01');}
  finally{await pool.close();}
});
