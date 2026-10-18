import {SourcesInfo} from '../../../packages/i18n/sources-info';
import { noticeText } from './messages';
import { msg } from './messages';
import {version} from '../package.json';
import { LanguagePreferenceControl } from '../../../packages/i18n/language-control';
import { useEffect, useRef, useState } from 'react';
import { Home, Search, Library, Settings, Pause, Play, SkipForward, LoaderCircle, Heart, Plus, ListMusic, Trash2, ChevronLeft, Share2, Pencil, Radio, Download, Upload, ImagePlus, ImageOff } from 'lucide-react';
import { nativePlayback, isAndroid } from './native';
import { Artwork, Modal, Notice, ScrollText, TrackRow, Empty } from './ui';
import { HomePage, SearchPage, LibraryPage, CatalogDetail, type DetailTarget } from './catalog-pages';
import { Player, AudioPanel, TimerPanel, LyricsPanel } from './player';
import { QueuePanel } from './queue';
import { RadioPanel } from './discovery';
import { ImportPlaylistPanel, ExportPlaylistPanel } from './playlist-transfer';
import { StoryComposer } from './story-sharing';
import {ArtworkContext} from './artwork-context';
import {BrowsePage, type BrowseCategory} from './browse';
import { emptyMobilePlayback, emptyMobileLibrary, type MobilePlayback, type NativeTrack, type MobileCommand, type MobileLibrary, type MobileResource, type MobileAudio, type MobileCollection } from '../../../packages/domain/mobile';
type Tab = 'home' | 'search' | 'library';
type TrackContext = {
    playlistId?: string;
    index: number;
};
export function App() {
    const [state, setState] = useState<MobilePlayback>(emptyMobilePlayback), [library, setLibrary] = useState<MobileLibrary>(emptyMobileLibrary), [libraryError, setLibraryError] = useState(false), [librarySearch, setLibrarySearch] = useState(false);
    const [tab, setTab] = useState<Tab>('home'), [route, setRoute] = useState(location.hash.slice(1)), [query, setQuery] = useState(''), [notice, setNotice] = useState('');
    const [detail, setDetail] = useState<DetailTarget | null>(null), [selectedTrack, setSelectedTrack] = useState<NativeTrack | null>(null), [context, setContext] = useState<TrackContext | undefined>();
    const [browse, setBrowse] = useState<BrowseCategory | null>(null);
    const [storyTrack, setStoryTrack] = useState<NativeTrack | null>(null);
    const [audio, setAudio] = useState<MobileAudio | null>(null), [name, setName] = useState(''), [saving, setSaving] = useState(false), [addAfterCreate, setAddAfterCreate] = useState(false);
    const [reduced, setReduced] = useState(() => localStorage.getItem('ritvio.mobile.reducedMotion') === 'true');
    const artworkOrigin = useRef<DOMRect | null>(null);
    const scrollPositions = useRef<Record<Tab, number>>({ home: 0, search: 0, library: 0 });
    const main = useRef<HTMLElement>(null);
    const track = state.items[state.index], expanded = route.startsWith('player'), sheet = expanded ? route.split('/')[1] : route;
    const playlist = route.startsWith('playlist/') ? library.playlists.find(item => item.id === route.split('/')[1]) : null;
    const detailVisible = route === 'browse' || route === 'detail' || route === 'likes' || route === 'recent' || route.startsWith('playlist/');
    const hasModal = expanded && !!track || ['actions', 'pick-playlist', 'create', 'rename', 'delete', 'settings', 'queue', 'clear', 'save-queue', 'radio', 'import', 'export', 'share'].includes(sheet ?? '');
    const liked = !!track && library.likes.some(item => item.videoId === track.videoId);
    const notify = (text: string) => setNotice(text);
    const reportError = (error: unknown) => notify(error instanceof Error ? error.message : msg("Operazione non disponibile. Riprova."));
    function navigate(value: string) { history.pushState({ ritvio: true, detail }, '', `#${value}`); setRoute(value); }
    function showPlayer(selector = '.compact-player .artwork') { artworkOrigin.current = document.querySelector(selector)?.getBoundingClientRect() ?? null; navigate('player'); }
    function close() {
        if (history.state?.ritvio)
            history.back();
        else {
            history.replaceState(null, '', location.pathname);
            setRoute('');
        }
    }
    function changeTab(value: Tab) { scrollPositions.current[tab] = window.scrollY; history.replaceState(null, '', location.pathname); setRoute(''); setTab(value); requestAnimationFrame(() => window.scrollTo(0, scrollPositions.current[value])); }
    function openResource(resource: MobileResource) { const target: DetailTarget = { kind: 'resource', resource }; setDetail(target); history.pushState({ ritvio: true, detail: target }, '', '#detail'); setRoute('detail'); window.scrollTo(0, 0); }
    function openCollection(collection: MobileCollection) { const target: DetailTarget = { kind: 'collection', collection }; setDetail(target); history.pushState({ ritvio: true, detail: target }, '', '#detail'); setRoute('detail'); window.scrollTo(0, 0); }
    function openBrowse(category: BrowseCategory) { setBrowse(category); navigate('browse'); window.scrollTo(0, 0); }
    function more(value: NativeTrack, origin?: TrackContext) { setSelectedTrack(value); setContext(origin); navigate('actions'); }
    function openSearch(value = '') {
        changeTab('search');
        if (value)
            setQuery(value);
        requestAnimationFrame(() => main.current?.querySelector<HTMLInputElement>('input[type=search]')?.focus());
    }
    async function changeArtwork(kind: 'track' | 'playlist', id: string, remove = false) {
        if (saving) return;
        setSaving(true);
        try {
            const result = remove ? {cancelled: false, library: await nativePlayback.removeArtwork({kind, id})} : await nativePlayback.chooseArtwork({kind, id});
            if (!result.cancelled && result.library) {
                setLibrary(result.library);
                notify(remove ? msg("Copertina ripristinata") : msg("Copertina aggiornata"));
            }
        } catch (error) { reportError(error); }
        finally { setSaving(false); }
    }
    async function refreshLibrary() {
        try {
            setLibrary(await nativePlayback.library());
            setLibraryError(false);
        }
        catch {
            setLibraryError(true);
        }
    }
    async function libraryAction(input: Record<string, unknown>, message?: string) {
        try {
            const value = await nativePlayback.libraryCommand(input);
            setLibrary(value);
            setLibraryError(false);
            if (message)
                notify(message);
            return value;
        }
        catch (error) {
            reportError(error);
            return null;
        }
    }
    async function command(input: MobileCommand) {
        try {
            setState(await nativePlayback.command(input));
            return true;
        }
        catch (error) {
            reportError(error);
            try {
                setState(await nativePlayback.snapshot());
            }
            catch { }
            return false;
        }
    }
    async function play(items: NativeTrack[], index: number) {
        try {
            const start = Math.floor(index / 100) * 100, queue = items.slice(start, start + 100);
            if (items.length > 100)
                notify(msg("In coda i brani {p0}\u2013{p1} della selezione.", { p0: start + 1, p1: start + queue.length }));
            setState(await nativePlayback.playTracks({ items: queue, index: index - start }));
            void refreshLibrary();
        }
        catch (error) {
            reportError(error);
        }
    }
    async function enqueue(value: NativeTrack, next = false) {
        try {
            setState(await nativePlayback.enqueue({ track: value, next }));
            notify(next ? msg("Il brano verr\u00E0 riprodotto dopo quello attuale") : msg("Brano aggiunto alla coda"));
        }
        catch (error) {
            reportError(error);
        }
    }
    async function discoveryAction(input: Parameters<typeof nativePlayback.discoveryCommand>[0]) {
        try {
            setState(await nativePlayback.discoveryCommand(input));
            return true;
        }
        catch (error) {
            reportError(error);
            return false;
        }
    }
    async function startRadio(value: NativeTrack) {
        try {
            setState(await nativePlayback.radio({ track: value }));
            return true;
        }
        catch (error) {
            reportError(error);
            return false;
        }
    }
    function share(value: NativeTrack) { setStoryTrack(structuredClone(value)); navigate(expanded ? 'player/share' : 'share'); }
    async function audioCommand(input: Record<string, unknown>) {
        try {
            setAudio(await nativePlayback.audioCommand(input));
        }
        catch (error) {
            reportError(error);
        }
    }
    async function createPlaylist(event: React.FormEvent) {
        event.preventDefault();
        if (saving)
            return;
        setSaving(true);
        try {
            const ids = new Set(library.playlists.map(p => p.id));
            const created = await libraryAction({ type: 'create', name: name.trim() });
            if (!created)
                return;
            const item = created.playlists.find(p => !ids.has(p.id));
            if (addAfterCreate && selectedTrack && item) {
                const added = await libraryAction({ type: 'add', id: item.id, track: selectedTrack });
                if (!added)
                    return;
            }
            if (addAfterCreate)
                history.go(-2);
            else
                close();
            notify(msg("Playlist creata"));
        }
        finally {
            setSaving(false);
        }
    }
    useEffect(() => {
        let active = true, remove: (() => void) | undefined;
        nativePlayback.snapshot().then(value => {
            if (active)
                setState(value);
        }).catch(() => { });
        nativePlayback.addListener('playback', value => {
            if (active)
                setState(value);
        }).then(listener => {
            if (active)
                remove = () => { void listener.remove(); };
            else
                void listener.remove();
        }).catch(() => { });
        void refreshLibrary();
        return () => { active = false; remove?.(); };
    }, []);
    useEffect(() => { void refreshLibrary(); const timer = setTimeout(() => void refreshLibrary(), 700); return () => clearTimeout(timer); }, [track?.videoId]);
    useEffect(() => {
        const update = () => {
            setRoute(location.hash.slice(1));
            if (history.state?.detail)
                setDetail(history.state.detail);
        };
        window.addEventListener('popstate', update);
        return () => window.removeEventListener('popstate', update);
    }, []);
    useEffect(() => {
        if (expanded && !track && !sheet) {
            history.replaceState(null, '', location.pathname);
            setRoute('');
        }
    }, [expanded, track?.videoId, sheet]);
    useEffect(() => {
        if (!notice)
            return;
        const timer = setTimeout(() => setNotice(''), 3500);
        return () => clearTimeout(timer);
    }, [notice]);
    useEffect(() => {
        if (sheet === 'audio' || sheet === 'timer') {
            setAudio(null);
            let active = true;
            const update = () => nativePlayback.audio().then(value => {
                if (active)
                    setAudio(value);
            }).catch(error => {
                if (active)
                    reportError(error);
            });
            void update();
            const timer = setInterval(() => void update(), 2000);
            return () => { active = false; clearInterval(timer); };
        }
    }, [sheet, track?.videoId]);
    useEffect(() => { document.documentElement.dataset.reduceMotion = String(reduced); localStorage.setItem('ritvio.mobile.reducedMotion', String(reduced)); }, [reduced]);
    const common = { current: track, play: (items: NativeTrack[], index: number) => { void play(items, index); }, more, openResource };
    const create = () => { setName(''); setAddAfterCreate(false); navigate('create'); };
    const playlistTracks = route === 'likes' ? library.likes : route === 'recent' ? library.recent : playlist?.items ?? [];
    const selectedLiked = !!selectedTrack && library.likes.some(item => item.videoId === selectedTrack.videoId);
    return <ArtworkContext.Provider value={library.artwork ?? {}}><div className="mobile-shell">
  <header inert={hasModal} className="app-header"><button className="brand" aria-label="RITVIO, Home" onClick={() => changeTab('home')}><svg width="27" height="30" viewBox="0 0 25 28" aria-hidden="true"><path d="M2 12v4m5-9v14m5-19v24m5-20v16m5-11v6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>{msg("RITVIO")}</button>{tab === 'library' && !detailVisible && <div className="header-tools"><button aria-label={msg("Cerca nella libreria")} aria-pressed={librarySearch} onClick={() => setLibrarySearch(!librarySearch)}><Search size={23}/></button><button aria-label={msg("Importa playlist")} onClick={() => navigate('import')}><Download size={24}/></button><button aria-label={msg("Crea playlist")} onClick={create}><Plus size={26}/></button></div>}{tab === 'home' && <div className="header-tools"><button aria-label={msg("Cerca musica")} onClick={() => openSearch()}><Search size={24}/></button><button aria-label={msg("Impostazioni")} onClick={() => navigate('settings')}><Settings size={24}/></button></div>}</header>
  <main inert={hasModal} ref={main} className="page-content">
   {!isAndroid && <p className="inline-error">{msg("Questa interfaccia usa il servizio nativo nell'APK Android.")}</p>}
   {libraryError && <div className="inline-error" role="alert"><p>{msg("La libreria non \u00E8 disponibile. I dati non sono stati sostituiti.")}</p><button className="text-action" onClick={() => void refreshLibrary()}>{msg("Riprova")}</button></div>}
   <div hidden={tab !== 'home' || detailVisible}><HomePage openBrowse={openBrowse} {...common} library={library} openCollection={openCollection} openLikes={() => navigate('likes')} openRecent={() => navigate('recent')} openSearch={() => openSearch()} openPlayer={() => showPlayer('.home-resume .artwork')} playback={state} toggleCurrent={() => void command({ type: state.playing ? 'pause' : 'play' })}/></div>
   <div hidden={tab !== 'search' || detailVisible}><SearchPage openBrowse={openBrowse} {...common} query={query} setQuery={setQuery} playing={state.playing && !state.loading}/></div>
   <div hidden={tab !== 'library' || detailVisible}><LibraryPage library={library} openResource={openResource} openPlaylist={item => { navigate(`playlist/${item.id}`); window.scrollTo(0, 0); }} openLikes={() => navigate('likes')} searching={librarySearch}/></div>
   {route === 'browse' && browse && <BrowsePage key={browse.id} category={browse} close={close} {...common}/>}
   {route === 'detail' && detail && <CatalogDetail key={JSON.stringify(detail)} {...common} target={detail} close={close} library={library} follow={(resource, followed) => void libraryAction({ type: 'follow', resource, followed }, followed ? msg("Aggiunto alla libreria") : msg("Rimosso dalla libreria"))}/>}
   {(route === 'likes' || route === 'recent' || route.startsWith('playlist/')) && <section className="playlist-page"><button className="back-control" onClick={close}><ChevronLeft size={23}/>{msg("Indietro")}</button><div className="detail-hero"><Artwork trackId={playlist?.cover ? undefined : playlistTracks[0]?.videoId} src={playlist?.cover ?? playlistTracks[0]?.thumbnail} large>{route === 'likes' ? <Heart size={66}/> : <ListMusic size={66}/>}</Artwork><h1>{route === 'likes' ? msg("Brani piaciuti") : route === 'recent' ? msg("Ascoltati di recente") : playlist?.name ?? msg("Playlist non disponibile")}</h1><p>{playlistTracks.length}{" " + msg("brani \u00B7 sul dispositivo")}</p>{playlist?.description && <p className="playlist-description">{playlist.description}</p>}<div className="detail-actions"><button className="primary" disabled={!playlistTracks.length} onClick={() => void play(playlistTracks, 0)}><Play fill="currentColor" size={20}/>{msg("Ascolta")}</button>{playlist && <><button aria-label={msg("Cambia copertina playlist")} disabled={saving} onClick={() => void changeArtwork("playlist", playlist.id)}><ImagePlus size={22}/></button>{playlist.cover && <button aria-label={msg("Ripristina copertina playlist")} disabled={saving} onClick={() => void changeArtwork("playlist", playlist.id, true)}><ImageOff size={22}/></button>}<button aria-label={msg("Rinomina playlist")} onClick={() => { setName(playlist.name); setContext({ playlistId: playlist.id, index: 0 }); navigate('rename'); }}><Pencil size={22}/></button><button aria-label={msg("Esporta playlist")} onClick={() => { setContext({ playlistId: playlist.id, index: 0 }); navigate('export'); }}><Upload size={22}/></button><button aria-label={msg("Elimina playlist")} onClick={() => { setContext({ playlistId: playlist.id, index: 0 }); navigate('delete'); }}><Trash2 size={22}/></button></>}</div></div>{playlistTracks.length ? <div className="track-list">{playlistTracks.map((item, index) => <TrackRow key={`${item.videoId}:${index}`} track={item} active={track?.videoId === item.videoId} onPlay={() => void play(playlistTracks, index)} onMore={() => more(item, playlist ? { playlistId: playlist.id, index } : undefined)}/>)}</div> : <Empty title={route === 'likes' ? msg("Tieni vicini i tuoi brani") : msg("Fai spazio alla tua musica")} action={<button className="tonal" onClick={() => openSearch()}>{msg("Cerca un brano")}</button>}>{msg("Aggiungi brani dal player o dal menu accanto a un risultato.")}</Empty>}</section>}
  </main>
  <div inert={hasModal} className="bottom-dock">{state.error && !expanded && <div className="audio-error" role="alert"><span>{noticeText(state.error)}</span><button onClick={() => void command({ type: 'retry' })}>{msg("Riprova")}</button></div>}{track && <div className="compact-player"><button className="current-track" aria-label={msg("Apri il player: {p0}", { p0: track.title })} onClick={() => showPlayer()}><Artwork trackId={track.videoId} src={track.thumbnail}/><span><strong><ScrollText>{track.title}</ScrollText></strong><small><ScrollText>{track.artist}</ScrollText></small><span className="mini-progress"><span style={{ transform: `scaleX(${state.duration > 0 ? Math.min(1, state.position / state.duration) : 0})` }}/></span></span></button><button className="compact-play" aria-busy={state.loading} aria-label={state.playing ? msg("Pausa") : msg("Riproduci")} onClick={() => void command({ type: state.playing ? 'pause' : 'play' })}>{state.loading ? <LoaderCircle className="spin" size={23}/> : state.playing ? <Pause fill="currentColor" size={23}/> : <Play fill="currentColor" size={23}/>}</button><button aria-label={msg("Brano successivo")} onClick={() => void command({ type: 'next' })}><SkipForward size={24} fill="currentColor"/></button></div>}
   <nav aria-label={msg("Navigazione principale")}>{([{ id: 'home', name: 'Home', Icon: Home }, { id: 'search', name: msg("Cerca"), Icon: Search }, { id: 'library', name: msg("Libreria"), Icon: Library }] as const).map(({ id, name, Icon }) => <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => changeTab(id)}><Icon size={25}/><span>{name}</span></button>)}</nav>
  </div>
  {expanded && track && <Player editArtwork={() => void changeArtwork("track", track.videoId)} artworkBusy={saving} artworkOrigin={artworkOrigin.current} inactive={!!sheet} state={state} liked={liked} onLike={() => void libraryAction({ type: 'like', track, liked: !liked }, liked ? msg("Brano rimosso dai piaciuti") : msg("Brano salvato"))} command={input => void command(input)} close={close} openQueue={() => navigate('player/queue')} openUtility={name => navigate(`player/${name}`)} openResource={openResource} searchArtist={() => openSearch(track.artist)} share={() => void share(track)}/>}
  {(sheet === 'queue' || route === 'queue') && <Modal label={msg("Coda")} onClose={close}><QueuePanel state={state} command={command} discoveryChange={discoveryAction} radio={() => {
                if (track) {
                    setSelectedTrack(track);
                    navigate(expanded ? 'player/radio' : 'radio');
                }
            }} save={() => { setName(msg("La mia coda")); navigate(expanded ? 'player/save-queue' : 'save-queue'); }} clear={() => navigate(expanded ? 'player/clear' : 'clear')}/></Modal>}
  {sheet === 'save-queue' && <Modal label={msg("Salva la coda")} onClose={close}><p className="intro">{msg("Crea una playlist con tutti i brani nell'ordine mostrato in coda, inclusi i duplicati. La riproduzione continua.")}</p><form className="playlist-form" onSubmit={event => {
                event.preventDefault();
                if (saving)
                    return;
                setSaving(true);
                void nativePlayback.saveQueue({ name: name.trim() }).then(value => { setLibrary(value); close(); notify(msg("Coda salvata nella libreria")); }).catch(reportError).finally(() => setSaving(false));
            }}><label>{msg("Nome della playlist")}<input autoFocus required maxLength={100} value={name} onChange={event => setName(event.target.value)}/></label><button className="primary" type="submit" disabled={!name.trim() || saving || !state.items.length}>{saving ? msg("Salvataggio\u2026") : msg("Salva playlist")}</button></form></Modal>}
  {sheet === 'clear' && <Modal label={msg("Svuotare la coda?")} onClose={close}><p>{msg("La riproduzione si fermer\u00E0. La tua libreria resta salvata.")}</p><button className="tonal" onClick={() => { void command({ type: 'clear' }); close(); }}>{msg("Svuota coda")}</button><button onClick={close}>{msg("Annulla")}</button></Modal>}
  {expanded && sheet === 'lyrics' && track && <Modal label={msg("Testi")} onClose={close}><LyricsPanel track={{ ...track, duration: track.duration > 0 ? track.duration : state.duration }} position={state.position} seek={value => void command({ type: 'seek', value })}/></Modal>}
  {expanded && sheet === 'audio' && <Modal label="Audio" onClose={close}><AudioPanel audio={audio} volume={state.volume} changeVolume={value => void command({ type: 'volume', value })} command={input => void audioCommand(input)}/></Modal>}
  {expanded && sheet === 'timer' && <Modal label={msg("Timer di spegnimento")} onClose={close}><TimerPanel audio={audio} command={input => void audioCommand(input)}/></Modal>}
  {route === 'actions' && selectedTrack && <Modal label={msg("Opzioni del brano")} onClose={close}><div className="sheet-track"><Artwork trackId={selectedTrack.videoId} src={selectedTrack.thumbnail}/><span><strong>{selectedTrack.title}</strong><small>{selectedTrack.artist}</small></span></div><div className="action-list"><button disabled={saving} onClick={() => void changeArtwork("track", selectedTrack.videoId)}><ImagePlus size={22}/>{msg("Cambia copertina brano")}</button>{library.artwork?.[selectedTrack.videoId] && <button disabled={saving} onClick={() => void changeArtwork("track", selectedTrack.videoId, true)}><ImageOff size={22}/>{msg("Ripristina copertina brano")}</button>}<button onClick={() => void libraryAction({ type: 'like', track: selectedTrack, liked: !selectedLiked }, selectedLiked ? msg("Rimosso dai piaciuti") : msg("Brano salvato"))}><Heart size={22} fill={selectedLiked ? 'currentColor' : 'none'}/>{selectedLiked ? msg("Rimuovi dai piaciuti") : msg("Salva nei piaciuti")}</button><button onClick={() => { void enqueue(selectedTrack); close(); }}><ListMusic size={22}/>{msg("Aggiungi alla coda")}</button><button onClick={() => { void enqueue(selectedTrack, true); close(); }}><SkipForward size={22}/>{msg("Riproduci dopo")}</button><button onClick={() => navigate('radio')}><Radio size={22}/>{msg("Radio del brano")}</button><button onClick={() => navigate('pick-playlist')}><Plus size={22}/>{msg("Aggiungi a una playlist")}</button>{selectedTrack.album?.id && <button onClick={() => openResource({ id: selectedTrack.album!.id, name: selectedTrack.album!.name, kind: 'album', artwork: selectedTrack.thumbnail })}>{msg("Apri album") + " "}<span>{selectedTrack.album.name}</span></button>}{selectedTrack.artists?.map(person => <button key={person.id} onClick={() => openResource({ ...person, kind: 'artist', artwork: null })}>{msg("Apri artista") + " "}<span>{person.name}</span></button>)}<button onClick={() => void share(selectedTrack)}><Share2 size={22}/>{msg("Condividi")}</button>{context?.playlistId && <button onClick={() => void libraryAction({ type: 'remove', id: context.playlistId, index: context.index }, msg("Brano rimosso dalla playlist")).then(value => {
                    if (value)
                        close();
                })}><Trash2 size={22}/>{msg("Rimuovi dalla playlist")}</button>}</div></Modal>}
  {sheet === 'share' && storyTrack && <Modal label={msg("Condividi brano")} onClose={close}><StoryComposer key={storyTrack.videoId} track={storyTrack}/></Modal>}
  {sheet === 'radio' && selectedTrack && <Modal label={msg("Radio del brano")} onClose={close}><RadioPanel track={selectedTrack} state={state.discovery} start={() => startRadio(selectedTrack)} openPlayer={() => navigate('player')}/></Modal>}
  {route === 'pick-playlist' && selectedTrack && <Modal label={msg("Aggiungi a una playlist")} onClose={close}><button className="tonal" onClick={() => { setName(''); setAddAfterCreate(true); navigate('create'); }}><Plus size={21}/>{msg("Nuova playlist")}</button><div className="action-list">{library.playlists.map(item => <button key={item.id} onClick={() => void libraryAction({ type: 'add', id: item.id, track: selectedTrack }, msg("Aggiunto alla playlist")).then(value => {
                    if (value)
                        close();
                })}><Artwork trackId={item.cover ? undefined : item.items[0]?.videoId} src={item.cover ?? item.items[0]?.thumbnail}/><span>{item.name}<small>{item.items.length}{" " + msg("brani")}</small></span></button>)}</div></Modal>}
  {(route === 'create' || route === 'rename') && <Modal label={route === 'create' ? msg("Nuova playlist") : msg("Rinomina playlist")} onClose={close}><form className="playlist-form" onSubmit={event => {
                if (route === 'create') {
                    void createPlaylist(event);
                }
                else {
                    event.preventDefault();
                    if (context?.playlistId)
                        void libraryAction({ type: 'rename', id: context.playlistId, name: name.trim() }, msg("Playlist rinominata")).then(value => {
                            if (value)
                                close();
                        });
                }
            }}><label>{msg("Nome della playlist")}<input autoFocus required maxLength={100} value={name} onChange={event => setName(event.target.value)}/></label><button className="primary" type="submit" disabled={!name.trim() || saving}>{saving ? msg("Salvataggio\u2026") : msg("Salva")}</button></form></Modal>}
  {route === 'delete' && <Modal label={msg("Eliminare la playlist?")} onClose={close}><p>{msg("I brani piaciuti e le altre playlist restano nella libreria.")}</p><button className="tonal" onClick={() => {
                if (context?.playlistId)
                    void libraryAction({ type: 'delete', id: context.playlistId }, msg("Playlist eliminata")).then(value => {
                        if (value)
                            history.go(-2);
                    });
            }}>{msg("Elimina playlist")}</button><button onClick={close}>{msg("Annulla")}</button></Modal>}
  {route === 'import' && <Modal label={msg("Importa playlist")} onClose={close}><ImportPlaylistPanel library={library} refresh={refreshLibrary} complete={value => { setLibrary(value.library); notify(msg("{p0} brani importati{p1}", { p0: value.added, p1: value.skippedDuplicates ? msg(" \u00B7 {p0} duplicati saltati", { p0: value.skippedDuplicates }) : '' })); }} close={close}/></Modal>}
  {route === 'export' && <Modal label={msg("Esporta playlist")} onClose={close}>{library.playlists.find(p => p.id === context?.playlistId) ? <ExportPlaylistPanel playlist={library.playlists.find(p => p.id === context?.playlistId)!}/> : <Empty title={msg("Playlist non disponibile")}>{msg("Chiudi il pannello e scegli una playlist dalla Libreria.")}</Empty>}</Modal>}
  {route === 'settings' && <Modal label={msg("Impostazioni")} onClose={close}><LanguagePreferenceControl /><div className="settings-row"><span>{msg("Riduci animazioni")}</span><button className="tonal" aria-pressed={reduced} onClick={() => setReduced(!reduced)}>{reduced ? msg("Attivo") : msg("Disattivato")}</button></div><p>{msg("Profilo locale: libreria e preferenze sono salvate su questo dispositivo.")}</p><SourcesInfo/><p className="source-date">RITVIO Android {version}</p></Modal>}
  <Notice text={noticeText(notice)}/>
 </div></ArtworkContext.Provider>;
}
