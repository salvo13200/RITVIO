import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {prepareIOSCandidate} from '../scripts/ios-candidate.mjs';
import {iosSourceIdentity} from '../scripts/ios-source-identity.mjs';
async function repo(t:{after:(fn:()=>Promise<void>)=>void}){
 const root=await mkdtemp(path.join(tmpdir(),'ritvio-ios-candidate-'));
 t.after(async()=>{const full=path.resolve(root),parent=path.resolve(tmpdir())+path.sep;if(!full.startsWith(parent)||!path.basename(full).startsWith('ritvio-ios-candidate-'))throw Error('Unexpected test cleanup target');await rm(full,{recursive:true,force:true});});
 const put=async(file:string,text:string)=>{await mkdir(path.dirname(path.join(root,file)),{recursive:true});await writeFile(path.join(root,file),text);};
 const git=(...args:string[])=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 await put('.gitignore','.local/\n');await put('.gitattributes','* text=auto\n');await put('README.md','Synthetic candidate fixture\n');await put('apps/mobile/ios-version.json',JSON.stringify({version:'0.10.0',build:11,minimumOS:'15.0',phase:'IOS-5'}));await put('apps/mobile/ios/App/App.xcodeproj/project.pbxproj','MARKETING_VERSION = 0.10.0;\nCURRENT_PROJECT_VERSION = 11;\n');await put('scripts/ios-candidate-scope.json',JSON.stringify({schema:1,implemented:['Synthetic scope'],notYetPorted:[],deferredChecks:['Physical acceptance deferred']}));
 git('init');git('config','core.autocrlf','false');git('add','.');git('-c','user.name=RITVIO tests','-c','user.email=tests@example.invalid','-c','commit.gpgsign=false','commit','-m','Synthetic source');return {root,put,git};
}
test('clean source preparation creates a reproducible source-only beta plan with honest gates',async t=>{
 const {root}=await repo(t),identity=iosSourceIdentity(root),result=await prepareIOSCandidate(root);
 assert.equal(result.sourceCommit,identity.commit);assert.equal(result.ipaCreated,false);assert.equal(result.nativeBuild,'not-run');assert.equal(result.publicReleaseReady,false);
 const archive=await readFile(path.join(result.folder,result.sourceArchive.file));assert.equal(createHash('sha256').update(archive).digest('hex'),result.sourceArchive.sha256);
 const manifest=JSON.parse(await readFile(path.join(result.folder,'SOURCE-MANIFEST.json'),'utf8'));assert.equal(manifest.source.tree,identity.tree);assert.equal(manifest.files.length,result.sourceFiles);
 const notes=JSON.parse(await readFile(path.join(result.folder,'candidate-notes.json'),'utf8'));assert.equal(notes.sourceCommit,result.sourceCommit);assert.deepEqual(notes.deferredChecks,['Physical acceptance deferred']);assert.deepEqual(await prepareIOSCandidate(root),result);assert.equal(iosSourceIdentity(root).dirty,false);
});
test('dirty or uncommitted public inputs stop preparation before writing a candidate',async t=>{
 const {root,put}=await repo(t);await put('README.md','Changed source\n');await assert.rejects(prepareIOSCandidate(root),/clean committed/);await assert.rejects(stat(path.join(root,'.local/ios/prepared')),{code:'ENOENT'});
});
test('canonical Git source survives Windows line-ending conversion and version mismatch is rejected',async t=>{
 const {root,put,git}=await repo(t);git('config','core.autocrlf','true');await put('README.md','Synthetic candidate fixture\r\n');assert.equal(iosSourceIdentity(root).dirty,false,git('status','--porcelain=v1'));
 const result=await prepareIOSCandidate(root),manifest=JSON.parse(await readFile(path.join(result.folder,'SOURCE-MANIFEST.json'),'utf8')),readme=manifest.files.find((item:{file:string})=>item.file==='README.md');assert.equal(readme.sha256,createHash('sha256').update('Synthetic candidate fixture\n').digest('hex'));
 await put('apps/mobile/ios-version.json',JSON.stringify({version:'0.11.0',build:12,minimumOS:'15.0',phase:'IOS-5'}));git('add','.');git('-c','user.name=RITVIO tests','-c','user.email=tests@example.invalid','-c','commit.gpgsign=false','commit','-m','Synthetic mismatched version');await assert.rejects(prepareIOSCandidate(root),/versions differ/);
});
