import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createLocalization} from '../../packages/i18n/runtime';
import {LanguageRoot,useLanguage,useTranslation} from '../../packages/i18n/react';
import {bootstrapLanguage} from '../../packages/i18n/bootstrap';
import {browserLanguageHost} from '../../packages/i18n/browser';
import {languageCodes,type LanguageHostState} from '../../packages/i18n/languages';
// Test-only catalogs and controls. This entry is never imported by either shipping app.
const names=['Lingua','Language','Idioma','Langue','Sprache'];
const resources=Object.fromEntries(languageCodes.map((code,index)=>[code,{common:{title:names[index]}}]));
const runtime=createLocalization({resources,available:languageCodes,fallback:'en'});
let controller;
if(location.search.includes('unresponsive'))controller=await bootstrapLanguage(runtime,{timeout:50,host:{read:()=>new Promise(()=>{}),write:async()=>{throw Error();},subscribe:()=>()=>{}}});
else controller=await bootstrapLanguage(runtime,{host:browserLanguageHost()});
let mounts=0;
function Probe(){
 const {t}=useTranslation(),{snapshot,controller}=useLanguage(),audio=useRef<HTMLAudioElement>(null),[clicks,setClicks]=useState(0);
 useEffect(()=>{mounts++;const wav=new Uint8Array(44+16000*20);const view=new DataView(wav.buffer);function text(at:number,value:string){for(let i=0;i<value.length;i++)wav[at+i]=value.charCodeAt(i);}text(0,'RIFF');view.setUint32(4,wav.length-8,true);text(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,8000,true);view.setUint32(28,16000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,wav.length-44,true);for(let i=44;i<wav.length;i+=2)view.setInt16(i,Math.sin(i*.1)*300,true);const url=URL.createObjectURL(new Blob([wav],{type:'audio/wav'}));audio.current!.src=url;return()=>URL.revokeObjectURL(url);},[]);
 return <main><h1>{t('title')}</h1><output data-testid="language">{snapshot.language}</output><output data-testid="preference">{snapshot.preference}</output><select aria-label="Language" value={snapshot.preference} onChange={event=>void controller.setPreference(event.target.value as any)}><option value="system">System</option>{languageCodes.map(code=><option key={code}>{code}</option>)}</select><button onClick={()=>{setClicks(value=>value+1);void audio.current!.play();}}>Play</button><output data-testid="clicks">{clicks}</output><audio ref={audio} loop/></main>;
}
Object.assign(window,{__localizationProbe:{runtime,controller,getMounts:()=>mounts}});
createRoot(document.getElementById('root')!).render(<LanguageRoot runtime={runtime} controller={controller}>{()=> <Probe/>}</LanguageRoot>);
