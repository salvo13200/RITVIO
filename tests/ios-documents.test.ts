import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseDocumentPreview,documentSelection,parseReviewedReport} from '../apps/mobile/src/ios/document-model';
const token='11111111-1111-4111-8111-111111111111';
const track={videoId:'abcdefghijk',title:'A song',artist:'An artist',thumbnail:'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg',duration:60};
const preview=()=>({token,name:'Night drives',description:'',cover:null,adjusted:0,entries:[track,{...track,videoId:'bcdefghijkl'},track].map((track,i)=>({number:i+1,track}))});
test('preview rejects malformed or oversized data and strips unrelated metadata',()=>{
 assert.equal(parseDocumentPreview(preview()).entries.length,3);
 for(const patch of [{token:'path'},{name:'a'.repeat(101)},{cover:'https://untrusted.invalid/image'},{adjusted:-1},{entries:[{number:0,track}]},{entries:Array(1001).fill({number:1,track})}])assert.throws(()=>parseDocumentPreview({...preview(),...patch}));
 assert.equal('url' in parseDocumentPreview({...preview(),entries:[{number:1,track:{...track,url:'private-signed-stream'}}]}).entries[0].track,false);
});
test('selected occurrences preserve source order and deduplicate only when requested',()=>{
 const value=parseDocumentPreview(preview());
 assert.deepEqual(documentSelection(value,new Set([3,2,1]),false).tracks.map(x=>x.videoId),['abcdefghijk','bcdefghijkl','abcdefghijk']);
 assert.equal(documentSelection(value,new Set([1,2,3]),true).skipped,1);
 assert.equal(documentSelection(value,new Set(),true).tracks.length,0);
 const many={...value,entries:Array.from({length:501},(_,i)=>({number:i+1,track:{...track,videoId:`limit${String(i).padStart(6,'0')}`}}))};
 assert.equal(documentSelection(many,new Set(many.entries.map(x=>x.number)),true).overLimit,true);
});
const report=()=>({schema:1,app:'RITVIO',platform:'ios',version:'0.10.0',build:'11',systemVersion:'26.0',minimumOS:'15.0',capabilities:{library:true,lyrics:true,sharing:true,timer:true,discovery:true,playlistFiles:true},codes:{playback:'NONE',suggestions:'NONE',documents:'OTHER'}});
test('reviewed report accepts only the bounded diagnostic schema, preserving exact reviewed bytes',()=>{
 const text=JSON.stringify(report(),null,2);assert.equal(parseReviewedReport({token,text}).text,text);
 for(const patch of [{history:['private song']},{deviceId:'private'},{version:'user/path'},{codes:{...report().codes,documents:'SECRET_URL'}},{codes:{...report().codes,path:'/private'}},{capabilities:{...report().capabilities,account:'private'}}])assert.throws(()=>parseReviewedReport({token,text:JSON.stringify({...report(),...patch})}));
 assert.throws(()=>parseReviewedReport({token,text:'x'.repeat(6001)}));
});
test('playback timing diagnostics allow bounded numbers and known codecs only',()=>{
 const timing={codec:'mp4a.40.2',precise:true,catalogSeconds:296,sourceSeconds:296,assetSeconds:295.502,itemSeconds:295.502};
 for(const value of [timing,{...timing,codec:'none',catalogSeconds:null,sourceSeconds:null,assetSeconds:null,itemSeconds:null},{...timing,headerNormalized:true,containerSeconds:295.502}]){
  const text=JSON.stringify({...report(),timing:value});assert.equal(parseReviewedReport({token,text}).text,text);
 }
 for(const patch of [{url:'https://private.invalid'},{codec:'private codec or URL'},{codec:['aac']},{itemSeconds:-1},{itemSeconds:86401},{itemSeconds:'296'},{itemSeconds:true},{precise:1},{headerNormalized:true},{headerNormalized:1,containerSeconds:296},{headerNormalized:true,containerSeconds:'private'}])assert.throws(()=>parseReviewedReport({token,text:JSON.stringify({...report(),timing:{...timing,...patch}})}));
});
