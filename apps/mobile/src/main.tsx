import React from 'react';
import {createRoot} from 'react-dom/client';
import {isIOS} from './native';
import {localization} from '../../../packages/i18n/mobile';
import {LanguageRoot} from '../../../packages/i18n/react';
import {startMobileLanguage} from './localization';
import './style.css';
import './listening-tools.css';
const root=createRoot(document.getElementById('root')!);
if(isIOS)document.documentElement.classList.add('ios-native');
void startMobileLanguage().then(async controller=>{
 const content=isIOS?React.createElement((await import('./ios/foundation')).Foundation,{controller}):React.createElement((await import('./App')).App);
 root.render(<React.StrictMode><LanguageRoot runtime={localization} controller={controller}>{()=>content}</LanguageRoot></React.StrictMode>);
}).catch(()=>root.render(<main role="alert" style={{padding:24}}>RITVIO could not start. Please close and reopen the app.</main>));
