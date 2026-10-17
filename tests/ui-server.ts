import {createApi} from '../apps/api/server';
import {testConfig,FixtureResolver,toneWav} from './fixtures';
const config=testConfig();
const {app,store}=await createApi({config,devOrigin:'http://127.0.0.1:5173',resolver:new FixtureResolver(config,'http://127.0.0.1:5199'),metadataOptions:{delay:async()=>{},fetch:async url=>{
  const params=new URL(String(url)).searchParams,kind=params.get('entity');
  if(params.get('term')?.includes('Assente'))return Response.json({results:[]});
  if(kind==='musicArtist')return Response.json({results:[{wrapperType:'artist',artistId:7001,artistName:'Artista test',primaryGenreName:'Electronic'},{wrapperType:'artist',artistId:7002,artistName:'Artista test',primaryGenreName:'Rock'}]});
  if(kind==='album')return Response.json({results:[{wrapperType:'collection',collectionId:7003,collectionName:'Album test 1',artistName:'Artista test',releaseDate:'2026-01-01',primaryGenreName:'Electronic'},{wrapperType:'collection',collectionId:7004,collectionName:'Album test 1 (Live)',artistName:'Altro artista',releaseDate:'2025-01-01',primaryGenreName:'Rock'}]});
  return Response.json({results:[{wrapperType:'track',kind:'song',trackId:7005,trackName:'Secondo brano',artistName:'Artista test',trackTimeMillis:12000,collectionName:'Album test 1',primaryGenreName:'Dance'}]});
}},lyricsOptions:{delay:async()=>{},fetch:async url=>{
  const address=new URL(String(url));
  const record={id:71,trackName:'Secondo brano',artistName:'Artista',albumName:'Album test 1',duration:12,instrumental:false,plainLyrics:'Prima riga originale\nSeconda riga di prova\nUltima riga originale',syncedLyrics:'[00:00]Prima riga originale\n[00:04]Seconda riga di prova\n[00:08]Ultima riga originale'};
  if(address.pathname==='/api/search')return Response.json([record]);if(address.pathname==='/api/get/71')return Response.json(record);
  return address.searchParams.get('track_name')==='Secondo brano'?Response.json(record):new Response(null,{status:404});
}},streamFetch:async(url,options)=>{
  if(String(url)!=='https://fixture.googlevideo.com/test-tone.wav')throw Error('Unexpected test stream');
  return fetch('http://127.0.0.1:5199/test-tone.wav',options);
}});
app.post('/test-reset-library',async()=>{store.db.exec('DELETE FROM taste_mixes;DELETE FROM taste_candidates;DELETE FROM taste_feedback;DELETE FROM taste_settings;DELETE FROM taste_discovery;DELETE FROM metadata_choices;DELETE FROM metadata_searches;DELETE FROM metadata_cache;DELETE FROM listening_sessions;DELETE FROM listening_settings;DELETE FROM lyrics_cache;DELETE FROM lyrics_overrides;DELETE FROM library_items;DELETE FROM library_playlists;DELETE FROM library_likes;DELETE FROM library_follows;DELETE FROM library_history;DELETE FROM library_tracks;UPDATE library_profiles SET name=\'Il mio spazio\',avatar=NULL;');return {ok:true};});
app.get('/test-tone.wav',(request,reply)=>{
  const wav=toneWav();reply.type('audio/wav').header('Accept-Ranges','bytes');
  const range=request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
  if(range){const start=Number(range[1]);const end=Math.min(range[2]?Number(range[2]):wav.length-1,wav.length-1);
    if(start>wav.length-1)return reply.code(416).header('Content-Range',`bytes */${wav.length}`).send();
    return reply.code(206).header('Content-Range',`bytes ${start}-${end}/${wav.length}`).header('Content-Length',end-start+1).send(wav.subarray(start,end+1));
  }
  return reply.header('Content-Length',wav.length).send(wav);
});
await app.listen({host:'127.0.0.1',port:5199});
process.on('SIGTERM',()=>void app.close());process.on('SIGINT',()=>void app.close());
