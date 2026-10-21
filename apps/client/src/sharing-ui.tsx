import {useTranslation} from '../../../packages/i18n/react';
import { noticeText } from './i18n';
import { t } from './i18n';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Share2, Check, Download, Upload, X, FileMusic, LoaderCircle } from 'lucide-react';
import { api } from './api';
import { useLibrary } from './library';
import { playlistFileLimit, playlistFilename, type PlaylistFile } from '../../../packages/domain/sharing';
import {ritvioTrackLink} from '../../../packages/domain/track-sharing';
import type { Track, PersonalPlaylist } from '../../../packages/domain/index';
function describe(error: unknown) { return error instanceof Error ? error.message : t("sharing-ui.operazione.non.riuscita.riprova"); }
export function ShareTrackButton({ track, visibleLabel = false }: {
    track: Track;
    visibleLabel?: boolean;
}) {
    const [copied, setCopied] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    useEffect(() => () => clearTimeout(timer.current), []);
    return <button type="button" data-menu-retain="true" className={`icon-button ${copied ? 'active' : ''}`} aria-label={t("sharing-ui.copia.link.youtube", { p0: track.title })} title={copied ? t("sharing-ui.link.copiato") : t("sharing-ui.copia.link.youtube.1")} onClick={async () => {
            try {
                if (window.ritvio)
                    await window.ritvio.copyTrackLink(track);
                else
                    await navigator.clipboard.writeText(ritvioTrackLink(track));
                setCopied(true);
                clearTimeout(timer.current);
                timer.current = setTimeout(() => setCopied(false), 2000);
            }
            catch (error) {
                useLibrary.setState({ error: t("sharing-ui.copia.del.link", { p0: describe(error) }) });
            }
        }}>{copied ? <Check size={17}/> : <Share2 size={17}/>} {visibleLabel && <span>{t(copied ? "sharing-ui.link.copiato" : "ui3.copyLink")}</span>}<span className="sr-only" role="status">{copied ? t("sharing-ui.link.copiato") : ''}</span></button>;
}
export function ExportPlaylistButton({ playlist }: {
    playlist: PersonalPlaylist;
}) {
    const [busy, setBusy] = useState(false);
    const [saved, setSaved] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    useEffect(() => () => clearTimeout(timer.current), []);
    return <button type="button" className="secondary-button" aria-label={t("sharing-ui.esporta.playlist")} disabled={busy} onClick={async () => {
            setBusy(true);
            useLibrary.setState({ error: null });
            try {
                let completed;
                if (window.ritvio)
                    completed = (await window.ritvio.exportPlaylist(playlist.id)).saved;
                else {
                    const file = await api.library.export(playlist.id);
                    const blob = new Blob([JSON.stringify(file, null, 2) + '\n'], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const anchor = document.createElement('a');
                    anchor.href = url;
                    anchor.download = playlistFilename(file.playlist.name);
                    anchor.click();
                    setTimeout(() => URL.revokeObjectURL(url), 10000);
                    completed = true;
                }
                if (completed) {
                    setSaved(true);
                    clearTimeout(timer.current);
                    timer.current = setTimeout(() => setSaved(false), 2500);
                }
            }
            catch (error) {
                useLibrary.setState({ error: t("sharing-ui.esportazione", { p0: describe(error) }) });
            }
            finally {
                setBusy(false);
            }
        }}>{busy ? <LoaderCircle className="spin" size={15}/> : saved ? <Check size={15}/> : <Download size={15}/>} {saved ? t("sharing-ui.file.salvato") : t("sharing-ui.esporta.file")}</button>;
}
function previewFile(value: unknown): PlaylistFile {
    if (!value || typeof value !== 'object')
        throw Error(t("sharing-ui.questo.file.non.e.una.playlist.ritvio"));
    const candidate = value as Partial<PlaylistFile>;
    const playlist = candidate.playlist;
    if (!['ritvio-playlist', 'spotyfree-playlist'].includes(String(candidate.format)) || candidate.version !== 1 || !playlist || typeof playlist.name !== 'string' || !playlist.name.trim() || playlist.name.length > 100 || typeof playlist.description !== 'string' || playlist.description.length > 1000 || (playlist.cover !== null && typeof playlist.cover !== 'string') || !Array.isArray(playlist.tracks) || playlist.tracks.length > 1000)
        throw Error(t("sharing-ui.formato.della.playlist.non.supportato.o.dati.incompleti"));
    for (const track of playlist.tracks)
        if (!track || typeof track.videoId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(track.videoId) || typeof track.title !== 'string' || !track.title.trim() || track.title.length > 1000 || typeof track.artist !== 'string' || !track.artist.trim() || track.artist.length > 1000 || typeof track.duration !== 'number' || !Number.isFinite(track.duration) || track.duration < 0 || track.duration > 31536000)
            throw Error(t("sharing-ui.il.file.contiene.un.brano.non.valido"));
    return { ...candidate, format: 'ritvio-playlist' } as PlaylistFile;
}
export function ImportPlaylistButton() {
    const {t:copy}=useTranslation('common');
    const [shown,setShown]=useState(60);
    const input = useRef<HTMLInputElement>(null);
    const modal = useRef<HTMLDialogElement>(null);
    const [file, setFile] = useState<PlaylistFile | null>(null);
    const [filename, setFilename] = useState('');
    const [name, setName] = useState('');
    const [reading, setReading] = useState(false);
    const [error, setError] = useState('');
    const { busy } = useLibrary();
    const [skipCopies, setSkipCopies] = useState(false);
    useEffect(() => {
        if (file)
            modal.current?.showModal();
        else {
            const wasOpen = modal.current?.open;
            modal.current?.close();
            if (wasOpen)
                document.getElementById('library-import-trigger')?.focus();
        }
        setSkipCopies(false);
        setShown(60);
    }, [file]);
    const seen = new Set<string>();
    const uniqueTracks = file?.playlist.tracks.filter(track => {
        if (seen.has(track.videoId))
            return false;
        seen.add(track.videoId);
        return true;
    }) ?? [];
    const duplicateCount = (file?.playlist.tracks.length ?? 0) - uniqueTracks.length;
    const close = () => {
        if (!busy) {
            setFile(null);
            setError('');
        }
    };
    return <>
    <button type="button" className="secondary-button" disabled={reading || busy} onClick={() => input.current?.click()}>{reading ? <LoaderCircle className="spin" size={16}/> : <Upload size={16}/>}{t("sharing-ui.importa.playlist")}</button>
    <input ref={input} type="file" className="sr-only" accept=".json,application/json" aria-label={t("sharing-ui.file.playlist.ritvio")} onChange={async (e) => {
            const selected = e.target.files?.[0];
            if (!selected)
                return;
            setReading(true);
            useLibrary.setState({ error: null });
            try {
                if (selected.size > playlistFileLimit)
                    throw Error(t("sharing-ui.scegli.un.file.playlist.fino.a.4.mb"));
                let json;
                try {
                    json = JSON.parse(await selected.text());
                }
                catch {
                    throw Error(t("sharing-ui.il.file.non.contiene.json.valido"));
                }
                const parsed = previewFile(json);
                setFile(parsed);
                setFilename(selected.name);
                setName(parsed.playlist.name);
                setError('');
            }
            catch (error) {
                useLibrary.setState({ error: t("sharing-ui.importazione", { p0: describe(error) }) });
            }
            finally {
                setReading(false);
                e.target.value = '';
            }
        }}/>
    {createPortal(<dialog className="library-dialog" aria-labelledby="import-title" ref={modal} onCancel={e => { e.preventDefault(); close(); }} onClick={e => {
                if (e.target === modal.current)
                    close();
            }}>
      <div className="dialog-heading"><h2 id="import-title">{t("sharing-ui.importa.playlist")}</h2><button type="button" aria-label={t("sharing-ui.chiudi.importazione")} className="icon-button" onClick={close} disabled={busy}><X size={20}/></button></div>
      {file && <><div className="import-summary"><FileMusic size={28}/><div><strong>{file.playlist.name}</strong><span>{copy('transfer.fileSummary',{count:file.playlist.tracks.length,name:filename})}</span></div></div><p className="dialog-copy">{t("sharing-ui.verra.creata.una.nuova.playlist.privata.potrai.modificarla.nella.")}</p>{error && <p role="alert" className="form-error">{noticeText(error)}</p>}
        <form className="library-form" onSubmit={async (e) => {
                    e.preventDefault();
                    useLibrary.setState({ error: null });
                    const result = await useLibrary.getState().importFile({ ...file, playlist: { ...file.playlist, name: name.trim(), tracks: skipCopies ? uniqueTracks : file.playlist.tracks } });
                    if (result)
                        setFile(null);
                    else
                        setError(useLibrary.getState().error ?? t("sharing-ui.importazione.non.riuscita"));
                }}>
          <label>{t("sharing-ui.nome.della.nuova.playlist")}<input aria-label={t("sharing-ui.nome.playlist.importata")} required maxLength={100} value={name} onChange={e => setName(e.target.value)}/></label>
          {!!file.playlist.description && <p className="import-description">{file.playlist.description}</p>}
          {!!duplicateCount && <><p>{t('sharing.duplicatesCount', { count: duplicateCount })}</p><label className="playlist-option"><input type="checkbox" checked={skipCopies} disabled={busy} onChange={e => setSkipCopies(e.target.checked)}/>{t('sharing.skipCopies')}</label></>}
          <p role="status">{t('sharing.importCount', { count: skipCopies ? uniqueTracks.length : file.playlist.tracks.length })}</p>
          <div className="import-tracks" tabIndex={0} role="region" aria-label={copy('transfer.fileTracks')}>{file.playlist.tracks.slice(0, shown).map((track, index) => <div key={`${track.videoId}-${index}`}><span>{index + 1}</span><strong>{track.title}</strong><small>{track.artist}</small></div>)}{shown < file.playlist.tracks.length && <button type="button" className="text-button" onClick={() => setShown(value=>value+60)}>{copy('transfer.showMore')}</button>}</div>
          <button className="primary-button" type="submit" disabled={busy || !name.trim()}>{busy ? <LoaderCircle className="spin" size={16}/> : <Upload size={16}/>}{t("sharing-ui.importa.come.nuova.playlist")}</button>
        </form></>}
    </dialog>, document.body)}
  </>;
}
