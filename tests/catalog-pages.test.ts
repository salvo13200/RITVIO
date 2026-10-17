import test from 'node:test';
import assert from 'node:assert/strict';
import {createApi} from '../apps/api/server';
import {FixtureResolver,testConfig,tracks} from './fixtures';
import {AppError} from '../apps/api/errors';
import {catalogArtwork,normalizeCatalogDetail,normalizeCatalogSearch} from '../apps/api/catalog-normalize';
import {requestBudget} from '../apps/api/request-budget';
const headers={authorization:'Bearer test-token-only',origin:'http://127.0.0.1:5173'};

test('saved artist artwork comes from its exact profile, persists and shares the catalog cache',async()=>{
  const config=testConfig(),resolver=new FixtureResolver(config,'');
  const original=resolver.detail.bind(resolver);resolver.detail=async(kind,id)=>({...await original(kind,id),artwork:'https://yt3.ggpht.com/artist-profile'});
  const {app,store}=await createApi({config,resolver,devOrigin:headers.origin});
  try{
    const snapshot=(await app.inject({url:'/v1/me/library',headers})).json(),owner=snapshot.profile.id,id='UCtestArtist01';
    store.library.follow(owner,{id,kind:'artist',name:'Nome salvato',artwork:null,url:'https://music.youtube.com/browse/'+id},true);
    const url='/v1/me/catalog/artist/'+id+'/artwork';
    const [one,two]=await Promise.all([app.inject({method:'POST',url,headers}),app.inject({method:'POST',url,headers})]);
    assert.equal(one.statusCode,200);assert.equal(two.statusCode,200);
    assert.equal(one.json().resource.artwork,'https://yt3.ggpht.com/artist-profile');assert.notEqual(one.json().resource.artwork,tracks[0].thumbnail);
    assert.equal(store.library.snapshot(owner).follows[0].artwork,one.json().resource.artwork);assert.equal(store.library.snapshot(owner).follows[0].name,'Nome salvato');
    assert.equal(resolver.catalogCalls.length,1);await app.inject({method:'POST',url,headers});assert.equal(resolver.catalogCalls.length,1);
    assert.equal(requestBudget('POST',url),'artwork');assert.equal(requestBudget('GET','/v1/catalog/artist/'+id),'catalog');
  }finally{await app.close();}
});

test('late artist artwork cannot restore a removed follow or edit another profile',async()=>{
  const config=testConfig(),resolver=new FixtureResolver(config,'');let principal='initial',release!:()=>void,started!:()=>void;
  const entered=new Promise<void>(resolve=>started=resolve),gate=new Promise<void>(resolve=>release=resolve),original=resolver.detail.bind(resolver);resolver.detail=async(kind,id)=>{started();await gate;return {...await original(kind,id),artwork:'https://yt3.ggpht.com/artist-profile'};};
  const {app,store}=await createApi({config,resolver,devOrigin:headers.origin,identityProvider:{async resolve(){return {id:principal,mode:'online'};}}});
  const one=store.library.ensureProfile('online').id,two=store.library.ensureProfile('online').id,id='UCtestArtist01',url='/v1/me/catalog/artist/'+id+'/artwork',resource={id,kind:'artist' as const,name:'Artista',artwork:null,url:''};
  store.library.follow(one,resource,true);store.library.follow(two,resource,true);principal=one;
  try{
    const response=app.inject({method:'POST',url,headers});await entered;
    store.library.follow(one,resource,false);release();const result=await response;
    assert.equal(result.statusCode,200);assert.equal(result.json().resource,null);assert.equal(store.library.snapshot(one).follows.length,0);assert.equal(store.library.snapshot(two).follows[0].artwork,null);
    const missing=await app.inject({method:'POST',url,headers});assert.equal(missing.statusCode,404);assert.equal(resolver.catalogCalls.length,1);
  }finally{release();await app.close();}
});

test('unavailable artist photos preserve saved data and require an authenticated valid followed id',async()=>{
  const config=testConfig(),resolver=new FixtureResolver(config,'');resolver.failure=new AppError(503,'RESOLVER_FAILED','Non disponibile');const {app,store}=await createApi({config,resolver,devOrigin:headers.origin});
  try{
    const {profile}= (await app.inject({url:'/v1/me/library',headers})).json(),resource={id:'UCtestArtist01',kind:'artist' as const,name:'Artista',artwork:null,url:''};store.library.follow(profile.id,resource,true);
    const url='/v1/me/catalog/artist/'+resource.id+'/artwork';assert.equal((await app.inject({method:'POST',url,headers})).statusCode,503);assert.deepEqual(store.library.snapshot(profile.id).follows,[resource]);
    assert.equal((await app.inject({method:'POST',url})).statusCode,401);assert.equal((await app.inject({method:'POST',url:'/v1/me/catalog/artist/..%2Fwrong/artwork',headers})).statusCode,400);
  }finally{await app.close();}
});
test('catalog caches and coalesces pages, retains unavailable rows, restores metadata to media cache',async()=>{
  const config=testConfig(),resolver=new FixtureResolver(config,'');const {app,store}=await createApi({config,resolver,devOrigin:headers.origin});
  try{const url='/v1/catalog/album/MPREb_test1';const pages=await Promise.all([app.inject({url,headers}),app.inject({url,headers})]);assert.equal(pages[0].statusCode,200);assert.equal(resolver.catalogCalls.length,1);const data=pages[0].json().data;assert.equal(data.entries.length,3);assert.equal(data.entries[2].track,null);assert.equal(data.incomplete,true);assert.equal(data.entries[0].number,1);assert.equal(store.getTrack(tracks[0].id)?.album?.id,'MPREb_test1');store.db.exec('DELETE FROM tracks');const hit=await app.inject({url,headers});assert.equal(hit.json().cache.hit,true);assert.ok(store.getTrack(tracks[0].id));assert.equal(resolver.catalogCalls.length,1);
    const one=await app.inject({url:'/v1/catalog/search?q=ARTISTA%20%20test&kind=artist',headers});const two=await app.inject({url:'/v1/catalog/search?q=artista%20test&kind=artist',headers});assert.equal(one.statusCode,200);assert.equal(two.json().cache.hit,true);assert.equal(resolver.catalogCalls.filter(c=>c.startsWith('search')).length,1);
  }finally{await app.close();}
});
test('stale catalog fallback is explicit, server errors are not cached without prior data',async()=>{
  const config=testConfig(),resolver=new FixtureResolver(config,'');const {app,store}=await createApi({config,resolver,devOrigin:headers.origin});
  try{const url='/v1/catalog/artist/UCtestArtist01';await app.inject({url,headers});store.db.exec('UPDATE catalog_pages SET expires=0');resolver.failure=new AppError(503,'RESOLVER_FAILED','Non disponibile');const stale=await app.inject({url,headers});assert.equal(stale.statusCode,200);assert.equal(stale.json().cache.degraded,true);assert.equal(stale.json().cache.hit,true);const missing=await app.inject({url:'/v1/catalog/artist/UCanother',headers});assert.equal(missing.statusCode,503);assert.equal(store.db.prepare('SELECT count(*) n FROM catalog_pages').get()!.n,1);resolver.failure=null;const recovered=await app.inject({url,headers});assert.equal(recovered.json().cache.degraded,false);assert.equal(recovered.json().cache.hit,false);
  }finally{await app.close();}
});
test('catalog follow is isolated by principal, derives server metadata and supports no-track resources',async()=>{
  const config=testConfig(),resolver=new FixtureResolver(config,'');let principal='one';const {app,store}=await createApi({config,resolver,devOrigin:headers.origin,identityProvider:{async resolve(){return {id:principal,mode:'online'};}}});
  const one=store.library.ensureProfile('online').id,two=store.library.ensureProfile('online').id;principal=one;
  try{const url='/v1/me/catalog/artist/UCtestArtist01';let response=await app.inject({method:'PUT',url,headers,payload:{followed:true}});assert.equal(response.statusCode,200);assert.equal(store.library.snapshot(one).follows[0].name,'Artista test');principal=two;assert.equal(store.library.snapshot(two).follows.length,0);await app.inject({method:'PUT',url,headers,payload:{followed:false}});assert.equal(store.library.snapshot(one).follows.length,1);principal=one;response=await app.inject({method:'PUT',url,headers,payload:{followed:false}});assert.equal(response.statusCode,200);assert.equal(store.library.snapshot(one).follows.length,0);
  }finally{await app.close();}
});
test('catalog endpoints reject auth, origin, arbitrary identifiers and owner injection; releases cache independently',async()=>{
  const config=testConfig(),resolver=new FixtureResolver(config,'');const {app}=await createApi({config,resolver,devOrigin:headers.origin});
  try{assert.equal((await app.inject('/v1/catalog/album/MPREb_test1')).statusCode,401);assert.equal((await app.inject({url:'/v1/catalog/album/MPREb_test1',headers:{...headers,origin:'https://bad.example'}})).statusCode,403);
    for(const url of ['/v1/catalog/search?q=%20%20%20&kind=album','/v1/catalog/search?q=Artist&kind=video','/v1/catalog/album/https%3A%2F%2Fbad.example','/v1/catalog/artist/UCtest/releases/private'])assert.equal((await app.inject({url,headers})).statusCode,400,url);
    assert.equal((await app.inject({method:'PUT',url:'/v1/me/catalog/album/MPREb_test1',headers,payload:{followed:true,owner:'one'}})).statusCode,400);
    const url='/v1/catalog/artist/UCtestArtist01/releases/albums';const result=await app.inject({url,headers});assert.equal(result.statusCode,200);assert.equal(result.json().data.truncated,true);assert.equal((await app.inject({url,headers})).json().cache.hit,true);assert.equal(resolver.catalogCalls.length,1);
  }finally{await app.close();}
});
test('resolver normalizes catalog safely, preserves album order and never makes unavailable tracks playable',()=>{
  const summary={id:'MPREb_test1',kind:'album',name:' Album ',artwork:'https://bad.example/a',artists:[],year:'2026',releaseType:'Album'};
  const song={videoId:'testmusic01',title:'Originale',artist:'Artista',duration:Infinity,album:{id:'MPREb_test1',name:'Album'}};
  const album=normalizeCatalogDetail({...summary,description:'<img src=x>',entries:[{number:0,title:'Assente',duration:10,track:null},{number:99,title:'Originale',duration:20,track:song}],reportedCount:3,incomplete:false},'album','MPREb_test1');assert.equal(album.kind,'album');if(album.kind!=='album')return;assert.equal(album.artwork,null);assert.equal(album.entries[0].number,1);assert.equal(album.entries[0].track,null);assert.equal(album.entries[1].number,2);assert.equal(album.entries[1].track?.duration,0);assert.equal(album.incomplete,true);assert.equal(album.description,'<img src=x>');
  assert.throws(()=>normalizeCatalogDetail({...summary,id:'MPREwrong'},'album','MPREb_test1'));assert.throws(()=>normalizeCatalogSearch({items:[{...summary,id:'../bad'}],truncated:false},'album'));
  assert.equal(catalogArtwork('https://lh3.googleusercontent.com/cover=w544'), 'https://lh3.googleusercontent.com/cover=w544');assert.equal(catalogArtwork('http://lh3.googleusercontent.com/cover'),null);assert.equal(catalogArtwork('https://lh3.googleusercontent.com.bad.example/cover'),null);assert.equal(catalogArtwork('https://a:pass@lh3.googleusercontent.com/cover'),null);
});
