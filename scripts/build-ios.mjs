import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir,stat,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {prepareIOSIcon} from './ios-assets.mjs';
import {prepareIOSResolver} from './prepare-ios-resolver.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),mobile=path.join(root,'apps/mobile'),require=createRequire(import.meta.url);
const options=new Set(process.argv.slice(2));
for(const flag of options)if(!['--prepare-only','--simulator','--device','--smoke','--resolver-only','--skip-live'].includes(flag))throw Error(`Unknown option: ${flag}`);
if(!options.has('--prepare-only')&&process.platform!=='darwin')throw Error('Xcode builds require macOS. Use pnpm ios:prepare on Windows.');
if(options.has('--smoke')&&options.has('--prepare-only'))throw Error('Smoke tests require a native build.');
if(options.has('--resolver-only')&&!options.has('--smoke'))throw Error('Resolver-only mode requires --smoke');
const env={...process.env,RITVIO_MOBILE_PLATFORM:'ios'};
function run(file,args,{cwd=root,capture=false}={}){
 return new Promise((resolve,reject)=>{let stdout='';const child=spawn(file,args,{cwd,env,windowsHide:true,stdio:capture?['ignore','pipe','inherit']:'inherit'});if(capture)child.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.length>16*1024*1024)child.kill();});child.once('error',reject);child.once('exit',(code,signal)=>code===0?resolve(stdout):reject(Error(`${path.basename(file)} failed (${code??signal})`)));});
}
const version=JSON.parse(await readFile(path.join(mobile,'ios-version.json'),'utf8'));
await run(process.execPath,[path.join(path.dirname(require.resolve('vite/package.json')),'bin/vite.js'),'build'],{cwd:mobile});
await run(process.execPath,[path.join(path.dirname(require.resolve('@capacitor/cli/package.json')),'bin/capacitor'),'sync','ios'],{cwd:mobile});
await prepareIOSIcon(root);
await prepareIOSResolver();
const swiftPackage=await readFile(path.join(mobile,'ios/App/CapApp-SPM/Package.swift'),'utf8');
const capacitor=JSON.parse(await readFile(path.join(root,'node_modules/@capacitor/ios/package.json'),'utf8')).version;
if(!swiftPackage.includes(`exact: "${capacitor}"`))throw Error('Capacitor Swift dependency must match the locked npm version');
const project=path.join(mobile,'ios/App/App.xcodeproj'),pbx=await readFile(path.join(project,'project.pbxproj'),'utf8');
if(!pbx.includes(`MARKETING_VERSION = ${version.version};`)||!pbx.includes(`CURRENT_PROJECT_VERSION = ${version.build};`))throw Error('Xcode and ios-version.json versions differ');
if(options.has('--prepare-only')){console.log(JSON.stringify({prepared:true,platform:'ios',version:version.version,webDir:'ios-web-dist',nativeBuild:false}));process.exit(0);}
const output=path.join(root,'.local/ios'),artifacts=path.join(output,'artifacts');await mkdir(artifacts,{recursive:true});
const buildSimulator=!options.has('--device')||options.has('--simulator')||options.has('--smoke'),buildDevice=!options.has('--simulator')||options.has('--device');
const base=['-project',project,'-scheme','App','-clonedSourcePackagesDirPath',path.join(output,'swift-packages')];
const report={schema:1,phase:version.phase,version:version.version,build:version.build,minimumOS:version.minimumOS,deviceSigning:'none',physicalTests:'pending',resolver:'pending',liveProvider:options.has('--skip-live')?'not-run':'pending',playback:'not-run',artifacts:[],simulators:[],liveFailures:[]};
const nativeBuildPassed=()=> (!buildDevice||report.artifacts.some(item=>item.destination==='device-unsigned'))&&(!buildSimulator||report.artifacts.some(item=>item.destination==='simulator'));
await writeFile(path.join(artifacts,'status.json'),JSON.stringify({phase:version.phase,nativeBuild:'running',physicalTests:'pending'},null,2)+'\n');
const results=path.join(output,`results-${Date.now()}-${process.pid}`);await mkdir(results,{recursive:true});
async function archive(app,name,destination){
 const plist=JSON.parse(await run('plutil',['-convert','json','-o','-',path.join(app,'Info.plist')],{capture:true}));
 if(plist.CFBundleIdentifier!=='it.ritvio.ios'||plist.CFBundleShortVersionString!==version.version||String(plist.CFBundleVersion)!==String(version.build)||String(plist.MinimumOSVersion)!==version.minimumOS)throw Error('Unexpected built iOS identity or minimum OS');
 const mach=await run('lipo',['-archs',path.join(app,plist.CFBundleExecutable)],{capture:true});if(!mach.trim().split(/\s+/).includes('arm64'))throw Error('Missing arm64 build');
 await stat(path.join(app,'public/index.html'));
 const zip=path.join(artifacts,name);await run('ditto',['-c','-k','--sequesterRsrc','--keepParent',app,zip]);const bytes=await readFile(zip),sha256=createHash('sha256').update(bytes).digest('hex');
 await writeFile(zip+'.sha256',`${sha256}  ${name}\n`);report.artifacts.push({file:name,destination,bytes:bytes.length,sha256,architectures:mach.trim().split(/\s+/)});
}
try {
if(buildDevice){const derived=path.join(output,'device');await run('xcodebuild',[...base,'-configuration','Release','-sdk','iphoneos','-destination','generic/platform=iOS','-derivedDataPath',derived,'build','CODE_SIGNING_ALLOWED=NO']);await archive(path.join(derived,'Build/Products/Release-iphoneos/App.app'),`RITVIO-iOS-${version.version}-device-unsigned.zip`,'device-unsigned');}
if(buildSimulator){
 const derived=path.join(output,'simulator');await run('xcodebuild',[...base,'-configuration','Debug','-sdk','iphonesimulator','-destination','generic/platform=iOS Simulator','-derivedDataPath',derived,'build','CODE_SIGNING_ALLOWED=NO']);
 await archive(path.join(derived,'Build/Products/Debug-iphonesimulator/App.app'),`RITVIO-iOS-${version.version}-simulator.zip`,'simulator');
 if(options.has('--smoke')){
  const available=JSON.parse(await run('xcrun',['simctl','list','devices','available','--json'],{capture:true}));
  const devices=Object.entries(available.devices).filter(([runtime])=>runtime.includes('iOS')).flatMap(([runtime,list])=>list.filter(device=>device.name.startsWith('iPhone')&&device.isAvailable).map(device=>({...device,runtime})));
  let compact=devices.find(device=>device.name.includes('SE')||device.name.includes('mini'));
  if(!compact&&devices[0]){
   const types=JSON.parse(await run('xcrun',['simctl','list','devicetypes','--json'],{capture:true}));
   const type=types.devicetypes.find(type=>type.name.includes('iPhone SE (3rd generation)'));
   if(type){const udid=(await run('xcrun',['simctl','create','RITVIO compact check',type.identifier,devices[0].runtime],{capture:true})).trim();compact={name:type.name,udid,state:'Shutdown',runtime:devices[0].runtime,created:true};}
  }
  compact??=devices[0];
  const large=devices.find(device=>device.udid!==compact?.udid&&!device.name.includes('SE')&&!device.name.includes('mini'));
  if(!compact)throw Error('No available iPhone simulator');
  for(const [index,device] of (options.has('--resolver-only')?[compact]:[compact,large]).filter(Boolean).entries()){
   if(device.state!=='Booted')await run('xcrun',['simctl','boot',device.udid]);
   try{
    await run('xcrun',['simctl','bootstatus',device.udid,'-b']);await run('xcrun',['simctl','ui',device.udid,'appearance','dark']);
    if(index===1)await run('xcrun',['simctl','ui',device.udid,'content_size','accessibility-large']);
    if(!options.has('--resolver-only')){
    const result=path.join(results,`foundation-${index}.xcresult`);
    try{await run('xcodebuild',[...base,'-configuration','Debug','-destination',`platform=iOS Simulator,id=${device.udid}`,'-derivedDataPath',derived,'-resultBundlePath',result,'-parallel-testing-enabled','NO','test','CODE_SIGNING_ALLOWED=NO']);}
    finally{const exported=path.join(artifacts,`screenshots-${index}`);await mkdir(exported,{recursive:true});try{await stat(result);await run('xcrun',['xcresulttool','export','attachments','--path',result,'--output-path',exported]);}catch(error){console.error('Could not export XCTest screenshots:',error.message);}}
    }else await run('xcrun',['simctl','install',device.udid,path.join(derived,'Build/Products/Debug-iphonesimulator/App.app')]);
    const live=index===0&&!options.has('--skip-live');
    const container=(await run('xcrun',['simctl','get_app_container',device.udid,'it.ritvio.ios','data'],{capture:true})).trim();
    if(index===0&&['IOS-3','IOS-4'].includes(version.phase)&&!options.has('--resolver-only')){
     const playbackEvidence=path.join(container,'Documents/playback-evidence.json');
     await rm(playbackEvidence,{force:true});
     await run('xcrun',['simctl','launch','--terminate-running-process',device.udid,'it.ritvio.ios','--ritvio-playback-check']);
     let playback;
     let previous;
     for(let attempt=0;attempt<240;attempt++){
      try{
       const value=JSON.parse(await readFile(playbackEvidence,'utf8'));
       if(value.stage!==previous){previous=value.stage;console.log(`Native playback: ${value.stage}`);}
       await writeFile(path.join(artifacts,'playback.json'),JSON.stringify(value,null,2)+'\n');
       if(value.status==='passed'||value.status==='failed'){playback=value;break;}
      }catch(error){if(error.code!=='ENOENT')throw error;}
      await new Promise(resolve=>setTimeout(resolve,1000));
     }
     if(!playback)throw Error('Native playback evidence did not complete within 240 seconds');
     report.playback=playback.status==='passed'?'native-synthetic-passed':'failed';
     if(playback.status!=='passed')throw Error(`Native playback check failed: ${playback.failedStage}/${playback.error}`);
    }
    const evidence=path.join(container,'Documents/resolver-evidence.json');
    await rm(evidence,{force:true});
    await run('xcrun',['simctl','launch','--terminate-running-process',device.udid,'it.ritvio.ios','--ritvio-resolver-check',...(live?['--ritvio-resolver-live']:[])]);
    let nativeEvidence;
    let previousStage;
    for(let attempt=0;attempt<240;attempt++){
     try{
      const value=JSON.parse(await readFile(evidence,'utf8'));
      await writeFile(path.join(artifacts,`resolver-${index}.json`),JSON.stringify(value,null,2)+'\n');
      if(value.stage!==previousStage){previousStage=value.stage;console.log(`Native resolver ${index}: ${value.stage}`);}
      if(value.status==='passed'||value.status==='failed'){nativeEvidence=value;break;}
     }catch(error){if(error.code!=='ENOENT')throw error;}
     await new Promise(resolve=>setTimeout(resolve,1000));
    }
    if(!nativeEvidence)throw Error('Native resolver evidence did not complete within 240 seconds');
    await writeFile(path.join(artifacts,`resolver-${index}.json`),JSON.stringify(nativeEvidence,null,2)+'\n');
    report.simulators.push({name:device.name,runtime:device.runtime,largeText:index===1,uiTests:options.has('--resolver-only')?'not-run':'passed',resolver:nativeEvidence.status==='passed'?'passed':'failed',live,...(!options.has('--resolver-only')?{screenshots:`screenshots-${index}`}:{})});
    if(nativeEvidence.status!=='passed'){
     if(live&&String(nativeEvidence.failedStage).startsWith('live-')){
      report.liveFailures.push({simulator:device.name,stage:nativeEvidence.failedStage,error:nativeEvidence.error});
      console.error(`Live provider check remains open: ${nativeEvidence.error}. Continuing independent native checks.`);
     }else throw Error(`Native resolver check failed: ${nativeEvidence.failedStage}/${nativeEvidence.error}`);
    }
   }finally{await run('xcrun',['simctl','shutdown',device.udid]);if(device.created)await run('xcrun',['simctl','delete',device.udid]);}
  }
 }
}
report.resolver=report.liveFailures.length?'failed':report.simulators.length?options.has('--skip-live')?'native-checks-passed':'passed':'not-run';
report.liveProvider=options.has('--skip-live')?'not-run':report.liveFailures.length?'failed':report.simulators.length?'passed':'not-run';
report.nativeBuild=nativeBuildPassed()?'passed':'failed';
await writeFile(path.join(artifacts,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
if(report.liveFailures.length)throw Error('Live provider acceptance remains open; see the redacted resolver evidence.');
await writeFile(path.join(artifacts,'status.json'),JSON.stringify({phase:version.phase,nativeBuild:report.nativeBuild,checks:report.simulators.length?'passed':'not-run',physicalTests:'pending'},null,2)+'\n');
} catch(error) {
 report.nativeBuild=nativeBuildPassed()?'passed':'failed';
 await writeFile(path.join(artifacts,'report.json'),JSON.stringify(report,null,2)+'\n');
 await writeFile(path.join(artifacts,'status.json'),JSON.stringify({phase:version.phase,nativeBuild:report.nativeBuild,checks:'failed',physicalTests:'pending',reason:error.message},null,2)+'\n');
 throw error;
}
