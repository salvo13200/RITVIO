import { noticeText } from './messages';
import { msg } from './messages';
import { useEffect, useRef, useState } from 'react';
import { Radio, LoaderCircle } from 'lucide-react';
import type { MobileDiscovery, NativeTrack } from '../../../packages/domain/mobile';
import { Artwork } from './ui';
import { nativePlayback } from './native';
function useRetrySeconds(deadline?: number | null) {
    const [now, setNow] = useState(Date.now);
    useEffect(() => {
        setNow(Date.now());
        if (!deadline)
            return;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [deadline]);
    return Math.max(0, Math.ceil(((deadline ?? 0) - now) / 1000));
}
export function DiscoveryControls({ state, change }: {
    state?: MobileDiscovery;
    change: (input: {
        type: 'enabled';
        enabled: boolean;
    } | {
        type: 'retry';
    }) => Promise<boolean>;
}) {
    const [busy, setBusy] = useState(false);
    const seconds = useRetrySeconds(state?.retryAfter), enabled = !!state?.enabled;
    async function submit(input: {
        type: 'enabled';
        enabled: boolean;
    } | {
        type: 'retry';
    }) {
        if (busy)
            return;
        setBusy(true);
        try {
            await change(input);
        }
        finally {
            setBusy(false);
        }
    }
    return <section className="discovery-controls" aria-label={msg("Continuazione automatica")}>
  <div className="autoplay-toggle"><span><strong>{msg("Autoplay")}</strong><small>{msg("Continua con brani simili alla fine della coda")}</small></span><button role="switch" aria-label="Autoplay" aria-checked={enabled} disabled={busy} onClick={() => void submit({ type: 'enabled', enabled: !enabled })}><span /></button></div>
  {state?.origin && <p className="radio-origin"><Radio size={18}/><span>{msg("Radio di") + " "}<strong>{state.origin.title}</strong></span></p>}
  {enabled && state?.suspended && <p className="discovery-status">{state.suspended === 'timer' ? msg("Autoplay sospeso mentre il timer \u00E8 attivo.") : msg("Autoplay sospeso durante la ripetizione.")}</p>}
  {state?.loading && <p className="discovery-status" role="status"><LoaderCircle className="spin" size={18}/>{state.mode === 'radio' ? msg("Preparazione della radio\u2026") : msg("Cerco i prossimi brani\u2026")}</p>}
  {state?.message && <div className="discovery-feedback"><p role="status">{noticeText(state?.message)}</p>{state.status === 'error' && enabled && <button className="tonal" aria-label={msg("Riprova suggerimenti")} disabled={busy || seconds > 0} onClick={() => void submit({ type: 'retry' })}>{seconds > 0 ? msg("Riprova tra {p0} s", { p0: seconds }) : msg("Riprova")}</button>}</div>}
  {enabled && <p className="source-date">{msg("Disattivando Autoplay vengono rimossi i suoi brani ancora da ascoltare.")}</p>}
 </section>;
}
export function RadioPanel({ track, state, start, openPlayer }: {
    track: NativeTrack;
    state?: MobileDiscovery;
    start: () => Promise<boolean>;
    openPlayer: () => void;
}) {
    const pending = useRef(false);
    const [starting, setStarting] = useState(false);
    const seconds = useRetrySeconds(state?.retryAfter);
    const loading = starting || state?.mode === 'radio' && state.loading;
    const ready = state?.status === 'ready' && state.origin?.videoId === track.videoId;
    useEffect(() => {
        if (!state?.loading)
            pending.current = false;
    }, [state?.loading]);
    useEffect(() => () => {
        if (pending.current)
            void nativePlayback.discoveryCommand({ type: 'cancel' }).catch(() => { });
    }, []);
    async function begin() {
        pending.current = true;
        setStarting(true);
        try {
            if (!await start())
                pending.current = false;
        }
        finally {
            setStarting(false);
        }
    }
    return <div className="radio-panel"><div className="sheet-track"><Artwork src={track.thumbnail}/><span><strong>{track.title}</strong><small>{track.artist}</small></span></div>
  <p className="intro">{msg("Parti da questo brano e scopri musica simile. La radio sostituisce la coda e attiva Autoplay, con ripetizione disattivata.")}</p>
  <p className="source-date">{msg("La musica attuale continua durante la preparazione. Se chiudi questo pannello, la preparazione viene annullata.")}</p>
  {ready ? <><p className="radio-ready" role="status">{msg("La radio \u00E8 pronta.")}</p><button className="primary" onClick={openPlayer}>{msg("Apri il player")}</button></> : <button className="primary" disabled={loading || seconds > 0} onClick={() => void begin()}>{loading ? <LoaderCircle className="spin" size={21}/> : <Radio size={21}/>} {loading ? msg("Preparo la radio\u2026") : seconds > 0 ? msg("Riprova tra {p0} s", { p0: seconds }) : msg("Avvia radio")}</button>}
  {state?.message && <p className="discovery-status" role="status">{noticeText(state?.message)}</p>}
  <p className="source-date">{msg("Suggerimenti dal catalogo YouTube Music; disponibilit\u00E0 e variet\u00E0 dipendono dal servizio. Nessun download offline.")}</p>
 </div>;
}
