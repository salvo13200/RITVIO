import test from 'node:test';
import assert from 'node:assert/strict';
import {parseLyrics,activeLyricsLine,lyricsByteLimit} from '../packages/domain/lyrics';

test('plain text preserves paragraphs and treats markup as literal data',()=>{
  const parsed=parseLyrics('\uFEFF  Testo originale\r\n\r\n<div>Seconda riga</div>  ','txt');
  assert.equal(parsed.plainText,'Testo originale\n\n<div>Seconda riga</div>');
  assert.deepEqual(parsed.lines,[]);assert.equal(parsed.offsetMs,0);
});
test('LRC sorts multiple timestamps, fractions and blank instrumental markers',()=>{
  const parsed=parseLyrics('[ar:Artista di prova]\n[00:12.345]Ultima riga\n[00:03.1][00:07.25]Riga ripetuta\n[00:09]\n[00:00:50]Introduzione','lrc');
  assert.deepEqual(parsed.lines,[{at:.5,text:'Introduzione'},{at:3.1,text:'Riga ripetuta'},{at:7.25,text:'Riga ripetuta'},{at:9,text:''},{at:12.345,text:'Ultima riga'}]);
  assert.equal(activeLyricsLine(parsed.lines,0),-1);assert.equal(activeLyricsLine(parsed.lines,7.25),2);assert.equal(activeLyricsLine(parsed.lines,10),3);
  assert.equal(activeLyricsLine(parsed.lines,1),0);assert.equal(activeLyricsLine(parsed.lines,100),4);
});
test('LRC offsets, ties and backward seeks keep the active line deterministic',()=>{
  const parsed=parseLyrics('[offset:+1500]\n[00:02]Prima\n[00:05]Seconda\n[00:05]Terza','lrc');
  assert.equal(parsed.offsetMs,1500);assert.equal(activeLyricsLine(parsed.lines,.5,parsed.offsetMs),0);
  assert.equal(activeLyricsLine(parsed.lines,3.5,parsed.offsetMs),2);assert.equal(activeLyricsLine(parsed.lines,0,parsed.offsetMs),-1);
  assert.equal(activeLyricsLine(parsed.lines,NaN),-1);assert.equal(activeLyricsLine(parsed.lines,2,Infinity),-1);
  assert.equal(parseLyrics('[offset:-750]\n[00:01]Riga','lrc').offsetMs,-750);
});
test('empty, binary, oversized and unusable LRC inputs fail before storage',()=>{
  for(const value of ['','  ','test\0test'])assert.throws(()=>parseLyrics(value,'txt'),/INVALID_LYRICS/);
  assert.throws(()=>parseLyrics('é'.repeat(lyricsByteLimit/2+1),'txt'),/LYRICS_TOO_LARGE/);
  for(const value of ['[ti:Titolo]','[00:99]Secondi non validi','Testo senza tempi','[00:01]'])assert.throws(()=>parseLyrics(value,'lrc'),/INVALID_LRC/);
  assert.throws(()=>parseLyrics('[9999:00]Fuori intervallo','lrc'),/INVALID_LYRICS/);
});
