import { noticeText } from './i18n';
import { displayLocale } from '../../../packages/i18n/display';
import { useEffect, useRef, useState, useId } from 'react';
import { api } from './api';
import { t } from './i18n';
import type { MetadataKind, MetadataSnapshot } from '../../../packages/domain/metadata';
export function MetadataPanel({ kind, id }: {
    kind: MetadataKind;
    id: string;
}) {
    const [open, setOpen] = useState(false), [data, setData] = useState<MetadataSnapshot | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [query, setQuery] = useState(''), [draft, setDraft] = useState(''), [editing, setEditing] = useState(false);
    const unique = useId(), request = useRef<AbortController | null>(null);
    const apply = (result: MetadataSnapshot) => { setData(result); setDraft(result.genres.map(g => g.original).join(', ')); };
    useEffect(() => {
        request.current?.abort();
        if (!open) {
            setBusy(false);
            return;
        }
        const controller = new AbortController();
        request.current = controller;
        setBusy(true);
        setError('');
        void api.metadata.get(kind, id, controller.signal).then(result => {
            if (!controller.signal.aborted) {
                apply(result);
                setQuery([kind === 'artist' ? '' : result.target.artists.join(' '), result.target.name].filter(Boolean).join(' ').slice(0, 200));
            }
        }).catch(e => {
            if (!controller.signal.aborted)
                setError(e.message);
        }).finally(() => {
            if (!controller.signal.aborted)
                setBusy(false);
        });
        return () => controller.abort();
    }, [open, kind, id]);
    const execute = async (work: (signal: AbortSignal) => Promise<MetadataSnapshot>) => {
        request.current?.abort();
        const controller = new AbortController();
        request.current = controller;
        setBusy(true);
        setError('');
        try {
            const result = await work(controller.signal);
            if (!controller.signal.aborted)
                apply(result);
        }
        catch (e) {
            if (!controller.signal.aborted)
                setError(e instanceof Error ? e.message : t('metadata.failed'));
        }
        finally {
            if (!controller.signal.aborted)
                setBusy(false);
        }
    };
    useEffect(() => () => request.current?.abort(), []);
    const source = () => {
        if (!data?.selected)
            return;
        const candidate = data.selected;
        if (window.ritvio)
            void window.ritvio.openMetadataSource(candidate.kind, candidate.id);
        else
            window.open(`https://music.apple.com/us/${candidate.kind === 'track' ? 'song' : candidate.kind}/${candidate.id}`, '_blank', 'noopener,noreferrer');
    };
    return <details className="metadata-panel" open={open} onToggle={e => setOpen(e.currentTarget.open)}><summary>{t('metadata.title')}</summary>{open && <div className="metadata-content">
    <p className="metadata-explanation">{t(`metadata.scope.${kind}`)}</p>
    {busy && !data && <p role="status">{t('metadata.loading')}</p>}{error && <p role="alert" className="form-error">{noticeText(error)}</p>}
    {!data && !busy && <button className="secondary-button" onClick={() => void execute(signal => api.metadata.get(kind, id, signal))}>{t('App.riprova')}</button>}
    {data && <><div className="metadata-current"><strong>{t(`metadata.status.${data.status}`)}</strong><p>{data.genres.length ? data.genres.map(g => g.name).join(' · ') : t('metadata.noGenres')}</p>
      <span>{data.localGenres !== null ? t('metadata.localSource') : data.selected ? t('metadata.itunesSource') : t('metadata.noSource')}</span>
      {data.selected && <div className="metadata-association"><span>{t('metadata.association', { name: data.selected.name, artist: data.selected.artist })}</span><button className="text-button" onClick={source}>{t('metadata.sourceLink')}</button><button className="text-button" disabled={busy} onClick={() => void execute(signal => api.metadata.reset(kind, id, 'selection', signal))}>{t('metadata.removeMatch')}</button></div>}
    </div>
    <div className="metadata-tools"><button className="secondary-button" disabled={busy} aria-expanded={editing} onClick={() => setEditing(value => !value)}>{t('metadata.edit')}</button>{data.localGenres !== null && <button className="text-button" disabled={busy} onClick={() => void execute(signal => api.metadata.reset(kind, id, 'genres', signal))}>{t('metadata.resetGenres')}</button>}</div>
    {editing && <form className="metadata-form" onSubmit={e => {
                        e.preventDefault();
                        const genres = draft.split(',').map(value => value.trim()).filter(Boolean);
                        if (genres.length > 20 || genres.some(value => value.length > 60)) {
                            setError(t('metadata.bounds'));
                            return;
                        }
                        void execute(signal => api.metadata.genres(kind, id, genres, signal));
                    }}><label htmlFor={`${unique}-genres`}>{t('metadata.genresLabel')}</label><input id={`${unique}-genres`} value={draft} onChange={e => setDraft(e.target.value)} maxLength={1220} disabled={busy} aria-describedby={`${unique}-hint`}/><p id={`${unique}-hint`}>{t('metadata.genresHint')}</p><button className="secondary-button" disabled={busy}>{t('metadata.save')}</button></form>}
    <form className="metadata-form" onSubmit={e => { e.preventDefault(); void execute(signal => api.metadata.search(kind, id, query.trim(), signal)); }}><label htmlFor={`${unique}-query`}>{t('metadata.searchLabel')}</label><div className="metadata-search"><input id={`${unique}-query`} value={query} onChange={e => setQuery(e.target.value)} minLength={3} maxLength={200} disabled={busy}/><button className="secondary-button" disabled={busy || query.trim().length < 3}>{busy ? t('App.caricamento') : t('metadata.search')}</button></div><p>{t('metadata.searchHint')}</p></form>
    {data.cache && <p className="metadata-cache" role={data.cache.degraded ? 'status' : undefined}>{data.cache.degraded ? t('metadata.degraded') : data.cache.stale ? t('metadata.stale') : t('metadata.cached', { date: new Date(data.cache.fetchedAt).toLocaleDateString(displayLocale()) })}</p>}
    {data.cache && !data.candidates.length && <p className="metadata-empty">{t('metadata.empty')}</p>}
    {!!data.candidates.length && <><p className="metadata-explanation">{t('metadata.confirmHint')}</p><ol className="metadata-candidates">{data.candidates.map(candidate => <li key={candidate.id}><div><strong>{candidate.name}</strong><span>{[candidate.artist, candidate.album !== candidate.name ? candidate.album : null, candidate.year, candidate.duration ? `${Math.round(candidate.duration)} s` : null].filter(Boolean).join(' · ')}</span><span>{candidate.genre.map(g => g.original).join(' · ') || t('metadata.noGenres')}</span><small>{t(`metadata.quality.${candidate.quality}`)} · {t('metadata.matches', { title: t(candidate.matches.title ? 'metadata.yes' : 'metadata.no'), artist: t(candidate.matches.artist ? 'metadata.yes' : 'metadata.no') })}{candidate.matches.year !== null ? ` · ${t('metadata.year')}: ${t(candidate.matches.year ? 'metadata.yes' : 'metadata.no')}` : ''}{candidate.matches.duration !== null ? ` · ${t('metadata.duration')}: ${t(candidate.matches.duration ? 'metadata.yes' : 'metadata.no')}` : ''}</small></div><button className="secondary-button" disabled={busy} aria-pressed={candidate.id === data.selected?.id} aria-label={t('metadata.selectLabel', { name: candidate.name, artist: candidate.artist })} onClick={() => void execute(signal => api.metadata.select(kind, id, candidate.id, signal))}>{t(candidate.id === data.selected?.id ? 'metadata.selected' : 'metadata.select')}</button></li>)}</ol></>}
    {busy && data && <p role="status" className="metadata-cache">{t('metadata.loading')}</p>}
    </>}
  </div>}</details>;
}
