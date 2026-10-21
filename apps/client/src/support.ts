import {api} from './api';
import {playbackMetrics} from './playback-metrics';
import {isSupportUrl} from '../../../packages/domain/support';
import type {SupportHost} from '../../../packages/support/ui';
export const supportHost:SupportHost={
 readTimings:async()=>({...await api.playbackDiagnostics(),renderer:{samples:playbackMetrics()}}),
 copy:async text=>{if(window.ritvio?.supportCopy)await window.ritvio.supportCopy(text);else await navigator.clipboard.writeText(text);},
 open:async url=>{if(!isSupportUrl(url))throw Error('Invalid help link');if(window.ritvio?.supportOpen)await window.ritvio.supportOpen(url);else window.open(url,'_blank','noopener,noreferrer');},
};
