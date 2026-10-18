import { noticeText } from './messages';
import { msg, formatLocale } from './messages';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ChevronDown, ChevronRight, ListMusic, Heart, Shuffle, Repeat, Repeat1, SkipBack, SkipForward, Pause, Play, LoaderCircle, Volume2, VolumeX, FileText, SlidersHorizontal, Share2, Timer } from 'lucide-react';
import type { MobilePlayback, NativeTrack, MobileCommand, MobileResource, MobileAudio } from '../../../packages/domain/mobile';
import { parseLyrics, activeLyricsLine, type ParsedLyrics } from '../../../packages/domain/lyrics';
import { nativePlayback } from './native';
import { Artwork, Modal, ScrollText, Seek, Empty, Skeleton } from './ui';
import { useRangeDraft } from './range-draft';
import { animatePlayerArtwork } from './player-transition';
import { usePlayerDismiss } from './player-dismiss';
export function VolumeControl({ value, onChange }: {
    value: number;
    onChange: (value: number) => void;
}) {
    const draft = useRangeDraft(value, onChange);
    return <label className="volume"><VolumeX size={20} aria-hidden="true"/><input aria-label={msg("Volume del player")} type="range" min={0} max={1} step={.01} value={draft.value} style={{ '--fill': `${draft.value * 100}%` } as CSSProperties} onChange={event => draft.change(Number(event.target.value))} onPointerUp={draft.commit} onPointerCancel={draft.cancel} onKeyUp={draft.keyUp} onBlur={draft.commit}/><Volume2 size={23} aria-hidden="true"/></label>;
}
export function Player({ state, liked, onLike, command, close, openQueue, openUtility, openResource, searchArtist, share, children, inactive = false, artworkOrigin = null }: {
    state: MobilePlayback;
    liked: boolean;
    onLike: () => void;
    command: (input: MobileCommand) => void;
    close: () => void;
    openQueue: () => void;
    openUtility: (name: string) => void;
    openResource: (resource: MobileResource) => void;
    searchArtist: () => void;
    share: () => void;
    children?: React.ReactNode;
    inactive?: boolean;
    artworkOrigin?: DOMRect | null;
}) {
    const track = state.items[state.index], body = useRef<HTMLDivElement>(null), cancelFlight = useRef<() => void>(() => { }), previousTrack = useRef(track?.videoId);
    const dismissal = usePlayerDismiss(close, inactive, () => cancelFlight.current());
    useEffect(() => { cancelFlight.current = animatePlayerArtwork(body.current, artworkOrigin); const stop = () => cancelFlight.current(); document.addEventListener('visibilitychange', stop); window.addEventListener('blur', stop); return () => { stop(); document.removeEventListener('visibilitychange', stop); window.removeEventListener('blur', stop); }; }, []);
    useEffect(() => {
        if (previousTrack.current !== track?.videoId) {
            cancelFlight.current();
            previousTrack.current = track?.videoId;
        }
    }, [track?.videoId]);
    if (!track)
        return null;
    const person = track.artists?.[0], album = track.album;
    return <Modal full inactive={inactive} label={msg("In ascolto")} onClose={dismissal.dismiss}>
  <div className="player-atmosphere" aria-hidden="true"/>
  <header ref={dismissal.header} className="full-header" {...dismissal.events}><button aria-label={msg("Chiudi il player")} onClick={dismissal.dismiss}><ChevronDown size={27}/></button><span>{msg("In ascolto")}</span><button aria-label={msg("Apri coda")} onClick={openQueue}><ListMusic size={25}/></button></header>
  <div ref={body} className="full-body"><div className="player-cover"><Artwork src={track.thumbnail} large/></div>
   <div className="track-identity">{album?.id && <button className="album-link" aria-label={msg("Apri album: {p0}", { p0: album.name })} onClick={() => openResource({ id: album.id, name: album.name, kind: 'album', artwork: track.thumbnail })}><ScrollText>{album.name}</ScrollText><ChevronRight size={18}/></button>}
    <div className="identity-title"><h1>{album?.id ? <button className="player-title-link" aria-label={msg("Apri album del brano: {p0}", { p0: track.title })} onClick={() => openResource({ id: album.id, name: album.name, kind: 'album', artwork: track.thumbnail })}><ScrollText>{track.title}</ScrollText></button> : <ScrollText>{track.title}</ScrollText>}</h1><button aria-label={liked ? msg("Rimuovi dai brani piaciuti") : msg("Salva nei brani piaciuti")} aria-pressed={liked} onClick={onLike}><Heart size={27} fill={liked ? 'currentColor' : 'none'}/></button></div>
    <button className="artist-link" onClick={() => person ? openResource({ id: person.id, name: person.name, kind: 'artist', artwork: null }) : searchArtist()}><ScrollText>{track.artist}</ScrollText></button>
   </div>
   <Seek key={track.videoId} position={state.position} duration={state.duration} playing={state.playing && !state.loading} onCommit={value => command({ type: 'seek', value })}/>
   <div className="transport"><button aria-label={msg("Riproduzione casuale")} aria-pressed={state.shuffle} onClick={() => command({ type: 'shuffle', value: !state.shuffle })}><Shuffle size={22}/></button><button aria-label={msg("Brano precedente")} onClick={() => command({ type: 'previous' })}><SkipBack size={30} fill="currentColor"/></button><button className="play-primary" aria-busy={state.loading} aria-label={state.playing ? msg("Pausa") : msg("Riproduci")} onClick={() => command({ type: state.playing ? 'pause' : 'play' })}>{state.loading ? <LoaderCircle size={30} className="spin"/> : state.playing ? <Pause size={30} fill="currentColor"/> : <Play size={30} fill="currentColor"/>}</button><button aria-label={msg("Brano successivo")} onClick={() => command({ type: 'next' })}><SkipForward size={30} fill="currentColor"/></button><button aria-label={msg("Ripetizione: {p0}", { p0: state.repeat === 'off' ? msg('disattivata') : state.repeat === 'one' ? msg('brano') : msg('coda') })} aria-pressed={state.repeat !== 'off'} onClick={() => command({ type: 'repeat', value: state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off' })}>{state.repeat === 'one' ? <Repeat1 size={23}/> : <Repeat size={23}/>}</button></div>
   {state.error && <div className="player-status"><div className="inline-error" role="alert"><p>{noticeText(state.error)}</p><button className="tonal" onClick={() => command({ type: 'retry' })}>{msg("Riprova")}</button></div></div>}
   <div className="player-utilities"><button aria-label={msg("Testi")} onClick={() => openUtility('lyrics')}><FileText size={23}/><span>{msg("Testi")}</span></button><button aria-label="Audio" onClick={() => openUtility('audio')}><SlidersHorizontal size={23}/><span>{msg("Audio")}</span></button><button aria-label={msg("Condividi")} onClick={share}><Share2 size={23}/><span>{msg("Condividi")}</span></button><button aria-label="Timer" onClick={() => openUtility('timer')}><Timer size={23}/><span>{msg("Timer")}</span></button></div>
  </div>{children}
 </Modal>;
}
const lyricCache = new Map<string, {
    plainLyrics: string | null;
    syncedLyrics: string | null;
    instrumental: boolean;
}>();
const lyricRequests = new Map<string, ReturnType<typeof nativePlayback.lyrics>>();
export function LyricsPanel({ track, position, seek }: {
    track: NativeTrack;
    position: number;
    seek: (value: number) => void;
}) {
    const panel = useRef<HTMLDivElement>(null);
    const [document, setDocument] = useState<ParsedLyrics | null>(null), [loading, setLoading] = useState(true), [message, setMessage] = useState(''), [attempt, setAttempt] = useState(0), [follow, setFollow] = useState(true);
    const refs = useRef<Map<number, HTMLButtonElement>>(new Map());
    useEffect(() => {
        let active = true;
        setDocument(null);
        setLoading(true);
        setMessage('');
        setFollow(true);
        const key = JSON.stringify([track.videoId, track.title, track.artist, track.duration, track.artists]);
        const previous = lyricCache.get(key);
        let request = lyricRequests.get(key);
        if (!previous && !request) {
            request = nativePlayback.lyrics({ track }).finally(() => { lyricRequests.delete(key); });
            lyricRequests.set(key, request);
        }
        (previous ? Promise.resolve(previous) : request!).then(value => {
            if (!active)
                return;
            lyricCache.delete(key);
            if (value.instrumental || value.plainLyrics?.trim() || value.syncedLyrics?.trim())
                lyricCache.set(key, value);
            if (lyricCache.size > 30)
                lyricCache.delete(lyricCache.keys().next().value!);
            if (value.instrumental) {
                setMessage(msg("Brano strumentale"));
                return;
            }
            let parsed: ParsedLyrics | null = null;
            if (value.syncedLyrics) {
                try {
                    parsed = parseLyrics(value.syncedLyrics, 'lrc');
                }
                catch { }
            }
            if (!parsed && value.plainLyrics) {
                try {
                    parsed = parseLyrics(value.plainLyrics, 'txt');
                }
                catch { }
            }
            setDocument(parsed);
            if (!parsed)
                setMessage(msg("Testo non trovato per questo brano."));
        }).catch(error => {
            if (active)
                setMessage(error?.code === 'LYRICS_RATE_LIMIT' ? msg("La fonte dei testi richiede una pausa. Riprova tra poco.") : msg("Il servizio dei testi non risponde. Riprova tra poco."));
        }).finally(() => {
            if (active)
                setLoading(false);
        });
        return () => { active = false; };
    }, [track.videoId, track.title, track.artist, track.duration, attempt]);
    const index = document ? activeLyricsLine(document.lines, position, document.offsetMs) : -1;
    useEffect(() => {
        const container = panel.current?.closest('.sheet-content');
        if (!container)
            return;
        const stop = () => setFollow(false);
        container.addEventListener('wheel', stop, { passive: true });
        container.addEventListener('touchmove', stop, { passive: true });
        return () => { container.removeEventListener('wheel', stop); container.removeEventListener('touchmove', stop); };
    }, []);
    useEffect(() => {
        if (follow && index >= 0)
            refs.current.get(index)?.scrollIntoView({ block: 'center', behavior: globalThis.document.documentElement.dataset.reduceMotion === 'true' || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    }, [index, follow]);
    return <div ref={panel} className="lyrics-panel"><div className="lyrics-toolbar"><span>{track.title}{" " + msg("\u00B7") + " "}{track.artist}</span>{!!document?.lines.length && <button className="tonal" aria-pressed={follow} onClick={() => setFollow(!follow)}>{follow ? msg("Segui il testo") : msg("Riprendi scorrimento")}</button>}</div>
  {loading ? <Skeleton /> : document ? <div className="lyrics-reading" onWheel={() => setFollow(false)} onTouchMove={() => setFollow(false)}>{document.lines.length ? document.lines.map((line, i) => <button ref={el => {
                    if (el)
                        refs.current.set(i, el);
                    else
                        refs.current.delete(i);
                }} key={`${line.at}:${i}`} className={index === i ? 'lyric-line is-active' : 'lyric-line'} aria-label={msg("Vai a {p0}:{p1}: {p2}", { p0: Math.floor(line.at / 60), p1: String(Math.floor(line.at % 60)).padStart(2, '0'), p2: line.text || msg("Pausa strumentale") })} onClick={() => seek(line.at)}>{line.text || '· · ·'}</button>) : <p className="plain-lyrics">{document.plainText}</p>}</div> : <Empty title={message || msg("Testo non disponibile")} action={<button className="tonal" onClick={() => { lyricCache.delete(JSON.stringify([track.videoId, track.title, track.artist, track.duration, track.artists])); setAttempt(v => v + 1); }}>{msg("Riprova")}</button>}/>}
  <p className="source-date">{msg("Testi: LRCLIB")}{document?.lines.length ? ' · sincronizzati' : document ? ' · testo completo' : ''}</p>
 </div>;
}
function BandControl({ band, min, max, onCommit, disabled }: {
    band: MobileAudio['bands'][number];
    min: number;
    max: number;
    onCommit: (value: number) => void;
    disabled: boolean;
}) {
    const draft = useRangeDraft(band.level, onCommit), value = draft.value;
    return <label className="band-control"><span>{band.frequency >= 1000 ? msg("{p0} kHz", { p0: +(band.frequency / 1000).toFixed(1) }) : msg("{p0} Hz", { p0: band.frequency })}<output>{value > 0 ? '+' : ''}{value}{" " + msg("dB")}</output></span><input aria-label={msg("Equalizzatore {p0} Hz", { p0: band.frequency })} type="range" min={min} max={max} step={.5} value={value} disabled={disabled} style={{ '--fill': `${(value - min) / (max - min) * 100}%` } as CSSProperties} onChange={event => draft.change(Number(event.target.value))} onPointerUp={draft.commit} onPointerCancel={draft.cancel} onKeyUp={draft.keyUp} onBlur={draft.commit}/></label>;
}
export function AudioPanel({ audio, volume, changeVolume, command }: {
    audio: MobileAudio | null;
    volume: number;
    changeVolume: (value: number) => void;
    command: (input: Record<string, unknown>) => void;
}) { return <div className="audio-panel"><h3>{msg("Volume del player")}</h3><VolumeControl value={volume} onChange={changeVolume}/><div className="section-heading"><h3>{msg("Equalizzatore")}</h3>{audio?.available && <button className="tonal" aria-pressed={audio.enabled} onClick={() => command({ type: 'equalizer', enabled: !audio.enabled })}>{audio.enabled ? msg("Attivo") : msg("Disattivato")}</button>}</div>{!audio ? <Skeleton /> : audio.available ? <>{audio.bands.map(band => <BandControl key={band.index} band={band} min={audio.min} max={audio.max} disabled={!audio.enabled} onCommit={level => command({ type: 'band', index: band.index, level })}/>)}<p className="source-date">{msg("Bande disponibili per la sessione audio del dispositivo.")}</p></> : <p className="intro">{msg("L'equalizzatore non \u00E8 disponibile per la sessione audio attuale. Il volume resta utilizzabile.")}</p>}</div>; }
export function TimerPanel({ audio, command }: {
    audio: MobileAudio | null;
    command: (input: Record<string, unknown>) => void;
}) { return <div className="timer-panel"><p className="intro">{msg("Scegli quando mettere in pausa la musica. Il timer \u00E8 gestito dal player Android anche a schermo bloccato.")}</p>{audio?.sleepAtEnd ? <p className="timer-status" role="status">{msg("Pausa alla fine del brano attuale")}</p> : audio?.sleepUntil ? <p className="timer-status" role="status">{msg("Arresto alle") + " "}{new Date(audio.sleepUntil).toLocaleTimeString(formatLocale(), { hour: '2-digit', minute: '2-digit' })}</p> : null}<button className="tonal timer-end" disabled={!audio} aria-pressed={!!audio?.sleepAtEnd} onClick={() => command({ type: 'sleepEnd' })}>{msg("Alla fine del brano")}</button><div className="timer-options">{[15, 30, 45, 60, 90].map(minutes => <button className="tonal" disabled={!audio} key={minutes} onClick={() => command({ type: 'sleep', minutes })}>{minutes}{" " + msg("minuti")}</button>)}</div>{(audio?.sleepUntil || audio?.sleepAtEnd) && <button className="text-action" onClick={() => command({ type: 'sleep', minutes: 0 })}>{msg("Annulla timer")}</button>}<p className="source-date">{msg("Il cambio manuale del brano annulla il timer a fine brano. Un timer in minuti lo sostituisce.")}</p></div>; }
