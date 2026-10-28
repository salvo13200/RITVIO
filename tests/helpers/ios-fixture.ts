import type {Page} from '@playwright/test';
import {expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
export async function fixture(page:Page,{empty=false,scale=1,withLibrary=false,librarySeed=null,lyrics=false,sharing=false,sleepTimer=false}:{empty?:boolean;scale?:number;withLibrary?:boolean;librarySeed?:any;lyrics?:boolean;sharing?:boolean;sleepTimer?:boolean}={}){
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 const cover=await readFile('apps/client/public/artwork/electronic.webp');
 await page.route('https://i.ytimg.com/**',route=>route.fulfill({contentType:'image/webp',body:cover}));
 await page.route('**/src/native.ts*',route=>route.fulfill({contentType:'application/javascript',body:'export const isIOS=true;export const isAndroid=false;export const isNativeMobile=true;export const nativePlayback=window.__ios;'}));
 await page.route('**/src/ios/native.ts*',route=>route.fulfill({contentType:'application/javascript',body:'export const foundationBridge=window.__ios;'}));
 await page.addInitScript(({empty,scale,withLibrary,librarySeed,lyrics,sharing,sleepTimer,storyCover})=>{
  const tracks=['After the rain','Slow motion','Golden hour','Night swim','An unusually long title that must remain readable without growing the player'].map((title,i)=>({videoId:`ritviotest${i+1}`,title,artist:['Luna Vale','North Avenue','June Atlas','Luna Vale','Many collaborating artists with a very long name'][i],thumbnail:`https://i.ytimg.com/vi/ritviotest${i+1}/hqdefault.jpg`,duration:90,artists:[{id:i===0||i===3?'fixture-artist':`fixture-artist-${i}`,name:['Luna Vale','North Avenue','June Atlas','Luna Vale','Many collaborating artists with a very long name'][i]}],...(i===0?{album:{id:'fixture-album',name:'Night scenes'}}:{})}));
  let state:any={items:empty?[]:tracks,index:0,order:empty?[]:[0,1,2,3,4],queueRevision:1,position:24,duration:90,buffered:65,playing:false,loading:false,repeat:'off',shuffle:false,volume:1,error:null,status:'ready',stamp:{session:1,sequence:0}};
  const timerListeners=new Set<(value:any)=>void>();
  let timerState:any={mode:'off',minutes:null,remaining:null,revision:0,sample:1,reason:null};
  const timerEmit=(value:any)=>{timerState={...timerState,...value,sample:timerState.sample+1};for(const listener of timerListeners)listener({...timerState});return {...timerState};};
  Object.assign(window,{__iosTimerEmit:timerEmit,__iosTimer:()=>({...timerState})});
  const collections=new Set<(value:any)=>void>();
  const operations:any[]=[],listeners=new Set<(value:any)=>void>(),languages=new Set<(value:any)=>void>();
  let language:any={schema:1,preference:localStorage.getItem('__iosLanguage')??'en',revision:1,systemLanguages:['en-US']};
  const copy=(value:any)=>JSON.parse(JSON.stringify(value));
  const emit=()=>{state.stamp.sequence++;for(const listener of listeners)listener(copy(state));return copy(state);};
  const fail=(code:string)=>Object.assign(Error(code),{code});
  Object.assign(window,{__iosOperations:operations,__iosState:()=>copy(state),__iosEmit:(value:any)=>{state={...state,...value};return emit();},__ios:{
   foundationStatus:async()=>({platform:'ios',phase:withLibrary?'IOS-5':'IOS-4',version:sleepTimer?'0.8.0':sharing?'0.7.0':withLibrary?'0.5.0':'0.4.0',build:sleepTimer?'9':sharing?'8':withLibrary?'5':'4',bundleId:'it.ritvio.ios',systemVersion:'26.0',environment:'simulator',minimumOS:'15.0',bundledAssets:true,textScale:scale,safeArea:innerWidth>innerHeight?{top:0,right:20,bottom:0,left:20}:{top:20,right:0,bottom:20,left:0},capabilities:{resolver:true,playback:true,library:withLibrary,lyrics,sharing,sleepTimer}}),
   storyArtwork:async(input:any)=>{operations.push({method:'storyArtwork',...input});if((window as any).__iosStoryCoverFailure)throw fail('STORY_ARTWORK_UNAVAILABLE');return {dataUrl:storyCover};},
   cancelStoryArtwork:async(input:any)=>{operations.push({method:'cancelStoryArtwork',...input});return {cancelled:true};},
   exportStory:async(input:any)=>{operations.push({method:'exportStory',save:input.save,encodedLength:input.base64.length});(window as any).__iosStoryPNG=input.base64;if((window as any).__iosStoryDeferred)await new Promise<void>(resolve=>(window as any).__iosStoryComplete=resolve);if((window as any).__iosStoryDenied)throw fail('STORY_PHOTOS_DENIED');return {status:input.save?'saved':(window as any).__iosStoryCancelled?'cancelled':'shared'};},
   storyOpenSettings:async()=>{operations.push({method:'storyOpenSettings'});},
   snapshot:async()=>copy(state),
   sleepTimer:async()=>{if((window as any).__iosTimerReadFailure)throw fail('TIMER_UNAVAILABLE');return copy(timerState);},
   setSleepTimer:async(input:any)=>{operations.push({method:'setSleepTimer',...input});if((window as any).__iosTimerDeferred)await new Promise<void>(resolve=>(window as any).__iosTimerComplete=resolve);if((window as any).__iosTimerFailure)throw fail('TIMER_WRITE_FAILED');if(input.revision!==timerState.revision)throw fail('TIMER_CHANGED');return timerEmit({mode:input.mode,minutes:input.minutes??null,remaining:input.mode==='duration'?input.minutes*60:null,revision:timerState.revision+1,reason:input.mode==='off'?'cancelled':null});},
   languageRead:async()=>copy(language),languageWrite:async({preference}:any)=>{language={...language,preference,revision:language.revision+1};localStorage.setItem('__iosLanguage',preference);for(const listener of languages)listener(copy(language));return copy(language);},
   addListener:async(event:string,listener:(value:any)=>void)=>{const list=event==='sleepTimer'?timerListeners:event==='language'?languages:event==='library'?collections:listeners;list.add(listener);return {remove:async()=>{list.delete(listener);}};},
   search:async(input:any)=>{operations.push({method:'search',...input});await new Promise(resolve=>setTimeout(resolve,input.query==='slower'?600:30));if(input.query==='offline')throw fail('NETWORK_UNAVAILABLE');return {items:input.query==='empty'?[]:tracks,cached:false};},
   catalog:async(input:any)=>{
    operations.push({method:'catalog',...input});await new Promise(resolve=>setTimeout(resolve,input.query==='slower'?600:30));if(input.query==='offline')throw fail('NETWORK_UNAVAILABLE');if((window as any).__iosCatalogBusy)throw fail('BUSY');
    const person={id:'fixture-artist',name:'Luna Vale'},artwork=tracks[0].thumbnail,artist={...person,kind:'artist',artwork},album={id:'fixture-album',name:'Night scenes',kind:'album',artwork,artists:[person],year:'2025'};
    const custom=(window as any).__iosCatalogResult?.(input);if(custom)return copy(custom);
    if(input.operation==='search-snapshot')return {items:input.query==='empty'?[]:tracks,candidates:input.query==='empty'?[]:[artist],albums:input.query==='empty'?[]:[album],cached:false,truncated:false};
    if(input.operation==='releases')return {artistId:input.id,items:[album,...Array.from({length:8},(_,i)=>({...album,id:`fixture-album-${i}`,name:`Night scenes ${i+2}`}))],truncated:false};
    if(input.operation==='artist-search')return {artistId:input.id,kind:input.searchKind,items:input.searchKind==='track'?tracks:[album],truncated:false};
    if(input.kind==='artist')return {...artist,id:input.id,description:'',tracks,albums:[album],singles:[],moreAlbums:true,moreSingles:false};
    return {...album,id:input.id,description:'',entries:[{number:1,title:tracks[0].title,duration:90,track:tracks[0]},{number:2,title:'Unavailable interlude',duration:0,track:null},{number:3,title:tracks[1].title,duration:90,track:tracks[1]},{number:4,title:tracks[0].title,duration:90,track:tracks[0]}],reportedCount:4,incomplete:false};
   },cancelResolver:async(input:any)=>{operations.push({method:'cancel',...input});return {cancelled:true};},
   playTracks:async(input:any)=>{operations.push({method:'playTracks',...input});state={...state,items:input.items,index:input.index,order:input.items.map((_:any,i:number)=>i),queueRevision:state.queueRevision+1,playing:true,position:0};return emit();},
   enqueue:async(input:any)=>{operations.push({method:'enqueue',...input});const entry=state.items.length;state.items.push(input.track);state.order.splice(input.next?state.order.indexOf(state.index)+1:state.order.length,0,entry);state.queueRevision++;return emit();},
   command:async(input:any)=>{operations.push(input);const {type,value}=input;
    if(type==='move'){if(value.revision!==state.queueRevision)throw fail('QUEUE_CHANGED');const old=state.items.slice(),ids=old.map((_:any,i:number)=>i),order=state.order.slice(),destination=order.indexOf(value.to);order.splice(order.indexOf(value.from),1);order.splice(destination,0,value.from);ids.splice(value.to,0,ids.splice(value.from,1)[0]);state.items=ids.map((i:number)=>old[i]);state.index=ids.indexOf(state.index);state.order=order.map((i:number)=>ids.indexOf(i));state.queueRevision++;}
    else if(type==='seek')state.position=value;
    else if(type==='play'||type==='pause')state.playing=type==='play';
    else if(type==='next'||type==='previous'){const at=state.order.indexOf(state.index)+(type==='next'?1:-1);if(state.order[at]!==undefined)state.index=state.order[at];state.position=0;}
    else if(type==='jump'){state.index=value;state.position=0;state.playing=true;}
    else if(type==='clear'){state.items=[];state.order=[];state.playing=false;state.index=0;state.queueRevision++;}
    else if(type==='repeat'||type==='shuffle'){state[type]=value;state.queueRevision++;}
    else if(type==='remove'){const index=value.index;state.items.splice(index,1);state.order=state.order.filter((i:number)=>i!==index).map((i:number)=>i>index?i-1:i);if(state.index>index)state.index--;state.queueRevision++;}
    return emit();}
  }});
  if(withLibrary){
   const fallback={revision:0,likes:[],playlists:[],recent:[],follows:[]};
   let library:any=JSON.parse(localStorage.getItem('__iosLibrary')??JSON.stringify(librarySeed??fallback));
   const publish=()=>{localStorage.setItem('__iosLibrary',JSON.stringify(library));for(const listener of collections)listener(copy(library));return copy(library);};
   const store=(input:any)=>{
    if((window as any).__iosFailLibrary)throw fail('LIBRARY_WRITE_FAILED');
    const value=copy(library),p=value.playlists.find((item:any)=>item.id===input.id);
    if(['rename','delete','add','remove','move','cover'].includes(input.type)){if(!p)throw fail('PLAYLIST_MISSING');if(p.revision!==input.revision)throw fail('PLAYLIST_CHANGED');}
    if(input.type==='like'){value.likes=value.likes.filter((item:any)=>item.videoId!==input.track.videoId);if(input.liked)value.likes.unshift(input.track);}
    else if(input.type==='follow'){value.follows=value.follows.filter((item:any)=>item.kind!==input.resource.kind||item.id!==input.resource.id);if(input.followed)value.follows.unshift(input.resource);}
    else if(input.type==='create'||input.type==='createFromTracks'){value.playlists.unshift({id:crypto.randomUUID(),name:input.name.trim(),description:input.description??'',items:input.items??(input.track?[input.track]:[]),revision:1,updatedAt:Date.now(),cover:null});}
    else if(input.type==='rename'){p.name=input.name.trim();p.description=input.description;}
    else if(input.type==='delete')value.playlists=value.playlists.filter((item:any)=>item.id!==input.id);
    else if(input.type==='add')p.items.push(input.track);
    else if(input.type==='remove')p.items.splice(input.index,1);
    else if(input.type==='move')p.items.splice(input.to,0,p.items.splice(input.from,1)[0]);
    else if(input.type==='clearHistory')value.recent=[];
    else if(input.type==='cover')p.cover=input.cover;
    if(p&&input.type!=='delete'){p.revision++;p.updatedAt=Date.now();}value.revision++;library=value;return publish();
   };
   const api=(window as any).__ios;
   Object.assign(window,{__iosLibrary:()=>copy(library),__iosLibraryEmit:(value:any)=>{library=copy(value);return publish();}});
   Object.assign(api,{
    library:async()=>{if((window as any).__iosReadFailure)throw fail('LIBRARY_DAMAGED');return copy(library);},
    libraryCommand:async(input:any)=>{operations.push({method:'libraryCommand',...input});await new Promise(resolve=>setTimeout(resolve,40));return store(input);},
    saveQueue:async(input:any)=>{operations.push({method:'saveQueue',...input});if(state.queueRevision!==input.revision)throw fail('QUEUE_CHANGED');return store({type:'createFromTracks',name:input.name,items:state.order.map((index:number)=>state.items[index])});},
    navigationState:async(input:any)=>{operations.push({method:'navigationState',...input});},
    chooseArtwork:async(input:any)=>{operations.push({method:'chooseArtwork',...input});if((window as any).__iosArtworkSuccess)return {cancelled:false,library:store({type:'cover',...input,cover:tracks[3].thumbnail})};return {cancelled:true};},
    removeArtwork:async(input:any)=>{operations.push({method:'removeArtwork',...input});return store({type:'cover',...input,cover:null});}
   });
  }

 },{empty,scale,withLibrary,librarySeed,lyrics,sharing,sleepTimer,storyCover:`data:image/webp;base64,${cover.toString('base64')}`});
 await page.goto('/');await expect(page.getByRole('heading',{name:'Your listening',exact:true})).toBeVisible();
 return errors;
}
