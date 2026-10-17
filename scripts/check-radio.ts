import {loadConfig} from '../apps/api/config';
import {Resolver} from '../apps/api/resolver';
import {radioSuggestions} from '../packages/domain/radio';
import {writeFile} from 'node:fs/promises';
const resolver=new Resolver(loadConfig());
try{
  const search=await resolver.searchSnapshot('Daft Punk One More Time');const seed=search.items[0];if(!seed)throw Error('No seed in real catalog');
  const started=performance.now(),result=await resolver.radio(seed.videoId),suggestions=radioSuggestions(seed,result.items,{tracks:[],artists:[]});
  if(!suggestions.length)throw Error('Real radio has no usable suggestions');
  const record={seed:{title:seed.title,artist:seed.artist,videoId:seed.videoId},providerItems:result.items.length,suggestions:suggestions.length,withArtistIds:suggestions.filter(t=>t.artists?.length).length,withAlbum:suggestions.filter(t=>t.album).length,withDuration:suggestions.filter(t=>t.duration>0).length,catalogMs:Math.round(performance.now()-started),audioResolved:false};
  await writeFile('data/analysis/radio-provider.json',JSON.stringify(record,null,2));console.log(JSON.stringify(record));
}finally{await resolver.close();}
