import test from 'node:test';
import assert from 'node:assert/strict';
import {canPreloadAudio} from '../packages/domain/audio-preload';
test('a slow current stream takes priority over speculative next-track audio',()=>{
  assert.equal(canPreloadAudio(10,180,[[0,11]]),false);assert.equal(canPreloadAudio(10,180,[[0,18]]),true);
});
test('a short recording buffered to the end can prepare its successor',()=>{
  assert.equal(canPreloadAudio(10,12,[[0,12]]),true);assert.equal(canPreloadAudio(10,12,[[0,11]]),false);
});
test('a future buffered island cannot hide an unbuffered seek target',()=>{
  assert.equal(canPreloadAudio(10,180,[[0,9],[11,100]]),false);assert.equal(canPreloadAudio(12,180,[[0,9],[11,100]]),true);
});
test('malformed timing does not enable preloading; an unknown duration still requires actual headroom',()=>{
  assert.equal(canPreloadAudio(NaN,180,[[0,100]]),false);assert.equal(canPreloadAudio(1,Infinity,[[0,9]]),true);assert.equal(canPreloadAudio(1,NaN,[[0,2]]),false);
});
