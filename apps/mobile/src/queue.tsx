import { noticeText } from './messages';
import { msg } from './messages';
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { ArrowDown, ArrowUp, BookmarkPlus, GripVertical, Trash2, Shuffle, Radio, MoreVertical, Play, Pause, LoaderCircle } from 'lucide-react';
import type { MobileCommand, MobilePlayback } from '../../../packages/domain/mobile';
import { Artwork, Empty, ScrollText, Modal } from './ui';
import { DiscoveryControls } from './discovery';
export function orderedQueue(state: MobilePlayback) {
    const order = state.order;
    return order?.length === state.items.length && [...order].sort((a, b) => a - b).every((n, i) => n === i) ? order : state.items.map((_, i) => i);
}
type Drag = {
    pointer: number;
    from: number;
    target: number;
    y: number;
    offset: number;
    revision: number;
    moved: boolean;
    center: number;
    scrollTop: number;
    clientY: number;
    section: string;
    grab: number;
};
export function QueuePanel({ state, command, discoveryChange, save, clear, radio, onClose }: {
    state: MobilePlayback;
    command: (input: MobileCommand) => Promise<boolean>;
    discoveryChange: React.ComponentProps<typeof DiscoveryControls>['change'];
    save: () => void;
    clear: () => void;
    radio: () => void;
    onClose: () => void;
}) {
    const order = orderedQueue(state), revision = state.queueRevision ?? 0;
    const [busy, setBusy] = useState(false), [editing, setEditing] = useState<number | null>(null), [drag, setDrag] = useState<Drag | null>(null), [announcement, setAnnouncement] = useState('');
    const gesture = useRef<Drag | null>(null), container = useRef<HTMLDivElement>(null), suppressClick = useRef(false), pending = useRef(false);
    const nodes = useRef(new Map<string, DOMRect>());
    const scroll=useRef<HTMLDivElement>(null),frame=useRef<number>(0),lastFrame=useRef(0);
    const [options,setOptions]=useState(false);
    const current = state.items[state.index], currentAt = order.indexOf(state.index);
    function cancel() { cancelAnimationFrame(frame.current);gesture.current = null; setDrag(null); }
    useEffect(() => { cancel(); setEditing(null); }, [revision,state.index,state.shuffle,current?.videoId]);
    useEffect(() => { const hide=()=>{if(document.hidden)cancel();};window.addEventListener('blur', cancel);document.addEventListener('visibilitychange',hide);return () => {cancelAnimationFrame(frame.current);gesture.current=null;window.removeEventListener('blur', cancel);document.removeEventListener('visibilitychange',hide);}; }, []);
    useLayoutEffect(() => {
        const previous = nodes.current;
        const next = new Map<string, DOMRect>();
        container.current?.querySelectorAll<HTMLElement>('[data-queue-row]').forEach(node => {
            const key = node.dataset.queueKey!, rect = node.getBoundingClientRect(), old = previous.get(key);
            next.set(key, rect);
            if (old && Math.abs(old.top - rect.top) > 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches && document.documentElement.dataset.reduceMotion !== 'true')
                node.animate([{ transform: `translateY(${old.top - rect.top}px)` }, { transform: 'translateY(0)' }], { duration: 180, easing: 'cubic-bezier(.16,1,.3,1)' });
        });
        nodes.current = next;
    }, [revision]);
    async function run(input: MobileCommand, message: string) {
        if (pending.current)
            return;
        pending.current = true;
        setBusy(true);
        try {
            if (await command(input))
                setAnnouncement(message);
        }
        finally {
            pending.current = false;
            setBusy(false);
        }
    }
    function move(from: number, to: number, atRevision = revision) {
        if (from === to)
            return;
        const name = state.items[from]?.title ?? msg("Brano");
        void run({ type: 'move', value: { from, to, revision: atRevision } }, msg("{p0}: ordine aggiornato", { p0: name }));
    }
    function start(event: PointerEvent<HTMLButtonElement>, index: number) {
        if (gesture.current || busy || event.button !== 0)
            return;
        suppressClick.current = false;
        const row = event.currentTarget.closest<HTMLElement>('[data-queue-row]')!, bounds = row.querySelector('.queue-entry-main')!.getBoundingClientRect(), sheet = scroll.current;
        gesture.current = { pointer: event.pointerId, from: index, target: index, y: event.clientY, clientY:event.clientY, offset: 0, revision, moved: false, center: bounds.top + bounds.height / 2, scrollTop: sheet?.scrollTop ?? 0,section:row.dataset.queueSection??'next',grab:event.clientY-bounds.top };
        event.currentTarget.setPointerCapture(event.pointerId);
        lastFrame.current=performance.now();frame.current=requestAnimationFrame(tick);
    }
    function updateDrag(elapsed:number) {
        const value=gesture.current,sheet=scroll.current;
        if(!value||!value.moved||!sheet)return;
        if(value.revision!==revision){cancel();return;}
        const bounds=sheet.getBoundingClientRect(),edge=Math.min(64,bounds.height/4);
        const speed=value.clientY>bounds.bottom-edge?Math.min(18,(value.clientY-bounds.bottom+edge)/edge*18):value.clientY<bounds.top+edge?-Math.min(18,(bounds.top+edge-value.clientY)/edge*18):0;
        sheet.scrollTop+=speed*Math.min(32,elapsed)/16.67;
        const source=container.current?.querySelector<HTMLElement>(`[data-queue-index="${value.from}"]`);
        if(!source){cancel();return;}
        const sourceBox=source.querySelector('.queue-entry-main')!.getBoundingClientRect();
        const baseTop=sourceBox.top-value.offset;
        // The dragged row follows the finger and can obscure the destination in hit testing.
        // Compare logical row centres instead, keeping the source at its original position.
        let target = value.from, distance = Infinity, firstTop=Infinity, lastBottom=-Infinity;
        container.current?.querySelectorAll<HTMLElement>('[data-queue-row]').forEach(row => {
            if(row.dataset.queueSection!==value.section)return;
            const index = Number(row.dataset.queueIndex), rect = row.querySelector('.queue-entry-main')!.getBoundingClientRect();
            const top=index===value.from?baseTop:rect.top;
            firstTop=Math.min(firstTop,top);lastBottom=Math.max(lastBottom,top+rect.height);
            const center = top + rect.height / 2;
            if (Math.abs(value.clientY - center) < distance) {
                distance = Math.abs(value.clientY - center);
                target = index;
            }
        });
        // A transformed row contributes to scrollable overflow. Bound it to the
        // real peer rows so holding the last edge cannot grow an endless blank list.
        const offset=Math.max(firstTop,Math.min(lastBottom-sourceBox.height,value.clientY-value.grab))-baseTop;
        if(Math.abs(offset-value.offset)<.1&&target===value.target)return;
        gesture.current={...value,target,offset};
        source.style.transform=`translateY(${offset}px)`;
        setDrag(previous=>previous&&previous.target===target?previous:gesture.current);
    }
    function tick(now:number){const elapsed=now-lastFrame.current;lastFrame.current=now;updateDrag(elapsed);if(gesture.current)frame.current=requestAnimationFrame(tick);}
    function point(event:PointerEvent<HTMLButtonElement>){
        const value=gesture.current;if(!value||value.pointer!==event.pointerId)return;
        const moved=value.moved||Math.abs(event.clientY-value.y)>7;
        gesture.current={...value,clientY:event.clientY,moved};
        if(moved){if(!value.moved)setEditing(null);suppressClick.current=true;updateDrag(0);}
    }
    function finish(event: PointerEvent<HTMLButtonElement>) {
        updateDrag(0);const value = gesture.current;
        if (!value || value.pointer !== event.pointerId)
            return;
        if (value.moved)
            move(value.from, value.target, value.revision);
        cancel();
        if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const duplicates = new Map<string, number>();
    function entry(index:number,section:string){
      const item=state.items[index],position=order.indexOf(index),occurrence=duplicates.get(item.videoId)??0;
      duplicates.set(item.videoId,occurrence+1);const key=`${item.videoId}:${occurrence}`;
      const peers=section==='next'?order.slice(currentAt+1):order.slice(0,currentAt),at=peers.indexOf(index);
      return <div key={key} className={`queue-entry${drag?.from===index?' is-dragging':''}${drag?.target===index&&drag.from!==index?' is-drop-target':''}`} data-queue-row data-queue-index={index} data-queue-key={key} data-queue-section={section} data-drop-side={drag&&order.indexOf(drag.from)<position?'after':'before'} style={drag?.from===index?{transform:`translateY(${gesture.current?.offset??drag.offset}px)`}:undefined}>
       <div className="queue-entry-main"><button className="queue-track" aria-label={msg('Riproduci {p0}',{p0:item.title})} disabled={busy||!!drag} onClick={()=>void run({type:'jump',value:index},msg('In ascolto: {p0}',{p0:item.title}))}><Artwork src={item.thumbnail}/><span><strong><ScrollText>{item.title}</ScrollText></strong><small><ScrollText>{item.artist}</ScrollText></small>{state.automatic?.includes(index)&&<span className="queue-source">{msg('Autoplay')}</span>}</span></button>
        <button className="queue-grip" disabled={busy} aria-label={msg('Sposta: {p0}',{p0:item.title})} aria-expanded={editing===index} aria-describedby="queue-drag-help" onPointerDown={event=>start(event,index)} onPointerMove={point} onPointerUp={finish} onPointerCancel={()=>{suppressClick.current=true;cancel();}} onLostPointerCapture={cancel} onClick={()=>{if(suppressClick.current){suppressClick.current=false;return;}setEditing(editing===index?null:index);}}><GripVertical size={24}/></button>
        <button disabled={busy||!!drag} aria-label={msg('Opzioni: {p0}',{p0:item.title})} aria-expanded={editing===index} onClick={()=>setEditing(editing===index?null:index)}><MoreVertical size={22}/></button>
       </div>{editing===index&&<div className="queue-reorder"><button className="tonal" disabled={busy||at===0} onClick={()=>move(index,peers[at-1])}><ArrowUp size={19}/>{msg('Sposta su')}</button><button className="tonal" disabled={busy||at===peers.length-1} onClick={()=>move(index,peers[at+1])}><ArrowDown size={19}/>{msg('Sposta giù')}</button><button className="text-action" disabled={busy} aria-label={msg('Rimuovi dalla coda: {p0}',{p0:item.title})} onClick={()=>void run({type:'remove',value:{index,revision}},msg('{p0}: rimosso dalla coda',{p0:item.title}))}><Trash2 size={20}/>{msg('Rimuovi')}</button></div>}
      </div>;
    }
    return <Modal workspace label={msg('Coda')} onClose={onClose} actions={<button aria-label={msg('Opzioni della coda')} aria-expanded={options} onClick={()=>setOptions(value=>!value)}><MoreVertical size={23}/></button>}><div className="queue-panel" ref={container} aria-busy={busy}>
  <div className="queue-summary"><span>{state.items.length} {state.items.length===1?msg('brano'):msg('brani')}</span>{state.shuffle&&<span className="shuffle-caption"><Shuffle size={16}/>{msg('Casuale')}</span>}</div>
  {options&&<div className="queue-options"><button className="tonal" disabled={busy||!current} onClick={radio}><Radio size={21}/>{msg('Radio del brano attuale')}</button><button className="text-action" disabled={busy||!current} onClick={()=>void run({type:'remove',value:{index:state.index,revision}},msg('Rimuovi brano attuale'))}><Trash2 size={21}/>{msg('Rimuovi brano attuale')}</button><button className="text-action" disabled={busy||!state.items.length} onClick={clear}><Trash2 size={21}/>{msg('Svuota coda')}</button></div>}
  {current&&<section className="queue-now"><h3>{msg('In ascolto')}</h3><div><Artwork eager src={current.thumbnail}/><span><strong><ScrollText>{current.title}</ScrollText></strong><small><ScrollText>{current.artist}</ScrollText></small></span><button aria-label={state.playing?msg('Pausa'):msg('Riproduci')} onClick={()=>void run({type:state.playing?'pause':'play'},state.playing?msg('Pausa'):msg('In riproduzione'))}>{state.loading?<LoaderCircle className="spin" size={25}/>:state.playing?<Pause size={25}/>:<Play size={25}/>}</button></div></section>}
  <span className="sr-only" role="status">{noticeText(announcement)}</span>
  <p id="queue-drag-help" className="sr-only">{msg('Trascina la maniglia per riordinare. Toccala per usare le frecce.')}</p>
  <div className="queue-scroll" ref={scroll}><div className="queue-next-heading"><h3>{msg('A seguire')}</h3><span>{Math.max(0,order.length-currentAt-1)} {msg('brani')}</span></div>
   {order.length?order.slice(currentAt+1).map(index=>entry(index,'next')):<Empty title={msg('La coda aspetta la tua musica')}>{msg('Aggiungi un brano dal menu accanto a un risultato.')}</Empty>}
   {!!order.length&&currentAt===order.length-1&&<p className="queue-end">{msg('Non ci sono altri brani in coda.')}</p>}
   {currentAt>0&&<details className="queue-previous"><summary>{msg('Già ascoltati')} · {currentAt}</summary>{order.slice(0,currentAt).map(index=>entry(index,'previous'))}</details>}
  </div><footer className="queue-footer"><DiscoveryControls state={state.discovery} change={discoveryChange}/><button className="tonal queue-save" disabled={busy||!state.items.length} onClick={save}><BookmarkPlus size={21}/>{msg('Salva playlist')}</button></footer>
 </div></Modal>;
}
