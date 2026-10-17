import {create} from 'zustand';
import type {Track} from '../../../packages/domain/index';
import {api} from './api';
import {usePlayer} from './store';
import {useLibrary} from './library';
import {t} from './i18n';

type RadioRequest={seed:Track|null;loading:boolean;error:string|null;start:(seed:Track)=>Promise<void>;cancel:()=>void};
let controller:AbortController|undefined;
export const useRadio=create<RadioRequest>((set,get)=>({
  seed:null,loading:false,error:null,
  cancel(){controller?.abort();controller=undefined;set({loading:false,error:null,seed:null});},
  async start(seed){
    get().cancel();const abort=new AbortController();controller=abort;
    const before=usePlayer.getState(),owner=useLibrary.getState().data?.profile.id;
    set({seed,loading:true,error:null});
    window.dispatchEvent(new Event('ritvio:show-radio'));
    // Transport or queue commands made while waiting win over a late result.
    const offPlayer=usePlayer.subscribe(state=>{if(state.queue!==before.queue||state.index!==before.index||state.activation!==before.activation)get().cancel();});
    const offLibrary=useLibrary.subscribe(state=>{if(state.data?.profile.id!==owner)get().cancel();});
    try{
      const result=await api.catalog.radio(seed.videoId,abort.signal);
      if(abort.signal.aborted||controller!==abort)return;
      offPlayer();offLibrary();
      if(!usePlayer.getState().startRadio(seed,result.data.items,result.cache.fetchedAt,result.cache.degraded))set({loading:false,error:t('radio.empty')});
      else set({loading:false,seed:null,error:null});
    }catch(error){if(!abort.signal.aborted&&controller===abort)set({loading:false,error:error instanceof Error?error.message:t('radio.error')});}
    finally{offPlayer();offLibrary();if(controller===abort)controller=undefined;}
  },
}));
