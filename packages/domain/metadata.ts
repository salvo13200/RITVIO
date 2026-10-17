export type MetadataKind='artist'|'album'|'track';
export type Genre={name:string;original:string};
export type MetadataTarget={kind:MetadataKind;id:string;name:string;artists:string[];year:string|null;duration:number|null};
export type MetadataCandidate={id:number;kind:MetadataKind;name:string;artist:string;genre:Genre[];year:string|null;duration:number|null;album:string|null;quality:'strong'|'partial'|'weak';matches:{title:boolean;artist:boolean;year:boolean|null;duration:boolean|null}};
export type MetadataSnapshot={target:MetadataTarget;status:'unclassified'|'suggested'|'confirmed'|'local';genres:Genre[];selected:MetadataCandidate|null;localGenres:Genre[]|null;candidates:MetadataCandidate[];cache:{fetchedAt:string;expiresAt:string;stale:boolean;degraded:boolean}|null;updatedAt:string|null};
const aliases:Record<string,string>={'hip-hop':'hip hop','hip-hop/rap':'hip hop / rap','hip hop/rap':'hip hop / rap','r&b/soul':'r&b / soul','electronic':'elettronica','electronica':'elettronica','alternative':'alternativa'};
export function normalizeGenres(values:string[]):Genre[]{
  const result:Genre[]=[];
  for(const value of values){const original=value.normalize('NFC').trim().replace(/\s+/g,' ');if(!original||original.length>60)continue;
    const key=original.toLocaleLowerCase('it-IT'),name=aliases[key]??key;
    if(['music','musica'].includes(name)||result.some(g=>g.name===name))continue;
    result.push({name,original});if(result.length===20)break;
  }return result;
}
export const metadataName=(value:string)=>value.normalize('NFC').toLocaleLowerCase('it-IT').trim().replace(/[’‘]/g,"'").replace(/\s+/g,' ');
export function compareMetadata(candidate:Omit<MetadataCandidate,'quality'|'matches'>,target:MetadataTarget):MetadataCandidate{
  const title=metadataName(candidate.name)===metadataName(target.name);
  const artist=target.kind==='artist'?title:target.artists.length===1&&metadataName(candidate.artist)===metadataName(target.artists[0]);
  const year=target.year&&candidate.year?target.year===candidate.year:null;
  const duration=target.duration&&candidate.duration?Math.abs(target.duration-candidate.duration)<=2:null;
  // A ranking is evidence to inspect, never a verified identity or a probability.
  const quality=title&&artist&&year!==false&&duration!==false&&target.kind!=='artist'&&(year===true||duration===true)?'strong':title&&artist?'partial':'weak';
  return {...candidate,quality,matches:{title,artist,year,duration}};
}
