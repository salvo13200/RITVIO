import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {inflateSync,deflateSync} from 'node:zlib';
import path from 'node:path';

/** Derive Apple's opaque 1024px icon from the project's existing RGBA icon. */
export async function prepareIOSIcon(root) {
 const input=await readFile(path.join(root,'build-resources/icon.png'));
 const width=input.readUInt32BE(16),height=input.readUInt32BE(20);
 if(input.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||input[24]!==8||input[25]!==6||width!==256||height!==256)throw Error('Unexpected source icon format');
 const chunks=[];
 for(let offset=8;offset<input.length;){const length=input.readUInt32BE(offset),name=input.toString('ascii',offset+4,offset+8);if(name==='IDAT')chunks.push(input.subarray(offset+8,offset+8+length));offset+=length+12;}
 const pixels=inflateSync(Buffer.concat(chunks)),stride=width*4+1;
 if(pixels.length!==stride*height||Array.from({length:height},(_,y)=>pixels[y*stride]).some(value=>value!==0))throw Error('Source icon uses unsupported PNG filters');
 const size=1024,raw=Buffer.alloc(size*(size*3+1)),background=[15,17,23];
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const px=Math.min(width-1,Math.floor(x*width/size)),py=Math.min(height-1,Math.floor(y*height/size)),source=py*stride+1+px*4,alpha=pixels[source+3]/255,target=y*(size*3+1)+1+x*3;
  for(let c=0;c<3;c++)raw[target+c]=Math.round(pixels[source+c]*alpha+background[c]*(1-alpha));
 }
 const table=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
 function chunk(type,data){const tag=Buffer.from(type),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);tag.copy(out,4);data.copy(out,8);let crc=0xffffffff;for(const byte of Buffer.concat([tag,data]))crc=table[(crc^byte)&255]^(crc>>>8);out.writeUInt32BE((crc^0xffffffff)>>>0,data.length+8);return out;}
 const header=Buffer.alloc(13);header.writeUInt32BE(size);header.writeUInt32BE(size,4);header[8]=8;header[9]=2;
 const target=path.join(root,'apps/mobile/ios/App/App/Assets.xcassets/AppIcon.appiconset/RITVIO.png');
 await mkdir(path.dirname(target),{recursive:true});await writeFile(target,Buffer.concat([input.subarray(0,8),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));
 return target;
}
