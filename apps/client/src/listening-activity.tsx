import { noticeText } from './i18n';
import { displayLocale } from '../../../packages/i18n/display';
import { useEffect, useState, useId } from 'react';
import { RefreshCw, Trash2, ShieldCheck } from 'lucide-react';
import { useActivity, updateActivitySettings, clearActivity, excludeActivity, flushActivity } from './activity-controller';
import { TrackCatalogLinks } from './catalog-navigation';
import { t } from './i18n';
import type { ActivityReason, ActivitySettings } from '../../../packages/domain/activity';
const reasons: Record<ActivityReason, Parameters<typeof t>[0]> = { completed: 'activity.completed', skip: 'activity.skip', replay: 'activity.replay', change: 'activity.change', error: 'activity.error', interrupted: 'activity.interrupted' };
const time = (ms: number) => { const seconds = Math.floor(ms / 1000); return seconds < 60 ? t('activity.seconds', { value: seconds }) : t('activity.minutes', { value: Math.floor(seconds / 60), seconds: seconds % 60 }); };
export function ActivityPrivacy() {
    const { data, ready, busy, error } = useActivity();
    const id = useId();
    return <section className="activity-privacy" aria-labelledby={`${id}-title`}><h3 id={`${id}-title`}>{t('activity.privacyTitle')}</h3>
    <div className="settings-row"><div><strong id={`${id}-label`}>{t('activity.private')}</strong><p id={`${id}-hint`}>{t('activity.privateHint')}</p></div><button type="button" className="secondary-button" role="switch" aria-checked={!!data?.settings.privateMode} aria-labelledby={`${id}-label`} aria-describedby={`${id}-hint`} disabled={!ready || busy} onClick={() => void updateActivitySettings(!data?.settings.privateMode, data?.settings.retentionDays ?? 180)}>{t(data?.settings.privateMode ? 'activity.enabled' : 'activity.disabled')}</button></div>
    <label className="activity-retention">{t('activity.retention')}<select value={data?.settings.retentionDays ?? 180} disabled={!ready || busy} onChange={e => void updateActivitySettings(!!data?.settings.privateMode, Number(e.target.value) as ActivitySettings['retentionDays'])}>{[90, 180, 365].map(days => <option key={days} value={days}>{t('activity.days', { days })}</option>)}</select></label>
    <p className="activity-note">{t('activity.localHint')}</p>{error && <p role="alert" className="form-error">{noticeText(error)}</p>}
  </section>;
}
export function PrivateIndicator() { const active = useActivity(s => s.data?.settings.privateMode); return active ? <span className="activity-private-indicator" title={t('activity.privateHint')}><ShieldCheck size={16}/>{t('activity.private')}</span> : null; }
export function ListeningActivity() {
    const { data, loading, busy, error } = useActivity();
    const [confirm, setConfirm] = useState(false);
    const refresh = async () => { await flushActivity(); await useActivity.getState().load(); };
    useEffect(() => { void refresh(); const interval = window.setInterval(() => void useActivity.getState().load(), 15000); return () => clearInterval(interval); }, []);
    return <div className="listening-activity"><div className="library-section-head"><div><h2>{t('activity.title')}</h2><p>{t('activity.intro')}</p></div><button className="secondary-button" onClick={() => void refresh()} disabled={loading || busy}><RefreshCw size={16}/>{t('activity.refresh')}</button></div>
    {!data && loading && <p role="status">{t('activity.loading')}</p>}{error && !data && <div className="form-error" role="alert">{noticeText(error)}<button className="text-button" onClick={() => void refresh()}>{t('App.riprova')}</button></div>}
    {data && <><dl className="activity-summary"><div><dt>{t('activity.total')}</dt><dd>{time(data.summary.listenedMs)}</dd></div><div><dt>{t('activity.sessions')}</dt><dd>{data.summary.sessions}</dd></div><div><dt>{t('activity.completed')}</dt><dd>{data.summary.completed}</dd></div><div><dt>{t('activity.skip')}</dt><dd>{data.summary.skips}</dd></div><div><dt>{t('activity.replays')}</dt><dd>{data.summary.replays}</dd></div></dl>
      <ActivityPrivacy />
      <div className="library-section-head activity-events-heading"><div><h3>{t('activity.recent')}</h3><p>{t('activity.recentHint')}</p></div><button className="secondary-button" disabled={busy || (!data.summary.sessions && !data.legacyStarts)} onClick={() => setConfirm(true)}><Trash2 size={16}/>{t('activity.clear')}</button></div>
      {confirm && <div className="activity-confirm" role="group" aria-label={t('activity.confirmTitle')}><p>{t('activity.confirmHint')}</p><div><button className="secondary-button" disabled={busy} onClick={() => setConfirm(false)}>{t('library-ui.annulla')}</button><button className="danger-button" disabled={busy} onClick={async () => {
                    if (await clearActivity())
                        setConfirm(false);
                }}>{t('activity.confirmClear')}</button></div></div>}
      {data.items.length ? <ol className="activity-events">{data.items.map(item => <li key={item.id} className="activity-event"><div className="activity-event-track"><strong>{item.track.title}</strong><TrackCatalogLinks track={item.track}/><time dateTime={new Date(item.startedAt).toISOString()}>{new Date(item.startedAt).toLocaleString(displayLocale(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</time></div><div className="activity-event-measure"><span>{time(item.listenedMs)}</span><small>{t(item.reason ? reasons[item.reason] : 'activity.open')}{item.replay ? ` · ${t('activity.repeated')}` : ''}</small><small>{t('activity.seeks', { count: item.seeks })}</small></div><div className="activity-event-action"><button type="button" className="text-button" disabled={busy} aria-pressed={item.excluded} aria-label={t(item.excluded ? 'activity.includeLabel' : 'activity.excludeLabel', { title: item.track.title })} onClick={() => void excludeActivity(item.id, !item.excluded)}>{t(item.excluded ? 'activity.include' : 'activity.exclude')}</button><small>{t(item.excluded ? 'activity.excluded' : item.tasteWeight === 0 ? 'activity.zeroWeight' : item.tasteWeight < 1 ? 'activity.lowWeight' : 'activity.normalWeight')}</small></div></li>)}</ol> : <div className="activity-empty"><h3>{t(data.settings.privateMode ? 'activity.privateEmpty' : 'activity.empty')}</h3><p>{t(data.settings.privateMode ? 'activity.privateEmptyHint' : 'activity.emptyHint')}</p></div>}
      {data.legacyStarts > 0 && <p className="activity-note">{t('activity.legacy', { count: data.legacyStarts })}</p>}
      <p className="activity-note">{t('activity.completionHint')}</p>
    </>}
  </div>;
}
