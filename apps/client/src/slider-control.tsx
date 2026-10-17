import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {SliderGesture} from '../../../packages/domain/slider-gesture';
// Decorative wave; the native range owns pointer, touch and keyboard input.
function waveform(bars:number,group:number){
  // Fixed x coordinates; interleaved groups vary only in height during playback.
  return Array.from({length:bars},(_,i)=>{const height=2+Math.abs(Math.sin(i*.37)*Math.cos(i*.11))*12;return i%3===group?`M ${i*600/bars} ${14-height/2} v ${height}`:'';}).join(' ');
}
const paths=[0,1,2].map(group=>waveform(200,group));
type Props={label:string;value:number;min?:number;max:number;step:number;onChange:(value:number)=>void;disabled?:boolean;animated?:boolean;muted?:boolean;variant:'timeline'|'volume';valueText?:string;commitOnRelease?:boolean;resetKey?:string;onPreviewChange?:(value:number|null)=>void;formatPreview?:(value:number)=>string;formatValueText?:(value:number)=>string};
export function WaveSlider(props:Props){
  const {label,value,min=0,max,step,onChange,disabled=false,animated=false,muted=false,variant,valueText,commitOnRelease=false,resetKey,onPreviewChange,formatPreview,formatValueText}=props;
  const latest=useRef(props);latest.current=props;
  const [reduced,setReduced]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [visible,setVisible]=useState(()=>!document.hidden);
  const [draft,setDraft]=useState<{value:number;key?:string}|null>(null);
  const [hover,setHover]=useState<number|null>(null);
  const [pointerActive,setPointerActive]=useState(false);
  const interaction=useRef(new SliderGesture());
  const input=useRef<HTMLInputElement>(null);
  const bound=(candidate:number)=>Number.isFinite(candidate)?Math.max(min,Math.min(max,candidate)):min;
  const shown=draft&&draft.key===resetKey&&!disabled?bound(draft.value):bound(value);
  const percentage=max>min?((shown-min)/(max-min))*100:0;
  const cancel=()=>{interaction.current.cancel();setDraft(null);setHover(null);setPointerActive(false);latest.current.onPreviewChange?.(null);};
  const release=()=>{const current=latest.current,pending=interaction.current.release(current.resetKey,current.disabled);if(pending!==null)current.onChange(Math.max(current.min??0,Math.min(current.max,pending)));cancel();};
  useEffect(()=>{
    const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
    const change=()=>setReduced(preference.matches),visibility=()=>setVisible(!document.hidden);
    preference.addEventListener('change',change);document.addEventListener('visibilitychange',visibility);
    return()=>{preference.removeEventListener('change',change);document.removeEventListener('visibilitychange',visibility);};
  },[]);
  useEffect(()=>{
    const up=()=>{setPointerActive(false);if(latest.current.commitOnRelease)release();},abort=()=>cancel();
    window.addEventListener('pointerup',up);window.addEventListener('pointercancel',abort);window.addEventListener('blur',abort);
    return()=>{window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',abort);window.removeEventListener('blur',abort);};
  },[commitOnRelease]);
  useEffect(()=>{cancel();setHover(null);},[disabled,max,resetKey]);
  const moving=variant==='timeline'&&animated&&!disabled&&!muted&&!reduced&&visible;
  const amplitude=.8;
  const tooltip=draft?.key===resetKey?shown:hover;
  const tooltipPercent=tooltip!==null&&tooltip!==undefined&&max>min?((tooltip-min)/(max-min))*100:percentage;
  const previewText=formatPreview?.(tooltip??shown);
  const style={'--wave-amplitude':amplitude,'--seek-tip':`${tooltipPercent}%`,'--seek-tip-inset':`calc(${Math.max(3,(previewText?.length??0)/2)}ch + 9px)`} as CSSProperties;
  const wave=(className:string)=><svg className={className} viewBox="0 0 600 28" preserveAspectRatio="none" aria-hidden="true" focusable="false"><g className="wave-amplitude">{paths.map((path,index)=><g className={`wave-flow wave-pulse-${index}`} key={index}><path d={path} vectorEffect="non-scaling-stroke"/></g>)}</g></svg>;
  return <div className={`wave-slider wave-${variant}`} style={style} data-animated={moving} data-muted={muted} data-disabled={disabled} data-dragging={pointerActive||!!draft}>
    {variant==='timeline'?<div className="wave-drawing" aria-hidden="true">{wave('wave-rail')}<div className="wave-fill" style={{clipPath:`inset(0 ${100-percentage}% 0 0)`}}>{wave('wave-progress')}</div></div>:<div className="volume-drawing" aria-hidden="true"><div className="volume-fill" style={{width:`${percentage}%`}}/></div>}
    {formatPreview&&!disabled&&<span className="wave-time-preview" aria-hidden="true">{previewText}</span>}
    <input ref={input} type="range" aria-label={label} aria-valuetext={formatValueText?.(shown)??valueText} min={min} max={max} step={step} value={shown} disabled={disabled}
      onChange={event=>{const next=bound(Number(event.target.value));if(commitOnRelease){const result=interaction.current.update(next,resetKey,disabled);if(result==='cancelled'){event.currentTarget.value=String(bound(latest.current.value));return;}if(result==='preview'){setDraft({value:next,key:resetKey});onPreviewChange?.(next);return;}}onChange(next);}}
      onPointerDown={()=>{setPointerActive(true);if(commitOnRelease){interaction.current.begin(shown,resetKey);setDraft({value:shown,key:resetKey});onPreviewChange?.(shown);}}}
      onPointerMove={event=>{if(formatPreview&&!disabled&&!interaction.current.active){const box=event.currentTarget.getBoundingClientRect();setHover(bound(min+(event.clientX-box.left)/box.width*(max-min)));}}}
      onPointerLeave={()=>setHover(null)} onBlur={()=>{cancel();setHover(null);}}
      onKeyDown={event=>{
        if(!commitOnRelease)return;
        if(event.key==='Escape'&&interaction.current.active){event.preventDefault();cancel();if(input.current)input.current.value=String(bound(value));return;}
        const changes:Record<string,number>={ArrowLeft:-5,ArrowDown:-5,ArrowRight:5,ArrowUp:5};
        if(event.key in changes||event.key==='Home'||event.key==='End'){event.preventDefault();cancel();onChange(event.key==='Home'?min:event.key==='End'?max:bound(shown+changes[event.key]));}
      }}/>
  </div>;
}
