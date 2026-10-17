export const audioBands=[80,250,1000,4000,12000] as const;
export type AudioPreferences={enabled:boolean;bands:number[];preamp:number;pan:number};
export const audioPresets={flat:[0,0,0,0,0],warm:[4,2,0,-1,-2],voice:[-2,-1,3,2,-1],detail:[-1,0,0,2,3],soft:[1,0,-1,-2,-3]} as const;
export type AudioPreset=keyof typeof audioPresets;
export const defaultAudio=():AudioPreferences=>({enabled:false,bands:[0,0,0,0,0],preamp:0,pan:0});
const bounded=(value:unknown,min:number,max:number)=>typeof value==='number'&&Number.isFinite(value)?Math.min(max,Math.max(min,value)):0;
export function cleanAudio(value:unknown):AudioPreferences{
  const raw=value&&typeof value==='object'?value as Partial<AudioPreferences>:{};
  return {enabled:raw.enabled===true,bands:audioBands.map((_,i)=>bounded(raw.bands?.[i],-12,12)),preamp:bounded(raw.preamp,-12,6),pan:bounded(raw.pan,-1,1)};
}
export function audioPreset(prefs:AudioPreferences):AudioPreset|'custom'{
  return (Object.keys(audioPresets) as AudioPreset[]).find(key=>audioPresets[key].every((gain,i)=>gain===prefs.bands[i]))??'custom';
}
