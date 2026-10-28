import {useCallback,useEffect,useRef,useState,useSyncExternalStore,type CSSProperties} from 'react';
import {ChevronLeft,ArrowRight,Check,Heart,Home,LibraryBig,LoaderCircle,MoreHorizontal,Search,Settings,X} from 'lucide-react';
import {emptyMobilePlayback,type MobileCommand,type MobilePlayback,type MobileResource,type NativeTrack} from '../../../../packages/domain/mobile';
import {acceptPlaybackSnapshot} from '../../../../packages/domain/playback-snapshot';
import {localization} from '../../../../packages/i18n/mobile';
import type {LanguageController} from '../../../../packages/i18n/host';
import {foundationBridge as bridge} from './native';
import {parseFoundationStatus,type FoundationStatus} from './contract';
import {iosCopy,friendlyError} from './copy';
import {Artwork,Empty,IconButton,MiniPlayer,Sheet,SongRow,Toggle} from './components';
import {Player} from './player';
import {LyricsReader} from './lyrics';
import {lyricsCopy} from './lyrics-copy';
import {IOSStoryComposer} from './story-sharing';
import {storyCopy} from './story-copy';
import type {LyricsDocument} from '../../../../packages/domain/lyrics';
import {Queue,upcoming} from './queue';
import {LibraryPane,PlaylistForm,AddToPlaylist,type PlaylistContext} from './library';
import {libraryCopy} from './library-copy';
import {useLibrary} from './use-library';
import {CatalogPage,CatalogSearch,type ResourceRoute} from './catalog';
import {catalogCopy} from './catalog-copy';
import './app.css';
import './catalog.css';
import './lyrics.css';
import './story-sharing.css';

type Menu={track:NativeTrack;index?:number;revision:number;current:number;playlist?:PlaylistContext};
export function App({controller}:{controller:LanguageController}){
 const language=useSyncExternalStore(localization.subscribe,localization.getSnapshot),text=iosCopy[language.language==='it'?'it':'en'];
 const [state,setState]=useState<MobilePlayback>(emptyMobilePlayback),[connected,setConnected]=useState(false),[tab,setTab]=useState<'home'|'search'|'library'>('home'),[overlay,setOverlay]=useState<'player'|'queue'|'lyrics'|'settings'|null>(null),[menu,setMenu]=useState<Menu|null>(null),[status,setStatus]=useState<FoundationStatus|null>(null),[message,setMessage]=useState('');
 const [libraryModal,setLibraryModal]=useState(false),[addTrack,setAddTrack]=useState<NativeTrack|null>(null),[queueForm,setQueueForm]=useState<number|null>(null),playIntent=useRef(0);
 const libraryText=libraryCopy[language.language==='it'?'it':'en'];
 const [query,setQuery]=useState(''),[route,setRoute]=useState<ResourceRoute|null>(null),[artistChoices,setArtistChoices]=useState<MobileResource[]>([]),[boundedPlay,setBoundedPlay]=useState<{items:NativeTrack[];index:number;shuffle:boolean}|null>(null);
 const catalogText=catalogCopy[language.language==='it'?'it':'en'];
 const lyricText=lyricsCopy[language.language==='it'?'it':'en'];
 const shareText=storyCopy[language.language==='it'?'it':'en'];
 const [sharing,setSharing]=useState<{track:NativeTrack;mode:'track'|'lyrics';document?:LyricsDocument}|null>(null);
 function openSharing(mode:'track'|'lyrics',document?:LyricsDocument){if(!current)return;setSharing({track:JSON.parse(JSON.stringify(current)),mode,...(document?{document:JSON.parse(JSON.stringify(document))}:{})});}
 const [motion,setMotion]=useState(()=>{try{return localStorage.getItem('ritvio.ios.reduce-motion')==='true';}catch{return false;}}),[languageBusy,setLanguageBusy]=useState(false);
 const current=state.items[state.index],future=upcoming(state),searchRef=useRef<HTMLInputElement>(null),notice=useRef(0),root=useRef<HTMLDivElement>(null);
 const apply=useCallback((value:MobilePlayback)=>{setState(previous=>acceptPlaybackSnapshot(previous,value));setConnected(true);},[]);
 useEffect(()=>{document.documentElement.lang=language.language;},[language.language]);
 function announce(value:string){window.clearTimeout(notice.current);setMessage(value);notice.current=window.setTimeout(()=>setMessage(''),5000);}
 useEffect(()=>{window.clearTimeout(notice.current);setMessage('');},[query]);
 const library=useLibrary(Boolean(status?.capabilities.library),libraryText,announce);
 const liked=(track:NativeTrack)=>Boolean(library.value?.likes.some(item=>item.videoId===track.videoId));
 function toggleLike(track:NativeTrack){const next=!liked(track);void library.command({type:'like',track,liked:next},next?libraryText.savedSong:libraryText.unsavedSong);}
 useEffect(()=>{
  let disposed=false,listener:{remove:()=>Promise<void>}|undefined;
  void bridge.addListener('playback',value=>{if(!disposed)apply(value);}).then(value=>{if(disposed)void value.remove();else listener=value;}).catch(()=>{if(!disposed)setConnected(false);});
  function refresh(){if(document.visibilityState==='hidden')return;void bridge.snapshot().then(value=>{if(!disposed)apply(value);}).catch(()=>{if(!disposed)setConnected(false);});void bridge.foundationStatus().then(parseFoundationStatus).then(value=>{if(!disposed)setStatus(value);}).catch(()=>{});}
  refresh();
  document.addEventListener('visibilitychange',refresh);window.addEventListener('focus',refresh);
  return()=>{disposed=true;void listener?.remove();document.removeEventListener('visibilitychange',refresh);window.removeEventListener('focus',refresh);};
 },[apply]);
 useEffect(()=>{const viewport=window.visualViewport;let active=true,timer=0;function size(){document.documentElement.style.setProperty('--ios-height',`${viewport?.height??window.innerHeight}px`);window.clearTimeout(timer);timer=window.setTimeout(()=>{void bridge.foundationStatus().then(parseFoundationStatus).then(value=>{if(active)setStatus(value);}).catch(()=>{});},80);}size();viewport?.addEventListener('resize',size);window.addEventListener('resize',size);return()=>{active=false;window.clearTimeout(timer);viewport?.removeEventListener('resize',size);window.removeEventListener('resize',size);document.documentElement.style.removeProperty('--ios-height');window.clearTimeout(notice.current);};},[]);
 useEffect(()=>{
  function restore(){const value=history.state?.ritvioCatalog;setRoute(value&&['album','artist'].includes(value.kind)&&typeof value.id==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value.id)?value:null);if(['home','search','library'].includes(history.state?.ritvioTab))setTab(history.state.ritvioTab);requestAnimationFrame(()=>requestAnimationFrame(()=>{const area=root.current?.querySelector('.ios-content');if(area)area.scrollTop=Number(history.state?.ritvioScroll)||0;}));}
  history.replaceState({...history.state,ritvioTab:tab},'');window.addEventListener('popstate',restore);return()=>window.removeEventListener('popstate',restore);
 },[]);
 useEffect(()=>{if(!route)return;const timer=window.setTimeout(()=>{void bridge.navigationState({canGoBack:!overlay&&!menu&&!artistChoices.length&&!boundedPlay}).catch(()=>{});},0);return()=>{window.clearTimeout(timer);void bridge.navigationState({canGoBack:false}).catch(()=>{});};},[route,overlay,menu,artistChoices.length,boundedPlay]);
 function navigate(value:ResourceRoute){const scroll=root.current?.querySelector('.ios-content')?.scrollTop??0;history.replaceState({...history.state,ritvioTab:tab,ritvioScroll:scroll},'');history.pushState({...history.state,ritvioCatalog:value,ritvioScroll:0},'');setRoute(value);setOverlay(null);setMenu(null);setArtistChoices([]);requestAnimationFrame(()=>{const area=root.current?.querySelector('.ios-content');if(area)area.scrollTop=0;});}
 function openResource(value:Pick<MobileResource,'id'|'kind'>){navigate({kind:value.kind,id:value.id});}
 function selectTab(value:'home'|'search'|'library'){history.replaceState({...history.state,ritvioCatalog:null,ritvioTab:value,ritvioLibrary:null,ritvioScroll:0},'');setRoute(null);setTab(value);requestAnimationFrame(()=>{const area=root.current?.querySelector('.ios-content');if(area)area.scrollTop=0;});}
 function openArtists(track:NativeTrack){const people=(track.artists??[]).filter(person=>person.id);if(people.length===1)openResource({...people[0],kind:'artist'});else if(people.length){setArtistChoices(people.map(person=>({...person,kind:'artist',artwork:null})));setMenu(null);}}
 useEffect(()=>{if(menu&&(menu.revision!==state.queueRevision||menu.current!==state.index))setMenu(null);},[state.queueRevision,state.index,menu]);
 useEffect(()=>{if(menu?.playlist&&library.value?.playlists.find(item=>item.id===menu.playlist!.id)?.revision!==menu.playlist.revision)setMenu(null);},[menu,library.value]);
 useEffect(()=>{if((overlay==='player'||overlay==='lyrics')&&!current)setOverlay(null);},[overlay,current]);
 async function send(command:MobileCommand){try{apply(await bridge.command(command));return true;}catch(error){announce(friendlyError(error,text));if(String((error as {code?:string})?.code).includes('QUEUE_CHANGED'))void bridge.snapshot().then(apply).catch(()=>{});return false;}}
 async function play(track:NativeTrack){playIntent.current++;try{apply(await bridge.playTracks({items:[track],index:0}));}catch(error){announce(friendlyError(error,text));}}
 async function playCollection(items:NativeTrack[],index:number,shuffle=false){if(items.length>500){setBoundedPlay({items,index,shuffle});return;}const intent=++playIntent.current;try{apply(await bridge.playTracks({items,index}));if(intent===playIntent.current)apply(await bridge.command({type:'shuffle',value:shuffle}));}catch(error){announce(friendlyError(error,text));}}
 async function enqueue(track:NativeTrack,next:boolean){try{apply(await bridge.enqueue({track,next}));announce(text.added);}catch(error){announce(friendlyError(error,text));}}
 function showMenu(track:NativeTrack,index?:number,playlist?:PlaylistContext){setMenu({track,index,revision:state.queueRevision??0,current:state.index,playlist});}
 function toggle(){void send({type:state.playing||state.loading?'pause':'play'});}
 async function changeLanguage(value:'en'|'it'|'system'){setLanguageBusy(true);try{await controller.setPreference(value);}catch{announce(text.languageError);}finally{setLanguageBusy(false);}}
 function openSearch(){selectTab('search');requestAnimationFrame(()=>searchRef.current?.focus());}
 function moveMenu(direction:number){if(menu?.index===undefined)return;const at=future.indexOf(menu.index),to=future[at+direction];if(to!==undefined)void send({type:'move',value:{from:menu.index,to,revision:menu.revision}});setMenu(null);}
 const backgroundHidden=Boolean(overlay||menu||libraryModal||addTrack||queueForm!==null||artistChoices.length||boundedPlay||sharing),coveringPlayer=Boolean(menu||addTrack||queueForm!==null||artistChoices.length||boundedPlay||sharing);
 const menuPlaylist=menu?.playlist?library.value?.playlists.find(item=>item.id===menu.playlist!.id):undefined;
 function movePlaylist(direction:number){const context=menu?.playlist;if(!context)return;void library.command({type:'move',id:context.id,revision:context.revision,from:context.index,to:context.index+direction});setMenu(null);}
 return <div ref={root} data-large-text={(status?.textScale??1)>1.4||undefined} className={`ios-app${motion?' ios-reduce-motion':''}`} style={{'--ios-text-scale':status?.textScale??1,'--ios-native-safe-top':`${status?.safeArea?.top??0}px`,'--ios-native-safe-right':`${status?.safeArea?.right??0}px`,'--ios-native-safe-bottom':`${status?.safeArea?.bottom??0}px`,'--ios-native-safe-left':`${status?.safeArea?.left??0}px`,'--ios-notice-bottom':`${overlay==='queue'?104:overlay?20:current?154:84}px`} as CSSProperties}>
  <div className="ios-shell" aria-hidden={backgroundHidden||undefined}>
   <header className={`ios-header${route?' has-catalog':''}`}>{route&&<IconButton label={catalogText.back} onClick={()=>history.back()}><ChevronLeft/></IconButton>}<span className="ios-brand">RITVIO</span>{!route&&<IconButton label={text.settings} onClick={()=>setOverlay('settings')}><Settings/></IconButton>}</header>
   <main className="ios-content">
    <div hidden={Boolean(route)} key={tab}>
    {tab==='home'?<>
     <h1>{text.listening}</h1>
     {!connected?<div className="ios-connection"><p>{text.opening}</p><button className="ios-text" onClick={()=>void bridge.snapshot().then(apply).catch(()=>announce(text.operationError))}>{text.retry}</button></div>:current?<>
      <section className="ios-resume"><button className="ios-resume-main" aria-label={`${text.openPlayer}: ${current.title}`} onClick={()=>setOverlay('player')}><Artwork src={current.thumbnail} large eager/><span className="ios-identity"><small>{state.playing?text.playing:text.resume}</small><strong>{current.title}</strong><span>{current.artist}</span></span></button><Toggle large state={state} text={text} onToggle={toggle}/><div className="ios-resume-progress" aria-hidden="true"><span style={{width:`${state.duration>0?Math.min(100,state.position/state.duration*100):0}%`}}/></div></section>
      <div className="ios-section-title"><h2>{text.upNext}</h2><button onClick={()=>setOverlay('queue')}>{text.queue}<ArrowRight size={16}/></button></div>
      {future.length?future.slice(0,3).map(index=><SongRow key={`${state.queueRevision}:${index}`} track={state.items[index]} text={text} onPlay={()=>void send({type:'jump',value:index})} onMore={()=>showMenu(state.items[index],index)}/>):<p className="ios-muted">{text.emptyQueueBody}</p>}
      <button className="ios-find" onClick={openSearch}><Search size={20}/>{text.find}<ArrowRight size={18}/></button>
     </>:<Empty title={text.emptyTitle} body={text.emptyBody}><button className="ios-primary" onClick={openSearch}>{text.search}<ArrowRight size={18}/></button></Empty>}
    </>:tab==='search'?<CatalogSearch query={query} setQuery={setQuery} inputRef={searchRef} enabled={!route&&!backgroundHidden} t={catalogText} text={text} loading={state.loading} currentId={current?.videoId} onOpen={openResource} onPeople={people=>setArtistChoices((people??[]).map(person=>({...person,kind:'artist',artwork:null})))} onMore={showMenu} onPlay={(items,index,shuffle)=>void playCollection(items,index,shuffle)}/>    :<LibraryPane library={library} t={libraryText} text={text} currentId={current?.videoId} active={!route&&!overlay&&!menu&&!addTrack&&queueForm===null} onModalChange={setLibraryModal} onFind={openSearch} onPlay={(items,index,shuffle)=>void playCollection(items,index,shuffle)} onMore={(track,context)=>showMenu(track,undefined,context)} announce={announce} catalogText={catalogText} onOpenResource={openResource}/>}
    </div>
    {route&&<CatalogPage key={`${route.kind}:${route.id}:${route.view??''}`} route={route} library={library} t={catalogText} text={text} loading={state.loading} enabled={!backgroundHidden} currentId={current?.videoId} onBack={()=>history.back()} onView={view=>navigate({...route,view})} onOpen={openResource} onPeople={people=>setArtistChoices((people??[]).map(person=>({...person,kind:'artist',artwork:null})))} onMore={showMenu} onPlay={(items,index,shuffle)=>void playCollection(items,index,shuffle)}/>}
   </main>
   {current&&<MiniPlayer state={state} text={text} onOpen={()=>setOverlay('player')} onToggle={toggle} onNext={()=>void send({type:'next'})}/>}
   <nav className="ios-tabs" aria-label="RITVIO"><button aria-current={tab==='home'?'page':undefined} onClick={()=>selectTab('home')}><Home fill={tab==='home'?'currentColor':'none'}/><span>{text.home}</span></button><button aria-current={tab==='search'?'page':undefined} onClick={()=>selectTab('search')}><Search/><span>{text.search}</span></button>{status?.capabilities.library&&<button aria-current={tab==='library'?'page':undefined} onClick={()=>selectTab('library')}><LibraryBig/><span>{libraryText.library}</span></button>}</nav>
  </div>
  {overlay==='player'&&current&&<div aria-hidden={coveringPlayer?true:undefined}><Player state={state} text={text} send={command=>void send(command)} onClose={()=>setOverlay(null)} onQueue={()=>setOverlay('queue')} onLyrics={status?.capabilities.lyrics?()=>setOverlay('lyrics'):undefined} lyricsLabel={lyricText.open} lyricsTitle={lyricText.title} onShare={status?.capabilities.sharing?()=>openSharing('track'):undefined} shareLabel={shareText.open} shareTitle={shareText.share} onAlbum={current.album?.id?()=>openResource({...current.album!,kind:'album'}):undefined} onArtists={current.artists?.some(person=>person.id)?()=>openArtists(current):undefined} libraryActions={library.value?<><IconButton label={liked(current)?libraryText.unlike:libraryText.like} disabled={library.busy} pressed={liked(current)} className={liked(current)?'is-liked':''} onClick={()=>toggleLike(current)}><Heart fill={liked(current)?'currentColor':'none'}/></IconButton><IconButton label={text.more} onClick={()=>showMenu(current)}><MoreHorizontal/></IconButton></>:undefined}/></div>}
  {overlay==='lyrics'&&current&&<div aria-hidden={Boolean(sharing)||undefined}><LyricsReader enabled={!sharing} state={state} text={text} t={lyricText} send={command=>void send(command)} onShare={status?.capabilities.sharing?document=>openSharing('lyrics',document):undefined} shareLabel={shareText.openLyrics} onClose={()=>setOverlay('player')}/></div>}
  {sharing&&<IOSStoryComposer track={sharing.track} initialMode={sharing.mode} initialDocument={sharing.document} t={shareText} onClose={()=>setSharing(null)}/>}
  {overlay==='queue'&&<div aria-hidden={coveringPlayer?true:undefined}><Queue state={state} text={text} send={send} onClose={()=>setOverlay(current?'player':null)} onMore={index=>showMenu(state.items[index],index)} onOpenPlayer={()=>setOverlay('player')} announce={announce} onSave={library.value&&state.items.length?()=>setQueueForm(state.queueRevision??0):undefined} saveLabel={libraryText.queueSave}/></div>}
  {overlay==='settings'&&<Sheet title={text.settings} closeLabel={text.done} closeText onClose={()=>setOverlay(null)} className="ios-settings"><div className="ios-settings-scroll"><section><h3>{text.language}</h3>{(['en','it','system'] as const).map(value=><button key={value} className="ios-setting-row" aria-pressed={language.preference===value} disabled={languageBusy} onClick={()=>void changeLanguage(value)}><span>{value==='en'?'English':value==='it'?'Italiano':text.system}</span>{language.preference===value&&<Check/>}</button>)}</section><section><h3>{text.motion}</h3><label className="ios-setting-row"><span>{text.motion}</span><input className="ios-switch" type="checkbox" role="switch" checked={motion} onChange={event=>{setMotion(event.target.checked);try{localStorage.setItem('ritvio.ios.reduce-motion',String(event.target.checked));}catch{}}}/></label><p>{text.motionBody}</p></section><section><h3>{text.about}</h3><dl><div><dt>{text.version}</dt><dd>{status?`${status.version} (${status.build})`:'—'}</dd></div><div><dt>{text.stage}</dt><dd>{status?.phase??'—'}</dd></div><div><dt>{text.connection}</dt><dd>{connected?text.ready:text.unavailable}</dd></div></dl><p>{text.scope}</p></section><section><h3>{text.sources}</h3><p>{text.sourceBody}</p></section></div></Sheet>}
  {menu&&<Sheet title={menu.track.title} closeLabel={text.cancel} onClose={()=>setMenu(null)} className="ios-menu"><p className="ios-menu-artist">{menu.track.artist}</p>
   {menu.track.album?.id&&<button onClick={()=>openResource({...menu.track.album!,kind:'album'})}>{catalogText.openAlbum}: {menu.track.album.name}</button>}
   {menu.track.artists?.some(person=>person.id)&&<button onClick={()=>openArtists(menu.track)}>{catalogText.openArtist}</button>}
   {library.value&&<><button disabled={library.busy} onClick={()=>{toggleLike(menu.track);setMenu(null);}}><Heart aria-hidden="true" size={20} fill={liked(menu.track)?'currentColor':'none'}/>{liked(menu.track)?libraryText.unlike:libraryText.like}</button><button onClick={()=>{setAddTrack(menu.track);setMenu(null);}}>{libraryText.add}</button></>}
   {menu.index===undefined?<><button onClick={()=>{void enqueue(menu.track,true);setMenu(null);}}>{text.playNext}</button><button onClick={()=>{void enqueue(menu.track,false);setMenu(null);}}>{text.addQueue}</button></>:<><button onClick={()=>moveMenu(-1)} disabled={future.indexOf(menu.index)<=0}>{text.moveUp}</button><button onClick={()=>moveMenu(1)} disabled={future.indexOf(menu.index)<0||future.indexOf(menu.index)>=future.length-1}>{text.moveDown}</button><button onClick={()=>{void send({type:'remove',value:{index:menu.index!,revision:menu.revision}});setMenu(null);}}>{text.remove}</button></>}
   {menu.playlist&&menuPlaylist&&<><button disabled={library.busy||menu.playlist.index<=0} onClick={()=>movePlaylist(-1)}>{libraryText.moveUp}</button><button disabled={library.busy||menu.playlist.index>=menuPlaylist.items.length-1} onClick={()=>movePlaylist(1)}>{libraryText.moveDown}</button><button disabled={library.busy} onClick={()=>{const context=menu.playlist!;void library.command({type:'remove',id:context.id,revision:context.revision,index:context.index},libraryText.removed);setMenu(null);}}>{libraryText.removeSong}</button></>}
  </Sheet>}
  {artistChoices.length>0&&<Sheet title={catalogText.chooseArtist} closeLabel={text.cancel} onClose={()=>setArtistChoices([])} className="ios-menu">{artistChoices.map(person=><button key={person.id} onClick={()=>openResource(person)}>{person.name}</button>)}</Sheet>}
  {boundedPlay&&<Sheet title={catalogText.queueLimitTitle} closeLabel={text.cancel} onClose={()=>setBoundedPlay(null)} className="ios-confirm"><p>{catalogText.queueLimitBody}</p><button className="ios-primary" onClick={()=>{const value=boundedPlay;setBoundedPlay(null);const start=Math.min(value.index,Math.max(0,value.items.length-500)),items=value.items.slice(start,start+500);void playCollection(items,value.index-start,value.shuffle);}}>{catalogText.continue}</button></Sheet>}
  {current&&state.error&&<aside className="ios-playback-error" role="alert"><span>{/RATE_LIMIT/.test(state.error)?text.rateLimit:text.playbackError}</span><button onClick={()=>void send({type:'retry'})}>{text.retryPlayback}</button></aside>}
  {addTrack&&<AddToPlaylist track={addTrack} library={library} t={libraryText} onClose={()=>setAddTrack(null)}/>}
  {queueForm!==null&&<PlaylistForm library={library} t={libraryText} queueRevision={queueForm} onClose={()=>setQueueForm(null)}/>}
  <div className={`ios-notice${message?' is-visible':''}`} role="status" aria-live="polite">{message}</div>
 </div>;
}
