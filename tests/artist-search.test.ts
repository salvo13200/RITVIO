import test from 'node:test';
import assert from 'node:assert/strict';
import {createApi} from '../apps/api/server';
import {FixtureResolver,testConfig,tracks} from './fixtures';
import {exactSearchArtist} from '../packages/domain/artist-search';
import {AppError} from '../apps/api/errors';
const headers={authorization:'Bearer test-token-only',origin:'http://127.0.0.1:5173'};
test('artist shortcut uses exact performer credit, refuses substrings and homonymous IDs',()=>{
  const people=[{id:'UCone',name:'Marracash'},{id:'UCtwo',name:'Altro artista'}];
  assert.equal(exactSearchArtist('  MARRACASH ',people)?.id,'UCone');
  assert.equal(exactSearchArtist('Marra',people),null);assert.equal(exactSearchArtist('Marracash King',people),null);
  assert.equal(exactSearchArtist('Marracash',[...people,{id:'UCother',name:'Marracash'}]),null);
  assert.equal(exactSearchArtist('Marracash',[people[0],people[0]])?.id,'UCone');
});
test('artist search excludes namesakes and title-only matches, retains collaborations and isolated cache',async()=>{
  const config=testConfig(),resolver=new FixtureResolver(config,'');const {app,store}=await createApi({config,resolver,devOrigin:headers.origin});
  try{
    const global=await app.inject({url:'/v1/search?q=Artista%20test',headers});assert.equal(global.json().items.length,3);
    const path='/v1/catalog/artist/UCtestArtist01/search?q=Artista%20test&kind=track';
    const one=await app.inject({url:path,headers});assert.equal(one.statusCode,200);assert.equal(one.json().data.items.length,2);assert.equal(one.json().data.items.some((item:any)=>item.title==='Artista test'),false);
    assert.ok(store.getTrack(tracks[0].id));assert.equal((await app.inject({url:path,headers})).json().cache.hit,true);
    const wrongId=await app.inject({url:path.replace('UCtestArtist01','UCnamesake'),headers});assert.equal(wrongId.json().data.items.length,0);assert.equal(wrongId.json().cache.hit,false);
    const album=await app.inject({url:path.replace('kind=track','kind=album'),headers});assert.equal(album.json().data.items.length,1);assert.equal(album.json().data.items[0].name,'Album test 1');
    resolver.artistSearch=async()=>({kind:'track',items:[{...tracks[0],artists:[{id:'UCother',name:'Coautore'},{id:'UCtestArtist01',name:'Artista test'}]},{...tracks[1],artists:[{id:'UCnamesake',name:'Artista test'}]}],truncated:false});
    const collaboration=await app.inject({url:path.replace('Artista%20test','Collaborazione'),headers});assert.equal(collaboration.json().data.items.length,1);
  }finally{await app.close();}
});
test('scoped search validates auth, origin, parameters and falls back only to its own stale cache',async()=>{
  const config=testConfig(),resolver=new FixtureResolver(config,'');const {app,store}=await createApi({config,resolver,devOrigin:headers.origin});
  const url='/v1/catalog/artist/UCtestArtist01/search?q=&kind=track';
  try{
    assert.equal((await app.inject(url)).statusCode,401);assert.equal((await app.inject({url,headers:{...headers,origin:'https://wrong.example'}})).statusCode,403);
    for(const invalid of [url.replace('kind=track','kind=artist'),url+'&owner=anything',url.replace('q=','q='+('a'.repeat(201))),url.replace('UCtestArtist01','..%2Fsecret')])assert.equal((await app.inject({url:invalid,headers})).statusCode,400);
    await app.inject({url,headers});store.db.exec('UPDATE catalog_pages SET expires=0');resolver.failure=new AppError(503,'RESOLVER_FAILED','Non disponibile');
    const stale=await app.inject({url,headers});assert.equal(stale.json().cache.degraded,true);assert.equal(stale.json().data.items.length,2);
    assert.equal((await app.inject({url:url.replace('UCtestArtist01','UCother'),headers})).statusCode,503);
  }finally{await app.close();}
});
