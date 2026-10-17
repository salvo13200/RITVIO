import {ArrowRight,Play} from 'lucide-react';
import {useContext} from 'react';
import type {Track} from '../../../packages/domain/index';
import {ArtworkContext} from './artwork-context';
import {Cover} from './ui-controls';
import {usePlayer} from './store';
import {t} from './i18n';

export const discoveryCategories=[
  {name:'Pop',query:'pop music',artwork:'pop',key:'design.genre.pop'},
  {name:'Elettronica',query:'electronic music',artwork:'electronic',key:'design.genre.electronic'},
  {name:'Jazz',query:'jazz music',artwork:'jazz',key:'design.genre.jazz'},
  {name:'Rock',query:'rock music',artwork:'rock',key:'design.genre.rock'},
] as const;

export function DiscoveryGenres({onSearch}:{onSearch:(query:string)=>void}){
  const artwork=useContext(ArtworkContext);
  return <div className="search-starts discovery-genres" aria-label={t('design.search.ideas')}>{discoveryCategories.map(category=><button className="genre-card" key={category.name} onClick={()=>onSearch(category.query)}><img src={artwork[`genre-${category.artwork}`]??`./artwork/${category.artwork}.webp`} alt="" loading="lazy"/><span><strong>{t(category.key)}</strong><ArrowRight size={18} aria-hidden="true"/></span></button>)}</div>;
}

export function RecentTracks({tracks}:{tracks:Track[]}){
  return <div className="recent-grid">{tracks.slice(0,4).map((track,index)=><button key={track.id} className="recent-card" onClick={()=>usePlayer.getState().play(track,tracks)} aria-label={t('design.home.playRecent',{title:track.title})}><div className="recent-artwork"><Cover track={track} slot={`recent-cover-${index+1}`}/><i aria-hidden="true"><Play size={18} fill="currentColor"/></i></div><strong title={track.title}>{track.title}</strong><span title={track.artist}>{track.artist}</span></button>)}</div>;
}
