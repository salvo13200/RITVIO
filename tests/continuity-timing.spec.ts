import {test,expect,type Page} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import Fastify from 'fastify';
import {tracks,radioTracks,toneWav} from './fixtures';
import {createAudioStreams} from '../apps/api/audio-stream';
import type {Playback} from '../packages/domain/index';
const base='http://127.0.0.1:5199';
async function metrics(page:Page){return page.evaluate(async()=>{const path='/src/playback-metrics.ts';return(await import(path)).playbackMetrics();});}
async function audioState(page:Page){return page.evaluate(async()=>{const path='/src/player.tsx';const a=(await import(path)).audio;return{position:a.currentTime,paused:a.paused,seeking:a.seeking,ready:a.readyState,ranges:Array.from({length:a.buffered.length},(_,i)=>[a.buffered.start(i),a.buffered.end(i)])};});}

test('continuity: record separate cold, unprepared, prepared, resume and buffered-seek stages',async({page,request})=>{
 await request.post(base+'/test-reset-library');await page.addInitScript(()=>{localStorage.setItem('ritvio.language.v1',JSON.stringify({schema:1,preference:'en'}));window.__RITVIO_TEST_CONFIG__={baseUrl:'http://127.0.0.1:5199',token:'test-token-only'};});
 const descriptors:{background:boolean}[]=[];
 await page.route('**/v1/media/*/playback**',async route=>{
   descriptors.push({background:route.request().url().includes('prepare=true')});
   const response=await route.fetch(),descriptor=await response.json();descriptor.expiresAt=new Date(Date.now()+600000).toISOString();await route.fulfill({response,json:descriptor});
 });
 await page.goto('/');const searchStart=performance.now();await page.getByRole('textbox',{name:'Search music',exact:true}).fill('Musica test');await expect(page.getByRole('button',{name:'Play Secondo brano',exact:true})).toBeVisible();const searchToResultMs=performance.now()-searchStart;
 await page.getByRole('button',{name:'Play Secondo brano',exact:true}).click();await expect.poll(async()=>(await metrics(page)).at(-1)?.outcome).toBe('playing');const cold=(await metrics(page)).at(-1)!;
 await expect.poll(()=>descriptors.filter(d=>d.background).length).toBe(1);await expect.poll(async()=>(await audioState(page)).position).toBeGreaterThan(1.5);
 const requestsBefore=descriptors.length;await page.getByRole('button',{name:'Next track',exact:true}).click();await expect.poll(async()=>(await metrics(page)).at(-1)?.prepared).toBe(true);await expect.poll(async()=>(await metrics(page)).at(-1)?.outcome).toBe('playing');const prepared=(await metrics(page)).at(-1)!;expect(descriptors).toHaveLength(requestsBefore);
 await page.getByRole('button',{name:'Pause',exact:true}).click();await expect.poll(async()=>(await audioState(page)).paused).toBe(true);const requestsBeforeResume=descriptors.length;
 await page.getByRole('button',{name:'Play',exact:true}).click();await expect.poll(async()=>(await metrics(page)).at(-1)?.mode).toBe('resume');await expect.poll(async()=>(await metrics(page)).at(-1)?.outcome).toBe('playing');const resume=(await metrics(page)).at(-1)!;expect(descriptors).toHaveLength(requestsBeforeResume);
 await page.getByRole('button',{name:'Pause',exact:true}).click();await expect.poll(async()=>(await audioState(page)).ranges.some(([start,end])=>start<=3&&end>=3)).toBe(true);
 await page.evaluate(async()=>{const p='/src/player.tsx';(await import(p)).seek(3);});await expect.poll(async()=>(await metrics(page)).at(-1)?.outcome).toBe('seeked');const bufferedSeek=(await metrics(page)).at(-1)!;expect(bufferedSeek.bufferedSeekHint).toBe(true);expect((await audioState(page)).paused).toBe(true);
 await page.evaluate(async track=>{const p='/src/store.ts';(await import(p)).usePlayer.getState().play(track,[track]);},radioTracks[0]);await expect.poll(async()=>(await metrics(page)).at(-1)?.mode).toBe('new');await expect.poll(async()=>(await metrics(page)).at(-1)?.outcome).toBe('playing');const unprepared=(await metrics(page)).at(-1)!;expect(unprepared.prepared).toBe(false);
 const report={conditions:'One observation per phase in a clean Edge browser context, local fixture API and original 12-second generated WAV. Search includes UI debounce and DOM arrival. Cold means first playback in this browser, not native process startup. Other stages are media events, not audible output. No real-provider or phone speed claim.',searchToResultMs,phases:{cold,prepared,resume,bufferedSeek,unprepared},descriptorCalls:descriptors};
 expect(JSON.stringify(report)).not.toMatch(/googlevideo|https?:|testmusic|radiotest|token/i);
 await writeFile('test-results/continuity/timing-matrix.json',JSON.stringify(report,null,2));
});

test('continuity: an out-of-buffer seek waits for data and completes without mistaking assignment for completion',async({page})=>{
 const wav=toneWav(80),app=Fastify(),calls:string[]=[];
 let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
 const streams=createAudioStreams(app,async(_url,options)=>{
   const range=(options?.headers as{Range?:string})?.Range??'';calls.push(range);
   const match=/^bytes=(\d+)-(\d*)$/.exec(range),start=Number(match?.[1]??0),end=Math.min(match?.[2]?Number(match[2]):wav.length-1,wav.length-1);
   if(start>=524288)await gate;
   if(start>=wav.length)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${wav.length}`}});
   return new Response(wav.subarray(start,end+1),{status:206,headers:{'Content-Type':'audio/wav','Content-Length':String(end-start+1),'Content-Range':`bytes ${start}-${end}/${wav.length}`}});
 });
 app.get('/',async(_req,reply)=>reply.type('text/html').send('<!doctype html><html lang="en"><title>Controlled generated audio</title><body>Controlled buffer timing</body></html>'));
 try{
   const descriptor:Playback={mode:'youtube-audio-resolver',accessMethod:'unofficial-extraction',provider:'youtube',videoId:'testmusic01',url:'https://fixture.googlevideo.com/continuity-tone',expiresAt:new Date(Date.now()+600000).toISOString(),capabilities:{background:true,seek:true,volume:true,equalizer:false,offline:false}};
   await streams.prepare(descriptor,new AbortController().signal);const ticket=streams.issue(descriptor),origin=await app.listen({host:'127.0.0.1',port:0});
   await page.goto(origin);await page.evaluate(async url=>{const a=new Audio(url);a.preload='auto';a.volume=0;(window as any).__continuity={a,started:0,seekedMs:null,playingMs:null};a.addEventListener('seeked',()=>{if((window as any).__continuity.started)(window as any).__continuity.seekedMs=performance.now()-(window as any).__continuity.started;});a.addEventListener('playing',()=>{if((window as any).__continuity.started)(window as any).__continuity.playingMs=performance.now()-(window as any).__continuity.started;});await a.play();},ticket.url);
   await expect.poll(()=>page.evaluate(()=>(window as any).__continuity.a.currentTime)).toBeGreaterThan(.1);
   const inside=await page.evaluate(()=>{const a=(window as any).__continuity.a as HTMLAudioElement;return Array.from({length:a.buffered.length},(_,i)=>[a.buffered.start(i),a.buffered.end(i)]).some(([s,e])=>s<=60&&e>=60);});expect(inside).toBe(false);
   await page.evaluate(()=>{const s=(window as any).__continuity;s.started=performance.now();s.a.currentTime=60;});
   expect(await page.evaluate(()=>(window as any).__continuity.seekedMs)).toBeNull();release();
   await expect.poll(()=>page.evaluate(()=>(window as any).__continuity.seekedMs)).not.toBeNull();await expect.poll(()=>page.evaluate(()=>(window as any).__continuity.a.currentTime)).toBeGreaterThan(60.1);
   const report=await page.evaluate(()=>{const s=(window as any).__continuity;return{targetWasBuffered:false,seekedMs:s.seekedMs,playingMs:s.playingMs,mediaError:s.a.error?.code??null};});expect(report.mediaError).toBeNull();
   await writeFile('test-results/continuity/unbuffered-seek.json',JSON.stringify({conditions:'Original 80-second WAV, prepared 512 KiB prefix and gated origin remainder; browser media events, not speaker timing or a real network benchmark.',...report,upstreamRequests:calls.length,buffer:streams.diagnostics()},null,2));
 }finally{release();await page.evaluate(()=>(window as any).__continuity?.a.pause()).catch(()=>{});app.server.closeAllConnections();await app.close();}
});

test.beforeAll(async()=>{await mkdir('test-results/continuity',{recursive:true});});
