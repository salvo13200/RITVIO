import type {MusicResource} from './index';

type SearchItem={artists?:MusicResource[];title?:string;name?:string};
const normalize=(value:string)=>value.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('it');
function titleMatch(title:string,query:string){
  if(!query)return 0;
  if(title===query)return 3;
  if(title.startsWith(query+' ')||title.startsWith(query+' ('))return 2;
  return title.includes(query)?1:0;
}
// This is relevance, not a filter: missing credits and title-only matches remain.
// Resolve only whole artist names at the start of the query. Equal names with
// different IDs are ambiguous; never pick one by popularity or result order.
export function rankSearch<T extends SearchItem>(query:string,items:T[],candidates:MusicResource[]=[]):{items:T[];priorityArtist?:MusicResource}{
  const q=normalize(query),people=new Map<string,MusicResource>();
  for(const person of [...candidates,...items.flatMap(item=>item.artists??[])]){
    if(person.id&&normalize(person.name).length>=2)people.set(person.id+'\0'+normalize(person.name),person);
  }
  const matches=[...people.values()].filter(person=>q===normalize(person.name)||q.startsWith(normalize(person.name)+' '));
  const longest=Math.max(0,...matches.map(person=>normalize(person.name).length));
  const best=[...new Map(matches.filter(person=>normalize(person.name).length===longest).map(person=>[person.id,person])).values()];
  const artist=best.length===1?best[0]:undefined;
  const remaining=artist?q.slice(normalize(artist.name).length).trim():q;
  const scored=items.map((item,index)=>{
    const title=normalize(item.title??item.name??''),credited=!!artist&&!!item.artists?.some(person=>person.id===artist.id);
    const whole=titleMatch(title,q),partial=titleMatch(title,remaining);
    const score=artist
      ?remaining?(credited&&partial?500+partial:whole?400+whole:partial?300+partial:credited?200:0)
        :credited?500+whole:whole?100+whole:0
      :whole;
    return {item,index,score};
  });
  scored.sort((a,b)=>b.score-a.score||a.index-b.index);
  return {items:scored.map(entry=>entry.item),...(artist?{priorityArtist:{id:artist.id,name:artist.name}}:{})};
}
