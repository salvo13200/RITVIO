import './polyfills';
import {useEffect,useState,type CSSProperties} from 'react';
import {createRoot} from 'react-dom/client';
import {Monitor,ArrowRight,LoaderCircle} from 'lucide-react';
import {LanguageRoot} from '../../../packages/i18n/react';
import {localization} from '../../../packages/i18n/mobile';
import {startMobileLanguage} from '../../mobile/src/localization';
import {App} from '../../mobile/src/ios/App';
import {iosCopy} from '../../mobile/src/ios/copy';
import type {LanguageController} from '../../../packages/i18n/host';
import {nativeCall} from './capacitor';
import './style.css';

iosCopy.en.sourceBody='This temporary test uses your paired PC for search and stream resolution. Audio plays on this iPhone. RITVIO is not affiliated with YouTube or Google.';
iosCopy.it.sourceBody='Questa prova temporanea usa il PC abbinato per ricerca e risoluzione dei brani. L’audio viene riprodotto su questo iPhone. RITVIO non è affiliata a YouTube o Google.';
iosCopy.en.scope='Local library on this iPhone. The PC must stay on the same network. This test does not verify the embedded resolver of the official iOS build.';
iosCopy.it.scope='Libreria locale su questo iPhone. Il PC deve restare acceso sulla stessa rete. Questa prova non verifica il resolver incorporato della build iOS ufficiale.';
function PCTest({controller}:{controller:LanguageController}){
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(true),[error,setError]=useState(''),[host,setHost]=useState(''),[port,setPort]=useState('59212'),[pin,setPin]=useState(''),[scale,setScale]=useState(1),[hasSession,setHasSession]=useState(false);
 const italian=localization.getSnapshot().language==='it';
 useEffect(()=>{void nativeCall('foundationStatus').then(value=>{if(typeof value.textScale==='number'&&value.textScale>=.5&&value.textScale<=4)setScale(value.textScale);}).catch(()=>{});void nativeCall('pcRead').then(value=>{setHost(value.host??'');setPort(String(value.port??59212));setReady(value.connected===true);setHasSession(value.connected===true);}).catch(()=>setError(italian?'PC non raggiungibile. Avvia il servizio e abbina di nuovo.':'PC unavailable. Start the helper and pair again.')).finally(()=>setBusy(false));},[]);
 async function pair(){setBusy(true);setError('');try{await nativeCall('pcPair',{host:host.trim(),port:Number(port),pin});setPin('');setReady(true);setHasSession(true);}catch(error){const code=String((error as any).code);setError(/PAIR/.test(code)?(italian?'Codice errato o scaduto. Riavvia il servizio PC.':'Incorrect or expired code. Restart the PC helper.'):/ADDRESS/.test(code)?(italian?'Inserisci l’indirizzo IP privato del PC e la porta corretta.':'Enter the PC’s private IP address and correct port.'):(italian?'PC non raggiungibile. Controlla rete e servizio PC.':'PC unreachable. Check the network and PC helper.'));}finally{setBusy(false);}}
 return <div className="pc-test-root" style={{'--pc-text-scale':scale} as CSSProperties}>{ready?<><div className="pc-test-banner"><span><Monitor size={16}/> PC test · {host}</span><button onClick={()=>{setReady(false);setError('');}}>{italian?'Connessione':'Connection'}</button></div><div className="pc-test-app"><App controller={controller}/></div></>:<main className="pc-connect"><Monitor size={34} aria-hidden="true"/><h1>{italian?'Collega il tuo PC':'Connect your PC'}</h1><p>{italian?'Questa build di prova usa il PC per cercare e preparare i brani. Lascia il servizio acceso e usa la stessa rete.':'This test build uses your PC to find and prepare songs. Keep the helper running on the same network.'}</p><form onSubmit={event=>{event.preventDefault();void pair();}}><label>{italian?'Indirizzo IP del PC':'PC IP address'}<input autoComplete="off" inputMode="decimal" value={host} onChange={event=>setHost(event.target.value)} placeholder="192.168.1.10" required maxLength={15}/></label><label>{italian?'Porta':'Port'}<input inputMode="numeric" value={port} onChange={event=>setPort(event.target.value)} required maxLength={5}/></label><label>{italian?'Codice di abbinamento':'Pairing code'}<input inputMode="numeric" autoComplete="off" value={pin} onChange={event=>setPin(event.target.value.replace(/\D/g,''))} placeholder="123456" required minLength={6} maxLength={6}/></label>{error&&<p role="alert" className="pc-connect-error">{error}</p>}<button disabled={busy||pin.length!==6} type="submit">{busy?<LoaderCircle className="ios-spinner"/>:<ArrowRight/>}{italian?'Collega':'Connect'}</button></form>{hasSession&&<button className="pc-return" onClick={()=>setReady(true)}>{italian?'Torna all’ascolto':'Back to listening'}</button>}<small>{italian?'RITVIO · prova temporanea per iOS 12':'RITVIO · temporary iOS 12 test'}</small></main>}</div>;
}
const root=createRoot(document.getElementById('root')!);
void startMobileLanguage().then(controller=>root.render(<LanguageRoot runtime={localization} controller={controller}>{()=> <PCTest controller={controller}/>}</LanguageRoot>)).catch(()=>root.render(<main className="pc-connect" role="alert">RITVIO PC Test could not start. Close and reopen the app.</main>));
