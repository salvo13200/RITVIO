import { noticeText } from './messages';
import { msg } from './messages';
import { useEffect, useRef, useState } from 'react';
import { Download, FileJson, Link, LoaderCircle, Share2 } from 'lucide-react';
import { nativePlayback } from './native';
import { Artwork, Empty, ScrollText } from './ui';
import { importSelection, playlistLink } from '../../../packages/domain/playlist-import';
import { playlistFilename } from '../../../packages/domain/sharing';
import type { MobileImportPreview, MobileImportResult, MobileLibrary, MobilePlaylist } from '../../../packages/domain/mobile';
export function ImportPlaylistPanel({ library, complete, close, refresh }: {
    library: MobileLibrary;
    complete: (value: MobileImportResult) => void;
    close: () => void;
    refresh: () => Promise<void>;
}) {
    const [mode, setMode] = useState<'link' | 'file'>('link'), [url, setUrl] = useState(''), [preview, setPreview] = useState<MobileImportPreview | null>(null), [loading, setLoading] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('');
    const [selected, setSelected] = useState<Set<number>>(new Set()), [skip, setSkip] = useState(true), [target, setTarget] = useState(''), [name, setName] = useState(''), [shown, setShown] = useState(60);
    const mounted = useRef(true), requestId = useRef<string | null>(null), committing = useRef(false);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            if (requestId.current)
                void nativePlayback.cancelPlaylistImport({ requestId: requestId.current }).catch(() => { });
        };
    }, []);
    function reset() {
        if (requestId.current)
            void nativePlayback.cancelPlaylistImport({ requestId: requestId.current }).catch(() => { });
        requestId.current = null;
        setPreview(null);
        setError('');
        setShown(60);
    }
    async function read() {
        let canonical = '';
        try {
            if (mode === 'link')
                canonical = playlistLink(url).url;
        }
        catch (e) {
            setError((e as Error).message);
            return;
        }
        const id = crypto.randomUUID();
        requestId.current = id;
        setLoading(true);
        setError('');
        try {
            const value = mode === 'link' ? await nativePlayback.previewPlaylist({ url: canonical, requestId: id }) : await nativePlayback.choosePlaylistFile({ requestId: id });
            if (!mounted.current || requestId.current !== id)
                return;
            if ('cancelled' in value)
                return;
            setPreview(value);
            setName(value.title);
            setSelected(new Set(value.entries.filter(e => e.track).map(e => e.number)));
            setShown(60);
        }
        catch (e) {
            if (mounted.current)
                setError(e instanceof Error ? e.message : msg("Playlist non leggibile. Controlla il file o il link."));
        }
        finally {
            if (mounted.current)
                setLoading(false);
        }
    }
    const destination = library.playlists.find(p => p.id === target), existing = destination?.items ?? [];
    const summary = preview ? importSelection(preview.entries, [...selected], skip, existing) : { tracks: [], skipped: 0 };
    const tooMany = existing.length + summary.tracks.length > 1000, full = !target && library.playlists.length >= 100;
    async function commit() {
        if (!preview || committing.current)
            return;
        committing.current = true;
        setSaving(true);
        setError('');
        try {
            const result = await nativePlayback.commitPlaylistImport({ requestId: preview.requestId, numbers: [...selected], skipDuplicates: skip, name: name.trim(), targetId: target || null, targetRevision: destination?.revision ?? (target ? 1 : null) });
            complete(result);
            if (mounted.current)
                close();
        }
        catch (e) {
            if (mounted.current) {
                setError(e instanceof Error ? e.message : msg("Importazione non riuscita. Riprova."));
                await refresh();
            }
        }
        finally {
            committing.current = false;
            if (mounted.current)
                setSaving(false);
        }
    }
    return <div className="import-panel">
  {!preview ? <><p className="intro">{msg("Porta qui una playlist pubblica di YouTube oppure un file esportato da RITVIO per PC.")}</p><div className="transfer-modes" aria-label={msg("Origine della playlist")}><button className="tonal" aria-pressed={mode === 'link'} disabled={loading} onClick={() => { setMode('link'); setError(''); }}><Link size={20}/>{msg("Link YouTube")}</button><button className="tonal" aria-pressed={mode === 'file'} disabled={loading} onClick={() => { setMode('file'); setError(''); }}><FileJson size={20}/>{msg("File RITVIO")}</button></div>
   {mode === 'link' ? <form className="playlist-form" onSubmit={e => { e.preventDefault(); void read(); }}><label>{msg("Link della playlist")}<input type="url" required maxLength={2048} placeholder={msg("Link della playlist")} value={url} disabled={loading} onChange={e => setUrl(e.target.value)}/></label><button className="primary" disabled={loading || !url.trim()}>{loading ? <LoaderCircle className="spin" size={20}/> : <Download size={20}/>} {loading ? msg("Leggo la playlist\u2026") : msg("Mostra anteprima")}</button></form> : <><p className="source-date">{msg("File .ritvio.json, versione 1, fino a 4 MB. Nessun file audio.")}</p><button className="primary transfer-file" disabled={loading} onClick={() => void read()}>{loading ? <LoaderCircle className="spin" size={20}/> : <FileJson size={20}/>} {loading ? msg("Leggo il file\u2026") : msg("Scegli file playlist")}</button></>}
   {loading && <p role="status" className="source-date">{msg("La riproduzione continua. Puoi chiudere per annullare la lettura.")}</p>}</> : <>
   <div className="sheet-track"><Artwork src={preview.cover ?? preview.artwork ?? preview.entries.find(e => e.track)?.track?.thumbnail}/><span><strong>{preview.title}</strong><small>{preview.provider === 'file' ? msg("File RITVIO") : msg('Raccolta importata')}{preview.cached ? ' · '+msg('Copia salvata') : ''}</small></span></div>
   <p className="import-count">{preview.entries.filter(e => e.track).length}{" " + msg("disponibili \u00B7") + " "}{preview.entries.filter(e => !e.track).length}{" " + msg("non disponibili")}</p>
   {(preview.partial || preview.truncated) && <p className="import-warning">{preview.truncated ? msg("Anteprima limitata ai primi 1.000 elementi. ") : ''}{preview.reportedCount === null ? msg("Il catalogo non comunica il totale: la copia potrebbe essere incompleta.") : msg("Il catalogo indica {p0} elementi; quelli mancanti non saranno importati.", { p0: preview.reportedCount })}</p>}
   {!!preview.adjusted && <p className="import-warning">{msg("Metadati abbreviati per") + " "}{preview.adjusted}{" " + msg("brani oltre i limiti del player.")}</p>}
   <div className="playlist-form"><label>{msg("Destinazione")}<select value={target} disabled={saving} onChange={e => setTarget(e.target.value)}><option value="">{msg("Nuova playlist")}</option>{library.playlists.map(p => <option key={p.id} value={p.id}>{p.name}{" " + msg("\u00B7") + " "}{p.items.length}{" " + msg("brani")}</option>)}</select></label>{!target && <label>{msg("Nome della playlist")}<input required maxLength={100} value={name} disabled={saving} onChange={e => setName(e.target.value)}/></label>}</div>
   <label className="import-option"><input type="checkbox" checked={skip} disabled={saving} onChange={e => setSkip(e.target.checked)}/><span>{msg("Salta i duplicati")}<small>{msg("Confronto per ID del video, anche nella destinazione.")}</small></span></label>
   <div className="import-selection"><span>{selected.size}{" " + msg("selezionati")}</span><button disabled={saving} className="text-action" onClick={() => setSelected(new Set(preview.entries.filter(e => e.track).map(e => e.number)))}>{msg("Seleziona tutti")}</button><button disabled={saving} className="text-action" onClick={() => setSelected(new Set())}>{msg("Nessuno")}</button></div>
   <div className="import-entries">{preview.entries.slice(0, shown).map(entry => <label className={`import-entry${entry.track ? '' : ' is-unavailable'}`} key={entry.number}><input type="checkbox" aria-label={msg("Seleziona {p0}", { p0: entry.title })} checked={selected.has(entry.number)} disabled={!entry.track || saving} onChange={() => setSelected(previous => {
                    const next = new Set(previous);
                    if (next.has(entry.number))
                        next.delete(entry.number);
                    else
                        next.add(entry.number);
                    return next;
                })}/><Artwork src={entry.track?.thumbnail}/><span><strong><ScrollText>{entry.title}</ScrollText></strong><small><ScrollText>{entry.track?.artist ?? msg("Non disponibile \u00B7 escluso dall\u2019importazione")}</ScrollText></small></span></label>)}</div>
   {shown < preview.entries.length && <button className="tonal" onClick={() => setShown(v => v + 60)}>{msg("Mostra altri \u00B7") + " "}{Math.min(shown, preview.entries.length)}{" " + msg("di") + " "}{preview.entries.length}</button>}
   {!preview.entries.some(e => e.track) && <Empty title={msg("Nessun brano importabile")}>{msg("Scegli un altro file o una playlist pubblica accessibile.")}</Empty>}
   <div className="import-commit"><p>{summary.tracks.length}{" " + msg("da aggiungere")}{summary.skipped ? msg(" \u00B7 {p0} duplicati saltati", { p0: summary.skipped }) : ''}</p>{(tooMany || full) && <p className="import-warning" role="alert">{full ? msg("La libreria contiene gi\u00E0 100 playlist. Scegli una destinazione esistente.") : msg("La destinazione supererebbe 1.000 brani. Riduci la selezione.")}</p>}<button className="primary" disabled={saving || !summary.tracks.length || tooMany || full || !target && !name.trim()} onClick={() => void commit()}>{saving ? <LoaderCircle className="spin" size={20}/> : <Download size={20}/>} {saving ? msg("Salvataggio\u2026") : target ? msg("Aggiungi alla playlist") : msg("Importa playlist")}</button><button className="text-action" disabled={saving} onClick={reset}>{msg("Scegli un\u2019altra playlist")}</button></div>
   <p className="source-date">{msg("Copia locale, senza sincronizzazione. Brani mancanti esclusi; le tue altre playlist restano salvate. La lettura non prepara n\u00E9 scarica l\u2019audio.")}</p>
  </>}
  {error && <p className="inline-error" role="alert">{noticeText(error)}</p>}
 </div>;
}
export function ExportPlaylistPanel({ playlist }: {
    playlist: MobilePlaylist;
}) {
    const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
    async function send(save: boolean) {
        if (busy)
            return;
        setBusy(true);
        setMessage('');
        setError('');
        try {
            const result = await nativePlayback.exportPlaylist({ id: playlist.id, save });
            setMessage(result.status === 'saved' ? msg("File salvato.") : result.status === 'opened' ? msg("Pannello di condivisione aperto.") : msg("Salvataggio annullato."));
        }
        catch (e) {
            setError(e instanceof Error ? e.message : msg("Esportazione non riuscita. Riprova."));
        }
        finally {
            setBusy(false);
        }
    }
    return <div className="export-panel"><div className="sheet-track"><Artwork src={playlist.cover ?? playlist.items[0]?.thumbnail}/><span><strong>{playlist.name}</strong><small>{playlist.items.length}{" " + msg("brani \u00B7 file RITVIO")}</small></span></div><p className="intro">{msg("Porta la playlist sul PC o su un altro telefono. Il file conserva ordine, duplicati e metadati; contiene riferimenti ai brani, senza audio.")}</p><p className="export-filename">{playlistFilename(playlist.name)}</p><div className="export-actions"><button className="primary" disabled={busy} onClick={() => void send(true)}><Download size={21}/>{msg("Salva file")}</button><button className="tonal" disabled={busy} onClick={() => void send(false)}><Share2 size={21}/>{msg("Condividi file")}</button></div>{busy && <p role="status">{msg("Apro il pannello Android\u2026")}</p>}{message && <p role="status" className="source-date">{noticeText(message)}</p>}{error && <p className="inline-error" role="alert">{noticeText(error)}</p>}<p className="source-date">{msg("Compatibile con RITVIO per PC. Nessuna modifica alla coda o alla libreria.")}</p></div>;
}
