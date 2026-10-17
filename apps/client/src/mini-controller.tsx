import {useEffect} from 'react';
import {usePlayer} from './store';
import {seek} from './player';
import type {MiniCommand} from '../../../packages/domain/mini';
/** The main renderer owns audio. The second window only sends validated commands. */
export function MiniController(){
  useEffect(()=>{
    const bridge=window.ritvio;if(!bridge?.publishMini)return;
    let timer:ReturnType<typeof setTimeout>|undefined;
    const publish=()=>{timer=undefined;const s=usePlayer.getState(),track=s.queue[s.index];void bridge.publishMini({title:track?.title??'',artist:track?.artist??'',videoId:track?.videoId??null,position:s.position,duration:s.duration||track?.duration||0,volume:s.volume,muted:s.muted,playing:s.playing,loading:s.loading,canNext:s.queue.length>1,canPrevious:!!track,error:s.error,theme:s.theme,motion:s.uiLayout.motion}).catch(()=>{});};
    const unsubscribe=usePlayer.subscribe(()=>{if(!timer)timer=setTimeout(publish,150);});publish();
    const unlisten=bridge.onMiniCommand((command:MiniCommand)=>{const s=usePlayer.getState();switch(command.type){case 'toggle':s.toggle();break;case 'next':s.next();break;case 'previous':s.previous();break;case 'seek':seek(command.value);break;case 'volume':s&&usePlayer.setState({volume:Math.max(0,Math.min(1,command.value))});break;case 'mute':usePlayer.setState({muted:!s.muted});}});
    return()=>{clearTimeout(timer);unsubscribe();unlisten();};
  },[]);return null;
}
