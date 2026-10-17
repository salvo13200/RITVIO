import { noticeText } from './i18n';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { FileUp, Music2, RefreshCw, Search, TextCursorInput, MoreHorizontal, Play, Check } from 'lucide-react';
import type { Track } from '../../../packages/domain/index';
import { formatTime } from '../../../packages/domain/index';
import { activeLyricsLine, lyricsByteLimit, type LyricsResponse, type LyricsCandidate } from '../../../packages/domain/lyrics';
import { api } from './api';
import { t } from './i18n';
import { usePlayer } from './store';
import { seek } from './player';
import { Button, Cover } from './ui-controls';
export function LyricsPanel({ track, expanded = false }: {
    track?: Track;
    expanded?: boolean;
}) {
    return track ? <TrackLyrics key={track.videoId} track={track} expanded={expanded}/> : <div className="lyrics-empty"><TextCursorInput size={30} aria-hidden="true"/><h2>{t('lyrics.title')}</h2><p>{t('lyrics.start')}</p></div>;
}
function TrackLyrics({ track, expanded }: {
    track: Track;
    expanded: boolean;
}) {
    const Heading = expanded ? 'h1' : 'h2';
    const position = usePlayer(s => s.position);
    const [data, setData] = useState<LyricsResponse | null>(null), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false);
    const [mode, setMode] = useState<'sync' | 'plain'>('sync'), [follow, setFollow] = useState(true), [searchOpen, setSearchOpen] = useState(false);
    const [title, setTitle] = useState(track.title.slice(0, 200)), [artist, setArtist] = useState(track.artist.replace(/\s*-\s*Topic$/i, '').slice(0, 200));
    const [candidates, setCandidates] = useState<LyricsCandidate[] | null>(null);
    const [actionsOpen, setActionsOpen] = useState(false);
    const actions = useRef<HTMLDivElement>(null);
    const motion = usePlayer(s => s.uiLayout.motion);
    const request = useRef<AbortController | null>(null), scroll = useRef<HTMLDivElement>(null), file = useRef<HTMLInputElement>(null), sequence = useRef(0);
    async function run(action: (signal: AbortSignal) => Promise<void>) {
        request.current?.abort();
        const controller = new AbortController();
        request.current = controller;
        const version = ++sequence.current;
        setBusy(true);
        setError(null);
        try {
            await action(controller.signal);
        }
        catch (e) {
            if (!controller.signal.aborted && version === sequence.current)
                setError((e as Error).message);
        }
        finally {
            if (!controller.signal.aborted && version === sequence.current)
                setBusy(false);
        }
    }
    const load = (fresh = false) => run(async (signal) => {
        const value = await api.lyrics.get(track.id, signal, fresh);
        if (!signal.aborted)
            setData(value);
    });
    useEffect(() => { void load(); return () => { sequence.current++; request.current?.abort(); }; }, [track.id]);
    const doc = data?.document, index = doc ? activeLyricsLine(doc.lines, position, doc.offsetMs) : -1, synced = !!doc?.lines.length && mode === 'sync';
    useEffect(() => {
        if (!synced || !follow || index < 0)
            return;
        const area = scroll.current, active = area?.querySelector<HTMLElement>('[aria-current="true"]');
        if (!area || !active)
            return;
        const bounds = area.getBoundingClientRect(), line = active.getBoundingClientRect();
        area.scrollTo({ top: area.scrollTop + line.top - bounds.top - area.clientHeight * .38, behavior: motion === 'essential' || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    }, [index, synced, follow, motion]);
    async function find(e: FormEvent) {
        e.preventDefault();
        await run(async (signal) => {
            const value = await api.lyrics.search(track.id, title.trim(), artist.trim(), signal);
            if (!signal.aborted)
                setCandidates(value.items);
        });
    }
    const choose = (id: number) => run(async (signal) => {
        const value = await api.lyrics.select(track.id, id, signal);
        if (!signal.aborted) {
            setData(value);
            setSearchOpen(false);
            setCandidates(null);
            setMode('sync');
            setFollow(true);
        }
    });
    async function importFile(selected: File) {
        if (selected.size > lyricsByteLimit) {
            setError(t('lyrics.tooLarge'));
            return;
        }
        const extension = selected.name.split('.').at(-1)?.toLowerCase();
        if (extension !== 'txt' && extension !== 'lrc') {
            setError(t('lyrics.invalidFile'));
            return;
        }
        await run(async (signal) => {
            let text: string;
            try {
                text = new TextDecoder('utf-8', { fatal: true }).decode(await selected.arrayBuffer());
            }
            catch {
                throw new Error(t('lyrics.invalidFile'));
            }
            if (signal.aborted)
                return;
            const value = await api.lyrics.import(track.id, text, extension, selected.name.slice(0, 100), signal);
            if (!signal.aborted) {
                setData(value);
                setSearchOpen(false);
                setMode('sync');
                setFollow(true);
            }
        });
    }
    const remove = () => run(async (signal) => {
        await api.lyrics.remove(track.id, signal);
        const value = await api.lyrics.get(track.id, signal);
        if (!signal.aborted)
            setData(value);
    });
    const toggleActions = () => {
        const menu = actions.current, anchor = menu?.previousElementSibling;
        if (!menu || !anchor)
            return;
        const rect = anchor.getBoundingClientRect();
        menu.style.left = Math.max(12, Math.min(window.innerWidth - 252, rect.right - 240)) + 'px';
        menu.style.top = Math.max(12, Math.min(window.innerHeight - 220, rect.bottom + 8)) + 'px';
        menu.togglePopover();
    };
    return <section id={expanded ? 'lyrics-reader' : undefined} className={`lyrics-panel ${expanded ? 'lyrics-reader' : ''}`} aria-label={t('lyrics.title')}>
    <header className="lyrics-heading">{expanded && <Cover track={track}/>}<div className="lyrics-song-heading"><Heading>{track.title}</Heading><p>{track.artist}</p></div>
      {doc && !doc.instrumental && <div className="lyrics-reading-tools">{!!doc.lines.length && <div className="lyrics-modes" aria-label={t('lyrics.displayMode')}><button aria-pressed={mode === 'sync'} onClick={() => setMode('sync')}>{t('ui5.sync')}</button><button aria-pressed={mode === 'plain'} onClick={() => setMode('plain')}>{t('ui5.plain')}</button></div>}
      {synced && <button className="lyrics-follow" aria-pressed={follow} onClick={() => setFollow(!follow)}>{follow ? <Check size={16}/> : <Play size={16}/>} {t(follow ? 'ui5.followingLyrics' : 'ui5.resumeLyrics')}</button>}</div>}
      <div className="lyrics-action-disclosure" onKeyDown={event => {
            if (event.key === 'Escape' && actionsOpen) {
                event.preventDefault();
                actions.current?.hidePopover();
                event.currentTarget.querySelector<HTMLButtonElement>('.icon-button')?.focus();
            }
        }}><Button label={t('ui5.lyricsActions')} expanded={actionsOpen} onClick={toggleActions}><MoreHorizontal size={20}/></Button><div ref={actions} className="lyrics-tools" popover="auto" aria-label={t('ui5.lyricsActions')} onToggle={event => setActionsOpen((event.nativeEvent as ToggleEvent).newState === 'open')}><button className="secondary-button" disabled={busy} aria-expanded={searchOpen} onClick={() => { setSearchOpen(!searchOpen); actions.current?.hidePopover(); }}><Search size={16}/>{t('lyrics.findVersion')}</button><button className="secondary-button" disabled={busy} onClick={() => { file.current?.click(); actions.current?.hidePopover(); }}><FileUp size={16}/>{t('lyrics.import')}</button><button className="secondary-button" disabled={busy} onClick={() => { void load(true); actions.current?.hidePopover(); }}><RefreshCw size={16}/>{t('lyrics.retry')}</button></div></div>
    </header>
    <input ref={file} type="file" accept=".lrc,.txt" hidden aria-label={t('lyrics.import')} onChange={e => {
            const selected = e.target.files?.[0];
            e.target.value = '';
            if (selected)
                void importFile(selected);
        }}/>
    {searchOpen && <form className="lyrics-search" onSubmit={find}><label>{t('lyrics.trackTitle')}<input value={title} maxLength={200} required onChange={e => setTitle(e.target.value)}/></label><label>{t('lyrics.artist')}<input value={artist} maxLength={200} required onChange={e => setArtist(e.target.value)}/></label><button className="secondary-button" disabled={busy || !title.trim() || !artist.trim()}>{t('lyrics.search')}</button><p>{t('lyrics.versionHint')}</p>
      {candidates && <div className="lyrics-candidates" aria-label={t('lyrics.versions')}>{candidates.length ? candidates.map(candidate => <button type="button" disabled={busy} key={candidate.id} onClick={() => void choose(candidate.id)}><strong>{candidate.title}</strong><span>{candidate.artist} · {formatTime(candidate.duration)}</span><small>{candidate.album} · {t(candidate.instrumental ? 'lyrics.instrumental' : candidate.synced ? 'lyrics.synced' : 'lyrics.plain')}</small></button>) : <p role="status">{t('lyrics.noVersions')}</p>}</div>}
    </form>}
    {error && <p className="lyrics-error" role="alert">{noticeText(error)}</p>}
    {busy && <div className="lyrics-loading" role="status" aria-label={t('lyrics.loading')}><span /><span /><span /></div>}
    {!busy && !data && !error && <p role="status">{t('lyrics.loading')}</p>}
    {!busy && data?.status === 'missing' && <div className="lyrics-empty"><TextCursorInput size={28} aria-hidden="true"/><h3>{t('lyrics.missing')}</h3><p>{t('lyrics.missingHint')}</p></div>}
    {doc && <>
      <div className="lyrics-source"><span>{doc.provider === 'local' ? t('lyrics.localSource', { file: doc.fileName ?? '' }) : t('lyrics.onlineSource')}</span>{doc.provider === 'lrclib' && <button onClick={() => void window.ritvio?.openLyricsSource(doc.providerId!)}>{t('lyrics.viewSource')}</button>}</div>
      {doc.title !== track.title && <p className="lyrics-edition">{t('lyrics.edition', { title: doc.title, artist: doc.artist })}</p>}
      {doc.instrumental ? <div className="lyrics-empty"><Music2 size={30} aria-hidden="true"/><h3>{t('lyrics.instrumental')}</h3><p>{t('lyrics.instrumentalHint')}</p></div> : <>
        <div ref={scroll} className={`lyrics-scroll ${synced ? 'is-synced' : ''}`} tabIndex={0} aria-label={t('lyrics.reading')} onWheel={() => { setFollow(false); scroll.current?.scrollTo({ top: scroll.current.scrollTop, behavior: 'instant' }); }} onTouchMove={() => setFollow(false)} onKeyDown={e => {
                    if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End'].includes(e.key))
                        setFollow(false);
                }}>
          {synced ? doc.lines.map((line, i) => <button className="lyric-line" type="button" key={i} aria-current={i === index ? 'true' : undefined} aria-label={t('lyrics.jump', { time: formatTime(Math.max(0, line.at - doc.offsetMs / 1000)), line: line.text || t('lyrics.instrumentalPause') })} onClick={() => seek(Math.max(0, line.at - doc.offsetMs / 1000))}>{line.text || <Music2 size={22} aria-hidden="true"/>}</button>) : <p className="lyrics-plain">{doc.plainText}</p>}
        </div>
      </>}
      {data?.savedChoice && <button className="lyrics-remove" disabled={busy} onClick={() => void remove()}>{t('lyrics.resetChoice')}</button>}
    </>}
    <p className="lyrics-footnote">{t('lyrics.importHint')}</p>
  </section>;
}
