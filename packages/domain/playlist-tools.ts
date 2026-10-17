import type {PlaylistItem} from './index';

/** A duplicate means the same catalog reference, not an approximate title. */
export function duplicatePlaylistItems(items:PlaylistItem[]):PlaylistItem[]{
  const seen=new Set<string>();
  return items.filter(item=>{const duplicate=seen.has(item.track.id);seen.add(item.track.id);return duplicate;});
}

/** Resolve entry IDs in saved order, independently of selection or view order. */
export function selectedPlaylistItems(items:PlaylistItem[],ids:Iterable<string>):PlaylistItem[]{
  const selected=new Set(ids);return items.filter(item=>selected.has(item.id));
}

export type PlaylistTransfer={mode:'copy'|'move';itemIds:string[];targetId:string;targetRevision:number};
export type PlaylistTransferResult={source:import('./index').PersonalPlaylist;target:import('./index').PersonalPlaylist};
