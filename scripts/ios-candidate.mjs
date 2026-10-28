import {spawnSync} from 'node:child_process';
import {readFile,mkdir,writeFile,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {iosSourceIdentity} from './ios-source-identity.mjs';
import {isPublicSource,scanPublicSource} from './public-source.mjs';

const root=path.resolve(import.meta.dirname,'..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const encode=value=>JSON.stringify(value,null,2)+'\n';
function run(file,args,cwd){const result=spawnSync(file,args,{cwd,encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});if(result.status!==0)throw Error(result.stderr?.trim()||`${path.basename(file)} failed`);return result.stdout;}
async function writeNew(file,bytes){try{const existing=await readFile(file);if(!existing.equals(Buffer.from(bytes)))throw Error(`Existing candidate preparation differs: ${path.basename(file)}`);}catch(error){if(error.code!=='ENOENT')throw error;await writeFile(file,bytes,{flag:'wx'});}}

export async function prepareIOSCandidate(project=root){
 const source=iosSourceIdentity(project);
 if(!source.commit||source.dirty)throw Error('Candidate preparation requires a clean committed Git checkout; development builds may still be prepared with ios:prepare.');
 const version=JSON.parse(await readFile(path.join(project,'apps/mobile/ios-version.json'),'utf8'));
 if(!/^\d+\.\d+\.\d+$/.test(version.version)||!Number.isSafeInteger(version.build)||version.build<1||version.minimumOS!=='15.0'||version.phase!=='IOS-5')throw Error('Invalid iOS candidate identity');
 const pbx=await readFile(path.join(project,'apps/mobile/ios/App/App.xcodeproj/project.pbxproj'),'utf8');
 if(!pbx.includes(`MARKETING_VERSION = ${version.version};`)||!pbx.includes(`CURRENT_PROJECT_VERSION = ${version.build};`))throw Error('Xcode and candidate versions differ');
 const files=run('git',['ls-files','-z'],project).split('\0').filter(Boolean).sort();
 if(!files.length||files.some(file=>!isPublicSource(file)))throw Error('Tracked source violates the public-source policy');
 for(const file of files){if(/[\x00-\x1f\x7f]/.test(file))throw Error('Invalid source filename');const stat=await lstat(path.join(project,file));if(!stat.isFile()||stat.isSymbolicLink())throw Error(`Source must be a regular file: ${file}`);}
 // Read canonical Git blobs, not Windows checkout line-ending conversions.
 const blobs=spawnSync('git',['cat-file','--batch'],{cwd:project,windowsHide:true,input:files.map(file=>`HEAD:${file}\n`).join(''),maxBuffer:128*1024*1024});
 if(blobs.status!==0)throw Error('Could not read frozen source objects');
 let offset=0;const manifest=[];
 for(const file of files){const end=blobs.stdout.indexOf(10,offset);if(end<0)throw Error('Incomplete source object header');const header=/^([a-f\d]{40}) blob (\d+)$/.exec(blobs.stdout.subarray(offset,end).toString());if(!header)throw Error('Invalid source object');const bytes=Number(header[2]),start=end+1;if(!Number.isSafeInteger(bytes)||bytes>64*1024*1024||start+bytes>=blobs.stdout.length||blobs.stdout[start+bytes]!==10)throw Error('Invalid source object bounds');manifest.push({file,gitBlob:header[1],bytes,sha256:sha(blobs.stdout.subarray(start,start+bytes))});offset=start+bytes+1;}
 if(offset!==blobs.stdout.length)throw Error('Unexpected source object data');
 const findings=await scanPublicSource(project,files);if(findings.length)throw Error(`Public source scan failed: ${findings.map(item=>item.file).join(', ')}`);
 if(encode(iosSourceIdentity(project))!==encode(source))throw Error('Source changed during candidate preparation');
 const scope=JSON.parse(await readFile(path.join(project,'scripts/ios-candidate-scope.json'),'utf8'));
 for(const key of ['implemented','notYetPorted','deferredChecks'])if(!Array.isArray(scope[key])||scope[key].length>32||scope[key].some(value=>typeof value!=='string'||!value.length||value.length>500))throw Error('Invalid candidate scope');
 const folder=path.join(project,'.local/ios/prepared',`v${version.version}-b${version.build}-${source.commit.slice(0,8)}`);
 await mkdir(folder,{recursive:true});
 // git archive reads the frozen commit rather than copying a mutable checkout.
 const archiveName=`RITVIO-iOS-${version.version}-source.zip`,archive=path.join(folder,archiveName);
 const result=spawnSync('git',['-c','core.autocrlf=false','-c','core.eol=lf','archive','--format=zip','--prefix=RITVIO/',source.commit],{cwd:project,windowsHide:true,maxBuffer:128*1024*1024});
 if(result.status!==0)throw Error('Could not create corresponding source archive');
 await writeNew(archive,result.stdout);
 const notes={sourceCommit:source.commit,...Object.fromEntries(['implemented','notYetPorted','deferredChecks'].map(key=>[key,scope[key]]))};
 const plan={schema:1,stage:'IOS-6',status:'awaiting-native-build',app:{bundleId:'it.ritvio.ios',...version},source,
  sourceArchive:{file:archiveName,bytes:result.stdout.length,sha256:sha(result.stdout)},publicReleaseReady:false,personalSigningRequired:true,physicalTests:'deferred-until-after-github-upload',
  nativeCommand:'pnpm ios:build --smoke --skip-live',
  notes:'candidate-notes.json',sourceManifest:'SOURCE-MANIFEST.json'};
 await writeNew(path.join(folder,'candidate-notes.json'),encode(notes));await writeNew(path.join(folder,'SOURCE-MANIFEST.json'),encode({schema:1,source,files:manifest}));await writeNew(path.join(folder,'plan.json'),encode(plan));
 return {prepared:true,folder,sourceCommit:source.commit,version:version.version,build:version.build,sourceFiles:files.length,sourceArchive:plan.sourceArchive,ipaCreated:false,nativeBuild:'not-run',physicalTests:plan.physicalTests,publicReleaseReady:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==2)throw Error('Usage: node scripts/ios-candidate.mjs');
 console.log(encode(await prepareIOSCandidate()));
}
