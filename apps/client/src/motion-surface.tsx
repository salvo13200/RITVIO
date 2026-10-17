import {useEffect,useRef,type ReactNode} from 'react';
import {animateUI,useMotionMode,type MotionKind} from './ui-motion';

/** Animate an existing surface; never remount its controls or the audio player. */
export function MotionSurface({children,motionKey,className='',kind='surface'}:{children:ReactNode;motionKey:string;className?:string;kind?:MotionKind}){
  const ref=useRef<HTMLDivElement>(null);
  const mode=useMotionMode();
  useEffect(()=>{
    const element=ref.current;if(!element)return;
    const animation=animateUI(element,kind);return()=>animation?.cancel();
  },[motionKey,mode,kind]);
  return <div className={className} ref={ref}>{children}</div>;
}
