import {test,expect} from '@playwright/test';
import Fastify from 'fastify';
import {createAudioStreams} from '../apps/api/audio-stream';
import {toneWav,tracks} from './fixtures';
import type {Playback} from '../packages/domain/index';

test('buffer transport: Chromium decodes a prepared partial response, continues beyond it and seeks both ways',async({page},info)=>{
  const wav=toneWav(80),requests:string[]=[],app=Fastify();
  const streams=createAudioStreams(app,async(_url,options)=>{
    const range=(options?.headers as {Range?:string})?.Range??'';requests.push(range);
    const match=/^bytes=(\d+)-(\d*)$/.exec(range);
    const start=Number(match?.[1]??0),end=Math.min(wav.length-1,match?.[2]?Number(match[2]):wav.length-1);
    if(start>=wav.length)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${wav.length}`}});
    return new Response(wav.subarray(start,end+1),{status:match?206:200,headers:{'Content-Type':'audio/wav','Content-Length':String(end-start+1),'Accept-Ranges':'bytes',...(match?{'Content-Range':`bytes ${start}-${end}/${wav.length}`}:{})}});
  });
  app.get('/',async(_request,reply)=>reply.type('text/html').send('<!doctype html><html><body><p>Original generated tone playback test</p></body></html>'));
  try{
    const descriptor:Playback={mode:'youtube-audio-resolver',accessMethod:'unofficial-extraction',provider:'youtube',videoId:tracks[0].videoId,url:'https://fixture.googlevideo.com/long-tone',expiresAt:new Date(Date.now()+600000).toISOString(),capabilities:{background:true,seek:true,volume:true,equalizer:false,offline:false}};
    await streams.prepare(descriptor,new AbortController().signal);expect(requests).toEqual(['bytes=0-524287']);
    const ticket=streams.issue(descriptor),base=await app.listen({host:'127.0.0.1',port:0});
    const hits:number[]=[];page.on('response',response=>{if(response.headers()['x-ritvio-buffer']==='hit')hits.push(response.status());});
    await page.goto(base);await page.evaluate(async url=>{const a=new Audio(url);a.preload='auto';a.volume=0;(window as any).__bufferAudio=a;await a.play();},ticket.url);
    const state=()=>page.evaluate(()=>{const a=(window as any).__bufferAudio as HTMLAudioElement;return {position:a.currentTime,duration:a.duration,paused:a.paused,error:a.error?.code??null};});
    await expect.poll(async()=>(await state()).position).toBeGreaterThan(.2);expect((await state()).duration).toBe(80);
    await page.evaluate(()=>{(window as any).__bufferAudio.currentTime=50;});
    await expect.poll(async()=>(await state()).position).toBeGreaterThan(50.2);
    await page.evaluate(()=>{(window as any).__bufferAudio.currentTime=5;});
    await expect.poll(async()=>(await state()).position).toBeGreaterThan(5.2);
    expect((await state()).error).toBeNull();expect(hits.length).toBeGreaterThan(0);expect(streams.diagnostics().bytes).toBeLessThanOrEqual(streams.diagnostics().maxBytes);
    await info.attach('buffer-transport.json',{body:JSON.stringify({upstreamRanges:requests,ramResponses:hits.length,buffer:streams.diagnostics()}),contentType:'application/json'});
  }finally{await page.evaluate(()=>{(window as any).__bufferAudio?.pause();}).catch(()=>{});app.server.closeAllConnections();await app.close();}
});
