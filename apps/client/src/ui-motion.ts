import {useEffect,useState} from 'react';
import {usePlayer} from './store';
export type MotionMode='curated'|'essential'|'reduced';
export type MotionKind='page'|'surface'|'panel'|'press'|'artwork';
const running=new Set<Animation>();
let revision=0;
export const motionRevision=()=>revision;
export function motionMode():MotionMode{
  if(document.hidden||matchMedia('(prefers-reduced-motion: reduce)').matches)return 'reduced';
  return usePlayer.getState().uiLayout.motion;
}
export function useMotionMode(){
  const preference=usePlayer(s=>s.uiLayout.motion);
  const [reduced,setReduced]=useState(()=>document.hidden||matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)'),update=()=>setReduced(document.hidden||media.matches);media.addEventListener('change',update);document.addEventListener('visibilitychange',update);return()=>{media.removeEventListener('change',update);document.removeEventListener('visibilitychange',update);};},[]);
  return reduced?'reduced':preference;
}
export function trackAnimation(animation:Animation,id:string){
  animation.id=id;running.add(animation);const done=()=>running.delete(animation);animation.addEventListener('finish',done,{once:true});animation.addEventListener('cancel',done,{once:true});return animation;
}
export function animateUI(element:HTMLElement,kind:MotionKind){
  for(const animation of element.getAnimations())if(animation.id===`ui-${kind}`)animation.cancel();
  const mode=motionMode();if(mode==='reduced'||!element.isConnected)return null;
  const essential=mode==='essential';let frames:Keyframe[],duration:number;
  if(kind==='press'){frames=essential?[{opacity:.8},{opacity:1}]:[{transform:'scale(.94)'},{transform:'scale(1)'}];duration=essential?90:140;}
  else if(essential){frames=[{opacity:.78},{opacity:1}];duration=110;}
  else if(kind==='page'){frames=[{opacity:.82,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}];duration=190;}
  else if(kind==='panel'){frames=[{opacity:.82,transform:'translateX(14px)'},{opacity:1,transform:'translateX(0)'}];duration=210;}
  else if(kind==='artwork'){frames=[{opacity:.15,clipPath:'inset(0 0 0 6%)'},{opacity:1,clipPath:'inset(0)'}];duration=260;}
  else {frames=[{opacity:.75},{opacity:1}];duration=180;}
  return trackAnimation(element.animate(frames,{duration,easing:'cubic-bezier(.16,1,.3,1)'}),`ui-${kind}`);
}
/** Cancels optional work immediately when the app is hidden or preferences change. */
export function useMotionLifecycle(){
  useEffect(()=>{
    const cancel=()=>{revision++;for(const animation of running)animation.cancel();running.clear();};
    const media=matchMedia('(prefers-reduced-motion: reduce)');
    const visibility=()=>{document.documentElement.dataset.appVisibility=document.hidden?'hidden':'visible';if(document.hidden)cancel();};
    const reduction=()=>{if(media.matches)cancel();};visibility();
    media.addEventListener('change',reduction);document.addEventListener('visibilitychange',visibility);
    const unsubscribe=usePlayer.subscribe((state,previous)=>{if(state.uiLayout.motion!==previous.uiLayout.motion)cancel();});
    return()=>{cancel();unsubscribe();media.removeEventListener('change',reduction);document.removeEventListener('visibilitychange',visibility);};
  },[]);
}
