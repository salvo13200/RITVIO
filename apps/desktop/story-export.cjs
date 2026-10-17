const {inflateSync}=require('node:zlib');
const limit=8_000_000;
function crc32(buffer){let crc=0xffffffff;for(const byte of buffer){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function validateStoryPng(value){
  if(!(value instanceof Uint8Array)||value.byteLength<60||value.byteLength>limit)throw Error('Immagine PNG non valida.');
  const bytes=Buffer.from(value);
  if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('Immagine PNG non valida.');
  let offset=8,header=false,ended=false;const data=[];
  while(offset+12<=bytes.length){
    const length=bytes.readUInt32BE(offset),end=offset+12+length;
    if(end>bytes.length)throw Error('Immagine PNG incompleta.');
    const type=bytes.toString('ascii',offset+4,offset+8),chunk=bytes.subarray(offset+8,offset+8+length);
    if(crc32(bytes.subarray(offset+4,offset+8+length))!==bytes.readUInt32BE(offset+8+length))throw Error('Immagine PNG danneggiata.');
    if(!header&&type!=='IHDR')throw Error('Immagine PNG non valida.');
    if(type==='IHDR'){
      if(header||length!==13||chunk.readUInt32BE(0)!==1080||chunk.readUInt32BE(4)!==1920||chunk[8]!==8||![2,6].includes(chunk[9])||chunk[10]||chunk[11]||chunk[12])throw Error('La Story deve essere 1080 × 1920.');
      header=true;
    }else if(type==='IDAT')data.push(chunk);
    else if(type==='IEND'){if(length||end!==bytes.length)throw Error('Immagine PNG non valida.');ended=true;break;}
    else if(type[0]===type[0].toUpperCase())throw Error('Formato PNG non supportato.');
    offset=end;
  }
  if(!ended||!data.length)throw Error('Immagine PNG incompleta.');
  const channels=bytes[25]===6?4:3,stride=1080*channels+1,expected=stride*1920;
  const decoded=inflateSync(Buffer.concat(data),{maxOutputLength:expected});
  if(decoded.length!==expected)throw Error('Immagine PNG incompleta.');
  for(let row=0;row<1920;row++)if(decoded[row*stride]>4)throw Error('Immagine PNG danneggiata.');
  return bytes;
}
function storyFilename(title){
  if(typeof title!=='string'||title.length>1000)throw Error('Titolo non valido.');
  const safe=title.replace(/[<>:"/\\|?*\x00-\x1f]/g,' ').replace(/\s+/g,' ').trim().slice(0,80).replace(/[ .]+$/,'')||'brano';
  return `RITVIO - ${safe}.png`;
}
module.exports={validateStoryPng,storyFilename};
