import test from 'node:test';
import assert from 'node:assert/strict';
import {originalStereoTone} from './native-opus.mjs';

test('comparison PCM contains two independent 48 kHz channels and the declared duration',()=>{
  const data=originalStereoTone(12);
  assert.equal(data.toString('ascii',0,4),'RIFF');assert.equal(data.toString('ascii',8,12),'WAVE');
  assert.equal(data.readUInt32LE(4)+8,data.length);assert.equal(data.readUInt32LE(40),12*48000*4);
  assert.equal(data.readUInt16LE(22),2);assert.equal(data.readUInt32LE(24),48000);assert.equal(data.readUInt16LE(34),16);
  assert.notEqual(data.readInt16LE(44+100*4),data.readInt16LE(46+100*4));
  for(const seconds of [0,11,61,12.5,NaN])assert.throws(()=>originalStereoTone(seconds));
});
