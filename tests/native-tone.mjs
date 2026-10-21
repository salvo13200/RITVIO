import assert from 'node:assert/strict';

export const maxToneChunkBytes=256*1024;

export function originalTone(seconds=240){
  assert(Number.isInteger(seconds)&&seconds>=1&&seconds<=7320,'Controlled PCM duration must be 1–7320 seconds');
  const samples=seconds*8000,buffer=Buffer.alloc(44+samples*2);
  buffer.write('RIFF');buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(8000,24);buffer.writeUInt32LE(16000,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(samples*2,40);
  for(let sample=0;sample<samples;sample++)buffer.writeInt16LE(Math.round(Math.sin(sample*2*Math.PI*220/8000)*800),44+sample*2);
  return buffer;
}

// Bound each debugger message instead of serializing a whole hour-long WAV.
export function toneRangeResponse(wav,range,limit=maxToneChunkBytes){
  assert(Buffer.isBuffer(wav)&&wav.length>0);
  assert(Number.isSafeInteger(limit)&&limit>0&&limit<=maxToneChunkBytes);
  const base={'accept-ranges':'bytes','access-control-allow-origin':'*'};
  const reject=()=>({status:416,headers:{...base,'content-range':`bytes */${wav.length}`},body:Buffer.alloc(0)});
  if(range===undefined){
    if(wav.length>limit)return {status:400,headers:base,body:Buffer.from('Large controlled PCM requires byte ranges')};
    return {status:200,headers:{...base,'content-length':String(wav.length)},body:wav};
  }
  const match=/^bytes=(\d*)-(\d*)$/.exec(range);
  if(!match||(!match[1]&&!match[2]))return reject();
  const first=Number(match[1]),last=Number(match[2]);
  if(!Number.isSafeInteger(first)||!Number.isSafeInteger(last))return reject();
  const start=match[1]?first:Math.max(0,wav.length-last);
  const requestedEnd=match[1]?(match[2]?last:wav.length-1):wav.length-1;
  if((!match[1]&&last===0)||start>=wav.length||requestedEnd<start)return reject();
  const end=Math.min(requestedEnd,wav.length-1,start+limit-1);
  return {status:206,headers:{...base,'content-range':`bytes ${start}-${end}/${wav.length}`,'content-length':String(end-start+1)},body:wav.subarray(start,end+1)};
}
