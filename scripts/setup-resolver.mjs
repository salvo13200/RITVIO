import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config({quiet:true});
const python=process.env.YOUTUBE_RESOLVER_PYTHON || path.resolve('.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
function run(command,args){const result=spawnSync(command,args,{stdio:'inherit',shell:false,windowsHide:true});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);}
if(!existsSync(python))run(process.platform==='win32'?'python':'python3',['-m','venv','.venv']);
run(python,['-m','pip','install','-r','requirements-resolver.txt']);
run(python,['-m','yt_dlp','--version']);
