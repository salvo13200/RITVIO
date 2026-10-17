import React from 'react';
import {createRoot} from 'react-dom/client';
import {localization} from '../../../packages/i18n';
import {LanguageRoot} from '../../../packages/i18n/react';
import {startDesktopLanguage} from './localization';
const root=createRoot(document.getElementById('root')!);
const ready=startDesktopLanguage();
if(new URLSearchParams(location.search).get('mini')==='1')void Promise.all([ready,import('./mini-player')]).then(([controller,{MiniPlayer}])=>root.render(<LanguageRoot runtime={localization} controller={controller}>{()=> <MiniPlayer/>}</LanguageRoot>));
else void Promise.all([ready,import('./app-styles').then(()=>import('./App'))]).then(([controller,{App}])=>root.render(<React.StrictMode><LanguageRoot runtime={localization} controller={controller}>{()=> <App/>}</LanguageRoot></React.StrictMode>));
