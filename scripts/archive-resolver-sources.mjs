import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..'),target=path.join(root,'.packaging/resolver-sources');await mkdir(target,{recursive:true});
const packages=(await readFile(path.join(root,'requirements-resolver.txt'),'utf8')).split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith('#'));
const entries=[];
for(const requirement of packages){
  const match=requirement.match(/^([\w-]+)(?:\[[\w,]+\])?==([\w.]+)$/);if(!match)throw Error(`Unpinned requirement: ${requirement}`);
  const [,name,version]=match;
  const metadata=await fetch(`https://pypi.org/pypi/${name}/${version}/json`,{signal:AbortSignal.timeout(30000)});if(!metadata.ok)throw Error(`Cannot resolve upstream source: ${name}`);
  const info=await metadata.json(),source=info.urls.find(file=>file.packagetype==='sdist');if(!source)throw Error(`No source distribution for ${name}@${version}`);
  const url=new URL(source.url);if(url.protocol!=='https:'||url.hostname!=='files.pythonhosted.org'||path.basename(source.filename)!==source.filename)throw Error('Invalid source URL');
  const response=await fetch(url,{signal:AbortSignal.timeout(120000)});if(!response.ok)throw Error(`Cannot download ${source.filename}`);
  const bytes=Buffer.from(await response.arrayBuffer()),sha256=createHash('sha256').update(bytes).digest('hex');if(sha256!==source.digests.sha256)throw Error(`Source checksum mismatch: ${name}`);
  await writeFile(path.join(target,source.filename),bytes);entries.push({name,version,filename:source.filename,url:url.href,sha256});
}
await writeFile(path.join(target,'SOURCES.json'),JSON.stringify({purpose:'Exact upstream resolver source distributions accompanying RITVIO release binaries. Original licences apply.',entries},null,2)+'\n');
const artifact=path.join(root,'release/RITVIO-resolver-sources.zip');await mkdir(path.dirname(artifact),{recursive:true});
const python=process.env.YOUTUBE_RESOLVER_PYTHON??path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const script='import pathlib,sys,zipfile,json\np=pathlib.Path(sys.argv[1]); m=json.loads((p/"SOURCES.json").read_text())\nwith zipfile.ZipFile(sys.argv[2],"w",zipfile.ZIP_DEFLATED) as z:\n for name in ["SOURCES.json"]+[e["filename"] for e in m["entries"]]: z.write(p/name,name)';
const result=spawnSync(python,['-c',script,target,artifact],{stdio:'inherit',windowsHide:true});if(result.error||result.status!==0)throw Error('Cannot archive upstream sources');
await writeFile(artifact+'.sha256',`${createHash('sha256').update(await readFile(artifact)).digest('hex')}  ${path.basename(artifact)}\n`);
console.log(JSON.stringify({artifact,packages:entries.length}));
