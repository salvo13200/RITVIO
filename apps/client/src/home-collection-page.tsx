import { noticeText } from './i18n';
import { useContext, useEffect, useRef, useState } from 'react';
import { Play, RefreshCw, LoaderCircle, Shuffle, ListPlus, Copy, Check, ChevronLeft, ArrowRight, Disc3 } from 'lucide-react';
import { api } from './api';
import { t } from './i18n';
import { usePlayer } from './store';
import { useLibrary } from './library';
import { CatalogNavigationContext } from './catalog-navigation';
import { Tracks } from './catalog-pages';
import { isExcluded } from '../../../packages/domain/listening';
import { HomeArtwork, collectionTitle, homeDate, useHomeRetry } from './home-collections';
import type { HomeCollectionId, HomeDetail, HomeResult } from '../../../packages/domain/home';
export function HomeCollectionPage({ id, back, autoplay = false }: {
    id: HomeCollectionId;
    back: () => void;
    autoplay?: boolean;
}) {
    const [result, setResult] = useState<HomeResult<HomeDetail> | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [retry, setRetry] = useState(0), [notice, setNotice] = useState(''), [saving, setSaving] = useState(false), [started, setStarted] = useState(false);
    const activation = useRef(usePlayer.getState().activation);
    const openAlbum = useContext(CatalogNavigationContext), exclusions = usePlayer(s => s.exclusions), libraryBusy = useLibrary(s => s.busy), canRetry = useHomeRetry(result?.retryAt);
    useEffect(() => {
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined, attempt = 0;
        setLoading(true);
        setError('');
        const load = async () => {
            try {
                const value = await (retry && attempt === 0 ? api.home.refreshCollection(id, controller.signal) : api.home.collection(id, controller.signal));
                if (controller.signal.aborted)
                    return;
                setResult(value);
                setLoading(false);
                if (value.refreshing && ++attempt < 20)
                    timer = setTimeout(() => void load(), 2000);
            }
            catch (e) {
                if (!controller.signal.aborted) {
                    setError(e instanceof Error ? e.message : String(e));
                    setLoading(false);
                }
            }
        };
        void load();
        return () => { controller.abort(); clearTimeout(timer); };
    }, [id, retry]);
    const tracks = result?.data?.tracks.filter(track => !isExcluded(track, exclusions)) ?? [];
    const play = (shuffle = false) => {
        if (!tracks.length)
            return;
        const state = usePlayer.getState();
        state.setShuffle(shuffle);
        if (state.repeat === 'track')
            usePlayer.setState({ repeat: 'off' });
        state.play(tracks[0], tracks);
    };
    useEffect(() => {
        if (autoplay && !started && result?.data) {
            setStarted(true);
            if (tracks.length && usePlayer.getState().activation === activation.current)
                play();
        }
    }, [autoplay, started, result, exclusions]);
    const save = async () => {
        if (saving || !tracks.length)
            return;
        setSaving(true);
        setNotice('');
        try {
            const playlist = await useLibrary.getState().saveQueue(collectionTitle(id), tracks);
            setNotice(playlist ? t('home2.copySaved') : useLibrary.getState().error || t('home2.copyError'));
        }
        finally {
            setSaving(false);
        }
    };
    return <section className="home2-detail" aria-busy={loading}>
    <button className="text-button home2-back" onClick={back}><ChevronLeft size={18}/>{t('home2.back')}</button>
    <header className="home2-detail-header"><HomeArtwork collection={result?.data?.collection}/><div><h1>{collectionTitle(id)}</h1><p>{t(`home2.description.${id}`)}</p><p className="home2-detail-source">{t(id === 'releases' ? 'home2.catalogSource' : 'home2.chartSource')}{result?.data?.collection.country && <> · {t(result.data.collection.country === 'ZZ' ? 'home2.world' : 'home2.italyCountry')}</>}</p>{result?.updatedAt && <p className="home2-card-date">{t('home2.updated', { date: homeDate(result.updatedAt) })} · {t('home2.trackCount', { count: tracks.length })}</p>}<div className="home2-detail-actions"><button className="primary-button" disabled={!tracks.length} onClick={() => play()}><Play size={18} fill="currentColor"/>{t('home2.listen')}</button><button className="secondary-button" disabled={!tracks.length} onClick={() => play(true)}><Shuffle size={18}/>{t('home2.shuffle')}</button><button className="secondary-button" disabled={!tracks.length} onClick={() => setNotice(usePlayer.getState().enqueueMany(tracks) ? t('home2.queued') : t('home2.queueFull'))}><ListPlus size={18}/>{t('home2.enqueue')}</button><button className="secondary-button" disabled={!tracks.length || saving || libraryBusy} onClick={() => void save()}>{saving ? <LoaderCircle size={18} className="spin"/> : <Copy size={18}/>} {t('home2.saveCopy')}</button></div></div></header>
    {notice && <p role="status" className="home2-notice"><Check size={17}/>{noticeText(notice)}</p>}
    {(error || result?.error || result?.stale) && <p role="status" className="home2-notice">{noticeText(error || result?.error) || t('home2.previousEdition')}</p>}
    {result?.refreshing && <p className="home2-status" role="status"><LoaderCircle className="spin" size={16}/>{t('home2.updating')}</p>}
    {id === 'releases' && <p className="home2-release-note">{t('home2.releaseNote')}</p>}
    {loading && !result?.data ? <div className="home2-loading" role="status"><LoaderCircle className="spin"/>{t('home2.loadingCollection')}</div> : result?.data ? <><div className="home2-track-heading"><h2>{t(id === 'releases' ? 'home2.releaseSelection' : 'home2.tracks')}</h2><button className="text-button" disabled={!canRetry || result.refreshing} title={!canRetry ? t('home2.cooldown') : undefined} onClick={() => setRetry(n => n + 1)}><RefreshCw size={16}/>{t('home2.refresh')}</button></div><Tracks tracks={tracks} ordered/>{!tracks.length && <p>{t('home2.noEligible')}</p>}{result.data.albums.length > 0 && <section className="home2-albums"><h2>{t('home2.releaseAlbums')}</h2><div className="home2-album-grid">{result.data.albums.map(album => <button key={album.id} onClick={() => openAlbum('album', album.id)} aria-label={t('catalog.openAlbum', { name: album.name })}><div className="home2-artwork">{album.artwork ? <img src={album.artwork} alt="" loading="lazy"/> : <Disc3 size={32}/>}</div><strong>{album.name}</strong><span>{album.artists.map(a => a.name).join(', ')}</span></button>)}</div></section>}</> : <div className="home2-empty"><p>{noticeText(error || result?.error) || t('home2.unavailable')}</p><button className="secondary-button" disabled={!canRetry} onClick={() => setRetry(n => n + 1)}>{t('App.riprova')}<ArrowRight size={16}/></button></div>}
    <p className="home2-copy-note">{t('home2.copyNote')}</p>
  </section>;
}
