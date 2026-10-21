type Part={start:number;bytes:Buffer};
type Entry={type:string;total:number;expires:number;bytes:number;parts:Map<number,Part>};
export type BufferedRange={start:number;end:number;total:number;type:string;chunks:Buffer[]};

/** Decoded neither here nor on disk: bounded, short-lived encoded audio in RAM. */
export class AudioRangeBuffer {
  private entries=new Map<string,Entry>();
  private lru=new Map<Part,Entry>();
  private bytes=0;private hits=0;private misses=0;
  constructor(private now=Date.now,readonly maxBytes=16*1024*1024,readonly perStreamBytes=8*1024*1024,private maxEntries=8){}
  private remove(entry:Entry,part:Part){entry.parts.delete(part.start);entry.bytes-=part.bytes.length;this.bytes-=part.bytes.length;this.lru.delete(part);}
  private insert(entry:Entry,start:number,bytes:Buffer){const part={start,bytes};entry.parts.set(start,part);entry.bytes+=bytes.length;this.bytes+=bytes.length;this.lru.set(part,entry);}
  private discard(key:string,entry:Entry){for(const part of [...entry.parts.values()])this.remove(entry,part);this.entries.delete(key);}
  private prune(){for(const [key,entry] of this.entries)if(entry.expires<=this.now())this.discard(key,entry);}
  put(key:string,expires:number,type:string,total:number,start:number,bytes:Uint8Array){
    this.prune();
    if(!Number.isFinite(expires)||expires<=this.now()||!Number.isSafeInteger(total)||total<=0||!Number.isSafeInteger(start)||start<0||start+bytes.length>total)return;
    let entry=this.entries.get(key);
    if(entry&&(entry.total!==total||entry.type!==type)){this.discard(key,entry);entry=undefined;}
    if(!entry){
      while(this.entries.size>=this.maxEntries){const [oldKey,oldEntry]=this.entries.entries().next().value!;this.discard(oldKey,oldEntry);}
      entry={type,total,expires,bytes:0,parts:new Map()};this.entries.set(key,entry);
    }
    entry.expires=Math.min(entry.expires,expires);this.entries.delete(key);this.entries.set(key,entry);
    // Small owned copies avoid retaining a large network ArrayBuffer through a slice.
    for(let offset=0;offset<bytes.length;offset+=65536){
      const position=start+offset,copy=Buffer.from(bytes.subarray(offset,Math.min(bytes.length,offset+65536))),end=position+copy.length;
      for(const part of [...entry.parts.values()])if(part.start<end&&part.start+part.bytes.length>position){
        const oldEnd=part.start+part.bytes.length;
        this.remove(entry,part);
        // Concurrent reads and seeks need not align with network fragment boundaries.
        // Retain both untouched sides, without keeping the replaced backing buffer alive.
        if(part.start<position)this.insert(entry,part.start,Buffer.from(part.bytes.subarray(0,position-part.start)));
        if(oldEnd>end)this.insert(entry,end,Buffer.from(part.bytes.subarray(end-part.start)));
      }
      this.insert(entry,position,copy);
      while(entry.bytes>this.perStreamBytes&&entry.parts.size)this.remove(entry,entry.parts.values().next().value!);
      while((this.bytes>this.maxBytes||this.lru.size>512)&&this.lru.size){const [old,owner]=this.lru.entries().next().value!;this.remove(owner,old);}
    }
  }
  /** A valid finite 206 range; the media element requests a following range as needed. */
  take(key:string,range:string,maxLength=512*1024):BufferedRange|undefined{
    this.prune();const entry=this.entries.get(key),match=/^bytes=(\d*)-(\d*)$/.exec(range);
    if(!entry||!match){this.misses++;return;}
    const start=match[1]?Number(match[1]):Math.max(0,entry.total-Number(match[2]));
    const end=Math.min(entry.total-1,match[1]&&match[2]?Number(match[2]):entry.total-1,start+maxLength-1);
    if(!Number.isSafeInteger(start)||start<0||end<start){this.misses++;return;}
    let cursor=start;const chunks:Buffer[]=[];
    for(const part of [...entry.parts.values()].sort((a,b)=>a.start-b.start)){
      if(part.start>cursor)break;
      const partEnd=part.start+part.bytes.length;
      if(partEnd<=cursor)continue;
      const length=Math.min(end+1,partEnd)-cursor;
      chunks.push(part.bytes.subarray(cursor-part.start,cursor-part.start+length));cursor+=length;
      this.lru.delete(part);this.lru.set(part,entry);entry.parts.delete(part.start);entry.parts.set(part.start,part);
      if(cursor>end)break;
    }
    if(cursor===start){this.misses++;return;}
    this.hits++;this.entries.delete(key);this.entries.set(key,entry);
    return {start,end:cursor-1,total:entry.total,type:entry.type,chunks};
  }
  clear(){this.entries.clear();this.lru.clear();this.bytes=0;}
  diagnostics(){this.prune();return {bytes:this.bytes,maxBytes:this.maxBytes,perStreamBytes:this.perStreamBytes,streams:this.entries.size,parts:this.lru.size,hits:this.hits,misses:this.misses};}
}
