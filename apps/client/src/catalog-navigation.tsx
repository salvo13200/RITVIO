import {createContext,useContext} from 'react';
import type {MusicResource,Track} from '../../../packages/domain/index';
import type {CatalogKind} from '../../../packages/domain/catalog';
import {t} from './i18n';
export const CatalogNavigationContext=createContext<(kind:CatalogKind,id:string,trackId?:string)=>void>(()=>{});
export function CatalogResourceLink({resource,kind}:{resource:MusicResource;kind:CatalogKind}){
  const open=useContext(CatalogNavigationContext);return resource.id?<button type="button" className="catalog-inline-link" title={resource.name} aria-label={t(kind==='artist'?'catalog.openArtist':'catalog.openAlbum',{name:resource.name})} onClick={()=>open(kind,resource.id)}>{resource.name}</button>:<span title={resource.name}>{resource.name}</span>;
}
export function TrackCatalogLinks({track,album=false}:{track:Track;album?:boolean}){
  return <div className="track-catalog-links">{track.artists?.length?track.artists.map((artist,index)=><span key={`${artist.id}-${index}`}>{index>0&&', '}<CatalogResourceLink kind="artist" resource={artist}/></span>):<span>{track.artist}</span>}{album&&track.album&&<><span className="catalog-separator" aria-hidden="true"> · </span><CatalogResourceLink kind="album" resource={track.album}/></>}</div>;
}
