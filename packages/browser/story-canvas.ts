import type {Track} from '../domain/index';
import {storySize,storyBrand} from '../domain/story-sharing';

export type StoryMode='track'|'lyrics';
type Picture=ImageBitmap;
const font='"Ancizar Sans", sans-serif';
function rounded(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
function cover(ctx:CanvasRenderingContext2D,image:Picture,x:number,y:number,w:number,h:number){
  const scale=Math.max(w/image.width,h/image.height),sw=w/scale,sh=h/scale;
  ctx.drawImage(image,(image.width-sw)/2,(image.height-sh)/2,sw,sh,x,y,w,h);
}
function palette(image:Picture|null):[number,number,number]{
  if(!image)return [86,65,126];
  const sample=document.createElement('canvas');sample.width=sample.height=24;
  const ctx=sample.getContext('2d',{willReadFrequently:true})!;cover(ctx,image,0,0,24,24);
  const pixels=ctx.getImageData(0,0,24,24).data;let r=0,g=0,b=0,total=0;
  for(let i=0;i<pixels.length;i+=4){const max=Math.max(pixels[i],pixels[i+1],pixels[i+2]),min=Math.min(pixels[i],pixels[i+1],pixels[i+2]),weight=1+(max-min)/32;r+=pixels[i]*weight;g+=pixels[i+1]*weight;b+=pixels[i+2]*weight;total+=weight;}
  return [r/total,g/total,b/total].map(value=>Math.round(value)) as [number,number,number];
}
function wrap(ctx:CanvasRenderingContext2D,text:string,width:number):string[]{
  const result:string[]=[];
  for(const source of text.split('\n')){
    if(!source){result.push('');continue;}
    let line='';
    // Character-level fit also handles a long single word, emoji, CJK and nonbreaking spaces.
    for(const character of Array.from(source)){
      if(line&&ctx.measureText(line+character).width>width){
        const space=line.lastIndexOf(' ');
        if(space>line.length*.45){result.push(line.slice(0,space));line=line.slice(space+1)+character;}
        else{result.push(line);line=character;}
      }else line+=character;
    }result.push(line.trimEnd());
  }return result;
}
function label(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,width:number,size:number,maxLines:number,weight=600){
  ctx.font=`${weight} ${size}px ${font}`;const lines=wrap(ctx,text,width),shown=lines.slice(0,maxLines);
  if(lines.length>maxLines){let last=shown.at(-1)!;while(last&&ctx.measureText(last+'…').width>width)last=Array.from(last).slice(0,-1).join('');shown[shown.length-1]=last+'…';}
  shown.forEach((line,i)=>ctx.fillText(line,x,y+i*size*1.16));return {height:shown.length*size*1.16,truncated:lines.length>maxLines};
}
function placeholder(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number){
  ctx.fillStyle='#272030';ctx.fillRect(x,y,w,h);ctx.strokeStyle='#d4b8f4';ctx.lineWidth=10;ctx.lineCap='round';
  const center=x+w/2;[36,68,100,68,36].forEach((height,i)=>{ctx.beginPath();ctx.moveTo(center+(i-2)*26,y+h/2-height/2);ctx.lineTo(center+(i-2)*26,y+h/2+height/2);ctx.stroke();});
}
function footer(ctx:CanvasRenderingContext2D,x:number,y:number,width:number){
  ctx.strokeStyle='rgba(255,255,255,.2)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y-42);ctx.lineTo(x+width,y-42);ctx.stroke();
  ctx.font=`600 36px ${font}`;const nameWidth=ctx.measureText(storyBrand.name).width,markWidth=52,left=x+(width-nameWidth-markWidth-18)/2;
  ctx.fillStyle='#d9bafa';[18,32,44,32,18].forEach((height,i)=>{rounded(ctx,left+i*10,y-height/2,5,height,2.5);ctx.fill();});
  ctx.fillStyle='#eee4ff';ctx.fillText(storyBrand.name,left+markWidth+18,y+12);
}
export async function renderStory(canvas:HTMLCanvasElement,track:Pick<Track,'title'|'artist'>,image:Picture|null,mode:StoryMode,excerpt:string){
  await document.fonts.ready;canvas.width=storySize.width;canvas.height=storySize.height;
  const ctx=canvas.getContext('2d')!;ctx.textBaseline='top';const [r,g,b]=palette(image);
  ctx.fillStyle=`rgb(${Math.max(25,r*.58)},${Math.max(22,g*.58)},${Math.max(35,b*.68)})`;ctx.fillRect(0,0,1080,1920);
  if(image&&mode==='track'){ctx.save();ctx.filter='blur(70px)';ctx.globalAlpha=.65;cover(ctx,image,-120,-120,1320,2160);ctx.restore();}
  const shade=ctx.createLinearGradient(0,0,1080,1920);shade.addColorStop(0,'rgba(14,11,24,.2)');shade.addColorStop(1,'rgba(14,11,24,.65)');ctx.fillStyle=shade;ctx.fillRect(0,0,1080,1920);
  ctx.font=`700 64px ${font}`;const titleHeight=Math.min(3,wrap(ctx,track.title,656).length)*64*1.16;
  ctx.font=`400 42px ${font}`;const artistHeight=Math.min(2,wrap(ctx,track.artist,656).length)*42*1.16;
  const x=mode==='track'?160:90,w=mode==='track'?760:900;
  let lyricSize=72,lyricLines:string[]=[],lyricHeight=0,creditHeight=112;
  if(mode==='lyrics'){
    ctx.font=`700 24px ${font}`;
    if(wrap(ctx,excerpt,w-120).length*24*1.22>1100)throw Error('STORY_TEXT_DOES_NOT_FIT');
    for(;lyricSize>=24;lyricSize-=2){
      ctx.font=`700 ${lyricSize}px ${font}`;lyricLines=wrap(ctx,excerpt,w-120);
      if(lyricLines.length*lyricSize*1.22<=1100)break;
    }
    lyricHeight=lyricLines.length*lyricSize*1.22;
    ctx.font=`700 40px ${font}`;const titleLines=Math.min(2,wrap(ctx,track.title,w-260).length);
    ctx.font=`400 30px ${font}`;const artistLines=Math.min(1,wrap(ctx,track.artist,w-260).length);
    creditHeight=Math.max(112,10+titleLines*40*1.16+artistLines*30*1.16);
  }
  // The canvas stays 9:16. Only the inner card grows with the actual wrapped
  // lyric and credit rows; a short excerpt never reserves a full quote page.
  const h=mode==='track'?798+titleHeight+artistHeight+160:90+lyricHeight+72+creditHeight+147,y=(1920-h)/2;
  ctx.save();ctx.shadowColor='rgba(0,0,0,.4)';ctx.shadowOffsetY=24;ctx.shadowBlur=64;rounded(ctx,x,y,w,h,36);ctx.fillStyle='#15121d';ctx.fill();ctx.restore();
  let metadataTruncated=false;
  ctx.save();rounded(ctx,x,y,w,h,36);ctx.clip();
  if(mode==='track'){
    ctx.save();rounded(ctx,x+40,y+40,680,680,22);ctx.clip();if(image)cover(ctx,image,x+40,y+40,680,680);else placeholder(ctx,x+40,y+40,680,680);ctx.restore();
    ctx.fillStyle='#fff';const title=label(ctx,track.title,x+52,y+778,656,64,3,700);
    ctx.fillStyle='#ded5ec';const artist=label(ctx,track.artist,x+52,y+798+title.height,656,42,2,400);
    metadataTruncated=title.truncated||artist.truncated;
  }else{
    // Keep photographs square in the credit row. The lyric surface uses only
    // their sampled palette, so a landscape thumbnail is never enlarged vertically.
    const surface=ctx.createLinearGradient(x,y,x+w,y+h);
    surface.addColorStop(0,`rgb(${Math.round(r*.46+16)},${Math.round(g*.46+14)},${Math.round(b*.46+20)})`);
    surface.addColorStop(1,`rgb(${Math.round(r*.2+12)},${Math.round(g*.2+10)},${Math.round(b*.2+16)})`);
    ctx.fillStyle=surface;ctx.fillRect(x,y,w,h);
    ctx.font=`700 ${lyricSize}px ${font}`;ctx.fillStyle='#fff';
    lyricLines.forEach((line,i)=>ctx.fillText(line,x+60,y+90+i*lyricSize*1.22));
    const metaY=y+90+lyricHeight+72;
    ctx.save();rounded(ctx,x+60,metaY,112,112,12);ctx.clip();if(image)cover(ctx,image,x+60,metaY,112,112);else placeholder(ctx,x+60,metaY,112,112);ctx.restore();
    ctx.fillStyle='#fff';const title=label(ctx,track.title,x+200,metaY+3,w-260,40,2,700);
    ctx.fillStyle='#e4d9f0';const artist=label(ctx,track.artist,x+200,metaY+10+title.height,w-260,30,1,400);metadataTruncated=title.truncated||artist.truncated;
  }
  // Footer always occupies its own area, separate from song/lyric content.
  ctx.textBaseline='alphabetic';footer(ctx,x+60,y+h-70,w-120);ctx.restore();
  return {metadataTruncated,layout:{x,y,width:w,height:h,lyricRows:lyricLines.length,lyricFontSize:lyricSize}};
}
export function storyBlob(canvas:HTMLCanvasElement):Promise<Blob>{return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('PNG_EXPORT_FAILED')),'image/png'));}
