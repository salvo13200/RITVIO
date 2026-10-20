import assert from 'node:assert/strict';

export function originalStereoTone(seconds=24){
  assert(Number.isInteger(seconds)&&seconds>=12&&seconds<=60);
  const rate=48000,frames=seconds*rate,data=Buffer.alloc(44+frames*4);
  data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(2,22);data.writeUInt32LE(rate,24);data.writeUInt32LE(rate*4,28);data.writeUInt16LE(4,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(frames*4,40);
  for(let frame=0;frame<frames;frame++)for(let channel=0;channel<2;channel++)data.writeInt16LE(Math.round(Math.sin(frame*2*Math.PI*(channel?330:220)/rate)*800),44+frame*4+channel*2);
  return data;
}

/** Record only original oscillators, never a microphone or external media. */
export async function recordNativeOpus(page,seconds=24){
  assert(Number.isInteger(seconds)&&seconds>=12&&seconds<=60);
  await page.evaluate(seconds=>{
    window.__nativeOriginalRecording={done:false,error:null};
    const button=document.createElement('button');button.id='native-original-record';button.textContent='Record original test tone';button.style.cssText='position:fixed;z-index:2147483647;top:30px;left:30px';
    button.onclick=async()=>{
      let context,stream,oscillators=[];
      try{
        const mimeType='audio/webm;codecs=opus';if(!MediaRecorder.isTypeSupported(mimeType))throw Error('Opus recording unavailable');
        context=new AudioContext({sampleRate:48000});await context.resume();
        const destination=context.createMediaStreamDestination(),merge=context.createChannelMerger(2);merge.connect(destination);stream=destination.stream;
        for(let channel=0;channel<2;channel++){const oscillator=context.createOscillator(),gain=context.createGain();oscillator.frequency.value=channel?330:220;gain.gain.value=800/32768;oscillator.connect(gain);gain.connect(merge,0,channel);oscillator.start();oscillators.push(oscillator);}
        const chunks=[],recorder=new MediaRecorder(stream,{mimeType,audioBitsPerSecond:128000});
        const stopped=new Promise((resolve,reject)=>{recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};recorder.onstop=resolve;recorder.onerror=()=>reject(Error('Original Opus recorder failed'));});
        recorder.start();await new Promise(resolve=>setTimeout(resolve,seconds*1000));recorder.stop();await stopped;
        const bytes=await new Blob(chunks,{type:mimeType}).arrayBuffer(),decoded=await context.decodeAudioData(bytes.slice(0));
        window.__nativeOriginalRecording={done:true,error:null,bytes:Array.from(new Uint8Array(bytes)),mimeType,sampleRate:decoded.sampleRate,channels:decoded.numberOfChannels,duration:decoded.duration};
      }catch(error){window.__nativeOriginalRecording={done:true,error:String(error)};}
      finally{for(const oscillator of oscillators)oscillator.stop();for(const track of stream?.getTracks()??[])track.stop();await context?.close();button.remove();}
    };
    document.body.append(button);
  },seconds);
  await page.locator('#native-original-record').click();
  const deadline=Date.now()+(seconds+15)*1000;let result;
  while(Date.now()<deadline){result=await page.evaluate(()=>window.__nativeOriginalRecording);if(result.done)break;await new Promise(resolve=>setTimeout(resolve,250));}
  assert(result?.done&&!result.error,result?.error??'Original Opus recording timed out');
  const bytes=Buffer.from(result.bytes);assert(bytes.includes(Buffer.from('A_OPUS')));assert.equal(result.channels,2);assert.equal(result.sampleRate,48000);assert(Math.abs(result.duration-seconds)<1);
  return {bytes,metadata:{mimeType:result.mimeType,sampleRate:result.sampleRate,channels:result.channels,duration:result.duration,requestedBitsPerSecond:128000}};
}
