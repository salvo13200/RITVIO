import {createContext,useContext,useMemo,useSyncExternalStore,type ReactNode} from 'react';
import {I18nextProvider,useTranslation} from 'react-i18next';
import type {LocalizationRuntime,LocalizationSnapshot} from './runtime';
import type {LanguageController} from './host';
const LanguageContext=createContext<{snapshot:LocalizationSnapshot;runtime:LocalizationRuntime;controller:LanguageController}|null>(null);
/** Re-evaluate legacy t() views without assigning a new key or replacing audio owners. */
export function LanguageRoot({runtime,controller,children}:{runtime:LocalizationRuntime;controller:LanguageController;children:()=>ReactNode}){
 const snapshot=useSyncExternalStore(runtime.subscribe,runtime.getSnapshot,runtime.getSnapshot);
 const value=useMemo(()=>({snapshot,runtime,controller}),[snapshot,runtime,controller]);
 return <LanguageContext.Provider value={value}><I18nextProvider i18n={runtime.engine}>{children()}</I18nextProvider></LanguageContext.Provider>;
}
export function useLanguage(){const value=useContext(LanguageContext);if(!value)throw Error('LanguageRoot missing');return value;}
export {useTranslation};
