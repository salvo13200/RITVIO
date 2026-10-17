export type LyricsLine={at:number;text:string};
export type ParsedLyrics={plainText:string;lines:LyricsLine[];offsetMs:number};
export type LyricsFormat='txt'|'lrc';
export type LyricsDocument=ParsedLyrics&{provider:'lrclib'|'local';providerId:number|null;title:string;artist:string;fileName:string|null;instrumental:boolean;fetchedAt:string;licenseVerified:false|null};
export type LyricsResponse={status:'ready'|'instrumental'|'missing';document:LyricsDocument|null;cacheHit:boolean;savedChoice:boolean};
export type LyricsCandidate={id:number;title:string;artist:string;album:string;duration:number;instrumental:boolean;synced:boolean};
export const lyricsByteLimit=200_000;

// Pure parser shared by desktop and the future mobile client. Lyrics are data,
// never HTML; timestamps stay in seconds and offsets in milliseconds.
export function parseLyrics(input:string,format:LyricsFormat):ParsedLyrics{
  if(new TextEncoder().encode(input).length>lyricsByteLimit)throw new Error('LYRICS_TOO_LARGE');
  const text=input.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
  if(!text.trim()||text.includes('\0'))throw new Error('INVALID_LYRICS');
  if(format==='txt')return{plainText:text.trim(),lines:[],offsetMs:0};
  const lines:LyricsLine[]=[];let offsetMs=0;
  for(const row of text.split('\n')){
    const offset=row.trim().match(/^\[offset:([+-]?\d{1,7})\]$/i);
    if(offset){offsetMs=Math.max(-600_000,Math.min(600_000,Number(offset[1])));continue;}
    // Consume only consecutive timestamps at the start of each line. Multiple
    // tags repeat the same line, as in many chorus sections of real LRC files.
    let remaining=row.trimStart();const times:number[]=[];
    for(;;){
      const tag=remaining.match(/^\[(\d{1,4}):([0-5]\d)(?:[.:](\d{1,3}))?\]/);
      if(!tag)break;
      const at=Number(tag[1])*60+Number(tag[2])+Number((tag[3]??'0').padEnd(3,'0'))/1000;
      if(at>86400)throw new Error('INVALID_LYRICS');
      times.push(at);remaining=remaining.slice(tag[0].length);
    }
    for(const at of times)lines.push({at,text:remaining.trim()});
    if(lines.length>5000)throw new Error('LYRICS_TOO_LARGE');
  }
  if(!lines.some(line=>line.text))throw new Error('INVALID_LRC');
  lines.sort((a,b)=>a.at-b.at);
  return{plainText:lines.map(line=>line.text).join('\n'),lines,offsetMs};
}

// Positive LRC offset advances the text. Empty timed lines deliberately clear
// the previous lyric during instrumental passages; equal times use the last.
export function activeLyricsLine(lines:LyricsLine[],position:number,offsetMs=0):number{
  if(!Number.isFinite(position)||!Number.isFinite(offsetMs))return-1;
  const time=position+offsetMs/1000;let lo=0,hi=lines.length;
  while(lo<hi){const mid=(lo+hi)>>>1;if(lines[mid].at<=time)lo=mid+1;else hi=mid;}
  return lo-1;
}
