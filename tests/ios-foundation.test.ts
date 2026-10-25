import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {mobilePlatform} from '../scripts/mobile-platform.mjs';
import {isPublicSource} from '../scripts/public-source.mjs';
import {parseFoundationStatus,verifyFoundationCheck} from '../apps/mobile/src/ios/contract';

test('mobile platform selection preserves the Android identity and separates iOS output',()=>{
 const saved=process.env.RITVIO_MOBILE_PLATFORM;delete process.env.RITVIO_MOBILE_PLATFORM;
 try{assert.deepEqual(mobilePlatform(),{platform:'android',appId:'it.ritvio.android',webDir:'web-dist'});}finally{if(saved!==undefined)process.env.RITVIO_MOBILE_PLATFORM=saved;}
 assert.deepEqual(mobilePlatform('ios'),{platform:'ios',appId:'it.ritvio.ios',webDir:'ios-web-dist'});
 for(const input of ['','windows','iOS','../../android'])assert.throws(()=>mobilePlatform(input),/must be android or ios/);
});
const status={platform:'ios',phase:'IOS-1',version:'0.1.0',build:'1',bundleId:'it.ritvio.ios',systemVersion:'15.8',environment:'device',minimumOS:'15.0',bundledAssets:true,capabilities:{resolver:false,playback:false,library:false,lyrics:false,sharing:false}};
test('foundation accepts native metadata without inventing playback capabilities',()=>{
 assert.equal(parseFoundationStatus(status),status);
 assert.equal(parseFoundationStatus({...status,bundledAssets:false}).bundledAssets,false);
 for(const input of [null,{}, {...status,platform:'android'},{...status,environment:'web'},{...status,version:1},{...status,minimumOS:''},{...status,capabilities:null}])assert.throws(()=>parseFoundationStatus(input));
 for(const feature of Object.keys(status.capabilities))assert.throws(()=>parseFoundationStatus({...status,capabilities:{...status.capabilities,[feature]:true}}));
 const resolverBuild={...status,phase:'IOS-2',capabilities:{...status.capabilities,resolver:true}};
 assert.equal(parseFoundationStatus(resolverBuild).capabilities.resolver,true);
 assert.throws(()=>parseFoundationStatus({...resolverBuild,capabilities:{...resolverBuild.capabilities,playback:true}}));
 const playerBuild={...resolverBuild,phase:'IOS-3',capabilities:{...resolverBuild.capabilities,playback:true}};
 assert.equal(parseFoundationStatus(playerBuild).capabilities.playback,true);
 assert.equal(parseFoundationStatus({...playerBuild,phase:'IOS-4',textScale:1.65}).capabilities.playback,true);
 for(const textScale of [0,NaN,Infinity,'1.5'])assert.throws(()=>parseFoundationStatus({...playerBuild,phase:'IOS-4',textScale}));
 assert.throws(()=>parseFoundationStatus({...playerBuild,capabilities:{...playerBuild.capabilities,library:true}}));
});
test('bridge round trip must return the actual challenge and native platform',()=>{
 verifyFoundationCheck({platform:'ios',nonce:'12345678'},'12345678');
 for(const value of [undefined,{}, {platform:'ios',nonce:'old-check'},{platform:'web',nonce:'12345678'}])assert.throws(()=>verifyFoundationCheck(value,'12345678'));
});
test('public source excludes iOS build products, signing identities and local web copies',()=>{
 for(const file of ['apps/mobile/ios/App/App/RitvioPlaybackPlugin.swift','apps/mobile/ios/App/App/PrivacyInfo.xcprivacy','apps/mobile/ios/App/App.xcodeproj/project.pbxproj','apps/mobile/ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme','apps/mobile/ios-version.json'])assert.equal(isPublicSource(file),true,file);
 for(const file of ['apps/mobile/ios/App/Runtime/quickjs/quickjs.c','apps/mobile/ios/App/Runtime/Python.xcframework/Info.plist','apps/mobile/ios-web-dist/index.html','apps/mobile/ios/App/App/public/index.html','apps/mobile/ios/App/App/capacitor.config.json','apps/mobile/ios/App/App/config.xml','apps/mobile/ios/DerivedData/build.txt','apps/mobile/ios/App/App.xcodeproj/xcuserdata/private.xcuserstate','apps/mobile/ios/.swiftpm/config.json','apps/mobile/ios/profile.mobileprovision','apps/mobile/ios/identity.p12','apps/mobile/ios/key.p8','apps/mobile/ios/App.xcarchive/Info.plist','apps/mobile/ios/tests.xcresult/Info.plist','apps/mobile/ios/RITVIO.ipa','apps/mobile/ios/App/App/Assets.xcassets/AppIcon.appiconset/RITVIO.png'])assert.equal(isPublicSource(file),false,file);
});
test('iOS build version remains independent from the existing Android release',async()=>{
 const ios=JSON.parse(await readFile(new URL('../apps/mobile/ios-version.json',import.meta.url),'utf8'));
 const android=JSON.parse(await readFile(new URL('../apps/mobile/package.json',import.meta.url),'utf8'));
 const gradle=await readFile(new URL('../apps/mobile/android/app/build.gradle',import.meta.url),'utf8');
 assert.ok(gradle.includes(`versionName "${android.version}"`));assert.equal(ios.phase,'IOS-4');assert.equal(ios.minimumOS,'15.0');assert.ok(Number.isSafeInteger(ios.build)&&ios.build>0);assert.match(ios.version,/^\d+\.\d+\.\d+$/);assert.notEqual(ios.version,android.version);
});
