import {useRef,useState} from 'react';

/** A range edits a draft; release, keyboard completion or blur commits it once. */
export function useRangeDraft(value:number,onCommit:(value:number)=>void){
 const [draft,setDraft]=useState<number|null>(null),pending=useRef<number|null>(null);
 function change(next:number){pending.current=next;setDraft(next);}
 function commit(){const next=pending.current;if(next===null)return;pending.current=null;setDraft(null);onCommit(next);}
 function cancel(){pending.current=null;setDraft(null);}
 function keyUp(event:React.KeyboardEvent<HTMLInputElement>){if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key))commit();}
 return {value:draft??value,change,commit,cancel,keyUp};
}
