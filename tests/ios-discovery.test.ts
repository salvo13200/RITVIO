import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDiscovery,acceptDiscovery} from '../apps/mobile/src/ios/discovery-model';
const idle={enabled:false,status:'idle',loading:false,mode:null,origin:null,message:null,suspended:null,retryIn:0,revision:0,sample:1};
test('iOS discovery validates states, finite retry gates and strips private metadata',()=>{
 assert.deepEqual(parseDiscovery(idle),idle);
 const track={videoId:'abcdefghijk',title:'A title',artist:'Artist',thumbnail:'',duration:100,artists:[{id:'person',name:'Artist',token:'secret'}],url:'secret'};
 const value=parseDiscovery({...idle,enabled:true,status:'ready',origin:track,private:'secret'});
 assert.equal((value as any).private,undefined);assert.equal((value.origin as any).url,undefined);assert.equal((value.origin!.artists![0] as any).token,undefined);
 for(const bad of [null,{}, {...idle,message:['BUSY']},{...idle,status:'loading'},{...idle,loading:true},{...idle,mode:'radio'},{...idle,suspended:'unknown'},{...idle,retryIn:NaN},{...idle,retryIn:-1},{...idle,revision:1.5},{...idle,sample:Infinity},{...idle,origin:{...track,artists:[{}]}}])assert.throws(()=>parseDiscovery(bad),/INVALID_DISCOVERY_STATE/);
});
test('stale discovery events cannot overwrite a later cancellation or setting',()=>{
 const loading=parseDiscovery({...idle,status:'loading',loading:true,mode:'radio',revision:1,sample:2});
 const cancelled=parseDiscovery({...idle,revision:2,sample:3});assert.equal(acceptDiscovery(cancelled,loading),cancelled);
 assert.equal(acceptDiscovery(loading,parseDiscovery({...loading,sample:1})),loading);assert.equal(acceptDiscovery(null,loading),loading);
});
