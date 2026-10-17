import {noticeText} from './i18n';
import {useId,useRef,useEffect} from 'react';
import {LoaderCircle} from 'lucide-react';
import {usePlayer} from './store';
import {useShallow} from 'zustand/react/shallow';
import {useAutoplay} from './autoplay';
import {animateUI} from './ui-motion';
import {t} from './i18n';
import './autoplay.css';

export function AutoplayControl(){
  const id=useId(),ref=useRef<HTMLParagraphElement>(null);
  const s=usePlayer(useShallow(s=>({enabled:s.autoplayEnabled,waiting:s.autoplayWaiting,timer:s.sleepTimer,repeat:s.repeat,full:s.queue.length>=1000})));
  const status=useAutoplay(useShallow(s=>({status:s.status,seed:s.seed,count:s.count,error:s.error,degraded:s.degraded})));
  useEffect(()=>{if(ref.current){const motion=animateUI(ref.current,'surface');return()=>motion?.cancel();}},[status.status,s.waiting]);
  const suspended=s.timer?'autoplay.timer':s.repeat!=='off'?'autoplay.repeat':s.full?'autoplay.full':null;
  return <section className="autoplay-control" aria-label={t('autoplay.section')}>
    <div className="autoplay-setting"><div><strong id={id}>{t('autoplay.title')}</strong><p id={id+'-hint'}>{t('autoplay.hint')}</p></div><button type="button" className="autoplay-switch" role="switch" aria-checked={s.enabled} aria-labelledby={id} aria-describedby={id+'-hint'} onClick={event=>{animateUI(event.currentTarget,'press');usePlayer.getState().setAutoplay(!s.enabled);}}><span aria-hidden="true"/></button></div>
    {s.enabled&&<><p ref={ref} className="autoplay-status" role={status.status==='error'?'alert':'status'}>{suspended?t(suspended):s.waiting?<><LoaderCircle size={16} className="spin"/>{t('autoplay.waiting')}</>:status.status==='loading'?<><LoaderCircle size={16} className="spin"/>{t('autoplay.loading')}</>:status.status==='error'?noticeText(status.error):status.status==='empty'?t('autoplay.empty'):status.status==='added'?t('autoplay.added',{count:status.count,title:status.seed?.title}):t('autoplay.ready')}</p>
    {!suspended&&(status.status==='error'||status.status==='empty')&&<button type="button" className="secondary-button" onClick={()=>useAutoplay.getState().retry()}>{t('autoplay.retry')}</button>}
    {status.degraded&&!suspended&&<p className="autoplay-cache">{t('radio.cached')}</p>}</>}
  </section>;
}
