import {networkInterfaces} from 'node:os';
import path from 'node:path';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {Resolver} from '../../api/resolver';
import {loadConfig} from '../../api/config';
import {PlaybackWorkers} from '../../api/playback-worker';
import {PlaybackPreparation} from '../../api/playback-preparation';
import {createPCTestService,privateAddress} from './service';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const config=loadConfig(root);for(let parent=root;parent!==path.dirname(parent);parent=path.dirname(parent)){
 const python=path.join(parent,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');if(existsSync(python)){config.python=python;break;}
}
config.playbackScript=path.join(root,'scripts/ios12-playback-worker.py');config.timeoutMs=60000;
const catalog=new Resolver(config),workers=new PlaybackWorkers(config);
const streams=new PlaybackPreparation((id,_fresh,signal)=>workers.run(id,signal),info=>Number(new URL(info.url).searchParams.get('expire'))*1000>Date.now()+60000);
const addresses=[...new Set(Object.values(networkInterfaces()).flatMap(list=>list??[]).filter(x=>x.family==='IPv4'&&!x.internal&&privateAddress(x.address)).map(x=>x.address))];
const port=Number(process.env.RITVIO_PC_TEST_PORT??59212);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid PC test port');
const {app}=await createPCTestService({search:q=>catalog.search(q),resolve:(id,fresh,signal)=>streams.resolve(id,fresh,{signal}),close:async()=>{streams.close();await Promise.all([catalog.close(),workers.close()]);}},{hosts:['127.0.0.1',...addresses]});
await app.listen({port,host:'0.0.0.0'});
console.log(`RITVIO PC test ready. Open http://127.0.0.1:${port}/setup on this PC. No personal library is exposed.`);
process.once('SIGINT',()=>void app.close());process.once('SIGTERM',()=>void app.close());
