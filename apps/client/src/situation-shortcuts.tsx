import {BookOpen,TrainFront,Zap,Leaf,Dumbbell,PartyPopper} from 'lucide-react';
import {situationKeys,type SituationKey} from '../../../packages/domain/situations';
import {t} from './i18n';
const icons={focus:BookOpen,travel:TrainFront,energy:Zap,relax:Leaf,workout:Dumbbell,party:PartyPopper};
export function SituationShortcuts({open,disabled=false}:{open:(id:SituationKey)=>void;disabled?:boolean}){
  return <section className="situations-shortcuts"><div className="home2-section-heading"><div><h2>{t('situations.heading')}</h2><p>{t('situations.intro')}</p></div></div><div className="situations-choices">{situationKeys.map(id=>{const Icon=icons[id];return <button key={id} disabled={disabled} onClick={()=>open(id)}><Icon size={23}/><span><strong>{t(`situations.${id}`)}</strong><small>{t(`situations.hint.${id}`)}</small></span></button>;})}</div></section>;
}
