import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import {deflateSync} from 'node:zlib';
const root='build-resources';await mkdir(root,{recursive:true});
const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect x="16" y="16" width="224" height="224" rx="56" fill="#C4B5FD"/><path d="M57 115v26m35-55v84m36-118v152m36-118v84m35-55v26" fill="none" stroke="#231D31" stroke-width="19" stroke-linecap="round"/></svg>\n';
await writeFile(root+'/icon.svg',svg);await mkdir('apps/client/public',{recursive:true});await copyFile(root+'/icon.svg','apps/client/public/app-icon.svg');
function rounded(x,y,left,top,width,height,radius){const cx=Math.max(left+radius,Math.min(x,left+width-radius));const cy=Math.max(top+radius,Math.min(y,top+height-radius));return (x-cx)**2+(y-cy)**2<=radius**2;}
function pixel(x,y){
  if(!rounded(x,y,16,16,224,224,56))return [0,0,0,0];
  const bars=[[57,115,141],[92,86,170],[128,52,204],[164,86,170],[199,115,141]];
  const waveform=bars.some(([center,top,bottom])=>rounded(x,y,center-9.5,top-9.5,19,bottom-top+19,9.5));
  return waveform?[35,29,49,255]:[196,181,253,255];
}
const crcTable=Uint32Array.from({length:256},(_,n)=>{let value=n;for(let bit=0;bit<8;bit++)value=(value&1)?0xedb88320^(value>>>1):value>>>1;return value>>>0;});
function crc(bytes){let value=0xffffffff;for(const byte of bytes)value=crcTable[(value^byte)&255]^(value>>>8);return (value^0xffffffff)>>>0;}
function chunk(name,bytes){const type=Buffer.from(name);const out=Buffer.alloc(bytes.length+12);out.writeUInt32BE(bytes.length);type.copy(out,4);bytes.copy(out,8);out.writeUInt32BE(crc(Buffer.concat([type,bytes])),bytes.length+8);return out;}
function png(size){
  const raw=Buffer.alloc(size*(size*4+1));
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const values=[0,0,0,0];let alpha=0;
    for(let sy=0;sy<4;sy++)for(let sx=0;sx<4;sx++){const color=pixel((x+(sx+.5)/4)*256/size,(y+(sy+.5)/4)*256/size);alpha+=color[3];for(let c=0;c<3;c++)values[c]+=color[c]*color[3];}
    const offset=y*(size*4+1)+1+x*4;for(let c=0;c<3;c++)raw[offset+c]=alpha?Math.round(values[c]/alpha):0;raw[offset+3]=Math.round(alpha/16);
  }
  const header=Buffer.alloc(13);header.writeUInt32BE(size);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
const sizes=[16,32,48,64,128,256];const images=sizes.map(png);const header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);let offset=header.length;
for(let i=0;i<sizes.length;i++){const entry=6+i*16;header[entry]=header[entry+1]=sizes[i]%256;header.writeUInt16LE(1,entry+4);header.writeUInt16LE(32,entry+6);header.writeUInt32LE(images[i].length,entry+8);header.writeUInt32LE(offset,entry+12);offset+=images[i].length;}
await writeFile(root+'/icon.ico',Buffer.concat([header,...images]));await writeFile(root+'/icon.png',images.at(-1));console.log('Icona SVG, PNG e ICO multirisoluzione pronta.');
await copyFile(root+'/icon.png','apps/client/public/app-icon.png');
