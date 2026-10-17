import {create} from 'zustand';
import {defaultLibraryFilter,libraryBatchSize,type LibraryFilter} from '../../../packages/domain/library-browser';

export type LibraryTab='playlists'|'likes'|'artists'|'albums'|'activity'|'taste'|'history';
export type LibraryView=LibraryFilter&{shown:number;scroll:number;layout?:'grid'|'list'};
const initialView:LibraryView={...defaultLibraryFilter,shown:libraryBatchSize,scroll:0};
// Session state only: no search text or scroll position leaks into another profile.
type BrowserState={profile:string|null;tab:LibraryTab;views:Record<string,LibraryView>;bind:(profile:string)=>void;setTab:(tab:LibraryTab)=>void;change:(key:string,patch:Partial<LibraryView>)=>void;more:(key:string)=>void};
export const useLibraryBrowser=create<BrowserState>((set,get)=>({
  profile:null,tab:'playlists',views:{},
  bind(profile){if(get().profile!==profile)set({profile,tab:get().profile===null?get().tab:'playlists',views:{}});},
  setTab(tab){set({tab});},
  change(key,patch){set(s=>({views:{...s.views,[key]:{...initialView,...s.views[key],...patch}}}));},
  more(key){get().change(key,{shown:(get().views[key]?.shown??libraryBatchSize)+libraryBatchSize});},
}));
export const getLibraryView=(key:string)=>useLibraryBrowser.getState().views[key]??initialView;
export const libraryInitialView=initialView;
