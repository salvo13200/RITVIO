import test from 'node:test';
import assert from 'node:assert/strict';
import {createApi} from '../apps/api/server';
import {Store} from '../apps/api/store';
import {ResolverCatalog} from '../apps/api/catalog';
import {allowedStreamUrl,Resolver} from '../apps/api/resolver';
import {AppError} from '../apps/api/errors';
import {testConfig,FixtureResolver,tracks} from './fixtures';
const headers={authorization:'Bearer test-token-only',origin:'http://127.0.0.1:5173'};
function paginatedFixture(resolver:FixtureResolver){resolver.searchSnapshot=async query=>{const result=await resolver.search(query);return {items:Array.from({length:22},(_,i)=>({...result.items[i%2],id:`page-${i}`,videoId:`page${String(i).padStart(7,'0')}`})),candidates:[],truncated:false};};}
test('local API uses resolvers for search and playback without API keys or opt-in flags',async()=>{
  const config=testConfig();const resolver=new FixtureResolver(config,'http://127.0.0.1:5199');
  const {app}=await createApi({config,devOrigin:headers.origin,resolver});
  try{
    assert.equal((await app.inject('/v1/runtime')).statusCode,401);
    assert.equal((await app.inject({url:'/v1/runtime',headers:{...headers,origin:'https://untrusted.example'}})).statusCode,403);
    const status=(await app.inject({url:'/v1/runtime',headers})).json();
    assert.equal(status.catalogProvider,'youtube-music');assert.equal(status.resolverInstalled,true);assert.equal('searchConfigured' in status,false);
    assert.equal((await app.inject({url:'/v1/search?q=xy',headers})).statusCode,400);
    assert.equal((await app.inject({method:'POST',url:'/v1/links/resolve',headers,payload:{videoId:'../../secret'}})).statusCode,400);
    const search=await app.inject({url:'/v1/search?q=Musica%20test',headers});
    assert.equal(search.statusCode,200);assert.equal(search.json().items.length,2);assert.equal(resolver.calls.length,1);
    const link=await app.inject({method:'POST',url:'/v1/links/resolve',headers,payload:{videoId:tracks[0].videoId}});
    assert.equal(link.statusCode,200);
    const playback=await app.inject({method:'POST',url:`/v1/media/${tracks[0].id}/playback`,headers});
    assert.equal(playback.statusCode,200);assert.equal(playback.json().mode,'youtube-audio-resolver');
    assert.equal(playback.json().accessMethod,'unofficial-extraction');
  }finally{await app.close();}
});
test('catalog shares concurrent resolver requests and preserves full music metadata in cache',async()=>{
  const store=new Store(':memory:');const resolver=new FixtureResolver(testConfig(),'http://127.0.0.1:5199');const catalog=new ResolverCatalog(testConfig(),store,resolver);
  paginatedFixture(resolver);
  try{
    const [one,two]=await Promise.all([catalog.search(' Musica   test '),catalog.search('Musica test')]);
    assert.deepEqual(one,two);assert.equal(resolver.calls.length,1);assert.equal(one.items[0].artist,tracks[1].artist);
    assert.equal(store.getTrack(one.items[0].id)?.duration,12);
    assert.equal((await catalog.search('MUSICA test')).cache.hit,true);assert.equal(resolver.calls.length,1);
    await assert.rejects(catalog.search('Altra musica',one.nextCursor!),/Pagina di ricerca non valida/);
    await assert.rejects(catalog.search('Musica test',`${one.nextCursor}tampered`),/pagina è scaduta/);
  }finally{store.close();}
});
test('outage, busy resolver and timeout use stale cache; new queries report the error',async()=>{
  const store=new Store(':memory:');const resolver=new FixtureResolver(testConfig(),'http://127.0.0.1:5199');
  try{
    await new ResolverCatalog(testConfig(),store,resolver).search('Musica test');store.db.exec('UPDATE search_cache SET expires=0');
    for(const status of [429,503,504]){
      resolver.failure=new AppError(status,'RESOLVER_FAILED','Il servizio musicale non risponde.');
      const catalog=new ResolverCatalog(testConfig(),store,resolver);
      const cached=await catalog.search('Musica test');assert.equal(cached.cache.degraded,true);
      await assert.rejects(catalog.search('Altra musica'),(error:any)=>error.code==='RESOLVER_FAILED');
    }
  }finally{store.close();}
});
test('cached pagination is re-signed after restart and reads the same snapshot without refetching',async()=>{
  const store=new Store(':memory:');const resolver=new FixtureResolver(testConfig(),'http://127.0.0.1:5199');
  paginatedFixture(resolver);
  try{
    await new ResolverCatalog(testConfig(),store,resolver).search('Musica test');
    const relaunched=new ResolverCatalog(testConfig({token:'another-launch-token'}),store,resolver);
    const cached=await relaunched.search('musica test');assert.equal(cached.cache.hit,true);
    const next=await relaunched.search('musica test',cached.nextCursor!);assert.equal(next.nextCursor,null);assert.equal(next.items.length,2);assert.equal(resolver.calls.length,1);assert.equal(resolver.calls.at(-1)?.offset,0);
  }finally{store.close();}
});
test('runtime detects missing dependencies; process failures never expose upstream details',async()=>{
  const resolver=new FixtureResolver(testConfig(),'http://127.0.0.1:5199');
  resolver.installed=async()=>false;resolver.failure=Error('secret upstream token');
  const {app}=await createApi({config:testConfig(),resolver,devOrigin:headers.origin});
  try{
    assert.equal((await app.inject({url:'/v1/runtime',headers})).json().resolverInstalled,false);
    const result=await app.inject({url:'/v1/search?q=Musica%20test',headers});assert.equal(result.statusCode,500);assert.equal(result.body.includes('secret'),false);
  }finally{await app.close();}
});
test('resolver validates stream hosts, video IDs, search size and pagination before launching children',async()=>{
  assert.equal(allowedStreamUrl('https://r1.googlevideo.com/videoplayback'),true);
  for(const url of ['http://r1.googlevideo.com/x','https://googlevideo.com.evil.test/x','https://user:pass@r1.googlevideo.com/x','https://127.0.0.1/x','https://r1.googlevideo.com:444/x'])assert.equal(allowedStreamUrl(url),false);
  const resolver=new Resolver(testConfig());
  await assert.rejects(resolver.resolve('$(bad command)'),(error:any)=>error.code==='INVALID_VIDEO');
  for(const [query,offset] of [['xy',0],['musica',1],['musica',100],['x'.repeat(201),0]] as const)await assert.rejects(resolver.search(query,offset),(error:any)=>error.code==='INVALID_REQUEST');
});
