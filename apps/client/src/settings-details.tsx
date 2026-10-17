import {Volume2,VolumeX} from 'lucide-react';
import {usePlayer} from './store';
import {t} from './i18n';
import {version} from '../../../package.json';
import {WaveSlider} from './wave-slider';
export function SettingsVolume(){
  const volume=usePlayer(s=>s.volume);const muted=usePlayer(s=>s.muted);
  const playing=usePlayer(s=>s.playing);const loading=usePlayer(s=>s.loading);
  return <div className="settings-row"><div><strong>{t('volume')}</strong><p>{t('settings.volumeHint')}</p></div><div className="settings-volume"><button type="button" className="icon-button" aria-label={muted?t('unmute'):t('mute')} aria-pressed={muted} onClick={()=>usePlayer.setState({muted:!muted})}>{muted?<VolumeX size={18}/>:<Volume2 size={18}/>}</button><WaveSlider variant="volume" label={t('settings.volumeLabel')} max={1} step={.01} value={volume} onChange={value=>usePlayer.setState({volume:value})} animated={playing&&!loading&&volume>0} muted={muted} valueText={t(muted?'wave.mutedPercent':'wave.percent',{percent:Math.round(volume*100)})}/></div></div>;
}
export function SettingsVersion(){return <p className="settings-footnote">{t('settings.version',{version})}</p>;}
