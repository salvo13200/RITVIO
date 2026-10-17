import {Resolver,type Resolved,type SearchSnapshot} from '../apps/api/resolver';
import type {Config} from '../apps/api/config';
import {mediaId} from '../apps/api/store';
import type {Track} from '../packages/domain/index';
import {rankSearch} from '../packages/domain/search-ranking';
import type {CatalogKind,CatalogResource,CatalogDetail,ArtistSearchKind,ArtistSearch} from '../packages/domain/catalog';
import type {RemotePlaylistPreview} from '../packages/domain/playlist-import';
import {homeCollectionIds,type HomeCollection,type HomeIndex,type HomeDetail} from '../packages/domain/home';
export const albumResource:CatalogResource={id:'MPREb_test1',name:'Album test 1',kind:'album',artwork:null,artists:[{id:'UCtestArtist01',name:'Artista test'}],year:'2026',releaseType:'Album'};
export const artistResource:CatalogResource={id:'UCtestArtist01',name:'Artista test',kind:'artist',artwork:null,artists:[],year:null,releaseType:null};
export const fixtureIds=['testmusic01','testmusic02','testvideo03'];
export const tracks:Track[]=fixtureIds.slice(0,2).map((videoId,index)=>({id:mediaId(videoId),videoId,title:index?'Secondo brano':'Primo & brano',artist:index?'Artista - Topic':'Artista indipendente',duration:12,thumbnail:`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,canonicalUrl:`https://www.youtube.com/watch?v=${videoId}`,artists:[{id:'UCtestArtist01',name:'Artista test'}],album:{id:`MPREb_test${index}`,name:`Album test ${index}`}}));
export const radioTracks:Track[]=Array.from({length:4},(_,i)=>{const videoId=`radiotest0${i}`;return {...tracks[0],id:mediaId(videoId),videoId,title:`Scoperta radio ${i+1}`,artist:`Artista radio ${i+1}`,artists:[{id:`UCradio${i}`,name:`Artista radio ${i+1}`}],thumbnail:`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,canonicalUrl:`https://www.youtube.com/watch?v=${videoId}`};});
export function testConfig(overrides:Partial<Config>={}):Config {
  return {root:process.cwd(),database:':memory:',token:'test-token-only',python:'python',node:process.execPath,timeoutMs:5000,searchTtlMs:10000,...overrides};
}
export class FixtureResolver extends Resolver {
  constructor(config:Config,private baseUrl:string){super(config);}
  calls:Array<{query:string,offset:number}>=[];
  failure:Error|null=null;
  catalogCalls:string[]=[];
  override async situations(){return ['focus','travel','energy','relax','workout','party'].map(id=>({id:id as import('../packages/domain/situations').SituationKey,params:`category_${id}`,sourceTitle:id}));}
  override async situationPlaylists(params:string){return [{id:`PL_${params}`,title:'Raccolta originale per il tuo momento',author:'Catalogo di prova',artwork:tracks[0].thumbnail}];}
  override async homeIndex():Promise<HomeIndex>{this.catalogCalls.push('home:index');if(this.failure)throw this.failure;return {collections:homeCollectionIds.map(id=>({id,playlistId:id==='releases'?null:`PL_home_${id}`,country:id==='global'?'ZZ':'IT',sourceTitle:id==='releases'?'YouTube Music · Explore':`Top Music Videos ${id}`,artwork:tracks[0].thumbnail,albums:id==='releases'?[albumResource]:[]})),missing:[]};}
  override async homeCollection(collection:HomeCollection):Promise<HomeDetail>{this.catalogCalls.push(`home:${collection.id}`);if(this.failure)throw this.failure;return {collection,tracks,albums:collection.albums,partial:false};}
  override async radio(videoId:string){this.catalogCalls.push(`radio:${videoId}`);if(this.failure)throw this.failure;return {videoId,items:videoId==='emptyradio1'?[]:[tracks[1],tracks[0],...radioTracks,radioTracks[0]]};}
  override async playlistPreview(id:string,signal:AbortSignal,phase:(provider:'youtube-music'|'youtube')=>void):Promise<RemotePlaylistPreview>{
    phase('youtube-music');
    const empty=id.includes('empty'),many=id.includes('large');
    const entries=empty?[]:many?Array.from({length:150},(_,i)=>({number:i+1,title:`Brano ${i+1}`,track:{...tracks[i%2],title:`Brano ${i+1}`}})):[{number:1,title:tracks[0].title,track:tracks[0]},{number:2,title:'Contenuto non disponibile',track:null},{number:3,title:tracks[1].title,track:tracks[1]},{number:4,title:tracks[0].title,track:tracks[0]}];
    if(signal.aborted)throw Error('Cancelled');
    return {id,url:`https://www.youtube.com/playlist?list=${id}`,title:'Playlist da link - prova',description:'Descrizione pubblica di prova',author:'Profilo dimostrativo',artwork:tracks[0].thumbnail,entries,reportedCount:empty?0:many?150:5,partial:!empty&&!many,truncated:false,provider:'youtube-music',fetchedAt:new Date().toISOString(),cache:'fresh'};
  }
  override async catalogSearch(query:string,kind:CatalogKind){this.catalogCalls.push(`search:${kind}:${query}`);if(this.failure)throw this.failure;const items=query==='Assente'?[]:kind==='album'&&query==='Artista test'?[{...albumResource,id:'MPREb_foreign',name:'Artista test',artists:[{id:'UCotherArtist',name:'Altro interprete'}]},albumResource]:[kind==='artist'?artistResource:albumResource];return kind==='album'?{...rankSearch(query,items,[artistResource]),truncated:false}:{items,truncated:false};}
  override async artistSearch(id:string,query:string,kind:ArtistSearchKind):Promise<ArtistSearch>{
    this.catalogCalls.push(`artist-search:${id}:${kind}:${query}`);if(this.failure)throw this.failure;
    if(kind==='album')return {kind,items:query==='Assente'?[]:[albumResource,{...albumResource,id:'MPREb_foreign',name:'Artista test',artists:[{id:'UCotherArtist',name:'Altro interprete'}]}],truncated:false};
    return {kind,items:query==='Assente'?[]:[...tracks,{...tracks[0],id:mediaId('foreign0001'),videoId:'foreign0001',title:'Artista test',artists:[{id:'UCotherArtist',name:'Altro interprete'}]}],truncated:false};
  }
  override async detail(kind:CatalogKind,id:string):Promise<CatalogDetail>{this.catalogCalls.push(`detail:${kind}:${id}`);if(this.failure)throw this.failure;
    const albumTracks=tracks.map(track=>({...track,album:{id,name:'Album test 1'}}));
    return kind==='album'?{...albumResource,id,kind:'album',description:'Descrizione del catalogo di prova.',entries:[...albumTracks.map((track,index)=>({number:index+1,title:track.title,duration:track.duration,track})),{number:3,title:'Traccia assente',duration:0,track:null}],reportedCount:4,incomplete:true}:{...artistResource,id,kind:'artist',description:'Biografia sintetica di prova.',tracks,albums:[albumResource],singles:[],moreAlbums:true,moreSingles:true};
  }
  override async releases(id:string,section:'albums'|'singles'){this.catalogCalls.push(`releases:${id}:${section}`);if(this.failure)throw this.failure;return {items:[{...albumResource,id:'MPREb_extra',name:'Altra pubblicazione'}],truncated:true};}
  override async installed(){return true;}
  override async search(query:string,offset=0){this.calls.push({query,offset});if(this.failure)throw this.failure;return {items:query==='Artista test'?[tracks[1],tracks[0],{...tracks[0],id:mediaId('foreign0001'),videoId:'foreign0001',title:'Artista test',artist:'Altro interprete',artists:[{id:'UCotherArtist',name:'Altro interprete'}]}]:[tracks[1],tracks[0]],nextOffset:offset===0?20:null};}
  override async searchSnapshot(query:string):Promise<SearchSnapshot>{const result=await this.search(query);return {items:query==='Assente'?[]:query==='Artista test'?[result.items[2],result.items[0],result.items[1]]:result.items,candidates:[artistResource],truncated:false};}
  override async resolve(videoId:string):Promise<Resolved>{
    const track=[...tracks,...radioTracks].find(t=>t.videoId===videoId)??tracks[0];
    return {track,playback:{mode:'youtube-audio-resolver',accessMethod:'unofficial-extraction',provider:'youtube',videoId,url:'https://fixture.googlevideo.com/test-tone.wav',expiresAt:new Date(Date.now()+60000).toISOString(),capabilities:{background:true,seek:true,volume:true,equalizer:false,offline:false}}};
  }
}
// Original synthetic tone generated by the tests, never downloaded from a provider.
export function toneWav(seconds=12){
  const samples=seconds*8000;const out=Buffer.alloc(44+samples*2);
  out.write('RIFF');out.writeUInt32LE(36+samples*2,4);out.write('WAVEfmt ',8);out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);out.writeUInt16LE(1,22);out.writeUInt32LE(8000,24);out.writeUInt32LE(16000,28);out.writeUInt16LE(2,32);out.writeUInt16LE(16,34);out.write('data',36);out.writeUInt32LE(samples*2,40);
  for(let i=0;i<samples;i++)out.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*440/8000)*800),44+i*2);
  return out;
}
