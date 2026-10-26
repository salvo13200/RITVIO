import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptLibrary,parseLibrary} from '../apps/mobile/src/ios/library-model';
const track={videoId:'abcdefghijk',title:'Original fixture',artist:'RITVIO tests',thumbnail:'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg',duration:90};
const empty=()=>({revision:0,likes:[],playlists:[],recent:[],follows:[]});
const collection=()=>({id:'12345678-1234-1234-1234-123456789abc',name:'Night drive',description:'Personal collection',items:[track,track],revision:1,updatedAt:1000,cover:'file:///private/app/playlist-artwork/12345678-1234-1234-1234-123456789abc.jpg'});
test('native library snapshot accepts local personal covers and duplicate playlist occurrences',()=>{
 const value={...empty(),likes:[track],playlists:[collection()],recent:[track]};
 assert.equal(parseLibrary(value),value);assert.equal(parseLibrary(value).playlists[0].items.length,2);
 for(const cover of ['javascript:alert(1)','data:image/png;base64,test','file:///x\n','/private/file']){
  assert.throws(()=>parseLibrary({...value,playlists:[{...collection(),cover}]}));
 }
});
test('malformed or oversized snapshots cannot replace a usable library',()=>{
 for(const value of [null,{}, {...empty(),revision:-1},{...empty(),revision:NaN},{...empty(),likes:[track,track]}, {...empty(),recent:[...Array(41)].map((_,i)=>({...track,videoId:`track${String(i).padStart(6,'0')}`}))}, {...empty(),playlists:[collection(),collection()]}, {...empty(),playlists:[{...collection(),revision:0}]}, {...empty(),likes:[{...track,thumbnail:'http://insecure.invalid/image'}]}])assert.throws(()=>parseLibrary(value));
});
test('older and duplicate asynchronous events retain the newest library and its object identity',()=>{
 const first=parseLibrary({...empty(),revision:4,likes:[track]}),old=parseLibrary({...empty(),revision:3}),same=parseLibrary({...empty(),revision:4}),next=parseLibrary({...empty(),revision:5});
 assert.equal(acceptLibrary(null,first),first);assert.equal(acceptLibrary(first,old),first);assert.equal(acceptLibrary(first,same),first);assert.equal(acceptLibrary(first,next),next);
});
