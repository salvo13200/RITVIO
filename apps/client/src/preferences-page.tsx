import {useId} from 'react';
import {Monitor,Play,SlidersHorizontal,LockKeyhole,Moon,Sun,X} from 'lucide-react';
import type {RuntimeStatus} from '../../../packages/domain/index';
import {usePlayer} from './store';
import {useShallow} from 'zustand/react/shallow';
import {t} from './i18n';
import {MotionSurface} from './motion-surface';
import {Button} from './ui-controls';
import {AudioControls} from './audio-controls';
import {SettingsVolume,SettingsVersion} from './settings-details';
import {SleepTimerControl} from './sleep-timer';
import {ActivityPrivacy} from './listening-activity';
import {ExclusionSettings} from './listening-preferences';
import {AutoplayControl} from './autoplay-ui';
import {LanguagePreferenceControl} from '../../../packages/i18n/language-control';
import {SourcesInfo} from '../../../packages/i18n/sources-info';

export type PreferenceCategory='appearance'|'playback'|'audio'|'privacy';
const categories=[
  {id:'appearance',key:'ui5.appearance',Icon:Monitor},
  {id:'playback',key:'ui5.playback',Icon:Play},
  {id:'audio',key:'ui5.audio',Icon:SlidersHorizontal},
  {id:'privacy',key:'ui5.privacy',Icon:LockKeyhole},
] as const;
export function PreferencesPage({category,onCategory,onClose,status}:{category:PreferenceCategory;onCategory:(category:PreferenceCategory)=>void;onClose:()=>void;status:RuntimeStatus|null}){
  const id=useId(),player=usePlayer(useShallow(state=>({theme:state.theme,uiLayout:state.uiLayout,setUILayout:state.setUILayout})));
  return <section className="preferences-page" aria-labelledby={id+'-title'}>
    <header className="preferences-heading"><div><h1 id={id+'-title'}>{t(category==='audio'?'ui5.audioTitle':'ui5.preferences')}</h1><p>{t(category==='audio'?'ui5.audioHint':'ui5.preferencesHint')}</p></div><Button label={t('ui5.closePreferences')} onClick={onClose}><X size={20}/></Button></header>
    <div className="preference-tabs" role="tablist" aria-label={t('ui5.settingsCategories')}>{categories.map(({id:key,key:message,Icon},index)=><button type="button" role="tab" id={id+'-'+key} aria-controls={id+'-panel'} aria-selected={category===key} tabIndex={category===key?0:-1} key={key} onClick={()=>onCategory(key)} onKeyDown={event=>{let next=index;if(event.key==='ArrowRight')next=(index+1)%categories.length;else if(event.key==='ArrowLeft')next=(index+categories.length-1)%categories.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=categories.length-1;else return;event.preventDefault();onCategory(categories[next].id);const tabs=event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role=tab]');tabs?.[next].focus();}}><Icon size={20}/>{t(message)}</button>)}</div>
    <MotionSurface className="preference-panel-motion" motionKey={category}><div id={id+'-panel'} role="tabpanel" aria-labelledby={id+'-'+category} tabIndex={0}>
      {category==='appearance'&&<div className="preference-section">
        <LanguagePreferenceControl/>
        <div className="settings-row"><div><strong>{t('App.tema')}</strong><p>{t('App.scegli.l.atmosfera.del.tuo.spazio')}</p></div><button className="secondary-button" onClick={()=>usePlayer.setState({theme:player.theme==='dark'?'light':'dark'})}>{player.theme==='dark'?<Moon size={17}/>:<Sun size={17}/>} {player.theme==='dark'?t('App.scuro'):t('App.chiaro')}</button></div>
        <div className="settings-row"><div><strong>{t('layout.motion')}</strong><p>{t('layout.motionHint')}</p></div><select aria-label={t('layout.motion')} value={player.uiLayout.motion} onChange={e=>player.setUILayout({motion:e.target.value==='essential'?'essential':'curated'})}><option value="curated">{t('layout.curated')}</option><option value="essential">{t('layout.essential')}</option></select></div>
      </div>}
      {category==='audio'&&<><AudioControls/><div className="preference-volume"><SettingsVolume/></div></>}
      {category==='playback'&&<div className="preference-section"><AutoplayControl/><SleepTimerControl/><p className="shuffle-explanation">{t('listening.shuffleHint')}</p><ExclusionSettings/>
        <div className="settings-row"><div><strong>{t('App.catalogo.youtube.music')}</strong><p>{status?.resolverInstalled?t('App.ricerca.e.metadati.tramite.resolver.senza.chiave.api'):t('App.installa.i.resolver.con.il.comando.setup.resolver')}</p></div><span className={status?.resolverInstalled?'status-ok':'status-pending'}>{status?.resolverInstalled?t('App.pronta'):t('App.da.configurare')}</span></div>
        <div className="settings-row"><div><strong>{t('App.riproduzione.tramite.resolver')}</strong><p>{t('App.yt.dlp.risolve.gli.stream.audio.nessuna.chiave.o.attivazione.aggi')}</p></div><span className={status?.resolverInstalled?'status-ok':'status-pending'}>{status?.resolverInstalled?t('App.pronta'):t('App.da.installare')}</span></div>
        <div className="shortcut-list"><h3>{t('App.fai.prima.con.la.tastiera')}</h3><span>{t('App.play.pausa')}<kbd>{t('App.spazio')}</kbd></span><span>{t('App.avanti.indietro.di.5.secondi')}<kbd>← →</kbd></span><span>{t('App.regola.il.volume')}<kbd>↑ ↓</kbd></span><span>{t('App.vai.alla.ricerca')}<kbd>{t('App.ctrl.k')}</kbd></span></div>
      </div>}
      {category==='privacy'&&<div className="preference-section"><ActivityPrivacy/><p className="settings-footnote">{t('App.profilo.preferiti.e.playlist.sono.salvati.su.questo.pc.account.on')}</p></div>}
    </div></MotionSurface><SourcesInfo/><SettingsVersion/>
  </section>;
}

