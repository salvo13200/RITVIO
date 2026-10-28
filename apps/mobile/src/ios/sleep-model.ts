export const sleepMinutes=[15,30,45,60] as const;
export type SleepMinutes=typeof sleepMinutes[number];
export type SleepMode='off'|'duration'|'track-end';
export type SleepTimerState={mode:SleepMode;minutes:SleepMinutes|null;remaining:number|null;revision:number;sample:number;reason:'expired'|'cancelled'|null};
export function parseSleepTimer(value:unknown):SleepTimerState{
 if(!value||typeof value!=='object')throw Error('INVALID_TIMER_STATE');
 const item=value as Record<string,unknown>,{mode,minutes,remaining,revision,sample,reason}=item;
 if(typeof mode!=='string'||!['off','duration','track-end'].includes(mode)||!Number.isSafeInteger(revision)||Number(revision)<0||Number(revision)>1_000_000_000||typeof sample!=='number'||!Number.isFinite(sample)||sample<0||sample>1e12||reason!==null&&reason!=='expired'&&reason!=='cancelled')throw Error('INVALID_TIMER_STATE');
 if(mode==='duration'){
  if(!sleepMinutes.includes(minutes as SleepMinutes)||!Number.isInteger(remaining)||Number(remaining)<0||Number(remaining)>Number(minutes)*60||reason!==null)throw Error('INVALID_TIMER_STATE');
 }else if(minutes!==null||remaining!==null||mode==='track-end'&&reason!==null)throw Error('INVALID_TIMER_STATE');
 return {mode,minutes,remaining,revision,sample,reason} as SleepTimerState;
}
export function acceptSleepTimer(previous:SleepTimerState|null,next:SleepTimerState):SleepTimerState{
 return previous&&(next.revision<previous.revision||next.sample<previous.sample)?previous:next;
}
export function sleepTime(seconds:number){return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;}
