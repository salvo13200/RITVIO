import {create} from 'zustand';
import type {Track} from '../../../packages/domain/index';
type ShareSession={track:Track;opener:HTMLElement|null;revision:number};
export const useStoryShare=create<{session:ShareSession|null;open:(track:Track)=>void;close:()=>void}>((set,get)=>({
  session:null,
  open:track=>{if(get().session)return;set({session:{track:structuredClone(track),opener:document.activeElement instanceof HTMLElement?document.activeElement:null,revision:Date.now()}});},
  close:()=>set({session:null}),
}));
