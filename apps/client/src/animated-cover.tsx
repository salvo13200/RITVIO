import {useContext,useEffect,useRef,useState} from 'react';
import {Disc3,LoaderCircle} from 'lucide-react';
import type {Track} from '../../../packages/domain/index';
import {ArtworkContext} from './artwork-context';
import {animateUI,useMotionMode} from './ui-motion';
import {t} from './i18n';
/** Only the two listening covers retain an old, decorative image during loading. */
export function AnimatedCover({track,slot,className=''}:{track?:Track;slot?:string;className?:string}){
  const artwork=useContext(ArtworkContext),source=(slot&&artwork[slot])||track?.thumbnail;
  const latest=useRef(source),animation=useRef<Animation|null>(null);latest.current=source;
  const [shown,setShown]=useState<string|null>(null),[previous,setPrevious]=useState<string|null>(null),[failed,setFailed]=useState<string|null>(null);
  const mode=useMotionMode(),available=!!track&&!!source&&failed!==source;
  useEffect(()=>()=>{animation.current?.cancel();},[source]);
  useEffect(()=>{animation.current?.cancel();setPrevious(null);},[mode]);
  useEffect(()=>{
    if(!available||shown===source)return;
    const timer=setTimeout(()=>{if(latest.current!==source)return;animation.current?.cancel();setFailed(source!);setShown(null);setPrevious(null);},12000);
    return()=>clearTimeout(timer);
  },[source,available,shown]);
  const retained=available?(shown&&shown!==source?shown:previous):null;
  return <div className={`cover animated-cover ${className}`} data-fit="cover" data-artwork={available?'image':'fallback'} aria-busy={available&&shown!==source}>
    {retained&&<img className="cover-retained" src={retained} alt="" aria-hidden="true" onError={e=>{e.currentTarget.hidden=true;}}/>}
    {available&&shown!==source&&<span className="artwork-loading" role="status" title={t('catalog.loading')}><LoaderCircle size={16} className="spin" aria-hidden="true"/><span className="sr-only">{t('catalog.loading')}</span></span>}
    {available?<img key={source} className="cover-incoming" style={{opacity:shown===source?1:0}} src={source} alt={t('App.copertina.di',{p0:track!.title})} onLoad={e=>{
      if(latest.current!==source)return;const hadPrevious=!!shown&&shown!==source;setPrevious(hadPrevious?shown:null);setShown(source!);
      animation.current?.cancel();const next=hadPrevious?animateUI(e.currentTarget,'artwork'):null;animation.current=next;
      if(next){const clear=()=>{if(animation.current===next&&latest.current===source)setPrevious(null);};next.addEventListener('finish',clear,{once:true});next.addEventListener('cancel',clear,{once:true});}else setPrevious(null);
    }} onError={()=>{if(latest.current!==source)return;animation.current?.cancel();setFailed(source!);setShown(null);setPrevious(null);}}/>:<Disc3 aria-hidden="true"/>}
  </div>;
}
