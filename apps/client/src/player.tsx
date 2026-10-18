import {t} from './i18n';
import {attachAutoplay} from './autoplay';
import {useEffect,useRef} from 'react';
import {usePlayer} from './store';
import {configureAudio,prepareAudio} from './audio-engine';
import {attachActivity,recordRecentAllowed} from './activity-controller';
import {preparePlayback,attachPlaybackPreparation} from './playback-preparation';
import {beginPlayback,observePlaybackRequests} from './playback-metrics';
import {ApiError} from './api';
export const audio=new Audio();
audio.preload='auto';
audio.crossOrigin='anonymous';
const keyOfPlayer=()=>{const state=usePlayer.getState();return `${state.queue[state.index]?.queueId}:${state.activation}`;};
let cancelSeek:(()=>void)|undefined;
let seekRevision=0;
let resourceKey='';
export function seek(seconds:number){
  if(!Number.isFinite(seconds))return;
  seekRevision++;
  if(usePlayer.getState().autoplayWaiting)usePlayer.getState().interruptAutoplay();
  const ownsResource=resourceKey===keyOfPlayer();
  const limit=ownsResource&&Number.isFinite(audio.duration)?audio.duration:usePlayer.getState().duration;
  const position=Math.max(0,Math.min(seconds,limit||seconds));
  if(ownsResource&&audio.readyState>0&&Math.abs(audio.currentTime-position)>.01){
    cancelSeek?.();const timing=beginPlayback('seek'),events=new AbortController();
    let buffered=false;for(let i=0;i<audio.buffered.length;i++)if(position>=audio.buffered.start(i)&&position<=audio.buffered.end(i))buffered=true;
    timing.bufferedSeek(buffered);
    const clean=()=>{clearTimeout(timeout);events.abort();if(cancelSeek===cancel)cancelSeek=undefined;};
    const cancel=()=>{timing.cancel();clean();};cancelSeek=cancel;
    const timeout=setTimeout(cancel,30000);
    audio.addEventListener('seeked',()=>{timing.seeked(audio.paused);if(audio.paused)clean();},{once:true,signal:events.signal});
    audio.addEventListener('playing',()=>{timing.playing();clean();},{once:true,signal:events.signal});
    audio.addEventListener('error',()=>{timing.fail();clean();},{once:true,signal:events.signal});
    audio.currentTime=position;
  }
  usePlayer.setState({position});
}
export function AudioController(){
  const current=usePlayer(s=>s.queue[s.index]);
  const playing=usePlayer(s=>s.playing);const activation=usePlayer(s=>s.activation);
  const volume=usePlayer(s=>s.volume);const muted=usePlayer(s=>s.muted);
  const preferences=usePlayer(s=>s.audioPreferences);
  const loaded=useRef('');const expires=useRef(0);const restoring=useRef(false);
  const key=current?`${current.queueId}:${activation}`:'';
  useEffect(()=>{audio.volume=volume;audio.muted=muted;},[volume,muted]);
  useEffect(()=>{configureAudio(preferences);},[preferences]);
  useEffect(()=>attachActivity(audio,()=>loaded.current===keyOfPlayer()&&!restoring.current),[]);
  useEffect(()=>observePlaybackRequests(),[]);
  useEffect(()=>attachPlaybackPreparation(audio),[]);
  useEffect(()=>attachAutoplay(),[]);
  useEffect(()=>{
    const resumeAudio=()=>{const s=usePlayer.getState();if(document.visibilityState==='visible'&&s.playing&&loaded.current===keyOfPlayer())void prepareAudio(audio,s.audioPreferences).catch(()=>{});};
    window.addEventListener('focus',resumeAudio);window.addEventListener('pageshow',resumeAudio);document.addEventListener('visibilitychange',resumeAudio);
    return()=>{window.removeEventListener('focus',resumeAudio);window.removeEventListener('pageshow',resumeAudio);document.removeEventListener('visibilitychange',resumeAudio);};
  },[]);
  useEffect(()=>{
    const matches=()=>{const s=usePlayer.getState();return loaded.current===`${s.queue[s.index]?.queueId}:${s.activation}`;};
    const onTime=()=>{if(matches()&&!restoring.current&&!audio.seeking&&audio.readyState>0)usePlayer.setState({position:audio.currentTime});};
    const onDuration=()=>{if(matches()&&Number.isFinite(audio.duration))usePlayer.setState({duration:audio.duration});};
    const onPlaying=()=>{
      if(!matches()||restoring.current||audio.paused||audio.readyState<3)return;
      usePlayer.setState({loading:false});const s=usePlayer.getState();const track=s.queue[s.index];
      if(track&&recordRecentAllowed())s.heard(track);
    };
    const onWaiting=()=>{if(matches()&&!audio.paused&&audio.readyState<3&&usePlayer.getState().playing)usePlayer.setState({loading:true});};
    const onEnded=()=>{if(matches()&&audio.ended)usePlayer.getState().next(true);};
    const listeners={timeupdate:onTime,durationchange:onDuration,playing:onPlaying,waiting:onWaiting,ended:onEnded};
    for(const [event,listener] of Object.entries(listeners))audio.addEventListener(event,listener);
    return()=>{for(const [event,listener] of Object.entries(listeners))audio.removeEventListener(event,listener);};
  },[]);
  useEffect(()=>{
    const controller=new AbortController();let retries=0;let networkRetries=0;let refreshing=false;let generation=0;let metadata:()=>void;let timing:ReturnType<typeof beginPlayback>|undefined;
    let retryTimer:ReturnType<typeof setTimeout>|undefined,stallTimer:ReturnType<typeof setTimeout>|undefined,retryAction:(()=>void)|undefined;
    const clearRetry=()=>{clearTimeout(retryTimer);retryTimer=undefined;retryAction=undefined;};
    cancelSeek?.();
    const firstData=()=>timing?.firstData(),startedPlaying=()=>timing?.playing();
    const alive=()=>!controller.signal.aborted&&keyOfPlayer()===key&&usePlayer.getState().playing;
    audio.pause();
    if(!current){loaded.current=resourceKey='';audio.removeAttribute('src');audio.load();return;}
    if(!playing){usePlayer.setState({loading:false});return;}
    audio.addEventListener('loadeddata',firstData);audio.addEventListener('playing',startedPlaying);
    const fail=(message:string)=>{if(alive()){clearRetry();clearTimeout(stallTimer);timing?.fail();loaded.current=resourceKey='';usePlayer.setState({loading:false,playing:false,error:message});}};
    const retryNetwork=(message:string,fresh:boolean)=>{
      if(!alive()||retryAction)return;
      if(networkRetries>=2){fail(message);return;}
      const delay=[1000,3000][networkRetries++];
      timing?.fail();loaded.current=resourceKey='';usePlayer.setState({loading:true,error:null});
      const deadline=performance.now()+30000;
      const attempt=()=>{
        if(!alive()||!usePlayer.getState().playing)return;
        if(performance.now()>=deadline){fail(message);return;}
        if(!navigator.onLine){retryTimer=setTimeout(attempt,1000);return;}
        clearRetry();void prepare(fresh);
      };
      retryAction=attempt;retryTimer=setTimeout(attempt,delay);
    };
    const prepare=async(fresh=false)=>{
      clearTimeout(stallTimer);stallTimer=undefined;
      const ownGeneration=++generation;
      const isCurrent=()=>alive()&&ownGeneration===generation;
      if(fresh)retries=1;
      const resume=usePlayer.getState().position;
      const seekAtStart=seekRevision;
      const attempt=beginPlayback(fresh?'refresh':'new');timing=attempt;
      usePlayer.setState({loading:true,error:null});
      try{
        const [prepared]=await Promise.all([preparePlayback(current,fresh,controller.signal),prepareAudio(audio,usePlayer.getState().audioPreferences)]);
        const {descriptor}=prepared;attempt.stages(prepared);
        if(!isCurrent())return;
        loaded.current=resourceKey=key;expires.current=Date.parse(descriptor.expiresAt);restoring.current=true;
        if(metadata)audio.removeEventListener('loadedmetadata',metadata);
        metadata=()=>{if(isCurrent()){const position=seekAtStart===seekRevision?resume:usePlayer.getState().position;if(position>0&&Number.isFinite(audio.duration))audio.currentTime=Math.min(position,Math.max(0,audio.duration-.1));restoring.current=false;}};
        audio.addEventListener('loadedmetadata',metadata,{once:true});audio.src=descriptor.url;audio.load();
        if(isCurrent()&&usePlayer.getState().playing)await audio.play();
      }catch(error){
        if(!isCurrent()||(refreshing&&!fresh))return;
        if(error instanceof ApiError&&['NETWORK_ERROR','RESOLVER_FAILED','RESOLVER_TIMEOUT','RESOLVER_BUSY'].includes(error.code)){retryNetwork(error.message,fresh);return;}
        if(error instanceof DOMException){if(!fresh)recover();else fail(t("player.il.flusso.audio.non.e.riproducibile.riprova.o.scegli.un.altro.bra"));}
        else fail(error instanceof Error?error.message:t("player.impossibile.caricare.il.brano"));
      }
    };
    const recover=()=>{
      if(!alive()||refreshing)return;
      if(retries===0){timing?.fail();retries=1;refreshing=true;loaded.current=resourceKey='';void prepare(true).finally(()=>{refreshing=false;});}
      else fail(t("player.il.flusso.audio.non.e.riproducibile.riprova.o.scegli.un.altro.bra"));
    };
    // The outgoing media can still report a queued error while the incoming
    // descriptor is loading. Only the resource installed for this activation
    // may refresh it; otherwise two concurrent loads can interrupt each other.
    const onError=()=>{if(loaded.current===key&&audio.error){if(audio.error.code===MediaError.MEDIA_ERR_NETWORK)retryNetwork(t('player.impossibile.caricare.il.brano'),true);else recover();}};
    const onOnline=()=>{if(retryAction){clearTimeout(retryTimer);retryAction();}};
    const onProgress=()=>{clearTimeout(stallTimer);stallTimer=undefined;};
    const onStalled=()=>{
      if(loaded.current!==key||!usePlayer.getState().playing||retryAction||stallTimer)return;
      const position=audio.currentTime;
      stallTimer=setTimeout(()=>{stallTimer=undefined;if(alive()&&loaded.current===key&&usePlayer.getState().playing&&audio.readyState<3&&Math.abs(audio.currentTime-position)<.1)retryNetwork(t('player.impossibile.caricare.il.brano'),true);},20000);
    };
    audio.addEventListener('error',onError);
    audio.addEventListener('waiting',onStalled);audio.addEventListener('stalled',onStalled);audio.addEventListener('playing',onProgress);window.addEventListener('online',onOnline);
    if(loaded.current===key&&audio.src&&expires.current>Date.now()+30000){
      timing=beginPlayback('resume');
      if(restoring.current){
        metadata=()=>{if(alive()){const resume=usePlayer.getState().position;if(resume>0&&Number.isFinite(audio.duration))audio.currentTime=Math.min(resume,Math.max(0,audio.duration-.1));restoring.current=false;}};
        if(audio.readyState>0)metadata();else audio.addEventListener('loadedmetadata',metadata,{once:true});
      }
      const ownGeneration=generation;
      void prepareAudio(audio,usePlayer.getState().audioPreferences).then(()=>{if(alive()&&ownGeneration===generation)return audio.play();}).catch(()=>{if(alive()&&ownGeneration===generation)recover();});
    }else {const fresh=loaded.current===key;loaded.current=resourceKey='';void prepare(fresh);}
    return()=>{controller.abort();clearRetry();clearTimeout(stallTimer);timing?.cancel();audio.removeEventListener('loadeddata',firstData);audio.removeEventListener('playing',startedPlaying);audio.removeEventListener('error',onError);audio.removeEventListener('waiting',onStalled);audio.removeEventListener('stalled',onStalled);audio.removeEventListener('playing',onProgress);window.removeEventListener('online',onOnline);if(metadata)audio.removeEventListener('loadedmetadata',metadata);};
  },[key,playing]);
  useEffect(()=>{
    const actions={toggle:()=>usePlayer.getState().toggle(),next:()=>usePlayer.getState().next(),previous:()=>usePlayer.getState().previous()};
    const unsubscribe=window.ritvio?.onMediaKey(action=>actions[action as keyof typeof actions]?.());
    if('mediaSession' in navigator){
      navigator.mediaSession.setActionHandler('play',()=>usePlayer.setState({playing:true,error:null}));
      navigator.mediaSession.setActionHandler('pause',()=>{usePlayer.getState().interruptAutoplay();usePlayer.setState({playing:false});});
      navigator.mediaSession.setActionHandler('nexttrack',actions.next);navigator.mediaSession.setActionHandler('previoustrack',actions.previous);
      navigator.mediaSession.setActionHandler('seekto',details=>{if(details.seekTime!=null)seek(details.seekTime);});
    }
    return()=>{unsubscribe?.();if('mediaSession' in navigator)for(const action of ['play','pause','nexttrack','previoustrack','seekto'] as const)navigator.mediaSession.setActionHandler(action,null);};
  },[]);
  useEffect(()=>{
    if('mediaSession' in navigator){navigator.mediaSession.playbackState=playing?'playing':'paused';navigator.mediaSession.metadata=current?new MediaMetadata({title:current.title,artist:current.artist,artwork:[{src:current.thumbnail,sizes:'320x180',type:'image/jpeg'}]}):null;}
  },[current?.id,playing]);
  return null;
}
