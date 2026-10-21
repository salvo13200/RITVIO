import {useTranslation} from '../../../packages/i18n/react';
import { noticeText } from './i18n';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Share2, X, Music2, Quote, Download, Link2, LoaderCircle, Check, RotateCcw, ImageOff } from 'lucide-react';
import { api } from './api';
import { t } from './i18n';
import { animateUI, useMotionMode } from './ui-motion';
import { useStoryShare } from './story-share-state';
import { renderStory, storyBlob, type StoryMode } from './story-canvas';
import { excerptRows, selectedExcerpt, chooseExcerpt, excerptRange, excerptLimits, type ExcerptSelection, type ExcerptProblem } from '../../../packages/domain/story-sharing';
import {ritvioTrackLink,sharedTrackMessage} from '../../../packages/domain/track-sharing';
import type { LyricsDocument } from '../../../packages/domain/lyrics';
import type { Track } from '../../../packages/domain/index';
export function StoryShareButton({ track }: {
    track: Track | undefined;
}) {
    const opened = useStoryShare(s => s.session?.track.id === track?.id && !!s.session);
    return <button type="button" id="story-share-trigger" className={`icon-button ${opened ? 'active' : ''}`} aria-label={t('story.open')} title={t('story.open')} aria-haspopup="dialog" aria-expanded={opened} disabled={!track} onClick={() => track && useStoryShare.getState().open(track)}><Share2 size={19}/></button>;
}
export function ShareStoryAction({ track }: {
    track: Track;
}) { return <button type="button" className="icon-button" aria-label={t('story.openTrack', { title: track.title })} onClick={() => useStoryShare.getState().open(track)}><Share2 size={17}/><span>{t('story.title')}</span></button>; }
export function StorySharingRoot() {
    const session = useStoryShare(s => s.session);
    return session ? createPortal(<StoryComposer key={session.revision} track={session.track} opener={session.opener}/>, document.body) : null;
}
function message(error: unknown) { return error instanceof Error ? error.message : t('story.retry'); }
function StoryComposer({ track, opener }: {
    track: Track;
    opener: HTMLElement | null;
}) {
    const {t:common}=useTranslation('common');
    const dialog = useRef<HTMLDialogElement>(null), canvas = useRef<HTMLCanvasElement>(null), preview = useRef<HTMLDivElement>(null), picture = useRef<ImageBitmap | null>(null), copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const alive = useRef(true), savingLock = useRef(false);
    const motion = useMotionMode();
    const [mode, setMode] = useState<StoryMode>('track'), [artwork, setArtwork] = useState<'loading' | 'ready' | 'missing'>('loading'), [allowFallback, setAllowFallback] = useState(false), [retry, setRetry] = useState(0), [paintedFor, setPaintedFor] = useState<string | null>(null), [paintVersion, setPaintVersion] = useState(0), [metadataTruncated, setMetadataTruncated] = useState(false);
    const [lyrics, setLyrics] = useState<LyricsDocument | null>(null), [lyricsBusy, setLyricsBusy] = useState(true), [lyricsError, setLyricsError] = useState<string | null>(null), [lyricsRetry, setLyricsRetry] = useState(0);
    const [selectionState, setSelectionState] = useState<{
        selection: ExcerptSelection | null;
        problem: ExcerptProblem | null;
    }>({ selection: null, problem: null });
    const [error, setError] = useState<string | null>(null), [saving, setSaving] = useState(false), [saved, setSaved] = useState(false), [copied, setCopied] = useState<false|'link'|'text'>(false);
    const rows = lyrics ? excerptRows(lyrics) : [], range = excerptRange(selectionState.selection), excerpt = selectedExcerpt(rows, range);
    const selectionProblem = selectionState.problem ?? (range ? excerpt.problem : null);
    const previewKey = JSON.stringify([mode, excerpt.text, excerpt.problem, artwork, paintVersion]), painted = paintedFor === previewKey;
    const close = () => {
        if (savingLock.current)
            return;
        useStoryShare.getState().close();
        requestAnimationFrame(() => {
            if (opener?.isConnected)
                opener.focus({ preventScroll: true });
            else
                document.getElementById('story-share-trigger')?.focus({ preventScroll: true });
        });
    };
    useEffect(() => {
        alive.current = true;
        dialog.current?.showModal();
        const animation = dialog.current && animateUI(dialog.current, 'panel');
        return () => { alive.current = false; clearTimeout(copyTimer.current); animation?.cancel(); dialog.current?.close(); picture.current?.close(); picture.current = null; };
    }, []);
    useEffect(() => {
        const controller = new AbortController();
        let image: ImageBitmap | null = null;
        setArtwork('loading');
        setAllowFallback(false);
        setPaintedFor(null);
        void (async () => {
            try {
                const blob = await api.artwork(track.id, controller.signal);
                image = await createImageBitmap(blob);
                if (image.width > 8192 || image.height > 8192 || image.width * image.height > 16000000)
                    throw Error('ARTWORK_TOO_LARGE');
                if (controller.signal.aborted) {
                    image.close();
                    return;
                }
                picture.current?.close();
                picture.current = image;
                setArtwork('ready');
                setPaintVersion(v => v + 1);
            }
            catch {
                image?.close();
                if (!controller.signal.aborted) {
                    picture.current?.close();
                    picture.current = null;
                    setArtwork('missing');
                    setPaintVersion(v => v + 1);
                }
            }
        })();
        return () => controller.abort();
    }, [track, retry]);
    useEffect(() => {
        const controller = new AbortController();
        setLyricsBusy(true);
        setLyricsError(null);
        setLyrics(null);
        setSelectionState({ selection: null, problem: null });
        void api.lyrics.get(track.id, controller.signal).then(response => {
            if (!controller.signal.aborted)
                setLyrics(response.status === 'ready' ? response.document : null);
        }).catch(error => {
            if (!controller.signal.aborted)
                setLyricsError(message(error));
        }).finally(() => {
            if (!controller.signal.aborted)
                setLyricsBusy(false);
        });
        return () => controller.abort();
    }, [track, lyricsRetry]);
    useEffect(() => {
        let cancelled = false;
        setPaintedFor(null);
        setSaved(false);
        const target = canvas.current;
        // Draw privately, then publish only the latest accepted selection. A stale
        // font/image completion cannot overwrite the preview or enable its export.
        const working = document.createElement('canvas');
        if (target && artwork !== 'loading')
            void renderStory(working, track, picture.current, mode, excerpt.problem ? '' : excerpt.text).then(result => {
                if (!cancelled) {
                    target.width = working.width;
                    target.height = working.height;
                    target.getContext('2d')!.drawImage(working, 0, 0);
                    setMetadataTruncated(result.metadataTruncated);
                    setPaintedFor(previewKey);
                    setError(null);
                    if (preview.current)
                        animateUI(preview.current, 'surface');
                }
            }).catch(error => {
                if (!cancelled)
                    setError(t(error instanceof Error && error.message === 'STORY_TEXT_DOES_NOT_FIT' ? 'story.textDoesNotFit' : 'story.paintError'));
            });
        return () => { cancelled = true; };
    }, [previewKey, track, motion]);
    const choose = (index: number) => setSelectionState(previous => chooseExcerpt(rows, previous.selection, index));
    const available = painted && (artwork === 'ready' || allowFallback) && (mode === 'track' || !excerpt.problem) && !saving;
    const save = async () => {
        if (!available || !canvas.current || savingLock.current)
            return;
        savingLock.current = true;
        setSaving(true);
        setError(null);
        try {
            const blob = await storyBlob(canvas.current);
            let completed = false;
            if (window.ritvio)
                completed = (await window.ritvio.exportStory(new Uint8Array(await blob.arrayBuffer()), track.title)).saved;
            else {
                const url = URL.createObjectURL(blob), anchor = document.createElement('a');
                anchor.href = url;
                anchor.download = `RITVIO-${track.videoId}.png`;
                anchor.click();
                setTimeout(() => URL.revokeObjectURL(url), 10000);
                completed = true;
            }
            if (alive.current)
                setSaved(completed);
        }
        catch (error) {
            if (alive.current)
                setError(t('story.saveError', { reason: message(error) }));
        }
        finally {
            savingLock.current = false;
            if (alive.current) {
                setSaving(false);
                requestAnimationFrame(() => {
                    if (document.activeElement === document.body)
                        dialog.current?.querySelector<HTMLButtonElement>('.story-close')?.focus({ preventScroll: true });
                });
            }
        }
    };
    const copy = async (withText=false) => {
        setError(null);
        try {
            if (window.ritvio)
                await window.ritvio.copyTrackLink(track,withText);
            else
                await navigator.clipboard.writeText(withText?sharedTrackMessage(track,common('share.credit')):ritvioTrackLink(track));
            if (!alive.current)
                return;
            setCopied(withText?'text':'link');
            clearTimeout(copyTimer.current);
            copyTimer.current = setTimeout(() => setCopied(false), 2200);
        }
        catch (error) {
            if (alive.current)
                setError(t('story.copyError', { reason: message(error) }));
        }
    };
    const unavailable = lyricsBusy ? t('story.lyricsLoading') : lyricsError ?? t(lyrics?.instrumental ? 'story.instrumental' : 'story.lyricsMissing');
    const header = <header className="story-composer-heading"><h2 id="story-heading">{t('story.title')}</h2><button type="button" className="icon-button story-close" aria-label={t('story.close')} disabled={saving} onClick={close}><X size={22}/></button></header>;
    return <dialog ref={dialog} className="story-dialog" data-mode={mode} aria-labelledby="story-heading" onKeyDown={event => {
            if (event.key !== 'Tab')
                return;
            const focusable = Array.from(dialog.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')).filter(element => element.getClientRects().length > 0), first = focusable[0], last = focusable.at(-1);
            if (!first) {
                event.preventDefault();
                return;
            }
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
            }
            else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }} onCancel={event => { event.preventDefault(); close(); }} onClick={event => {
            if (event.target === dialog.current)
                close();
        }}>
    {mode === 'track' && header}
    <div className="story-workspace"><section className="story-preview-pane" aria-label={t('story.preview')}><div className="story-preview" ref={preview} aria-busy={!painted && !error}>
      <canvas ref={canvas} role="img" aria-label={mode === 'lyrics' && !excerpt.problem ? t('story.previewLyrics', { title: track.title, artist: track.artist, text: excerpt.text }) : t('story.previewTrack', { title: track.title, artist: track.artist })}/>
      {(artwork === 'loading' || !painted && !error) && <div className="story-preview-status" role="status"><LoaderCircle className="spin" size={24}/>{t('story.preparing')}</div>}
      {!painted && error && <div className="story-preview-status">{t('story.previewUnavailable')}</div>}
      {painted && mode === 'lyrics' && excerpt.problem && <p className="story-preview-status">{t('story.selectPreview')}</p>}
    </div><p className="story-preview-caption">{t('story.imageOnly')}</p></section>
    <section className="story-controls">{mode === 'lyrics' && header}
      <div className="story-modes" role="group" aria-label={t('story.mode')}>{(['track', 'lyrics'] as const).map(value => <button key={value} type="button" aria-pressed={mode === value} disabled={saving} onClick={() => { setMode(value); setError(null); }}>{value === 'track' ? <Music2 size={20}/> : <Quote size={20}/>} {t(value === 'track' ? 'story.track' : 'story.lyrics')}</button>)}</div>
      <div className="story-selection">
      {mode === 'track' ? <div className="story-track-intro"><h3>{t('story.trackContent')}</h3><p>{t('story.trackDescription')}</p></div> : <><div className="story-selection-heading"><h3>{t('story.select')}</h3><p id="story-selection-help">{t(selectionState.selection ? 'story.chooseEnd' : 'story.chooseStart', { anchor: (selectionState.selection?.anchor ?? 0) + 1 })}</p><output aria-live="polite" aria-atomic="true">{t('story.counter', { characters: excerpt.characters, lines: excerpt.lines, max: excerptLimits.lines })}</output></div>
        {lyricsBusy || !lyrics ? <div className="story-lyrics-empty" role="status">{lyricsBusy && <LoaderCircle className="spin" size={22}/>}<p>{unavailable}</p>{lyricsError && <button className="secondary-button" onClick={() => setLyricsRetry(v => v + 1)}>{t('story.retry')}</button>}</div> : <><p className="story-source">{t('story.originalRows')}</p><ol className="story-lines" aria-describedby="story-selection-help">{rows.map((row, index) => <li key={index} className={`${range && index >= range.start && index <= range.end ? 'selected' : ''} ${range?.start === index ? 'range-start' : ''} ${range?.end === index ? 'range-end' : ''}`}><button type="button" disabled={saving} aria-disabled={!!selectionState.selection && Math.abs(index - selectionState.selection.anchor) + 1 > excerptLimits.lines} aria-pressed={!!range && index >= range.start && index <= range.end} aria-label={t('story.row', { number: index + 1, text: row || t('story.blank') })} onClick={() => choose(index)}>{row || <span className="story-blank">{t('story.blank')}</span>}</button></li>)}</ol><button className="text-button story-reset" disabled={saving || !range} onClick={() => { setSelectionState({ selection: null, problem: null }); }}><RotateCcw size={15}/>{t('story.reset')}</button></>}
        {selectionProblem && <p className="story-warning" role="status">{t(selectionProblem === 'lines' ? 'story.tooManyLines' : selectionProblem === 'whole' ? 'story.whole' : 'story.empty', { max: excerptLimits.lines })}</p>}
        {lyrics?.provider === 'lrclib' && <p className="story-source">{t('story.source')}</p>}
      </>}
      {artwork === 'missing' && <div className="story-artwork-warning"><ImageOff size={18}/><p>{t('story.artworkMissing')}</p><button type="button" disabled={saving} onClick={() => setRetry(v => v + 1)}>{t('story.retry')}</button><button type="button" disabled={saving || allowFallback} onClick={() => setAllowFallback(true)}>{t(allowFallback ? 'story.fallbackActive' : 'story.withoutArtwork')}</button></div>}
      {metadataTruncated && <p className="story-source">{t('story.metadataShortened')}</p>}
      </div>
      <p className="story-source">{common('share.imageHint')}</p><button type="button" className="text-button" disabled={saving} onClick={() => void copy(true)}>{common(copied==='text'?'share.copyDone':'share.copyText')}</button>
      <div className="story-output"><h3>{t('story.format')}</h3><div><span>{t('story.ratio')}</span><strong>1080 × 1920</strong><span>PNG</span></div></div>
      {error && <p className="story-warning" role="alert">{noticeText(error)}</p>}
      <div className="story-actions"><button type="button" className="primary-button" disabled={!available} onClick={() => void save()}>{saving ? <LoaderCircle className="spin" size={20}/> : saved ? <Check size={20}/> : <Download size={20}/>} {t(saving ? 'story.saving' : saved ? 'story.saved' : 'story.save')}</button><button type="button" className="secondary-button" onClick={() => void copy()}>{copied==='link' ? <Check size={19}/> : <Link2 size={19}/>} {t(copied==='link' ? 'story.copied' : 'story.copy')}</button></div>
      <span className="sr-only" role="status">{saved ? t('story.saved') : copied==='text' ? common('share.copyDone') : copied==='link' ? t('story.copied') : ''}</span>
    </section></div>
  </dialog>;
}
