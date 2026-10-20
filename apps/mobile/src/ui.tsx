import {msg} from './messages';
import { useEffect, useLayoutEffect, useId, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { Music2, MoreHorizontal, X, ChevronLeft } from 'lucide-react';
import type { NativeTrack } from '../../../packages/domain/mobile';
import { mobileTime } from '../../../packages/domain/mobile';
import {Capacitor} from '@capacitor/core';
import {artworkSources} from './artwork';
export function Artwork({ src, large = false, round = false, eager = false, children }: {
    src?: string | null;
    large?: boolean;
    round?: boolean;
    eager?: boolean;
    children?: ReactNode;
}) {
    const source = src;
    const candidates = artworkSources(source?.startsWith('file://') ? Capacitor.convertFileSrc(source) : source, large);
    const identity = candidates.join('\n');
    const [failure, setFailure] = useState({identity, index: 0});
    const index = failure.identity === identity ? failure.index : 0;
    return <span className={`artwork${large ? ' artwork-large' : ''}${round ? ' artwork-round' : ''}`}>{candidates[index] ? <img src={candidates[index]} alt="" loading={large || eager ? 'eager' : 'lazy'} decoding="async" onError={() => setFailure({identity, index: index + 1})}/> : children ?? <Music2 aria-hidden="true"/>}</span>;
}
export function ScrollText({ children }: {
    children: string;
}) {
    const ref = useRef<HTMLSpanElement>(null);
    const [distance, setDistance] = useState(0);
    useEffect(() => { const element = ref.current; if (!element)
        return; const measure = () => setDistance(Math.max(0, (element.firstElementChild?.scrollWidth ?? 0) - element.clientWidth)); const resize = new ResizeObserver(measure); resize.observe(element); measure(); document.fonts.ready.then(measure).catch(() => { }); return () => resize.disconnect(); }, [children]);
    return <span ref={ref} className={`scroll-text${distance > 2 ? ' has-overflow' : ''}`} style={{ '--travel': `${-distance}px`, '--scroll-duration': `${Math.max(9, distance / 22 + 5)}s` } as CSSProperties}><span>{children}</span></span>;
}
export function TrackRow({ track, active = false, onPlay, onMore, number, showActivity = false, playing = false }: {
    track: NativeTrack;
    active?: boolean;
    onPlay: () => void;
    onMore?: () => void;
    number?: number;
    showActivity?: boolean;
    playing?: boolean;
}) {
    return <div className={`track-row${active ? ' is-current' : ''}`} aria-current={active ? 'true' : undefined}>
  {number !== undefined && <span className="track-number">{number}</span>}
  <button className="track-main" aria-label={msg("Riproduci {p0}", { p0: track.title })} onClick={onPlay}><Artwork src={track.thumbnail}/><span><strong>{track.title}</strong><small>{track.artist}</small></span></button>
  {active && showActivity && <span role="img" className={`track-activity${playing ? ' is-playing' : ''}`} aria-label={playing ? msg("In riproduzione") : msg("Brano attuale")}><i /><i /><i /></span>}
  {onMore && <button className="row-more" aria-label={msg("Opzioni: {p0}", { p0: track.title })} onClick={onMore}><MoreHorizontal size={23}/></button>}
 </div>;
}
let modalLocks = 0, previousOverflow = '';
function lockPage() {
    if (modalLocks++ === 0) {
        previousOverflow = document.documentElement.style.overflow;
        document.documentElement.style.overflow = 'hidden';
    }
    return () => { if (--modalLocks === 0)
        document.documentElement.style.overflow = previousOverflow; };
}
export function Modal({ label, children, onClose, full = false, inactive = false, workspace = false, onBack, actions }: {
    label: string;
    children: ReactNode;
    onClose: () => void;
    full?: boolean;
    inactive?: boolean;
    workspace?: boolean;
    onBack?: () => void;
    actions?: ReactNode;
}) {
    const ref = useRef<HTMLDialogElement>(null);
    const previousLabel=useRef(label);
    useLayoutEffect(()=>{if(previousLabel.current!==label)ref.current?.querySelector<HTMLElement>('.sheet-heading h2')?.focus({preventScroll:true});previousLabel.current=label;},[label]);
    useEffect(() => { const el = ref.current; if (el && !el.open)
        el.showModal(); const unlock = lockPage(); return () => { if (el?.open)
        el.close(); unlock(); }; }, []);
    return <dialog ref={ref} inert={inactive} aria-modal="true" className={full ? 'full-player' : `sheet${workspace ? ' utility-workspace' : ''}`} aria-label={label} onCancel={event => { event.preventDefault(); (onBack ?? onClose)(); }}>{full ? children : <><div className="sheet-heading">{workspace && <button aria-label={msg("Indietro")} onClick={onBack ?? onClose}><ChevronLeft size={26}/></button>}<h2 tabIndex={-1}>{label}</h2>{actions}<button aria-label={msg("Chiudi {p0}", { p0: label })} onClick={onClose}><X size={24}/></button></div><div className="sheet-content">{children}</div></>}</dialog>;
}
export function Seek({ position, duration, playing, onCommit }: {
    position: number;
    duration: number;
    playing: boolean;
    onCommit: (value: number) => void;
}) {
    const [preview, setPreview] = useState<number | null>(null);
    const [pending, setPending] = useState<number | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const id = useId().replaceAll(':', '');
    useEffect(() => { if (pending !== null && Math.abs(position - pending) < 1) {
        clearTimeout(timer.current);
        setPending(null);
    } }, [position, pending]);
    useEffect(() => () => clearTimeout(timer.current), []);
    const value = preview ?? pending ?? position, percent = duration > 0 ? Math.min(100, Math.max(0, value / duration * 100)) : 0;
    function commit(value: number) { setPreview(null); setPending(value); onCommit(value); clearTimeout(timer.current); timer.current = setTimeout(() => setPending(null), 2500); }
    const bars = Array.from({ length: 96 }, (_, index) => { const height = 5 + (Math.sin(index * 1.7) + Math.cos(index * .49) + 2) * 3; return <rect key={index} x={index * 4.17} y={14 - height / 2} width={2.8} height={height} rx={1.4} style={{ animationDelay: `${-index * .073}s` }}/>; });
    return <div className="seek-area"><div className={`wave-seek${playing ? ' is-playing' : ''}`}>
  {preview !== null && <output className="seek-tooltip" style={{ left: `clamp(42px,${percent}%,calc(100% - 42px))` }}>{mobileTime(preview)}</output>}
  <svg viewBox="0 0 400 28" preserveAspectRatio="none" aria-hidden="true"><defs><clipPath id={id}><rect width={percent * 4} height="28"/></clipPath></defs><g className="wave-base">{bars}</g><g className="wave-played" clipPath={`url(#${id})`}>{bars}</g></svg>
  <span className="seek-thumb" style={{ left: `${percent}%` }}/>
  <input type="range" aria-label={msg("Posizione del brano")} aria-valuetext={mobileTime(value)} min={0} max={Math.max(1, duration)} step={.1} value={Math.min(Math.max(1, duration), value)} disabled={duration <= 0} onChange={event => setPreview(Number(event.target.value))} onPointerUp={event => commit(Number(event.currentTarget.value))} onPointerCancel={() => setPreview(null)} onKeyUp={event => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key))
        commit(Number(event.currentTarget.value)); }}/>
 </div><div className="time-labels"><span>{mobileTime(value)}</span><span>{mobileTime(duration)}</span></div></div>;
}
export function Empty({ title, children, action }: {
    title: string;
    children?: ReactNode;
    action?: ReactNode;
}) { return <div className="empty-state"><Music2 size={34} aria-hidden="true"/><h2>{title}</h2>{children && <p>{children}</p>}{action}</div>; }
export function Skeleton() { return <div className="skeleton-list" role="status" aria-label={msg("Caricamento in corso")}>{[0, 1, 2, 3].map(i => <div className="skeleton-row" key={i}><i /><span /></div>)}</div>; }
export function Notice({ text }: {
    text: string;
}) { const ref = useRef<HTMLDivElement>(null); useEffect(() => { if (!text)
    return; const el = ref.current; try {
    el?.showPopover();
}
catch { } return () => { try {
    el?.hidePopover();
}
catch { } }; }, [text]); return text ? <div ref={ref} popover="manual" className="snackbar" role="status">{text}</div> : null; }
