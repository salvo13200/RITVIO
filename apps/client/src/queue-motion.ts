import {motionMode,motionRevision,trackAnimation} from './ui-motion';
const pending=new WeakMap<HTMLElement,number>();
/** FLIP keeps queue identity and playback intact while explaining the new order. */
export async function moveWithMotion<R>(container:HTMLElement|null,move:()=>R|Promise<R>,kind:'queue'|'playlist'='queue'):Promise<R>{
  if(!container||motionMode()!=='curated')return await move();
  const selector=kind==='queue'?'[data-queue-id]':'[data-playlist-item-id]',attribute=kind==='queue'?'queueId':'playlistItemId',id=kind+'-reorder';
  const generation=(pending.get(container)??0)+1;pending.set(container,generation);
  const policyRevision=motionRevision();
  const rows=Array.from(container.querySelectorAll<HTMLElement>(selector));
  const positions=new Map(rows.map(row=>[row.dataset[attribute],row.getBoundingClientRect().top]));
  for(const row of rows)for(const animation of row.getAnimations())if(animation.id===id)animation.cancel();
  const result=await move();
  requestAnimationFrame(()=>{
    if(!container.isConnected||pending.get(container)!==generation||motionRevision()!==policyRevision||motionMode()!=='curated')return;
    for(const row of container.querySelectorAll<HTMLElement>(selector)){
      const previous=positions.get(row.dataset[attribute]);if(previous==null)continue;const delta=previous-row.getBoundingClientRect().top;if(Math.abs(delta)<1)continue;
      trackAnimation(row.animate([{transform:`translateY(${delta}px)`},{transform:'translateY(0)'}],{duration:240,easing:'cubic-bezier(.16,1,.3,1)'}),id);
    }
  });return result;
}
