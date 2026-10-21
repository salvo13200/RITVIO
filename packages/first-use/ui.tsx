import {useId} from 'react';
import {Check, Download, Search} from 'lucide-react';
import {useTranslation} from '../i18n/react';
import './first-use.css';

/** Contextual actions in an empty collection, never an onboarding gate. */
export function FirstListen({onSearch,onImport,library=false,headingLevel=2}:{onSearch:()=>void;onImport:()=>void;library?:boolean;headingLevel?:2|3}){
  const {t}=useTranslation('common'),id=useId();
  const Heading=headingLevel===2?'h2':'h3';
  return <section className="first-listen" aria-labelledby={id}>
    <Heading id={id}>{t(library?'first.libraryTitle':'first.title')}</Heading>
    <p>{t(library?'first.libraryHint':'first.hint')}</p>
    <div className="first-actions"><button type="button" className="first-button first-primary" onClick={onSearch}><Search size={19} aria-hidden="true"/>{t('first.search')}</button><button type="button" className="first-button" onClick={onImport}><Download size={19} aria-hidden="true"/>{t('first.import')}</button></div>
  </section>;
}

export function ImportGuide({file=true}:{file?:boolean}){
  const {t}=useTranslation('common');
  return <div className="import-guide"><p>{t('transfer.previewHint')}</p><details><summary>{t(file?'transfer.supported':'transfer.supportedLinks')}</summary><ul><li>{t('transfer.linkSupport')}</li>{file&&<li>{t('transfer.fileSupport')}</li>}<li>{t('transfer.unsupported')}</li></ul><p>{t('transfer.localCopy')}</p></details></div>;
}

export type ImportCompletionData={name:string;added:number;duplicates:number;unavailable:number;excluded:number;partial:boolean};
export function ImportCompletion({report,onOpen,onDone,onAnother}:{report:ImportCompletionData;onOpen:()=>void;onDone:()=>void;onAnother?:()=>void}){
  const {t}=useTranslation('common'),id=useId();
  return <section className="import-completion" aria-labelledby={id}>
    <Check size={28} aria-hidden="true"/><h3 id={id} tabIndex={-1}>{t('transfer.saved')}</h3><p className="import-completion-name">{report.name}</p>
    <dl><div><dt>{t('transfer.added')}</dt><dd>{report.added}</dd></div><div><dt>{t('transfer.duplicates')}</dt><dd>{report.duplicates}</dd></div><div><dt>{t('transfer.unavailable')}</dt><dd>{report.unavailable}</dd></div><div><dt>{t('transfer.excluded')}</dt><dd>{report.excluded}</dd></div></dl>
    {report.partial&&<p>{t('transfer.partial')}</p>}<p>{t('transfer.playbackSafe')}</p>
    <div className="first-actions"><button type="button" className="first-button first-primary" onClick={onOpen}>{t('transfer.open')}</button><button type="button" className="first-button" onClick={onDone}>{t('transfer.done')}</button>{onAnother&&<button type="button" className="first-button" onClick={onAnother}>{t('transfer.another')}</button>}</div>
  </section>;
}
