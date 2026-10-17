import type {LanguageHostState,LanguagePreference} from './languages';
export type LanguageBridge={readLanguage:()=>Promise<LanguageHostState>;writeLanguage:(preference:LanguagePreference)=>Promise<LanguageHostState>;onLanguage:(listener:(state:LanguageHostState)=>void)=>()=>void};
