import { noticeText } from './i18n';
import { useContext, useEffect, useRef, useState } from 'react';
import { Play, UserRound, Disc3, LoaderCircle, ArrowUpRight } from 'lucide-react';
import { api } from './api';
import { t } from './i18n';
import { usePlayer } from './store';
import { CatalogNavigationContext } from './catalog-navigation';
import { isExcluded } from '../../../packages/domain/listening';
import type { MusicResource } from '../../../packages/domain/index';
import type { CatalogResource } from '../../../packages/domain/catalog';
export function SearchHighlights({ query, priorityArtist }: {
    query: string;
    priorityArtist?: MusicResource;
}) {
    const [artists, setArtists] = useState<CatalogResource[]>([]), [albums, setAlbums] = useState<CatalogResource[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [playing, setPlaying] = useState('');
    const open = useContext(CatalogNavigationContext), playRequest = useRef<AbortController | null>(null);
    useEffect(() => () => playRequest.current?.abort(), []);
    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setArtists([]);
        setAlbums([]);
        setError('');
        const timer = setTimeout(() => {
            void Promise.allSettled([api.catalog.search(query, 'artist', controller.signal), api.catalog.search(query, 'album', controller.signal)]).then(results => {
                if (controller.signal.aborted)
                    return;
                if (results[0].status === 'fulfilled')
                    setArtists(results[0].value.data.items);
                if (results[1].status === 'fulfilled')
                    setAlbums(results[1].value.data.items);
                if (results.some(r => r.status === 'rejected'))
                    setError(t('ui3.highlightPartial'));
                setLoading(false);
            });
        }, 650);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [query]);
    const artist = artists.find(a => a.id === priorityArtist?.id) ?? artists[0];
    const relevant = priorityArtist ? albums.filter(a => a.artists.some(r => r.id === priorityArtist.id)) : albums;
    // An artist priority never turns albums by somebody else into this artist's releases.
    const featuredAlbums = (priorityArtist ? relevant : albums).slice(0, 2);
    const play = async (resource: CatalogResource) => {
        playRequest.current?.abort();
        const controller = new AbortController();
        playRequest.current = controller;
        setPlaying(resource.id);
        setError('');
        try {
            const { data } = await api.catalog.detail(resource.kind, resource.id, controller.signal);
            if (controller.signal.aborted)
                return;
            const tracks = data.kind === 'artist' ? data.tracks : data.entries.flatMap(e => e.track ? [e.track] : []), state = usePlayer.getState(), first = tracks.find(track => !isExcluded(track, state.exclusions));
            if (!first) {
                open(resource.kind, resource.id);
                return;
            }
            if (data.kind === 'album') {
                state.setShuffle(false);
                if (state.repeat === 'track')
                    usePlayer.setState({ repeat: 'off' });
            }
            state.play(first, tracks);
        }
        catch (e) {
            if (!controller.signal.aborted)
                setError((e as Error).message);
        }
        finally {
            if (!controller.signal.aborted)
                setPlaying('');
        }
    };
    return <section className="search-highlights" aria-label={t('ui3.highlights')} aria-busy={loading}>
    <h2>{t('ui3.highlights')}</h2>{error && <p className="discovery-hint" role="status">{noticeText(error)}</p>}
    {loading ? <div className="highlight-skeleton" aria-label={t('catalog.loading')} role="status"><span /><span /><span /></div> : <div className="highlight-grid">
      {[...(artist ? [artist] : []), ...featuredAlbums].map(resource => <article key={resource.id} className={`highlight-card highlight-${resource.kind}`}>
        <button className="highlight-art" aria-label={t(resource.kind === 'artist' ? 'catalog.openArtist' : 'catalog.openAlbum', { name: resource.name })} onClick={() => open(resource.kind, resource.id)}>{resource.artwork ? <img src={resource.artwork} alt=""/> : resource.kind === 'artist' ? <UserRound size={40}/> : <Disc3 size={40}/>}</button>
        <div className="highlight-copy"><span>{t(resource.kind === 'artist' ? 'library-ui.artista' : 'catalog.album')}</span><button className="highlight-title" onClick={() => open(resource.kind, resource.id)}>{resource.name}</button><p>{resource.kind === 'artist' ? t('ui3.artistCatalog') : [resource.artists.map(a => a.name).join(', '), resource.year].filter(Boolean).join(' · ')}</p><div className="highlight-actions"><button className={resource.kind === 'artist' ? 'primary-button' : 'icon-button'} disabled={playing === resource.id} aria-label={t('App.riproduci', { p0: resource.name })} onClick={() => void play(resource)}>{playing === resource.id ? <LoaderCircle className="spin" size={18}/> : <Play size={18} fill="currentColor"/>}{resource.kind === 'artist' && t('App.riproduci', { p0: '' })}</button><button className="icon-button" aria-label={t(resource.kind === 'artist' ? 'catalog.openArtist' : 'catalog.openAlbum', { name: resource.name })} onClick={() => open(resource.kind, resource.id)}><ArrowUpRight size={17}/></button></div></div>
      </article>)}
    </div>}
  </section>;
}
