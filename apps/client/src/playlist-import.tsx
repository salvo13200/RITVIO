import { noticeText } from './i18n';
import { displayLocale } from '../../../packages/i18n/display';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Link2, LoaderCircle, X, Check, Music2 } from 'lucide-react';
import { api } from './api';
import { t } from './i18n';
import { useLibrary } from './library';
import type { PersonalPlaylist } from '../../../packages/domain/index';
import { playlistLink, importSelection, type RemotePlaylistJob, type RemotePlaylistResult } from '../../../packages/domain/playlist-import';
const describe = (error: unknown) => error instanceof Error ? error.message : t('remote.error');
export function RemotePlaylistImport({ onImported, slot }: {
    onImported: (playlist: PersonalPlaylist) => void;
    slot: RefObject<HTMLDivElement | null>;
}) {
    const library = useLibrary();
    const [open, setOpen] = useState(false), [url, setUrl] = useState(''), [job, setJob] = useState<RemotePlaylistJob | null>(null), [error, setError] = useState(''), [starting, setStarting] = useState(false), [saving, setSaving] = useState(false);
    const [numbers, setNumbers] = useState<number[]>([]), [name, setName] = useState(''), [targetId, setTargetId] = useState(''), [target, setTarget] = useState<PersonalPlaylist | null>(null), [targetLoading, setTargetLoading] = useState(false), [skip, setSkip] = useState(false), [result, setResult] = useState<RemotePlaylistResult | null>(null);
    const trigger = useRef<HTMLButtonElement>(null), heading = useRef<HTMLHeadingElement>(null), resultHeading = useRef<HTMLHeadingElement>(null), jobId = useRef<string | null>(null), generation = useRef(0), targetGeneration = useRef(0), prepared = useRef<string | null>(null), mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            generation.current++;
            targetGeneration.current++;
            if (jobId.current)
                void api.library.cancelImport(jobId.current).catch(() => { });
        };
    }, []);
    useEffect(() => {
        if (open) {
            heading.current?.focus({ preventScroll: true });
            heading.current?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
        }
    }, [open]);
    useEffect(() => {
        if (result) {
            resultHeading.current?.focus({ preventScroll: true });
            resultHeading.current?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
        }
    }, [result]);
    useEffect(() => {
        if (job?.state !== 'ready' || !job.preview || prepared.current === job.id)
            return;
        prepared.current = job.id;
        setName(job.preview.title);
        setNumbers(job.preview.entries.filter(e => e.track).map(e => e.number));
    }, [job]);
    useEffect(() => {
        if (job?.state !== 'loading')
            return;
        const id = job.id, controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        const poll = async () => {
            try {
                const next = await api.library.importStatus(id, controller.signal);
                if (!controller.signal.aborted) {
                    setError('');
                    setJob(next);
                    if (next.state === 'loading')
                        timer = setTimeout(poll, 1500);
                }
            }
            catch (error) {
                if (!controller.signal.aborted)
                    setJob(current => current ? { ...current, state: 'failed', error: describe(error) } : current);
            }
        };
        timer = setTimeout(poll, 1000);
        return () => { controller.abort(); clearTimeout(timer); };
    }, [job?.id, job?.state]);
    const close = () => {
        if (saving)
            return;
        generation.current++;
        targetGeneration.current++;
        if (jobId.current)
            void api.library.cancelImport(jobId.current).catch(() => { });
        jobId.current = null;
        setOpen(false);
        setJob(null);
        setError('');
        setStarting(false);
        setResult(null);
        setTargetLoading(false);
        prepared.current = null;
        if (trigger.current?.getClientRects().length && !trigger.current.closest('details:not([open])'))
            trigger.current.focus();
        else
            document.getElementById('library-import-trigger')?.focus();
    };
    const start = async (fresh = false) => {
        try {
            playlistLink(url);
        }
        catch (error) {
            setError(describe(error));
            return;
        }
        const current = ++generation.current;
        targetGeneration.current++;
        setTargetLoading(false);
        setStarting(true);
        setError('');
        setJob(null);
        setResult(null);
        setSkip(false);
        setTargetId('');
        setTarget(null);
        setNumbers([]);
        prepared.current = null;
        if (jobId.current)
            await api.library.cancelImport(jobId.current).catch(() => { });
        jobId.current = null;
        try {
            const next = await api.library.startImport(url, fresh);
            if (!mounted.current || generation.current !== current) {
                void api.library.cancelImport(next.id).catch(() => { });
                return;
            }
            jobId.current = next.id;
            setJob(next);
        }
        catch (error) {
            if (mounted.current && generation.current === current)
                setError(describe(error));
        }
        finally {
            if (mounted.current && generation.current === current)
                setStarting(false);
        }
    };
    const destination = async (id: string) => {
        const current = ++targetGeneration.current;
        setTargetId(id);
        setTarget(null);
        setError('');
        setTargetLoading(!!id);
        if (!id)
            return;
        try {
            const next = await api.library.playlist(id);
            if (mounted.current && targetGeneration.current === current)
                setTarget(next);
        }
        catch (error) {
            if (mounted.current && targetGeneration.current === current)
                setError(describe(error));
        }
        finally {
            if (mounted.current && targetGeneration.current === current)
                setTargetLoading(false);
        }
    };
    const preview = job?.preview, available = preview?.entries.filter(e => e.track) ?? [], choice = importSelection(preview?.entries ?? [], numbers, skip, target?.items.map(i => i.track));
    const tooMany = (target?.count ?? 0) + choice.tracks.length > 1000, busy = saving || library.busy;
    const linkForm = <><form className="remote-link-form" onSubmit={e => { e.preventDefault(); void start(); }}>
    <label>{t('remote.link')}<input type="url" required maxLength={2048} value={url} disabled={starting || job?.state === 'loading' || busy} placeholder={t('remote.link')} onChange={e => setUrl(e.target.value)} aria-describedby="remote-link-help"/></label>
    <button className="secondary-button" disabled={starting || job?.state === 'loading' || busy || !url.trim()}>{starting || job?.state === 'loading' ? <LoaderCircle className="spin" size={16}/> : <Link2 size={16}/>} {t('remote.read')}</button>
  </form><p id="remote-link-help" className="remote-note">{t('remote.limit')}</p></>;
    return <>
    <button ref={trigger} type="button" className="secondary-button" disabled={library.busy} aria-expanded={open} aria-controls="remote-import" onClick={() => open ? close() : setOpen(true)}><Link2 size={17}/>{t('remote.open')}</button>
    {open && slot.current && createPortal(<section id="remote-import" className="remote-import" aria-labelledby="remote-import-title" aria-busy={starting || job?.state === 'loading' || saving}>
      <div className="remote-heading"><h2 ref={heading} id="remote-import-title" tabIndex={-1}>{t('remote.title')}</h2><button className="icon-button" type="button" disabled={saving} aria-label={t('remote.close')} onClick={close}><X size={20}/></button></div>
      {!result && (preview ? <details className="remote-link-options"><summary>{t('remote.changeLink')}</summary>{linkForm}</details> : <><p className="remote-copy">{t('remote.intro')}</p>{linkForm}</>)}
      {error && <p className="form-error" role="alert">{noticeText(error)}</p>}
      {(starting || job?.state === 'loading') && <div className="remote-loading" role="status"><LoaderCircle className="spin" size={22}/><div><strong>{job?.phase === 'youtube' ? t('remote.fallback') : t('remote.loading')}</strong><p>{t('remote.cancelSafe')}</p></div><button type="button" className="secondary-button" onClick={close}>{t('remote.cancelRead')}</button></div>}
      {job?.state === 'failed' && <div role="alert"><p className="form-error">{noticeText(job.error)}</p><button className="secondary-button" type="button" onClick={() => void start(true)}>{t('remote.retry')}</button></div>}
      {preview && !result && <>
        <div className="remote-source">{preview.artwork ? <img src={preview.artwork} alt="" onError={e => { e.currentTarget.hidden = true; }}/> : <Music2 size={44} aria-hidden="true"/>}<div><h3>{preview.title}</h3>{preview.author && <p>{preview.author}</p>}<p>{t('remote.sourceCount', { count: preview.entries.length, total: preview.reportedCount ?? t('remote.unknown') })}</p></div></div>
        <p className="remote-note">{t('remote.fetched', { date: new Date(preview.fetchedAt).toLocaleString(displayLocale()) })} {preview.cache === 'cached' ? t('remote.cached') : preview.cache === 'stale' ? t('remote.stale') : ''}</p>
        {preview.partial && <p className="remote-warning" role="status">{preview.truncated ? t('remote.truncated') : preview.reportedCount === null ? t('remote.unknownTotal') : t('remote.partial')}</p>}
        <details className="remote-source-info"><summary>{t('remote.availability')}</summary><p className="remote-note">{t('remote.availabilityNote')}</p></details>
        <form className="remote-save-form" onSubmit={async (e) => {
                    e.preventDefault();
                    if (!job || busy || targetLoading || targetId && !target)
                        return;
                    setSaving(true);
                    setError('');
                    try {
                        const outcome = await useLibrary.getState().importRemote(job.id, { entryNumbers: numbers, skipDuplicates: skip, name: name.trim(), targetId: targetId || null, targetRevision: target?.revision ?? null });
                        if (outcome)
                            setResult(outcome);
                        else
                            setError(useLibrary.getState().error ?? t('remote.error'));
                    }
                    catch (error) {
                        setError(describe(error));
                    }
                    finally {
                        setSaving(false);
                    }
                }}>
          <div className="remote-destination"><label>{t('remote.destination')}<select value={targetId} disabled={busy} onChange={e => void destination(e.target.value)}><option value="">{t('remote.new')}</option>{library.data?.playlists.map(p => <option key={p.id} value={p.id}>{p.name} · {p.count}</option>)}</select></label>
            {!targetId && <label>{t('remote.name')}<input required maxLength={100} value={name} disabled={busy} onChange={e => setName(e.target.value)}/></label>}
            {targetId && <button type="button" className="text-button" disabled={busy || targetLoading} onClick={() => void destination(targetId)}>{targetLoading ? t('remote.targetLoading') : t('remote.reloadTarget')}</button>}
          </div>
          <label className="remote-option"><input type="checkbox" checked={skip} disabled={busy} onChange={e => setSkip(e.target.checked)}/><span>{t('remote.skipDuplicates')}</span></label>
          <p role="status" className="remote-count">{t('remote.selectionCount', { selected: numbers.length, added: choice.tracks.length, duplicates: choice.skipped, unavailable: (preview.entries.length - available.length) })}{target && ` · ${t('remote.targetCount', { before: target.count, after: target.count + choice.tracks.length })}`}</p>
          {tooMany && <p className="form-error" role="alert">{t('remote.capacity')}</p>}
          <div className="remote-selection-actions"><button type="button" className="text-button" disabled={busy || !available.length} onClick={() => setNumbers(available.map(e => e.number))}>{t('remote.selectAll')}</button><button type="button" className="text-button" disabled={busy || !numbers.length} onClick={() => setNumbers([])}>{t('remote.clear')}</button></div>
          <div className="remote-entries" aria-label={t('remote.entries')} role="group">{preview.entries.map(entry => <label key={entry.number} className={`remote-entry ${numbers.includes(entry.number) ? 'selected' : ''}`}><input type="checkbox" disabled={busy || !entry.track} checked={numbers.includes(entry.number)} onChange={e => setNumbers(current => e.target.checked ? [...current, entry.number] : current.filter(n => n !== entry.number))} aria-label={t('remote.selectEntry', { number: entry.number, title: entry.title })}/><span className="remote-number">{entry.number}</span><span className="remote-entry-copy"><strong>{entry.title}</strong><small>{entry.track?.artist ?? t('remote.unavailable')}</small></span></label>)}</div>
          {!preview.entries.length && <p className="remote-copy">{t('remote.empty')}</p>}
          <div className="remote-footer"><button type="submit" className="primary-button" disabled={busy || targetLoading || !!targetId && !target || !numbers.length || tooMany || !targetId && !name.trim()}>{saving ? <LoaderCircle className="spin" size={16}/> : <Check size={16}/>} {saving ? t('remote.saving') : targetId ? t('remote.append') : t('remote.create')}</button><button type="button" className="secondary-button" disabled={saving} onClick={close}>{t('remote.cancel')}</button><button type="button" className="text-button" disabled={busy} onClick={() => void start(true)}>{t('remote.refresh')}</button></div>
        </form>
      </>}
      {result && <div className="remote-result" role="status"><Check size={24}/><h3 ref={resultHeading} tabIndex={-1}>{t('remote.saved', { name: result.playlist.name })}</h3><p>{t('remote.report', { added: result.added, duplicates: result.skippedDuplicates, unavailable: result.unavailable, excluded: result.excluded })}</p>{result.partial && <p>{t('remote.partialSaved')}</p>}<div className="remote-footer"><button type="button" className="primary-button" onClick={() => { const playlist = result.playlist; close(); onImported(playlist); }}>{t('remote.view')}</button><button type="button" className="secondary-button" onClick={close}>{t('remote.done')}</button></div></div>}
    </section>, slot.current)}
  </>;
}
