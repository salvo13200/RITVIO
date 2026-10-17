import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

/** Reject textual provenance/EXIF containers, including embedded AI prompts. */
export function imageMetadataIssue(bytes){
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){
    for(let offset=8;offset<bytes.length;){
      if(offset+12>bytes.length)return 'truncated PNG';
      const length=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8);
      if(offset+12+length>bytes.length)return 'invalid PNG chunk size';
      if(['tEXt','zTXt','iTXt','eXIf','caBX'].includes(type))return `embedded image metadata: ${type}`;
      offset+=length+12;
    }
    return null;
  }
  if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'){
    if(bytes.readUInt32LE(4)+8!==bytes.length)return 'invalid WebP size';
    for(let offset=12;offset<bytes.length;){
      if(offset+8>bytes.length)return 'truncated WebP';
      const type=bytes.toString('ascii',offset,offset+4),size=bytes.readUInt32LE(offset+4);
      if(offset+8+size+(size%2)>bytes.length)return 'invalid WebP chunk size';
      if(!['VP8 ','VP8L','VP8X','ALPH'].includes(type))return `embedded image metadata or unsupported chunk: ${type.trim()}`;
      offset+=8+size+(size%2);
    }
    return null;
  }
  return 'unsupported image container';
}

export async function checkArtwork(root){
  const manifest=JSON.parse(await readFile(path.join(root,'third-party/artwork.json'),'utf8'));
  if(manifest.schema!==1||manifest.files.length!==7)throw Error('Expected seven documented project artwork files');
  let bytes=0;
  for(const record of manifest.files){
    if(!/^(apps\/client\/public|tests\/fixtures)\/artwork\/[a-z]+\.webp$/.test(record.file))throw Error('Invalid artwork path');
    const data=await readFile(path.join(root,record.file)),issue=imageMetadataIssue(data);
    if(issue)throw Error(`${record.file}: ${issue}`);
    if(record.bytes!==data.length)throw Error(`Artwork inventory size mismatch: ${record.file}`);
    bytes+=data.length;
  }
  return {files:manifest.files.length,bytes,metadata:'absent'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  console.log(JSON.stringify(await checkArtwork(path.resolve(import.meta.dirname,'..'))));
}
