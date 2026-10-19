import { noticeText } from './messages';
import { msg } from './messages';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Download, Share2, Link, Music2, Quote, RotateCcw, LoaderCircle, ArrowRight } from 'lucide-react';
import { nativePlayback } from './native';
import { Artwork, Modal } from './ui';
import { SavedNotice } from './saved-notice';
import type { NativeTrack } from '../../../packages/domain/mobile';
import { parseLyrics } from '../../../packages/domain/lyrics';
import { chooseExcerpt, excerptRows, excerptRange, selectedExcerpt, excerptLimits, type ExcerptSelection, type ExcerptProblem } from '../../../packages/domain/story-sharing';
import { renderStory, storyBlob, type StoryMode } from '../../../packages/browser/story-canvas';
export function StoryComposer({ track, preview, onPreview, onBack, onClose, initialMode = 'track' }: {
    track: NativeTrack;
    preview: boolean;
    onPreview: () => void;
    onBack: () => void;
    onClose: () => void;
    initialMode?: StoryMode;
}) {
    const [mode, setMode] = useState<StoryMode>(initialMode), [art, setArt] = useState<'loading' | 'ready' | 'missing'>('loading'), [fallback, setFallback] = useState(false), [artRetry, setArtRetry] = useState(0);
    const [rows, setRows] = useState<string[] | null>(null), [lyricsBusy, setLyricsBusy] = useState(false), [lyricsError, setLyricsError] = useState(''), [lyricsRetry, setLyricsRetry] = useState(0);
    const [choice, setChoice] = useState<{
        selection: ExcerptSelection | null;
        problem: ExcerptProblem | null;
    }>({ selection: null, problem: null });
    const [painted, setPainted] = useState(''), [paintError, setPaintError] = useState(''), [metadataTruncated, setMetadataTruncated] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
    const [saved, setSaved] = useState<{
        id: number;
        text: string;
    } | null>(null), savedId = useRef(0);
    const canvas = useRef<HTMLCanvasElement>(null), picture = useRef<ImageBitmap | null>(null), alive = useRef(true), lock = useRef(false);
    const list=useRef<HTMLOListElement>(null),listScroll=useRef(0),previousPreview=useRef(preview);
    const range = excerptRange(choice.selection), excerpt = selectedExcerpt(rows ?? [], range), problem = choice.problem ?? (range ? excerpt.problem : null);
    const key = JSON.stringify([mode, excerpt.text, excerpt.problem, art, fallback, artRetry]);
    useLayoutEffect(()=>{
        if(previousPreview.current&&!preview&&list.current){list.current.scrollTop=listScroll.current;list.current.querySelector<HTMLButtonElement>(`li:nth-child(${(choice.selection?.focus??0)+1}) button`)?.focus({preventScroll:true});}
        previousPreview.current=preview;
    },[preview]);
    function beginPreview(){listScroll.current=list.current?.scrollTop??0;onPreview();}
    useEffect(() => { alive.current = true; return () => { alive.current = false; picture.current?.close(); picture.current = null; }; }, []);
    useEffect(() => {
        let cancelled = false;
        setArt('loading');
        setFallback(false);
        void nativePlayback.storyArtwork({ videoId: track.videoId, thumbnail: track.thumbnail }).then(async ({ dataUrl }) => {
            if (!/^data:image\/(jpeg|png|webp);base64,/.test(dataUrl) || dataUrl.length > 1500000)
                throw Error();
            const image = await createImageBitmap(await (await fetch(dataUrl)).blob());
            if (cancelled) {
                image.close();
                return;
            }
            picture.current?.close();
            picture.current = image;
            setArt('ready');
        }).catch(() => {
            if (!cancelled) {
                picture.current?.close();
                picture.current = null;
                setArt('missing');
            }
        });
        return () => { cancelled = true; };
    }, [track.videoId, artRetry]);
    useEffect(() => {
        if (mode !== 'lyrics' || rows !== null)
            return;
        let cancelled = false;
        setLyricsBusy(true);
        setLyricsError('');
        void nativePlayback.lyrics({ track }).then(value => {
            if (cancelled)
                return;
            if (value.instrumental) {
                setRows([]);
                setLyricsError(msg("Questo brano \u00E8 strumentale."));
                return;
            }
            if (!value.plainLyrics?.trim() && !value.syncedLyrics?.trim()) {
                setRows([]);
                setLyricsError(msg("Non ci sono versi disponibili per questo brano."));
                return;
            }
            const parsed = value.plainLyrics?.trim() ? parseLyrics(value.plainLyrics, 'txt') : parseLyrics(value.syncedLyrics!, 'lrc');
            setRows(excerptRows(parsed));
        }).catch(error => {
            if (!cancelled)
                setLyricsError(error?.code === 'LYRICS_RATE_LIMIT' ? msg("La fonte dei testi richiede una pausa. Riprova tra poco.") : msg("Testo non disponibile. Controlla la connessione e riprova."));
        }).finally(() => {
            if (!cancelled)
                setLyricsBusy(false);
        });
        return () => { cancelled = true; };
    }, [mode, track, lyricsRetry]);
    useEffect(() => {
        let cancelled = false;
        setPainted('');
        setPaintError('');
        setMessage('');
        const target = canvas.current;
        if (!target || art === 'loading')
            return;
        const work = document.createElement('canvas');
        void renderStory(work, track, picture.current, mode, excerpt.problem ? '' : excerpt.text).then(result => {
            if (cancelled)
                return;
            target.width = work.width;
            target.height = work.height;
            target.getContext('2d')!.drawImage(work, 0, 0);
            setMetadataTruncated(result.metadataTruncated);
            setPainted(key);
        }).catch(e => {
            if (!cancelled)
                setPaintError(e instanceof Error && e.message === 'STORY_TEXT_DOES_NOT_FIT' ? msg("Questi versi non entrano nella card. Riduci l\u2019intervallo.") : msg("Anteprima non disponibile. Riprova riaprendo Condividi."));
        });
        return () => { cancelled = true; };
    }, [key, track, preview]);
    const available = painted === key && (art === 'ready' || fallback) && (mode === 'track' || !excerpt.problem) && !busy;
    async function send(save: boolean) {
        if (!available || !canvas.current || lock.current)
            return;
        lock.current = true;
        setBusy(true);
        setError('');
        setMessage('');
        setSaved(null);
        try {
            const blob = await storyBlob(canvas.current);
            if (blob.size > 8 * 1024 * 1024)
                throw Error(msg("Immagine troppo grande. Riduci i versi e riprova."));
            const base64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(Error(msg("Immagine non leggibile."))); reader.readAsDataURL(blob); });
            if (!alive.current)
                return;
            const result = await nativePlayback.exportStory({ videoId: track.videoId, base64, save });
            if (alive.current) {
                if (result.status === 'saved')
                    setSaved({ id: ++savedId.current, text: result.destination === 'gallery' ? msg("Immagine salvata in Galleria \u00B7 {p0}.", { p0: result.album ?? 'RITVIO' }) : msg("Immagine salvata.") });
                else
                    setMessage(result.status === 'opened' ? msg("Pannello di condivisione aperto.") : msg("Salvataggio annullato."));
            }
        }
        catch (e) {
            if (alive.current)
                setError(e instanceof Error ? e.message : msg("Esportazione non riuscita. Riprova."));
        }
        finally {
            lock.current = false;
            if (alive.current)
                setBusy(false);
        }
    }
    async function link() {
        if (lock.current)
            return;
        lock.current = true;
        setBusy(true);
        setError('');
        setSaved(null);
        try {
            await nativePlayback.share({ track });
            if (alive.current)
                setMessage(msg("Pannello di condivisione del link aperto."));
        }
        catch {
            if (alive.current)
                setError(msg("Condivisione del link non disponibile. Riprova."));
        }
        finally {
            lock.current = false;
            if (alive.current)
                setBusy(false);
        }
    }
    function reset() { setChoice({ selection: null, problem: null }); }
    const problemText = problem === 'lines' ? msg("Puoi scegliere fino a {p0} righe consecutive.", { p0: excerptLimits.lines }) : problem === 'whole' ? msg("Scegli un estratto: il testo completo resta escluso.") : '';
    return <Modal workspace label={preview ? msg("Anteprima card") : mode === 'lyrics' ? msg("Condividi versi") : msg("Condividi brano")} onBack={preview ? onBack : undefined} onClose={onClose}><div className={`mobile-story${mode === 'lyrics' && !preview ? ' is-selecting' : ' is-previewing'}`}>
  {mode === 'lyrics' && <p className="story-step">{preview ? msg("2 di 2 · Anteprima") : msg("1 di 2 · Seleziona i versi")}</p>}
  {!preview && <>
  <div className="sheet-track"><Artwork eager src={track.thumbnail}/><span><strong>{track.title}</strong><small>{track.artist}</small></span></div>
  <div className="transfer-modes" role="group" aria-label={msg("Contenuto della card")}><button className="tonal" aria-pressed={mode === 'track'} disabled={busy} onClick={() => setMode('track')}><Music2 size={20}/>{msg("Brano")}</button><button className="tonal" aria-pressed={mode === 'lyrics'} disabled={busy} onClick={() => setMode('lyrics')}><Quote size={20}/>{msg("Versi")}</button></div>
  </>}
  {mode === 'lyrics' && !preview ? <><section className="story-excerpt" aria-label={msg("Seleziona i versi")}>
   <p id="excerpt-help">{msg("Tocca la prima riga, poi l’ultima.")}<small>{msg("Fino a {p0} righe consecutive", {p0: excerptLimits.lines})}</small></p>
   {lyricsBusy && <p role="status"><LoaderCircle size={20} className="spin"/>{" " + msg("Carico il testo\u2026")}</p>}
   {lyricsError && <p role="status">{lyricsError}</p>}
   {!!lyricsError && !rows && <button className="tonal" onClick={() => setLyricsRetry(v => v + 1)}>{msg("Riprova testo")}</button>}
   {!!rows?.length && <><div className="story-selection-summary"><output aria-live="polite">{excerpt.lines}{" " + msg("/") + " "}{excerptLimits.lines}{" " + msg("righe")}</output><button className="text-action" disabled={busy || !choice.selection} onClick={reset}><RotateCcw size={18}/>{msg("Ricomincia")}</button></div>
    <ol ref={list} className="story-verse-list" aria-describedby="excerpt-help">{rows.map((row, index) => <li key={index} data-selected={!!range && index >= range.start && index <= range.end} data-boundary={range?.start === index ? 'start' : range?.end === index ? 'end' : undefined}><button disabled={busy} aria-pressed={!!range && index >= range.start && index <= range.end} aria-label={msg("Riga {p0}: {p1}", { p0: index + 1, p1: row || msg('Pausa') })} onClick={() => setChoice(previous => chooseExcerpt(rows, previous.selection, index))}><span className="sr-only">{index + 1}</span><span>{row || msg("Pausa")}</span></button></li>)}</ol></>}
   {problemText && <p className="import-warning" role="alert">{problemText}</p>}
  </section><div className="story-selection-footer"><span>{msg("{p0} righe selezionate", {p0: excerpt.lines})}</span><button className="primary" disabled={!!excerpt.problem || busy} onClick={beginPreview}>{msg("Anteprima card")}<ArrowRight size={23}/></button></div></> : <><div className="story-preview-scroll">
  <div className="story-mobile-preview" aria-busy={art === 'loading' || !painted && !paintError}>
   <canvas ref={canvas} role="img" aria-label={mode === 'lyrics' && !excerpt.problem ? msg("Card con versi di {p0}: {p1}", { p0: track.title, p1: excerpt.text }) : msg("Card di {p0}, {p1}, RITVIO", { p0: track.title, p1: track.artist })}/>
   {(art === 'loading' || !painted && !paintError) && <p className="story-preview-overlay" role="status"><LoaderCircle className="spin" size={24}/>{msg("Preparo l\u2019anteprima\u2026")}</p>}
   {mode === 'lyrics' && excerpt.problem && painted === key && <p className="story-preview-overlay">{msg("Seleziona i versi per vedere la card.")}</p>}
   {paintError && <p className="story-preview-overlay" role="alert">{paintError}</p>}
  </div>
  <p className="source-date">{msg("Immagine per le storie · 9:16")}</p>
  {art === 'missing' && <div className="story-art-missing"><p>{msg("Copertina non disponibile. Puoi riprovare oppure usare il simbolo di RITVIO.")}</p><div><button className="tonal" disabled={busy} onClick={() => setArtRetry(v => v + 1)}>{msg("Riprova copertina")}</button><button className="tonal" aria-pressed={fallback} disabled={busy} onClick={() => setFallback(true)}>{msg("Usa senza copertina")}</button></div></div>}
  {metadataTruncated && <p className="import-warning">{msg("Titolo o artista abbreviati nell\u2019immagine. Controlla l\u2019anteprima.")}</p>}
  </div><div className="story-mobile-actions"><button className="primary" disabled={!available} onClick={() => void send(false)}><Share2 size={21}/>{busy ? msg("Preparazione\u2026") : msg("Condividi immagine")}</button><div><button className="tonal" disabled={!available} onClick={() => void send(true)}><Download size={21}/>{msg("Salva immagine")}</button><button className="text-action" aria-label={msg("Condividi link")} disabled={busy} onClick={() => void link()}><Link size={22}/></button></div></div></>}
  {message && <p role="status" className="source-date">{noticeText(message)}</p>}{error && <p role="alert" className="inline-error">{noticeText(error)}</p>}
  {saved && <SavedNotice key={saved.id} id={saved.id} text={saved.text} dismiss={id => setSaved(previous => previous?.id === id ? null : previous)}/>}
 </div></Modal>;
}
