import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,rmdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';
import {Resolver} from '../apps/api/resolver';
import {createApi} from '../apps/api/server';
import {testConfig} from './fixtures';
const python=path.resolve('.venv/Scripts/python.exe');
async function setup(){
 const directory=await mkdtemp(path.join(tmpdir(),'ritvio-shutdown-'));
 const config=testConfig({root:directory,database:path.join(directory,'shutdown.sqlite'),python:existsSync(python)?python:'python',catalogScript:path.resolve('tests/resolver-shutdown-fixture.py'),timeoutMs:60000});
 const marker=path.join(directory,'resolver-started.json');
 async function started(){const until=Date.now()+5000;while(Date.now()<until){try{return JSON.parse(await readFile(marker,'utf8')).pid as number;}catch{await new Promise(resolve=>setTimeout(resolve,25));}}throw Error('Fixture resolver did not start');}
 async function cleanup(){for(const file of [marker,config.database,config.database+'-wal',config.database+'-shm'])await rm(file,{force:true});await rmdir(directory);}
 return {config,started,cleanup};
}
async function gone(pid:number){const until=Date.now()+5000;while(Date.now()<until){try{process.kill(pid,0);}catch{return;}await new Promise(resolve=>setTimeout(resolve,25));}assert.fail('Owned resolver interpreter survived shutdown');}

test('resolver shutdown cancels a held catalogue process without waiting for its network timeout',async()=>{
 const fixture=await setup(),resolver=new Resolver(fixture.config);
 try{
  const work=resolver.homeIndex();const rejected=assert.rejects(work,error=>(error as {code:string}).code==='IMPORT_CANCELLED');
  const pid=await fixture.started(),start=performance.now();await resolver.close();await rejected;
  assert(performance.now()-start<3000,'Shutdown must not wait for the 60-second provider timeout');await gone(pid);
  await assert.rejects(resolver.homeIndex(),error=>(error as {code:string}).code==='IMPORT_CANCELLED');
 }finally{await resolver.close();await fixture.cleanup();}
});

test('API shutdown aborts catalogue work before Home waits for it, without persisting a fake provider failure',async()=>{
 const fixture=await setup(),resolver=new Resolver(fixture.config),{app,store}=await createApi({config:fixture.config,resolver});
 try{
  const response=app.inject({url:'/v1/home',headers:{authorization:'Bearer test-token-only'}});const pid=await fixture.started();
  const start=performance.now();let completed=false;
  const closing=app.close().then(()=>{completed=true;});
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{await Promise.race([closing,new Promise(resolve=>{timer=setTimeout(resolve,3000);})]);}finally{clearTimeout(timer);}
  // Release the fixture on a regression so the assertion cannot leave a test process behind.
  if(!completed)await resolver.close();await closing;await response;await gone(pid);
  assert(completed&&performance.now()-start<3000,'Catalogue hooks must not block resolver cancellation');
  const database=new DatabaseSync(fixture.config.database);
  try{assert.equal((database.prepare('SELECT COUNT(*) AS count FROM home_cache WHERE failures>0 OR error IS NOT NULL').get() as {count:number}).count,0);}finally{database.close();}
 }finally{await resolver.close();await app.close();await fixture.cleanup();}
});
