import {useState} from 'react';
export type Page='home'|'search'|'library'|'lyrics'|'preferences'|'immersive'|`situation:${string}`|`artist:${string}`|`album:${string}`|`collection:${string}`;
/** Page navigation keeps the player and search state mounted. */
export function usePageNavigation(){
  const [history,setHistory]=useState<{pages:Page[];index:number}>({pages:['home'],index:0});
  const setPage=(page:Page)=>setHistory(previous=>previous.pages[previous.index]===page?previous:{pages:[...previous.pages.slice(0,previous.index+1),page],index:previous.index+1});
  const back=()=>setHistory(previous=>({...previous,index:Math.max(0,previous.index-1)}));
  const forward=()=>setHistory(previous=>({...previous,index:Math.min(previous.pages.length-1,previous.index+1)}));
  return {page:history.pages[history.index],setPage,back,forward,canBack:history.index>0,canForward:history.index<history.pages.length-1};
}
