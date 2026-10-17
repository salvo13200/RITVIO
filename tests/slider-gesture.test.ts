import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SliderGesture} from '../packages/domain/slider-gesture';

test('seek previews do not commit until release; non-pointer input stays immediate',()=>{
  const gesture=new SliderGesture();
  assert.equal(gesture.update(5,'track-a'),'immediate');
  gesture.begin(5,'track-a');
  assert.equal(gesture.update(18,'track-a'),'preview');
  assert.equal(gesture.update(22,'track-a'),'preview');
  assert.equal(gesture.release('track-a'),22);
  assert.equal(gesture.release('track-a'),null);
});

test('replacement track rejects remaining movement and release from the old drag',()=>{
  const gesture=new SliderGesture();
  gesture.begin(5,'track-a');gesture.update(18,'track-a');
  assert.equal(gesture.update(42,'track-b'),'cancelled');
  assert.equal(gesture.update(58,'track-b'),'cancelled');
  assert.equal(gesture.release('track-b'),null);
  gesture.begin(2,'track-b');
  assert.equal(gesture.update(9,'track-b'),'preview');
  assert.equal(gesture.release('track-b'),9);
});

test('duration, blur, Escape and pointer cancellation guard continued movement until release',()=>{
  for(const reason of ['duration','blur','Escape','pointercancel']){
    const gesture=new SliderGesture();
    gesture.begin(5,'track-a');gesture.update(18,'track-a');gesture.cancel();
    assert.equal(gesture.update(21,'track-a'),'cancelled',reason);
    assert.equal(gesture.update(24,'track-a'),'cancelled',reason);
    assert.equal(gesture.release('track-a'),null,reason);
    assert.equal(gesture.update(10,'track-a'),'immediate',reason);
  }
});

test('disabled player and missing pointerup cannot revive an aborted gesture',()=>{
  const gesture=new SliderGesture();
  gesture.begin(0,'track-a');
  assert.equal(gesture.update(20,'track-a',true),'cancelled');
  assert.equal(gesture.update(30,'track-a',false),'cancelled');
  gesture.begin(2,'track-a');
  assert.equal(gesture.update(8,'track-a'),'preview');
  assert.equal(gesture.release('track-a'),8);
});
