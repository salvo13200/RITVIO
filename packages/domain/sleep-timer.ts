export type SleepTimer = {kind:'duration';deadline:number} | {kind:'track';queueId:string;activation:number};
export function durationTimer(minutes:number,now=Date.now()):SleepTimer{
  if(!Number.isInteger(minutes)||minutes<1||minutes>1440||!Number.isSafeInteger(now)||now<0)throw Error('Durata del timer non valida.');
  return {kind:'duration',deadline:now+minutes*60000};
}
export function cleanSleepTimer(value:unknown):SleepTimer|null{
  if(!value||typeof value!=='object')return null;const v=value as Partial<SleepTimer> & {deadline?:number;queueId?:string;activation?:number};
  if(v.kind==='duration'&&Number.isSafeInteger(v.deadline)&&v.deadline!>=0)return {kind:'duration',deadline:v.deadline!};
  if(v.kind==='track'&&typeof v.queueId==='string'&&v.queueId.length>0&&v.queueId.length<=128&&Number.isSafeInteger(v.activation)&&v.activation!>=0)return {kind:'track',queueId:v.queueId,activation:v.activation!};
  return null;
}
export function remainingSeconds(timer:SleepTimer|null,now=Date.now()){return timer?.kind==='duration'?Math.max(0,Math.ceil((timer.deadline-now)/1000)):null;}
export function timerDecision(timer:SleepTimer|null,queueId:string|undefined,activation:number,now=Date.now()):'none'|'expire'|'changed'{
  if(!timer)return 'none';
  if(timer.kind==='duration')return now>=timer.deadline?'expire':'none';
  return timer.queueId!==queueId||timer.activation!==activation?'changed':'none';
}
