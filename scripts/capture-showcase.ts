/** Render the real English UI with synthetic data. No live providers or user profile.
 * pnpm exec tsx scripts/capture-showcase.ts [desktop|mobile|all]
 * Captures are browser renders, not evidence of native-device execution.
 */
import path from 'node:path';
import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {createServer} from 'vite';
import {chromium,expect,type Page,type Route} from '@playwright/test';
import {fixture} from '../tests/helpers/mobile-fixture';
import {toneWav} from '../tests/fixtures';
import type {Track} from '../packages/domain';
import type {NativeTrack} from '../packages/domain/mobile';
import showcase from './showcase-files.json';

const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'test-results/showcase');
await mkdir(out,{recursive:true});
await rm(path.join(out,'capture.json'),{force:true});
const target=process.argv[2]??'all';
if(!['desktop','mobile','all'].includes(target))throw Error('Use desktop, mobile or all');
const names=['After the rain','Slow motion','Golden hour','Night signals','Another sky','Last light'];
const artists=['Luna Vale','North Avenue','June Atlas','Luna Vale','North Avenue','June Atlas'];
const ids=['abcdefghijk','12345678901','23456789012','34567890123','45678901234','56789012345'];
const tracks:Track[]=names.map((title,i)=>({id:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,videoId:ids[i],title,artist:artists[i],duration:242+i*8,thumbnail:`https://i.ytimg.com/vi/${ids[i]}/mqdefault.jpg`,canonicalUrl:`https://www.youtube.com/watch?v=${ids[i]}`,artists:[{id:'ARTIST1',name:artists[i]}],album:{id:'ALBUM1',name:'Violet hours'}}));
const playlistNames=['Night drive','Slow mornings','Deep focus','Golden hour','City lights','On repeat'];
const playlists=playlistNames.map((name,i)=>({id:`10000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,name,description:i?'A little space for your favourite sounds.':'Late streets, quiet thoughts and the way back home.',visibility:'private',cover:null,artwork:[tracks[i].thumbnail],count:12+i*4,durationSeconds:3200+i*500,updatedAt:'2026-10-18T12:00:00Z',revision:1}));
const library={profile:{id:'20000000-0000-4000-8000-000000000001',mode:'local',displayName:'My space',avatar:null},likes:tracks,playlists,follows:[],history:tracks.map((track,i)=>({id:`history-${i}`,track,playedAt:'2026-10-18T12:00:00Z'}))};
const coverFiles=['tests/fixtures/artwork/city.webp','tests/fixtures/artwork/sky.webp','tests/fixtures/artwork/sunset.webp','apps/client/public/artwork/electronic.webp'];
const coverBytes=await Promise.all(coverFiles.map(file=>readFile(path.join(root,file))));
const verses=['The city settles into blue','A quiet road, a brighter view','We leave the hurried hours behind','And find a little room for time','The rain is gone, the lights remain','A thousand windows glow again'];
const now='2026-10-18T12:00:00Z';
const pageErrors=new WeakMap<Page,string[]>();
const captured=new Set<string>();
const cache={hit:true,degraded:false,fetchedAt:now,expiresAt:'2030-01-01T00:00:00Z'};
const homeCollections=[{id:'global',playlistId:'DEMO_GLOBAL',country:'ZZ',sourceTitle:'Demo catalogue',artwork:tracks[2].thumbnail,albums:[]},{id:'releases',playlistId:null,country:null,sourceTitle:'Demo catalogue',artwork:tracks[1].thumbnail,albums:[]}];
const result=(data:unknown)=>({data,updatedAt:now,edition:'2026-10-16',refreshing:false,stale:false,error:null,retryAt:null});
async function artwork(route:Route){
 const url=route.request().url(),index=ids.findIndex(id=>url.includes(id));
 await route.fulfill({contentType:'image/webp',headers:{'access-control-allow-origin':'*'},body:coverBytes[(index<0?0:index)%coverBytes.length]});
}
async function settle(page:Page){
 await expect(page.locator('html')).toHaveAttribute('lang','en');
 await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(Array.from(document.images).filter(img=>{const r=img.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0;}).map(img=>img.decode()));});
 await page.evaluate(async()=>{await Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
}
async function capture(page:Page,name:string){
 await settle(page);
 if(pageErrors.get(page)?.length)throw Error(`UI runtime error in ${name}: ${pageErrors.get(page)!.join('; ')}`);
 const body=await page.locator('body').innerText();
 if(/service is not responding|collection is currently unavailable|La tua|Il tuo|Nuove uscite|Cerca musica|Brano precedente/.test(body))throw Error(`Unloaded or non-English showcase: ${name}`);
 await page.screenshot({path:path.join(out,`${name}.png`),animations:'disabled'});
 captured.add(name);
 console.log(`Captured ${name}`);
}

const browser=await chromium.launch({channel:'msedge',headless:true});
let server:Awaited<ReturnType<typeof createServer>>|undefined;
let currentPage:Page|undefined;
try{
 if(target==='desktop'||target==='all'){
  server=await createServer({configFile:path.join(root,'vite.config.ts'),logLevel:'error'});await server.listen();
  const context=await browser.newContext({viewport:{width:1600,height:1000},locale:'en-GB',colorScheme:'dark',reducedMotion:'reduce'}),page=await context.newPage();
  await context.addInitScript('globalThis.__name = (fn) => fn;');
  currentPage=page;pageErrors.set(page,[]);page.on('pageerror',error=>{pageErrors.get(page)!.push(error.message);console.error('SHOWCASE_PAGE_ERROR',error.message);});
  await page.addInitScript(({tracks})=>{
   localStorage.setItem('ritvio.language.v1',JSON.stringify({schema:1,preference:'en'}));
   window.__RITVIO_TEST_CONFIG__={baseUrl:'http://127.0.0.1:5173',token:'synthetic-showcase-only'};
   localStorage.setItem('ritvio-player-v1',JSON.stringify({version:1,state:{queue:tracks.map((track,i)=>({...track,queueId:`demo-${i}`,source:'collection'})),index:0,position:84,duration:242,playing:false,volume:.65,muted:false,shuffle:false,repeat:'off',theme:'dark',recent:tracks.slice(1,5),uiLayout:{sidebarWidth:250,panelWidth:340,sidebarCollapsed:false,motion:'reduced'}}}));
  },{tracks});
  await page.route('https://i.ytimg.com/**',artwork);
  await page.route('**/v1/**',async route=>{
   const url=new URL(route.request().url()),p=url.pathname.replace('/v1','');
   let data:unknown={ok:true};
   if(p==='/runtime')data={catalogProvider:'youtube-music',playbackProvider:'youtube',resolverInstalled:true};
   else if(p==='/home')data=result({collections:homeCollections,missing:[]});
   else if(p.startsWith('/home/'))data=result({collection:homeCollections.find(c=>p.endsWith(c.id))??homeCollections[0],tracks,albums:[],partial:false});
   else if(p==='/me/library')data=library;
   else if(p==='/me/taste')data={privateMode:false,settings:{days:90,genreLevel:'artist',discoveryPercent:50,allowRecent:false,variety:true,resetAt:0},profile:{sessions:18,listenedMs:3324000,personalized:true,artists:artists.slice(0,3).map((name,i)=>({id:`artist-${i}`,name,match:'name',score:12-i*3})),genres:[{name:'Electronic',score:12},{name:'Ambient',score:8},{name:'Indie',score:4}],unclassifiedPercent:0,trackScores:{}},candidateCount:24,discoveredAt:Date.now(),feedback:[]};
   else if(p==='/me/listening')data={settings:{privateMode:false,retentionDays:180,epoch:1},items:tracks.map((track,i)=>({id:track.id,mediaId:track.id,epoch:1,sequence:1,startedAt:Date.parse(now)-i*300000,updatedAt:Date.parse(now)-i*300000+180000,listenedMs:180000,durationMs:track.duration*1000,seeks:0,closed:true,reason:'completed',track,excluded:false,replay:false,tasteWeight:1})),summary:{sessions:18,listenedMs:3324000,completed:14,skips:4,replays:2,errors:0,interrupted:0,excluded:0},legacyStarts:0};
   else if(p==='/me/taste/mix'){const kind=route.request().postDataJSON()?.kind??'familiar';data={kind,items:tracks.slice(kind==='discovery'?2:0,kind==='discovery'?6:4).map(track=>({track,reason:'listened',detail:null,feedback:0,fresh:false})),requested:20,discoveryCount:0,generatedAt:Date.now(),cached:true};}
   else if(p==='/situations')data=result(['focus','travel','energy','relax','workout','party'].map(id=>({id,params:`demo_${id}`,sourceTitle:'Demo catalogue'})));
   else if(p.startsWith('/me/playlists/')){const list=playlists.find(item=>p.includes(item.id))??playlists[0];data={...list,count:tracks.length,items:tracks.map((track,i)=>({id:`item-${i}`,track}))};}
   else if(p.startsWith('/me/lyrics/'))data={status:'ready',document:{provider:'local',providerId:null,title:tracks[0].title,artist:tracks[0].artist,fileName:'after-the-rain.lrc',instrumental:false,fetchedAt:now,licenseVerified:null,plainText:verses.join('\n'),offsetMs:0,lines:verses.map((text,i)=>({at:i*28,text}))},cacheHit:true,savedChoice:true};
   else if(p==='/search')data={items:tracks,cache,nextCursor:null,truncated:false};
   else if(p.startsWith('/media/')&&p.endsWith('/playback'))data={mode:'youtube-audio-resolver',provider:'youtube',accessMethod:'unofficial-extraction',videoId:tracks[0].videoId,url:'/v1/stream/'+('a'.repeat(64)),expiresAt:'2030-01-01T00:00:00Z',capabilities:{background:true,seek:true,volume:true,equalizer:true,offline:false}};
   else if(p.startsWith('/media/'))data=tracks.find(track=>p.includes(track.id))??tracks[0];
   else if(p.startsWith('/stream/'))return route.fulfill({contentType:'audio/wav',body:toneWav(12)});
   return route.fulfill({json:data});
  });
  await page.goto('http://127.0.0.1:5173/');
  await expect(page.locator('.home2-feature img')).toHaveCount(2,{timeout:45000});
  await capture(page,'desktop-home');
  await page.setViewportSize({width:1400,height:1120});
  await page.getByRole('button',{name:'Your library',exact:true}).click();await expect(page.locator('.playlist-card')).toHaveCount(6);await capture(page,'desktop-library');
  const labels=await page.locator('.playerbar button').evaluateAll(buttons=>buttons.map(button=>button.getAttribute('aria-label')).filter(Boolean));
  const lyricLabel=labels.find(label=>/lyrics/i.test(label!));
  if(!lyricLabel)throw Error(`No lyrics control: ${labels.join(', ')}`);
  await page.setViewportSize({width:1600,height:1000});
  await page.getByRole('button',{name:lyricLabel,exact:true}).click();await expect(page.locator('#lyrics-reader')).toBeVisible();await capture(page,'desktop-lyrics');
  await page.getByRole('button',{name:'Immersive view',exact:true}).click();await expect(page.locator('.immersive .lyric-line').first()).toBeVisible();await capture(page,'desktop-immersive');
  await page.getByRole('button',{name:'Close immersive view',exact:true}).click();
  for(const [button,name,selector] of [['Listening activity','desktop-activity','.listening-activity'],['Your taste','desktop-taste','.taste-page'],['History','desktop-history','.history-entry']] as const){
   await page.getByRole('button',{name:'Your library',exact:true}).click();await page.getByRole('tab',{name:button,exact:true}).click();
   await expect(page.locator(selector).first()).toBeVisible();await capture(page,name);
  }
  const mini=await context.newPage();await mini.setViewportSize({width:480,height:260});
  currentPage=mini;
  pageErrors.set(mini,[]);mini.on('pageerror',error=>pageErrors.get(mini)!.push(error.message));
  await mini.addInitScript(({track})=>{(window as any).ritvio={readMini:async()=>({title:track.title,artist:track.artist,videoId:track.videoId,position:84,duration:242,volume:.65,muted:false,playing:false,loading:false,canNext:true,canPrevious:true,error:null,theme:'dark',motion:'reduced',pinned:false}),onMiniState:()=>()=>{},miniCommand:async()=>{}};},{track:tracks[0]});
  await mini.route('https://i.ytimg.com/**',artwork);await mini.goto('http://127.0.0.1:5173/?mini=1');await expect(mini.locator('.mini-player')).toBeVisible();await expect(mini.getByRole('alert')).toHaveCount(0);await capture(mini,'desktop-mini');await mini.close();
  await context.close();await server.close();server=undefined;
 }
 if(target==='mobile'||target==='all'){
  server=await createServer({configFile:path.join(root,'apps/mobile/vite.config.ts'),logLevel:'error'});await server.listen();
  const context=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:1,isMobile:true,hasTouch:true,locale:'en-GB',colorScheme:'dark',reducedMotion:'reduce',baseURL:'http://127.0.0.1:5174'});
  // tsx/esbuild may name nested functions in the serialised fixture with __name.
  // Install that harmless helper before page-level fixture scripts execute.
  await context.addInitScript('globalThis.__name = (fn) => fn;');
  const page=await context.newPage();
  currentPage=page;pageErrors.set(page,[]);page.on('pageerror',error=>pageErrors.get(page)!.push(error.message));
  const mobileTracks:NativeTrack[]=tracks.slice(0,4).map(({id,canonicalUrl,...track})=>track);
  await page.addInitScript(({tracks})=>{
   localStorage.setItem('__testLibrary',JSON.stringify({likes:tracks,playlists:[{id:'p1',name:'Night drive',items:[tracks[0],tracks[1]],updatedAt:1792324800000},{id:'p2',name:'Slow mornings',items:[tracks[2],tracks[3]],updatedAt:1792324800000},{id:'p3',name:'Deep focus',items:[tracks[1],tracks[3]],updatedAt:1792324800000},{id:'p4',name:'On repeat',items:tracks,updatedAt:1792324800000}],recent:tracks,follows:[]}));
  },{tracks:mobileTracks});
  await fixture(page,{language:'en',queueLength:4,sampleTracks:mobileTracks,artworkFiles:coverFiles});
  const portrait=await readFile(path.join(root,'apps/client/public/artwork/pop.webp'));
  await page.route('https://lh3.googleusercontent.com/**',route=>route.fulfill({contentType:'image/webp',body:portrait}));
  await capture(page,'mobile-home');
  await page.evaluate(({tracks})=>{(window as any).__mobileNative.search=async()=>({items:tracks,cached:true});},{tracks:mobileTracks});
  await page.getByRole('navigation').getByRole('button',{name:'Search',exact:true}).click();await page.getByRole('searchbox').fill('Luna Vale');
  await expect(page.locator('.track-row:visible').first()).toBeVisible();await capture(page,'mobile-search');
  await page.getByRole('navigation').getByRole('button',{name:'Library',exact:true}).click();await expect(page.getByRole('heading',{name:'Your library',exact:true})).toBeVisible();await capture(page,'mobile-library');
  await page.getByRole('button',{name:/Open player:/}).click();await expect(page.getByRole('dialog',{name:'Now playing',exact:true})).toBeVisible();await capture(page,'mobile-player');
  await page.evaluate(({verses})=>{(window as any).__mobileNative.lyrics=async()=>({plainLyrics:verses.join('\n'),syncedLyrics:verses.map((text:string,i:number)=>`[${String(Math.floor(i*28/60)).padStart(2,'0')}:${String(i*28%60).padStart(2,'0')}.00]${text}`).join('\n'),instrumental:false});},{verses});
  await page.getByRole('button',{name:'Lyrics',exact:true}).click();await expect(page.getByRole('dialog',{name:'Lyrics',exact:true}).getByText(verses[0],{exact:true})).toBeVisible();await capture(page,'mobile-lyrics');
  await page.getByRole('button',{name:'Close Lyrics',exact:true}).click();
  await page.getByRole('button',{name:'Share',exact:true}).click();
  const share=page.getByRole('dialog',{name:'Share track',exact:true}),canvas=share.locator('canvas');await expect(canvas).toHaveAttribute('width','1080',{timeout:45000});await capture(page,'mobile-share-track');
  const exportCard=async(name:string)=>{await expect(share.getByRole('button',{name:'Save image',exact:true})).toBeEnabled();const data=await canvas.evaluate((element:HTMLCanvasElement)=>element.toDataURL('image/png').split(',')[1]);await writeFile(path.join(out,`${name}.png`),Buffer.from(data,'base64'));captured.add(name);console.log(`Exported ${name}`);};
  await exportCard('share-card-track');await share.getByRole('button',{name:'Lyrics',exact:true}).click();
  await share.getByRole('button',{name:/^Line 1:/}).click();await share.getByRole('button',{name:/^Line 4:/}).click();await capture(page,'mobile-share-selection');
  await canvas.scrollIntoViewIfNeeded();await exportCard('share-card-lyrics');await capture(page,'mobile-share-lyrics');
  const go=async(route:string)=>{await page.evaluate(route=>{history.pushState(null,'',route?`#${route}`:location.pathname);dispatchEvent(new PopStateEvent('popstate'));},route);};
  await page.evaluate(()=>{const w=window as any,audio={available:true,enabled:true,bands:[60,230,910,3600,14000].map((frequency,index)=>({index,frequency,level:[3,1,-1,1,2][index]})),min:-15,max:15,sleepAtEnd:false,sleepUntil:Date.now()+30*60000};w.__mobileNative.audio=async()=>audio;w.__mobileState().discovery.enabled=true;w.__mobileUpdate();});
  for(const [route,name,label] of [['player/queue','mobile-queue','Queue'],['player/audio','mobile-audio','Audio'],['player/timer','mobile-timer','Sleep timer']] as const){await go(route);const panel=page.getByRole('dialog',{name:label,exact:true});await expect(panel).toBeVisible();if(label==='Audio')await expect(panel.locator('.audio-panel')).toBeVisible();if(label==='Sleep timer')await expect(panel.getByRole('button',{name:'30 minutes',exact:true})).toBeVisible();await capture(page,name);}
  await go('likes');await expect(page.getByRole('heading',{name:'Liked tracks',exact:true})).toBeVisible();await capture(page,'mobile-favourites');
  await go('playlist/p1');await expect(page.getByRole('heading',{name:'Night drive',exact:true})).toBeVisible();await capture(page,'mobile-playlist');
  await page.getByRole('button',{name:'Options: After the rain',exact:true}).click();await expect(page.getByRole('dialog',{name:'Track options',exact:true})).toBeVisible();await capture(page,'mobile-playlist-actions');
  await page.getByRole('button',{name:'Track radio',exact:true}).click();await expect(page.getByRole('dialog',{name:'Track radio',exact:true})).toBeVisible();await capture(page,'mobile-radio');
  await go('playlist/p1');await page.getByRole('button',{name:'Export playlist',exact:true}).click();await expect(page.getByRole('dialog',{name:'Export playlist',exact:true})).toBeVisible();await capture(page,'mobile-export');
  await go('');await page.getByRole('navigation').getByRole('button',{name:'Library',exact:true}).click();
  await page.evaluate(({tracks})=>{(window as any).__mobileNative.previewPlaylist=async({requestId}:any)=>({requestId,title:'Night drive',description:'A playlist of your own.',cover:null,provider:'youtube-music',reportedCount:tracks.length,partial:false,truncated:false,expiresAt:Date.now()+600000,entries:tracks.map((track:any,index:number)=>({number:index+1,title:track.title,track}))});},{tracks:mobileTracks});
  await page.getByRole('button',{name:'Import playlist',exact:true}).click();await page.getByLabel('Playlist link',{exact:true}).fill('https://music.youtube.com/playlist?list=PLRITVIODemoPlaylist1234567890');await page.getByRole('button',{name:'Show preview',exact:true}).click();await expect(page.getByRole('textbox',{name:'Playlist name',exact:true})).toHaveValue('Night drive');await capture(page,'mobile-import');
  await go('player');await page.getByRole('button',{name:'Open album: Violet hours',exact:true}).click();await expect(page.getByRole('heading',{name:'Violet hours',exact:true})).toBeVisible();await capture(page,'mobile-album');
  await go('player');await page.locator('.artist-link').click();await expect(page.getByRole('heading',{name:'Luna Vale',exact:true})).toBeVisible();await capture(page,'mobile-artist');
  await go('');await page.getByRole('navigation').getByRole('button',{name:'Home',exact:true}).click();await page.getByRole('button',{name:'Settings',exact:true}).click();await expect(page.getByRole('combobox',{name:'Language',exact:true})).toHaveValue('en');await capture(page,'mobile-settings');
  await context.close();await server.close();server=undefined;
 }
 const expected=showcase.views.filter(view=>target==='all'||(target==='desktop'?view.group==='Desktop':view.group!=='Desktop'));
 const missing=expected.filter(view=>!captured.has(view.name));if(missing.length)throw Error(`Missing capture views: ${missing.map(view=>view.name).join(', ')}`);
 await writeFile(path.join(out,'capture.json'),JSON.stringify({language:'en',views:[...captured],source:'Real React interfaces rendered in Microsoft Edge with deterministic synthetic fixtures. Not native device captures.',generatedAt:new Date().toISOString(),privateProfileAccessed:false},null,2)+'\n');
}catch(error){if(currentPage&&!currentPage.isClosed())await writeFile(path.join(out,'debug.txt'),await currentPage.locator('body').innerText());throw error;}finally{await server?.close();await browser.close();}
