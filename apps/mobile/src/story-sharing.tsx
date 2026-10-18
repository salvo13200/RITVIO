import { noticeText } from './messages';
import { msg } from './messages';
import { useEffect, useRef, useState } from 'react';
import { Download, Share2, Link, Music2, Quote, RotateCcw, LoaderCircle } from 'lucide-react';
import { nativePlayback } from './native';
import { Artwork } from './ui';
import { SavedNotice } from './saved-notice';
import type { NativeTrack } from '../../../packages/domain/mobile';
import { parseLyrics } from '../../../packages/domain/lyrics';
import { chooseExcerpt, excerptRows, excerptRange, selectedExcerpt, excerptLimits, type ExcerptSelection, type ExcerptProblem } from '../../../packages/domain/story-sharing';
import { renderStory, storyBlob, type StoryMode } from '../../../packages/browser/story-canvas';
export function StoryComposer({ track }: {
    track: NativeTrack;
}) {
    const [mode, setMode] = useState<StoryMode>('track'), [art, setArt] = useState<'loading' | 'ready' | 'missing'>('loading'), [fallback, setFallback] = useState(false), [artRetry, setArtRetry] = useState(0);
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
    const range = excerptRange(choice.selection), excerpt = selectedExcerpt(rows ?? [], range), problem = choice.problem ?? (range ? excerpt.problem : null);
    const key = JSON.stringify([mode, excerpt.text, excerpt.problem, art, fallback, artRetry]);
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
    }, [key, track]);
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
    return <div className="mobile-story">
  <div className="sheet-track"><Artwork src={track.thumbnail}/><span><strong>{track.title}</strong><small>{track.artist}</small></span></div>
  <div className="transfer-modes" role="group" aria-label={msg("Contenuto della card")}><button className="tonal" aria-pressed={mode === 'track'} disabled={busy} onClick={() => setMode('track')}><Music2 size={20}/>{msg("Brano")}</button><button className="tonal" aria-pressed={mode === 'lyrics'} disabled={busy} onClick={() => setMode('lyrics')}><Quote size={20}/>{msg("Versi")}</button></div>
  {mode === 'lyrics' && <section className="story-excerpt" aria-label={msg("Seleziona i versi")}>
   <h3>{msg("Scegli i tuoi versi")}</h3><p id="excerpt-help">{choice.selection ? msg("Inizio alla riga {p0}. Tocca l\u2019ultima riga, anche prima dell\u2019inizio.", { p0: choice.selection.anchor + 1 }) : msg("Tocca la prima riga, poi l\u2019ultima. Massimo {p0} righe consecutive, senza limite di caratteri.", { p0: excerptLimits.lines })}</p>
   {lyricsBusy && <p role="status"><LoaderCircle size={20} className="spin"/>{" " + msg("Carico il testo\u2026")}</p>}
   {lyricsError && <p role="status">{lyricsError}</p>}
   {!!lyricsError && !rows && <button className="tonal" onClick={() => setLyricsRetry(v => v + 1)}>{msg("Riprova testo")}</button>}
   {!!rows?.length && <><div className="story-selection-summary"><output aria-live="polite">{excerpt.lines}{" " + msg("/") + " "}{excerptLimits.lines}{" " + msg("righe")}</output><button className="text-action" disabled={busy || !choice.selection} onClick={reset}><RotateCcw size={18}/>{msg("Ricomincia")}</button></div>
    <ol className="story-verse-list" aria-describedby="excerpt-help">{rows.map((row, index) => <li key={index}><button disabled={busy} aria-pressed={!!range && index >= range.start && index <= range.end} aria-label={msg("Riga {p0}: {p1}", { p0: index + 1, p1: row || 'pausa' })} onClick={() => setChoice(previous => chooseExcerpt(rows, previous.selection, index))}><span aria-hidden="true">{index + 1}</span><span>{row || msg("Pausa")}</span></button></li>)}</ol></>}
   {problemText && <p className="import-warning" role="alert">{problemText}</p>}
  </section>}
  <div className="story-mobile-preview" aria-busy={art === 'loading' || !painted && !paintError}>
   <canvas ref={canvas} role="img" aria-label={mode === 'lyrics' && !excerpt.problem ? msg("Card con versi di {p0}: {p1}", { p0: track.title, p1: excerpt.text }) : msg("Card di {p0}, {p1}, RITVIO", { p0: track.title, p1: track.artist })}/>
   {(art === 'loading' || !painted && !paintError) && <p className="story-preview-overlay" role="status"><LoaderCircle className="spin" size={24}/>{msg("Preparo l\u2019anteprima\u2026")}</p>}
   {mode === 'lyrics' && excerpt.problem && painted === key && <p className="story-preview-overlay">{msg("Seleziona i versi per vedere la card.")}</p>}
   {paintError && <p className="story-preview-overlay" role="alert">{paintError}</p>}
  </div>
  <p className="source-date">{msg("PNG \u00B7 1080 \u00D7 1920 \u00B7 senza audio. Il brano resta quello scelto all\u2019apertura.")}</p>
  {art === 'missing' && <div className="story-art-missing"><p>{msg("Copertina non disponibile. Puoi riprovare oppure usare il simbolo di RITVIO.")}</p><div><button className="tonal" disabled={busy} onClick={() => setArtRetry(v => v + 1)}>{msg("Riprova copertina")}</button><button className="tonal" aria-pressed={fallback} disabled={busy} onClick={() => setFallback(true)}>{msg("Usa senza copertina")}</button></div></div>}
  {metadataTruncated && <p className="import-warning">{msg("Titolo o artista abbreviati nell\u2019immagine. Controlla l\u2019anteprima.")}</p>}
  <div className="story-mobile-actions"><button className="primary" disabled={!available} onClick={() => void send(false)}><Share2 size={21}/>{busy ? msg("Preparazione\u2026") : msg("Condividi immagine")}</button><button className="tonal" disabled={!available} onClick={() => void send(true)}><Download size={21}/>{msg("Salva immagine")}</button><button className="text-action" disabled={busy} onClick={() => void link()}><Link size={20}/>{msg("Condividi link")}</button></div>
  {message && <p role="status" className="source-date">{noticeText(message)}</p>}{error && <p role="alert" className="inline-error">{noticeText(error)}</p>}
  {saved && <SavedNotice key={saved.id} id={saved.id} text={saved.text} dismiss={id => setSaved(previous => previous?.id === id ? null : previous)}/>}
 </div>;
}
