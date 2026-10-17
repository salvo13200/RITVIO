import {loadConfig} from '../apps/api/config';
import {Resolver} from '../apps/api/resolver';
import {Store} from '../apps/api/store';
import {HomeCatalog} from '../apps/api/home';
import {writeFile} from 'node:fs/promises';
// Uses only an isolated in-memory database. No profile, credentials or audio read.
const resolver=new Resolver(loadConfig()),store=new Store(':memory:'),home=new HomeCatalog(store,resolver),start=Date.now();
let mediaRequests=0;const resolve=resolver.resolve.bind(resolver);resolver.resolve=(...args)=>{mediaRequests++;return resolve(...args);};
try{
  const index=await home.index();if(!index.data)throw Error(index.error??'Home index unavailable');
  const first=await home.detail('italy');if(!first.data?.tracks.length)throw Error(first.error??'Italy collection unavailable');
  const releases=await home.detail('releases');if(!releases.data?.tracks.length)throw Error(releases.error??'New releases unavailable');
  const result={checkedAt:new Date().toISOString(),seconds:(Date.now()-start)/1000,edition:index.edition,collections:index.data.collections.map(c=>({id:c.id,source:c.sourceTitle,albums:c.albums.length,artwork:!!c.artwork})),italyTracks:first.data.tracks.length,releaseTracks:releases.data.tracks.length,releaseAlbums:releases.data.albums.length,partial:releases.data.partial,mediaRequests,isolatedDatabase:true};
  await writeFile('data/analysis/home-live-0633.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await home.close();await resolver.close();store.close();}
