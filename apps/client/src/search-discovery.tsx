import {Clock3,Trash2} from 'lucide-react';
import {useShallow} from 'zustand/react/shallow';
import {DiscoveryGenres,RecentTracks} from './discovery';
import {usePlayer} from './store';
import {t} from './i18n';

export function SearchDiscovery({onSearch}:{onSearch:(query:string)=>void}){
  const {history,recent,clear}=usePlayer(useShallow(s=>({history:s.searchHistory,recent:s.recent,clear:s.clearSearchHistory})));
  return <div className="search-discovery">
    <p className="discovery-intro">{t('discovery.intro')}</p>
    <section className="discovery-section"><div className="section-heading"><h2>{t('design.home.discovery')}</h2></div><DiscoveryGenres onSearch={onSearch}/></section>
    <section className="discovery-section search-history" aria-label={t('discovery.history')}><div className="section-heading"><h2>{t('discovery.history')}</h2>{history.length>0&&<button className="text-button" onClick={clear} aria-label={t('discovery.clearHistory')}><Trash2 size={16}/>{t('discovery.clear')}</button>}</div>
      {history.length?<div className="search-history-items">{history.map(query=><button key={query} onClick={()=>onSearch(query)}><Clock3 size={18} aria-hidden="true"/><span>{query}</span></button>)}</div>:<p className="discovery-hint">{t('discovery.emptyHistory')}</p>}
    </section>
    <section className="discovery-section"><div className="section-heading"><h2>{t('discovery.resume')}</h2></div>{recent.length?<RecentTracks tracks={recent}/>:<p className="discovery-hint">{t('discovery.emptyListening')}</p>}</section>
  </div>;
}
