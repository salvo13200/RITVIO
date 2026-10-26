import {useEffect,useRef,useState,type FormEvent,type PointerEvent as ReactPointerEvent,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {Capacitor} from '@capacitor/core';
import {ArrowLeft,ChevronRight,Clock,GripVertical,Heart,LayoutGrid,List,MoreHorizontal,Play,Plus,Search,Shuffle,Trash2} from 'lucide-react';
import type {MobilePlaylist,NativeTrack} from '../../../../packages/domain/mobile';
import {foundationBridge as bridge} from './native';
import {Artwork,Empty,IconButton,ScrollText,Sheet,SongRow} from './components';
import type {IOSCopy} from './copy';
import type {LibraryCopy} from './library-copy';
import type {LibraryController} from './use-library';
import './library.css';

export type PlaylistContext={id:string;index:number;revision:number};
const photo=(url:string|null|undefined)=>url?.startsWith('file://')?Capacitor.convertFileSrc(url):url;
function Cover({playlist,heart=false,src}:{playlist?:MobilePlaylist;heart?:boolean;src?:string}){
 const image=playlist?.cover??playlist?.items[0]?.thumbnail??src;
 return <span className={`ios-collection-cover${heart?' has-heart':''}`}><Artwork src={photo(image)}/>{heart&&<Heart fill="currentColor" aria-hidden="true"/>}</span>;
}
const portal=(node:ReactNode)=>createPortal(node,document.querySelector('.ios-app')??document.body);

export function PlaylistForm({library,t,onClose,onSaved,playlist,track,queueRevision}:{library:LibraryController;t:LibraryCopy;onClose:()=>void;onSaved?:(id:string)=>void;playlist?:MobilePlaylist;track?:NativeTrack;queueRevision?:number}){
 const original=useRef(playlist),[name,setName]=useState(playlist?.name??''),[description,setDescription]=useState(playlist?.description??'');
 const title=queueRevision!==undefined?t.queueSave:playlist?t.rename:t.create;
 const outdated=Boolean(original.current&&library.value?.playlists.find(item=>item.id===original.current!.id)?.revision!==original.current.revision);
 async function submit(event:FormEvent){event.preventDefault();if(!name.trim()||name.trim().length>100||library.busy||outdated)return;
  const before=new Set(library.value?.playlists.map(item=>item.id)),base=original.current;
  const result=queueRevision!==undefined?await library.saveQueue(name.trim(),queueRevision):base?await library.command({type:'rename',id:base.id,revision:base.revision!,name:name.trim(),description},t.updated):await library.command({type:'create',name:name.trim(),description,...(track?{track}:{})},track?t.added:t.created);
  if(result){const id=base?.id??result.playlists.find(item=>!before.has(item.id))?.id;onClose();if(id)onSaved?.(id);}
 }
 return <Sheet title={title} closeLabel={t.cancel} closeText onClose={onClose} className="ios-library-form"><form onSubmit={event=>void submit(event)}><div className="ios-form-body">{outdated&&<p className="ios-library-error" role="alert">{t.editorChanged}</p>}<label>{t.name}<input aria-label={t.name} value={name} onChange={event=>setName(event.target.value)} maxLength={100} autoComplete="off" enterKeyHint="done" required/></label>{queueRevision===undefined&&<label>{t.description}<span className="ios-field-hint">{t.optional}</span><textarea aria-label={t.description} value={description} onChange={event=>setDescription(event.target.value)} maxLength={1000} rows={4}/></label>}</div><footer><button className="ios-primary" disabled={!name.trim()||library.busy||outdated}>{library.busy?t.loading:t.save}</button></footer></form></Sheet>;
}

export function AddToPlaylist({track,library,t,onClose}:{track:NativeTrack;library:LibraryController;t:LibraryCopy;onClose:()=>void}){
 const [create,setCreate]=useState(false);
 if(create)return <PlaylistForm track={track} library={library} t={t} onClose={onClose}/>;
 return <Sheet title={t.pickTarget} closeLabel={t.cancel} closeText onClose={onClose} className="ios-add-playlist"><div className="ios-library-picker-list"><button className="ios-new-playlist" onClick={()=>setCreate(true)}><Plus/>{t.create}</button>{library.value?.playlists.map(item=><button key={item.id} className="ios-collection-list-row" disabled={library.busy} onClick={()=>{void library.command({type:'add',id:item.id,revision:item.revision!,track},t.added).then(result=>{if(result)onClose();});}}><Cover playlist={item}/><span className="ios-identity"><strong>{item.name}</strong><small>{t.songCount(item.items.length)}</small></span><Plus aria-hidden="true"/></button>)}</div></Sheet>;
}

type Drag={from:number;to:number;pointer:number;startY:number;y:number;scroll:number;revision:number;moved:boolean};
function CollectionSongs({items,playlist,library,t,text,currentId,onPlay,onMore,announce}:{items:NativeTrack[];playlist?:MobilePlaylist;library:LibraryController;t:LibraryCopy;text:IOSCopy;currentId?:string;onPlay:(items:NativeTrack[],index:number,shuffle?:boolean)=>void;onMore:(track:NativeTrack,context?:PlaylistContext)=>void;announce:(message:string)=>void}){
 const [limit,setLimit]=useState(50),[view,setView]=useState<Drag|null>(null),drag=useRef<Drag|null>(null),root=useRef<HTMLDivElement>(null);
 const shown=items.slice(0,limit),revision=playlist?.revision;
 function reset(){const source=drag.current&&root.current?.querySelector<HTMLElement>(`[data-library-entry="${drag.current.from}"]`);if(source)source.style.transform='';drag.current=null;setView(null);}
 useEffect(()=>{if(drag.current&&drag.current.revision!==revision){reset();announce(t.changed);}},[revision]);
 useEffect(()=>{setLimit(50);reset();},[playlist?.id]);
 function update(y:number){const value=drag.current,container=root.current,area=container?.closest<HTMLElement>('.ios-content');if(!value||!container||!area)return;
  const rows=Array.from(container.querySelectorAll<HTMLElement>('[data-library-entry]')),top=container.getBoundingClientRect().top;
  let to=value.to,distance=Infinity;for(const row of rows){const delta=Math.abs(y-(top+row.offsetTop+row.offsetHeight/2));if(delta<distance){distance=delta;to=Number(row.dataset.libraryEntry);}}
  const next={...value,y,to,moved:value.moved||Math.abs(y-value.startY)>5||area.scrollTop!==value.scroll};drag.current=next;
  const source=rows.find(row=>Number(row.dataset.libraryEntry)===value.from),last=rows[rows.length-1];if(source&&last){const shift=y-value.startY+area.scrollTop-value.scroll;source.style.transform=`translateY(${Math.max(-source.offsetTop,Math.min(last.offsetTop-source.offsetTop,shift))}px)`;}
  setView(previous=>previous?.to===next.to&&previous.from===next.from?previous:next);
 }
 // A held grip near the bottom must not scroll before the user starts dragging.
 // Scroll only toward the edge they move into, rather than against an upward drag.
 useEffect(()=>{if(!view)return;let frame=0;function step(){const area=root.current?.closest<HTMLElement>('.ios-content'),value=drag.current;if(!area||!value)return;const rect=area.getBoundingClientRect();let shift=0;if(value.moved&&value.y<value.startY&&value.y<rect.top+48)shift=-Math.min(14,(rect.top+48-value.y)/4);else if(value.moved&&value.y>value.startY&&value.y>rect.bottom-48)shift=Math.min(14,(value.y-rect.bottom+48)/4);if(shift){area.scrollTop+=shift;update(value.y);}frame=requestAnimationFrame(step);}frame=requestAnimationFrame(step);return()=>cancelAnimationFrame(frame);},[Boolean(view)]);
 function begin(event:ReactPointerEvent<HTMLButtonElement>,index:number){if(!playlist||library.busy||event.button!==0)return;event.preventDefault();const area=root.current?.closest<HTMLElement>('.ios-content');event.currentTarget.setPointerCapture(event.pointerId);const value={from:index,to:index,pointer:event.pointerId,startY:event.clientY,y:event.clientY,scroll:area?.scrollTop??0,revision:playlist.revision!,moved:false};drag.current=value;setView(value);}
 function end(event:ReactPointerEvent<HTMLButtonElement>,commit:boolean){const value=drag.current;if(!value||value.pointer!==event.pointerId)return;reset();if(!commit||!playlist)return;if(value.from!==value.to)void library.command({type:'move',id:playlist.id,revision:value.revision,from:value.from,to:value.to});else if(!value.moved){event.currentTarget.focus({preventScroll:true});onMore(items[value.from],{id:playlist.id,index:value.from,revision:value.revision});}}
 return <><div ref={root} className="ios-library-songs">{shown.map((track,index)=><div key={`${playlist?.id??'songs'}:${index}:${track.videoId}`} data-library-entry={index} className={`ios-library-entry${view?.from===index?' is-lifted':''}${view&&view.to===index&&view.from!==index?' is-insertion':''}`}><SongRow track={track} text={text} active={track.videoId===currentId} onPlay={()=>onPlay(items,index)} onMore={()=>onMore(track,playlist?{id:playlist.id,index,revision:playlist.revision!}:undefined)}/>{playlist&&<button className="ios-library-grip" aria-label={`${t.reorder}: ${track.title}`} disabled={library.busy} onPointerDown={event=>begin(event,index)} onPointerMove={event=>{if(drag.current?.pointer===event.pointerId)update(event.clientY);}} onPointerUp={event=>end(event,true)} onPointerCancel={event=>end(event,false)} onLostPointerCapture={event=>end(event,false)} onClick={event=>{if(event.detail===0)onMore(track,{id:playlist.id,index,revision:playlist.revision!});}}><GripVertical aria-hidden="true"/></button>}</div>)}</div>{limit<items.length&&<button className="ios-show-more" onClick={()=>setLimit(value=>Math.min(items.length,value+50))}>{t.showMore}</button>}</>;
}

export function LibraryPane({library,t,text,currentId,active,onModalChange,onFind,onPlay,onMore,announce}:{library:LibraryController;t:LibraryCopy;text:IOSCopy;currentId?:string;active:boolean;onModalChange:(value:boolean)=>void;onFind:()=>void;onPlay:(items:NativeTrack[],index:number,shuffle?:boolean)=>void;onMore:(track:NativeTrack,context?:PlaylistContext)=>void;announce:(message:string)=>void}){
 const [collection,setCollection]=useState<string|null>(null),[view,setView]=useState<'grid'|'list'>(()=>{try{return localStorage.getItem('ritvio.ios.library-view')==='list'?'list':'grid';}catch{return 'grid';}}),[query,setQuery]=useState(''),[form,setForm]=useState<MobilePlaylist|'new'|null>(null),[actions,setActions]=useState<MobilePlaylist|null>(null),[deleting,setDeleting]=useState<MobilePlaylist|null>(null),[clearHistory,setClearHistory]=useState(false);
 const modal=Boolean(form||actions||deleting||clearHistory),heading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{history.replaceState({...history.state,ritvioLibrary:null},'');function back(){setCollection(history.state?.ritvioLibrary??null);}window.addEventListener('popstate',back);return()=>window.removeEventListener('popstate',back);},[]);
 useEffect(()=>{onModalChange(modal);},[modal,onModalChange]);useEffect(()=>()=>onModalChange(false),[onModalChange]);
 useEffect(()=>{void bridge.navigationState({canGoBack:active&&!modal&&Boolean(collection)}).catch(()=>{});return()=>{void bridge.navigationState({canGoBack:false}).catch(()=>{});};},[active,modal,collection]);
 useEffect(()=>{const area=heading.current?.closest('.ios-content');if(area)area.scrollTop=0;heading.current?.focus({preventScroll:true});},[collection]);
 function open(id:string){history.pushState({...history.state,ritvioLibrary:id},'');setCollection(id);}
 function back(){if(history.state?.ritvioLibrary)history.back();else setCollection(null);}
 const value=library.value,playlist=value?.playlists.find(item=>item.id===collection),items=collection==='liked'?value?.likes:collection==='recent'?value?.recent:playlist?.items;
 if(!value)return <div className="ios-library"><h1>{t.title}</h1>{library.error?<Empty title={t.loadError} body={library.error}><button className="ios-primary" onClick={()=>void library.reload()}>{t.retry}</button></Empty>:<div role="status" className="ios-library-loading">{t.loading}<div className="ios-library-skeleton" aria-hidden="true"/></div>}</div>;
 const playlists=value.playlists.filter(item=>item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
 const formUI=form?portal(<PlaylistForm library={library} t={t} playlist={form==='new'?undefined:form} onClose={()=>setForm(null)} onSaved={id=>{if(form==='new')open(id);}}/>):null;
 return <section className="ios-library">
  {library.error&&<aside className="ios-library-error" role="alert"><span>{library.error}</span><button onClick={()=>void library.reload()}>{t.retry}</button></aside>}
  {collection?<>
   <div className="ios-library-detail-bar"><IconButton label={t.back} onClick={back}><ArrowLeft/></IconButton><span>{t.library}</span>{playlist?<IconButton label={t.more} onClick={()=>setActions(playlist)}><MoreHorizontal/></IconButton>:collection==='recent'?<IconButton label={t.clearHistory} disabled={!value.recent.length} onClick={()=>setClearHistory(true)}><Trash2/></IconButton>:<span/>}</div>
   {items?<><div className={`ios-collection-heading${playlist?'':' is-system'}`}>{collection!=='recent'&&<Cover playlist={playlist} heart={collection==='liked'} src={value.likes[0]?.thumbnail}/>}<div><h1 ref={heading} tabIndex={-1}>{playlist?.name??(collection==='liked'?t.liked:t.history)}</h1><p>{t.songCount(items.length)}</p>{playlist?.description&&<p className="ios-collection-description">{playlist.description}</p>}</div></div>
   {items.length>0&&<div className="ios-collection-transport"><button className="ios-primary" onClick={()=>onPlay(items,0)} aria-label={t.play}><Play fill="currentColor"/>{text.play}</button><IconButton label={t.shuffle} onClick={()=>onPlay(items,Math.floor(Math.random()*items.length),true)}><Shuffle/></IconButton>{playlist&&<button onClick={()=>setForm(playlist)}>{t.edit}</button>}</div>}
   {!items.length?<Empty title={collection==='liked'?t.emptyLikes:collection==='recent'?t.history:t.emptyPlaylist} body={collection==='liked'?t.emptyLikesBody:collection==='recent'?t.historyEmpty:t.emptyPlaylistBody}><button className="ios-primary" onClick={onFind}>{t.find}</button></Empty>:<>{playlist&&<p className="ios-reorder-hint">{t.reorderHint}</p>}<CollectionSongs key={collection} items={items} playlist={playlist} library={library} t={t} text={text} currentId={currentId} onPlay={onPlay} onMore={onMore} announce={announce}/></>}</>:<Empty title={t.notFound} body=""><button onClick={back}>{t.back}</button></Empty>}
  </>:<>
   <div className="ios-library-title"><h1 ref={heading} tabIndex={-1}>{t.title}</h1><IconButton label={t.create} className="ios-create-playlist" onClick={()=>setForm('new')}><Plus/></IconButton></div>
   <button className="ios-liked-collection" onClick={()=>open('liked')}><Cover heart src={value.likes[0]?.thumbnail}/><span className="ios-identity"><strong>{t.liked}</strong><small>{t.songCount(value.likes.length)}</small></span><ChevronRight aria-hidden="true"/></button>
   <div className="ios-library-toolbar"><h2>{t.playlists}</h2><IconButton label={t.history} onClick={()=>open('recent')}><Clock/></IconButton><IconButton label={view==='grid'?t.list:t.grid} onClick={()=>{const next=view==='grid'?'list':'grid';setView(next);setQuery('');try{localStorage.setItem('ritvio.ios.library-view',next);}catch{}}}>{view==='grid'?<List/>:<LayoutGrid/>}</IconButton></div>
   {view==='list'&&<div className="ios-search-field ios-library-search"><Search aria-hidden="true"/><input type="search" aria-label={t.search} placeholder={t.search} value={query} onChange={event=>setQuery(event.target.value)}/></div>}
   {playlists.length?<div key={view} className={`ios-playlist-collections is-${view}`}>{playlists.map(item=><div key={item.id} className="ios-personal-playlist"><button className="ios-personal-main" onClick={()=>open(item.id)} aria-label={`${item.name}, ${t.songCount(item.items.length)}`}><Cover playlist={item}/><span className="ios-identity"><strong><ScrollText>{item.name}</ScrollText></strong><small>{t.songCount(item.items.length)}</small></span></button><IconButton label={`${t.more}: ${item.name}`} onClick={()=>setActions(item)}><MoreHorizontal/></IconButton></div>)}</div>:<Empty title={query?text.noResults:t.emptyTitle} body={query?text.tryQuery:t.emptyBody}>{!query&&<button className="ios-primary" onClick={()=>setForm('new')}>{t.create}</button>}</Empty>}
  </>}
  {formUI}
  {actions&&portal(<Sheet title={actions.name} closeLabel={t.cancel} closeText onClose={()=>setActions(null)} className="ios-menu"><button onClick={()=>{setForm(actions);setActions(null);}}>{t.rename}</button><button disabled={library.busy} onClick={()=>{const item=actions;setActions(null);void library.chooseCover(item.id,item.revision!);}}>{t.changeCover}</button>{actions.cover&&<button disabled={library.busy} onClick={()=>{const item=actions;setActions(null);void library.removeCover(item.id,item.revision!);}}>{t.removeCover}</button>}<button className="ios-destructive" onClick={()=>{setDeleting(actions);setActions(null);}}>{t.delete}</button></Sheet>)}
  {deleting&&portal(<Sheet title={t.deleteTitle} closeLabel={t.cancel} closeText onClose={()=>setDeleting(null)} className="ios-confirm"><p>{t.deleteBody}</p><button disabled={library.busy} className="ios-destructive" onClick={()=>{const item=deleting;void library.command({type:'delete',id:item.id,revision:item.revision!},t.deleted).then(result=>{if(result){setDeleting(null);if(collection===item.id)back();}});}}>{t.confirmDelete}</button></Sheet>)}
  {clearHistory&&portal(<Sheet title={t.clearHistoryTitle} closeLabel={t.cancel} closeText onClose={()=>setClearHistory(false)} className="ios-confirm"><p>{t.clearHistoryBody}</p><button disabled={library.busy} className="ios-destructive" onClick={()=>{void library.command({type:'clearHistory'},t.historyCleared).then(result=>{if(result)setClearHistory(false);});}}>{t.clearHistory}</button></Sheet>)}
 </section>;
}
