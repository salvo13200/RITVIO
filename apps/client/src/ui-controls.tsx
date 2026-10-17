import {useContext,useState,type ReactNode} from 'react';
import {ArtworkContext} from './artwork-context';
import {Disc3} from 'lucide-react';
import type {Track} from '../../../packages/domain/index';
import {t} from './i18n';
import {animateUI} from './ui-motion';
export function Button({label,children,onClick,active,disabled=false,className='',id,controls,expanded}:{label:string;children:ReactNode;onClick:()=>void;active?:boolean;disabled?:boolean;className?:string;id?:string;controls?:string;expanded?:boolean}) {
  return <button id={id} type="button" className={`icon-button ${active?'active':''} ${className}`} aria-label={label} title={label} aria-pressed={active} aria-controls={controls} aria-expanded={expanded} onClick={event=>{animateUI(event.currentTarget,'press');onClick();}} disabled={disabled}>{children}</button>;
}
export function Cover({track,className='',slot,fit='cover'}:{track?:Track;className?:string;slot?:string;fit?:'cover'|'contain'}) {
  const artwork=useContext(ArtworkContext);
  const source=(slot&&artwork[slot])||track?.thumbnail;
  const [failedSource,setFailedSource]=useState<string|null>(null);
  const available=!!track&&!!source&&source!==failedSource;
  return <div className={`cover ${className}`} data-fit={fit} data-artwork={available?'image':'fallback'}>{available?<img key={source} style={{objectFit:fit}} src={source} alt={t("App.copertina.di",{p0:track!.title})} loading="lazy" onError={()=>setFailedSource(source!)}/>:<Disc3 aria-hidden="true"/>}</div>;
}
