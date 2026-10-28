import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSleepTimer,acceptSleepTimer,sleepTime} from '../apps/mobile/src/ios/sleep-model';
const off={mode:'off',minutes:null,remaining:null,revision:0,sample:10,reason:null};
test('iOS timer state exposes only bounded modes, presets and native remaining time',()=>{
 assert.deepEqual(parseSleepTimer({...off,privateField:'discarded'}),off);
 for(const minutes of [15,30,45,60])assert.equal(parseSleepTimer({...off,mode:'duration',minutes,remaining:minutes*60}).minutes,minutes);
 assert.equal(parseSleepTimer({...off,mode:'track-end'}).mode,'track-end');
 for(const bad of [null,{}, {...off,mode:['off']},{...off,mode:'unknown'},{...off,mode:'duration',minutes:16,remaining:960},{...off,mode:'duration',minutes:15,remaining:901},{...off,mode:'duration',minutes:15,remaining:1.5},{...off,mode:'track-end',minutes:15},{...off,mode:'off',remaining:0},{...off,reason:'complete'},{...off,sample:NaN},{...off,revision:true},{...off,revision:1.2},{...off,mode:'duration',minutes:15,remaining:30,reason:'expired'}])assert.throws(()=>parseSleepTimer(bad),/INVALID_TIMER_STATE/);
});
test('late timer reads cannot resurrect an expired revision or replace a newer native sample',()=>{
 const active=parseSleepTimer({...off,mode:'duration',minutes:15,remaining:5,revision:1,sample:100});
 const expired=parseSleepTimer({...off,revision:2,sample:106,reason:'expired'});
 assert.equal(acceptSleepTimer(expired,active),expired);
 assert.equal(acceptSleepTimer(active,parseSleepTimer({...active,sample:99,remaining:6})),active);
 assert.deepEqual(acceptSleepTimer(active,parseSleepTimer({...active,sample:101,remaining:4})).remaining,4);
 assert.equal(acceptSleepTimer(null,expired),expired);
});
test('countdown uses stable minute-second display including the last second',()=>{
 assert.equal(sleepTime(3600),'60:00');assert.equal(sleepTime(61),'1:01');assert.equal(sleepTime(1),'0:01');assert.equal(sleepTime(0),'0:00');
});
