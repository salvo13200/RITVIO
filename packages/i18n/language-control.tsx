import {useState} from 'react';
import {useLanguage,useTranslation} from './react';
import {languageManifest,type LanguagePreference,type Language} from './languages';
export function LanguagePreferenceControl(){
 const {snapshot,runtime,controller}=useLanguage(),{t}=useTranslation('common');
 const [busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
 async function change(preference:LanguagePreference){if(busy)return;setBusy(true);setFailed(false);try{await controller.setPreference(preference);}catch{setFailed(true);}finally{setBusy(false);}}
 return <div><div className="settings-row"><div><strong>{t('language.title')}</strong><p>{t('language.hint')}</p></div><select aria-label={t('language.title')} aria-busy={busy} disabled={busy} value={snapshot.preference} onChange={event=>void change(event.target.value as LanguagePreference)}><option value="system">{t('language.system')}</option>{languageManifest.languages.filter(item=>runtime.available.includes(item.code as Language)).map(item=><option value={item.code} key={item.code}>{item.name}</option>)}</select></div>{failed&&<p className="inline-error" role="alert">{t('language.saveFailed')}</p>}</div>;
}
