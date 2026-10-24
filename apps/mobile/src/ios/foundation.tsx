import {useEffect,useState,useSyncExternalStore} from 'react';
import {Check,LoaderCircle,RefreshCw} from 'lucide-react';
import {localization} from '../../../../packages/i18n/mobile';
import type {LanguageController} from '../../../../packages/i18n/host';
import {foundationBridge} from './native';
import {parseFoundationStatus,verifyFoundationCheck,type FoundationStatus} from './contract';
import './foundation.css';

const copy={
 en:{title:'iOS technical build',intro:'The first step towards RITVIO on iPhone.',connecting:'Connecting to the native bridge…',ready:'Native bridge ready',verified:'Connection verified',error:'Native connection unavailable. Close and reopen RITVIO, or try again.',check:'Check connection',checking:'Checking connection…',phase:'Development stage',version:'Version',system:'System',minimum:'Minimum iOS target',environment:'Running on',simulator:'iPhone simulator',device:'iPhone',assets:'App resources',local:'Included in this app',missing:'App resources missing',next:'Listening comes next',scope:'Search, playback, library, lyrics and sharing are not available in this technical build. The next steps will connect the resolver and native audio.',language:'Language',systemLanguage:'Use device language',languageError:'Language could not be saved. Try again.'},
 it:{title:'Build tecnica iOS',intro:'Il primo passo verso RITVIO su iPhone.',connecting:'Connessione al bridge nativo…',ready:'Bridge nativo pronto',verified:'Connessione verificata',error:'Connessione nativa non disponibile. Chiudi e riapri RITVIO oppure riprova.',check:'Verifica connessione',checking:'Verifica della connessione…',phase:'Fase di sviluppo',version:'Versione',system:'Sistema',minimum:'Obiettivo minimo iOS',environment:'In esecuzione su',simulator:'Simulatore iPhone',device:'iPhone',assets:'Risorse dell’app',local:'Incluse nell’app',missing:'Risorse dell’app mancanti',next:'Il prossimo passo è l’ascolto',scope:'Ricerca, riproduzione, libreria, testi e condivisione non sono disponibili in questa build tecnica. I prossimi passi collegheranno il resolver e l’audio nativo.',language:'Lingua',systemLanguage:'Usa la lingua del dispositivo',languageError:'Impossibile salvare la lingua. Riprova.'},
};
export function Foundation({controller}:{controller:LanguageController}) {
 const language=useSyncExternalStore(localization.subscribe,localization.getSnapshot);
 const text=copy[language.language==='it'?'it':'en'];
 const [status,setStatus]=useState<FoundationStatus|null>(null),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false),[verified,setVerified]=useState(false),[languageBusy,setLanguageBusy]=useState(false),[languageError,setLanguageError]=useState(false);
 useEffect(()=>{let disposed=false;foundationBridge.foundationStatus().then(parseFoundationStatus).then(value=>{if(!disposed){setStatus(value);setFailed(!value.bundledAssets);}}).catch(()=>{if(!disposed)setFailed(true);});return()=>{disposed=true;};},[]);
 async function check(){
  setBusy(true);setFailed(false);setVerified(false);
  try{const value=parseFoundationStatus(await foundationBridge.foundationStatus());const nonce=Array.from(crypto.getRandomValues(new Uint8Array(16)),value=>value.toString(16).padStart(2,'0')).join('');verifyFoundationCheck(await foundationBridge.foundationCheck({nonce}),nonce);if(!value.bundledAssets)throw Error('Missing assets');setStatus(value);setVerified(true);}catch{setFailed(true);}finally{setBusy(false);}
 }
 async function changeLanguage(preference:'en'|'it'|'system'){setLanguageBusy(true);setLanguageError(false);try{await controller.setPreference(preference);}catch{setLanguageError(true);}finally{setLanguageBusy(false);}}
 return <main className="ios-foundation">
  <header><span className="brand">RITVIO</span><h1>{text.title}</h1><p className="intro">{text.intro}</p></header>
  <section aria-label={text.phase} className="foundation-connection">
   <p role="status" aria-live="polite" className="foundation-status">{failed?null:status?<Check aria-hidden="true" size={22}/>:<LoaderCircle aria-hidden="true" size={22}/>}<strong>{failed?text.error:verified?text.verified:status?text.ready:text.connecting}</strong></p>
   <button className="tonal" disabled={busy} onClick={()=>void check()}>{busy?<LoaderCircle aria-hidden="true" size={18}/>:<RefreshCw aria-hidden="true" size={18}/>}<span>{busy?text.checking:text.check}</span></button>
   {status&&<dl className="foundation-facts">
    <div><dt>{text.phase}</dt><dd>{status.phase}</dd></div><div><dt>{text.version}</dt><dd>{status.version} ({status.build})</dd></div>
    <div><dt>{text.system}</dt><dd>iOS {status.systemVersion}</dd></div><div><dt>{text.minimum}</dt><dd>{status.minimumOS}</dd></div>
    <div><dt>{text.environment}</dt><dd>{text[status.environment]}</dd></div><div><dt>{text.assets}</dt><dd>{status.bundledAssets?text.local:text.missing}</dd></div>
   </dl>}
  </section>
  <section className="foundation-next"><h2>{text.next}</h2><p>{text.scope}</p></section>
  <section className="foundation-language"><h2>{text.language}</h2><div className="foundation-language-buttons">
   <button className="tonal" aria-pressed={language.preference==='en'} disabled={languageBusy} onClick={()=>void changeLanguage('en')}><Check aria-hidden="true" size={18}/><span>English</span></button>
   <button className="tonal" aria-pressed={language.preference==='it'} disabled={languageBusy} onClick={()=>void changeLanguage('it')}><Check aria-hidden="true" size={18}/><span>Italiano</span></button>
   <button className="text-action" aria-pressed={language.preference==='system'} disabled={languageBusy} onClick={()=>void changeLanguage('system')}><Check aria-hidden="true" size={18}/><span>{text.systemLanguage}</span></button>
  </div>{languageError&&<p role="alert">{text.languageError}</p>}</section>
 </main>;
}
