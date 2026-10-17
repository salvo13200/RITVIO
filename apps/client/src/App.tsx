import { noticeText } from './i18n';
import { MiniController } from './mini-controller';
import { QueuePanel } from './queue-panel';
import { LayoutResizeHandle } from './layout-controls';
import { SleepTimerController } from './sleep-timer';
import { PrivateIndicator } from './listening-activity';
import { useShallow } from 'zustand/react/shallow';
import { PlayerBar } from './playerbar';
import { MotionSurface } from './motion-surface';
import { animateUI, useMotionMode, useMotionLifecycle } from './ui-motion';
import { BrandMark, discoveryCategories } from './home-page';
import { HomePage } from './home-v2';
import type { HomeCollectionId } from '../../../packages/domain/home';
import { Button, Cover } from './ui-controls';
import { lazy, useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { Home, Search, Library, Headphones, ArrowUpRight, ChevronUp, ChevronDown, Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1, Volume2, VolumeX, ListMusic, Plus, Music2, X, GripVertical, Settings, Sun, Moon, Check, LoaderCircle, Link2, ArrowRight, Disc3, AlertCircle } from 'lucide-react';
import { usePlayer } from './store';
import { AudioController, seek, audio } from './player';
import { api, ApiError } from './api';
import { formatTime, videoIdFromInput, type Track, type SearchResponse, type RuntimeStatus, type MusicResource } from '../../../packages/domain/index';
import { t } from './i18n';
import { useLibrary } from './library';
import { useLibraryBrowser } from './library-browser';
import { ProfileButton, TrackLibraryActions, FollowTrack, PlaylistCover } from './library-controls';
import { usePageNavigation } from './page-navigation';
import { Heart, ChevronLeft, ChevronRight, Grip } from 'lucide-react';
import { MetadataPanel } from './metadata-panel';
import type { PreferenceCategory } from './preferences-page';
import { DeferredContent } from './deferred-content';
import { SearchDiscovery } from './search-discovery';
import { ListeningArtwork, UpcomingTracks } from './listening-artwork';
import { moveWithMotion } from './queue-motion';
import { ExcludedBadge } from './listening-preferences';
import { isExcluded, upcomingTracks } from '../../../packages/domain/listening';
import { ArtistSearchMatch, ArtistSearchScope } from './artist-search';
import { StorySharingRoot } from './story-sharing';
import { SearchHighlights } from './search-highlights';
const SituationPage = lazy(() => import('./situations').then(m => ({ default: m.SituationPage })));
const ImmersivePage = lazy(() => import('./immersive').then(m => ({ default: m.ImmersivePage })));
const LibraryPage = lazy(() => import('./library-ui').then(module => ({ default: module.LibraryPage })));
const LyricsPanel = lazy(() => import('./lyrics').then(module => ({ default: module.LyricsPanel })));
const PreferencesPage = lazy(() => import('./preferences-page').then(module => ({ default: module.PreferencesPage })));
const CatalogPage = lazy(() => import('./catalog-pages').then(module => ({ default: module.CatalogPage })));
const HomeCollectionPage = lazy(() => import('./home-collection-page').then(module => ({ default: module.HomeCollectionPage })));
const CatalogSearchResults = lazy(() => import('./catalog-pages').then(module => ({ default: module.CatalogSearchResults })));
import { CatalogNavigationContext, CatalogResourceLink, TrackCatalogLinks } from './catalog-navigation';
function TrackRow({ track, index, onPlay }: {
    track: Track;
    index: number;
    onPlay: () => void;
}) {
    const current = usePlayer(s => s.queue[s.index]);
    const playing = usePlayer(s => s.playing);
    const [added, setAdded] = useState(false);
    const active = current?.id === track.id;
    return <div className={`track-row ${active ? 'selected' : ''}`}>
    <button className="row-number" onClick={onPlay} aria-label={t("App.riproduci", { p0: track.title })}>{active && playing ? <span className="equalizer"><i /><i /><i /></span> : <><span>{index + 1}</span><Play size={15} fill="currentColor"/></>}</button>
    <Cover track={track}/><div className="track-name"><button className="track-name-play" onClick={onPlay}><strong title={track.title}>{track.title}</strong></button><TrackCatalogLinks track={track}/>{track.album && <div className="track-album-inline"><CatalogResourceLink resource={track.album} kind="album"/></div>}<ExcludedBadge track={track}/></div>
    <span className="source-label track-album">{track.album ? <CatalogResourceLink resource={track.album} kind="album"/> : "—"}</span><span className="duration">{formatTime(track.duration)}</span>
    <TrackLibraryActions track={track}/>

  </div>;
}
export function App({ offlinePreview = false, quickArtwork }: {
    offlinePreview?: boolean;
    quickArtwork?: Readonly<Record<string, string>>;
} = {}) {
    useMotionLifecycle();
    const motionMode = useMotionMode();
    const [albumTrackTarget, setAlbumTrackTarget] = useState<{
        albumId: string;
        trackId: string;
        request: number;
    } | null>(null);
    const albumJumpRequest = useRef(0);
    const [collectionAutoplay, setCollectionAutoplay] = useState(false);
    const player = usePlayer(useShallow(s => ({ uiLayout: s.uiLayout, setUILayout: s.setUILayout, queue: s.queue, index: s.index, recent: s.recent, theme: s.theme, shuffle: s.shuffle, shufflePlan: s.shufflePlan, exclusions: s.exclusions, play: s.play, select: s.select, move: s.move, remove: s.remove })));
    const current = player.queue[player.index];
    const nextQueueId = upcomingTracks(player.queue, player.index, player.shuffle, player.shufflePlan, player.exclusions, usePlayer.getState().priorityIds)[0]?.queueId;
    const library = useLibrary();
    const { page, setPage, back, forward, canBack, canForward } = usePageNavigation();
    const libraryTab = useLibraryBrowser(s => s.tab), setLibraryTab = useLibraryBrowser(s => s.setTab);
    const [createRequested, setCreateRequested] = useState(false);
    const [query, setQuery] = useState('');
    const [search, setSearch] = useState<SearchResponse | null>(null);
    const navPage = page.startsWith('situation:') || page === 'immersive' ? 'home' : page.startsWith('collection:') ? 'home' : page.startsWith('album:') || page.startsWith('artist:') ? 'search' : page;
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [link, setLink] = useState('');
    const [linkBusy, setLinkBusy] = useState(false);
    const [catalogMode, setCatalogMode] = useState<'all' | 'track' | 'artist' | 'album'>('all');
    const [searchArtist, setSearchArtist] = useState<MusicResource | null>(null);
    const [side, setSide] = useState<'now' | 'queue'>('now');
    const [sideOpen, setSideOpen] = useState(false);
    const [preferenceCategory, setPreferenceCategory] = useState<PreferenceCategory>('appearance');
    const [status, setStatus] = useState<RuntimeStatus | null>(null);
    const [loadMore, setLoadMore] = useState(false);
    const [retry, setRetry] = useState(0);
    const main = useRef<HTMLElement>(null);
    const panel = useRef<HTMLElement>(null);
    const searchInput = useRef<HTMLInputElement>(null);
    const drag = useRef<number | null>(null);
    const requestSequence = useRef(0);
    const panelOpener = useRef<HTMLElement | null>(null);
    useEffect(() => {
        if (page !== 'library')
            main.current?.scrollTo({ top: 0 });
    }, [page]);
    useEffect(() => {
        if (!offlinePreview)
            void api.status().then(setStatus).catch(e => setError(e.message));
    }, [offlinePreview]);
    useEffect(() => {
        if (!offlinePreview)
            void useLibrary.getState().load();
    }, [offlinePreview]);
    useEffect(() => { document.documentElement.dataset.theme = player.theme; }, [player.theme]);
    useEffect(() => { document.documentElement.dataset.motion = player.uiLayout.motion; }, [player.uiLayout.motion]);
    useEffect(() => {
        const controller = new AbortController();
        const sequence = ++requestSequence.current;
        setError(null);
        setSearch(null);
        setLoadMore(false);
        if ((query.trim().length < 3 && !searchArtist) || (catalogMode !== 'track' && catalogMode !== 'all')) {
            setBusy(false);
            return () => controller.abort();
        }
        setBusy(true);
        const timer = setTimeout(() => {
            void (searchArtist ? api.searchArtist(searchArtist.id, query, controller.signal) : api.search(query, undefined, controller.signal)).then(r => {
                if (sequence === requestSequence.current) {
                    setSearch(r);
                    usePlayer.getState().rememberSearch(query);
                }
            }).catch(e => {
                if (e.name !== 'AbortError' && sequence === requestSequence.current)
                    setError(e.message);
            }).finally(() => {
                if (sequence === requestSequence.current)
                    setBusy(false);
            });
        }, 650);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [query, retry, catalogMode, searchArtist?.id]);
    useEffect(() => {
        const listener = (e: KeyboardEvent) => {
            if (e.defaultPrevented || document.querySelector('dialog[open]'))
                return;
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setPage('search');
                searchInput.current?.focus();
                return;
            }
            const target = e.target as HTMLElement;
            if (target.closest('input,textarea,select,button,a,summary,[role="separator"],[role="tab"],[role="slider"],[contenteditable="true"],dialog,.lyrics-scroll,.preferences-page') || e.altKey || e.ctrlKey || e.metaKey)
                return;
            if (e.code === "Space") {
                e.preventDefault();
                usePlayer.getState().toggle();
            }
            if (e.key === "ArrowRight") {
                e.preventDefault();
                seek(audio.currentTime + 5);
            }
            if (e.key === "ArrowLeft") {
                e.preventDefault();
                seek(Math.max(0, audio.currentTime - 5));
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                usePlayer.setState(s => ({ volume: Math.min(1, s.volume + 0.05) }));
            }
            if (e.key === "ArrowDown") {
                e.preventDefault();
                usePlayer.setState(s => ({ volume: Math.max(0, s.volume - 0.05) }));
            }
        };
        window.addEventListener('keydown', listener);
        return () => window.removeEventListener('keydown', listener);
    }, []);
    const showLibrary = (likes = false) => { useLibrary.getState().cancelOpen(); setLibraryTab(likes ? 'likes' : 'playlists'); setPage('library'); };
    const openPanel = (next: 'now' | 'queue') => {
        if (document.activeElement instanceof HTMLElement && !document.activeElement.closest('.panel-slot'))
            panelOpener.current = document.activeElement;
        setSide(next);
        setSideOpen(true);
        if (window.innerWidth <= 1060)
            requestAnimationFrame(() => panel.current?.querySelector<HTMLButtonElement>('.panel-tabs button')?.focus({ preventScroll: true }));
    };
    useEffect(() => {
        const show = () => {
            if (document.activeElement instanceof HTMLElement && !document.activeElement.closest('.panel-slot'))
                panelOpener.current = document.activeElement;
            setSide('queue');
            setSideOpen(true);
            if (window.innerWidth <= 1060)
                requestAnimationFrame(() => panel.current?.querySelector<HTMLButtonElement>('.panel-tabs button')?.focus({ preventScroll: true }));
        };
        window.addEventListener('ritvio:show-radio', show);
        return () => window.removeEventListener('ritvio:show-radio', show);
    }, []);
    const showNow = () => openPanel('now');
    const openLyrics = () => {
        setPage('lyrics');
        setSide('now');
        if (window.innerWidth <= 1060)
            setSideOpen(false);
        requestAnimationFrame(() => main.current?.focus({ preventScroll: true }));
    };
    const toggleLyrics = () => {
        if (page === 'lyrics') {
            if (canBack)
                back();
            else
                setPage('home');
            requestAnimationFrame(() => document.getElementById('lyrics-reader-trigger')?.focus({ preventScroll: true }));
        }
        else
            openLyrics();
    };
    const closePanel = () => {
        if (document.activeElement?.closest('.panel-slot')) {
            const opener = panelOpener.current;
            (opener?.isConnected ? opener : document.getElementById(`${side}-panel-trigger`))?.focus({ preventScroll: true });
        }
        setSideOpen(false);
    };
    const closePreferences = () => {
        if (canBack)
            back();
        else
            setPage('home');
        requestAnimationFrame(() => document.getElementById('preferences-trigger')?.focus({ preventScroll: true }));
    };
    useEffect(() => {
        const element = panel.current;
        if (!sideOpen || !element)
            return;
        if (window.innerWidth <= 1060 && panelOpener.current)
            element.querySelector<HTMLButtonElement>('.panel-tabs button')?.focus({ preventScroll: true });
        const animation = animateUI(element, 'panel');
        return () => animation?.cancel();
    }, [sideOpen, side, motionMode]);
    const selectSearchArtist = (artist: MusicResource) => { setSearchArtist(artist); setCatalogMode(page === 'search' && catalogMode === 'album' ? 'album' : 'track'); setQuery(artist.name); setPage('search'); searchInput.current?.focus(); };
    const clearSearchArtist = () => {
        if (searchArtist && query.trim().length < 3)
            setQuery(searchArtist.name);
        setSearchArtist(null);
    };
    const navigate = (q: string) => { setSearchArtist(null); setCatalogMode('all'); setQuery(q); setPage('search'); searchInput.current?.focus(); };
    const moveQueue = (from: number, to: number) => moveWithMotion(panel.current, () => player.move(from, to));
    const openLink = async (e: React.FormEvent) => {
        e.preventDefault();
        const id = videoIdFromInput(link);
        if (!id) {
            setError(t("App.inserisci.un.link.youtube.valido.o.un.identificativo.video"));
            return;
        }
        setLinkBusy(true);
        setError(null);
        try {
            const track = await api.fromLink(id);
            player.play(track);
            setLink('');
            setSide('now');
        }
        catch (e) {
            setError(e instanceof Error ? e.message : t("App.impossibile.aprire.il.link"));
        }
        finally {
            setLinkBusy(false);
        }
    };
    const more = async () => {
        if (!search?.nextCursor)
            return;
        const sequence = requestSequence.current;
        setLoadMore(true);
        try {
            const next = await api.search(query, search.nextCursor);
            if (sequence === requestSequence.current)
                setSearch(s => s ? { ...next, items: [...s.items, ...next.items.filter(n => !s.items.some(i => i.id === n.id))] } : next);
        }
        catch (e) {
            if (sequence === requestSequence.current)
                setError((e as Error).message);
        }
        finally {
            if (sequence === requestSequence.current)
                setLoadMore(false);
        }
    };
    return <CatalogNavigationContext.Provider value={(kind, id, trackId) => { setAlbumTrackTarget(kind === "album" && trackId ? { albumId: id, trackId, request: ++albumJumpRequest.current } : null); setPage(`${kind}:${id}`); requestAnimationFrame(() => main.current?.focus({ preventScroll: true })); }}><div className={`app ${sideOpen ? '' : 'without-panel'} ${sideOpen ? 'show-panel' : ''} ${sideOpen && side === 'queue' ? 'show-queue' : ''} ${player.uiLayout.sidebarCollapsed ? 'sidebar-collapsed' : ''}`} style={{ '--user-sidebar-width': `${player.uiLayout.sidebarWidth}px`, '--user-panel-width': `${player.uiLayout.panelWidth}px` } as CSSProperties}>
    <a className="skip-link" href="#main-content">{t("App.vai.al.contenuto")}</a>
    <MiniController /><SleepTimerController /><StorySharingRoot />{!offlinePreview && <AudioController />}
    <aside className="sidebar" aria-label={t("App.navigazione.principale")}>
      <div className="sidebar-brand-row"><a className="brand" aria-label={t("minimal.brandHome")} href="#home" onClick={e => { e.preventDefault(); setPage('home'); }}><BrandMark /><span>RITVIO</span></a><Button className="sidebar-toggle" label={t(player.uiLayout.sidebarCollapsed ? 'layout.expandLibrary' : 'layout.collapseLibrary')} onClick={() => player.setUILayout({ sidebarCollapsed: !player.uiLayout.sidebarCollapsed })}>{player.uiLayout.sidebarCollapsed ? <ChevronRight size={18}/> : <ChevronLeft size={18}/>}</Button></div>
      <nav>{[{ id: 'home', label: t('home'), Icon: Home }, { id: 'search', label: t('search'), Icon: Search }, { id: 'library', label: t('library'), Icon: Library }].map(({ id, label, Icon }) => <button key={id} aria-label={label} title={label} className={`nav-link ${navPage === id ? 'chosen' : ''}`} aria-current={navPage === id ? 'page' : undefined} onClick={() => {
                setPage(id as typeof page);
                if (id === 'search')
                    searchInput.current?.focus();
            }}><Icon size={25}/><span>{label}</span></button>)}</nav>
      <div className="sidebar-divider"/><div className="sidebar-heading"><h2>{t('listen.sidebar.heading')}</h2><Button label={t('listen.createPlaylist')} onClick={() => { setLibraryTab('playlists'); setPage('library'); setCreateRequested(true); }}><Plus size={20}/></Button></div>
      <div className="sidebar-playlists">{library.data?.playlists.length ? library.data.playlists.map((playlist, index) => <button key={playlist.id} aria-label={playlist.name} title={playlist.name} onClick={() => { setLibraryTab('playlists'); setPage('library'); void library.open(playlist.id); }}><PlaylistCover playlist={playlist} slot={`sidebar-cover-${index}`}/><span><strong>{playlist.name}</strong><small>{playlist.count === 1 ? t('design.home.oneTrack') : t('design.home.trackCount', { count: playlist.count })}</small></span></button>) : <div className="sidebar-empty"><ListMusic size={25}/><p>{t('design.home.makePlaylistHint')}</p><button onClick={() => { setPage('library'); setCreateRequested(true); }}>{t('design.home.makePlaylist')}<ArrowRight size={15}/></button></div>}</div>
    </aside>
    <main ref={main} aria-label={t('a11y.main')} className={`main ${page === 'lyrics' ? 'has-lyrics-reader' : ''}`} id="main-content" tabIndex={-1} onKeyDown={e => {
            if (e.key === 'Escape' && page === 'immersive') {
                e.preventDefault();
                if (canBack)
                    back();
                else
                    setPage('home');
            }
            if (e.key === 'Escape' && page === 'preferences' && !e.defaultPrevented && !document.querySelector('[popover]:popover-open')) {
                e.preventDefault();
                closePreferences();
            }
        }}>
      <header className="topbar"><div className="history-controls"><Button label={t('listen.back')} disabled={!canBack} onClick={() => {
            if (page === 'library' && library.selected)
                useLibrary.setState({ selected: null });
            else
                back();
        }}><ChevronLeft size={23}/></Button><Button label={t('listen.forward')} disabled={!canForward} onClick={forward}><ChevronRight size={23}/></Button></div>
        <label className="searchbox"><Search size={17}/><input ref={searchInput} aria-label={t("App.cerca.musica")} placeholder={t("App.cerca.un.brano.o.un.artista")} value={query} onFocus={() => {
            if (query)
                setPage('search');
        }} onChange={e => { setQuery(e.target.value); setPage('search'); }}/><kbd>{t("App.ctrl.k")}</kbd>{query && <button aria-label={t("App.cancella.ricerca")} onClick={() => setQuery('')}><X size={14}/></button>}</label>
        <Button id="preferences-trigger" label={t("ui.impostazioni")} onClick={() => {
            setPage('preferences');
            if (window.innerWidth <= 1060)
                setSideOpen(false);
            requestAnimationFrame(() => main.current?.focus({ preventScroll: true }));
        }}><Settings size={24}/></Button><PrivateIndicator /><ProfileButton />
      </header>
      <div className="content"><MotionSurface kind="page" className="page-surface" motionKey={`${page}:${page === 'library' ? (library.selected?.id ?? 'overview') : ''}`}><DeferredContent key={page}>
        {error && <div className="notice" role="alert"><AlertCircle size={18}/><span>{noticeText(error)}</span>{query && <button onClick={() => setRetry(n => n + 1)}>{t("App.riprova")}</button>}<button aria-label={t("App.chiudi.avviso")} onClick={() => setError(null)}><X size={16}/></button></div>}
        {library.error && <div className="notice" role="alert"><AlertCircle size={18}/><span>{noticeText(library.error)}</span><button onClick={() => { useLibrary.setState({ error: null }); void library.load(); }}>{t("App.ricarica.libreria")}</button><button aria-label={t("App.chiudi.avviso.libreria")} onClick={() => useLibrary.setState({ error: null })}><X size={16}/></button></div>}
        {page === 'home' && <HomePage onSituation={id => setPage(`situation:${id}`)} offline={offlinePreview} onCollection={(id, play) => { setCollectionAutoplay(!!play); setPage(`collection:${id}`); }} onTaste={() => { useLibrary.setState({ selected: null }); setLibraryTab("taste"); setPage("library"); }} quickArtwork={quickArtwork} onHistory={() => { useLibrary.setState({ selected: null }); setLibraryTab("history"); setPage("library"); }} onSearch={q => {
                if (q)
                    navigate(q);
                else {
                    setPage('search');
                    searchInput.current?.focus();
                }
            }} onLibrary={showLibrary} onPlaylist={id => { setLibraryTab('playlists'); setPage('library'); void library.open(id); }} onNow={showNow}><section className="link-section"><span className="link-symbol"><Link2 size={20}/></span><div><h3>{t("App.hai.gia.un.brano.in.mente")}</h3><p>{t("App.incolla.un.link.youtube.e.ascoltalo.qui")}</p></div><form onSubmit={openLink}><input aria-label={t("App.link.youtube")} placeholder={t("App.https.youtube.com.watch.v")} value={link} onChange={e => setLink(e.target.value)} maxLength={2000}/><button className="icon-button link-submit" type="submit" disabled={linkBusy || !link.trim()} aria-label={t("App.apri.e.riproduci.link")}>{linkBusy ? <LoaderCircle className="spin" size={19}/> : <ArrowRight size={20}/>}</button></form></section></HomePage>}
        {page === 'search' && <>
          <div className="page-heading"><div><h1>{searchArtist ? t('artistSearch.heading', { name: searchArtist.name }) : query.trim().length >= 3 ? t("App.risultati.per", { p0: query.trim() }) : t('discovery.title')}</h1></div></div>
          <div className="catalog-search-tabs" role="group" aria-label={t('search')}>{(['all', 'track', 'artist', 'album'] as const).map(mode => <button type="button" key={mode} aria-pressed={catalogMode === mode} onClick={() => {
                    if (mode === 'artist')
                        setSearchArtist(null);
                    setCatalogMode(mode);
                }}>{t(mode === 'all' ? 'ui3.all' : mode === 'track' ? 'App.brani' : mode === 'artist' ? 'catalog.artists' : 'catalog.albums')}</button>)}</div>
          {searchArtist && <ArtistSearchScope artist={searchArtist} onClear={clearSearchArtist}/>}
          {query.trim().length < 3 && !searchArtist ? <SearchDiscovery onSearch={navigate}/> : (catalogMode === 'artist' || catalogMode === 'album') ? <CatalogSearchResults query={query} kind={catalogMode} artist={searchArtist ?? undefined}/> : <>
          {catalogMode === 'all' ? <SearchHighlights query={query} priorityArtist={search?.priorityArtist}/> : !busy && !searchArtist && search && <ArtistSearchMatch artist={search.priorityArtist}/>}
          <div className="search-details"><span>{catalogMode === 'all' && search?.priorityArtist ? t('ui3.artistTracks', { name: search.priorityArtist.name }) : t("App.brani")}</span><small role="status" aria-atomic="true">{busy ? t("App.cerco.nel.catalogo") : search?.cache.degraded ? t("App.risultati.salvati.servizio.temporaneamente.limitato") : search?.cache.hit ? t("App.dalla.tua.cache.nessuna.ricerca.aggiuntiva") : search ? t("App.risultati", { p0: search.items.length }) : t("App.digita.almeno.3.caratteri")}</small></div>
          {busy ? <div className="skeleton-list" aria-label={t("App.ricerca.in.corso")} aria-busy="true">{Array.from({ length: 7 }, (_, i) => <div className="skeleton-row" key={i}><i /><span /><small /></div>)}</div> : search?.items.length ? <><div className="result-columns"><span>#</span><span>{t("App.brano.artista")}</span><span>{t("catalog.album")}</span><span>{t("App.durata")}</span></div>{(catalogMode === 'all' && search.priorityArtist ? [search.items.filter(track => track.artists?.some(a => a.id === search.priorityArtist!.id)), search.items.filter(track => !track.artists?.some(a => a.id === search.priorityArtist!.id))] : [search.items]).map((items, group) => items.length > 0 && <section key={group} className="search-track-group">{group > 0 && <h2>{t('ui3.otherMatches')}</h2>}<div className="tracks">{items.map((track, i) => <TrackRow key={track.id} track={track} index={i} onPlay={() => player.play(track, search.items)}/>)}</div></section>)}{search.nextCursor && <button className="secondary-button more" onClick={() => void more()} disabled={loadMore}>{loadMore ? t("App.caricamento") : t("App.mostra.altri.brani")}</button>}</> : <div className="large-empty"><div><Search size={34}/></div><h2>{search ? t("App.nessun.brano.trovato") : t("App.un.titolo.un.artista.un.idea")}</h2><p>{search ? t("App.prova.una.ricerca.diversa.il.catalogo.youtube.music.include.brani") : t("App.cerca.nella.barra.in.alto.oppure.apri.un.link.dalla.home")}</p><div className="search-starts" role="group" aria-label={t('design.search.ideas')}>{discoveryCategories.map(category => <button className="search-chip" key={category.name} onClick={() => navigate(category.query)}>{t(category.key)}<ArrowUpRight size={15}/></button>)}</div>{!status?.resolverInstalled && <button className="secondary-button" onClick={() => setPage('preferences')}>{t("App.configura.la.ricerca")}</button>}</div>}
          </>}
        </>}
        {page === 'lyrics' && <><button className="text-button catalog-route-back" onClick={() => {
                if (canBack)
                    back();
                else
                    setPage('home');
            }}><ChevronLeft size={18}/>{t('listen.back')}</button><LyricsPanel track={current} expanded/></>}
        {page === 'immersive' && <ImmersivePage back={() => {
                if (canBack)
                    back();
                else
                    setPage('home');
            }}/>}
        {page === 'preferences' && <PreferencesPage category={preferenceCategory} onCategory={setPreferenceCategory} status={status} onClose={closePreferences}/>}
        {page === 'library' && <LibraryPage createRequested={createRequested} onCreateHandled={() => setCreateRequested(false)}/>}
        {page.startsWith('situation:') && <SituationPage key={page} id={page.split(':')[1] as import('../../../packages/domain/situations').SituationKey} playlistId={page.split(':')[2]} back={back} openPlaylist={id => setPage(`situation:${page.split(':')[1]}:${id}`)}/>}
        {page.startsWith('collection:') && <HomeCollectionPage key={page} id={page.slice(11) as HomeCollectionId} back={back} autoplay={collectionAutoplay}/>}
        {(page.startsWith('album:') || page.startsWith('artist:')) && <><button className="text-button catalog-route-back" disabled={!canBack} onClick={back}><ChevronLeft size={18}/>{t('listen.back')}</button><CatalogPage onArtistSearch={selectSearchArtist} focusRequest={albumTrackTarget?.request} focusTrackId={albumTrackTarget?.albumId === page.slice(6) ? albumTrackTarget.trackId : undefined} key={page} kind={page.startsWith('album:') ? 'album' : 'artist'} id={page.slice(page.indexOf(':') + 1)}/></>}
        <footer className="content-footer"><span>RITVIO</span><small>{t("App.un.nuovo.modo.di.trovare.il.tuo.ritmo")}</small><span className="footer-dot">✦</span></footer></DeferredContent></MotionSurface>
      </div>
    </main>
    <div className="panel-slot" id="listening-panel" aria-hidden={!sideOpen} inert={!sideOpen} onKeyDown={e => {
            if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('[popover]:popover-open')) {
                e.preventDefault();
                closePanel();
            }
        }}><aside ref={panel} className="now-panel" aria-label={t("App.pannello.di.riproduzione")}><div className="panel-tabs"><button aria-pressed={side === 'now'} className={side === 'now' ? 'selected' : ''} onClick={() => setSide('now')}>{t('listen.now')}</button><button aria-pressed={side === 'queue'} className={side === 'queue' ? 'selected' : ''} onClick={() => setSide('queue')}>{t('queue')} <small>{player.queue.length}</small></button><Button label={t("ui.nascondi.pannello")} onClick={closePanel}><X size={16}/></Button></div>
      {side === 'now' ? <MotionSurface className="panel-body" motionKey={current?.queueId ?? 'empty'}><ListeningArtwork track={current}/>{current ? <><h2>{current.title}</h2><TrackCatalogLinks track={current} album/><div className="current-library-actions"><TrackLibraryActions track={current} prominent/></div></> : <><h2>{t("App.il.tuo.prossimo.brano.ti.aspetta")}</h2><p className="panel-description">{t("App.una.ricerca.un.link.una.nuova.scoperta.da.dove.cominciamo")}</p></>}
        <div className="up-next"><div className="section-heading"><h3>{t("App.a.seguire")}</h3><button onClick={() => setSide('queue')}>{t("App.vedi.coda")}</button></div><UpcomingTracks /></div>{current && <details className="listening-details"><summary>{t('ui3.trackDetails')}</summary><FollowTrack track={current}/><MetadataPanel key={current.id} kind="track" id={current.id}/></details>}<div className="panel-tip"><Headphones size={18}/><span>{t("App.la.musica.continua.anche.quando.minimizzi.la.finestra")}</span></div></MotionSurface> : <QueuePanel />}
    </aside></div>
    {!player.uiLayout.sidebarCollapsed && <LayoutResizeHandle kind="sidebar" value={player.uiLayout.sidebarWidth} onChange={sidebarWidth => player.setUILayout({ sidebarWidth })}/>}
    {sideOpen && <LayoutResizeHandle kind="panel" value={player.uiLayout.panelWidth} onChange={panelWidth => player.setUILayout({ panelWidth })}/>}
    <PlayerBar onImmersive={() => { setPage('immersive'); setSideOpen(false); requestAnimationFrame(() => main.current?.focus({ preventScroll: true })); }} nowOpen={sideOpen && side === 'now'} onShowNow={showNow} queueOpen={sideOpen && side === 'queue'} onShowQueue={() => openPanel('queue')} lyricsOpen={page === 'lyrics'} onToggleLyrics={toggleLyrics} onSearch={navigate}/>
  </div></CatalogNavigationContext.Provider>;
}
