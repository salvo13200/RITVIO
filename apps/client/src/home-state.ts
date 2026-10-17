import {create} from 'zustand';
import {api} from './api';
import type {HomeIndex,HomeResult} from '../../../packages/domain/home';
let flight:Promise<void>|null=null,lastCheck=0;
export const useHomeCatalog=create<{result:HomeResult<HomeIndex>|null;loading:boolean;error:string;load:(force?:boolean)=>Promise<void>}>((set,get)=>({
  result:null,loading:false,error:'',
  async load(force=false){
    if(flight)return flight;
    if(!force&&!get().result?.refreshing&&Date.now()-lastCheck<15000)return;
    lastCheck=Date.now();set({loading:true,error:''});
    flight=(async()=>{try{set({result:await (force?api.home.refresh():api.home.get())});}catch(error){set({error:error instanceof Error?error.message:String(error)});}finally{set({loading:false});flight=null;}})();
    return flight;
  },
}));
