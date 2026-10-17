export interface UILayoutPreferences {sidebarWidth:number;panelWidth:number;sidebarCollapsed:boolean;motion:'curated'|'essential'}
export const defaultUILayout=():UILayoutPreferences=>({sidebarWidth:272,panelWidth:408,sidebarCollapsed:false,motion:'curated'});
export function cleanUILayout(value:unknown):UILayoutPreferences {
  const defaults=defaultUILayout();if(!value||typeof value!=='object')return defaults;
  const raw=value as Partial<UILayoutPreferences>;
  const width=(candidate:unknown,fallback:number,min:number,max:number)=>typeof candidate==='number'&&Number.isFinite(candidate)?Math.round(Math.max(min,Math.min(max,candidate))):fallback;
  return {sidebarWidth:width(raw.sidebarWidth,defaults.sidebarWidth,216,320),panelWidth:width(raw.panelWidth,defaults.panelWidth,300,420),sidebarCollapsed:raw.sidebarCollapsed===true,motion:raw.motion==='essential'?'essential':'curated'};
}
