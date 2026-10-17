import {useContext,useEffect,useRef,useState,type ReactNode,type CSSProperties} from 'react';
import type {Track} from '../../../packages/domain/index';
import {CatalogNavigationContext} from './catalog-navigation';
import {useMotionMode} from './ui-motion';
import {t} from './i18n';
export function ScrollingLine({text,resetKey,children,className='',as='div'}:{text:string;resetKey:string;children:ReactNode;className?:string;as?:'div'|'span'}){
  const viewport=useRef<HTMLDivElement>(null),original=useRef<HTMLSpanElement>(null);
  const mode=useMotionMode(),[visible,setVisible]=useState(true),[size,setSize]=useState({overflow:false,distance:0});
  useEffect(()=>{
    const box=viewport.current,ink=original.current;if(!box||!ink)return;let alive=true;
    const measure=()=>{if(!alive)return;const width=ink.getBoundingClientRect().width;setSize({overflow:width>box.clientWidth+2,distance:Math.max(0,width-box.clientWidth+4)});};
    const observer=new ResizeObserver(measure);observer.observe(box);observer.observe(ink);measure();void document.fonts.ready.then(measure);
    const intersection=new IntersectionObserver(entries=>setVisible(entries[0]?.isIntersecting??false));intersection.observe(box);
    return()=>{alive=false;observer.disconnect();intersection.disconnect();};
  },[text,resetKey]);
  const Tag=as;
  return <Tag ref={viewport} className={`scrolling-line ${className}`} data-overflow={size.overflow} data-scroll={size.overflow&&mode==='curated'&&visible} title={text} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))event.currentTarget.scrollLeft=0;}} style={{'--marquee-distance':`${-size.distance}px`,'--marquee-seconds':`${Math.max(8,size.distance*2/24+4)}s`} as CSSProperties}>
    <Tag key={resetKey} className="marquee-run"><span ref={original} className="marquee-original">{children}</span></Tag>
  </Tag>;
}
export function PlayerTrackInfo({track,onSearch}:{track?:Track&{queueId?:string};onSearch:(query:string)=>void}){
  const open=useContext(CatalogNavigationContext);
  if(!track)return <div className="player-track-copy"><strong>{t('App.scegli.il.tuo.primo.brano')}</strong><span>{t('App.il.resto.puo.aspettare')}</span></div>;
  const artists=track.artists?.length?track.artists:[{id:'',name:track.artist}];
  const names=artists.map(artist=>artist.name).join(', ');
  return <div className="player-track-copy">
    <ScrollingLine text={track.title} resetKey={track.queueId??track.id} className="player-title-line"><button type="button" className="player-title-link" aria-label={t(track.album?'player.openTrack':'player.searchTrack',{title:track.title})} onClick={()=>track.album?open('album',track.album.id,track.id):onSearch(`${track.title} ${track.artist}`.slice(0,200))}><strong title={track.title}>{track.title}</strong></button></ScrollingLine>
    <ScrollingLine text={names} resetKey={(track.queueId??track.id)+':artists'} className="player-artist-line">{artists.map((artist,index)=><span className="player-artist-part" key={`${artist.id}:${index}`}>{index>0&&<span aria-hidden="true">, </span>}<button type="button" className="player-artist-link" aria-label={t('catalog.openArtist',{name:artist.name})} title={artist.name} onClick={()=>artist.id?open('artist',artist.id):onSearch(artist.name.slice(0,200))}>{artist.name}</button></span>)}</ScrollingLine>
    {track.album&&<ScrollingLine text={track.album.name} resetKey={(track.queueId??track.id)+':album'} className="player-album-line"><button type="button" className="player-album-link" title={track.album.name} aria-label={t(track.album.id?'catalog.openAlbum':'a11y.searchAlbum',{name:track.album.name})} onClick={()=>track.album?.id?open('album',track.album.id):onSearch(`${track.album?.name} ${track.artist}`.slice(0,200))}>{track.album.name}</button></ScrollingLine>}
  </div>;
}
