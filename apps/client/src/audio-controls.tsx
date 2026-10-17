import {displayLocale} from '../../../packages/i18n/display';
import {useId,type CSSProperties} from 'react';
import {RotateCcw} from 'lucide-react';
import {audioBands,audioPresets,audioPreset,defaultAudio,type AudioPreset} from '../../../packages/domain/audio';
import {usePlayer} from './store';
import {t} from './i18n';

const db=(value:number)=>`${value>0?'+':''}${value.toLocaleString(displayLocale())} dB`;
const rangeFill=(value:number,min:number,max:number)=>({'--audio-position':Math.max(0,Math.min(1,(value-min)/(max-min)))} as CSSProperties);
export function AudioControls(){
  const id=useId(),prefs=usePlayer(s=>s.audioPreferences),set=usePlayer(s=>s.setAudioPreferences);
  const supported=typeof AudioContext!=='undefined';
  const bandNames=['audio.bass','audio.lowMid','audio.mid','audio.highMid','audio.high'] as const;
  const preset=audioPreset(prefs);
  const panText=prefs.pan===0?t('audio.center'):t(prefs.pan<0?'audio.leftPercent':'audio.rightPercent',{percent:Math.round(Math.abs(prefs.pan)*100)});
  return <section className="audio-controls audio-workspace" aria-labelledby={id+'-title'}>
    <div className="audio-eq-surface"><div className="audio-controls-heading"><div><h2 id={id+'-title'}>{t('ui5.equalizer')}</h2><p>{t('audio.intro')}</p></div><button type="button" className="audio-switch" role="switch" aria-label={t('audio.enable')} aria-checked={prefs.enabled} disabled={!supported} onClick={()=>set({enabled:!prefs.enabled})}><span aria-hidden="true"/></button></div>
      {!supported&&<p role="alert">{t('audio.unsupported')}</p>}
      <div className="audio-preset-toolbar"><div className="audio-preset-row"><label htmlFor={id+'-preset'}>{t('audio.preset')}</label><select id={id+'-preset'} disabled={!supported} value={preset} onChange={e=>{const key=e.target.value as AudioPreset;if(key in audioPresets)set({bands:[...audioPresets[key]]});}}>{(Object.keys(audioPresets) as AudioPreset[]).map(key=><option key={key} value={key}>{t(`audio.preset.${key}`)}</option>)}{preset==='custom'&&<option value="custom">{t('audio.custom')}</option>}</select></div><div className="audio-toolbar-actions"><button type="button" className="secondary-button audio-reset" disabled={!supported} onClick={()=>set({...defaultAudio(),enabled:prefs.enabled})}><RotateCcw size={16}/>{t('audio.reset')}</button><button className="secondary-button" disabled={!supported} aria-pressed={!prefs.enabled} onClick={()=>set({enabled:!prefs.enabled})}>{t('ui5.bypass')}</button></div></div>
      <fieldset disabled={!supported} aria-label={t('audio.adjustments')}><div className="audio-band-workspace"><div className="audio-db-scale" aria-hidden="true"><span>+12 dB</span><span>+6 dB</span><span>0 dB</span><span>−6 dB</span><span>−12 dB</span></div><div className="audio-bands">{audioBands.map((frequency,i)=><div className="audio-band" key={frequency}><label htmlFor={id+'-'+frequency}><span>{frequency>=1000?`${frequency/1000} kHz`:`${frequency} Hz`}</span><strong>{t(bandNames[i])}</strong></label><input id={id+'-'+frequency} type="range" min={-12} max={12} step={.5} value={prefs.bands[i]} style={rangeFill(prefs.bands[i],-12,12)} aria-label={t('audio.band',{name:t(bandNames[i]),frequency:frequency>=1000?`${frequency/1000} kHz`:`${frequency} Hz`})} aria-valuetext={db(prefs.bands[i])} onChange={e=>set({bands:prefs.bands.map((gain,j)=>i===j?Number(e.target.value):gain)})}/><output htmlFor={id+'-'+frequency}>{db(prefs.bands[i])}</output></div>)}</div></div></fieldset>
    </div>
    <fieldset disabled={!supported} className="audio-aux" aria-label={t('audio.adjustments')}><div><label htmlFor={id+'-preamp'}>{t('audio.preamp')}<output htmlFor={id+'-preamp'}>{db(prefs.preamp)}</output></label><input id={id+'-preamp'} type="range" min={-12} max={6} step={.5} value={prefs.preamp} style={rangeFill(prefs.preamp,-12,6)} aria-valuetext={db(prefs.preamp)} onChange={e=>set({preamp:Number(e.target.value)})}/><div className="audio-range-ends" aria-hidden="true"><span>−12 dB</span><span>+6 dB</span></div></div><div><label htmlFor={id+'-pan'}>{t('audio.pan')}<output htmlFor={id+'-pan'}>{panText}</output></label><input id={id+'-pan'} type="range" min={-1} max={1} step={.05} value={prefs.pan} style={rangeFill(prefs.pan,-1,1)} aria-valuetext={panText} onChange={e=>set({pan:Number(e.target.value)})}/><div className="audio-range-ends" aria-hidden="true"><span>{t('audio.left')}</span><span>{t('audio.right')}</span></div></div></fieldset>
    <p className="audio-hint" role="status">{t(prefs.enabled?'audio.headroom':'audio.bypass')}</p>
  </section>;
}
