import {isAndroid,nativePlayback} from './native';
import {isSupportUrl} from '../../../packages/domain/support';
import type {SupportHost} from '../../../packages/support/ui';
export const supportHost:SupportHost={
 readTimings:()=>nativePlayback.readPlaybackDiagnostics(),
 copy:async text=>{if(isAndroid)await nativePlayback.supportCopy({text});else await navigator.clipboard.writeText(text);},
 open:async url=>{if(!isSupportUrl(url))throw Error('Invalid help link');if(isAndroid)await nativePlayback.supportOpen({url});else window.open(url,'_blank','noopener,noreferrer');},
};
