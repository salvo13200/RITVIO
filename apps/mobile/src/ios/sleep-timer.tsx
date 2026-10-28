import {useEffect,useState} from 'react';
import {Check,LoaderCircle,Timer} from 'lucide-react';
import type {NativeTrack} from '../../../../packages/domain/mobile';
import {Artwork,ScrollText,Sheet} from './components';
import {sleepMinutes,sleepTime} from './sleep-model';
import type {SleepCopy} from './sleep-copy';
import type {useSleepTimer} from './use-sleep-timer';

export function SleepTimer({timer,track,t,onClose}:{timer:ReturnType<typeof useSleepTimer>;track?:NativeTrack;t:SleepCopy;onClose:()=>void}){
 const [notice,setNotice]=useState('');
 const value=timer.value,active=value&&value.mode!=='off';
 useEffect(()=>{if(value?.reason==='expired')setNotice(t.expired);},[value?.revision,t]);
 async function choose(minutes?:typeof sleepMinutes[number]){if(await timer.configure(minutes?'duration':'track-end',minutes))setNotice(minutes?t.set(minutes):t.setEnd);}
 return <Sheet title={t.title} closeLabel={t.done} closeText onClose={onClose} className="ios-sleep">
  <div className="ios-sleep-scroll">
   {track&&<div className="ios-sleep-identity"><Artwork src={track.thumbnail} eager/><div className="ios-identity"><strong><ScrollText>{track.title}</ScrollText></strong><span><ScrollText>{track.artist}</ScrollText></span></div></div>}
   <div className="ios-sleep-status">
    {!value?<LoaderCircle className="ios-spinner" aria-label={t.loading}/>:value.mode==='duration'?<span className="ios-sleep-countdown" role="timer" aria-live="off" aria-label={t.active}>{sleepTime(value.remaining!)}</span>:<><Timer aria-hidden="true"/><strong>{value.mode==='track-end'?t.endActive:t.off}</strong></>}
    <p>{active?t.body:t.choose}</p>{value?.mode==='duration'&&<p>{t.paused}</p>}
   </div>
   <p className="ios-sleep-feedback" role="status" aria-live="polite">{notice}</p>
   {timer.error&&<div className="ios-sleep-error" role="alert"><p>{timer.error==='changed'?t.changed:timer.error==='write'?t.writeError:t.unavailable}</p><button className="ios-text" disabled={timer.busy} onClick={()=>void timer.refresh()}>{t.retry}</button></div>}
   <div className="ios-sleep-presets" role="group" aria-label={t.presets} aria-busy={timer.busy||undefined}>
    {sleepMinutes.map(minutes=><button key={minutes} aria-pressed={value?.mode==='duration'&&value.minutes===minutes} disabled={!value||!track||timer.busy} onClick={()=>void choose(minutes)}><span>{t.minutes(minutes)}</span>{value?.mode==='duration'&&value.minutes===minutes&&<Check aria-hidden="true"/>}</button>)}
    <button aria-pressed={value?.mode==='track-end'} disabled={!value||!track||timer.busy} onClick={()=>void choose()}><span>{t.end}</span>{value?.mode==='track-end'&&<Check aria-hidden="true"/>}</button>
   </div>
   <p className="ios-sleep-boundary">{t.boundary}</p>
   {active&&<button className="ios-sleep-cancel" disabled={timer.busy} onClick={()=>void timer.configure('off').then(saved=>{if(saved)setNotice(t.cancelled);})}>{timer.busy&&<LoaderCircle className="ios-spinner" aria-hidden="true"/>}{t.cancel}</button>}
  </div>
 </Sheet>;
}
