import {readdir,readFile,mkdir,copyFile,writeFile,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {imageMetadataIssue} from './check-assets.mjs';
import showcase from './showcase-files.json' with {type:'json'};

const publicDocs=new Set(['BUILDING.md','PUBLISHING.md','RELEASE_NOTES.md','RELEASE_CHECKLIST.md','API.md','openapi.json','ARCHITECTURE.md','TESTING.md','README.md','FEATURES.md','SCREENSHOTS.md']);
const publicMedia=new Set(['README.md','manifest.json','logo.svg','banner.webp',...showcase.views.map(view=>`${view.name}.webp`)]);
const rootFiles=new Set(['LICENSE','README.md','README.en.md','README.it.md','CONTRIBUTING.md','SECURITY.md','PRIVACY.md','THIRD_PARTY_NOTICES.md','.gitignore','.gitattributes','.env.example','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','requirements-resolver.txt','tsconfig.json','vite.config.ts']);
export function isPublicSource(file){
  const name=file.replaceAll('\\','/'),parts=name.split('/');
  if(parts.some(p=>['..','.git','.local','.packaging','.agents','.impeccable','.venv','node_modules','data','release','dist','web-dist','build','.gradle','.idea','__pycache__','test-results','playwright-report','capacitor-cordova-android-plugins'].includes(p)))return false;
  if(/\.(jks|keystore|apk|aab|exe|sqlite(?:-shm|-wal)?|log|pyc|hprof)$/i.test(name)||parts.includes('local.properties')||parts.includes('credentials.json'))return false;
  if(parts.length===1)return rootFiles.has(name)||/^playwright\.[\w.-]+\.ts$/.test(name);
  if(parts[0]==='docs')return (parts.length===2&&publicDocs.has(parts[1]))||(parts.length===3&&parts[1]==='media'&&publicMedia.has(parts[2]));
  if(!['apps','packages','scripts','tests','build-resources','third-party','.github'].includes(parts[0]))return false;
  if(name==='apps/mobile/ANDROID-0-BRIEF.md'||/\/com\/getcapacitor\/myapp\/Example\w+Test\.java$/.test(name))return false;
  if(/\/(DESIGN|PRODUCT)\.md$/.test(name))return false;
  if(/^apps\/mobile\/android\/app\/src\/main\/python\/(music_catalog|home_catalog|playlist_catalog)\.py$/.test(name))return false;
  if(/^apps\/mobile\/android\/app\/src\/main\/assets\/(public\/|capacitor\.)/.test(name)||name==='apps/mobile/android/app/src/main/res/xml/config.xml')return false;
  if(name.startsWith('apps/mobile/android/app/src/main/assets/ritvio-licenses/'))return false;
  if(name.startsWith('apps/client/assets/')||name==='apps/client/src/design-review.tsx'||name==='apps/client/design-review.html'||name==='scripts/build-design-review.mjs')return false;
  return true;
}
export async function publicFiles(root){
  const files=[];
  async function walk(directory){
    for(const item of await readdir(path.join(root,directory),{withFileTypes:true})){
      const relative=[directory,item.name].filter(Boolean).join('/');
      if(item.isDirectory()){
        if(isPublicSource(`${relative}/probe`)||relative==='docs'||relative==='docs/media')await walk(relative);
      }else if(isPublicSource(relative)){
        if(item.isSymbolicLink()||(await lstat(path.join(root,relative))).isSymbolicLink())throw Error(`Symlink not allowed in public source: ${relative}`);
        files.push(relative);
      }
    }
  }
  await walk('');return files.sort();
}
export async function scanPublicSource(root,files){
  const findings=[];
  const patterns=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/\bgh[pousr]_[A-Za-z0-9]{30,}\b/,/\bgithub_pat_[A-Za-z0-9_]{30,}\b/,/\bAIza[A-Za-z0-9_-]{35}\b/,/\bAKIA[A-Z0-9]{16}\b/,/[A-Z]:[\\/]Users[\\/]salvo[\\/]/i];
  for(const file of files){
    if(!isPublicSource(file)){findings.push({file,reason:'not allowed'});continue;}
    if(/\.(png|webp)$/i.test(file)){const issue=imageMetadataIssue(await readFile(path.join(root,file)));if(issue)findings.push({file,reason:issue});continue;}
    if(/\.(ico|ttf|jar)$/i.test(file))continue;
    const text=await readFile(path.join(root,file),'utf8');
    if(patterns.some(pattern=>pattern.test(text)))findings.push({file,reason:'possible credential or personal path'});
    if(file!=='.env.example'&&/(^|\/)\.env($|\.)/.test(file))findings.push({file,reason:'environment file'});
  }
  return findings;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=path.resolve(import.meta.dirname,'..'),files=await publicFiles(root),findings=await scanPublicSource(root,files);
  const tracked=spawnSync('git',['ls-files','-z','--full-name'],{cwd:root,encoding:'utf8',windowsHide:true});
  if(tracked.status===0)for(const file of tracked.stdout.split('\0').filter(Boolean))if(!isPublicSource(file))findings.push({file,reason:'tracked file is outside the public-source policy'});
  for(const required of ['LICENSE','README.md','THIRD_PARTY_NOTICES.md','third-party/inventory.json','.github/workflows/ci.yml','docs/BUILDING.md','docs/PUBLISHING.md'])if(!files.includes(required))findings.push({file:required,reason:'required public file missing'});
  if(findings.length){console.error(JSON.stringify({findings},null,2));process.exitCode=1;}
  else if(process.argv.includes('--export')){
    const base=path.join(root,'.packaging',`public-source-${Date.now()}`),target=path.join(base,'RITVIO');await mkdir(target,{recursive:true});
    const manifest=[];
    for(const file of files){const output=path.join(target,file);await mkdir(path.dirname(output),{recursive:true});await copyFile(path.join(root,file),output);const bytes=await readFile(output);manifest.push({file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
    await writeFile(path.join(target,'SOURCE-MANIFEST.json'),JSON.stringify({schema:1,files:manifest},null,2)+'\n');
    const release=path.join(root,'release');await mkdir(release,{recursive:true});const zip=path.join(release,'RITVIO-public-source.zip');
    const python=process.env.YOUTUBE_RESOLVER_PYTHON??path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
    const script='import pathlib,sys,zipfile\np=pathlib.Path(sys.argv[1])\nwith zipfile.ZipFile(sys.argv[2],"w",zipfile.ZIP_DEFLATED) as z:\n for f in sorted(p.rglob("*")):\n  if f.is_file(): z.write(f,"RITVIO/"+f.relative_to(p).as_posix())';
    const result=spawnSync(python,['-c',script,target,zip],{stdio:'inherit',windowsHide:true});if(result.error||result.status!==0)throw Error('Could not archive public source');
    await writeFile(zip+'.sha256',`${createHash('sha256').update(await readFile(zip)).digest('hex')}  ${path.basename(zip)}\n`);
    await writeFile(path.join(release,'public-source-export.json'),JSON.stringify({directory:target,archive:zip,files:files.length},null,2)+'\n');
    console.log(JSON.stringify({directory:target,archive:zip,files:files.length,automatedScan:'passed',note:'Pattern checks are not a guarantee that all possible secrets have been detected.'}));
  }else console.log(JSON.stringify({files:files.length,automatedScan:'passed',note:'Only allowlisted source is checked/exported; do not publish the entire working directory.'}));
}
