import {useId, useSyncExternalStore} from 'react';
import {ArrowUpRight, Download, RefreshCw, X} from 'lucide-react';
import {useTranslation} from '../i18n/react';
import type {UpdateController} from '../domain/updates';
import './updates.css';

export function UpdateSettings({controller, headingLevel = 3}: {controller: UpdateController; headingLevel?: 2 | 3}) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot), {t, i18n} = useTranslation('common'), id = useId();
  const busy = !state.ready || state.checking;
  const date = state.checkedAt === null ? null : new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'en', {dateStyle: 'medium', timeStyle: 'short'}).format(state.checkedAt);
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return <section className="update-settings" aria-labelledby={id}>
    <div className="update-heading"><div><Heading className="update-title" id={id}>{t('updates.title')}</Heading><p>{t('updates.installed', {version: state.version || '—'})}</p></div><Download size={22} aria-hidden="true"/></div>
    <div className="update-status" role="status" aria-live="polite" aria-atomic="true">
      {state.checking ? t('updates.checking') : state.error ? t(`updates.error.${state.error}`) : state.release ? t('updates.available', {version: state.release.version}) : state.checkedAt !== null ? t('updates.none') : t('updates.notChecked')}
    </div>
    {state.release && <div className="update-release">
      {state.release.preview && <p className="update-preview-label">{t('updates.preview')}</p>}
      {state.release.notes && <p className="update-notes" tabIndex={0} role="region" aria-label={t('updates.notes')}>{state.release.notes}</p>}
      <div className="update-actions"><button type="button" className="update-button update-primary" onClick={() => void controller.open(true)}><Download size={18} aria-hidden="true"/>{t('updates.download')}</button><button type="button" className="update-button" onClick={() => void controller.open()}>{t('updates.notes')}<ArrowUpRight size={17} aria-hidden="true"/></button></div>
      <p className="update-hint">{t('updates.installHint')}</p>
    </div>}
    <div className="update-actions"><button type="button" className="update-button" aria-busy={state.checking} disabled={busy} onClick={() => void controller.check()}><RefreshCw size={17} className={state.checking ? 'update-spinning' : undefined} aria-hidden="true"/>{t(state.checking ? 'updates.checking' : 'updates.check')}</button></div>
    {date && <p className="update-hint">{t('updates.lastChecked', {date})}</p>}
    <label className="update-option"><span><strong>{t('updates.auto')}</strong><span>{t('updates.autoHint')}</span></span><input type="checkbox" checked={state.preferences.autoCheck} disabled={!state.version || state.saving} onChange={event => void controller.preferences({autoCheck: event.target.checked})}/></label>
    <label className="update-option"><span><strong>{t('updates.previews')}</strong><span>{t('updates.previewsHint')}</span></span><input type="checkbox" checked={state.preferences.previews} disabled={!state.version || state.saving} onChange={event => void controller.preferences({previews: event.target.checked})}/></label>
    {state.storageError && <p className="update-storage-error" role="alert">{t('updates.error.storage')}</p>}
    <p className="update-hint">{t('updates.privacy')}</p>
  </section>;
}

export function UpdateNotice({controller, onDetails}: {controller: UpdateController; onDetails: () => void}) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot), {t} = useTranslation('common');
  if (!state.release || state.preferences.ignored === state.release.version) return null;
  return <aside className="update-notice" aria-label={t('updates.title')}><div><strong>{t('updates.available', {version: state.release.version})}</strong><button type="button" className="update-notice-link" onClick={onDetails}>{t('updates.view')}</button></div><button type="button" className="update-dismiss" aria-label={t('updates.dismiss')} disabled={state.saving} onClick={() => void controller.preferences({ignored: state.release!.version})}><X size={19} aria-hidden="true"/></button></aside>;
}
