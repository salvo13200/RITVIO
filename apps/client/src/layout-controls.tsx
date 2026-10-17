import {useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import {t} from './i18n';
export function LayoutResizeHandle({kind,value,onChange}:{kind:'sidebar'|'panel';value:number;onChange:(width:number)=>void}){
  const start=useRef<{x:number;width:number;pointerId:number;app:HTMLElement;preview:number}|null>(null);
  const [preview,setPreview]=useState<number|null>(null);
  const min=kind==='sidebar'?216:300,max=kind==='sidebar'?320:420;
  const property=kind==='sidebar'?'--user-sidebar-width':'--user-panel-width';
  const clamp=(width:number)=>Math.round(Math.max(min,Math.min(max,width)));
  const finish=(commit:boolean)=>{
    const current=start.current;if(!current)return;
    const width=commit?current.preview:current.width;
    current.app.style.setProperty(property,`${width}px`);delete current.app.dataset.resizing;
    start.current=null;setPreview(null);if(commit)onChange(width);
  };
  const pointerDown=(event:ReactPointerEvent<HTMLDivElement>)=>{
    if(event.button!==0)return;const app=event.currentTarget.closest<HTMLElement>('.app');if(!app)return;
    event.preventDefault();event.currentTarget.focus();event.currentTarget.setPointerCapture(event.pointerId);
    start.current={x:event.clientX,width:value,preview:value,pointerId:event.pointerId,app};setPreview(value);app.dataset.resizing='true';
  };
  return <div className={`layout-resize layout-resize-${kind}`} role="separator" tabIndex={0} aria-orientation="vertical" aria-label={t(kind==='sidebar'?'layout.resizeLibrary':'layout.resizePanel')}
    aria-valuemin={min} aria-valuemax={max} aria-valuenow={preview??value} aria-valuetext={t('layout.width',{width:preview??value})}
    onPointerDown={pointerDown} onPointerMove={event=>{
      const current=start.current;if(!current||event.pointerId!==current.pointerId)return;
      const width=clamp(current.width+(event.clientX-current.x)*(kind==='sidebar'?1:-1));current.preview=width;
      current.app.style.setProperty(property,`${width}px`);setPreview(width);
    }} onPointerUp={()=>finish(true)} onPointerCancel={()=>finish(false)} onLostPointerCapture={()=>finish(false)} onBlur={()=>finish(false)}
    onDoubleClick={()=>onChange(kind==='sidebar'?272:408)} onKeyDown={event=>{
      if(event.key==='Escape'){event.preventDefault();finish(false);return;}
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();const amount=(kind==='sidebar'?1:-1)*(event.key==='ArrowLeft'?-16:16);
      onChange(event.key==='Home'?min:event.key==='End'?max:clamp(value+amount));
    }}/>
}
