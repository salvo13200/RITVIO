import { noticeText } from './i18n';
import { displayLocale } from '../../../packages/i18n/display';
import { TastePage } from './taste-ui';
import { ListeningActivity } from './listening-activity';
import { ListeningOptions, ExcludedBadge } from './listening-preferences';
import { t } from './i18n';
import { LibraryNavigation, LibraryImports, LibraryPlaylistTile, LibraryResourceTile, useLibraryCollectionMotion } from './library-restyle';
import { ScrollingLine } from './player-track-info';
import { useEffect, useRef, useState, useId, useContext, useMemo, type ReactNode } from 'react';
import { ArtworkContext } from './artwork-context';
import { Heart, ListPlus, X, Plus, Music2, Play, ChevronUp, ChevronDown, GripVertical, Trash2, Pencil, UserRound, Lock, Globe, Disc3, MoreHorizontal, LoaderCircle, Check, ArrowLeft, Clock3 } from 'lucide-react';
import { useLibrary } from './library';
import { CatalogResourceLink, TrackCatalogLinks } from './catalog-navigation';
import { usePlayer } from './store';
import { formatTime, type Track, type PlaylistSummary, type PersonalPlaylist } from '../../../packages/domain/index';
import { ShareTrackButton, ExportPlaylistButton, ImportPlaylistButton } from './sharing-ui';
import { RemotePlaylistImport } from './playlist-import';
import { useLibraryBrowser } from './library-browser';
import { PlaylistTools, PlaylistSelectionBox, usePlaylistSelection } from './playlist-tools';
import { LibraryToolbar, LibraryNoResults, LibraryMore, useLibraryBrowsing } from './library-browser-ui';
import { browseLibrary, defaultLibraryFilter, trackLibraryText, libraryPlaybackWindow, type LibrarySort } from '../../../packages/domain/library-browser';
import { animateUI } from './ui-motion';
import { moveWithMotion } from './queue-motion';
import { Icon, Modal, ImageInput, PlaylistCover, TrackLibraryActions } from './library-controls';
function PlaylistEditor({ playlist, close }: {
    playlist: PersonalPlaylist;
    close: () => void;
}) {
    const [name, setName] = useState(playlist.name);
    const [description, setDescription] = useState(playlist.description);
    const [visibility, setVisibility] = useState(playlist.visibility);
    const [cover, setCover] = useState(playlist.cover);
    const { busy, error } = useLibrary();
    return <Modal title={t("library-ui.modifica.playlist")} close={close}>{error && <p className="form-error" role="alert">{noticeText(error)}</p>}<form className="library-form" onSubmit={async (e) => {
            e.preventDefault();
            if (await useLibrary.getState().update({ name: name.trim(), description, visibility, cover }))
                close();
        }}><label>{t("library-ui.nome")}<input autoFocus required maxLength={100} aria-label={t("library-ui.nome.playlist")} value={name} onChange={e => setName(e.target.value)}/></label><label>{t("library-ui.descrizione")}<textarea aria-label={t("library-ui.descrizione.playlist")} maxLength={1000} rows={3} value={description} onChange={e => setDescription(e.target.value)}/></label><ImageInput label={t("ui.scegli.copertina")} value={cover} change={setCover}/><label>{t("library-ui.visibilita")}<select aria-label={t("library-ui.visibilita.playlist")} value={visibility} onChange={e => setVisibility(e.target.value as typeof visibility)}><option value="private">{t("library-ui.privata")}</option><option value="public">{t("library-ui.pubblica.quando.attiverai.la.condivisione")}</option></select></label><p className="local-note">{t("library-ui.per.ora.la.playlist.rimane.su.questo.pc.l.impostazione.pubblica.s")}</p><button className="primary-button" type="submit" disabled={busy || !name.trim()}>{t("library-ui.salva.modifiche")}</button></form></Modal>;
}
function LibraryTrack({ track, onPlay, children }: {
    track: Track;
    onPlay: () => void;
    children?: ReactNode;
}) { return <div className="library-track"><button className="library-track-play" aria-label={t("App.riproduci", { p0: track.title })} onClick={onPlay}>{track.thumbnail ? <img src={track.thumbnail} alt="" loading="lazy"/> : <Music2 />}<Play size={15}/></button><div className="library-track-title"><button onClick={onPlay} aria-label={t("App.riproduci", { p0: track.title })}><ScrollingLine as="span" className="library-collection-name" text={track.title} resetKey={track.id}><strong title={track.title}>{track.title}</strong></ScrollingLine></button><TrackCatalogLinks track={track}/><ExcludedBadge track={track}/></div><span className="track-album">{track.album ? <CatalogResourceLink resource={track.album} kind="album"/> : "—"}</span><span className="duration">{formatTime(track.duration)}</span><TrackLibraryActions track={track}>{children}</TrackLibraryActions></div>; }
export function LibraryPage({ createRequested = false, onCreateHandled }: {
    createRequested?: boolean;
    onCreateHandled?: () => void;
}) {
    const importSlot = useRef<HTMLDivElement>(null);
    const library = useLibrary();
    const { data, selected, busy, loading } = library;
    const tab = useLibraryBrowser(s => s.tab), setTab = useLibraryBrowser(s => s.setTab);
    const [detail, setDetail] = useState(!!selected);
    const [create, setCreate] = useState(false);
    const [name, setName] = useState('');
    const [edit, setEdit] = useState(false);
    const [confirm, setConfirm] = useState<'delete' | 'history' | null>(null);
    const drag = useRef<number | null>(null);
    const manageRequest = useRef<string | null>(null), playRequest = useRef(0);
    useEffect(() => () => { playRequest.current++; }, []);
    const selection = usePlaylistSelection(selected);
    const [manageOpen, setManageOpen] = useState(false);
    const currentId = usePlayer(s => s.queue[s.index]?.id);
    useEffect(() => { setManageOpen(!!selected && manageRequest.current === selected.id); manageRequest.current = null; }, [selected?.id]);
    const viewKey = detail && selected ? `playlist:${selected.id}` : tab;
    const { ref, view, change, more } = useLibraryBrowsing(viewKey, data?.profile.id);
    const layout = !['playlists', 'likes', 'albums', 'artists'].includes(tab) ? 'list' : view.layout ?? (tab === 'likes' ? 'list' : 'grid');
    const albumArtists = useMemo(() => {
        const names = new Map<string, string>();
        for (const track of [...(data?.likes ?? []), ...(data?.history ?? []).map(entry => entry.track)])
            if (track.album && !names.has(track.album.id))
                names.set(track.album.id, track.artist);
        return names;
    }, [data]);
    useLibraryCollectionMotion(ref, `${data?.profile.id}:${data?.playlists.length}:${data?.likes.length}:${data?.follows.length}:${viewKey}:${view.query}:${view.sort}:${view.duration}:${layout}:${view.shown}`);
    const filtered = useMemo(() => ({
        playlists: !detail && tab === 'playlists' ? browseLibrary((data?.playlists ?? []).map(item => ({ item, text: item.name + ' ' + item.description, name: item.name, recent: Date.parse(item.updatedAt), duration: item.durationSeconds ?? undefined, count: item.count })), view) : [],
        likes: !detail && tab === 'likes' ? browseLibrary((data?.likes ?? []).map(item => ({ item, text: trackLibraryText(item), name: item.title, artist: item.artist, duration: item.duration })), view) : [],
        follows: !detail && (tab === 'artists' || tab === 'albums') ? browseLibrary((data?.follows ?? []).filter(f => f.kind === (tab === 'artists' ? 'artist' : 'album')).map(item => ({ item, text: item.name, name: item.name })), view) : [],
        history: !detail && tab === 'history' ? browseLibrary((data?.history ?? []).map(item => ({ item, text: trackLibraryText(item.track), name: item.track.title, artist: item.track.artist, duration: item.track.duration, recent: Date.parse(item.playedAt) })), view) : [],
        items: detail && selected ? browseLibrary(selected.items.map(item => ({ item, text: trackLibraryText(item.track), name: item.track.title, artist: item.track.artist, duration: item.track.duration })), view) : [],
    }), [data, selected, detail, tab, view.query, view.sort, view.duration]);
    const canReorder = !view.query.trim() && view.duration === 'all' && view.sort === 'recent';
    const movePlaylist = (from: number, to: number) => moveWithMotion(ref.current, () => library.move(from, to), 'playlist');
    const total = detail ? selected?.items.length ?? 0 : tab === 'playlists' ? data?.playlists.length ?? 0 : tab === 'likes' ? data?.likes.length ?? 0 : tab === 'history' ? data?.history.length ?? 0 : data?.follows.filter(f => f.kind === (tab === 'artists' ? 'artist' : 'album')).length ?? 0;
    const count = detail ? filtered.items.length : tab === 'playlists' ? filtered.playlists.length : tab === 'likes' ? filtered.likes.length : tab === 'history' ? filtered.history.length : filtered.follows.length;
    const shown = Math.min(view.shown, count);
    const reset = () => change(defaultLibraryFilter);
    const sorts: LibrarySort[] = !detail && (tab === 'artists' || tab === 'albums') ? ['recent', 'name'] : tab === 'playlists' && !detail ? ['recent', 'name', 'count', 'duration-short', 'duration-long'] : ['recent', 'name', 'artist', 'duration-short', 'duration-long'];
    const toolbar = <LibraryToolbar view={view} change={change} placeholder={detail || tab === 'activity' || tab === 'taste' ? t('browse.search.tracks') : t(`browse.search.${tab}`)} sorts={sorts} duration={detail || tab === 'likes' || tab === 'history'} recentLabel={detail ? t('browse.sort.original') : tab === 'playlists' ? t('browse.sort.updated') : tab === 'history' ? t('browse.sort.listened') : t('browse.sort.added')} count={count} total={total} shown={shown} layout={!detail && ['playlists', 'likes', 'albums', 'artists'].includes(tab) ? layout : undefined}/>;
    const moreButton = <LibraryMore shown={shown} count={count} more={more}/>;
    const tabId = useId();
    useEffect(() => {
        if (createRequested) {
            setName('');
            setCreate(true);
            onCreateHandled?.();
        }
    }, [createRequested]);
    useEffect(() => {
        if (!selected)
            setDetail(false);
    }, [selected]);
    useEffect(() => {
        if (selected)
            setDetail(true);
    }, [selected?.id]);
    useEffect(() => {
        if (selected) {
            const artwork = ref.current?.querySelector<HTMLElement>('.playlist-hero>.playlist-cover');
            if (artwork)
                animateUI(artwork, 'artwork');
            ref.current?.closest('main')?.focus({ preventScroll: true });
        }
    }, [selected?.id]);
    if (loading || !data)
        return <div className="large-empty" role="status"><LoaderCircle className="spin"/><p>{t("library-ui.carico.la.tua.libreria")}</p><button className="secondary-button" onClick={() => void library.load()}>{t("App.riprova")}</button></div>;
    const backToLibrary = () => { playRequest.current++; useLibrary.getState().cancelOpen(); setDetail(false); };
    const open = async (id: string, manage = false) => { playRequest.current++; manageRequest.current = manage ? id : null; setDetail(true); await library.open(id); };
    const playCollection = async (id: string) => {
        const revision = usePlayer.getState().autoplayRevision, work = open(id), request = playRequest.current;
        await work;
        const playlist = useLibrary.getState().selected;
        if (playlist?.id === id && playlist.items[0] && request === playRequest.current && revision === usePlayer.getState().autoplayRevision)
            usePlayer.getState().play(playlist.items[0].track, playlist.items.map(item => item.track));
    };
    const playAll = (tracks: Track[]) => {
        if (tracks[0])
            usePlayer.getState().play(tracks[0], tracks);
    };
    return <div className={`library-page library-restyle ${!detail ? 'library-overview' : ''} ${detail && selection.enabled ? 'playlist-editing' : ''}`} ref={ref}>
    {!detail && <div className="page-heading"><div><h1>{t('library')}</h1><p className="library-profile-note">{t('lib2.localProfile')} · {data.profile.displayName}</p></div><div className="library-header-actions"><button className="primary-button" onClick={() => { setName(''); setCreate(true); }}><Plus size={19}/>{t('library-ui.nuova.playlist')}</button><LibraryImports slot={importSlot} onImported={playlist => { useLibrary.setState({ selected: playlist }); setDetail(true); }}/></div></div>}
    <div ref={importSlot}/>
    {detail ? <>{!selected ? <div className="large-empty"><LoaderCircle className="spin"/><p>{t("library-ui.apro.la.playlist")}</p><button className="secondary-button" onClick={backToLibrary}>{t("library-ui.torna.alla.libreria")}</button></div> : <>
      <button type="button" className="text-button catalog-route-back library-back" onClick={backToLibrary}><ArrowLeft size={18}/>{t("library-ui.torna.alla.libreria")}</button>
      <section className="playlist-hero"><PlaylistCover playlist={selected}/><div><span className="eyebrow">{selected.visibility === 'private' ? <Lock size={12}/> : <Globe size={12}/>} {t("ui3.playlistKind")} · {selected.count === 1 ? t('design.home.oneTrack') : t('design.home.trackCount', { count: selected.count })} · {selected.durationSeconds === null ? t('ui3.unknownDuration') : formatTime(selected.durationSeconds ?? 0)}</span><h1>{selected.name}</h1>{selected.description && <p>{selected.description}</p>}<div className="playlist-controls"><button className="primary-button" disabled={!selected.items.length} onClick={() => playAll(selected.items.map(i => i.track))}><Play size={16} fill="currentColor"/>{t("library-ui.riproduci.playlist")}</button><button className="icon-button playlist-manage-toggle" aria-label={t('ui3.managePlaylist')} aria-expanded={manageOpen} onClick={() => setManageOpen(!manageOpen)}><MoreHorizontal size={23}/></button></div></div></section>
      {selected.items.length > 0 && toolbar}
      {(manageOpen || selection.enabled || selected.undo) && <section className="playlist-management" aria-label={t('ui3.managePlaylist')}><div className="playlist-controls"><button className="secondary-button" disabled={busy} onClick={() => setEdit(true)}><Pencil size={15}/>{t("library-ui.modifica")}</button><ExportPlaylistButton playlist={selected}/><Icon label={t("ui.elimina.playlist")} disabled={busy} onClick={() => setConfirm('delete')}><Trash2 size={17}/></Icon><RemotePlaylistImport slot={importSlot} onImported={playlist => { useLibrary.setState({ selected: playlist }); setDetail(true); }}/><ImportPlaylistButton /><button className="secondary-button" onClick={() => { setName(''); setCreate(true); }}><Plus size={17}/>{t("library-ui.nuova.playlist")}</button></div><PlaylistTools withReorderMotion={commit => moveWithMotion(ref.current, commit, 'playlist')} playlist={selected} matches={filtered.items} canReorder={canReorder} selection={selection}/></section>}
      {library.error && <p className="form-error" role="alert">{noticeText(library.error)}</p>}
      {selected.items.length ? <><p className="library-reorder-note" hidden={!manageOpen}>{canReorder ? t("library-ui.trascina.per.riordinare.oppure.usa.le.frecce.puoi.aggiungere.bran") : t('browse.reorderNote')}</p>{!count ? <LibraryNoResults reset={reset}/> : <><div className="collection-columns"><span>#</span><span>{t("App.brano.artista")}</span><span>{t("catalog.album")}</span><span><Clock3 size={17}/></span></div><div className="playlist-tracks">{filtered.items.slice(0, shown).map(item => {
                            const index = selected.items.findIndex(i => i.id === item.id);
                            return <div key={item.id} data-playlist-item-id={item.id} className={`playlist-item ${selection.ids.includes(item.id) ? 'is-selected' : ''} ${currentId === item.track.id ? 'is-playing' : ''}`} draggable={!busy && canReorder && !selection.enabled} onDragStart={() => drag.current = index} onDragEnd={() => drag.current = null} onDragOver={e => {
                                    if (canReorder)
                                        e.preventDefault();
                                }} onDrop={e => {
                                    e.preventDefault();
                                    if (drag.current !== null && !busy && canReorder)
                                        void movePlaylist(drag.current, index);
                                    drag.current = null;
                                }}><>{selection.enabled ? <PlaylistSelectionBox item={item} checked={selection.ids.includes(item.id)} disabled={busy} toggle={() => selection.toggle(item.id)}/> : <span className="collection-number">{index + 1}</span>}</><LibraryTrack track={item.track} onPlay={() => usePlayer.getState().play(item.track, libraryPlaybackWindow(filtered.items.map(i => i.track), item.track))}><Icon label={t("App.sposta.su", { p0: item.track.title })} visibleLabel disabled={busy || !canReorder || index === 0} onClick={() => void movePlaylist(index, index - 1)}><ChevronUp size={15}/></Icon><Icon label={t("App.sposta.giu", { p0: item.track.title })} visibleLabel disabled={busy || !canReorder || index === selected.items.length - 1} onClick={() => void movePlaylist(index, index + 1)}><ChevronDown size={15}/></Icon><Icon label={t("library-ui.rimuovi.dalla.playlist", { p0: item.track.title })} visibleLabel disabled={busy} onClick={() => void library.removeItem(item.id)}><X size={16}/></Icon></LibraryTrack></div>;
                        })}</div>{moreButton}</>}</> : <div className="large-empty"><Music2 size={36}/><h2>{t("library-ui.la.prima.nota.aspetta.te")}</h2><p>{t("library-ui.cerca.un.brano.e.usa.salva.in.playlist.per.aggiungerlo.qui")}</p></div>}
    </>}</> : <>
      <LibraryNavigation tab={tab} id={tabId}/>
      {library.error && <p className="form-error" role="alert">{noticeText(library.error)}</p>}
      <section className={`library-view library-layout-${layout}`} key={tab} role="tabpanel" id={`${tabId}-panel`} aria-labelledby={`${tabId}-${tab}`} tabIndex={0}>
      {tab === 'likes' && data.likes.length > 0 && <div className="library-section-head library-favourites-heading"><div><h2>{t('lib2.likedSongs')}</h2><p>{t('design.home.trackCount', { count: data.likes.length })}</p></div><button className="primary-button" disabled={!count} onClick={() => playAll(filtered.likes)}><Play size={18} fill="currentColor"/>{t('library-ui.riproduci.preferiti')}</button></div>}
      {!['activity', 'taste'].includes(tab) && toolbar}
      {total > 0 && count === 0 && !['activity', 'taste'].includes(tab) ? <LibraryNoResults reset={reset}/> : <>
      {tab === 'playlists' && (data.playlists.length ? <>{layout === 'list' && <div className="library-playlist-columns" aria-hidden="true"><span>{t('lib2.collection')}</span><span>{t('lib2.tracks')}</span><span>{t('App.durata')}</span><span /></div>}<div className="playlist-grid library-gallery">{filtered.playlists.slice(0, shown).map(playlist => <LibraryPlaylistTile key={playlist.id} playlist={playlist} onOpen={() => void open(playlist.id)} onPlay={() => void playCollection(playlist.id)} onManage={() => void open(playlist.id, true)}/>)}</div>{moreButton}</> : <div className="large-empty"><Music2 size={38}/><h2>{t("library-ui.una.playlist.tutta.tua")}</h2><p>{t("library-ui.raccogli.i.brani.che.vuoi.ritrovare")}</p><button className="primary-button" onClick={() => { setName(''); setCreate(true); }}>{t("library-ui.crea.la.prima.playlist")}</button></div>)}
      {tab === 'likes' && (data.likes.length ? <>{layout === 'list' && <div className="library-liked-columns" aria-hidden="true"><span>#</span><span>{t('App.brano.artista')}</span><span>{t('catalog.album')}</span><span>{t('App.durata')}</span><span /></div>}<div className="library-favourite-list">{filtered.likes.slice(0, shown).map((track, index) => <div key={track.id} data-library-id={track.id} className={`library-song-row ${currentId === track.id ? 'is-playing' : ''}`}><span className="library-song-number" aria-hidden="true">{index + 1}</span><LibraryTrack track={track} onPlay={() => usePlayer.getState().play(track, libraryPlaybackWindow(filtered.likes, track))}/></div>)}</div>{moreButton}</> : <div className="large-empty"><Heart size={38}/><h2>{t('library-ui.tieni.vicino.quello.che.ami')}</h2><p>{t('library-ui.premi.il.cuore.accanto.a.un.brano.per.salvarlo.qui')}</p></div>)}
      {(tab === 'artists' || tab === 'albums') && <>{total ? <><div className={`follow-grid library-gallery ${tab === 'artists' ? 'library-artists-gallery' : ''}`}>{filtered.follows.slice(0, shown).map(resource => <LibraryResourceTile key={resource.kind + ':' + resource.id} resource={resource} subtitle={resource.kind === 'album' ? albumArtists.get(resource.id) : undefined}/>)}</div>{moreButton}</> : <div className="large-empty"><Disc3 size={38}/><h2>{tab === 'artists' ? t("library-ui.ritrova.i.tuoi.artisti") : t("library-ui.il.tuo.scaffale.di.album")}</h2><p>{t("library-ui.riproduci.un.risultato.della.ricerca.e.usa.segui.nel.pannello.in.")}</p></div>}</>}
      {tab === 'activity' && <ListeningActivity />}
      {tab === 'taste' && <TastePage />}
      {tab === 'history' && (data.history.length ? <><div className="library-section-head"><h2>{t("library-ui.ultimi.100.ascolti")}</h2><button className="secondary-button" disabled={busy} onClick={() => setConfirm('history')}><Trash2 size={15}/>{t("library-ui.cancella.cronologia")}</button></div>{filtered.history.slice(0, shown).map(entry => <div className="history-entry" key={entry.id}><time dateTime={entry.playedAt}>{new Date(entry.playedAt).toLocaleString(displayLocale(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</time><LibraryTrack track={entry.track} onPlay={() => usePlayer.getState().play(entry.track)}/></div>)}{moreButton}</> : <div className="large-empty"><Clock3 size={38}/><h2>{t("library-ui.la.tua.storia.comincia.con.play")}</h2><p>{t("library-ui.gli.ascolti.effettivi.vengono.salvati.qui")}</p></div>)}
      </>}
      </section>
    </>}
    {create && <Modal title={t("library-ui.nuova.playlist")} close={() => setCreate(false)}>{library.error && <p role="alert" className="form-error">{noticeText(library.error)}</p>}<form className="library-form" onSubmit={async (e) => {
                e.preventDefault();
                if (await library.create(name.trim())) {
                    setCreate(false);
                    setDetail(true);
                }
            }}><label>{t("library-ui.nome.playlist")}<input autoFocus required aria-label={t("library-ui.nome.playlist")} maxLength={100} value={name} onChange={e => setName(e.target.value)}/></label><button className="primary-button" type="submit" disabled={busy || !name.trim()}>{t("library-ui.crea.playlist")}</button></form></Modal>}
    {edit && selected && <PlaylistEditor key={selected.id} playlist={selected} close={() => setEdit(false)}/>}
    {confirm && <Modal title={confirm === 'delete' ? t("library-ui.eliminare.la.playlist") : t("library-ui.cancellare.la.cronologia")} close={() => setConfirm(null)}><p className="dialog-copy">{confirm === 'delete' ? t("library-ui.e.i.suoi.riferimenti.ai.brani.saranno.rimossi", { p0: selected?.name }) : t("library-ui.gli.ascolti.salvati.nella.cronologia.saranno.rimossi")}</p><div className="confirm-actions"><button className="secondary-button" onClick={() => setConfirm(null)}>{t("library-ui.annulla")}</button><button className="danger-button" disabled={busy} onClick={async () => {
                if (confirm === 'delete') {
                    if (await library.removePlaylist()) {
                        setDetail(false);
                        setConfirm(null);
                    }
                }
                else if (await library.clearHistory()) {
                    usePlayer.setState({ recent: [] });
                    setConfirm(null);
                }
            }}>{confirm === 'delete' ? t("library-ui.elimina.definitivamente") : t("library-ui.cancella.cronologia")}</button></div></Modal>}
  </div>;
}
