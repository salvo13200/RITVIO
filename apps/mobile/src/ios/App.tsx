import {useCallback,useEffect,useRef,useState,useSyncExternalStore,type CSSProperties} from 'react';
import {ArrowRight,Check,Home,LoaderCircle,Search,Settings,X} from 'lucide-react';
import {emptyMobilePlayback,type MobileCommand,type MobilePlayback,type NativeTrack} from '../../../../packages/domain/mobile';
import {acceptPlaybackSnapshot} from '../../../../packages/domain/playback-snapshot';
import {localization} from '../../../../packages/i18n/mobile';
import type {LanguageController} from '../../../../packages/i18n/host';
import {foundationBridge as bridge} from './native';
import {parseFoundationStatus,type FoundationStatus} from './contract';
import {iosCopy,friendlyError} from './copy';
import {Artwork,Empty,IconButton,MiniPlayer,Sheet,SongRow,Toggle} from './components';
import {Player} from './player';
import {Queue,upcoming} from './queue';
import './app.css';

type Menu={track:NativeTrack;index?:number;revision:number;current:number};
export function App({controller}:{controller:LanguageController}){
 const language=useSyncExternalStore(localization.subscribe,localization.getSnapshot),text=iosCopy[language.language==='it'?'it':'en'];
 const [state,setState]=useState<MobilePlayback>(emptyMobilePlayback),[connected,setConnected]=useState(false),[tab,setTab]=useState<'home'|'search'>('home'),[overlay,setOverlay]=useState<'player'|'queue'|'settings'|null>(null),[menu,setMenu]=useState<Menu|null>(null),[status,setStatus]=useState<FoundationStatus|null>(null),[message,setMessage]=useState('');
 const [query,setQuery]=useState(''),[results,setResults]=useState<NativeTrack[]>([]),[searchState,setSearchState]=useState<'idle'|'loading'|'ready'|'error'>('idle'),[searchError,setSearchError]=useState(''),[searchAttempt,setSearchAttempt]=useState(0);
 const [motion,setMotion]=useState(()=>{try{return localStorage.getItem('ritvio.ios.reduce-motion')==='true';}catch{return false;}}),[languageBusy,setLanguageBusy]=useState(false);
 const current=state.items[state.index],future=upcoming(state),searchRef=useRef<HTMLInputElement>(null),request=useRef(0),notice=useRef(0),root=useRef<HTMLDivElement>(null);
 const apply=useCallback((value:MobilePlayback)=>{setState(previous=>acceptPlaybackSnapshot(previous,value));setConnected(true);},[]);
 function announce(value:string){window.clearTimeout(notice.current);setMessage(value);notice.current=window.setTimeout(()=>setMessage(''),5000);}
 useEffect(()=>{
  let disposed=false,listener:{remove:()=>Promise<void>}|undefined;
  void bridge.addListener('playback',value=>{if(!disposed)apply(value);}).then(value=>{if(disposed)void value.remove();else listener=value;}).catch(()=>{if(!disposed)setConnected(false);});
  function refresh(){if(document.visibilityState==='hidden')return;void bridge.snapshot().then(value=>{if(!disposed)apply(value);}).catch(()=>{if(!disposed)setConnected(false);});void bridge.foundationStatus().then(parseFoundationStatus).then(value=>{if(!disposed)setStatus(value);}).catch(()=>{});}
  refresh();
  document.addEventListener('visibilitychange',refresh);window.addEventListener('focus',refresh);
  return()=>{disposed=true;void listener?.remove();document.removeEventListener('visibilitychange',refresh);window.removeEventListener('focus',refresh);};
 },[apply]);
 useEffect(()=>{const viewport=window.visualViewport;function size(){document.documentElement.style.setProperty('--ios-height',`${viewport?.height??window.innerHeight}px`);}size();viewport?.addEventListener('resize',size);window.addEventListener('resize',size);return()=>{viewport?.removeEventListener('resize',size);window.removeEventListener('resize',size);document.documentElement.style.removeProperty('--ios-height');window.clearTimeout(notice.current);};},[]);
 useEffect(()=>{
  const term=query.trim(),id=++request.current;let active=true;
  setResults([]);setSearchError('');if(term.length<3){setSearchState('idle');return;}
  setSearchState('loading');const requestId=`ios-search-${Date.now()}-${id}`;
  const timer=window.setTimeout(()=>{void bridge.search({query:term,requestId}).then(value=>{if(active&&id===request.current){setResults(value.items);setSearchState('ready');}}).catch(error=>{if(active&&id===request.current){setSearchError(friendlyError(error,text,true));setSearchState('error');}});},350);
  return()=>{active=false;window.clearTimeout(timer);void bridge.cancelResolver({requestId}).catch(()=>{});};
 },[query,searchAttempt]);
 useEffect(()=>{if(menu&&(menu.revision!==state.queueRevision||menu.current!==state.index))setMenu(null);},[state.queueRevision,state.index,menu]);
 useEffect(()=>{if(overlay==='player'&&!current)setOverlay(null);},[overlay,current]);
 async function send(command:MobileCommand){try{apply(await bridge.command(command));return true;}catch(error){announce(friendlyError(error,text));if(String((error as {code?:string})?.code).includes('QUEUE_CHANGED'))void bridge.snapshot().then(apply).catch(()=>{});return false;}}
 async function play(track:NativeTrack){try{apply(await bridge.playTracks({items:[track],index:0}));}catch(error){announce(friendlyError(error,text));}}
 async function enqueue(track:NativeTrack,next:boolean){try{apply(await bridge.enqueue({track,next}));announce(text.added);}catch(error){announce(friendlyError(error,text));}}
 function showMenu(track:NativeTrack,index?:number){setMenu({track,index,revision:state.queueRevision??0,current:state.index});}
 function toggle(){void send({type:state.playing||state.loading?'pause':'play'});}
 async function changeLanguage(value:'en'|'it'|'system'){setLanguageBusy(true);try{await controller.setPreference(value);}catch{announce(text.languageError);}finally{setLanguageBusy(false);}}
 function openSearch(){setTab('search');requestAnimationFrame(()=>searchRef.current?.focus());}
 function moveMenu(direction:number){if(menu?.index===undefined)return;const at=future.indexOf(menu.index),to=future[at+direction];if(to!==undefined)void send({type:'move',value:{from:menu.index,to,revision:menu.revision}});setMenu(null);}
 const backgroundHidden=Boolean(overlay||menu);
 return <div ref={root} className={`ios-app${motion?' ios-reduce-motion':''}`} style={{'--ios-text-scale':status?.textScale??1} as CSSProperties}>
  <div className="ios-shell" aria-hidden={backgroundHidden||undefined}>
   <header className="ios-header"><span className="ios-brand">RITVIO</span><IconButton label={text.settings} onClick={()=>setOverlay('settings')}><Settings/></IconButton></header>
   <main className="ios-content" key={tab}>
    {tab==='home'?<>
     <h1>{text.listening}</h1>
     {!connected?<div className="ios-connection"><p>{text.opening}</p><button className="ios-text" onClick={()=>void bridge.snapshot().then(apply).catch(()=>announce(text.operationError))}>{text.retry}</button></div>:current?<>
      <section className="ios-resume"><button className="ios-resume-main" aria-label={`${text.openPlayer}: ${current.title}`} onClick={()=>setOverlay('player')}><Artwork src={current.thumbnail} large eager/><span className="ios-identity"><small>{state.playing?text.playing:text.resume}</small><strong>{current.title}</strong><span>{current.artist}</span></span></button><Toggle large state={state} text={text} onToggle={toggle}/><div className="ios-resume-progress" aria-hidden="true"><span style={{width:`${state.duration>0?Math.min(100,state.position/state.duration*100):0}%`}}/></div></section>
      <div className="ios-section-title"><h2>{text.upNext}</h2><button onClick={()=>setOverlay('queue')}>{text.queue}<ArrowRight size={16}/></button></div>
      {future.length?future.slice(0,3).map(index=><SongRow key={`${state.queueRevision}:${index}`} track={state.items[index]} text={text} onPlay={()=>void send({type:'jump',value:index})} onMore={()=>showMenu(state.items[index],index)}/>):<p className="ios-muted">{text.emptyQueueBody}</p>}
      <button className="ios-find" onClick={openSearch}><Search size={20}/>{text.find}<ArrowRight size={18}/></button>
     </>:<Empty title={text.emptyTitle} body={text.emptyBody}><button className="ios-primary" onClick={openSearch}>{text.search}<ArrowRight size={18}/></button></Empty>}
    </>:<>
     <h1>{text.search}</h1><div className="ios-search-field"><Search aria-hidden="true"/><input ref={searchRef} type="search" aria-label={text.searchHint} placeholder={text.searchHint} value={query} onChange={event=>setQuery(event.target.value)} maxLength={200} autoComplete="off" enterKeyHint="search" onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();}}/>{query&&<IconButton label={text.clearSearch} onClick={()=>{setQuery('');searchRef.current?.focus();}}><X size={20}/></IconButton>}</div>
     {searchState==='idle'?<Empty title={text.searchIntro} body={query.trim()?text.minimum:text.searchBody}/>:searchState==='loading'?<div className="ios-search-loading" role="status"><LoaderCircle className="ios-spinner"/>{text.searching}<div className="ios-skeletons" aria-hidden="true">{[0,1,2,3].map(i=><span key={i}/>)}</div></div>:searchState==='error'?<Empty title={searchError} body=""><button className="ios-primary" onClick={()=>setSearchAttempt(value=>value+1)}>{text.retry}</button></Empty>:results.length?<section><h2 className="ios-results-heading">{text.songs}</h2>{results.map((track,index)=><SongRow key={`${track.videoId}:${index}`} track={track} text={text} active={current?.videoId===track.videoId} onPlay={()=>void play(track)} onMore={()=>showMenu(track)}/>)}</section>:<Empty title={text.noResults} body={text.tryQuery}/>}
    </>}
   </main>
   {current&&<MiniPlayer state={state} text={text} onOpen={()=>setOverlay('player')} onToggle={toggle} onNext={()=>void send({type:'next'})}/>}
   <nav className="ios-tabs" aria-label="RITVIO"><button aria-current={tab==='home'?'page':undefined} onClick={()=>setTab('home')}><Home fill={tab==='home'?'currentColor':'none'}/><span>{text.home}</span></button><button aria-current={tab==='search'?'page':undefined} onClick={()=>setTab('search')}><Search/><span>{text.search}</span></button></nav>
  </div>
  {overlay==='player'&&current&&<div aria-hidden={menu?true:undefined}><Player state={state} text={text} send={command=>void send(command)} onClose={()=>setOverlay(null)} onQueue={()=>setOverlay('queue')}/></div>}
  {overlay==='queue'&&<div aria-hidden={menu?true:undefined}><Queue state={state} text={text} send={send} onClose={()=>setOverlay(current?'player':null)} onMore={index=>showMenu(state.items[index],index)} onOpenPlayer={()=>setOverlay('player')} announce={announce}/></div>}
  {overlay==='settings'&&<Sheet title={text.settings} closeLabel={text.done} onClose={()=>setOverlay(null)} className="ios-settings"><div className="ios-settings-scroll"><section><h3>{text.language}</h3>{(['en','it','system'] as const).map(value=><button key={value} className="ios-setting-row" aria-pressed={language.preference===value} disabled={languageBusy} onClick={()=>void changeLanguage(value)}><span>{value==='en'?'English':value==='it'?'Italiano':text.system}</span>{language.preference===value&&<Check/>}</button>)}</section><section><h3>{text.motion}</h3><label className="ios-setting-row"><span>{text.motion}</span><input type="checkbox" checked={motion} onChange={event=>{setMotion(event.target.checked);try{localStorage.setItem('ritvio.ios.reduce-motion',String(event.target.checked));}catch{}}}/></label><p>{text.motionBody}</p></section><section><h3>{text.about}</h3><dl><div><dt>{text.version}</dt><dd>{status?`${status.version} (${status.build})`:'—'}</dd></div><div><dt>{text.stage}</dt><dd>{status?.phase??'—'}</dd></div><div><dt>{text.connection}</dt><dd>{connected?text.ready:text.unavailable}</dd></div></dl><p>{text.scope}</p></section><section><h3>{text.sources}</h3><p>{text.sourceBody}</p></section></div></Sheet>}
  {menu&&<Sheet title={menu.track.title} closeLabel={text.cancel} onClose={()=>setMenu(null)} className="ios-menu"><p className="ios-menu-artist">{menu.track.artist}</p>{menu.index===undefined?<><button onClick={()=>{void enqueue(menu.track,true);setMenu(null);}}>{text.playNext}</button><button onClick={()=>{void enqueue(menu.track,false);setMenu(null);}}>{text.addQueue}</button></>:<><button onClick={()=>moveMenu(-1)} disabled={future.indexOf(menu.index)<=0}>{text.moveUp}</button><button onClick={()=>moveMenu(1)} disabled={future.indexOf(menu.index)<0||future.indexOf(menu.index)>=future.length-1}>{text.moveDown}</button><button onClick={()=>{void send({type:'remove',value:{index:menu.index!,revision:menu.revision}});setMenu(null);}}>{text.remove}</button></>}</Sheet>}
  {current&&state.error&&<aside className="ios-playback-error" role="alert"><span>{/RATE_LIMIT/.test(state.error)?text.rateLimit:text.playbackError}</span><button onClick={()=>void send({type:'retry'})}>{text.retryPlayback}</button></aside>}
  <div className={`ios-notice${message?' is-visible':''}`} role="status" aria-live="polite">{message}</div>
 </div>;
}
