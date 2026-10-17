import {useLayoutEffect,useRef} from 'react';
import {Search,X,RotateCcw,SlidersHorizontal} from 'lucide-react';
import {t} from './i18n';
import {LibraryViewButtons} from './library-restyle';
import {getLibraryView,libraryInitialView,useLibraryBrowser,type LibraryView} from './library-browser';
import {defaultLibraryFilter,type LibrarySort} from '../../../packages/domain/library-browser';

export function useLibraryBrowsing(key:string,profile:string|undefined){
  const ref=useRef<HTMLDivElement>(null);
  const view=useLibraryBrowser(s=>s.views[key]??libraryInitialView);
  useLayoutEffect(()=>{
    if(!profile)return;
    const main=ref.current?.closest('main');if(!main)return;
    main.scrollTo({top:getLibraryView(key).scroll,behavior:'instant'});
    return()=>{useLibraryBrowser.getState().change(key,{scroll:main.scrollTop});};
  },[key,profile]);
  const change=(patch:Partial<LibraryView>)=>{
    if(Object.keys(patch).length===1&&patch.layout){useLibraryBrowser.getState().change(key,{...patch,scroll:0});ref.current?.closest('main')?.scrollTo({top:0,behavior:'instant'});return;}
    useLibraryBrowser.getState().change(key,{...patch,shown:libraryInitialView.shown,scroll:0});
    ref.current?.closest('main')?.scrollTo({top:0,behavior:'instant'});
  };
  return {ref,view,change,more:()=>useLibraryBrowser.getState().more(key)};
}
export function LibraryToolbar({view,change,placeholder,sorts,duration=false,recentLabel,count,total,shown,layout}:{layout?:'grid'|'list';view:LibraryView;change:(patch:Partial<LibraryView>)=>void;placeholder:string;sorts:LibrarySort[];duration?:boolean;recentLabel:string;count:number;total:number;shown:number}){
  const dirty=!!view.query||view.duration!=='all'||view.sort!=='recent';
  const labels:Record<LibrarySort,string>={recent:recentLabel,name:t('browse.sort.name'),artist:t('browse.sort.artist'),'duration-short':t('browse.sort.short'),'duration-long':t('browse.sort.long'),count:t('browse.sort.count')};
  return <div className="library-browser-tools">
    <div className="library-browser-controls">
      <label className="library-local-search"><Search size={18} aria-hidden="true"/><input type="search" aria-label={placeholder} placeholder={placeholder} maxLength={200} value={view.query} onChange={e=>change({query:e.target.value})}/>{view.query&&<button type="button" className="icon-button" aria-label={t('browse.clearSearch')} onClick={()=>change({query:''})}><X size={17}/></button>}</label>
      <label className="library-browser-select"><span>{t('browse.sort')}</span><select aria-label={t('browse.sort')} value={view.sort} onChange={e=>change({sort:e.target.value as LibrarySort})}>{sorts.map(sort=><option key={sort} value={sort}>{labels[sort]}</option>)}</select></label>
      {duration&&<details className="duration-filter-control"><summary aria-label={t('browse.duration')}><SlidersHorizontal size={20}/>{view.duration!=='all'&&<span className="filter-active-dot"/>}</summary><label className="library-browser-select"><span>{t('browse.duration')}</span><select aria-label={t('browse.duration')} value={view.duration} onChange={e=>change({duration:e.target.value as LibraryView['duration']})}>{(['all','short','medium','long','unknown'] as const).map(value=><option key={value} value={value}>{t(`browse.duration.${value}`)}</option>)}</select></label></details>}
      {layout&&<LibraryViewButtons layout={layout} change={layout=>change({layout})}/>}
    </div>
    <div className="library-browser-status"><p role="status" aria-live="polite" aria-atomic="true">{t('browse.results',{count,total})}{shown<count&&<span>{t('browse.shown',{shown})}</span>}</p>{dirty&&<button type="button" className="text-button" onClick={()=>change(defaultLibraryFilter)}><RotateCcw size={15}/>{t('browse.reset')}</button>}</div>
  </div>;
}
export function LibraryNoResults({reset}:{reset:()=>void}){return <div className="library-no-results"><Search size={28} aria-hidden="true"/><h2>{t('browse.empty.title')}</h2><p>{t('browse.empty.description')}</p><button className="secondary-button" onClick={reset}>{t('browse.reset')}</button></div>;}
export function LibraryMore({shown,count,more}:{shown:number;count:number;more:()=>void}){return shown<count?<div className="library-load-more"><button className="secondary-button" onClick={more}>{t('browse.more',{count:Math.min(60,count-shown)})}</button><span>{t('browse.remaining',{count:count-shown})}</span></div>:null;}
