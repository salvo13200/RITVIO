import {useEffect,useId,useRef,useState} from 'react';
import {ArrowUpRight,Check,Copy,LoaderCircle} from 'lucide-react';
import {useTranslation} from '../i18n/react';
import {supportReport,supportIssueUrl,supportIssues,safePlaybackTimings,type SupportContext,type SupportKind} from '../domain/support';
import './support.css';
export type SupportHost={readTimings:()=>Promise<unknown>;copy:(text:string)=>Promise<void>;open:(url:string)=>Promise<void>};
export function SupportSettings({context,host,headingLevel=3}:{context:SupportContext;host:SupportHost;headingLevel?:2|3}){
 const {t}=useTranslation('common'),id=useId(),Heading=headingLevel===2?'h2':'h3';
 const [kind,setKind]=useState<SupportKind>('bug'),[included,setIncluded]=useState(false),[timings,setTimings]=useState<Record<string,unknown>>(),[busy,setBusy]=useState(false),[copying,setCopying]=useState(false),[error,setError]=useState<'timings'|'copy'|'open'|null>(null),[copied,setCopied]=useState(false),[opened,setOpened]=useState<'form'|'existing'|null>(null);
 const generation=useRef(0),alive=useRef(true),timer=useRef<ReturnType<typeof setTimeout>>(undefined);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;clearTimeout(timer.current);};},[]);
 async function load(checked:boolean){
  const revision=++generation.current;setIncluded(checked);setTimings(undefined);setError(null);setCopied(false);
  if(!checked){setBusy(false);return;}
  setBusy(true);
  try{const clean=safePlaybackTimings(await host.readTimings());if(alive.current&&revision===generation.current)setTimings(clean);}
  catch{if(alive.current&&revision===generation.current)setError('timings');}
  finally{if(alive.current&&revision===generation.current)setBusy(false);}
 }
 const report=supportReport(kind,context,included?timings:undefined);
 const currentReport=useRef(report);currentReport.current=report;
 async function copy(){setCopying(true);try{await host.copy(report);if(alive.current&&currentReport.current===report){setError(null);setCopied(true);clearTimeout(timer.current);timer.current=setTimeout(()=>setCopied(false),2500);}}catch{if(alive.current)setError('copy');}finally{if(alive.current)setCopying(false);}}
 async function open(existing=false){try{await host.open(existing?supportIssues:supportIssueUrl(kind,context));if(alive.current){setError(null);setCopied(false);setOpened(existing?'existing':'form');}}catch{if(alive.current)setError('open');}}
 return <section className="support-settings" aria-labelledby={id+'-title'}>
  <Heading id={id+'-title'} tabIndex={-1}>{t('support.title')}</Heading><p className="support-intro">{t('support.hint')}</p>
  <label className="support-kind" htmlFor={id+'-kind'}>{t('support.kind')}<select id={id+'-kind'} value={kind} onChange={event=>{setKind(event.target.value as SupportKind);setCopied(false);setOpened(null);setError(null);}}>{(['bug','visual','idea'] as const).map(value=><option key={value} value={value}>{t('support.'+value)}</option>)}</select></label>
  <p className="support-kind-hint">{t('support.'+kind+'Hint')}</p>
  <label className="support-option"><input type="checkbox" checked={included} onChange={event=>void load(event.target.checked)}/><span><strong>{t('support.timings')}</strong><span>{t('support.timingsHint')}</span></span></label>
  {busy&&<p role="status" className="support-notice"><LoaderCircle size={17} className="support-spinning" aria-hidden="true"/>{t('support.loading')}</p>}
  {included&&timings&&!Object.keys(timings).length&&<p className="support-notice">{t('support.noTimings')}</p>}
  {error&&<p role="alert" className="support-error">{t('support.error.'+error)}{error==='timings'&&<button type="button" onClick={()=>void load(true)}>{t('support.retry')}</button>}</p>}
  <label className="support-preview-label" htmlFor={id+'-report'}>{t('support.preview')}</label>
  <textarea className="support-preview" id={id+'-report'} readOnly value={report} rows={included&&timings?11:7} spellCheck={false}/>
  <div className="support-actions"><button type="button" className="support-primary" disabled={busy||copying} aria-busy={copying} onClick={()=>void copy()}>{copied?<Check size={18} aria-hidden="true"/>:<Copy size={18} aria-hidden="true"/>}{t(copied?'support.copied':'support.copy')}</button><button type="button" onClick={()=>void open()}>{t('support.open')}<ArrowUpRight size={18} aria-hidden="true"/></button></div>
  <p className="support-privacy">{t('support.privacy')}</p>
  <button type="button" className="support-existing" onClick={()=>void open(true)}>{t('support.existing')}<ArrowUpRight size={17} aria-hidden="true"/></button>
  <p className="support-notice" role="status" aria-live="polite">{copied?t('support.copied'):opened?t(opened==='existing'?'support.existingOpened':'support.opened'):''}</p>
 </section>;
}
