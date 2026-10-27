import {useEffect,useRef,useState,type RefObject} from 'react';
import {ArrowLeft,Check,ChevronRight,Heart,LoaderCircle,MoreHorizontal,Play,RefreshCw,Search,Shuffle,X} from 'lucide-react';
import {mobileTime,type MobileResource,type NativeTrack} from '../../../../packages/domain/mobile';
import {rankSearch} from '../../../../packages/domain/search-ranking';
import {Artwork,Empty,IconButton,Sheet,SongRow} from './components';
import type {IOSCopy} from './copy';
import {catalogError,type CatalogCopy} from './catalog-copy';
import type {AlbumDetail,ArtistDetail,CatalogArtistSearch,CatalogReleases,CatalogSnapshot} from './catalog-model';
import {useCatalog} from './use-catalog';
import type {LibraryController} from './use-library';
import './catalog.css';

export type ResourceRoute={kind:'album'|'artist';id:string;view?:'albums'|'singles'|'songs'};
type Common={t:CatalogCopy;text:IOSCopy;loading:boolean;currentId?:string;onOpen:(resource:Pick<MobileResource,'id'|'kind'>)=>void;onPeople:(people:MobileResource['artists'])=>void;onMore:(track:NativeTrack)=>void;onPlay:(items:NativeTrack[],index:number,shuffle?:boolean)=>void};
function Feedback({query,t}:{query:ReturnType<typeof useCatalog>;t:CatalogCopy}){
 if(query.phase==='error')return <Empty title={catalogError(query.error,t)} body=""><button className="ios-primary" onClick={query.retry}>{t.retry}</button></Empty>;
 return <div className="ios-catalog-loading" role="status"><LoaderCircle className="ios-spinner" aria-hidden="true"/><p>{query.phase==='waiting'?t.waiting:t.loading}</p><div className="ios-catalog-skeleton" aria-hidden="true"><span/><span/><span/></div></div>;
}
export function ResourceShelf({items,t,onOpen,list=false}:{items:MobileResource[];t:CatalogCopy;onOpen:Common['onOpen'];list?:boolean}){
 return <div className={`ios-resource-shelf${list?' is-list':''}`}>{items.map((item,index)=><button className={`ios-resource is-${item.kind}`} key={`${item.kind}:${item.id}:${index}`} onClick={()=>onOpen(item)} aria-label={`${item.kind==='artist'?t.openArtist:t.openAlbum}: ${item.name}`}><Artwork src={item.artwork}/><span className="ios-identity"><strong>{item.name}</strong><small>{item.kind==='artist'?t.artist:[item.artists?.map(person=>person.name).join(', '),item.year].filter(Boolean).join(' · ')||t.album}</small></span>{list&&<ChevronRight aria-hidden="true"/>}</button>)}</div>;
}
export function CatalogSearch({query,setQuery,inputRef,enabled,...props}:Common&{query:string;setQuery:(value:string)=>void;inputRef:RefObject<HTMLInputElement|null>;enabled:boolean}){
 const {t,text,loading,onPlay,onMore,onOpen,currentId}=props,[filter,setFilter]=useState<'all'|'songs'|'albums'|'artists'>('all'),[limit,setLimit]=useState(20);
 const term=query.trim(),request=useCatalog(term.length>=3?{operation:'search-snapshot',query:term}:null,loading,enabled);
 const value=request.value as CatalogSnapshot|null;
 useEffect(()=>{setLimit(20);},[query,filter]);
 const songs=value?rankSearch(term,value.items,value.candidates).items:[],albums=value?rankSearch(term,value.albums,value.candidates).items:[];
 const artists=value?[...value.candidates].sort((a,b)=>Number(b.name.toLocaleLowerCase()===term.toLocaleLowerCase())-Number(a.name.toLocaleLowerCase()===term.toLocaleLowerCase())):[];
 const size=filter==='all'?5:limit;
 return <section className="ios-catalog-search"><h1>{text.search}</h1><div className="ios-search-field"><Search aria-hidden="true"/><input ref={inputRef} type="search" aria-label={t.searchHint} placeholder={t.searchHint} value={query} onChange={event=>setQuery(event.target.value)} maxLength={200} autoComplete="off" enterKeyHint="search" onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();}}/>{query&&<IconButton label={text.clearSearch} onClick={()=>{setQuery('');inputRef.current?.focus();}}><X size={20}/></IconButton>}</div>
  <div className="ios-catalog-filters" role="group" aria-label={t.filter}>{(['all','songs','albums','artists'] as const).map(type=><button key={type} aria-pressed={filter===type} onClick={()=>setFilter(type)}>{t[type]}</button>)}</div>
  {term.length<3?<Empty title={t.searchIntro} body={term?text.minimum:t.searchBody}/>:!value?<Feedback query={request} t={t}/>:<div aria-label={t.results}>
   {(filter==='all'||filter==='artists')&&artists.length>0&&<section><div className="ios-section-title"><h2>{t.artists}</h2>{filter==='all'&&artists.length>3&&<button onClick={()=>setFilter('artists')}>{t.showAll}<ChevronRight size={16}/></button>}</div><ResourceShelf items={artists.slice(0,filter==='all'?3:limit)} t={t} onOpen={onOpen} list/></section>}
   {(filter==='all'||filter==='songs')&&songs.length>0&&<section><div className="ios-section-title"><h2>{t.songs}</h2>{filter==='all'&&songs.length>size&&<button onClick={()=>setFilter('songs')}>{t.showAll}<ChevronRight size={16}/></button>}</div>{songs.slice(0,size).map((track,index)=><SongRow key={`${track.videoId}:${index}`} track={track} text={text} active={currentId===track.videoId} onPlay={()=>onPlay(songs,index)} onMore={()=>onMore(track)}/>)}</section>}
   {(filter==='all'||filter==='albums')&&<section>{albums.length>0&&<><div className="ios-section-title"><h2>{t.albums}</h2>{filter==='all'&&albums.length>4&&<button onClick={()=>setFilter('albums')}>{t.showAll}<ChevronRight size={16}/></button>}</div><ResourceShelf items={albums.slice(0,filter==='all'?4:limit)} t={t} onOpen={onOpen}/></>}{value.albumsUnavailable&&<aside className="ios-catalog-note" role="status"><p>{t.albumSearchPartial}</p><button onClick={request.retry}>{t.retry}</button></aside>}</section>}
   {(filter==='all'?songs.length+albums.length+artists.length:filter==='songs'?songs.length:filter==='albums'?albums.length:artists.length)===0&&<Empty title={t.nothing} body={text.tryQuery}/>}
   {filter!=='all'&&(filter==='songs'?songs.length:filter==='albums'?albums.length:artists.length)>limit&&<button className="ios-show-more" onClick={()=>setLimit(n=>n+20)}>{t.showMore}</button>}
   {value.truncated&&<p className="ios-catalog-note">{t.bounded}</p>}
  </div>}
 </section>;
}
function SavedButton({resource,library,t}:{resource:MobileResource;library:LibraryController;t:CatalogCopy}){
 const saved=Boolean(library.value?.follows.some(item=>item.kind===resource.kind&&item.id===resource.id));
 // Persist only the reviewed public identity; detail entries and provider payloads never reach the store.
 const identity:MobileResource={id:resource.id,name:resource.name,kind:resource.kind,artwork:resource.artwork?.startsWith('https:')?resource.artwork:null,...(resource.artists?{artists:resource.artists}:{}),...(resource.year?{year:resource.year}:{})};
 return <button className={`ios-catalog-action${saved?' is-saved':''}`} disabled={!library.value||library.busy} aria-pressed={saved} onClick={()=>void library.command({type:'follow',resource:identity,followed:!saved},saved?t.removedNotice:t.savedNotice)}>{saved?<Check/>:<Heart/>}<span>{saved?t.saved:t.save}</span></button>;
}
function Album({value,library,...props}:Common&{value:AlbumDetail;library:LibraryController}){
 const {t,text,currentId,onPlay,onOpen,onMore}=props,[limit,setLimit]=useState(50);
 const playable=value.entries.flatMap(entry=>entry.track?[entry.track]:[]),availableIndex=(number:number)=>value.entries.slice(0,number-1).filter(entry=>entry.track).length;
 return <>
  <div className="ios-album-identity"><Artwork src={value.artwork} large eager/><div><h1 tabIndex={-1}>{value.name}</h1><div className="ios-catalog-credits">{value.artists?.map(person=><button key={person.id} onClick={()=>onOpen({...person,kind:'artist'})}>{person.name}</button>)}</div><p className="ios-catalog-meta">{[value.year,t.songCount(value.reportedCount??value.entries.length)].filter(Boolean).join(' · ')}</p><button className="ios-primary ios-album-play" disabled={!playable.length} onClick={()=>onPlay(playable,0)}><Play fill="currentColor"/>{t.play}</button>
  <div className="ios-catalog-actions"><button className="ios-catalog-action" disabled={!playable.length} onClick={()=>onPlay(playable,Math.floor(Math.random()*playable.length),true)}><Shuffle/><span>{t.shuffle}</span></button><SavedButton resource={value} library={library} t={t}/><button className="ios-catalog-action" disabled={!value.artists?.length} onClick={()=>props.onPeople(value.artists)}><MoreHorizontal/><span>{t.more}</span></button></div></div></div>
  {value.incomplete&&<p className="ios-catalog-note" role="status">{t.partial}</p>}
  <ol className="ios-album-tracks">{value.entries.slice(0,limit).map(entry=><li key={entry.number} className={entry.track?.videoId===currentId?'is-current':undefined}><span className="ios-album-number" aria-label={t.trackPosition(entry.number)}>{entry.number}</span>{entry.track?<><button className="ios-album-song" onClick={()=>onPlay(playable,availableIndex(entry.number))} aria-label={`${text.play}: ${entry.title}`}><strong>{entry.title}</strong><small>{entry.track.artist}</small></button><span className="ios-album-duration">{mobileTime(entry.duration)}</span><IconButton label={`${text.more}: ${entry.title}`} onClick={()=>onMore(entry.track!)}><MoreHorizontal/></IconButton></>:<div className="ios-album-song is-unavailable"><strong>{entry.title}</strong><small>{t.unavailable}</small></div>}</li>)}</ol>
  {!value.entries.length&&<Empty title={t.noSongs} body=""/>}
  {limit<value.entries.length&&<button className="ios-show-more" onClick={()=>setLimit(n=>n+50)}>{t.showMore}</button>}
 </>;
}
function Artist({value,library,onView,...props}:Common&{value:ArtistDetail;library:LibraryController;onView:(view:'albums'|'singles'|'songs')=>void}){
 const {t,text,onOpen,onMore,onPlay,currentId}=props;
 return <><div className="ios-artist-identity"><Artwork src={value.artwork} large eager/><small className="ios-catalog-eyebrow">{t.artist}</small><h1 tabIndex={-1}>{value.name}</h1><div className="ios-artist-actions"><button className="ios-primary" disabled={!value.tracks.length} onClick={()=>onPlay(value.tracks,0)}><Play fill="currentColor"/>{t.play}</button><SavedButton resource={value} library={library} t={t}/></div></div>
  {(['albums','singles'] as const).map(section=><section key={section}><div className="ios-section-title"><h2>{t[section]}</h2>{(value[section].length>4||value[section==='albums'?'moreAlbums':'moreSingles'])&&<button onClick={()=>onView(section)}>{t.showAll}<ChevronRight size={16}/></button>}</div>{value[section].length?<ResourceShelf items={value[section].slice(0,4)} t={t} onOpen={onOpen}/>:<p className="ios-muted">{t.noAlbums}</p>}</section>)}
  <section><div className="ios-section-title"><h2>{t.songs}</h2><button onClick={()=>onView('songs')}>{t.showAll}<ChevronRight size={16}/></button></div>{value.tracks.length?value.tracks.slice(0,5).map((track,index)=><SongRow key={`${track.videoId}:${index}`} track={track} text={text} active={currentId===track.videoId} onPlay={()=>onPlay(value.tracks,index)} onMore={()=>onMore(track)}/>):<p className="ios-muted">{t.noSongs}</p>}</section>
  {value.description&&<p className="ios-artist-description">{value.description}</p>}
 </>;
}
function ArtistCollection({route,enabled,...props}:Common&{route:ResourceRoute;enabled:boolean}){
 const {t,text,loading,onOpen,onPlay,onMore,currentId}=props,[limit,setLimit]=useState(30),view=route.view!;
 const query=useCatalog(view==='songs'?{operation:'artist-search',kind:'artist',id:route.id,query:'',searchKind:'track'}:{operation:'releases',kind:'artist',id:route.id,section:view},loading,enabled);
 const value=query.value as CatalogReleases|CatalogArtistSearch|null;
 return <><h1 tabIndex={-1}>{t[view]}</h1>{!value?<Feedback query={query} t={t}/>:<>{view==='songs'?(value.items as NativeTrack[]).slice(0,limit).map((track,index)=><SongRow key={`${track.videoId}:${index}`} track={track} text={text} active={currentId===track.videoId} onPlay={()=>onPlay(value.items as NativeTrack[],index)} onMore={()=>onMore(track)}/>):<ResourceShelf items={(value.items as MobileResource[]).slice(0,limit)} t={t} onOpen={onOpen}/ >}{!value.items.length&&<Empty title={view==='songs'?t.noSongs:t.noAlbums} body=""/>}{limit<value.items.length&&<button className="ios-show-more" onClick={()=>setLimit(n=>n+30)}>{t.showMore}</button>}{value.truncated&&<p className="ios-catalog-note">{t.bounded}</p>}<button className="ios-text" onClick={query.retry}><RefreshCw size={16}/>{t.refresh}</button></>}</>;
}
export function CatalogPage({route,library,onBack,onView,enabled,...props}:Common&{route:ResourceRoute;library:LibraryController;onBack:()=>void;onView:(view:'albums'|'singles'|'songs')=>void;enabled:boolean}){
 const query=useCatalog(!route.view?{operation:'detail',kind:route.kind,id:route.id}:null,props.loading,enabled),root=useRef<HTMLElement>(null);
 useEffect(()=>{const frame=requestAnimationFrame(()=>root.current?.querySelector<HTMLElement>('h1')?.focus({preventScroll:true}));return()=>cancelAnimationFrame(frame);},[route.kind,route.id,route.view,query.phase]);
 return <section ref={root} className="ios-catalog-page" data-testid="catalog-page">
  {route.view?<ArtistCollection key={`${route.id}:${route.view}`} route={route} enabled={enabled} {...props}/>:!query.value?<Feedback query={query} t={props.t}/>:query.value&&'kind' in query.value&&query.value.kind==='album'?<Album key={route.id} value={query.value as AlbumDetail} library={library} {...props}/>:<Artist key={route.id} value={query.value as ArtistDetail} library={library} onView={onView} {...props}/>}
  {!route.view&&query.value&&<button className="ios-text ios-catalog-refresh" onClick={query.retry}><RefreshCw size={16}/>{props.t.refresh}</button>}
 </section>;
}
