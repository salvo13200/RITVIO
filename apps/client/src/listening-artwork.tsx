import {useContext,useEffect,useState,type CSSProperties} from 'react';
import type {Track} from '../../../packages/domain/index';
import {ArtworkContext} from './artwork-context';
import {Cover} from './ui-controls';
import {AnimatedCover} from './animated-cover';
import {Plus} from 'lucide-react';
import {useShallow} from 'zustand/react/shallow';
import {usePlayer} from './store';
import {formatTime} from '../../../packages/domain/index';
import {t} from './i18n';
import {upcomingTracks} from '../../../packages/domain/listening';

const tones=new Map<string,string|null>();
function readTone(source:string):Promise<string|null>{
  if(tones.has(source))return Promise.resolve(tones.get(source)!);
  return new Promise(resolve=>{
    const image=new Image();image.crossOrigin='anonymous';
    const timer=window.setTimeout(()=>finish(null),4000);
    let complete=false;
    const finish=(tone:string|null)=>{if(complete)return;complete=true;clearTimeout(timer);image.onload=image.onerror=null;tones.set(source,tone);if(tones.size>32)tones.delete(tones.keys().next().value!);resolve(tone);};
    image.onerror=()=>finish(null);
    image.onload=()=>{
      try{
        const canvas=document.createElement('canvas');canvas.width=canvas.height=16;
        const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)return finish(null);
        context.drawImage(image,0,0,16,16);const pixels=context.getImageData(0,0,16,16).data;
        let red=0,green=0,blue=0,weight=0;
        for(let i=0;i<pixels.length;i+=4){const hi=Math.max(pixels[i],pixels[i+1],pixels[i+2]),lo=Math.min(pixels[i],pixels[i+1],pixels[i+2]);if(pixels[i+3]<128||hi<40)continue;const w=1+(hi-lo)/128;red+=pixels[i]*w;green+=pixels[i+1]*w;blue+=pixels[i+2]*w;weight+=w;}
        finish(weight?`rgb(${Math.round(red/weight)}, ${Math.round(green/weight)}, ${Math.round(blue/weight)})`:null);
      }catch{finish(null);}
    };
    image.src=source;
  });
}

export function useArtworkTone(track?:Track){
  const artwork=useContext(ArtworkContext);const source=track?(artwork['current-cover']||track.thumbnail):null;
  const [tone,setTone]=useState<string|null>(null);
  useEffect(()=>{let current=true;if(!source){setTone(null);return;}void readTone(source).then(value=>{if(current)setTone(value);});return()=>{current=false;};},[source]);
  return tone;
}
export function ListeningArtwork({track}:{track?:Track}){
  const tone=useArtworkTone(track);
  return <div className="now-artwork" data-atmosphere={tone?'cover':'fallback'} style={{'--artwork-tone':tone??'transparent'} as CSSProperties}><AnimatedCover slot="current-cover" track={track} className={`large-cover ${!track?'empty-cover':''}`}/></div>;
}

export function UpcomingTracks(){
  const {queue,index,select,shuffle,shufflePlan,exclusions,priorityIds}=usePlayer(useShallow(s=>({queue:s.queue,index:s.index,select:s.select,shuffle:s.shuffle,shufflePlan:s.shufflePlan,exclusions:s.exclusions,priorityIds:s.priorityIds})));
  const upcoming=upcomingTracks(queue,index,shuffle,shufflePlan,exclusions,priorityIds).slice(0,2);
  return upcoming.length?<div className="up-next-list">{upcoming.map(track=><button className="up-next-track" key={track.queueId} onClick={()=>select(queue.findIndex(item=>item.queueId===track.queueId))} aria-label={t('App.riproduci',{p0:track.title})}><Cover track={track}/><span><strong>{track.title}</strong><small>{track.artist}</small></span><time>{formatTime(track.duration)}</time></button>)}</div>:<p>{t('App.lascia.spazio.alla.prossima.scoperta')}<br/>{t('App.aggiungi.un.brano.con')}<Plus size={12}/>.</p>;
}
