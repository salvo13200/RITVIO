import {noticeText} from './i18n';
import {t} from './i18n';
import {useEffect,useRef,useState} from 'react';
import {Play,Pause,SkipBack,SkipForward,Volume2,VolumeX,Pin,Maximize2,LoaderCircle,Disc3} from 'lucide-react';
import type {MiniSnapshot,MiniCommand} from '../../../packages/domain/mini';
import {formatTime} from '../../../packages/domain/index';
import './mini-player.css';
export function MiniPlayer(){
  const [state,setState]=useState<MiniSnapshot|null>(null),[error,setError]=useState(''),[preview,setPreview]=useState<number|null>(null),drag=useRef(false);
  const seekFallback=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const send=(command:MiniCommand)=>void window.ritvio?.miniCommand(command).catch(()=>setError(t('mini.connectionLost')));
  useEffect(()=>{const bridge=window.ritvio;if(!bridge?.readMini){setError(t('mini.openFromMain'));return;}let active=true;void bridge.readMini().then(value=>{if(active)setState(value);}).catch(()=>setError(t('mini.unavailable')));const stop=bridge.onMiniState(value=>{setState(value);setError('');});return()=>{active=false;stop();};},[]);
  useEffect(()=>{document.documentElement.dataset.theme=state?.theme??'dark';document.documentElement.dataset.motion=state?.motion??'curated';},[state?.theme,state?.motion]);
  const commitSeek=(value:number)=>{setPreview(value);send({type:'seek',value});clearTimeout(seekFallback.current);seekFallback.current=setTimeout(()=>setPreview(null),2500);};
  useEffect(()=>()=>clearTimeout(seekFallback.current),[]);
  useEffect(()=>{drag.current=false;setPreview(null);clearTimeout(seekFallback.current);},[state?.videoId]);
  useEffect(()=>{if(!drag.current&&preview!==null&&Math.abs((state?.position??0)-preview)<.5){setPreview(null);clearTimeout(seekFallback.current);}},[state?.position,preview]);
  const duration=state?.duration??0,position=preview??state?.position??0;
  return <main className="mini-player" aria-label={t('mini.label')}><header><strong>RITVIO</strong><div><button aria-label={t('mini.pin')} aria-pressed={!!state?.pinned} onClick={()=>send({type:'pin'})}><Pin size={16}/></button><button aria-label={t('mini.restore')} onClick={()=>send({type:'restore'})}><Maximize2 size={17}/></button></div></header>
    <div className="mini-song">{state?.videoId?<img src={`https://i.ytimg.com/vi/${state.videoId}/mqdefault.jpg`} alt=""/>:<Disc3 size={42}/>}<button onClick={()=>send({type:'restore'})}><strong title={state?.title}>{state?.title||t('mini.emptyTitle')}</strong><span title={state?.artist}>{state?.artist||t('mini.emptyHint')}</span></button></div>
    <div className="mini-seek"><span>{formatTime(position)}</span><input aria-label={t('mini.seek')} type="range" min={0} max={duration||1} step={1} disabled={!state?.videoId||state.loading||!duration} value={Math.min(position,duration||1)} onPointerDown={e=>{drag.current=true;clearTimeout(seekFallback.current);e.currentTarget.setPointerCapture(e.pointerId);}} onChange={e=>{const value=Number(e.target.value);setPreview(value);if(!drag.current)commitSeek(value);}} onPointerUp={e=>{if(drag.current){drag.current=false;commitSeek(Number(e.currentTarget.value));}}} onPointerCancel={()=>{drag.current=false;setPreview(null);}}/><span>{formatTime(duration)}</span></div>
    <div className="mini-controls"><button aria-label={t('mini.previous')} disabled={!state?.canPrevious} onClick={()=>send({type:'previous'})}><SkipBack size={19}/></button><button className="mini-play" aria-label={state?.playing?t('mini.pause'):t('mini.play')} disabled={!state?.videoId} onClick={()=>send({type:'toggle'})}>{state?.loading?<LoaderCircle size={21}/>:state?.playing?<Pause size={21}/>:<Play size={21}/>}</button><button aria-label={t('mini.next')} disabled={!state?.canNext} onClick={()=>send({type:'next'})}><SkipForward size={19}/></button><div className="mini-volume"><button aria-label={state?.muted?t('mini.unmute'):t('mini.mute')} onClick={()=>send({type:'mute'})}>{state?.muted?<VolumeX size={17}/>:<Volume2 size={17}/>}</button><input aria-label={t('mini.volume')} type="range" min={0} max={1} step={.01} value={state?.volume??.7} onChange={e=>send({type:'volume',value:Number(e.target.value)})}/></div></div>
    {(error||state?.error)&&<p role="alert" className="mini-error">{noticeText(error||state?.error)}</p>}
  </main>;
}
