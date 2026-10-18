/** Do not spend bandwidth on the next track until current playback has headroom. */
export function canPreloadAudio(position:number,duration:number,ranges:ReadonlyArray<readonly [number,number]>){
  if(!Number.isFinite(position)||position<0)return false;
  return ranges.some(([start,end])=>Number.isFinite(start)&&Number.isFinite(end)&&start<=position+.05&&end>position&&
    (end-position>=8||Number.isFinite(duration)&&duration>0&&end>=duration-.25));
}
