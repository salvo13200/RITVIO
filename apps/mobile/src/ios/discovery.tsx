import {useEffect,useState} from 'react';
import {ArrowRight,LoaderCircle,Radio} from 'lucide-react';
import type {NativeTrack} from '../../../../packages/domain/mobile';
import {Artwork,Sheet} from './components';
import type {DiscoveryCopy} from './discovery-copy';
import type {useDiscovery} from './use-discovery';
type Controller=ReturnType<typeof useDiscovery>;
function requestID(){return Array.from(crypto.getRandomValues(new Uint8Array(16)),value=>value.toString(16).padStart(2,'0')).join('');}
function useRetry(seconds?:number){const [remaining,setRemaining]=useState(seconds??0);useEffect(()=>{const start=performance.now();setRemaining(seconds??0);if(!seconds)return;const timer=setInterval(()=>setRemaining(Math.max(0,seconds-Math.floor((performance.now()-start)/1000))),1000);return()=>clearInterval(timer);},[seconds]);return remaining;}
function failure(controller:Controller,t:DiscoveryCopy){const {value,error}=controller;if(error==='DISCOVERY_TIMER_ACTIVE')return t.timerRadio;if(error==='DISCOVERY_BUSY')return t.busy;if(error==='unavailable')return t.unavailable;if(value?.status==='empty')return t.empty;if(value?.status==='full')return t.full;if(error||value?.status==='error')return t.error;return '';}
export function AutoplayControls({controller,t}:{controller:Controller;t:DiscoveryCopy}){
 const state=controller.value,seconds=useRetry(state?.retryIn),message=failure(controller,t);
 return <section className="ios-autoplay" aria-label={t.autoplay}>
  <label className="ios-autoplay-toggle"><span><strong>{t.autoplay}</strong><small>{t.autoplayBody}</small></span><input type="checkbox" role="switch" aria-label={t.autoplay} className="ios-switch" checked={state?.enabled??false} disabled={!state||controller.busy} onChange={event=>void controller.send({type:'enabled',enabled:event.target.checked})}/></label>
  {state?.enabled&&state.suspended&&<p role="status">{state.suspended==='timer'?t.timer:t.repeat}</p>}
  {state?.loading&&<p role="status"><LoaderCircle className="ios-spinner" aria-hidden="true"/>{state.mode==='radio'?t.preparing:t.finding}</p>}
  {message&&<div className="ios-discovery-feedback" role="status"><p>{message}</p>{(!state||controller.error==='unavailable')?<button className="ios-text" onClick={()=>void controller.refresh()}>{t.retry}</button>:state.enabled&&state.status==='error'&&<button className="ios-text" disabled={controller.busy||seconds>0||Boolean(state.suspended)} onClick={()=>void controller.send({type:'retry'})}>{seconds?t.wait(seconds):t.retry}</button>}</div>}
  <small>{t.offBody}</small>
 </section>;
}
export function RadioSheet({track,controller,t,onClose,onQueue}:{track:NativeTrack;controller:Controller;t:DiscoveryCopy;onClose:()=>void;onQueue:()=>void}){
 const [id]=useState(requestID),state=controller.value,seconds=useRetry(state?.retryIn),ready=state?.status==='ready'&&state.origin?.videoId===track.videoId;
 const cancel=controller.cancelRadio;useEffect(()=>()=>cancel(id),[id]);
 const message=failure(controller,t),loading=state?.loading||controller.busy;
 return <Sheet title={t.title} closeLabel={t.done} closeText onClose={onClose} className="ios-radio">
  <div className="ios-radio-scroll"><div className="ios-radio-identity"><Artwork src={track.thumbnail} large eager/><h2>{track.title}</h2><p>{track.artist}</p></div>
   <h3>{t.intro}</h3><p>{t.changes}</p><p className="ios-radio-note">{t.prepareBody}</p>
   {state?.suspended==='timer'&&<p className="ios-radio-notice" role="status">{t.timerRadio}</p>}
   {ready?<><p className="ios-radio-notice" role="status">{t.ready}</p><button className="ios-primary" onClick={onQueue}>{t.openQueue}<ArrowRight/></button></>:<button className="ios-primary" disabled={!state||loading||seconds>0||state.suspended==='timer'} onClick={()=>void controller.send({type:'radio',track,requestId:id})}>{loading?<LoaderCircle className="ios-spinner" aria-hidden="true"/>:<Radio aria-hidden="true"/>}{loading?t.preparing:seconds?t.wait(seconds):t.start}</button>}
   {message&&<div className="ios-radio-notice" role="status"><p>{message}</p>{controller.error==='unavailable'&&<button className="ios-text" onClick={()=>void controller.refresh()}>{t.retry}</button>}</div>}
   <small>{t.availability}</small>
  </div>
 </Sheet>;
}
