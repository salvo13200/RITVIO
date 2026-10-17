import {useLayoutEffect,useRef,useEffect,useState,type ReactNode,type RefObject} from 'react';
import {useArtistArtwork} from './artist-artwork';
import {ListMusic,Heart,Disc3,UserRound,Clock3,ChartNoAxesColumn,History,LayoutGrid,List,MoreHorizontal,ArrowUpRight,Play,Download,ChevronDown} from 'lucide-react';
import {t} from './i18n';
import {CatalogResourceLink,CatalogNavigationContext} from './catalog-navigation';
import {useContext} from 'react';
import {ScrollingLine} from './player-track-info';
import {useLibraryBrowser,type LibraryTab} from './library-browser';
import {useLibrary} from './library';
import {PlaylistCover} from './library-controls';
import {ImportPlaylistButton} from './sharing-ui';
import {RemotePlaylistImport} from './playlist-import';
import {formatTime,type PlaylistSummary,type FollowedResource,type PersonalPlaylist} from '../../../packages/domain/index';
import {motionMode,motionRevision,trackAnimation} from './ui-motion';

export function LibraryNavigation({tab,id}:{tab:LibraryTab;id:string}){
  const nav=useRef<HTMLDivElement>(null),marker=useRef<HTMLSpanElement>(null),previous=useRef<{x:number;width:number}|null>(null);
  const items=[{id:'playlists',name:t('library-ui.playlist.1'),icon:ListMusic},{id:'likes',name:t('lib2.favourites'),icon:Heart},{id:'albums',name:t('catalog.album'),icon:Disc3},{id:'artists',name:t('lib2.artists'),icon:UserRound},{id:'activity',name:t('activity.tab'),icon:Clock3},{id:'taste',name:t('taste.title'),icon:ChartNoAxesColumn},{id:'history',name:t('library-ui.cronologia'),icon:History}] as const;
  useLayoutEffect(()=>{
    const root=nav.current,ink=marker.current;if(!root||!ink)return;
    const update=()=>{const selected=root.querySelector<HTMLElement>('[aria-selected=true]');if(!selected)return;const box=selected.getBoundingClientRect(),bounds=root.getBoundingClientRect(),next={x:box.left-bounds.left+root.scrollLeft,width:box.width};
      ink.style.left=next.x+'px';ink.style.width=next.width+'px';ink.style.top=box.bottom-bounds.top+root.scrollTop-3+'px';
      const old=previous.current;if(old&&(Math.abs(old.x-next.x)>1||Math.abs(old.width-next.width)>1)){for(const animation of ink.getAnimations())animation.cancel();if(motionMode()==='curated')trackAnimation(ink.animate([{transform:`translateX(${old.x-next.x}px) scaleX(${old.width/next.width})`},{transform:'translateX(0) scaleX(1)'}],{duration:220,easing:'cubic-bezier(.16,1,.3,1)'}),'library-indicator');}previous.current=next;};
    update();const observer=new ResizeObserver(update);observer.observe(root);root.addEventListener('scroll',update,true);void document.fonts.ready.then(()=>{if(root.isConnected)update();});return()=>{observer.disconnect();root.removeEventListener('scroll',update,true);};
  },[tab]);
  const button=(item:typeof items[number],index:number)=><button type="button" key={item.id} id={`${id}-${item.id}`} role="tab" tabIndex={tab===item.id?0:-1} aria-selected={tab===item.id} aria-controls={`${id}-panel`} className={`${index>=4?'library-utility-tab':''} ${index===4?'library-utility-start':''} ${item.id==='history'?'library-history-tab':''}`} title={item.name} aria-label={item.name} onClick={()=>useLibraryBrowser.getState().setTab(item.id)}><item.icon size={20} aria-hidden="true"/><span>{item.name}</span></button>;
  return <div ref={nav} className="library-tabs library-navigation" role="tablist" aria-label={t('library-ui.sezioni.della.libreria')} onKeyDown={event=>{
    const index=items.findIndex(item=>item.id===tab),next=event.key==='ArrowRight'?(index+1)%items.length:event.key==='ArrowLeft'?(index+items.length-1)%items.length:event.key==='Home'?0:event.key==='End'?items.length-1:-1;
    if(next<0)return;event.preventDefault();useLibraryBrowser.getState().setTab(items[next].id);rootFocus(nav.current,next);
  }}><span ref={marker} className="library-tab-indicator" aria-hidden="true"/><div className="library-main-tabs">{items.slice(0,4).map(button)}</div><div className="library-utility-tabs">{items.slice(4).map((item,index)=>button(item,index+4))}</div></div>;
}
function rootFocus(root:HTMLElement|null,index:number){const button=root?.querySelectorAll<HTMLButtonElement>('[role=tab]')[index];button?.focus({preventScroll:true});const parent=button?.parentElement;if(button&&parent){const box=button.getBoundingClientRect(),bounds=parent.getBoundingClientRect();if(box.right>bounds.right)parent.scrollLeft+=box.right-bounds.right+3;else if(box.left<bounds.left)parent.scrollLeft-=bounds.left-box.left+3;}}
export function LibraryViewButtons({layout,change}:{layout:'grid'|'list';change:(layout:'grid'|'list')=>void}){return <div className="library-view-switch" role="group" aria-label={t('lib2.view')}><button type="button" aria-label={t('lib2.grid')} aria-pressed={layout==='grid'} onClick={()=>change('grid')}><LayoutGrid size={19}/></button><button type="button" aria-label={t('lib2.list')} aria-pressed={layout==='list'} onClick={()=>change('list')}><List size={20}/></button></div>;}

/** A disclosure contains only its actions; imported dialogs live in the top layer. */
export function LibraryMenu({label,children,importMenu=false}:{label:string;children:ReactNode;importMenu?:boolean}){
  const root=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{const outside=(event:PointerEvent)=>{if(root.current?.open&&!root.current.contains(event.target as Node)&&!document.querySelector('dialog[open]'))root.current.open=false;};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[]);
  return <details ref={root} className={importMenu?'library-import-menu':'library-collection-actions'} onClick={event=>{if((event.target as Element).closest('.library-action-menu button')&&root.current)root.current.open=false;}} onKeyDown={event=>{if(event.key==='Escape'&&root.current?.open){event.preventDefault();event.stopPropagation();root.current.open=false;root.current.querySelector<HTMLElement>('summary')?.focus();}}}><summary id={importMenu?'library-import-trigger':undefined} aria-label={label} title={label}>{importMenu?<><Download size={18}/><span>{t('lib2.import')}</span><ChevronDown size={15}/></>:<MoreHorizontal size={20}/>}</summary><div className="library-action-menu">{children}</div></details>;
}
export function LibraryImports({slot,onImported}:{slot:RefObject<HTMLDivElement|null>;onImported:(playlist:PersonalPlaylist)=>void}){return <LibraryMenu label={t('lib2.import')} importMenu><RemotePlaylistImport slot={slot} onImported={onImported}/><ImportPlaylistButton/></LibraryMenu>;}
function CollectionName({name,id}:{name:string;id:string}){return <ScrollingLine as="span" className="library-collection-name" text={name} resetKey={id}><strong>{name}</strong></ScrollingLine>;}
export function LibraryPlaylistTile({playlist,onOpen,onPlay,onManage}:{playlist:PlaylistSummary;onOpen:()=>void;onPlay:()=>void;onManage:()=>void}){
  return <article className="playlist-card library-collection-card" data-library-id={playlist.id}>
    <button type="button" className="library-collection-open" aria-label={t('lib2.openPlaylist',{name:playlist.name})} onClick={onOpen}><PlaylistCover playlist={playlist}/><span className="library-collection-copy"><CollectionName name={playlist.name} id={playlist.id}/><span className="library-collection-meta">{t('design.home.trackCount',{count:playlist.count})}</span></span></button>
    <span className="library-playlist-description" title={playlist.description}>{playlist.description}</span><span className="library-playlist-count">{playlist.count}</span><span className="library-playlist-duration">{playlist.durationSeconds==null?'—':formatTime(playlist.durationSeconds)}</span>
    <button type="button" className="library-collection-play" disabled={!playlist.count} aria-label={t('lib2.playPlaylist',{name:playlist.name})} onClick={onPlay}><Play size={20} fill="currentColor"/></button>
    <LibraryMenu label={t('lib2.playlistActions',{name:playlist.name})}><button type="button" onClick={onOpen}><ArrowUpRight size={18}/>{t('lib2.open')}</button><button type="button" onClick={onManage}><MoreHorizontal size={18}/>{t('ui3.managePlaylist')}</button></LibraryMenu>
  </article>;
}
export function LibraryResourceTile({resource,subtitle}:{resource:FollowedResource;subtitle?:string}){
  const open=useContext(CatalogNavigationContext),busy=useLibrary(s=>s.busy),Icon=resource.kind==='artist'?UserRound:Disc3;
  const card=useRef<HTMLElement>(null),loading=useArtistArtwork(resource,card),[failedImage,setFailedImage]=useState<string|null>(null);
  return <article ref={card} className={`follow-card library-collection-card library-resource-${resource.kind}`} data-library-id={resource.kind+':'+resource.id}>
    <button type="button" className={`library-resource-art ${loading?'artist-photo-loading':''}`} aria-busy={loading} aria-label={t(resource.kind==='artist'?'catalog.openArtist':'catalog.openAlbum',{name:resource.name})} onClick={()=>open(resource.kind,resource.id)}>{resource.artwork&&failedImage!==resource.artwork?<img src={resource.artwork} alt="" loading="lazy" onError={()=>setFailedImage(resource.artwork)}/>:<Icon size={54}/>}</button>
    <div className="library-collection-copy"><ScrollingLine as="span" className="library-collection-name" text={resource.name} resetKey={resource.kind+':'+resource.id}><CatalogResourceLink resource={resource} kind={resource.kind}/></ScrollingLine><span className="library-collection-meta">{subtitle??t(resource.kind==='artist'?'library-ui.artista':'catalog.album')}</span></div>
    <LibraryMenu label={t('lib2.resourceActions',{name:resource.name})}><button type="button" onClick={()=>open(resource.kind,resource.id)}><ArrowUpRight size={18}/>{t('lib2.open')}</button><button type="button" disabled={busy} onClick={()=>void useLibrary.getState().unfollow(resource)}><UserRound size={18}/>{t('library-ui.non.seguire.piu')}</button></LibraryMenu>
  </article>;
}
/** Only visible collection items animate; transport progress never triggers this hook. */
export function useLibraryCollectionMotion(root:RefObject<HTMLDivElement|null>,signature:string){
  const previous=useRef(new Map<string,DOMRect>());
  useLayoutEffect(()=>{const container=root.current;if(!container)return;const next=new Map<string,DOMRect>(),mode=motionMode(),revision=motionRevision();
    for(const row of container.querySelectorAll<HTMLElement>('[data-library-id]')){const rect=row.getBoundingClientRect(),id=row.dataset.libraryId!;next.set(id,rect);const old=previous.current.get(id);for(const animation of row.getAnimations())if(animation.id==='library-reorder')animation.cancel();if(!old||mode!=='curated'||rect.bottom<0||rect.top>innerHeight||motionRevision()!==revision)continue;const x=old.left-rect.left,y=old.top-rect.top;if(Math.abs(x)<1&&Math.abs(y)<1)continue;trackAnimation(row.animate([{transform:`translate(${x}px,${y}px)`},{transform:'translate(0,0)'}],{duration:240,easing:'cubic-bezier(.16,1,.3,1)'}),'library-reorder');}
    previous.current=next;
  },[signature]);
}
