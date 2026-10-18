import { noticeText } from './messages';
import { msg, formatLocale } from './messages';
import { useEffect, useState } from 'react';
import { ArrowRight, Heart, Search, X, RefreshCw, Play, Pause, LoaderCircle, ChevronLeft, Plus, Grid2X2, List, ArrowDownWideNarrow } from 'lucide-react';
import { nativePlayback } from './native';
import {BrowseSections, type BrowseCategory} from './browse';
import { Artwork, Empty, Skeleton, TrackRow, ScrollText } from './ui';
import type { NativeTrack, MobileResource, MobileLibrary, MobileCatalog, MobileCollection, MobilePlaylist, MobilePlayback } from '../../../packages/domain/mobile';
type Common = {
    play: (items: NativeTrack[], index: number) => void;
    more: (track: NativeTrack, context?: {
        playlistId?: string;
        index: number;
    }) => void;
    current?: NativeTrack;
    openResource: (item: MobileResource) => void;
};
const inFlight = new Map<string, Promise<MobileCatalog>>();
function catalogRequest(payload: Record<string, unknown>) {
    const key = JSON.stringify(payload);
    const previous = inFlight.get(key);
    if (previous)
        return previous;
    const promise = nativePlayback.catalog(payload).finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
    return promise;
}
export function useCatalog(payload: Record<string, unknown> | null) {
    const key = JSON.stringify(payload);
    const [data, setData] = useState<MobileCatalog | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
    useEffect(() => {
        if (!payload)
            return;
        let active = true;
        setData(null);
        setLoading(true);
        setError('');
        catalogRequest(payload).then(value => {
            if (active)
                setData(value);
        }).catch(() => {
            if (active)
                setError(msg("Il catalogo non risponde. Controlla la connessione e riprova."));
        }).finally(() => {
            if (active)
                setLoading(false);
        });
        return () => { active = false; };
    }, [key, attempt]);
    return { data, loading, error, retry: () => setAttempt(value => value + 1) };
}
export function ResourceCard({ item, onOpen }: {
    item: MobileResource;
    onOpen: () => void;
}) { return <button className={`cover-card${item.kind === 'artist' ? ' artist-card' : ''}`} onClick={onOpen} aria-label={msg("Apri {p0}: {p1}", { p0: item.kind === 'artist' ? msg('artista') : msg('album'), p1: item.name })}><Artwork src={item.artwork} round={item.kind === 'artist'} large/><strong>{item.name}</strong><small>{item.kind === 'artist' ? msg("Artista") : item.artists?.map(a => a.name).join(', ') || 'Album'}</small></button>; }
const collectionNames: Record<string, string> = { italy: "Hit Italia", releases: "Nuove uscite", global: "Hit globali", trending: "In tendenza" };
export function HomePage({ openBrowse, library, current, play, more, openCollection, openLikes, openRecent, openSearch, openPlayer, playback, toggleCurrent }: Common & {
    openBrowse: (category: BrowseCategory) => void;
    library: MobileLibrary;
    openCollection: (item: MobileCollection) => void;
    openLikes: () => void;
    openRecent: () => void;
    openSearch: () => void;
    openPlayer: () => void;
    playback: MobilePlayback;
    toggleCurrent: () => void;
}) {
    const { data, loading, error, retry } = useCatalog({ operation: 'home-index' });
    const resume = current ?? library.recent[0], isCurrent = !!resume && resume.videoId === current?.videoId;
    const recent = library.recent.filter(t => t.videoId !== resume?.videoId).slice(0, 2), collections = [...(data?.collections ?? [])].filter(item => item.id === 'global' || item.id === 'releases').sort((a, b) => ['global', 'releases'].indexOf(a.id) - ['global', 'releases'].indexOf(b.id));
    const progress = isCurrent && playback.duration > 0 ? Math.max(0, Math.min(1, playback.position / playback.duration)) : 0;
    return <section className="home-page home-listening" aria-label="Home"><h1>{resume ? msg("Il tuo ascolto continua") : msg("La tua musica, adesso.")}</h1>
  {resume ? <div className="home-resume"><button className="resume-identity" aria-label={isCurrent ? msg("Apri ascolto: {p0}", { p0: resume.title }) : msg("Riprendi {p0}", { p0: resume.title })} onClick={() => isCurrent ? openPlayer() : play([resume], 0)}><Artwork trackId={resume.videoId} src={resume.thumbnail} large/><span><strong><ScrollText>{resume.title}</ScrollText></strong><small><ScrollText>{resume.artist}</ScrollText></small></span></button><button className="resume-play" aria-label={isCurrent && playback.playing ? msg("Metti in pausa dalla Home") : msg("Riproduci dalla Home")} onClick={() => isCurrent ? toggleCurrent() : play([resume], 0)}>{isCurrent && playback.loading ? <LoaderCircle className="spin" size={25}/> : isCurrent && playback.playing ? <Pause size={25} fill="currentColor"/> : <Play size={25} fill="currentColor"/>}</button>{isCurrent && <div className="resume-progress" aria-hidden="true"><span style={{ transform: `scaleX(${progress})` }}/></div>}</div> : <div className="welcome-inline"><p>{msg("I tuoi ascolti compariranno qui.")}</p><button className="tonal" onClick={openSearch}>{msg("Trova un brano") + " "}<ArrowRight size={19}/></button></div>}
  {recent.length > 0 && <><div className="section-heading"><h2>{msg("Riprendi da qui")}</h2><button aria-label={msg("Mostra ascolti recenti")} onClick={openRecent}><ArrowRight size={22}/></button></div><div className="home-recent-list">{recent.map(track => <TrackRow key={track.videoId} track={track} onPlay={() => play([track], 0)} onMore={() => more(track)}/>)}</div></>}
  <div className="section-heading"><h2>{msg("Questa settimana")}</h2><button aria-label={msg("Ricarica raccolte")} onClick={retry} disabled={loading}><RefreshCw size={20} className={loading ? 'spin' : ''}/></button></div>
  {loading ? <div className="cover-skeletons" aria-label={msg("Caricamento raccolte")}><i /><i /></div> : error ? <div className="inline-error" role="alert"><p>{noticeText(error)}</p><button className="tonal" onClick={retry}>{msg("Riprova")}</button></div> : collections.length ? <><div className="cover-shelf home-shelf home-weekly-shelf">{collections.map(item => <button className="cover-card" key={item.id} onClick={() => openCollection(item)} aria-label={msg("Apri raccolta: {p0}", { p0: (collectionNames[item.id] ? msg(collectionNames[item.id]) : item.sourceTitle) })}><Artwork trackId={"trackId" in item ? item.trackId as string : undefined} src={item.artwork} large/><strong>{(collectionNames[item.id] ? msg(collectionNames[item.id]) : item.sourceTitle)}</strong></button>)}</div><p className="source-date">{data?.stale ? msg("Edizione salvata \u00B7 ") : ''}{data?.fetchedAt ? msg("Catalogo del {p0}", { p0: new Date(data.fetchedAt).toLocaleDateString(formatLocale()) }) : ''}</p></> : <div className="welcome-inline"><p>{msg("Nessuna raccolta disponibile dal catalogo al momento.")}</p><button className="text-action" onClick={retry}>{msg("Riprova") + " "}<RefreshCw size={18}/></button></div>}
  <BrowseSections compact open={openBrowse}/>
  <div className="section-heading"><h2>{msg("I tuoi ascolti")}</h2></div><div className="home-personal-links"><button onClick={openLikes}><Heart size={25}/><span><strong>{msg("Brani piaciuti")}</strong><small>{library.likes.length}{" " + msg("brani \u00B7 sul dispositivo")}</small></span><ArrowRight size={20}/></button>{library.recent.length > 0 && <button onClick={openRecent}><Artwork trackId={library.recent[0].videoId} src={library.recent[0].thumbnail}/><span><strong>{msg("Ascoltati di recente")}</strong><small>{library.recent.length}{" " + msg("brani avviati")}</small></span><ArrowRight size={20}/></button>}</div>
 </section>;
}
export function SearchPage({ openBrowse, query, setQuery, current, play, more, openResource, playing = false }: Common & {
    openBrowse: (category: BrowseCategory) => void;
    query: string;
    setQuery: (value: string) => void;
    playing?: boolean;
}) {
    const [type, setType] = useState('Tutti'), [items, setItems] = useState<NativeTrack[]>([]), [resources, setResources] = useState<MobileResource[]>([]), [loading, setLoading] = useState(false), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
    const [priority, setPriority] = useState<{
        query: string;
        id: string;
    } | null>(null);
    useEffect(() => {
        const value = query.trim();
        if (value.length < 3) {
            setItems([]);
            setResources([]);
            setLoading(false);
            setError('');
            return;
        }
        let active = true;
        setLoading(true);
        setError('');
        const timer = setTimeout(async () => {
            try {
                const songs = type === 'Tutti' || type === 'Brani' ? nativePlayback.search({ query: value }) : Promise.resolve({ items: [] as NativeTrack[] });
                const kinds = type === 'Tutti' ? ['artist', 'album'] : type === 'Artisti' ? ['artist'] : type === 'Album' ? ['album'] : [];
                const results = await Promise.allSettled([songs, ...kinds.map(kind => catalogRequest({ operation: 'catalog-search', kind, query: value }))]);
                if (!active)
                    return;
                const first = results[0];
                setItems(first.status === 'fulfilled' ? (first.value as {
                    items: NativeTrack[];
                }).items : []);
                const found = results.slice(1).flatMap(result => result.status === 'fulfilled' ? (result.value as MobileCatalog).items ?? [] : []);
                setResources(found);
                if (results.every(result => result.status === 'rejected'))
                    setError(msg("La ricerca non \u00E8 disponibile. Controlla la connessione e riprova."));
                else if (results.some(result => result.status === 'rejected'))
                    setError(msg("Una parte dei risultati non \u00E8 disponibile. Puoi riprovare."));
            }
            catch {
                if (active)
                    setError(msg("Ricerca non disponibile. Riprova."));
            }
            finally {
                if (active)
                    setLoading(false);
            }
        }, 600);
        return () => { active = false; clearTimeout(timer); };
    }, [query, type, attempt]);
    const artists = resources.filter(item => item.kind === 'artist'), albums = resources.filter(item => item.kind === 'album');
    // Artist identity and credits determine priority; a song merely named after an artist is not promoted.
    const normalized = query.trim().toLocaleLowerCase('it-IT');
    const exact = artists.find(item => item.name.toLocaleLowerCase('it-IT') === normalized);
    useEffect(() => {
        if (exact)
            setPriority({ query: normalized, id: exact.id });
    }, [exact?.id, normalized]);
    const priorityId = exact?.id ?? (priority?.query === normalized ? priority.id : null);
    const ranked = priorityId ? [...items].sort((a, b) => Number(b.artists?.some(p => p.id === priorityId) ?? false) - Number(a.artists?.some(p => p.id === priorityId) ?? false)) : items;
    const rankedArtists = exact ? [exact, ...artists.filter(item => item.id !== exact.id)] : artists;
    const rankedAlbums = priorityId ? [...albums].sort((a, b) => Number(b.artists?.some(p => p.id === priorityId) ?? false) - Number(a.artists?.some(p => p.id === priorityId) ?? false)) : albums;
    function heading(label: string) { return <div className="section-heading search-section-heading"><h2>{msg(label)}</h2>{type === 'Tutti' && <button aria-label={msg("Mostra tutti: {p0}", { p0: msg(label) })} onClick={() => setType(label)}><ArrowRight size={22}/></button>}</div>; }
    return <section className="search-page" aria-label={msg("Cerca")}><h1>{msg("Cerca")}</h1><form role="search" onSubmit={event => { event.preventDefault(); (document.activeElement as HTMLElement)?.blur(); }}><label className="search-field"><Search size={22}/><input type="search" aria-label={msg("Cerca un brano o un artista")} placeholder={msg("Brani, artisti, album")} maxLength={200} autoComplete="off" value={query} onChange={event => setQuery(event.target.value)} enterKeyHint="search"/>{query && <button type="button" aria-label={msg("Cancella ricerca")} onClick={() => setQuery('')}><X size={20}/></button>}</label></form>
 <div className="filter-row" aria-label={msg("Tipo di risultato")}>{['Tutti', 'Brani', 'Artisti', 'Album'].map(item => <button key={item} className="filter" aria-pressed={type === item} onClick={() => setType(item)}>{msg(item)}</button>)}</div>
 {query.trim().length < 3 ? <><h2>{msg("Cosa vuoi ascoltare?")}</h2><p className="source-date">{msg("Scrivi almeno tre caratteri per cercare nel catalogo.")}</p><BrowseSections open={openBrowse}/></> : loading ? <Skeleton /> : <div className="search-results" key={`${query.trim()}:${type}:${attempt}`}>
 {error && <div className="inline-error" role="alert"><p>{noticeText(error)}</p><button className="text-action" onClick={() => setAttempt(v => v + 1)}>{msg("Riprova") + " "}<RefreshCw size={18}/></button></div>}
 {artists.length > 0 && <>{heading('Artisti')}<div className="artist-results">{rankedArtists.slice(0, type === 'Tutti' ? 1 : 20).map(item => <button className="artist-result" key={item.id} onClick={() => openResource(item)} aria-label={msg("Apri artista: {p0}", { p0: item.name })}><Artwork trackId={"trackId" in item ? item.trackId as string : undefined} src={item.artwork}/><span><strong><ScrollText>{item.name}</ScrollText></strong><small>{msg("Artista")}</small></span><ArrowRight size={20}/></button>)}</div></>}
 {ranked.length > 0 && <>{heading('Brani')}<div className="track-list">{ranked.slice(0, type === 'Tutti' ? 2 : 20).map((track, index) => <TrackRow key={track.videoId} track={track} active={track.videoId === current?.videoId} showActivity playing={playing} onPlay={() => play(ranked, index)} onMore={() => more(track)}/>)}</div></>}
 {albums.length > 0 && <>{heading('Album')}<div className={type === 'Tutti' ? 'cover-shelf' : 'collection-grid'}>{rankedAlbums.slice(0, 20).map(item => <ResourceCard key={item.id} item={item} onOpen={() => openResource(item)}/>)}</div></>}
 {!error && !ranked.length && !resources.length && <Empty title={msg("Nessun risultato")}>{msg("Prova con un altro titolo o con il nome completo dell'artista.")}</Empty>}
 </div>}
 </section>;
}
export function LibraryPage({ library, openResource, openPlaylist, openLikes, searching }: {
    library: MobileLibrary;
    openResource: (resource: MobileResource) => void;
    openPlaylist: (playlist: MobilePlaylist) => void;
    openLikes: () => void;
    searching: boolean;
}) {
    const [filter, setFilter] = useState('Tutti'), [view, setView] = useState(() => localStorage.getItem('ritvio.mobile.libraryView') === 'list' ? 'list' : 'grid'), [query, setQuery] = useState(''), [sort, setSort] = useState('recent');
    function changeView(value: string) { setView(value); localStorage.setItem('ritvio.mobile.libraryView', value); }
    type Entry = { trackId?: string;
        id: string;
        name: string;
        subtitle: string;
        artwork?: string | null;
        kind: 'likes' | 'playlist' | 'album' | 'artist';
        open: () => void;
    };
    const entries: Entry[] = [{ id: 'likes', name: msg("Brani piaciuti"), subtitle: msg("{p0} brani", { p0: library.likes.length }), kind: 'likes', open: openLikes }, ...library.playlists.slice().sort((a, b) => b.updatedAt - a.updatedAt).map(p => ({ id: p.id, name: p.name, subtitle: msg("Playlist \u00B7 {p0} brani", { p0: p.items.length }), artwork: p.cover ?? p.items[0]?.thumbnail, trackId: p.cover ? undefined : p.items[0]?.videoId, kind: 'playlist' as const, open: () => openPlaylist(p) })), ...library.follows.filter(p => p.kind === 'album').slice().reverse().map(p => ({ id: p.id, name: p.name, subtitle: 'Album', artwork: p.artwork, kind: 'album' as const, open: () => openResource(p) }))];
    const artists = library.follows.filter(p => p.kind === 'artist').slice().reverse();
    const needle = (searching ? query.trim() : '').toLocaleLowerCase('it-IT');
    const visibleArtists = artists.filter(item => item.name.toLocaleLowerCase('it-IT').includes(needle));
    if (sort === 'name')
        visibleArtists.sort((a, b) => a.name.localeCompare(b.name, formatLocale()));
    let visible = entries.filter(item => (filter === 'Tutti' || filter === 'Playlist' && ['playlist', 'likes'].includes(item.kind) || filter === 'Album' && item.kind === 'album') && item.name.toLocaleLowerCase('it-IT').includes(needle));
    if (sort === 'name')
        visible = visible.sort((a, b) => a.name.localeCompare(b.name, formatLocale()));
    return <section className="library-page" aria-label={msg("La tua libreria")}><h1>{msg("La tua libreria")}</h1>
 <p className="library-summary">{library.playlists.length}{" " + msg("playlist \u00B7") + " "}{library.follows.filter(item => item.kind === 'album').length}{" " + msg("album \u00B7") + " "}{artists.length} {artists.length === 1 ? msg("artista") : msg("artisti")}</p>
 {searching && <div className="search-field"><Search size={21}/><input autoFocus type="search" aria-label={msg("Filtra libreria")} placeholder={msg("Cerca nella tua libreria")} value={query} onChange={event => setQuery(event.target.value)}/>{query && <button aria-label={msg("Cancella filtro libreria")} onClick={() => setQuery('')}><X size={20}/></button>}</div>}
 <div className="filter-row" aria-label={msg("Categorie della libreria")}>{['Tutti', 'Playlist', 'Album', 'Artisti'].map(item => <button key={item} className="filter" aria-pressed={filter === item} onClick={() => setFilter(item)}>{msg(item)}</button>)}</div>
 <div className="library-toolbar"><button className="sort-control" aria-label={msg("Ordina: {p0}", { p0: sort === 'recent' ? msg("Recenti") : msg("Nome") })} onClick={() => setSort(sort === 'recent' ? 'name' : 'recent')}><ArrowDownWideNarrow size={19}/>{sort === 'recent' ? msg("Recenti") : msg("Nome")}</button><div><button aria-label={msg("Modalit\u00E0 griglia")} aria-pressed={view === 'grid'} onClick={() => changeView('grid')}><Grid2X2 size={22}/></button><button aria-label={msg("Modalit\u00E0 elenco")} aria-pressed={view === 'list'} onClick={() => changeView('list')}><List size={24}/></button></div></div>
 {filter !== 'Artisti' && <div className={view === 'grid' ? 'collection-grid' : 'collection-list'}>{visible.map(item => <button key={item.id} className={`cover-card${item.kind === 'likes' ? ' likes-card' : ''}`} onClick={item.open}><Artwork trackId={item.trackId} src={item.artwork} large>{item.kind === 'likes' ? <Heart size={54}/> : undefined}</Artwork><span><strong>{item.name}</strong><small>{item.subtitle}</small></span></button>)}</div>}
 {(filter === 'Artisti' || filter === 'Tutti') && <>{filter === 'Tutti' && visibleArtists.length > 0 && <div className="section-heading"><h2>{msg("Artisti seguiti")}</h2><span>{visibleArtists.length}</span></div>}{visibleArtists.length > 0 ? <div className={filter === 'Tutti' ? 'artist-shelf' : view === 'grid' ? 'collection-grid' : 'collection-list'}>{visibleArtists.map(item => <ResourceCard key={item.id} item={item} onOpen={() => openResource(item)}/>)}</div> : filter === 'Artisti' && <Empty title={needle ? msg("Nessuna corrispondenza") : msg("I tuoi artisti, qui")}>{needle ? msg("Prova un altro nome.") : msg("Segui un artista dalla sua pagina per ritrovarlo qui.")}</Empty>}</>}
 {filter !== 'Artisti' && !visible.length && !(filter === 'Tutti' && visibleArtists.length) && <Empty title={needle ? msg("Nessuna corrispondenza") : msg("La tua raccolta inizia qui")}>{needle ? msg("Prova un altro nome.") : filter === 'Album' ? msg("Salva un album dalla sua pagina.") : msg("Crea una playlist e aggiungi i tuoi brani.")}</Empty>}
 </section>;
}
export type DetailTarget = {
    kind: 'resource';
    resource: MobileResource;
} | {
    kind: 'collection';
    collection: MobileCollection;
};
export function CatalogDetail({ target, current, play, more, openResource, close, library, follow }: {
    target: DetailTarget;
    close: () => void;
    library: MobileLibrary;
    follow: (item: MobileResource, value: boolean) => void;
} & Common) {
    const payload = target.kind === 'resource' ? { operation: 'detail', kind: target.resource.kind, id: target.resource.id } : { operation: 'home-collection', collection: target.collection };
    const { data, loading, error, retry } = useCatalog(payload);
    const resource = target.kind === 'resource' ? target.resource : null;
    const name = resource?.name ?? (target.kind === 'collection' && collectionNames[target.collection.id] ? msg(collectionNames[target.collection.id]) : msg('Raccolta'));
    const image = data?.artwork ?? resource?.artwork ?? (target.kind === 'collection' ? target.collection.artwork : null);
    const tracks = data?.tracks ?? data?.entries?.flatMap(entry => entry.track ? [entry.track] : []) ?? [], albums = [...(data?.albums ?? []), ...(data?.singles ?? [])];
    const saved = resource ? library.follows.some(item => item.id === resource.id) : false;
    const people = resource?.artists ?? [], duration = tracks.reduce((sum, track) => sum + Math.max(0, track.duration), 0);
    return <section className="detail-page"><button className="back-control" onClick={close}><ChevronLeft size={23}/>{msg("Indietro")}</button><div className={`detail-hero${resource?.kind === 'artist' ? ' artist-hero' : ''}`}><Artwork src={image} large round={resource?.kind === 'artist'}/><h1>{target.kind === 'collection' ? name : data?.name ?? name}</h1><p>{resource?.kind === 'artist' ? msg("Artista") : resource?.kind === 'album' ? 'Album' : msg('Raccolta')}</p><div className="detail-actions"><button className="primary" disabled={!tracks.length} onClick={() => play(tracks.slice(0, 100), 0)}><Play size={21} fill="currentColor"/>{msg("Ascolta")}</button>{resource && <button className="tonal" aria-pressed={saved} onClick={() => follow({ ...resource, artwork: image ?? null }, !saved)}><Heart size={20} fill={saved ? 'currentColor' : 'none'}/>{saved ? msg("Salvato") : resource.kind === 'artist' ? msg("Segui") : msg("Salva album")}</button>}</div></div>
 {resource?.kind === 'album' && people.length > 0 && <div className="detail-credits">{people.map(person => <button key={person.id} className="text-action" onClick={() => openResource({ id: person.id, name: person.name, kind: 'artist', artwork: null })}>{person.name}</button>)}</div>}
 {loading ? <Skeleton /> : error ? <div className="inline-error" role="alert"><p>{noticeText(error)}</p><button className="tonal" onClick={retry}>{msg("Riprova")}</button></div> : <>
 {(tracks.length > 0 || resource?.year) && <p className="detail-summary">{[resource?.year, tracks.length ? msg("{p0} brani{p1}", { p0: tracks.length, p1: data?.partial ? msg(" disponibili") : '' }) : null, duration >= 60 ? `${Math.floor(duration / 60)} min` : null].filter(Boolean).join(' · ')}</p>}
 {albums.length > 0 && <><div className="section-heading"><h2>{msg("Discografia")}</h2></div><div className="cover-shelf">{albums.map((item, index) => <ResourceCard key={`${item.id}:${index}`} item={item} onOpen={() => openResource(item)}/>)}</div></>}
 {(tracks.length > 0 || !!data?.entries?.length) && <><div className="section-heading"><h2>{resource?.kind === 'artist' ? msg('Brani') : msg("Tracce")}</h2><span>{tracks.length}{data?.partial ? msg(" \u00B7 selezione parziale") : ''}</span></div><div className="track-list">{resource?.kind === 'album' && data?.entries?.length ? data.entries.map((entry, index) => entry.track ? <TrackRow key={`entry:${index}`} number={entry.number} track={entry.track} active={current?.videoId === entry.track.videoId} onPlay={() => play(tracks, data.entries!.slice(0, index).filter(item => item.track).length)} onMore={() => more(entry.track!)}/> : <div key={`entry:${index}`} className="unavailable-track"><span className="track-number">{entry.number}</span><span><strong>{entry.title}</strong><small>{msg("Non disponibile")}</small></span></div>) : tracks.map((track, index) => <TrackRow key={`${track.videoId}:${index}`} number={resource?.kind === 'album' ? index + 1 : undefined} track={track} active={current?.videoId === track.videoId} onPlay={() => play(tracks, index)} onMore={() => more(track)}/>)}</div>{tracks.length > 100 && <p className="source-date">{msg("Il player accoda fino a 100 brani per volta.")}</p>}</>}
 {!tracks.length && !albums.length && !data?.entries?.length && <Empty title={msg("Nessuna traccia disponibile")}>{msg("Il catalogo non ha restituito contenuti riproducibili per questa pagina.")}</Empty>}
 {data?.entries?.some(entry => !entry.track) && <p className="source-date">{msg("Alcune tracce dell'album non sono disponibili nel catalogo.")}</p>}
 {data?.stale && <p className="source-date">{msg("Stai visualizzando una copia salvata. Il catalogo non risponde.")}</p>}
 </>}
 </section>;
}
