import {lazy,Suspense,useState,type CSSProperties} from 'react';
import {ArrowLeft,Mic2,ListMusic,Disc3,Minimize2} from 'lucide-react';
import {usePlayer} from './store';
import {useShallow} from 'zustand/react/shallow';
import {useArtworkTone} from './listening-artwork';
import {AnimatedCover} from './animated-cover';
import {TrackCatalogLinks} from './catalog-navigation';
import {QueuePanel} from './queue-panel';
import {t} from './i18n';
const Lyrics=lazy(()=>import('./lyrics').then(module=>({default:module.LyricsPanel})));
export function ImmersivePage({back}:{back:()=>void}){
  const {track,playing}=usePlayer(useShallow(s=>({track:s.queue[s.index],playing:s.playing}))),tone=useArtworkTone(track);
  const [view,setView]=useState<'lyrics'|'queue'>('lyrics');
  return <section className="immersive" aria-label={t('quality.immersive')} style={{'--listening-tone':tone??'var(--accent)'} as CSSProperties} data-playing={playing}>
    <div className="immersive-atmosphere" aria-hidden="true"/>
    <header className="immersive-header"><button className="text-button" onClick={back}><ArrowLeft size={18}/>{t('quality.back')}</button><span>{t('quality.listeningSpace')}</span><button className="icon-button" aria-label={t('quality.closeImmersive')} onClick={back}><Minimize2 size={20}/></button></header>
    {track?<div className="immersive-layout"><div className="immersive-record"><AnimatedCover track={track} slot="current-cover"/><h1 title={track.title}>{track.title}</h1><TrackCatalogLinks track={track} album/><p>{t('quality.transportHint')}</p></div><div className="immersive-reading"><div className="immersive-tabs" role="tablist" aria-label={t('quality.content')}><button role="tab" id="immersive-lyrics-tab" aria-controls="immersive-content" aria-selected={view==='lyrics'} onClick={()=>setView('lyrics')}><Mic2 size={18}/>{t('lyrics.title')}</button><button role="tab" id="immersive-queue-tab" aria-controls="immersive-content" aria-selected={view==='queue'} onClick={()=>setView('queue')}><ListMusic size={18}/>{t('queue')}</button></div><div id="immersive-content" role="tabpanel" aria-labelledby={view==='lyrics'?'immersive-lyrics-tab':'immersive-queue-tab'}>{view==='lyrics'?<Suspense fallback={<p role="status">{t('lyrics.loading')}</p>}><Lyrics track={track} expanded/></Suspense>:<QueuePanel/>}</div></div></div>:<div className="immersive-empty"><Disc3 size={56}/><h1>{t('quality.emptyTitle')}</h1><p>{t('quality.emptyHint')}</p><button className="primary-button" onClick={back}>{t('quality.back')}</button></div>}
  </section>;
}
