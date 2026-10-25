import {useEffect,useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import {ChevronDown,ListMusic,Repeat,Repeat1,Shuffle,SkipBack,SkipForward} from 'lucide-react';
import {mobileTime,type MobileCommand,type MobilePlayback} from '../../../../packages/domain/mobile';
import {Artwork,IconButton,ScrollText,Sheet,Toggle} from './components';
import type {IOSCopy} from './copy';

export function Seek({state,text,send}:{state:MobilePlayback;text:IOSCopy;send:(command:MobileCommand)=>void}){
 const [preview,setPreview]=useState<number|null>(null),dragging=useRef(false),latest=useRef(0),ignoreChange=useRef(false);
 const duration=Math.max(0,state.duration),value=Math.min(duration,Math.max(0,preview??state.position));
 useEffect(()=>{dragging.current=false;setPreview(null);},[state.index,state.items[state.index]?.videoId]);
 function release(commit:boolean){if(!dragging.current)return;dragging.current=false;ignoreChange.current=true;if(commit)send({type:'seek',value:latest.current});setPreview(null);requestAnimationFrame(()=>{ignoreChange.current=false;});}
 return <div className={`ios-seek${state.playing?' is-playing':''}`} style={{'--ios-progress':`${duration>0?value/duration*100:0}%`} as CSSProperties}>
  <div className="ios-wave" aria-hidden="true">{Array.from({length:57},(_,i)=><i key={i} className={i/56<=value/(duration||1)?'is-filled':''} style={{'--bar-height':`${4+Math.sin(i*1.3)**2*8}px`,'--bar-delay':`${-i*.087}s`} as CSSProperties}/>)}</div>
  {preview!==null&&<output className="ios-seek-preview" style={{left:`${Math.min(88,Math.max(12,duration>0?value/duration*100:0))}%`}}>{mobileTime(preview)}</output>}
  <input aria-label={text.seek} type="range" min="0" max={duration||1} step="0.1" value={value} disabled={!duration}
   aria-valuetext={`${mobileTime(value)} / ${mobileTime(duration)}`}
   onPointerDown={event=>{if(!duration)return;dragging.current=true;latest.current=value;setPreview(value);event.currentTarget.setPointerCapture(event.pointerId);}}
   onChange={event=>{const next=Number(event.target.value);latest.current=next;if(dragging.current)setPreview(next);else if(!ignoreChange.current)send({type:'seek',value:next});}}
   onPointerUp={()=>release(true)} onPointerCancel={()=>release(false)} onLostPointerCapture={()=>release(false)}
   onKeyDown={event=>{if(event.key==='Escape')release(false);}}/>
  <div className="ios-time"><span>{mobileTime(value)}</span><span>{mobileTime(duration)}</span></div>
 </div>;
}
export function Player({state,text,send,onClose,onQueue}:{state:MobilePlayback;text:IOSCopy;send:(command:MobileCommand)=>void;onClose:()=>void;onQueue:()=>void}){
 const art=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{const element=art.current;if(!element)return;const measure=()=>element.style.setProperty('--ios-cover',`${Math.max(0,Math.min(element.clientWidth,element.clientHeight-24))}px`);const observer=new ResizeObserver(measure);observer.observe(element);measure();return()=>observer.disconnect();},[]);
 const track=state.items[state.index];if(!track)return null;
 const repeatLabel=state.repeat==='one'?text.repeatOne:state.repeat==='all'?text.repeatAll:text.repeatOff;
 return <Sheet title={text.nowPlaying} closeLabel={text.hidePlayer} onClose={onClose} className="ios-player">
  <div className="ios-player-top"><IconButton label={text.hidePlayer} onClick={onClose}><ChevronDown/></IconButton><span>{text.nowPlaying}</span><IconButton label={text.queue} onClick={onQueue}><ListMusic/></IconButton></div>
  <div className="ios-player-art" data-testid="player-art" ref={art}><Artwork src={track.thumbnail} large eager/></div>
  <div className="ios-player-details">{track.album?.name&&<p className="ios-player-album">{track.album.name}</p>}<h1><ScrollText>{track.title}</ScrollText></h1><p className="ios-player-artist"><ScrollText>{track.artist}</ScrollText></p></div>
  <Seek state={state} text={text} send={send}/>
  <div className="ios-transport">
   <IconButton label={text.shuffle} pressed={state.shuffle} onClick={()=>send({type:'shuffle',value:!state.shuffle})}><Shuffle/></IconButton>
   <IconButton label={text.previous} onClick={()=>send({type:'previous'})}><SkipBack fill="currentColor"/></IconButton>
   <Toggle large state={state} text={text} onToggle={()=>send({type:state.playing||state.loading?'pause':'play'})}/>
   <IconButton label={text.next} onClick={()=>send({type:'next'})}><SkipForward fill="currentColor"/></IconButton>
   <IconButton label={repeatLabel} pressed={state.repeat!=='off'} onClick={()=>send({type:'repeat',value:state.repeat==='off'?'all':state.repeat==='all'?'one':'off'})}>{state.repeat==='one'?<Repeat1/>:<Repeat/>}</IconButton>
  </div>
  <button className="ios-player-queue" onClick={onQueue}><ListMusic size={20}/>{text.queue}</button>
 </Sheet>;
}
