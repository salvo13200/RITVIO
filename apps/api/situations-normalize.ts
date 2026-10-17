import {AppError} from './errors';
import {catalogArtwork} from './catalog-normalize';
import {situationKeys,type Situation,type SituationPlaylist} from '../../packages/domain/situations';
const fail=()=>new AppError(502,'SITUATION_INVALID','Le raccolte per questo momento non sono disponibili. Riprova più tardi.');
export function situationIndex(value:any):Situation[]{
  if(!value||!Array.isArray(value.items)||!value.items.length||value.items.length>6)throw fail();
  const seen=new Set<string>();return value.items.map((item:any)=>{if(!item||!situationKeys.includes(item.id)||seen.has(item.id)||typeof item.params!=='string'||!(/^[A-Za-z0-9_=%+\-]{1,1024}$/).test(item.params)||typeof item.sourceTitle!=='string')throw fail();seen.add(item.id);return {id:item.id,params:item.params,sourceTitle:item.sourceTitle.slice(0,200)};});
}
export function situationPlaylists(value:any):SituationPlaylist[]{
  if(!value||!Array.isArray(value.items)||!value.items.length||value.items.length>12)throw fail();const seen=new Set<string>();
  return value.items.map((item:any)=>{if(!item||typeof item.id!=='string'||!(/^[A-Za-z0-9_-]{1,160}$/).test(item.id)||seen.has(item.id)||typeof item.title!=='string'||!item.title.trim())throw fail();seen.add(item.id);return {id:item.id,title:item.title.slice(0,300),author:typeof item.author==='string'?item.author.slice(0,200):'YouTube Music',artwork:catalogArtwork(item.artwork)};});
}
