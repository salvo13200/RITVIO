import { noticeText } from './i18n';
import { useEffect, useState } from 'react';
import { Clock, TimerOff } from 'lucide-react';
import { usePlayer } from './store';
import { remainingSeconds } from '../../../packages/domain/sleep-timer';
import { formatTime } from '../../../packages/domain/index';
import { t } from './i18n';
export function SleepTimerController() {
    useEffect(() => { const check = () => usePlayer.getState().tickSleep(); check(); const unsubscribe = usePlayer.subscribe(check); const interval = window.setInterval(check, 500); window.addEventListener('focus', check); document.addEventListener('visibilitychange', check); window.addEventListener('pageshow', check); return () => { unsubscribe(); clearInterval(interval); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); window.removeEventListener('pageshow', check); }; }, []);
    return null;
}
export function SleepCountdown() {
    const timer = usePlayer(s => s.sleepTimer), [now, setNow] = useState(Date.now);
    useEffect(() => {
        if (!timer)
            return;
        setNow(Date.now());
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, [timer]);
    return <span className="sleep-countdown" aria-live="off">{timer?.kind === 'track' ? t('sleep.trackShort') : timer ? formatTime(remainingSeconds(timer, now) ?? 0) : t('sleep.off')}</span>;
}
export function SleepTimerControl({ expanded = false }: {
    expanded?: boolean;
} = {}) {
    const timer = usePlayer(s => s.sleepTimer), notice = usePlayer(s => s.sleepNotice), current = usePlayer(s => s.queue[s.index]);
    const [minutes, setMinutes] = useState('30');
    return <section className="sleep-control" aria-label={t('sleep.title')}><details open={expanded || undefined}><summary><Clock size={18}/><strong>{t('sleep.title')}</strong><SleepCountdown /></summary><div className="sleep-fields"><p>{t('sleep.hint')}</p><div className="sleep-presets">{[15, 30, 60].map(value => <button type="button" className="secondary-button" key={value} onClick={() => usePlayer.getState().armSleep(value)}>{t('sleep.minutes', { minutes: value })}</button>)}<button type="button" className="secondary-button" disabled={!current} onClick={() => usePlayer.getState().armSleep('track')}>{t('sleep.track')}</button></div><form onSubmit={e => {
            e.preventDefault();
            const value = Number(minutes);
            if (Number.isInteger(value) && value >= 1 && value <= 1440)
                usePlayer.getState().armSleep(value);
        }}><label>{t('sleep.custom')}<input aria-label={t('sleep.custom')} type="number" required min={1} max={1440} step={1} value={minutes} onChange={e => setMinutes(e.target.value)}/></label><button type="submit" className="secondary-button">{t('sleep.start')}</button></form><p>{t('sleep.limitHint')}</p></div></details>{timer && <div className="sleep-active"><span>{timer.kind === 'track' ? t('sleep.boundTrack', { title: current?.title ?? '' }) : t('sleep.active')}</span><button type="button" className="text-button" onClick={() => usePlayer.getState().cancelSleep()}><TimerOff size={16}/>{t('sleep.cancel')}</button></div>}{notice && <p role="status" className="queue-feedback">{noticeText(notice)}</p>}</section>;
}
