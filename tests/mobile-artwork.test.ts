import test from 'node:test';
import assert from 'node:assert/strict';
import {artworkSources} from '../apps/mobile/src/artwork';
test('large music artwork requests 1024px and keeps its original fallback',()=>{
 const url='https://lh3.googleusercontent.com/cover=w120-h120-l90-rj';
 assert.deepEqual(artworkSources(url,true),['https://lh3.googleusercontent.com/cover=w1024-h1024-l90-rj',url]);
 assert.equal(artworkSources(url)[0],'https://lh3.googleusercontent.com/cover=w320-h320-l90-rj');
});
test('video artwork requests maxres only for large displays; unknown and local sources are unchanged',()=>{
 const url='https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg';
 assert.deepEqual(artworkSources(url,true),[url.replace('hqdefault','maxresdefault'),url]);
 assert.deepEqual(artworkSources(url),[url]);
 for(const source of ['data:image/jpeg;base64,abc','file:///private/photo.jpg','https://external.example/a=w60-h60','https://lh3.googleusercontent.com.evil.example/a=w60-h60'])assert.deepEqual(artworkSources(source,true),[source]);
});
