import test from 'node:test';
import assert from 'node:assert/strict';
import {isSupportUrl,supportIssueUrl,supportIssues,supportReport,safePlaybackTimings} from '../packages/domain/support';
test('help links target the three official forms with app context only',()=>{
 for(const platform of ['android','windows'] as const)for(const kind of ['bug','visual','idea'] as const){
  const url=supportIssueUrl(kind,{platform,version:'1.3.1'});assert(isSupportUrl(url));const query=new URL(url).searchParams;
  assert.equal(query.get('context'),`RITVIO 1.3.1\nPlatform: ${platform==='android'?'Android':'Windows'}`);assert(!query.has('playback'));assert(!query.has('body'));
 }
 assert(isSupportUrl(supportIssues));
});
test('help links reject redirects, private extra fields and invalid native context',()=>{
 const good=supportIssueUrl('bug',{platform:'android',version:'1.3.1'});
 for(const url of [good+'&token=secret',good+'#x',good.replace('github.com','github.com.evil.invalid'),good.replace('https:','http:'),good.replace('bug_report.yml','evil.yml'),good.replace('version=1.3.1','version=2.0.0'),good+'&context=duplicate',good.replace('%0A','%xx'),supportIssues+'/new?redirect=https://evil.invalid'])assert(!isSupportUrl(url),url);
 for(const version of ['private/path','email@example.invalid','1.2.3\nsecret',''])assert.throws(()=>supportReport('bug',{platform:'android',version}));
});
test('report only includes known bounded counters and safe categorical samples',()=>{
 const input={title:'SECRET TITLE',profile:'SECRET PROFILE',token:'SECRET TOKEN',url:'https://signed.invalid/private',workers:[{pid:99}],cacheHits:4,resolver:{cached:3,path:'SECRET PATH'},renderer:{samples:Array.from({length:20},()=>({mode:'seek',seekedMs:15,prepared:true,outcome:'seeked',title:'SECRET TITLE'}))},samples:[{action:'secret track',outcome:'signed url',readyMs:NaN},{action:'seek',readyMs:12.345,outcome:'ready'}]};
 const text=supportReport('bug',{platform:'windows',version:'0.7.5'},input),report=JSON.parse(text);assert.equal(report.playback.cacheHits,4);assert.equal(report.playback.renderer.samples.length,5);assert.equal(report.playback.samples[0].readyMs,12.3);
 for(const secret of ['SECRET','signed.invalid','secret track','pid','workers'])assert(!text.includes(secret));assert(text.length<6000);
 assert.equal(Object.keys(safePlaybackTimings({readyMs:-1,cacheHits:Infinity,cached:10_000_000_001})).length,0);
 assert(!supportReport('idea',{platform:'android',version:'1.3.1'}).includes('playback'));
});
test('deep, cyclic and overfull diagnostic inputs stay bounded and cannot crash report rendering',()=>{
 const cyclic:any={samples:[],resolver:{cacheHits:1}};cyclic.samples=[cyclic];cyclic.renderer=cyclic;const text=supportReport('bug',{platform:'android',version:'1.3.1'},cyclic);assert(text.length<6000);
 const many={renderer:{samples:Array.from({length:1000},()=>({restoreMs:5,descriptorMs:5,firstDataMs:10,playingMs:12,seekedMs:5,readyMs:5,cacheHits:4,outcome:'playing'}))}};
 assert(supportReport('bug',{platform:'windows',version:'1.0.0'},many).length<6000);
});
