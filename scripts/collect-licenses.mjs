import {createRequire} from 'node:module';
import {mkdir,readFile,readdir,writeFile,cp,realpath} from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
const output=path.join(root,'third-party');await mkdir(output,{recursive:true});
const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const visited=new Set(),javascript=[];
async function collect(name,base){
  let location;
  try{location=await realpath(path.join(base,'node_modules',name));}
  catch{try{const require=createRequire(path.join(base,'package.json'));location=await realpath(path.dirname(require.resolve(`${name}/package.json`)));}catch{return;}}
  if(visited.has(location))return;visited.add(location);
  const meta=JSON.parse(await readFile(path.join(location,'package.json'),'utf8'));
  const id=`${meta.name.replaceAll('/','__')}@${meta.version}`;
  const texts=(await readdir(location)).filter(file=>/^(license|licence|copying|notice)(\.|$|-)/i.test(file));
  const target=path.join(output,'javascript',id);await mkdir(target,{recursive:true});
  for(const text of texts)await cp(path.join(location,text),path.join(target,text),{recursive:true});
  if(meta.name==='abstract-logging'&&!texts.length){
    // Upstream 2.0.1 links its author's MIT notice instead of shipping LICENSE.
    await cp(path.join(output,'overrides/abstract-logging-MIT.html'),path.join(target,'MIT.html'));
    texts.push('MIT.html');
  }
  javascript.push({name:meta.name,version:meta.version,license:meta.license??'UNKNOWN',repository:typeof meta.repository==='string'?meta.repository:meta.repository?.url,notices:texts.map(file=>`javascript/${id}/${file}`)});
  for(const dep of Object.keys({...meta.dependencies,...meta.optionalDependencies}))await collect(dep,location);
}
for(const name of Object.keys(pkg.dependencies))await collect(name,root);
const missing=Object.keys(pkg.dependencies).filter(name=>!javascript.some(item=>item.name===name));if(missing.length)throw Error(`Missing installed runtime packages: ${missing.join(', ')}`);
javascript.sort((a,b)=>`${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`,'en'));
await cp(path.join(root,'apps/mobile/android/app/src/main/assets/licenses'),path.join(output,'android'),{recursive:true});
await cp(path.join(root,'apps/client/public/fonts/OFL-AncizarSans.txt'),path.join(output,'AncizarSans-OFL.txt'));
const python=process.env.YOUTUBE_RESOLVER_PYTHON??path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const script=`import importlib.metadata as m,json,pathlib,shutil,sys
out=pathlib.Path(sys.argv[1]); records=[]
for d in m.distributions():
 name=d.metadata['Name']
 if name.lower() in ('pip','setuptools','wheel'): continue
 notices=[]
 for f in d.files or []:
  parts=pathlib.PurePosixPath(str(f)).parts
  if any(x.endswith('.dist-info') for x in parts) and (any(x.lower()=='licenses' for x in parts) or parts[-1].lower().startswith(('license','licence','copying','notice'))):
   target=out/'python'/str(f); target.parent.mkdir(parents=True,exist_ok=True); shutil.copyfile(d.locate_file(f),target); notices.append('python/'+str(f))
 records.append(dict(name=name,version=d.version,license=d.metadata.get('License-Expression') or d.metadata.get('License') or 'UNKNOWN',notices=notices))
print(json.dumps(sorted(records,key=lambda x:x['name'].lower())))`;
const result=spawnSync(python,['-c',script,output],{encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});
if(result.error||result.status!==0)throw Error(result.error?.message??result.stderr);
const pythonPackages=JSON.parse(result.stdout);
await writeFile(path.join(output,'inventory.json'),JSON.stringify({scope:'Installed production JavaScript dependency closure and resolver Python environment. Android native components are described in android/THIRD-PARTY-NOTICES.txt; this is not an exhaustive native binary SBOM.',javascript,python:pythonPackages},null,2)+'\n');
const incomplete=[...javascript,...pythonPackages].filter(item=>item.license==='UNKNOWN'||!item.notices.length);
console.log(JSON.stringify({javascript:javascript.length,python:pythonPackages.length,needsReview:incomplete.map(item=>({name:item.name,license:item.license,notices:item.notices.length}))}));
if(incomplete.length)process.exitCode=1;
