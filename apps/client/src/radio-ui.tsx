import {noticeText} from './i18n';
import {useEffect,useRef} from 'react';
import {Radio,LoaderCircle,X} from 'lucide-react';
import type {Track} from '../../../packages/domain/index';
import {useRadio} from './radio';
import {usePlayer} from './store';
import {useShallow} from 'zustand/react/shallow';
import {isExcluded} from '../../../packages/domain/listening';
import {animateUI} from './ui-motion';
import {Cover} from './ui-controls';
import {t} from './i18n';
import './radio.css';

export function RadioButton({track,compact=false}:{track:Track;compact?:boolean}){
  const blocked=usePlayer(s=>isExcluded(track,s.exclusions));
  return <button type="button" className={compact?'icon-button':'radio-menu-button'} disabled={blocked} aria-label={t('radio.startNamed',{title:track.title})} title={t('radio.startNamed',{title:track.title})} onClick={event=>{animateUI(event.currentTarget,'press');void useRadio.getState().start(track);}}><Radio size={18}/>{!compact&&<span>{t('radio.start')}</span>}</button>;
}
export function RadioQueueStatus(){
  const request=useRadio(useShallow(s=>({seed:s.seed,loading:s.loading,error:s.error})));
  const session=usePlayer(s=>s.radioSession),queue=usePlayer(s=>s.queue);
  const ref=useRef<HTMLElement>(null),seed=request.seed??session?.seed;
  const key=request.loading?'loading':request.error?'error':session?.createdAt;
  useEffect(()=>{if(ref.current){const motion=animateUI(ref.current,'surface');return()=>motion?.cancel();}},[key]);
  if(!seed)return null;
  const count=session?queue.filter(t=>session.queueIds.includes(t.queueId)&&t.videoId!==session.seed.videoId).length:0;
  return <section ref={ref} className="radio-summary" aria-label={t('radio.title')} aria-busy={request.loading}>
    <div className="radio-summary-heading"><Radio size={18}/><h2>{t('radio.title')}</h2><button type="button" className="icon-button" aria-label={t(request.seed?'radio.cancel':'radio.close')} title={t(request.seed?'radio.cancel':'radio.close')} onClick={()=>{useRadio.getState().cancel();if(!request.seed)usePlayer.getState().leaveRadio();}}><X size={18}/></button></div>
    <div className="radio-seed"><Cover track={seed}/><div><strong>{seed.title}</strong><small>{seed.artist}</small></div></div>
    <p role={request.error?'alert':'status'}>{request.loading?<><LoaderCircle size={16} className="spin"/>{t('radio.loading')}</>:noticeText(request.error)||t('radio.count',{count})}</p>
    {request.error?<button type="button" className="secondary-button" onClick={()=>void useRadio.getState().start(seed)}>{t('radio.retry')}</button>:!request.loading&&<><p className="radio-hint">{t('radio.hint')}</p>{session?.degraded&&<p className="radio-hint">{t('radio.cached')}</p>}</>}
  </section>;
}
