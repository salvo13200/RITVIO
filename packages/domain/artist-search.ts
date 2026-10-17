import type {MusicResource} from './index';
const normalize=(value:string)=>value.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('it');
// Offer a shortcut only when performer credits match the entire query and
// identify one catalog artist. Never infer ownership from the song title.
export function exactSearchArtist(query:string,people:MusicResource[]):MusicResource|null{
  const name=normalize(query),found=new Map<string,MusicResource>();
  if(!name)return null;
  for(const person of people)if(person.id&&normalize(person.name)===name)found.set(person.id,person);
  return found.size===1?[...found.values()][0]:null;
}
