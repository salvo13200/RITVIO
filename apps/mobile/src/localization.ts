import {nativePlayback,isNativeMobile} from './native';
import {localization} from '../../../packages/i18n/mobile';
import {bootstrapLanguage} from '../../../packages/i18n/bootstrap';
import type {LanguageHost} from '../../../packages/i18n/host';
export function startMobileLanguage(){
 let hasExistingProfile=false;try{hasExistingProfile=localStorage.getItem('ritvio.mobile.libraryView')!==null||localStorage.getItem('ritvio.mobile.reducedMotion')!==null;}catch{}
 const host:LanguageHost|undefined=isNativeMobile&&nativePlayback.languageRead?{read:()=>nativePlayback.languageRead(),write:preference=>nativePlayback.languageWrite({preference}),subscribe:listener=>{let disposed=false,remove:(()=>void)|undefined;void nativePlayback.addListener('language',listener).then(handle=>{if(disposed)void handle.remove();else remove=()=>{void handle.remove();};}).catch(()=>{});return()=>{disposed=true;remove?.();};}}:undefined;
 return bootstrapLanguage(localization,{host,hasExistingProfile});
}
