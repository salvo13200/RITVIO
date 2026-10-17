import { noticeText } from './i18n';
import { useEffect, useState } from 'react';
import { ArrowLeft, Play, Shuffle, ListPlus, Copy, Disc3, RefreshCw, LoaderCircle } from 'lucide-react';
import { type SituationKey, type SituationPlaylist, type SituationTracks, type SituationResult } from '../../../packages/domain/situations';
import { api } from './api';
import { t } from './i18n';
import { useHomeRetry, homeDate } from './home-collections';
import { usePlayer } from './store';
import { useLibrary } from './library';
import { isExcluded } from '../../../packages/domain/listening';
import { Tracks } from './catalog-pages';
export function SituationPage({ id, playlistId, back, openPlaylist }: {
    id: SituationKey;
    playlistId?: string;
    back: () => void;
    openPlaylist: (playlist: string) => void;
}) {
    const [result, setResult] = useState<SituationResult<SituationPlaylist[] | SituationTracks> | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [attempt, setAttempt] = useState(0), [notice, setNotice] = useState(''), [saving, setSaving] = useState(false);
    const exclusions = usePlayer(s => s.exclusions), canRetry = useHomeRetry(result?.retryAt);
    useEffect(() => {
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined, polls = 0;
        setLoading(true);
        setError('');
        setResult(null);
        setNotice('');
        const load = async () => {
            try {
                const value = await (playlistId ? api.situations.tracks(id, playlistId, controller.signal) : api.situations.playlists(id, controller.signal));
                if (controller.signal.aborted)
                    return;
                setResult(value);
                setLoading(false);
                if (value.refreshing && ++polls < 15)
                    timer = setTimeout(() => void load(), 2000);
            }
            catch (e) {
                if (!controller.signal.aborted) {
                    setError((e as Error).message);
                    setLoading(false);
                }
            }
        };
        void load();
        return () => { controller.abort(); clearTimeout(timer); };
    }, [id, playlistId, attempt]);
    const detail = result?.data && !Array.isArray(result.data) ? result.data : null, lists = Array.isArray(result?.data) ? result.data : [], tracks = detail?.tracks.filter(track => !isExcluded(track, exclusions)) ?? [];
    const play = (shuffle = false) => {
        if (!tracks.length)
            return;
        const s = usePlayer.getState();
        s.setShuffle(shuffle);
        if (s.repeat === 'track')
            usePlayer.setState({ repeat: 'off' });
        s.play(tracks[0], tracks);
    };
    const save = async () => {
        if (!detail || saving)
            return;
        setSaving(true);
        try {
            const copy = await useLibrary.getState().saveQueue(detail.playlist.title.slice(0, 100), tracks);
            setNotice(copy ? t('home2.copySaved') : useLibrary.getState().error || t('home2.copyError'));
        }
        finally {
            setSaving(false);
        }
    };
    return <section className="situations-page"><button className="text-button" onClick={back}><ArrowLeft size={18}/>{t('listen.back')}</button><header className="situation-heading">{detail && <div className="situation-cover">{detail.playlist.artwork ? <img src={detail.playlist.artwork} alt=""/> : <Disc3 size={48}/>}</div>}<div><h1>{detail?.playlist.title ?? t(`situations.${id}`)}</h1><p>{t(`situations.hint.${id}`)} · {t('situations.source')}</p>{result?.updatedAt && <small>{t('home2.updated', { date: homeDate(result.updatedAt) })}</small>}{detail && <div className="situation-actions"><button className="primary-button" disabled={!tracks.length} onClick={() => play()}><Play size={18}/>{t('home2.listen')}</button><button className="secondary-button" disabled={!tracks.length} onClick={() => play(true)}><Shuffle size={18}/>{t('home2.shuffle')}</button><button className="secondary-button" disabled={!tracks.length} onClick={() => setNotice(usePlayer.getState().enqueueMany(tracks) ? t('home2.queued') : t('home2.queueFull'))}><ListPlus size={18}/>{t('home2.enqueue')}</button><button className="secondary-button" disabled={!tracks.length || saving} onClick={() => void save()}><Copy size={18}/>{t('home2.saveCopy')}</button></div>}</div></header>
    {(error || result?.error || result?.stale) && <p className="home2-notice" role="status">{noticeText(error || result?.error) || t('home2.previousEdition')}</p>}{notice && <p className="home2-notice" role="status">{noticeText(notice)}</p>}
    {loading ? <div className="situation-loading" role="status"><LoaderCircle className="spin" size={22}/>{t('situations.loading')}</div> : detail ? <><p className="situation-note">{t('situations.selection', { count: tracks.length })}</p><Tracks tracks={tracks} ordered/>{!tracks.length && <p>{t('home2.noEligible')}</p>}</> : lists.length ? <div className="situation-grid">{lists.map(playlist => <button key={playlist.id} onClick={() => openPlaylist(playlist.id)}><div className="situation-cover">{playlist.artwork ? <img src={playlist.artwork} alt="" loading="lazy"/> : <Disc3 size={40}/>}<Play size={24} className="situation-play"/></div><strong title={playlist.title}>{playlist.title}</strong>{playlist.author&&!/^(youtube(?: music)?|yt music)$/i.test(playlist.author.trim())&&<span>{playlist.author}</span>}</button>)}</div> : <div className="situation-empty"><p>{t('situations.empty')}</p><button className="secondary-button" disabled={!canRetry} title={!canRetry ? t('home2.cooldown') : undefined} onClick={() => setAttempt(n => n + 1)}><RefreshCw size={17}/>{t('App.riprova')}</button></div>}
  </section>;
}
