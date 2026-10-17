import test from 'node:test';
import assert from 'node:assert/strict';
import {videoIdFromInput,nextIndex,reorder} from '../packages/domain/index';
test('YouTube link parser rejects unrelated hosts, credentials and command-like input',()=>{
  for(const input of ['testmusic01','https://youtu.be/testmusic01?t=3','https://music.youtube.com/watch?v=testmusic01','https://www.youtube.com/shorts/testmusic01'])assert.equal(videoIdFromInput(input),'testmusic01');
  for(const input of ['https://evil.test/?v=testmusic01','https://youtube.com.evil.test/?v=testmusic01','https://user:pass@youtube.com/watch?v=testmusic01','file:///testmusic01','../testmusic01'])assert.equal(videoIdFromInput(input),null);
});
test('repeat and shuffle follow queue boundaries without repeating the current item',()=>{
  assert.equal(nextIndex(0,-1,'off',false),-1);assert.equal(nextIndex(3,2,'off',false),-1);
  assert.equal(nextIndex(3,2,'playlist',false),0);assert.equal(nextIndex(3,1,'track',false),1);
  for(let current=0;current<3;current++)for(const random of [0,.2,.99])assert.notEqual(nextIndex(3,current,'off',true,()=>random),current);
  assert.deepEqual(reorder(['a','b','a'],0,2),['b','a','a']);
});
