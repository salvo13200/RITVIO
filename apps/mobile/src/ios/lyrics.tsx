import {useCallback,useEffect,useId,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {ChevronDown,LocateFixed,Share2,SkipBack,SkipForward} from 'lucide-react';
import {mobileTime,type MobileCommand,type MobilePlayback} from '../../../../packages/domain/mobile';
import {activeLyricsLine,type LyricsDocument,type LyricsResponse} from '../../../../packages/domain/lyrics';
import {Artwork,Empty,IconButton,ScrollText,Sheet,Toggle} from './components';
import type {IOSCopy} from './copy';
import type {IOSLyricsCopy} from './lyrics-copy';
import {iosLyrics,lyricsTrackKey} from './lyrics-client';
import {Seek} from './player';

type Preferences={size:'standard'|'large'|'extra';emphasis:boolean};
function preferences():Preferences{try{const value=JSON.parse(localStorage.getItem('ritvio.ios.lyrics.appearance')??'{}');return {size:['standard','large','extra'].includes(value.size)?value.size:'standard',emphasis:value.emphasis!==false};}catch{return {size:'standard',emphasis:true};}}
type Load={key:string;loading:boolean;value:LyricsResponse|null;error:string|null};
export function LyricsReader({state,text,t,send,onClose,enabled=true,onShare,shareLabel}:{state:MobilePlayback;text:IOSCopy;t:IOSLyricsCopy;send:(command:MobileCommand)=>void;onClose:()=>void;enabled?:boolean;onShare?:(document?:LyricsDocument)=>void;shareLabel?:string}){
 const track=state.items[state.index],key=track?lyricsTrackKey(track):'';
 const [load,setLoad]=useState<Load>({key:'',loading:true,value:null,error:null}),[attempt,setAttempt]=useState(0),[follow,setFollow]=useState(true),[appearance,setAppearance]=useState(preferences),[settings,setSettings]=useState(false);
 const reading=useRef<HTMLDivElement>(null),rows=useRef(new Map<number,HTMLButtonElement>()),sendRef=useRef(send),currentTrack=useRef(track),previousAttempt=useRef({key:'',attempt:0}),latest=useRef({index:-1,follow:true}),readerId=useId();
 sendRef.current=send;currentTrack.current=track;
 const view:Load=load.key===key?load:{key,loading:true,value:null,error:null};
 const document=view.value?.document??null,index=document?activeLyricsLine(document.lines,state.position,document.offsetMs):-1;
 latest.current={index,follow};
 useEffect(()=>{
  const item=currentTrack.current;if(!item||!enabled)return;
  const controller=new AbortController();let active=true;
  setLoad({key,loading:true,value:null,error:null});setFollow(true);if(reading.current)reading.current.scrollTop=0;
  const fresh=previousAttempt.current.key===key&&previousAttempt.current.attempt!==attempt;previousAttempt.current={key,attempt};
  void iosLyrics.lookup(item,{signal:controller.signal,fresh}).then(value=>{if(active)setLoad({key,loading:false,value,error:null});}).catch(error=>{if(active&&error?.code!=='LYRICS_CANCELLED')setLoad({key,loading:false,value:null,error:String(error?.code??'LYRICS_UNAVAILABLE')});});
  return()=>{active=false;controller.abort();};
 },[key,attempt,enabled]);
 useEffect(()=>{try{localStorage.setItem('ritvio.ios.lyrics.appearance',JSON.stringify(appearance));}catch{/* Reading remains available when preferences cannot be saved. */}},[appearance]);
 const retry=()=>setAttempt(value=>value+1);
 const seek=useCallback((at:number)=>{sendRef.current({type:'seek',value:at});setFollow(true);},[]);
 const center=useCallback(()=>{
  const area=reading.current,row=rows.current.get(latest.current.index);if(!area||!row||!latest.current.follow)return;
  const viewport=area.getBoundingClientRect(),line=row.getBoundingClientRect();
  const reduce=Boolean(area.closest('.ios-reduce-motion'))||matchMedia('(prefers-reduced-motion: reduce)').matches;
  area.scrollTo({top:Math.max(0,area.scrollTop+line.top-viewport.top-(area.clientHeight-line.height)/2),behavior:reduce?'auto':'smooth'});
 },[]);
 useLayoutEffect(()=>{const frame=requestAnimationFrame(center);return()=>cancelAnimationFrame(frame);},[index,follow,document,appearance.size,center]);
 useEffect(()=>{const area=reading.current;if(!area)return;let frame=0;const observer=new ResizeObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(center);});observer.observe(area);return()=>{observer.disconnect();cancelAnimationFrame(frame);};},[center]);
 const lines=useMemo(()=>document?.lines.map((line,i)=><button key={`${line.at}:${i}`} ref={element=>{if(element)rows.current.set(i,element);else rows.current.delete(i);}} className={`ios-lyric-line${index===i?' is-active':''}`} aria-current={index===i?'true':undefined} aria-label={`${t.jump} ${mobileTime(line.at)}: ${line.text||t.pause}`} onClick={()=>seek(Math.max(0,line.at-document.offsetMs/1000))}><span>{line.text||'· · ·'}</span></button>),[document,index,t,seek]);
 if(!track)return null;
 const unavailable=view.value?.status==='instrumental'?{title:t.instrumental,body:t.instrumentalBody,retry:false}:view.error==='LYRICS_RATE_LIMIT'?{title:t.rate,body:t.rateBody,retry:true}:view.error?{title:t.error,body:t.errorBody,retry:true}:{title:t.missing,body:t.missingBody,retry:true};
 return <>
 <div aria-hidden={settings||undefined}>
 <Sheet title={t.title} closeLabel={t.close} onClose={onClose} className={`ios-lyrics ios-lyrics-size-${appearance.size}${appearance.emphasis?' is-emphasized':''}`}>
  <div className="ios-player-top ios-lyrics-top"><IconButton label={t.close} onClick={onClose}><ChevronDown/></IconButton><span>{t.title}</span><div className="ios-lyrics-toolbar-actions"><button className="ios-lyrics-type" aria-label={t.appearance} aria-haspopup="dialog" onClick={()=>setSettings(true)}><span aria-hidden="true">Aa</span></button>{onShare&&<IconButton label={shareLabel!} onClick={()=>onShare(document??undefined)}><Share2/></IconButton>}</div></div>
  <div className="ios-lyrics-identity"><Artwork src={track.thumbnail} eager/><div className="ios-identity"><h1><ScrollText>{track.title}</ScrollText></h1><p><ScrollText>{track.artist}</ScrollText></p></div></div>
  <div ref={reading} id={readerId} className="ios-lyrics-reading" tabIndex={0} role="region" aria-label={t.reading} aria-busy={view.loading||undefined} onWheel={()=>setFollow(false)} onTouchMove={()=>setFollow(false)} onPointerDown={event=>{if(event.clientX>=event.currentTarget.getBoundingClientRect().right-14)setFollow(false);}} onKeyDown={event=>{if(['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(event.key))setFollow(false);}}>
   {view.loading?<div className="ios-lyrics-loading" role="status" aria-label={t.loading}><span/><span/><span/><span/></div>:view.value?.status==='ready'&&document?<>{document.lines.length?lines:<p className="ios-lyrics-plain">{document.plainText}</p>}</>:<Empty title={unavailable.title} body={unavailable.body}>{unavailable.retry&&<button className="ios-primary" onClick={retry}>{t.retry}</button>}</Empty>}
  </div>
  <footer className="ios-lyrics-footer">
   <div className="ios-lyrics-follow"><div>{Boolean(document?.lines.length)&&!follow&&<button className="ios-text" aria-controls={readerId} onClick={()=>setFollow(true)}><LocateFixed size={18}/>{t.follow}</button>}</div><p>{t.source}{document&&!document.instrumental&&<span> · {document.lines.length?t.synced:t.plain}</span>}</p></div>
   <Seek state={state} text={text} send={send}/>
   <div className="ios-lyrics-transport"><IconButton label={text.previous} onClick={()=>send({type:'previous'})}><SkipBack fill="currentColor"/></IconButton><Toggle large state={state} text={text} onToggle={()=>send({type:state.playing||state.loading?'pause':'play'})}/><IconButton label={text.next} onClick={()=>send({type:'next'})}><SkipForward fill="currentColor"/></IconButton></div>
  </footer>
 </Sheet>
 </div>
 {settings&&<Sheet title={t.appearance} closeLabel={t.done} closeText onClose={()=>setSettings(false)} className="ios-menu ios-lyrics-settings"><fieldset><legend>{t.size}</legend><div className="ios-lyrics-size-options">{(['standard','large','extra'] as const).map(size=><label key={size}><input type="radio" name="ios-lyrics-size" checked={appearance.size===size} onChange={()=>setAppearance(value=>({...value,size}))}/>{t[size]}</label>)}</div></fieldset><label className="ios-setting-row"><span>{t.emphasis}</span><input className="ios-switch" type="checkbox" role="switch" checked={appearance.emphasis} onChange={event=>setAppearance(value=>({...value,emphasis:event.target.checked}))}/></label></Sheet>}
 </>;
}
