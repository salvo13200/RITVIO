import {spawn} from 'node:child_process';
import electron from 'electron';
const child=spawn(electron,['apps/desktop/main.cjs'],{stdio:'inherit',windowsHide:true,env:{...process.env,RITVIO_NODE_PATH:process.execPath,...(process.argv.includes('--smoke')?{RITVIO_SMOKE:'true'}:{})}});
process.on('SIGINT',()=>child.kill());
child.on('error',e=>{console.error(e.message);process.exitCode=1;});
child.on('exit',code=>process.exitCode=code??0);
