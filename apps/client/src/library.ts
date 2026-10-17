import {t} from './i18n';
import {create} from 'zustand';
import {api,ApiError} from './api';
import type {PersonalLibrary,PersonalPlaylist,Track,PlaylistSummary,FollowedResource} from '../../../packages/domain/index';
import type {PlaylistFile} from '../../../packages/domain/sharing';
import {useLibraryBrowser} from './library-browser';
type LibraryState={
  data:PersonalLibrary|null;selected:PersonalPlaylist|null;loading:boolean;busy:boolean;error:string|null;
  load:()=>Promise<void>;open:(id:string)=>Promise<void>;cancelOpen:()=>void;toggleLike:(track:Track)=>Promise<void>;
  saveQueue:(name:string,tracks:Track[])=>Promise<PersonalPlaylist|undefined>;
  create:(name:string)=>Promise<PersonalPlaylist|undefined>;
  importFile:(file:PlaylistFile)=>Promise<PersonalPlaylist|undefined>;
  importRemote:(id:string,input:import('../../../packages/domain/playlist-import').RemotePlaylistCommit)=>Promise<import('../../../packages/domain/playlist-import').RemotePlaylistResult|undefined>;
  update:(patch:Pick<PersonalPlaylist,'name'|'description'|'visibility'|'cover'>)=>Promise<boolean>;
  removePlaylist:()=>Promise<boolean>;add:(playlist:PlaylistSummary,track:Track)=>Promise<boolean>;
  removeItem:(id:string)=>Promise<void>;move:(from:number,to:number)=>Promise<void>;
  removeMany:(playlist:PersonalPlaylist,ids:string[])=>Promise<boolean>;
  transfer:(playlist:PersonalPlaylist,input:import('../../../packages/domain/playlist-tools').PlaylistTransfer)=>Promise<boolean>;
  undo:()=>Promise<boolean>;duplicate:(name:string)=>Promise<PersonalPlaylist|undefined>;
  reorderItems:(playlist:PersonalPlaylist,ids:string[])=>Promise<boolean>;
  profile:(name:string,avatar:string|null)=>Promise<boolean>;
  follow:(track:Track,kind:'artist'|'album',id:string)=>Promise<void>;unfollow:(resource:FollowedResource)=>Promise<void>;
  followResource:(kind:'artist'|'album',id:string)=>Promise<void>;
  record:(track:Track,event:string)=>Promise<void>;clearHistory:()=>Promise<boolean>;
};
let chain:Promise<unknown>=Promise.resolve();let loadGeneration=0;let openGeneration=0;
const message=(error:unknown)=>error instanceof Error?error.message:t("sharing-ui.operazione.non.riuscita.riprova");
async function mutate<T>(action:()=>Promise<T>):Promise<T|undefined>{
  const work=chain.catch(()=>{}).then(async()=>{
    useLibrary.setState({busy:true,error:null});
    try{const result=await action();await useLibrary.getState().load();return result;}
    catch(error){
      if(error instanceof ApiError&&error.code==='REVISION_CONFLICT'){
        const id=useLibrary.getState().selected?.id;if(id)await useLibrary.getState().open(id);
        await useLibrary.getState().load();
      }
      useLibrary.setState({error:message(error)});return undefined;
    }finally{useLibrary.setState({busy:false});}
  });chain=work;return work;
}
export const useLibrary=create<LibraryState>((set,get)=>({
  data:null,selected:null,loading:false,busy:false,error:null,
  async load(){const generation=++loadGeneration;set({loading:!get().data});try{const data=await api.library.snapshot();if(generation===loadGeneration){useLibraryBrowser.getState().bind(data.profile.id);set({data});}}catch(error){if(generation===loadGeneration)set({error:message(error)});}finally{if(generation===loadGeneration)set({loading:false});}},
  async open(id){const generation=++openGeneration;set({selected:null,error:null});try{const selected=await api.library.playlist(id);if(generation===openGeneration)set({selected});}catch(error){if(generation===openGeneration)set({error:message(error)});}},
  cancelOpen(){openGeneration++;set({selected:null,error:null});},
  async toggleLike(track){await mutate(async()=>{await api.restore(track);await api.library.like(track,!get().data?.likes.some(t=>t.id===track.id));});},
  async saveQueue(name,tracks){return mutate(async()=>{for(const track of new Map(tracks.map(t=>[t.id,t])).values())await api.restore(track);return api.library.fromQueue(name,tracks.map(t=>t.id));});},
  async create(name){return mutate(async()=>{const playlist=await api.library.create(name);set({selected:playlist});return playlist;});},
  async importFile(file){return mutate(async()=>{const playlist=await api.library.import(file);set({selected:playlist});return playlist;});},
  async importRemote(id,input){return mutate(async()=>{const result=await api.library.commitImport(id,input);if(get().selected?.id===result.playlist.id)set({selected:result.playlist});return result;});},
  async update(patch){return !!await mutate(async()=>{const selected=get().selected;if(!selected)return false;const updated=await api.library.update(selected,patch);set({selected:updated});return true;});},
  async removePlaylist(){return !!await mutate(async()=>{const selected=get().selected;if(!selected)return false;await api.library.delete(selected);set({selected:null});return true;});},
  async add(playlist,track){return !!await mutate(async()=>{await api.restore(track);const latest=get().data?.playlists.find(p=>p.id===playlist.id)??playlist;const updated=await api.library.add(latest,track);if(get().selected?.id===updated.id)set({selected:updated});return true;});},
  async removeItem(id){await mutate(async()=>{const selected=get().selected;if(!selected)return;set({selected:await api.library.remove(selected,id)});});},
  async removeMany(playlist,ids){return !!await mutate(async()=>{const updated=await api.library.removeMany(playlist,ids);if(get().selected?.id===updated.id)set({selected:updated});return true;});},
  async transfer(playlist,input){return !!await mutate(async()=>{const result=await api.library.transfer(playlist,input);if(get().selected?.id===playlist.id)set({selected:result.source});return true;});},
  async undo(){const playlist=get().selected;return !!await mutate(async()=>{if(!playlist)return false;const updated=await api.library.undo(playlist);if(get().selected?.id===playlist.id)set({selected:updated});return true;});},
  async duplicate(name){const playlist=get().selected;return mutate(async()=>{if(!playlist)return;const copy=await api.library.duplicate(playlist,name);if(get().selected?.id===playlist.id)set({selected:copy});return copy;});},
  async reorderItems(playlist,ids){return !!await mutate(async()=>{const updated=await api.library.reorder(playlist,ids);if(get().selected?.id===playlist.id)set({selected:updated});return true;});},
  async move(from,to){await mutate(async()=>{const selected=get().selected;if(!selected||from<0||to<0||from>=selected.items.length||to>=selected.items.length)return;const ids=selected.items.map(i=>i.id);const [item]=ids.splice(from,1);ids.splice(to,0,item);set({selected:await api.library.reorder(selected,ids)});});},
  async profile(name,avatar){return !!await mutate(async()=>{await api.library.profile(name,avatar);return true;});},
  async follow(track,kind,id){await mutate(async()=>{await api.restore(track);await api.library.follow(track,kind,id,!get().data?.follows.some(f=>f.kind===kind&&f.id===id));});},
  async unfollow(resource){await mutate(async()=>{await api.library.unfollow(resource);});},
  async followResource(kind,id){await mutate(async()=>{await api.catalog.follow(kind,id,!get().data?.follows.some(f=>f.kind===kind&&f.id===id));});},
  async record(track,event){try{await api.library.record(track,event);await get().load();}catch(error){set({error:t("library.cronologia",{p0:message(error)})});}},
  async clearHistory(){return !!await mutate(async()=>{await api.library.clearHistory();return true;});},
}));
