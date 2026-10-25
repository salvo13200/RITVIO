import {useEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import {GripVertical,MoreHorizontal} from 'lucide-react';
import type {MobileCommand,MobilePlayback} from '../../../../packages/domain/mobile';
import {Empty,IconButton,MiniPlayer,Sheet,SongRow} from './components';
import type {IOSCopy} from './copy';

export function upcoming(state:MobilePlayback){const order=state.order??state.items.map((_,i)=>i);return order.slice(Math.max(0,order.indexOf(state.index)+1));}
type Drag={from:number;to:number;pointer:number;y:number;startY:number;startScroll:number;moved:boolean;revision:number;current:number};
export function Queue({state,text,send,onClose,onMore,onOpenPlayer,announce}:{state:MobilePlayback;text:IOSCopy;send:(command:MobileCommand)=>Promise<boolean>;onClose:()=>void;onMore:(index:number)=>void;onOpenPlayer:()=>void;announce:(message:string)=>void}){
 const list=useRef<HTMLDivElement>(null),drag=useRef<Drag|null>(null),[view,setView]=useState<Drag|null>(null),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false);
 const entries=upcoming(state),track=state.items[state.index];
 function reset(){const value=drag.current;if(value){const source=list.current?.querySelector<HTMLElement>(`[data-queue-entry="${value.from}"]`);if(source)source.style.transform='';}drag.current=null;setView(null);}
 function cancel(){if(drag.current){reset();announce(text.cancelDrag);}}
 useEffect(()=>{if(drag.current&&(drag.current.revision!==state.queueRevision||drag.current.current!==state.index))cancel();},[state.queueRevision,state.index]);
 function update(y:number){
  const value=drag.current;if(!value)return;
  const area=list.current;if(!area)return;
  const rows=Array.from(area.querySelectorAll<HTMLElement>('[data-queue-entry]')),rect=area.getBoundingClientRect();
  let to=value.to,best=Infinity;
  for(const row of rows){const distance=Math.abs(y-(rect.top+row.offsetTop-area.scrollTop+row.offsetHeight/2));if(distance<best){best=distance;to=Number(row.dataset.queueEntry);}}
  const next={...value,to,y,moved:value.moved||Math.abs(y-value.startY)>5||area.scrollTop!==value.startScroll};drag.current=next;
  const source=rows.find(row=>Number(row.dataset.queueEntry)===value.from),last=rows[rows.length-1];
  if(source&&last){const offset=y-value.startY+area.scrollTop-value.startScroll;const bounded=Math.max(-source.offsetTop,Math.min(last.offsetTop+last.offsetHeight-source.offsetTop-source.offsetHeight,offset));source.style.transform=`translateY(${bounded}px)`;}
  setView(previous=>previous?.to===next.to&&previous.from===next.from?previous:next);
 }
 useEffect(()=>{
  if(!view)return;let frame=0;
  function step(){const area=list.current,value=drag.current;if(!area||!value)return;const rect=area.getBoundingClientRect(),edge=48;let delta=0;if(value.y<rect.top+edge)delta=-Math.min(14,(rect.top+edge-value.y)/4);else if(value.y>rect.bottom-edge)delta=Math.min(14,(value.y-rect.bottom+edge)/4);if(delta){area.scrollTop+=delta;update(value.y);}frame=requestAnimationFrame(step);}
  frame=requestAnimationFrame(step);return()=>cancelAnimationFrame(frame);
 },[Boolean(view)]);
 async function end(event:ReactPointerEvent<HTMLButtonElement>,commit:boolean){const value=drag.current;if(!value||value.pointer!==event.pointerId)return;reset();if(commit&&value.from!==value.to){setBusy(true);const ok=await send({type:'move',value:{from:value.from,to:value.to,revision:value.revision}});setBusy(false);if(ok)announce(text.reordered);}else if(commit&&!value.moved){event.currentTarget.focus({preventScroll:true});onMore(value.from);}}
 return <Sheet title={text.queue} closeLabel={text.done} closeText onClose={onClose} className="ios-queue">
  <div className="ios-queue-current"><h3>{text.nowPlaying}</h3>{track&&<SongRow track={track} text={text} active onPlay={onOpenPlayer}/>}</div>
  <div className="ios-section-title"><h3>{text.upNext}</h3><button disabled={!state.items.length||busy||Boolean(view)} onClick={()=>setConfirm(true)}>{text.clear}</button></div>
  <p className="ios-drag-hint" id="ios-queue-hint">{text.dragHint}</p>
  <div className={`ios-queue-list${view?' is-dragging':''}`} ref={list}>
   {!entries.length&&<Empty title={text.emptyQueue} body={text.emptyQueueBody}/>}
   {entries.map(entry=><div key={`${state.queueRevision}:${entry}`} data-queue-entry={entry} className={`ios-queue-entry${view?.from===entry?' is-lifted':''}${view?.to===entry&&view.from!==entry?' is-insertion':''}`}>
    <SongRow track={state.items[entry]} text={text} onPlay={()=>{if(!view)void send({type:'jump',value:entry});}}><IconButton label={`${text.more}: ${state.items[entry].title}`} onClick={()=>onMore(entry)} disabled={busy||Boolean(view)}><MoreHorizontal/></IconButton>
     <button className="ios-icon ios-grip" aria-label={`${text.reorder}: ${state.items[entry].title}`} aria-describedby="ios-queue-hint" disabled={busy||state.queueRevision===undefined}
      onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);const value={from:entry,to:entry,pointer:event.pointerId,y:event.clientY,startY:event.clientY,startScroll:list.current?.scrollTop??0,moved:false,revision:state.queueRevision!,current:state.index};drag.current=value;setView(value);}}
      onPointerMove={event=>{if(drag.current?.pointer===event.pointerId)update(event.clientY);}} onPointerUp={event=>void end(event,true)} onPointerCancel={event=>void end(event,false)} onLostPointerCapture={()=>cancel()}
      onClick={event=>{if(event.detail===0)onMore(entry);}} onKeyDown={event=>{if(event.key==='Escape')cancel();}}><GripVertical aria-hidden="true"/></button>
    </SongRow>
   </div>)}
  </div>
  <MiniPlayer state={state} text={text} onOpen={onOpenPlayer} onToggle={()=>void send({type:state.playing||state.loading?'pause':'play'})} onNext={()=>void send({type:'next'})}/>
  {confirm&&<Sheet title={text.clearTitle} closeLabel={text.cancel} onClose={()=>setConfirm(false)} className="ios-confirm"><p>{text.clearBody}</p><button className="ios-primary" onClick={()=>{setConfirm(false);void send({type:'clear'}).then(ok=>{if(ok)onClose();});}}>{text.clear}</button><button className="ios-text" onClick={()=>setConfirm(false)}>{text.cancel}</button></Sheet>}
 </Sheet>;
}
