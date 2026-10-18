import { noticeText } from './messages';
import { msg } from './messages';
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { ArrowDown, ArrowUp, BookmarkPlus, GripVertical, Trash2, Shuffle, Radio } from 'lucide-react';
import type { MobileCommand, MobilePlayback } from '../../../packages/domain/mobile';
import { Artwork, Empty, ScrollText } from './ui';
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
};
export function QueuePanel({ state, command, discoveryChange, save, clear, radio }: {
    state: MobilePlayback;
    command: (input: MobileCommand) => Promise<boolean>;
    discoveryChange: React.ComponentProps<typeof DiscoveryControls>['change'];
    save: () => void;
    clear: () => void;
    radio: () => void;
}) {
    const order = orderedQueue(state), revision = state.queueRevision ?? 0;
    const [busy, setBusy] = useState(false), [editing, setEditing] = useState<number | null>(null), [drag, setDrag] = useState<Drag | null>(null), [announcement, setAnnouncement] = useState('');
    const gesture = useRef<Drag | null>(null), container = useRef<HTMLDivElement>(null), suppressClick = useRef(false), pending = useRef(false);
    const nodes = useRef(new Map<string, DOMRect>());
    const current = state.items[state.index], currentAt = order.indexOf(state.index);
    function cancel() { gesture.current = null; setDrag(null); }
    useEffect(() => { cancel(); setEditing(null); }, [revision]);
    useEffect(() => { window.addEventListener('blur', cancel); return () => window.removeEventListener('blur', cancel); }, []);
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
        const row = event.currentTarget.closest<HTMLElement>('[data-queue-row]')!, bounds = row.getBoundingClientRect(), sheet = container.current?.closest<HTMLElement>('.sheet-content');
        gesture.current = { pointer: event.pointerId, from: index, target: index, y: event.clientY, offset: 0, revision, moved: false, center: bounds.top + bounds.height / 2, scrollTop: sheet?.scrollTop ?? 0 };
        event.currentTarget.setPointerCapture(event.pointerId);
    }
    function point(event: PointerEvent<HTMLButtonElement>) {
        const value = gesture.current;
        if (!value || value.pointer !== event.pointerId)
            return;
        const offset = event.clientY - value.y, moved = value.moved || Math.abs(offset) > 7;
        if (!moved)
            return;
        // The dragged row follows the finger and can obscure the destination in hit testing.
        // Compare logical row centres instead, keeping the source at its original position.
        const sheet = container.current?.closest<HTMLElement>('.sheet-content');
        let target = value.from, distance = Infinity;
        container.current?.querySelectorAll<HTMLElement>('[data-queue-row]').forEach(row => {
            const index = Number(row.dataset.queueIndex), rect = row.getBoundingClientRect();
            const center = index === value.from ? value.center - ((sheet?.scrollTop ?? 0) - value.scrollTop) : rect.top + rect.height / 2;
            if (Math.abs(event.clientY - center) < distance) {
                distance = Math.abs(event.clientY - center);
                target = index;
            }
        });
        gesture.current = { ...value, target, offset, moved };
        setDrag(gesture.current);
        suppressClick.current = true;
        // Scroll only the sheet and only near its edges; ordinary list swipes retain native scrolling.
        const bounds = sheet?.getBoundingClientRect();
        if (sheet && bounds) {
            if (event.clientY > bounds.bottom - 64)
                sheet.scrollTop += 18;
            else if (event.clientY < bounds.top + 100)
                sheet.scrollTop -= 18;
        }
    }
    function finish(event: PointerEvent<HTMLButtonElement>) {
        const value = gesture.current;
        if (!value || value.pointer !== event.pointerId)
            return;
        if (value.moved)
            move(value.from, value.target, value.revision);
        cancel();
        if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const duplicates = new Map<string, number>();
    return <div className="queue-panel" ref={container} aria-busy={busy}>
  <DiscoveryControls state={state.discovery} change={discoveryChange}/>
  <div className="queue-summary"><span>{state.items.length} {state.items.length === 1 ? msg("brano") : msg("brani")}{" " + msg("\u00B7 sul dispositivo")}</span>{state.shuffle && <span className="shuffle-caption"><Shuffle size={16}/>{msg("Casuale")}</span>}</div>
  {!!state.items.length && <><div className="queue-actions"><button className="tonal" disabled={busy} onClick={save}><BookmarkPlus size={20}/>{msg("Salva playlist")}</button><button disabled={busy} aria-label={msg("Radio del brano attuale")} onClick={radio}><Radio size={22}/></button><button disabled={busy} aria-label={msg("Svuota coda")} onClick={clear}><Trash2 size={21}/></button></div><p className="queue-help">{msg("Trascina la maniglia per riordinare. Toccala per usare le frecce.")}</p></>}
  <span className="sr-only" role="status">{noticeText(announcement)}</span>
  {order.length ? order.map((index, position) => {
            const item = state.items[index], occurrence = duplicates.get(item.videoId) ?? 0;
            duplicates.set(item.videoId, occurrence + 1);
            const key = `${item.videoId}:${occurrence}`;
            return <div key={key} className={`queue-entry${index === state.index ? ' is-current' : ''}${drag?.from === index ? ' is-dragging' : ''}${drag?.target === index && drag.from !== index ? ' is-drop-target' : ''}`} data-queue-row data-queue-index={index} data-queue-key={key} style={drag?.from === index ? { transform: `translateY(${drag.offset}px)` } : undefined}>
    {(position === currentAt || position === currentAt + 1) && <h3>{position === currentAt ? msg("In ascolto") : 'A seguire'}</h3>}
    <div className="queue-entry-main"><button className="queue-track" aria-current={index === state.index ? 'true' : undefined} aria-label={msg("Riproduci {p0}", { p0: item.title })} disabled={busy || !!drag} onClick={() => void run({ type: 'jump', value: index }, msg("In ascolto: {p0}", { p0: item.title }))}><Artwork trackId={item.videoId} src={item.thumbnail}/><span><strong><ScrollText>{item.title}</ScrollText></strong><small><ScrollText>{item.artist}</ScrollText></small>{state.automatic?.includes(index) && <span className="queue-source">{msg("Autoplay")}</span>}</span></button>
     <button className="queue-grip" disabled={busy} aria-label={msg("Sposta: {p0}", { p0: item.title })} aria-expanded={editing === index} onPointerDown={event => start(event, index)} onPointerMove={point} onPointerUp={finish} onPointerCancel={() => { suppressClick.current = true; cancel(); }} onLostPointerCapture={cancel} onClick={() => {
                    if (suppressClick.current) {
                        suppressClick.current = false;
                        return;
                    }
                    setEditing(editing === index ? null : index);
                }}><GripVertical size={23}/></button>
     <button disabled={busy} aria-label={msg("Rimuovi dalla coda: {p0}", { p0: item.title })} onClick={() => void run({ type: 'remove', value: { index, revision } }, `${item.title}: rimosso dalla coda`)}><Trash2 size={20}/></button>
    </div>
    {editing === index && <div className="queue-reorder"><button className="tonal" disabled={busy || position === 0} onClick={() => move(index, order[position - 1])}><ArrowUp size={19}/>{msg("Sposta su")}</button><button className="tonal" disabled={busy || position === order.length - 1} onClick={() => move(index, order[position + 1])}><ArrowDown size={19}/>{msg("Sposta gi\u00F9")}</button></div>}
   </div>;
        }) : <Empty title={msg("La coda aspetta la tua musica")}>{msg("Aggiungi un brano dal menu accanto a un risultato.")}</Empty>}
  {current && <p className="source-date">{state.shuffle ? msg("Ordine di ascolto del casuale. ") : msg("Ordine di ascolto. ")}{msg("Il brano continua mentre organizzi la coda. Il riordino non modifica la playlist originale.")}</p>}
 </div>;
}
