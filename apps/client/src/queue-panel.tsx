import { noticeText } from './i18n';
import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronUp, ChevronDown, SkipForward, X, ListMusic, Save, Trash2, AudioLines, GripVertical } from 'lucide-react';
import { usePlayer } from './store';
import { useShallow } from 'zustand/react/shallow';
import { useLibrary } from './library';
import { Button, Cover } from './ui-controls';
import { ExcludedBadge } from './listening-preferences';
import { SleepTimerControl } from './sleep-timer';
import { moveWithMotion } from './queue-motion';
import { isExcluded, upcomingTracks } from '../../../packages/domain/listening';
import { formatTime, type Track, type QueueItem } from '../../../packages/domain/index';
import { t } from './i18n';
import { RadioQueueStatus } from './radio-ui';
import { AutoplayControl } from './autoplay-ui';
import { ScrollingLine } from './player-track-info';
export function QueuePanel() {
    const s = usePlayer(useShallow(state => ({ queue: state.queue, index: state.index, shuffle: state.shuffle, shufflePlan: state.shufflePlan, exclusions: state.exclusions, priorityIds: state.priorityIds, select: state.select, remove: state.remove, removeMany: state.removeMany, prioritize: state.prioritize, clearUpcoming: state.clearUpcoming }))), busy = useLibrary(l => l.busy), [selected, setSelected] = useState<string[]>([]), [notice, setNotice] = useState(''), [error, setError] = useState(''), [name, setName] = useState(''), [editing, setEditing] = useState(false), [scope, setScope] = useState<'all' | 'next' | 'selected'>('all'), [snapshot, setSnapshot] = useState<{
        all: Track[];
        next: Track[];
        selected: Track[];
    } | null>(null);
    const [visible, setVisible] = useState(60);
    const indexes = useMemo(() => new Map(s.queue.map((track, index) => [track.queueId, index])), [s.queue]);
    const root = useRef<HTMLDivElement>(null), drag = useRef<number | null>(null), current = s.queue[s.index];
    const upcoming = upcomingTracks(s.queue, s.index, s.shuffle, s.shufflePlan, s.exclusions, s.priorityIds), nextId = upcoming[0]?.queueId;
    useEffect(() => { setSelected(old => { const next = old.filter(id => s.queue.some(t => t.queueId === id) && id !== current?.queueId); return next.length === old.length ? old : next; }); }, [s.queue, current?.queueId]);
    useEffect(() => setVisible(60), [current?.queueId, editing]);
    const move = (from: number, to: number) => moveWithMotion(root.current, () => usePlayer.getState().move(from, to));
    const saveTracks = snapshot?.[scope] ?? [];
    const renderRow = (track: QueueItem, i: number, ordinal: number) => (<div className={`queue-row ${i === s.index ? 'current' : track.queueId === nextId ? 'upcoming' : ''}`} key={track.queueId} data-queue-id={track.queueId} draggable onDragStart={e => {
            if ((e.target as HTMLElement).closest('input,button')) {
                e.preventDefault();
                return;
            }
            drag.current = i;
        }} onDragEnd={() => drag.current = null} onDragOver={e => e.preventDefault()} onDrop={e => {
            e.preventDefault();
            if (drag.current !== null)
                move(drag.current, i);
            drag.current = null;
        }}>{editing ? <input type="checkbox" className="queue-select" aria-label={t('queueTools.select', { title: track.title, number: i + 1 })} disabled={i === s.index} checked={selected.includes(track.queueId)} onChange={e => setSelected(e.target.checked ? [...selected, track.queueId] : selected.filter(id => id !== track.queueId))}/> : <span className="queue-number">{i === s.index ? <AudioLines size={18}/> : ordinal}</span>}<Cover track={track} slot={i === s.index ? 'current-cover' : `queue-cover-${i < s.index ? i : i - 1}`}/><button className="queue-title" disabled={isExcluded(track, s.exclusions)} onClick={() => s.select(i)}><strong title={track.title}>{track.title}</strong><small title={track.artist}>{track.artist}</small><span className="queue-source">{i === s.index ? t('queueTools.current') : s.priorityIds.includes(track.queueId) ? t('queueTools.priority') : track.source === 'autoplay' ? t('autoplay.from', { title: track.suggestedFrom?.title ?? '' }) : track.source === 'radio' ? t('radio.suggestion') : track.source === 'manual' ? t('queueTools.manual') : track.source === 'collection' ? t('queueTools.collection') : t('queueTools.entry')}</span>{track.suggestedFrom && <ScrollingLine as="span" className="queue-autoplay-origin" resetKey={track.queueId + ':' + (i === s.index ? 'current' : s.priorityIds.includes(track.queueId) ? 'priority' : 'next')} text={(i === s.index ? t('queueTools.current') + ' · ' : s.priorityIds.includes(track.queueId) ? t('queueTools.priority') + ' · ' : '') + t('autoplay.from', { title: track.suggestedFrom.title })}>{i === s.index ? <>{t('queueTools.current')} · </> : s.priorityIds.includes(track.queueId) ? <>{t('queueTools.priority')} · </> : null}{t('autoplay.from', { title: track.suggestedFrom.title })}</ScrollingLine>}<ExcludedBadge track={track}/></button><span className="queue-duration">{formatTime(track.duration)}</span>{editing ? <div className="queue-actions"><Button label={t('queueTools.playAfter', { title: track.title })} disabled={i === s.index || isExcluded(track, s.exclusions)} onClick={() => { s.prioritize(track.queueId); setNotice(t('queueTools.afterNotice', { title: track.title })); }}><SkipForward size={16}/></Button><Button label={t('App.sposta.su', { p0: track.title })} disabled={i === 0} onClick={() => move(i, i - 1)}><ChevronUp size={15}/></Button><Button label={t('App.sposta.giu', { p0: track.title })} disabled={i === s.queue.length - 1} onClick={() => move(i, i + 1)}><ChevronDown size={15}/></Button><Button label={t('App.rimuovi', { p0: track.title })} onClick={() => s.remove(track.queueId)}><X size={15}/></Button></div> : i !== s.index ? <GripVertical className="queue-grip" size={18} aria-hidden="true"/> : null}</div>);
    return <div className="queue-body queue-tools" ref={root} data-total-count={s.queue.length}><AutoplayControl /><RadioQueueStatus /><div className="queue-current-heading"><h2>{t('queueTools.current')}</h2></div>{current && renderRow(current, s.index, 0)}<div className="queue-next-heading"><h2>{t('ui3.queueNext')}</h2><button className="text-button" aria-pressed={editing} onClick={() => setEditing(!editing)}>{t(editing ? 'ui3.queueDone' : 'ui3.queueEdit')}</button></div>{editing && <SleepTimerControl />}
    {editing && s.queue.length > 0 && <><div className="queue-toolbar"><button className="secondary-button" disabled={!s.queue.some(t => t.queueId !== current?.queueId)} onClick={() => setSelected(selected.length ? [] : s.queue.filter(t => t.queueId !== current?.queueId).map(t => t.queueId))}>{selected.length ? t('queueTools.deselect') : t('queueTools.selectAll')}</button><button className="secondary-button" disabled={!selected.length} onClick={() => { s.removeMany(selected); setNotice(t('queueTools.removed', { count: selected.length })); setSelected([]); }}><Trash2 size={16}/>{t('queueTools.removeSelected', { count: selected.length })}</button><button className="secondary-button" disabled={!s.queue.some((item, i) => item.queueId !== current?.queueId && (s.shuffle ? !(s.shufflePlan.consumed ?? []).includes(item.queueId) : i > s.index))} onClick={() => { s.clearUpcoming(); setNotice(t('queueTools.cleared')); }}>{t('queueTools.clear')}</button><button className="secondary-button" disabled={busy} onClick={() => { setSnapshot({ all: [...s.queue], next: current ? [current, ...upcoming] : [...upcoming], selected: s.queue.filter(t => selected.includes(t.queueId)) }); setScope(selected.length ? 'selected' : 'all'); setName(t('queueTools.defaultName')); setError(''); }}><Save size={16}/>{t('queueTools.save')}</button></div>
    {snapshot && <form className="queue-save" onSubmit={async (e) => {
                    e.preventDefault();
                    setError('');
                    const result = await useLibrary.getState().saveQueue(name.trim(), saveTracks);
                    if (result) {
                        setNotice(t('queueTools.saved', { name: result.name, count: result.count }));
                        setSnapshot(null);
                    }
                    else
                        setError(useLibrary.getState().error ?? t('queueTools.saveError'));
                }}><h3>{t('queueTools.save')}</h3><p>{t('queueTools.snapshotHint')}</p><label>{t('queueTools.scope')}<select aria-label={t('queueTools.scope')} disabled={busy} value={scope} onChange={e => setScope(e.target.value as typeof scope)}><option value="all">{t('queueTools.allScope')}</option><option value="next">{t('queueTools.nextScope')}</option><option value="selected" disabled={!snapshot.selected.length}>{t('queueTools.selectedScope')}</option></select></label><label>{t('queueTools.name')}<input aria-label={t('queueTools.name')} required maxLength={100} disabled={busy} value={name} onChange={e => setName(e.target.value)}/></label><p>{t('queueTools.saveCount', { count: saveTracks.length })}</p>{error && <p className="form-error" role="alert">{noticeText(error)}</p>}<div><button type="submit" className="primary-button" disabled={busy || !name.trim() || !saveTracks.length}>{busy ? t('App.caricamento') : t('queueTools.confirmSave')}</button><button type="button" className="text-button" disabled={busy} onClick={() => setSnapshot(null)}>{t('library-ui.annulla')}</button></div></form>}
    <p className="queue-order-hint">{t(s.shuffle ? 'queueTools.shuffleHint' : 'queueTools.orderedHint')}</p></>}
    {notice && <p role="status" className="queue-feedback">{noticeText(notice)}</p>}
    {(editing ? s.queue.filter(track => track.queueId !== current?.queueId) : upcoming).slice(0, visible).map((track, ordinal) => renderRow(track, indexes.get(track.queueId)!, ordinal + 1))}
    {(editing ? s.queue.length - 1 : upcoming.length) > visible && <button className="secondary-button queue-load-more" onClick={() => setVisible(n => n + 60)}>{t("App.mostra.altri.brani")} <span>({Math.min(visible, upcoming.length)}/{editing ? s.queue.length - 1 : upcoming.length})</span></button>}
    {!current && <div className="queue-empty"><ListMusic size={30}/><h3>{t('App.la.tua.prossima.sequenza')}</h3><p>{t('App.aggiungi.brani.dai.risultati.di.ricerca')}</p></div>}

    <p className="queue-help" hidden={!editing}>{t('queueTools.help')}</p>
  </div>;
}
