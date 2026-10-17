import {noticeText} from './i18n';
import {displayLocale} from '../../../packages/i18n/display';
import {useContext,useEffect,useState} from 'react';
import {Play,ArrowRight,Disc3,RefreshCw,LoaderCircle,Shuffle,ListPlus,Copy,Check,ChevronLeft} from 'lucide-react';
import {api} from './api';
import {t} from './i18n';
import {usePlayer} from './store';
import {useLibrary} from './library';
import {CatalogNavigationContext} from './catalog-navigation';

import {isExcluded} from '../../../packages/domain/listening';
import {Cover} from './ui-controls';
import type {TasteMix} from '../../../packages/domain/taste';
import type {HomeCollection,HomeCollectionId,HomeDetail,HomeResult} from '../../../packages/domain/home';
export const collectionTitle=(id:HomeCollectionId)=>t(`home2.${id}`);
export function homeDate(value:string|null){return value?new Intl.DateTimeFormat(displayLocale(),{day:'numeric',month:'long',timeZone:'Europe/Rome'}).format(new Date(value)):'';}
export function useHomeRetry(retryAt:string|null|undefined){const [now,setNow]=useState(Date.now);useEffect(()=>{setNow(Date.now());if(!retryAt)return;const delay=Date.parse(retryAt)-Date.now();if(delay<=0)return;const timer=setTimeout(()=>setNow(Date.now()),Math.min(delay+50,15*60000+50));return()=>clearTimeout(timer);},[retryAt]);return !retryAt||Date.parse(retryAt)<=now;}
export function HomeArtwork({collection}:{collection:HomeCollection|undefined}){
  const [broken,setBroken]=useState(false);useEffect(()=>setBroken(false),[collection?.artwork]);
  return <div className={`home2-artwork home2-artwork-${collection?.id??'empty'}`}>{collection?.artwork&&!broken?<img src={collection.artwork} alt="" loading="lazy" onError={()=>setBroken(true)}/>:<Disc3 size={48} aria-hidden="true"/>}</div>;
}
export function HomeCollectionCard({collection,featured=false,updatedAt,stale=false,open}:{collection:HomeCollection;featured?:boolean;updatedAt:string|null;stale?:boolean;open:(id:HomeCollectionId,play?:boolean)=>void}){
  const title=collectionTitle(collection.id);
  return <article className={featured?'home2-feature':'home2-shelf-card'} data-stale={stale}>
    <button className="home2-cover-link" onClick={()=>open(collection.id)} aria-label={t('home2.open',{name:title})}><HomeArtwork collection={collection}/></button>
    <div className="home2-card-copy"><h2><button onClick={()=>open(collection.id)}>{title}</button></h2><p>{t(`home2.description.${collection.id}`)}</p><small>{t(collection.id==='releases'?'home2.catalogSource':'home2.chartSource')}</small><span className="home2-card-date">{stale?t('home2.previousEdition'):t('home2.updated',{date:homeDate(updatedAt)})}</span><button className={featured?'primary-button':'icon-button home2-card-play'} onClick={()=>open(collection.id,true)} aria-label={t('home2.play',{name:title})}><Play size={18} fill="currentColor"/>{featured&&t('home2.listen')}</button></div>
  </article>;
}
export function HomePersonalMixes({open}:{open:()=>void}){
  const [mixes,setMixes]=useState<TasteMix[]>([]),[error,setError]=useState(''),[privateMode,setPrivate]=useState(false);
  const profile=useLibrary(s=>s.data?.profile.id),exclusions=usePlayer(s=>s.exclusions);
  useEffect(()=>{const controller=new AbortController();setMixes([]);setError('');
    void api.taste.get(controller.signal).then(async snapshot=>{if(controller.signal.aborted)return;setPrivate(snapshot.privateMode);if(snapshot.privateMode)return;const results=await Promise.allSettled((['familiar','discovery'] as const).map(kind=>api.taste.mix({kind,exclusions},controller.signal)));if(controller.signal.aborted)return;setMixes(results.flatMap(r=>r.status==='fulfilled'?[r.value]:[]));if(results.some(r=>r.status==='rejected'))setError(t('home2.mixError'));}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return()=>controller.abort();
  },[profile,exclusions]);
  return <>{(['familiar','discovery'] as const).map(kind=>{const mix=mixes.find(m=>m.kind===kind),items=mix?.items.filter(i=>!isExcluded(i.track,exclusions))??[],first=items[0]?.track,name=t(kind==='familiar'?'home2.familiar':'home2.discovery');return <article className="home2-shelf-card home2-personal" key={kind}><button className="home2-cover-link" onClick={open} aria-label={t('home2.open',{name})}><div className="home2-artwork"><Cover track={first}/></div></button><div className="home2-card-copy"><h2><button onClick={open}>{name}</button></h2><p>{privateMode?t('home2.privateMix'):noticeText(error)||t(first?'home2.mixDescription':'home2.mixEmpty')}</p><small>{t('home2.localMix')}</small><button className="icon-button home2-card-play" aria-label={t('home2.play',{name})} onClick={()=>{if(first){const state=usePlayer.getState();state.setShuffle(false);state.play(first,items.map(i=>i.track));}else open();}}><Play size={18} fill="currentColor"/></button></div></article>;})}</>;
}
