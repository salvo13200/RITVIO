import {localization} from '../../../packages/i18n';
import {bootstrapLanguage} from '../../../packages/i18n/bootstrap';
export async function startDesktopLanguage(){
 const bridge=window.ritvio;let hasExistingProfile=false;
 try{hasExistingProfile=localStorage.getItem('ritvio-player-v1')!==null;}catch{}
 return bootstrapLanguage(localization,{hasExistingProfile,...(bridge?.readLanguage&&bridge.writeLanguage&&bridge.onLanguage?{host:{read:()=>bridge.readLanguage!(),write:preference=>bridge.writeLanguage!(preference),subscribe:listener=>bridge.onLanguage!(listener)}}:{})});
}
