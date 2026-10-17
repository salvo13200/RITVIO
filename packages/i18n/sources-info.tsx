import {useTranslation} from 'react-i18next';
import {useId} from 'react';

/** Provider attribution lives in Settings, outside the listening surfaces. */
export function SourcesInfo(){
 const {t}=useTranslation('ui'),id=useId();
 return <section className="preference-section settings-sources" aria-labelledby={id}>
  <h3 id={id}>{t('sources.title')}</h3>
  <p className="settings-footnote source-date">{t('sources.catalog')}</p>
  <p className="settings-footnote source-date">{t('sources.metadata')}</p>
 </section>;
}
