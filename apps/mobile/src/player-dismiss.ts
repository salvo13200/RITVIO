import {useEffect,useRef,type PointerEvent as ReactPointerEvent} from 'react';

const reduceMotion=()=>document.documentElement.dataset.reduceMotion==='true'||matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Dismissal is visual navigation only. It never sends playback commands. */
export function usePlayerDismiss(close:()=>void,inactive:boolean,onDragStart:()=>void){
 const header=useRef<HTMLElement>(null),gesture=useRef<{id:number;x:number;y:number;dy:number;at:number}|null>(null),animation=useRef<Animation|null>(null),closing=useRef(false);
 const generation=useRef(0),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),finishAnimation=useRef<(()=>void)|null>(null);
 const callbacks=useRef({close,inactive,onDragStart});callbacks.current={close,inactive,onDragStart};
 function dialog(){return header.current?.closest('dialog')??null;}
 function clean(){const el=dialog();if(el){el.style.transform='';el.style.opacity='';el.classList.remove('is-dragging','is-dismissing');}}
 function release(){const current=gesture.current;gesture.current=null;if(current&&header.current?.hasPointerCapture(current.id))header.current.releasePointerCapture(current.id);}
 function stopAnimation(){generation.current++;clearTimeout(timer.current);finishAnimation.current=null;animation.current?.cancel();animation.current=null;}
 function animate(el:HTMLElement,frames:Keyframe[],duration:number,easing:string,complete:()=>void){
  stopAnimation();const id=generation.current;let done=false;
  const finish=()=>{if(done||id!==generation.current)return;done=true;clearTimeout(timer.current);finishAnimation.current=null;animation.current?.cancel();animation.current=null;complete();};
  finishAnimation.current=finish;
  try{const run=el.animate(frames,{duration,easing});animation.current=run;void run.finished.then(finish,finish);timer.current=setTimeout(finish,duration+120);}catch{finish();}
 }
 function settle(){
  const el=dialog();if(!el)return;
  stopAnimation();
  if(reduceMotion()){clean();return;}
  animate(el,[{transform:el.style.transform||'translateY(0)',opacity:el.style.opacity||'1'},{transform:'translateY(0)',opacity:1}],200,'cubic-bezier(.16,1,.3,1)',clean);
 }
 function dismiss(){
  if(closing.current||callbacks.current.inactive)return;
  closing.current=true;release();stopAnimation();callbacks.current.onDragStart();
  const el=dialog();
  if(!el||reduceMotion()){callbacks.current.close();return;}
  el.classList.add('is-dismissing');
  animate(el,[{transform:el.style.transform||'translateY(0)',opacity:el.style.opacity||'1'},{transform:'translateY(100dvh)',opacity:.7}],190,'cubic-bezier(.4,0,1,1)',()=>callbacks.current.close());
 }
 function pointerDown(event:ReactPointerEvent<HTMLElement>){
  if(callbacks.current.inactive||closing.current||gesture.current||event.isPrimary===false||event.button!==0||(event.target as HTMLElement).closest('button,a,input'))return;
  stopAnimation();clean();callbacks.current.onDragStart();
  gesture.current={id:event.pointerId,x:event.clientX,y:event.clientY,dy:0,at:performance.now()};
  event.currentTarget.setPointerCapture(event.pointerId);
 }
 function pointerMove(event:ReactPointerEvent<HTMLElement>){
  const current=gesture.current,el=dialog();if(!current||current.id!==event.pointerId||!el)return;
  const dx=event.clientX-current.x,dy=event.clientY-current.y;
  if(Math.abs(dx)>24&&Math.abs(dx)>Math.abs(dy)){release();settle();return;}
  current.dy=Math.max(0,Math.min(innerHeight*.7,dy));
  if(current.dy<3)return;
  el.classList.add('is-dragging');el.style.transform=`translateY(${current.dy}px)`;el.style.opacity=String(1-current.dy/innerHeight*.2);
 }
 function pointerUp(event:ReactPointerEvent<HTMLElement>){
  const current=gesture.current;if(!current||current.id!==event.pointerId)return;
  const distance=current.dy,velocity=distance/Math.max(1,performance.now()-current.at);release();
  if(distance>Math.min(110,innerHeight*.15)||distance>40&&velocity>.6)dismiss();else settle();
 }
 function pointerCancel(){release();settle();}
 useEffect(()=>{const interrupt=()=>{release();if(closing.current){finishAnimation.current?.();return;}stopAnimation();clean();};window.addEventListener('blur',interrupt);document.addEventListener('visibilitychange',interrupt);return()=>{release();stopAnimation();clean();window.removeEventListener('blur',interrupt);document.removeEventListener('visibilitychange',interrupt);};},[]);
 return {header,dismiss,events:{onPointerDown:pointerDown,onPointerMove:pointerMove,onPointerUp:pointerUp,onPointerCancel:pointerCancel,onLostPointerCapture:()=>{if(gesture.current)pointerCancel();}}};
}
