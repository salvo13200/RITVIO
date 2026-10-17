import {AppError} from './errors';
import {catalogArtwork,catalogResource,catalogTrack} from './catalog-normalize';
import {homeCollectionIds,publicHomeCollectionIds,type HomeCollection,type HomeIndex,type HomeDetail} from '../../packages/domain/home';
const fail=()=>new AppError(502,'HOME_INVALID','Le raccolte non sono disponibili. Riprova tra poco.');
export function normalizeHomeIndex(value:any):HomeIndex{
  if(!value||!Array.isArray(value.collections)||value.collections.length>4)throw fail();
  const seen=new Set<string>(),collections:HomeCollection[]=[];
  for(const item of value.collections){
    if(!item||!homeCollectionIds.includes(item.id)||seen.has(item.id)||!(item.id==='releases'?(item.country===null||item.country==='IT'):item.country===(item.id==='global'?'ZZ':'IT'))||!Array.isArray(item.albums)||item.albums.length>24)throw fail();
    if(item.id!=='releases'&&(typeof item.playlistId!=='string'||!/^[A-Za-z0-9_-]{1,160}$/.test(item.playlistId)))throw fail();
    const albums=item.albums.map((a:any)=>catalogResource(a,'album'));
    if(item.id==='releases'&&!albums.length)continue;
    seen.add(item.id);collections.push({id:item.id,country:item.country,playlistId:item.id==='releases'?null:item.playlistId,sourceTitle:typeof item.sourceTitle==='string'?item.sourceTitle.slice(0,300):'YouTube Music',artwork:catalogArtwork(item.artwork),albums});
  }
  if(!collections.length)throw fail();
  return {collections,missing:publicHomeCollectionIds.filter(id=>!seen.has(id))};
}
export function normalizeHomeDetail(value:any,collection:HomeCollection):HomeDetail{
  if(!value||!Array.isArray(value.tracks)||value.tracks.length>100||typeof value.partial!=='boolean')throw fail();
  const seen=new Set<string>(),tracks=value.tracks.map(catalogTrack).filter((t:ReturnType<typeof catalogTrack>)=>{if(seen.has(t.videoId))return false;seen.add(t.videoId);return true;});
  if(!tracks.length)throw fail();
  return {collection,tracks,albums:collection.albums,partial:value.partial};
}
