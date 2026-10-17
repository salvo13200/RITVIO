import { noticeText } from './i18n';
import { useEffect, useMemo, useState, useRef, useId } from 'react';
import { CheckSquare, Copy, ListPlus, ArrowRight, Trash2, Undo2, ArrowUpToLine, ArrowDownToLine, X } from 'lucide-react';
import type { PersonalPlaylist, PlaylistItem } from '../../../packages/domain/index';
import { duplicatePlaylistItems, selectedPlaylistItems } from '../../../packages/domain/playlist-tools';
import { useLibrary } from './library';
import { usePlayer } from './store';
import { api } from './api';
import { t } from './i18n';
type Plan = {
    kind: 'remove' | 'duplicates';
    playlist: PersonalPlaylist;
    items: PlaylistItem[];
} | {
    kind: 'copy' | 'move';
    playlist: PersonalPlaylist;
    items: PlaylistItem[];
} | {
    kind: 'duplicate';
    playlist: PersonalPlaylist;
};
export function usePlaylistSelection(playlist: PersonalPlaylist | null) {
    const [enabled, setEnabled] = useState(false), [ids, setIds] = useState<string[]>([]);
    useEffect(() => { setEnabled(false); setIds([]); }, [playlist?.id]);
    useEffect(() => { const valid = new Set(playlist?.items.map(item => item.id)); setIds(previous => previous.filter(id => valid.has(id))); }, [playlist?.id, playlist?.revision]);
    return { enabled, ids, setIds, setEnabled, toggle: (id: string) => setIds(previous => previous.includes(id) ? previous.filter(key => key !== id) : [...previous, id]) };
}
export function PlaylistSelectionBox({ item, checked, disabled, toggle }: {
    item: PlaylistItem;
    checked: boolean;
    disabled: boolean;
    toggle: () => void;
}) {
    return <label className="playlist-selection-check"><input type="checkbox" checked={checked} disabled={disabled} onChange={toggle} aria-label={t('playlistTools.selectEntry', { title: item.track.title })}/><span className="sr-only">{t('playlistTools.selectEntry', { title: item.track.title })}</span></label>;
}
export function PlaylistTools({ playlist, matches, canReorder, selection, withReorderMotion }: {
    playlist: PersonalPlaylist;
    matches: PlaylistItem[];
    canReorder: boolean;
    selection: ReturnType<typeof usePlaylistSelection>;
    withReorderMotion?: (commit: () => Promise<boolean>) => Promise<boolean>;
}) {
    const library = useLibrary(), { busy } = library;
    const [plan, setPlan] = useState<Plan | null>(null), [feedback, setFeedback] = useState('');
    const trigger = useRef<HTMLButtonElement | null>(null);
    const openPlan = (next: Plan, button: HTMLButtonElement) => { trigger.current = button; setPlan(next); };
    const closePlan = () => {
        setPlan(null);
        const button = trigger.current;
        requestAnimationFrame(() => {
            if (button?.isConnected)
                button.focus();
        });
    };
    const [actionsOpen, setActionsOpen] = useState(() => window.matchMedia('(min-width:721px)').matches);
    useEffect(() => { const media = window.matchMedia('(min-width:721px)'); const update = () => setActionsOpen(media.matches); media.addEventListener('change', update); return () => media.removeEventListener('change', update); }, []);
    const selected = useMemo(() => selectedPlaylistItems(playlist.items, selection.ids), [playlist.items, selection.ids]);
    const duplicates = useMemo(() => duplicatePlaylistItems(playlist.items), [playlist.items]);
    const hidden = selected.filter(item => !matches.some(match => match.id === item.id)).length;
    useEffect(() => { setPlan(null); setFeedback(''); }, [playlist.id, playlist.revision]);
    const reorder = async (end: boolean) => {
        const selectedIds = new Set(selected.map(item => item.id)), others = playlist.items.filter(item => !selectedIds.has(item.id));
        const commit = () => library.reorderItems(playlist, (end ? [...others, ...selected] : [...selected, ...others]).map(item => item.id));
        if (await (withReorderMotion ? withReorderMotion(commit) : commit()))
            setFeedback(t('playlistTools.reordered'));
    };
    return <section className="playlist-tools" aria-label={t('playlistTools.tools')}>
    <div className="playlist-tools-row">
      <button className="secondary-button" disabled={busy || (!selection.enabled && !playlist.items.length)} aria-pressed={selection.enabled} onClick={() => { selection.setEnabled(!selection.enabled); selection.setIds([]); setPlan(null); }}><CheckSquare size={17}/>{t(selection.enabled ? 'playlistTools.finish' : 'playlistTools.select')}</button>
      <button className="text-button" disabled={busy} onClick={e => openPlan({ kind: 'duplicate', playlist }, e.currentTarget)}><Copy size={16}/>{t('playlistTools.duplicate')}</button>
      <button className="text-button" disabled={busy || !duplicates.length} onClick={e => openPlan({ kind: 'duplicates', playlist, items: duplicates }, e.currentTarget)}>{t('playlistTools.duplicates', { count: duplicates.length })}</button>
      {playlist.undo && <button className="secondary-button" disabled={busy} onClick={async () => {
                if (await library.undo())
                    setFeedback(t('playlistTools.undone'));
            }}><Undo2 size={17}/>{t('playlistTools.undo', { count: playlist.undo.count })}</button>}
    </div>
    {playlist.undo && <p className="playlist-tools-note">{t(playlist.undo.kind === 'move' ? 'playlistTools.undoMoveNote' : 'playlistTools.undoNote', { name: playlist.undo.targetName ?? '' })}</p>}
    {selection.enabled && <details className="playlist-bulk-actions" open={actionsOpen} onToggle={e => setActionsOpen(e.currentTarget.open)}>
      <summary>{t('playlistTools.selectionActions', { count: selected.length })}{hidden > 0 && <span className="playlist-tools-note"> · {t('playlistTools.hidden', { count: hidden })}</span>}</summary>
      <div className="playlist-tools-row playlist-selection-toolbar">
        <strong>{t('playlistTools.selected', { count: selected.length })}</strong>
        <button className="text-button" disabled={busy || !matches.length} onClick={() => selection.setIds([...new Set([...selection.ids, ...matches.map(item => item.id)])])}>{t('playlistTools.selectMatches', { count: matches.length })}</button>
        <button className="text-button" disabled={busy || !selected.length} onClick={() => selection.setIds([])}>{t('playlistTools.clear')}</button>
        {hidden > 0 && <span className="playlist-tools-note">{t('playlistTools.hidden', { count: hidden })}</span>}
      </div>
      <div className="playlist-tools-row">
        <button className="secondary-button" disabled={busy || !selected.length} onClick={e => openPlan({ kind: 'copy', playlist, items: selected }, e.currentTarget)}><Copy size={16}/>{t('playlistTools.copy')}</button>
        <button className="secondary-button" disabled={busy || !selected.length || !library.data?.playlists.some(item => item.id !== playlist.id)} onClick={e => openPlan({ kind: 'move', playlist, items: selected }, e.currentTarget)}><ArrowRight size={16}/>{t('playlistTools.move')}</button>
        <button className="secondary-button" disabled={busy || !selected.length} onClick={e => openPlan({ kind: 'remove', playlist, items: selected }, e.currentTarget)}><Trash2 size={16}/>{t('playlistTools.remove')}</button>
        <button className="text-button" disabled={busy || !selected.length || !canReorder} onClick={() => void reorder(false)}><ArrowUpToLine size={16}/>{t('playlistTools.first')}</button>
        <button className="text-button" disabled={busy || !selected.length || !canReorder} onClick={() => void reorder(true)}><ArrowDownToLine size={16}/>{t('playlistTools.last')}</button>
        <button className="text-button" disabled={busy || !selected.length} onClick={() => setFeedback(t(usePlayer.getState().enqueueMany(selected.map(item => item.track)) ? 'playlistTools.queued' : 'playlistTools.queueFailed'))}><ListPlus size={16}/>{t('playlistTools.queue')}</button>
      </div>
    </details>}
    <p className="playlist-tools-feedback" role="status">{feedback}</p>
    {plan && <PlaylistPlan key={`${plan.kind}:${plan.playlist.revision}`} plan={plan} close={closePlan} completed={(message) => { setFeedback(message); selection.setIds([]); setPlan(null); }}/>}
  </section>;
}
function PlaylistPlan({ plan, close, completed }: {
    plan: Plan;
    close: () => void;
    completed: (message: string) => void;
}) {
    const heading = useRef<HTMLHeadingElement>(null), headingId = useId();
    useEffect(() => {
        const frame = requestAnimationFrame(() => { heading.current?.focus({ preventScroll: true }); heading.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion:reduce)').matches ? 'instant' : 'smooth' }); });
        return () => cancelAnimationFrame(frame);
    }, [plan]);
    const library = useLibrary(), [targetId, setTargetId] = useState(''), [target, setTarget] = useState<PersonalPlaylist | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState(''), [skip, setSkip] = useState(false), [name, setName] = useState(t('playlistTools.copyName', { name: plan.playlist.name }).slice(0, 100));
    const [removeIds, setRemoveIds] = useState(plan.kind === 'duplicates' ? plan.items.map(item => item.id) : []);
    useEffect(() => {
        let active = true;
        setTarget(null);
        setError('');
        setLoading(!!targetId);
        if (targetId)
            void api.library.playlist(targetId).then(value => {
                if (active)
                    setTarget(value);
            }).catch(e => {
                if (active)
                    setError(e.message);
            }).finally(() => {
                if (active)
                    setLoading(false);
            });
        return () => { active = false; };
    }, [targetId]);
    const items = plan.kind === 'duplicate' ? [] : plan.items;
    const conflicts = target ? items.filter(item => target.items.some(existing => existing.track.id === item.track.id)).length : 0;
    const transferItems = useMemo(() => {
        if (!skip)
            return items;
        const seen = new Set(target?.items.map(item => item.track.id));
        return items.filter(item => {
            if (seen.has(item.track.id))
                return false;
            seen.add(item.track.id);
            return true;
        });
    }, [items, target, skip]);
    const submitting = library.busy || loading, tooMany = !!target && target.count + transferItems.length > 1000;
    const submit = async () => {
        setError('');
        let ok = false;
        if (plan.kind === 'duplicate')
            ok = !!await library.duplicate(name.trim());
        else if (plan.kind === 'remove' || plan.kind === 'duplicates')
            ok = await library.removeMany(plan.playlist, plan.kind === 'duplicates' ? removeIds : items.map(item => item.id));
        else if (target)
            ok = await library.transfer(plan.playlist, { mode: plan.kind, itemIds: transferItems.map(item => item.id), targetId: target.id, targetRevision: target.revision });
        if (ok)
            completed(t('playlistTools.done'));
        else
            setError(useLibrary.getState().error ?? t('playlistTools.failed'));
    };
    return <div className="playlist-plan" role="region" aria-labelledby={headingId}>
    <div className="playlist-plan-heading"><h3 ref={heading} id={headingId} tabIndex={-1}>{t(`playlistTools.plan.${plan.kind}`)}</h3><button className="icon-button" disabled={library.busy} aria-label={t('playlistTools.cancelPreview')} onClick={close}><X size={18}/></button></div>
    {plan.kind === 'duplicate' ? <><p>{t('playlistTools.duplicateNote', { count: plan.playlist.count })}</p><label>{t('playlistTools.newName')}<input aria-label={t('playlistTools.newName')} required maxLength={100} value={name} onChange={e => setName(e.target.value)}/></label></> : <>
      <p>{t(plan.kind === 'duplicates' ? 'playlistTools.duplicatesNote' : 'playlistTools.previewCount', { count: items.length })}</p>
      <ol className="playlist-preview-list">{items.map(item => <li key={item.id}>{plan.kind === 'duplicates' && <label className="playlist-selection-check"><input type="checkbox" aria-label={t('playlistTools.removeCopy', { title: item.track.title })} checked={removeIds.includes(item.id)} disabled={submitting} onChange={() => setRemoveIds(previous => previous.includes(item.id) ? previous.filter(id => id !== item.id) : [...previous, item.id])}/></label>}<span><strong>{item.track.title}</strong><small>{item.track.artist}</small></span><span className="playlist-tools-note">{t('playlistTools.position', { count: plan.playlist.items.findIndex(entry => entry.id === item.id) + 1 })}</span></li>)}</ol>
      {(plan.kind === 'copy' || plan.kind === 'move') && <>
        <label>{t('playlistTools.destination')}<select aria-label={t('playlistTools.destination')} value={targetId} disabled={library.busy} onChange={e => setTargetId(e.target.value)}><option value="">{t('playlistTools.chooseDestination')}</option>{library.data?.playlists.filter(item => plan.kind === 'copy' || item.id !== plan.playlist.id).map(item => <option key={item.id} value={item.id}>{item.name} ({item.count})</option>)}</select></label>
        {loading && <p role="status">{t('playlistTools.loadingDestination')}</p>}
        {target && <><p>{t('playlistTools.destinationCount', { name: target.name, before: target.count, after: target.count + transferItems.length })}</p><p>{t('playlistTools.conflicts', { count: conflicts })}</p><label className="playlist-option"><input type="checkbox" checked={skip} disabled={submitting} onChange={e => setSkip(e.target.checked)}/>{t('playlistTools.skipCopies')}</label>{plan.kind === 'move' && <p>{t('playlistTools.moveNote', { count: transferItems.length })}</p>}{tooMany && <p className="form-error" role="alert">{t('playlistTools.limit')}</p>}</>}
      </>}
    </>}
    {error && <p className="form-error" role="alert">{noticeText(error)}</p>}
    <div className="playlist-tools-row"><button className="primary-button" disabled={submitting || (plan.kind === 'duplicate' ? !name.trim() : plan.kind === 'duplicates' ? !removeIds.length : plan.kind === 'copy' || plan.kind === 'move' ? !target || tooMany || !transferItems.length : false)} onClick={() => void submit()}>{t(`playlistTools.confirm.${plan.kind}`)}</button><button className="text-button" disabled={library.busy} onClick={close}>{t('library-ui.annulla')}</button></div>
  </div>;
}
