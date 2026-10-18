import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyMobilePlayback} from '../packages/domain/mobile';
import {acceptPlaybackSnapshot} from '../packages/domain/playback-snapshot';
const sample=(session:number,sequence:number,index=0)=>({...emptyMobilePlayback,index,stamp:{session,sequence}});
test('a late command response cannot replace a newer playback event',()=>{
  const latest=sample(10,4,1),old=sample(10,3,0);
  assert.equal(acceptPlaybackSnapshot(latest,old),latest);
  assert.equal(acceptPlaybackSnapshot(latest,{...latest,playing:true}),latest);
  const next=sample(10,5,2);assert.equal(acceptPlaybackSnapshot(latest,next),next);
});
test('a fresh native service is accepted, and responses from its predecessor are discarded',()=>{
  const old=sample(10,500),fresh=sample(20,1);
  assert.equal(acceptPlaybackSnapshot(old,fresh),fresh);
  assert.equal(acceptPlaybackSnapshot(fresh,old),fresh);
});
test('legacy fixtures are accepted until the native service supplies ordering evidence',()=>{
  assert.equal(acceptPlaybackSnapshot(emptyMobilePlayback,emptyMobilePlayback),emptyMobilePlayback);
  const current=sample(10,1);assert.equal(acceptPlaybackSnapshot(emptyMobilePlayback,current),current);
  assert.equal(acceptPlaybackSnapshot(current,emptyMobilePlayback),current);
});
test('invalid or imprecise ordering values cannot poison subsequent playback updates',()=>{
  for(const stamp of [{session:NaN,sequence:1},{session:1,sequence:-1},{session:Number.MAX_SAFE_INTEGER+1,sequence:2}]){
    assert.equal(acceptPlaybackSnapshot(emptyMobilePlayback,{...emptyMobilePlayback,stamp}),emptyMobilePlayback);
  }
});
