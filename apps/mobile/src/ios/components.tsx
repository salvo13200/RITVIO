import {useEffect,useRef,type ReactNode} from 'react';
import {LoaderCircle,Music2,Pause,Play,SkipForward,MoreHorizontal,X} from 'lucide-react';
import type {MobilePlayback,NativeTrack} from '../../../../packages/domain/mobile';
import {mobileTime} from '../../../../packages/domain/mobile';
import {Artwork,ScrollText} from '../ui';
import type {IOSCopy} from './copy';

export {Artwork,ScrollText};
export function IconButton({label,children,onClick,pressed,disabled=false,className=''}:{label:string;children:ReactNode;onClick:()=>void;pressed?:boolean;disabled?:boolean;className?:string}){
 return <button type="button" className={`ios-icon ${className}`} aria-label={label} aria-pressed={pressed} disabled={disabled} onClick={onClick}>{children}</button>;
}
export function Toggle({state,text,onToggle,large=false}:{state:MobilePlayback;text:IOSCopy;onToggle:()=>void;large?:boolean}){
 return <IconButton className={`ios-toggle${large?' ios-toggle-large':''}`} label={state.loading?text.pause:state.playing?text.pause:text.play} onClick={onToggle}>{state.loading?<LoaderCircle className="ios-spinner" aria-hidden="true"/>:state.playing?<Pause fill="currentColor" aria-hidden="true"/>:<Play fill="currentColor" aria-hidden="true"/>}</IconButton>;
}
export function MiniPlayer({state,text,onOpen,onToggle,onNext}:{state:MobilePlayback;text:IOSCopy;onOpen:()=>void;onToggle:()=>void;onNext:()=>void}){
 const track=state.items[state.index];if(!track)return null;
 return <div className="ios-mini" data-testid="mini-player">
  <button className="ios-mini-main" onClick={onOpen} aria-label={`${text.openPlayer}: ${track.title}`}><Artwork src={track.thumbnail} eager/><span className="ios-identity"><strong><ScrollText>{track.title}</ScrollText></strong><small><ScrollText>{track.artist}</ScrollText></small></span></button>
  <Toggle state={state} text={text} onToggle={onToggle}/><IconButton label={text.next} onClick={onNext}><SkipForward fill="currentColor"/></IconButton>
  <div className="ios-mini-progress" aria-hidden="true"><span style={{width:`${state.duration>0?Math.min(100,state.position/state.duration*100):0}%`}}/></div>
 </div>;
}
export function SongRow({track,text,active=false,onPlay,onMore,children}:{track:NativeTrack;text:IOSCopy;active?:boolean;onPlay:()=>void;onMore?:()=>void;children?:ReactNode}){
 return <div className={`ios-song${active?' is-current':''}`} aria-current={active?'true':undefined}>
  <button className="ios-song-main" onClick={onPlay} aria-label={`${text.play}: ${track.title}`}><Artwork src={track.thumbnail}/><span className="ios-identity"><strong>{track.title}</strong><small>{track.artist}</small></span></button>
  {!children&&<span className="ios-song-duration">{mobileTime(track.duration)}</span>}
  {onMore&&<IconButton label={`${text.more}: ${track.title}`} onClick={onMore}><MoreHorizontal/></IconButton>}{children}
 </div>;
}
export function Empty({title,body,children}:{title:string;body:string;children?:ReactNode}){
 return <section className="ios-empty"><Music2 aria-hidden="true"/><h2>{title}</h2><p>{body}</p>{children}</section>;
}
/** A custom dialog keeps iOS 15 support; HTMLDialogElement.showModal requires iOS 15.4. */
const dialogStack:symbol[]=[];
export function Sheet({title,closeLabel,onClose,children,className=''}:{title:string;closeLabel:string;onClose:()=>void;children:ReactNode;className?:string}){
 const ref=useRef<HTMLElement>(null),close=useRef(onClose);close.current=onClose;
 useEffect(()=>{
  const prior=document.activeElement as HTMLElement|null;
  const token=Symbol('ios-dialog');dialogStack.push(token);
  const frame=requestAnimationFrame(()=>ref.current?.focus());
  function key(event:KeyboardEvent){
   if(dialogStack[dialogStack.length-1]!==token)return;
   if(event.key==='Escape'){event.preventDefault();close.current();return;}
   if(event.key!=='Tab')return;
   const nodes=Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')??[]).filter(node=>node.getClientRects().length);
   if(!nodes.length){event.preventDefault();return;}
   const first=nodes[0],last=nodes[nodes.length-1];
   if(event.shiftKey&&(document.activeElement===first||document.activeElement===ref.current)){last.focus();event.preventDefault();}
   else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===ref.current)){first.focus();event.preventDefault();}
  }
  document.addEventListener('keydown',key);
  return()=>{cancelAnimationFrame(frame);document.removeEventListener('keydown',key);const index=dialogStack.indexOf(token);if(index>=0)dialogStack.splice(index,1);if(prior?.isConnected)prior.focus();};
 },[]);
 return <section ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className={`ios-sheet ${className}`}><header className="ios-sheet-header"><h2>{title}</h2><IconButton label={closeLabel} onClick={onClose}><X/></IconButton></header>{children}</section>;
}
