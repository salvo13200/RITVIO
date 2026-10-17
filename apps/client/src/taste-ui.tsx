import { noticeText } from './i18n';
import { useEffect, useState, useRef } from 'react';
import { Play, RefreshCw, Compass, ArrowRight, ThumbsUp, ThumbsDown } from 'lucide-react';
import { api } from './api';
import { t } from './i18n';
import { usePlayer } from './store';
import { useLibrary } from './library';
import { flushActivity, useActivity } from './activity-controller';
import { TrackCatalogLinks } from './catalog-navigation';
import { TrackLibraryActions } from './library-controls';
import { Cover } from './ui-controls';
import { isExcluded } from '../../../packages/domain/listening';
import type { TasteSnapshot, TasteMix, TasteSettings, MixKind, MixItem } from '../../../packages/domain/taste';
export function TasteHome({ open }: {
    open: () => void;
}) {
    const [mixes, setMixes] = useState<TasteMix[]>([]), [error, setError] = useState('');
    const exclusions = usePlayer(s => s.exclusions), revision = useLibraryRevision();
    useEffect(() => {
        const controller = new AbortController();
        setError('');
        void api.taste.get(controller.signal).then(async (snapshot) => {
            const genre = snapshot.profile.genres[0]?.name;
            const requests: Promise<TasteMix>[] = [api.taste.mix({ kind: 'familiar', exclusions }, controller.signal), api.taste.mix({ kind: 'discovery', exclusions }, controller.signal)];
            if (genre)
                requests.push(api.taste.mix({ kind: 'genre', genre, exclusions }, controller.signal));
            const results = await Promise.allSettled(requests);
            if (controller.signal.aborted)
                return;
            setMixes(results.flatMap(r => r.status === 'fulfilled' ? [r.value] : []));
        }).catch(e => {
            if (!controller.signal.aborted)
                setError(e.message);
        });
        return () => controller.abort();
    }, [revision, exclusions]);
    return <section className="home-mixes"><div className="section-heading"><div><h2>{t('ui3.mixTitle')}</h2><p>{t('ui3.mixSubtitle')}</p></div><button className="text-button" onClick={open}>{t('design.home.viewAll')}<ArrowRight size={16}/></button></div>{error && <p className="discovery-hint" role="status">{noticeText(error)}</p>}<div className="home-mix-grid">{(['familiar', 'discovery', 'genre'] as const).map(kind => {
            const mix = mixes.find(m => m.kind === kind), items = mix?.items.filter(i => !isExcluded(i.track, exclusions)) ?? [], first = items[0]?.track;
            return <article className="home-mix" key={kind}><Cover track={first}/><div><h3>{t(mixLabels[kind])}</h3><p>{first ? t('taste.mixCount', { count: items.length, discoveries: items.filter(i => i.fresh).length }) : t('ui3.homeMixEmpty')}</p><button className="mix-play icon-button" aria-label={t('ui3.playMix', { name: t(mixLabels[kind]) })} onClick={() => {
                    if (first) {
                        const state = usePlayer.getState();
                        state.setShuffle(false);
                        state.play(first, items.map(i => i.track));
                    }
                    else
                        open();
                }}><Play size={17} fill="currentColor"/></button></div></article>;
        })}</div></section>;
}
function useLibraryRevision() { return useLibrary(s => s.data); }
const mixLabels = { familiar: 'taste.familiar', discovery: 'taste.discovery', genre: 'taste.genreMix' } as const;
const reasonKeys = { liked: 'taste.whyLiked', saved: 'taste.whySaved', listened: 'taste.whyListened', artist: 'taste.whyArtist', genre: 'taste.whyGenre', feedback: 'taste.whyFeedback', discovery: 'taste.whyDiscovery' } as const;
export function TastePage() {
    const [data, setData] = useState<TasteSnapshot | null>(null), [mix, setMix] = useState<TasteMix | null>(null), [kind, setKind] = useState<MixKind>('familiar'), [genre, setGenre] = useState('');
    const [revision, setRevision] = useState(0), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [confirm, setConfirm] = useState(false);
    const alive = useRef(true);
    const exclusions = usePlayer(s => s.exclusions), privateMode = useActivity(s => s.data?.settings.privateMode);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError('');
        setMix(null);
        void (async () => {
            try {
                await flushActivity();
                if (controller.signal.aborted)
                    return;
                const snapshot = await api.taste.get(controller.signal);
                if (controller.signal.aborted)
                    return;
                setData(snapshot);
                const chosen = genre || snapshot.profile.genres[0]?.name || '';
                if (kind === 'genre' && !chosen)
                    return;
                const result = await api.taste.mix({ kind, ...(kind === 'genre' ? { genre: chosen } : {}), exclusions }, controller.signal);
                if (!controller.signal.aborted)
                    setMix(result);
            }
            catch (e) {
                if (!controller.signal.aborted)
                    setError((e as Error).message);
            }
            finally {
                if (!controller.signal.aborted)
                    setLoading(false);
            }
        })();
        return () => controller.abort();
    }, [revision, kind, genre, exclusions, privateMode]);
    const action = async (work: () => Promise<unknown>, message?: string) => {
        setBusy(true);
        setError('');
        setNotice('');
        try {
            await work();
            if (alive.current) {
                if (message)
                    setNotice(message);
                setRevision(n => n + 1);
            }
        }
        catch (e) {
            if (alive.current)
                setError((e as Error).message);
        }
        finally {
            if (alive.current)
                setBusy(false);
        }
    };
    const settings = (patch: Partial<Omit<TasteSettings, 'resetAt'>>) => {
        if (!data)
            return;
        const { resetAt, ...current } = data.settings;
        void action(() => api.taste.settings({ ...current, ...patch }));
    };
    const items = mix?.items.filter(item => !isExcluded(item.track, exclusions)) ?? [];
    const play = (first = items[0]) => {
        if (!first)
            return;
        const state = usePlayer.getState();
        state.setShuffle(false);
        if (state.repeat === 'track')
            usePlayer.setState({ repeat: 'off' });
        state.play(first.track, items.map(item => item.track));
    };
    const disabled = busy || loading;
    const feedback = (item: MixItem, value: -1 | 1) => void action(() => api.taste.feedback(item.track.id, item.feedback === value ? 0 : value), t(value === -1 ? 'taste.lessNotice' : 'taste.moreNotice'));
    return <div className="taste-page" aria-busy={loading || busy}>
    <div className="library-section-head"><div><h2>{t('taste.title')}</h2><p>{t('taste.intro')}</p></div><button className="secondary-button" disabled={disabled} onClick={() => setRevision(n => n + 1)}><RefreshCw size={16}/>{t('taste.refresh')}</button></div>
    {error && <div className="form-error" role="alert">{noticeText(error)}<button className="text-button" disabled={disabled} onClick={() => setRevision(n => n + 1)}>{t('App.riprova')}</button></div>}
    {notice && <p className="taste-notice" role="status">{noticeText(notice)}</p>}
    {!data && loading && <div className="taste-skeleton" role="status" aria-label={t('taste.loading')}><span /><span /><span /></div>}
    {data && <>
      <div className="taste-controls"><label>{t('taste.period')}<select disabled={disabled} value={data.settings.days} onChange={e => settings({ days: Number(e.target.value) as TasteSettings['days'] })}>{[30, 90, 180].map(days => <option key={days} value={days}>{t('activity.days', { days })}</option>)}</select></label><label>{t('taste.genreLevel')}<select disabled={disabled} value={data.settings.genreLevel} onChange={e => { setGenre(''); settings({ genreLevel: e.target.value as TasteSettings['genreLevel'] }); }}><option value="artist">{t('taste.artistGenres')}</option><option value="track">{t('taste.trackGenres')}</option></select></label></div>
      <p className="taste-summary">{t('taste.summary', { sessions: data.profile.sessions, minutes: Math.floor(data.profile.listenedMs / 60000), unknown: data.profile.unclassifiedPercent })}</p>
      {!data.profile.personalized && <p className="taste-note">{t('taste.coldStart')}</p>}
      {data.privateMode && <p className="taste-note">{t('taste.private')}</p>}
      <div className="taste-profile"><section><h3>{t('taste.artists')}</h3>{data.profile.artists.length ? <ol>{data.profile.artists.slice(0, 6).map(a => <li key={a.id}><strong>{a.name}</strong><meter min={0} max={data.profile.artists[0].score || 1} value={Math.max(0, a.score)} aria-label={t('taste.artistWeight', { name: a.name })}/></li>)}</ol> : <p>{t('taste.noArtists')}</p>}</section><section><h3>{t(data.settings.genreLevel === 'artist' ? 'taste.artistGenres' : 'taste.trackGenres')}</h3>{data.profile.genres.length ? <div className="taste-genres">{data.profile.genres.map(g => <button className="secondary-button" disabled={disabled} key={g.name} onClick={() => { setGenre(g.name); setKind('genre'); }}>{g.name}</button>)}</div> : <p>{t('taste.noGenres')}</p>}</section></div>
      <details className="taste-method"><summary>{t('taste.method')}</summary><p>{t('taste.methodHint')}</p><p>{t('taste.genreHint')}</p><p>{t('taste.privateHint')}</p></details>
      <section className="taste-mixes"><div className="library-section-head"><div><h3>{t('taste.mixTitle')}</h3><p>{t('taste.mixHint')}</p></div><button className="secondary-button" disabled={disabled || data.privateMode} onClick={() => void action(async () => {
                const result = await api.taste.discover();
                if (alive.current)
                    setNotice(t('taste.discovered', { added: result.added, failed: result.failed }));
            })}>{t('taste.find')}</button></div><p className="taste-note">{t('taste.remoteHint', { count: data.candidateCount })}</p>
        <div className="taste-mix-controls"><div className="taste-kinds" role="group" aria-label={t('taste.chooseMix')}>{(['familiar', 'discovery', 'genre'] as const).map(k => <button className="secondary-button" disabled={disabled} key={k} aria-pressed={kind === k} onClick={() => { setKind(k); setNotice(''); }}>{t(mixLabels[k])}</button>)}</div>
          {kind === 'genre' && <label>{t('taste.chooseGenre')}<select disabled={disabled || !data.profile.genres.length} value={genre || data.profile.genres[0]?.name || ''} onChange={e => setGenre(e.target.value)}>{!data.profile.genres.length && <option value="">{t('taste.noGenreChoice')}</option>}{data.profile.genres.map(g => <option key={g.name}>{g.name}</option>)}</select></label>}
          {kind === 'discovery' && <label>{t('taste.discoveryRatio')}<select disabled={disabled} value={data.settings.discoveryPercent} onChange={e => settings({ discoveryPercent: Number(e.target.value) as TasteSettings['discoveryPercent'] })}>{[25, 50, 75].map(value => <option key={value} value={value}>{value}%</option>)}</select></label>}
        </div>
        <div className="taste-options"><label><input type="checkbox" disabled={disabled} checked={data.settings.variety} onChange={e => settings({ variety: e.target.checked })}/>{t('taste.variety')}</label><label><input type="checkbox" disabled={disabled} checked={data.settings.allowRecent} onChange={e => settings({ allowRecent: e.target.checked })}/>{t('taste.recent')}</label></div>
        {loading ? <div className="taste-skeleton" role="status" aria-label={t('taste.loading')}><span /><span /><span /></div> : items.length ? <>
          <div className="taste-play"><button className="primary-button" disabled={disabled} onClick={() => play()}><Play size={16}/>{t('taste.play')}</button><button className="secondary-button" disabled={disabled} onClick={() => void action(async () => {
                    const result = await api.taste.mix({ kind, ...(kind === 'genre' ? { genre: genre || data.profile.genres[0]?.name } : {}), exclusions, refresh: true });
                    if (alive.current)
                        setMix(result);
                })}><RefreshCw size={16}/>{t('taste.regenerate')}</button><span>{t('taste.mixCount', { count: items.length, discoveries: items.filter(i => i.fresh).length })} · {mix?.day} UTC</span></div>
          <ol className="taste-tracks">{items.map(item => <li key={item.track.id}><div className="taste-track-main"><button className="taste-cover" disabled={busy} aria-label={t('App.riproduci', { p0: item.track.title })} onClick={() => play(item)}><Cover track={item.track}/><Play size={15}/></button><div><button className="taste-track-title" onClick={() => play(item)}>{item.track.title}</button><TrackCatalogLinks track={item.track}/><p>{t(reasonKeys[item.reason], { detail: item.detail ?? '' })}</p></div></div><div className="taste-track-actions"><button className="icon-button" disabled={disabled} aria-pressed={item.feedback === 1} aria-label={t('taste.more', { title: item.track.title })} title={t('taste.more', { title: item.track.title })} onClick={() => feedback(item, 1)}><ThumbsUp size={17}/></button><button className="icon-button" disabled={disabled} aria-pressed={item.feedback === -1} aria-label={t('taste.less', { title: item.track.title })} title={t('taste.less', { title: item.track.title })} onClick={() => feedback(item, -1)}><ThumbsDown size={17}/></button><TrackLibraryActions track={item.track}/></div></li>)}</ol>
        </> : <div className="taste-empty"><h3>{t('taste.emptyMix')}</h3><p>{kind === 'genre' ? t('taste.emptyGenre') : t('taste.emptyHint')}</p></div>}
      </section>
      <details className="taste-feedback-list"><summary>{t('taste.manageFeedback')}</summary><FeedbackList data={data} action={action} disabled={disabled}/></details>
      <div className="taste-reset"><button className="text-button" disabled={disabled} onClick={() => setConfirm(!confirm)}>{t('taste.reset')}</button>{confirm && <div className="activity-confirm"><p>{t('taste.resetHint')}</p><div><button className="secondary-button" disabled={disabled} onClick={() => setConfirm(false)}>{t('library-ui.annulla')}</button><button className="danger-button" disabled={disabled} onClick={() => void action(async () => {
                    await api.taste.reset();
                    if (alive.current) {
                        setConfirm(false);
                        setGenre('');
                        setKind('familiar');
                    }
                }, t('taste.resetDone'))}>{t('taste.resetConfirm')}</button></div></div>}</div>
    </>}
  </div>;
}
function FeedbackList({ data, action, disabled }: {
    data: TasteSnapshot;
    action: (work: () => Promise<unknown>, message?: string) => Promise<void>;
    disabled: boolean;
}) { return data.feedback.length ? <ul className="taste-feedback-items">{data.feedback.map(item => <li key={item.track.id}><span>{item.track.title} · {item.track.artist}<small>{t(item.value === 1 ? 'taste.preferred' : 'taste.avoided')}</small></span><button className="text-button" disabled={disabled} onClick={() => void action(() => api.taste.feedback(item.track.id, 0))}>{t('taste.undoFeedback')}</button></li>)}</ul> : <p className="taste-note">{t('taste.noFeedback')}</p>; }
