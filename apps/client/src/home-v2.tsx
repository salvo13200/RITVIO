import {SituationShortcuts} from './situation-shortcuts';
import type {SituationKey} from '../../../packages/domain/situations';
import {useContext,useEffect,type ReactNode} from 'react';
import {useShallow} from 'zustand/react/shallow';
import {Play,ArrowRight,RefreshCw,LoaderCircle,Library} from 'lucide-react';
import {useHomeCatalog} from './home-state';
import {HomeCollectionCard,HomePersonalMixes,useHomeRetry} from './home-collections';
import {usePlayer} from './store';
import {useLibrary} from './library';
import {Cover} from './ui-controls';
import {PlaylistCover} from './library-controls';
import {ArtworkContext} from './artwork-context';
import {discoveryCategories} from './discovery';
import {t,noticeText} from './i18n';
import type {HomeCollectionId} from '../../../packages/domain/home';
export function HomePage({onSearch,onLibrary,onPlaylist,onNow,onHistory,onTaste,onCollection,onSituation,offline=false,children}:{onSearch:(query?:string)=>void;onLibrary:(likes?:boolean)=>void;onPlaylist:(id:string)=>void;onNow:()=>void;onHistory:()=>void;onTaste:()=>void;onCollection:(id:HomeCollectionId,play?:boolean)=>void;onSituation:(id:SituationKey)=>void;offline?:boolean;quickArtwork?:Readonly<Record<string,string>>;children:ReactNode}){
  const {result,loading,error,load}=useHomeCatalog(),canRetry=useHomeRetry(result?.retryAt);
  const player=usePlayer(useShallow(s=>({recent:s.recent,current:s.queue[s.index],play:s.play}))),library=useLibrary(s=>s.data),artwork=useContext(ArtworkContext);
  const recent=[...new Map([...(player.current?[player.current]:[]),...player.recent].map(track=>[track.id,track])).values()].slice(0,4);
  useEffect(()=>{if(offline)return;void load();const refresh=()=>{if(!document.hidden)void load();};const timer=setInterval(refresh,60000);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};},[offline,load]);
  useEffect(()=>{if(!result?.refreshing||offline)return;let attempts=0;const timer=setInterval(()=>{if(++attempts>20){clearInterval(timer);return;}void useHomeCatalog.getState().load();},2500);return()=>clearInterval(timer);},[result?.refreshing,offline]);
  const collections=(result?.data?.collections??[]).filter(c=>c.id==='global'||c.id==='releases');
  return <div className="listening-home home2">
    <div className="home2-heading"><div><h1>{t('design.home.title')}</h1><p>{t('home2.intro')}</p></div><button className="icon-button home2-refresh" aria-label={t('home2.refreshHome')} title={!canRetry?t('home2.cooldown'):t('home2.refreshHome')} disabled={loading||!canRetry||offline} onClick={()=>void load(true)}><RefreshCw size={20} className={result?.refreshing?'spin':undefined}/></button></div>
    <section className="home2-recents"><div className="home2-section-heading"><h2>{t('design.home.recent')}</h2><button className="text-button" onClick={onHistory}>{t('design.home.viewAll')}<ArrowRight size={15}/></button></div>{recent.length?<div className="home2-recent-grid">{recent.map(track=><button key={track.id} aria-label={t('home2.play',{name:track.title})} onClick={()=>{if(track.id===player.current?.id){if(!usePlayer.getState().playing)usePlayer.getState().toggle();}else player.play(track,recent);}}><Cover track={track}/><span><strong title={track.title}>{track.title}</strong><small title={track.artist}>{track.artist}</small></span><i aria-hidden="true"><Play size={15} fill="currentColor"/></i></button>)}</div>:<p className="home2-recent-empty">{t('home2.recentEmpty')} <button className="text-button" onClick={()=>onSearch()}>{t('design.home.search')}<ArrowRight size={16}/></button></p>}</section>
    {(error||result?.error)&&<p className="home2-notice" role="status">{noticeText(error||result?.error)}</p>}
    {!result?.data&&loading?<div className="home2-skeleton" role="status" aria-label={t('home2.loading')}><span/><span/></div>:<section className="home2-features" aria-label={t('home2.featured')}>{(['global','releases'] as const).map(id=>{const collection=collections.find(c=>c.id===id);return collection?<HomeCollectionCard key={id} featured collection={collection} updatedAt={result?.updatedAt??null} stale={result?.stale||result?.data?.missing.includes(id)} open={onCollection}/>:<div className="home2-unavailable" key={id}><h2>{t(`home2.${id}`)}</h2><p>{t('home2.unavailable')}</p><button className="text-button" disabled={!canRetry||loading||offline} onClick={()=>void load(true)}>{t('App.riprova')}</button></div>;})}</section>}
    {result?.refreshing&&<p className="home2-status" role="status"><LoaderCircle className="spin" size={16}/>{t('home2.updating')}</p>}
    {!offline&&<section className="home2-world"><div className="home2-section-heading"><div><h2>{t('home2.worldTitle')}</h2><p>{t('home2.worldIntro')}</p></div><button className="text-button" onClick={onTaste}>{t('design.home.viewAll')}<ArrowRight size={15}/></button></div><div className="home2-world-grid"><HomePersonalMixes open={onTaste}/></div></section>}
    <SituationShortcuts open={onSituation} disabled={offline}/><section className="home2-genres"><div className="home2-section-heading"><h2>{t('home2.genres')}</h2><button className="text-button" onClick={()=>onSearch()}>{t('home2.explore')}<ArrowRight size={15}/></button></div><div className="home2-genre-grid">{discoveryCategories.map(category=><button key={category.name} onClick={()=>onSearch(category.query)}><img src={artwork[`genre-${category.artwork}`]??`./artwork/${category.artwork}.png`} alt="" loading="lazy"/><strong>{t(category.key)}</strong></button>)}</div></section>
    <section className="home2-your-library"><div className="home2-section-heading"><h2>{t('design.home.collection')}</h2><button className="text-button" onClick={()=>onLibrary()}>{t('design.home.viewAll')}<ArrowRight size={15}/></button></div><div className="home2-playlists">{library?.playlists.length?library.playlists.slice(0,3).map(playlist=><button key={playlist.id} onClick={()=>onPlaylist(playlist.id)}><PlaylistCover playlist={playlist}/><span><strong>{playlist.name}</strong><small>{t('home2.trackCount',{count:playlist.count})}</small></span><ArrowRight size={17}/></button>):<button onClick={()=>onLibrary()}><Library size={24}/><span>{t('design.home.makePlaylist')}</span><ArrowRight size={17}/></button>}</div></section>
    <section className="home2-link">{children}</section>
  </div>;
}
