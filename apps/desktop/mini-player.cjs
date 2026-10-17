function cleanSnapshot(value){
  if(!value||typeof value!=='object')throw Error('Invalid mini-player state');
  const number=(v,max)=>typeof v==='number'&&Number.isFinite(v)?Math.max(0,Math.min(max,v)):0;
  return {title:String(value.title??'').slice(0,1000),artist:String(value.artist??'').slice(0,1000),videoId:/^[A-Za-z0-9_-]{11}$/.test(value.videoId??'')?value.videoId:null,
    position:number(value.position,31536000),duration:number(value.duration,31536000),volume:number(value.volume,1),playing:value.playing===true,muted:value.muted===true,loading:value.loading===true,
    canNext:value.canNext===true,canPrevious:value.canPrevious===true,error:typeof value.error==='string'?value.error.slice(0,500):null,theme:value.theme==='light'?'light':'dark',motion:value.motion==='essential'?'essential':'curated'};
}
function cleanCommand(value){
  if(!value||typeof value!=='object')throw Error('Invalid mini-player command');
  if(['toggle','next','previous','mute','restore','pin','close'].includes(value.type))return {type:value.type};
  if(['seek','volume'].includes(value.type)&&typeof value.value==='number'&&Number.isFinite(value.value))return {type:value.type,value:Math.max(0,Math.min(value.type==='volume'?1:31536000,value.value))};
  throw Error('Invalid mini-player command');
}
module.exports={cleanSnapshot,cleanCommand};
