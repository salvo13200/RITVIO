import { noticeText } from './i18n';
import { useContext, useEffect, useState, useId, useRef } from 'react';
import { AlertCircle, Disc3, UserRound, Play, Plus, Check, LoaderCircle, ListPlus, Heart, MoreHorizontal, Clock3, AudioLines, ArrowRight } from 'lucide-react';
import { ArtistSearchMatch } from './artist-search';
import type { MusicResource } from '../../../packages/domain/index';
import { MetadataPanel } from './metadata-panel';
import { api } from './api';
import { t } from './i18n';
import { useLibrary } from './library';
import { usePlayer } from './store';
import { formatTime, type Track } from '../../../packages/domain/index';
import type { CatalogResource, CatalogKind, CatalogDetail, CatalogResult, CatalogSearch, ArtistDetail } from '../../../packages/domain/catalog';
import { CatalogNavigationContext, CatalogResourceLink, TrackCatalogLinks } from './catalog-navigation';
import { TrackLibraryActions } from './library-controls';
import { ExcludedBadge } from './listening-preferences';
import { isExcluded } from '../../../packages/domain/listening';
import { Cover } from './ui-controls';
import { MotionSurface } from './motion-surface';
import { motionMode } from './ui-motion';
function Artwork({ resource }: {
    resource: CatalogResource;
}) { return <div className={`catalog-artwork ${resource.kind === 'artist' ? 'artist-photo' : ''}`}>{resource.artwork ? <img src={resource.artwork} alt="" loading="lazy" onError={e => { e.currentTarget.style.display = 'none'; }}/> : null}{resource.kind === 'artist' ? <UserRound aria-hidden="true"/> : <Disc3 aria-hidden="true"/>}</div>; }
function Resources({ items, discography = false }: {
    items: CatalogResource[];
    discography?: boolean;
}) {
    const open = useContext(CatalogNavigationContext);
    return <div className="catalog-grid">{items.map(item => <button className="catalog-resource" key={item.id} onClick={() => open(item.kind, item.id)} aria-label={t(item.kind === 'artist' ? 'catalog.openArtist' : 'catalog.openAlbum', { name: item.name })}><Artwork resource={item}/><strong>{item.name}</strong><span>{discography ? item.year || t(item.releaseType === 'Single' ? 'catalog.single' : 'catalog.album') : item.kind === 'artist' ? t('library-ui.artista') : [item.artists.map(a => a.name).join(', '), item.year].filter(Boolean).join(' · ') || t('catalog.album')}</span></button>)}</div>;
}
function Loading() { return <div className="catalog-loading" role="status" aria-busy="true"><LoaderCircle className="spin"/><span>{t('catalog.loading')}</span><div className="skeleton-list" aria-hidden="true">{[0, 1, 2, 3].map(i => <div className="skeleton-row" key={i}><i /><span /><small /></div>)}</div></div>; }
function Failure({ message, retry }: {
    message: string;
    retry: () => void;
}) { return <div className="catalog-error" role="alert"><AlertCircle /><h2>{t('catalog.error')}</h2><p>{noticeText(message)}</p><button className="secondary-button" onClick={retry}>{t('App.riprova')}</button></div>; }
function CacheNote({ result }: {
    result: CatalogResult<unknown>;
}) { return <p className="catalog-cache" role={result.cache.degraded ? 'status' : undefined}>{result.cache.degraded ? t('catalog.stale') : result.cache.hit ? t('catalog.cached') : t('catalog.source')}</p>; }
export function CatalogSearchResults({ query, kind, artist }: {
    query: string;
    kind: CatalogKind;
    artist?: MusicResource;
}) {
    const [result, setResult] = useState<CatalogResult<CatalogSearch> | null>(null), [error, setError] = useState(''), [retry, setRetry] = useState(0), [busy, setBusy] = useState(true);
    useEffect(() => {
        const controller = new AbortController();
        setResult(null);
        setError('');
        setBusy(true);
        const timer = setTimeout(() => {
            void (artist && kind === 'album' ? api.catalog.artistAlbums(artist.id, query, controller.signal) : api.catalog.search(query, kind, controller.signal)).then(value => {
                if (!controller.signal.aborted) {
                    setResult(value);
                    usePlayer.getState().rememberSearch(query);
                }
            }).catch(e => {
                if (!controller.signal.aborted)
                    setError(e.message);
            }).finally(() => {
                if (!controller.signal.aborted)
                    setBusy(false);
            });
        }, 650);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [query, kind, retry, artist?.id]);
    return <section aria-label={t(kind === 'artist' ? 'catalog.artists' : 'catalog.albums')}>{busy ? <Loading /> : error ? <Failure message={error} retry={() => setRetry(n => n + 1)}/> : result ? <><CacheNote result={result}/>{!artist && kind === 'album' && <ArtistSearchMatch artist={result.data.priorityArtist}/>} {result.data.items.length ? <Resources items={result.data.items}/> : <div className="large-empty"><SearchEmpty /><h2>{t('catalog.noResults')}</h2><p>{t('catalog.tryQuery')}</p></div>}{result.data.truncated && <p className="catalog-hint">{t('catalog.searchLimit')}</p>}</> : null}</section>;
}
const SearchEmpty = () => <Disc3 size={32} aria-hidden="true"/>;
/** Keep the catalogue context intact: album slots are not flattened into row numbers. */
export function Tracks({ tracks, context = tracks, ordered = false, number = 1 }: {
    tracks: Track[];
    context?: Track[];
    ordered?: boolean;
    number?: number;
}) {
    const current = usePlayer(s => s.queue[s.index]?.id), exclusions = usePlayer(s => s.exclusions);
    const play = (track: Track) => {
        if (ordered) {
            usePlayer.getState().setShuffle(false);
            if (usePlayer.getState().repeat === 'track')
                usePlayer.setState({ repeat: 'off' });
        }
        usePlayer.getState().play(track, context);
    };
    return <div className="catalog-tracks">{tracks.map((track, index) => <div key={`${track.id}-${index}`} className={`catalog-track ${current === track.id ? 'selected' : ''} ${ordered ? 'album-row' : 'artist-row'}`}>
    <button className="catalog-track-play catalog-row-number" disabled={isExcluded(track, exclusions)} aria-label={t('App.riproduci', { p0: track.title })} onClick={() => play(track)}><span>{current === track.id ? <AudioLines size={18}/> : number + index}</span><Play className="row-play-icon" size={16} fill="currentColor"/></button>
    {!ordered && <div className="catalog-row-cover"><Cover track={track}/></div>}
    <div className="catalog-track-name"><button onClick={() => play(track)} disabled={isExcluded(track, exclusions)}>{track.title}</button>{ordered ? <TrackCatalogLinks track={track}/> : track.album ? <div className="catalog-row-album-inline"><CatalogResourceLink kind="album" resource={track.album}/></div> : null}<ExcludedBadge track={track}/></div>
    {!ordered && <div className="catalog-row-album">{track.album ? <CatalogResourceLink kind="album" resource={track.album}/> : <span>—</span>}</div>}
    <span className="duration" title={!track.duration ? t('ui3.unknownDuration') : undefined}>{track.duration ? formatTime(track.duration) : '—'}</span><TrackLibraryActions track={track}/>
  </div>)}</div>;
}
// Bounded per-artist view memory preserves the chosen discography tab on Back.
const discographyMemory = new Map<string, {
    section: 'albums' | 'singles';
    expanded: boolean;
}>();
function Discography({ artist }: {
    artist: ArtistDetail;
}) {
    const remembered = discographyMemory.get(artist.id), [section, setSection] = useState<'albums' | 'singles'>(remembered?.section ?? 'albums'), [expanded, setExpanded] = useState(remembered?.expanded ?? false);
    const [loaded, setLoaded] = useState<Partial<Record<'albums' | 'singles', CatalogResult<{
        items: CatalogResource[];
        truncated: boolean;
    }>>>>({}), [busy, setBusy] = useState(false), [error, setError] = useState(''), [request, setRequest] = useState(0);
    const tabId = useId(), tabs = useRef<HTMLDivElement>(null);
    useEffect(() => {
        discographyMemory.delete(artist.id);
        discographyMemory.set(artist.id, { section, expanded });
        if (discographyMemory.size > 24)
            discographyMemory.delete(discographyMemory.keys().next().value!);
    }, [artist.id, section, expanded]);
    useEffect(() => {
        if (!request)
            return;
        const controller = new AbortController();
        setBusy(true);
        setError('');
        void api.catalog.releases(artist.id, section, controller.signal).then(data => {
            if (!controller.signal.aborted)
                setLoaded(previous => ({ ...previous, [section]: data }));
        }).catch(e => {
            if (!controller.signal.aborted)
                setError(e.message);
        }).finally(() => {
            if (!controller.signal.aborted)
                setBusy(false);
        });
        return () => controller.abort();
    }, [request, artist.id, section]);
    const change = (next: 'albums' | 'singles') => { setSection(next); setExpanded(false); setRequest(0); setBusy(false); setError(''); };
    const current = loaded[section], items = current?.data.items ?? artist[section], more = section === 'albums' ? artist.moreAlbums : artist.moreSingles;
    const showAll = () => {
        setExpanded(true);
        if (more && !current)
            setRequest(n => n + 1);
    };
    return <section className="catalog-section catalog-discography" aria-labelledby={`${tabId}-heading`}>
    <div className="catalog-section-heading"><h2 id={`${tabId}-heading`}>{t('ui4.discography')}</h2><div className="catalog-discography-tabs" role="tablist" aria-label={t('ui4.discography')} ref={tabs} onKeyDown={e => {
            if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
                e.preventDefault();
                const next = e.key === 'Home' ? 'albums' : e.key === 'End' ? 'singles' : section === 'albums' ? 'singles' : 'albums';
                change(next);
                tabs.current?.querySelector<HTMLButtonElement>(`[data-section="${next}"]`)?.focus();
            }
        }}>{(['albums', 'singles'] as const).map(value => <button key={value} id={`${tabId}-${value}`} data-section={value} role="tab" type="button" tabIndex={section === value ? 0 : -1} aria-selected={section === value} aria-controls={`${tabId}-panel`} onClick={() => change(value)}>{t(value === 'albums' ? 'catalog.albums' : 'catalog.singles')}</button>)}</div>
    {(items.length > 3 || more) && <button className="text-button catalog-see-all" disabled={busy} onClick={() => expanded ? setExpanded(false) : showAll()}>{busy ? t('App.caricamento') : t(expanded ? 'ui4.showLess' : 'ui4.seeAll')}<ArrowRight size={16}/></button>}</div>
    <div role="tabpanel" id={`${tabId}-panel`} aria-labelledby={`${tabId}-${section}`} aria-busy={busy} tabIndex={0}><MotionSurface motionKey={`${artist.id}:${section}`} className="catalog-release-surface">{items.length ? <Resources items={expanded ? items : items.slice(0, 3)} discography/> : <p className="catalog-hint">{t('catalog.noReleases')}</p>}</MotionSurface></div>
    {error && <div className="catalog-release-error" role="alert"><span>{noticeText(error)}</span><button className="text-button" onClick={() => setRequest(n => n + 1)}>{t('App.riprova')}</button></div>}{current?.cache.degraded && <CacheNote result={current}/>} {expanded && current?.data.truncated && <p className="catalog-hint">{t('catalog.releaseLimit')}</p>}
  </section>;
}
function AlbumPlaylist({ name, tracks, total, request = 0 }: {
    name: string;
    tracks: Track[];
    total: number;
    request?: number;
}) {
    const library = useLibrary(), [snapshot, setSnapshot] = useState<Track[] | null>(null), [draft, setDraft] = useState(name.slice(0, 100)), [saved, setSaved] = useState('');
    useEffect(() => {
        if (request) {
            setSnapshot([...tracks]);
            setDraft(name.slice(0, 100));
            setSaved('');
        }
    }, [request]);
    return <div className="playlist-tools album-playlist">
    <button className="secondary-button" disabled={library.busy || !tracks.length || tracks.length > 1000} onClick={() => { setSnapshot([...tracks]); setDraft(name.slice(0, 100)); setSaved(''); }}><ListPlus size={16}/>{t('playlistTools.album')}</button>
    {snapshot && <form className="playlist-plan" onSubmit={async (e) => {
                e.preventDefault();
                const result = await library.saveQueue(draft.trim(), snapshot);
                if (result) {
                    setSaved(result.name);
                    setSnapshot(null);
                }
            }}>
      <p>{t('playlistTools.albumNote', { count: snapshot.length, total })}</p><label>{t('playlistTools.albumName')}<input aria-label={t('playlistTools.albumName')} required maxLength={100} value={draft} onChange={e => setDraft(e.target.value)}/></label>
      {library.error && <p className="form-error" role="alert">{noticeText(library.error)}</p>}
      <div className="playlist-tools-row"><button type="submit" className="primary-button" disabled={library.busy || !draft.trim()}>{t('library-ui.crea.playlist')}</button><button type="button" className="text-button" disabled={library.busy} onClick={() => setSnapshot(null)}>{t('library-ui.annulla')}</button></div>
    </form>}
    {saved && <p className="playlist-tools-feedback" role="status">{t('playlistTools.albumSaved', { name: saved })}</p>}
  </div>;
}
function CatalogMenu({ name, kind, canQueue, canSave, onQueue, onDetails, onSave, onSearch }: {
    name: string;
    kind: CatalogKind;
    canQueue: boolean;
    canSave: boolean;
    onQueue: () => void;
    onDetails: () => void;
    onSave: () => void;
    onSearch?: () => void;
}) {
    const id = useId(), ref = useRef<HTMLDivElement>(null);
    const action = (callback: () => void) => { ref.current?.hidePopover(); callback(); };
    return <><button type="button" className="icon-button catalog-more" aria-label={t('ui4.options', { name })} title={t('ui4.options', { name })} popoverTarget={id}><MoreHorizontal size={22}/></button><div id={id} ref={ref} popover="auto" className="listening-options catalog-options"><strong>{name}</strong><button disabled={!canQueue} onClick={() => action(onQueue)}><Plus size={17}/>{t('catalog.queueAll')}</button>{kind === 'album' && <button disabled={!canSave} onClick={() => action(onSave)}><ListPlus size={17}/>{t('playlistTools.album')}</button>}{onSearch && <button onClick={() => action(onSearch)}><UserRound size={17}/>{t('artistSearch.open')}</button>}<button onClick={() => action(onDetails)}><Disc3 size={17}/>{t(kind === 'album' ? 'ui4.albumDetails' : 'ui4.artistDetails')}</button></div></>;
}
export function CatalogPage({ kind, id, onArtistSearch, focusTrackId, focusRequest = 0 }: {
    kind: CatalogKind;
    id: string;
    onArtistSearch?: (artist: MusicResource) => void;
    focusTrackId?: string;
    focusRequest?: number;
}) {
    const [result, setResult] = useState<CatalogResult<CatalogDetail> | null>(null), [error, setError] = useState(''), [retry, setRetry] = useState(0), [busy, setBusy] = useState(true), [added, setAdded] = useState(false), [playlistRequest, setPlaylistRequest] = useState(0);
    const details = useRef<HTMLDetailsElement>(null), library = useLibrary(), exclusions = usePlayer(s => s.exclusions);
    const root = useRef<HTMLElement>(null);
    useEffect(() => {
        if (kind !== 'album' || !result || !focusTrackId)
            return;
        const row = Array.from(root.current?.querySelectorAll<HTMLElement>('[data-album-track-id]') ?? []).find(element => element.dataset.albumTrackId === focusTrackId);
        if (!row)
            return;
        row.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
        row.scrollIntoView({ block: 'center', behavior: motionMode() === 'curated' ? 'smooth' : 'instant' });
    }, [kind, result, focusTrackId, focusRequest]);
    useEffect(() => {
        const controller = new AbortController();
        setResult(null);
        setError('');
        setBusy(true);
        setAdded(false);
        setPlaylistRequest(0);
        void api.catalog.detail(kind, id, controller.signal).then(data => {
            if (!controller.signal.aborted)
                setResult(data);
        }).catch(e => {
            if (!controller.signal.aborted)
                setError(e.message);
        }).finally(() => {
            if (!controller.signal.aborted)
                setBusy(false);
        });
        return () => controller.abort();
    }, [kind, id, retry]);
    if (busy)
        return <Loading />;
    if (error)
        return <Failure message={error} retry={() => setRetry(n => n + 1)}/>;
    if (!result)
        return null;
    const data = result.data, tracks = data.kind === 'album' ? data.entries.flatMap(e => e.track ? [e.track] : []) : data.tracks, eligible = tracks.filter(track => !isExcluded(track, exclusions)), followed = library.data?.follows.some(f => f.kind === kind && f.id === id);
    const play = () => {
        if (!eligible.length)
            return;
        if (kind === 'album') {
            usePlayer.getState().setShuffle(false);
            if (usePlayer.getState().repeat === 'track')
                usePlayer.setState({ repeat: 'off' });
        }
        usePlayer.getState().play(eligible[0], tracks);
    };
    const revealDetails = () => {
        const element = details.current;
        if (!element)
            return;
        element.open = true;
        element.querySelector('summary')?.focus({ preventScroll: true });
        element.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches || usePlayer.getState().uiLayout.motion === 'essential' ? 'instant' : 'smooth' });
    };
    const completeDuration = data.kind === 'album' && !data.incomplete && data.entries.length > 0 && data.entries.every(entry => entry.track && entry.track.duration > 0) ? Math.round(tracks.reduce((sum, track) => sum + track.duration, 0) / 60) : null;
    return <article ref={root} className={`catalog-page catalog-${kind} ${data.name.length > 80 || data.name.split(/\s+/).some(word => word.length > 30) ? 'catalog-long-title' : ''}`} aria-label={data.name}>
    <header className="catalog-hero"><Artwork resource={data}/><div className="catalog-hero-copy"><h1 title={data.name}>{data.name}</h1>{data.kind === 'album' && <><div className="catalog-byline">{data.artists.map((artist, index) => <span key={`${artist.id}-${index}`}>{index > 0 && ', '}<CatalogResourceLink kind="artist" resource={artist}/></span>)}</div><p className="catalog-metadata">{[t(data.releaseType === 'Single' ? 'catalog.single' : 'catalog.album'), data.year, t('catalog.trackCount', { count: data.entries.length }), completeDuration !== null ? t('ui4.minutes', { count: completeDuration }) : null].filter(Boolean).join(' · ')}</p></>}
      <div className="catalog-hero-controls"><div className="catalog-actions"><button className="primary-button" disabled={!eligible.length} onClick={play}><Play size={18} fill="currentColor"/>{t(kind === 'album' ? 'catalog.playOrdered' : 'catalog.playArtist')}</button><button className="secondary-button" disabled={library.busy} aria-pressed={followed ?? false} onClick={() => void library.followResource(kind, id)}>{followed ? <Check size={18}/> : <Heart size={18}/>} {t(followed ? 'catalog.followed' : 'catalog.follow')}</button><CatalogMenu name={data.name} kind={kind} canQueue={tracks.length > 0} canSave={!library.busy && tracks.length > 0 && tracks.length <= 1000} onQueue={() => setAdded(usePlayer.getState().enqueueMany(tracks))} onDetails={revealDetails} onSave={() => { revealDetails(); setPlaylistRequest(n => n + 1); }} onSearch={data.kind === 'artist' && onArtistSearch ? () => onArtistSearch({ id: data.id, name: data.name }) : undefined}/></div>{added && <p className="catalog-feedback" role="status">{t('catalog.added', { count: tracks.length })}</p>}{library.error && <p className="form-error" role="alert">{noticeText(library.error)}</p>}</div></div></header>
    {result.cache.degraded && <CacheNote result={result}/>}
    {data.kind === 'album' ? <><div className="catalog-table-heading" aria-hidden="true"><span>#</span><span>{t('ui4.titleArtist')}</span><Clock3 size={18}/><Heart size={18}/><MoreHorizontal size={18}/></div>{data.incomplete && <p className="catalog-hint" role="status">{t('catalog.incomplete', { count: data.reportedCount ?? '?' })}</p>}{!eligible.length && <p className="catalog-hint">{tracks.length ? t('listening.allExcluded') : t('catalog.noTracks')}</p>}<div className="catalog-album-list" role="list" aria-label={t('catalog.albumTracks')}>{data.entries.map(entry => <div className="catalog-album-entry" role="listitem" data-album-track-id={entry.track?.id} data-jump-target={!!entry.track && entry.track.id === focusTrackId} key={entry.number}>{entry.track ? <Tracks tracks={[entry.track]} context={tracks} ordered number={entry.number}/> : <div className="catalog-unavailable"><span className="catalog-track-number">{entry.number}</span><div><strong>{entry.title}</strong><span>{t('catalog.unavailable')}</span></div><span className="duration">—</span></div>}</div>)}</div></> : <><Discography key={data.id} artist={data}/><section className="catalog-section catalog-artist-tracks"><h2>{t('ui4.tracks')}</h2>{tracks.length ? <Tracks tracks={tracks}/> : <p className="catalog-hint">{t('catalog.noTracks')}</p>}{tracks.length > 0 && !eligible.length && <p className="catalog-hint">{t('listening.allExcluded')}</p>}</section></>}
    <details ref={details} key={`${kind}:${id}`} className="catalog-details"><summary>{t(kind === 'album' ? 'ui4.albumDetails' : 'ui4.artistDetails')}</summary><div className="catalog-detail-body">{(data.name.length > 80 || data.name.split(/\s+/).some(word => word.length > 30)) && <p className="catalog-full-title">{data.name}</p>}<CacheNote result={result}/><p className="catalog-hint">{t(kind === 'album' ? 'catalog.orderHint' : 'catalog.artistHint')}</p>{data.kind === 'album' && <AlbumPlaylist key={data.id} name={data.name} tracks={tracks} total={data.entries.length} request={playlistRequest}/>}<MetadataPanel kind={kind} id={id}/>{data.description && <section className="catalog-description"><h2>{t('catalog.about')}</h2><p>{data.description}</p></section>}</div></details>
  </article>;
}
