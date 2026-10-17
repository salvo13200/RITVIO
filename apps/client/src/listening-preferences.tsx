import {useId,useRef,type ReactNode} from 'react';
import {MoreHorizontal,Ban,RotateCcw,SkipForward,Plus} from 'lucide-react';
import type {Track} from '../../../packages/domain/index';
import {artistChoices,isExcluded} from '../../../packages/domain/listening';
import {usePlayer} from './store';
import {t} from './i18n';
import {RadioButton} from './radio-ui';

export function ListeningOptions({track,children}:{track:Track;children?:ReactNode}){
  const id=useId(),popover=useRef<HTMLDivElement>(null);
  const exclusions=usePlayer(s=>s.exclusions);
  const blocked=exclusions.tracks.some(item=>item.videoId===track.videoId);
  const choose=(action:()=>void)=>{popover.current?.hidePopover();action();};
  return <><button type="button" className="icon-button" aria-label={t('listening.options',{title:track.title})} title={t('listening.options',{title:track.title})} popoverTarget={id}><MoreHorizontal size={18}/></button><div id={id} ref={popover} popover="auto" className="listening-options"><strong>{track.title}</strong><div className="track-menu-extra" onClick={()=>popover.current?.hidePopover()}><RadioButton track={track}/></div>{children&&<div className="track-menu-extra" onClick={event=>{const button=(event.target as HTMLElement).closest("button");if(button&&!button.hasAttribute("data-menu-retain"))popover.current?.hidePopover();}}>{children}</div>}<button type="button" disabled={isExcluded(track,exclusions)} onClick={()=>choose(()=>{usePlayer.getState().playNext(track);})}><SkipForward size={17}/><span>{t('queueTools.playAfter',{title:track.title})}</span></button><button type="button" onClick={()=>choose(()=>usePlayer.getState().enqueue(track))}><Plus size={17}/><span>{t('queueTools.addEnd')}</span></button><button type="button" onClick={()=>choose(()=>blocked?usePlayer.getState().restoreTrack(track.videoId):usePlayer.getState().excludeTrack(track))}>{blocked?<RotateCcw size={17}/>:<Ban size={17}/>}<span>{t(blocked?'listening.restoreTrack':'listening.excludeTrack')}</span></button>{artistChoices(track).map(artist=>{
    const excluded=exclusions.artists.some(item=>item.match===artist.match&&item.id===artist.id);
    return <button key={`${artist.match}:${artist.id}`} type="button" onClick={()=>choose(()=>excluded?usePlayer.getState().restoreArtist(artist.id,artist.match):usePlayer.getState().excludeArtist(artist))}>{excluded?<RotateCcw size={17}/>:<Ban size={17}/>}<span>{t(excluded?'listening.restoreArtist':'listening.excludeArtist',{name:artist.name})}{artist.match==='name'&&<small>{t('listening.nameMatch')}</small>}</span></button>;
  })}</div></>;
}
export function ExcludedBadge({track}:{track:Track}){
  const blocked=usePlayer(s=>isExcluded(track,s.exclusions));
  return blocked?<small className="excluded-badge"><Ban size={12}/>{t('listening.excluded')}</small>:null;
}
export function ExclusionSettings(){
  const {tracks,artists}=usePlayer(s=>s.exclusions);
  return <section className="exclusion-settings" aria-label={t('listening.manage')}><h3 className="settings-section-title">{t('listening.manage')}</h3><p>{t('listening.manageHint')}</p>{!tracks.length&&!artists.length?<p className="exclusion-empty">{t('listening.empty')}</p>:<>
    {tracks.length>0&&<><h4>{t('listening.tracks')}</h4><ul>{tracks.map(track=><li key={track.videoId}><span><strong>{track.title}</strong><small>{track.artist}</small></span><button className="secondary-button" aria-label={t('listening.restoreNamed',{name:track.title})} onClick={()=>usePlayer.getState().restoreTrack(track.videoId)}><RotateCcw size={15}/>{t('listening.restore')}</button></li>)}</ul></>}
    {artists.length>0&&<><h4>{t('listening.artists')}</h4><ul>{artists.map(artist=><li key={`${artist.match}:${artist.id}`}><span><strong>{artist.name}</strong>{artist.match==='name'&&<small>{t('listening.nameMatch')}</small>}</span><button className="secondary-button" aria-label={t('listening.restoreNamed',{name:artist.name})} onClick={()=>usePlayer.getState().restoreArtist(artist.id,artist.match)}><RotateCcw size={15}/>{t('listening.restore')}</button></li>)}</ul></>}
  </>}</section>;
}
