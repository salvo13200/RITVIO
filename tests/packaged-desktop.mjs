import {runNativeQuality} from './packaged-quality.mjs';
import {chromium,expect} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,appendFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import path from 'node:path';
import net from 'node:net';
import {runNativeSoak} from './packaged-performance.mjs';
import {createNativeResourceProbe} from './native-resource-probe.mjs';
import {runNativeLatency} from './packaged-latency.mjs';
import {runNativeRequestStress} from './packaged-request-stress.mjs';
import {runNativeRadio} from './packaged-radio.mjs';
import {runNativeAutoplay} from './packaged-autoplay.mjs';
import {runNativeLibraryRestyle} from './packaged-library-restyle.mjs';
import {runNativeStorySharing} from './packaged-story-sharing.mjs';
import {runNativeStoryAudio} from './packaged-story-audio.mjs';
import {runNativeHome} from './packaged-home.mjs';
const root=process.cwd();
const performanceOnly=process.argv.includes('--performance');
const soakSecondsIndex=process.argv.indexOf('--soak-seconds');
const soakSeconds=soakSecondsIndex<0?60:Number(process.argv[soakSecondsIndex+1]);
if(soakSecondsIndex>=0&&(!performanceOnly||!process.argv.includes('--soak')||!Number.isInteger(soakSeconds)||soakSeconds<60||soakSeconds>7200))throw Error('--soak-seconds requires --performance --soak and an integer from 60 to 7200');
if(process.argv.includes('--resource-samples')&&(!performanceOnly||!process.argv.includes('--soak')))throw Error('--resource-samples requires --performance --soak');
const latencyOnly=process.argv.includes('--latency');
const requestStressOnly=process.argv.includes('--request-stress');
const radioOnly=process.argv.includes('--radio');
const autoplayOnly=process.argv.includes('--autoplay');
const libraryRestyleOnly=process.argv.includes('--library-restyle');
const storySharingOnly=process.argv.includes('--story-sharing');
const storyAudioOnly=process.argv.includes('--story-audio');
const qualityOnly=process.argv.includes('--quality');
const homeOnly=process.argv.includes('--home');
const performanceVersion=process.argv[process.argv.indexOf('--exe-version')+1];
const version=(performanceOnly||latencyOnly||requestStressOnly)&&process.argv.includes('--exe-version')?performanceVersion:JSON.parse(await readFile('package.json','utf8')).version;
if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('Versione EXE non valida');
const searchLayoutOnly=process.argv.includes('--search-layout');
const librarySharingOnly=process.argv.includes('--library-sharing');
const catalogOnly=process.argv.includes('--catalog');
const playerControlsOnly=process.argv.includes('--player-controls');
const listeningPreferencesOnly=process.argv.includes('--listening-preferences');
const lyricsControlsOnly=process.argv.includes('--lyrics-controls');
const readabilityOnly=process.argv.includes('--readability');
const accessibilityOnly=process.argv.includes('--accessibility')||performanceOnly;
const motionOnly=process.argv.includes('--motion-controls')||accessibilityOnly;
const unpackedIndex=process.argv.indexOf('--unpacked-exe');
const unpacked=unpackedIndex>=0?path.resolve(process.argv[unpackedIndex+1]??''):null;
if(unpacked&&(!unpacked.startsWith(path.join(root,'.packaging')+path.sep)||path.basename(unpacked)!=='RITVIO.exe'))throw Error('EXE di prova non appartenente allo staging del workspace');
const exe=unpacked??path.join(root,'release',`RITVIO-${version}-portatile.exe`);
const profile=path.join(root,'.packaging',`test-profile-${Date.now()}`);
const working=path.join(profile,'empty-working-directory');
await mkdir(working,{recursive:true});
const temporary=path.join(profile,'portable-temp');await mkdir(temporary,{recursive:true});
// Seed the real v0.2 cache and player-state formats to verify the additive upgrade.
await mkdir(path.join(profile,'cache'),{recursive:true});
const legacyDb=new DatabaseSync(path.join(profile,'cache/mvp.sqlite'));
legacyDb.exec('CREATE TABLE tracks(id TEXT PRIMARY KEY,data TEXT NOT NULL,expires INTEGER NOT NULL);CREATE TABLE search_cache(key TEXT PRIMARY KEY,data TEXT NOT NULL,fetched INTEGER NOT NULL,expires INTEGER NOT NULL);');
const hash=createHash('sha256').update('youtube:jNQXAC9IVRw').digest('hex');
const legacyTrack={id:`${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`,videoId:'jNQXAC9IVRw',title:'Me at the zoo',artist:'jawed',duration:19,thumbnail:'https://i.ytimg.com/vi/jNQXAC9IVRw/mqdefault.jpg',canonicalUrl:'https://www.youtube.com/watch?v=jNQXAC9IVRw'};
if(readabilityOnly||motionOnly){legacyTrack.title='Titolo personale di prova molto lungo — versione dal vivo con ospiti e finale esteso';legacyTrack.artist='Artista dimostrativo e collettivo delle città sospese';}
if(motionOnly){legacyTrack.album={id:'MPREb_native_motion',name:'Album dimostrativo'};legacyTrack.artists=[{id:'UC_native_motion',name:legacyTrack.artist}];}
legacyDb.prepare('INSERT INTO tracks VALUES(?,?,?)').run(legacyTrack.id,JSON.stringify(legacyTrack),Date.now()+86400000);
let latencyNext;
if(latencyOnly||storyAudioOnly||qualityOnly){const idHash=createHash('sha256').update('youtube:aqz-KE-bpKQ').digest('hex');latencyNext={...legacyTrack,id:`${idHash.slice(0,8)}-${idHash.slice(8,12)}-5${idHash.slice(13,16)}-a${idHash.slice(17,20)}-${idHash.slice(20,32)}`,videoId:'aqz-KE-bpKQ',title:'Big Buck Bunny',artist:'Blender',duration:596,thumbnail:'https://i.ytimg.com/vi/aqz-KE-bpKQ/mqdefault.jpg',canonicalUrl:'https://www.youtube.com/watch?v=aqz-KE-bpKQ',queueId:'latency-next'};legacyDb.prepare('INSERT INTO tracks VALUES(?,?,?)').run(latencyNext.id,JSON.stringify(latencyNext),Date.now()+86400000);}
legacyDb.close();
// A long first video prevents natural end-of-track during the sharing workflow.
if((storyAudioOnly||latencyOnly)&&latencyNext){const short={...legacyTrack};Object.assign(legacyTrack,latencyNext);latencyNext={...short,queueId:'latency-next'};}
await writeFile(path.join(profile,'player-state.json'),JSON.stringify({version:1,state:{queue:performanceOnly?Array.from({length:500},(_,i)=>({...legacyTrack,queueId:'native-perf-'+i})):[{...legacyTrack,queueId:'legacy-queue-item'},...latencyNext?[latencyNext]:[]],index:0,recent:[legacyTrack],position:latencyOnly&&!process.argv.includes('--restore-eight')?0:8,volume:0.7,muted:false,shuffle:false,repeat:'off',theme:'dark'}}));
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!(/^(PYTHON|YOUTUBE_|RITVIO_|ELECTRON_|NODE_)/i.test(key))));
env.PATH=path.join(process.env.SystemRoot,'System32');
env.TEMP=temporary;env.TMP=temporary;
env.RITVIO_TEST_HIDDEN='true';env.RITVIO_TEST_USER_DATA=profile;
env.RITVIO_TEST_FILE_DIR=path.join(profile,'exports');
let child,browser,page;
let launchStarted;
async function capture(filename){
  // Do not force-disable animations when capturing a hidden Electron window:
  // CDP can stall its frame. Wait for finite motion to settle and capture normally.
  await expect.poll(()=>page.evaluate(()=>document.getAnimations().filter(animation=>animation.playState==='running'&&animation.effect?.getComputedTiming().iterations!==Infinity).length),{timeout:5000}).toBe(0);
  const options={path:path.join(profile,filename),timeout:5000};
  try{await page.screenshot(options);}
  catch(error){
    if(error.name!=='TimeoutError')throw error;
    // On this Windows hidden-window setup the first capture can time out,
    // while a subsequent capture succeeds. Retry once with a bounded timeout.
    console.log(`Ripeto la cattura della finestra nascosta: ${filename}`);
    await page.screenshot({...options,timeout:10000});
  }
}
async function bounded(task,ms=5000){let timer;try{return await Promise.race([task,new Promise(resolve=>{timer=setTimeout(resolve,ms);})]);}finally{clearTimeout(timer);}}
async function launch(){
  launchStarted=performance.now();
  const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;await new Promise(resolve=>server.close(resolve));
  // Normalize Windows display scaling only for the emulated narrow-layout check.
  child=spawn(exe,searchLayoutOnly||readabilityOnly||motionOnly?['--force-device-scale-factor=1']:[],{cwd:working,env:{...env,RITVIO_TEST_CDP_PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','pipe']});
  for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{void appendFile(path.join(profile,'native-process.log'),data).catch(()=>{});});
  child.on('error',error=>console.error(error.message));
  await expect.poll(async()=>{
    if(child.exitCode!==null)throw Error(`Il launcher si è chiuso con codice ${child.exitCode}`);
    try{return(await fetch(`http://127.0.0.1:${port}/json/version`,{signal:AbortSignal.timeout(1000)})).ok;}catch{return false;}
  },{timeout:90000,intervals:[500,1000,2000]}).toBe(true);
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  await expect.poll(()=>browser.contexts()[0]?.pages().length??0,{timeout:30000}).toBeGreaterThan(0);
  const page=browser.contexts()[0].pages()[0];page.on('crash',()=>console.error('Packaged renderer crashed'));await page.waitForLoadState('domcontentloaded');return page;
}
async function close(){
  if(browser){const session=await browser.newBrowserCDPSession();await bounded(session.send('Browser.close').catch(()=>{}));await bounded(browser.close().catch(()=>{}));browser=undefined;}
  if(child){await expect.poll(()=>child.exitCode,{timeout:30000}).not.toBe(null);child=undefined;}
}
async function verifySearchLayout(){
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.getByRole('button',{name:'Cerca',exact:true}).click();
  const panel=page.locator('#listening-panel');
  if(await panel.getAttribute('aria-hidden')==='false')await panel.getByRole('button',{name:'Nascondi pannello',exact:true}).click();
  await expect(panel).toHaveAttribute('aria-hidden','true');
  const suggestions=page.locator('.search-starts');
  await expect(suggestions.getByRole('button')).toHaveCount(4);
  const widths=[1440,1060,640,390,320];
  for(const width of widths){
    await page.setViewportSize({width,height:940});
    await page.evaluate(()=>document.fonts.ready);
    await expect(suggestions.getByRole('button',{name:'Elettronica',exact:true})).toBeInViewport();
    const contained=await suggestions.evaluate(group=>{
      const bounds=group.getBoundingClientRect();
      return document.documentElement.scrollWidth<=innerWidth&&Array.from(group.querySelectorAll('button')).every(button=>{
        const rect=button.getBoundingClientRect(),icon=button.querySelector('svg').getBoundingClientRect();
        return rect.left>=bounds.left-1&&rect.right<=bounds.right+1&&rect.top>=bounds.top-1&&rect.bottom<=bounds.bottom+1&&rect.left>=0&&rect.right<=innerWidth&&button.scrollWidth<=button.clientWidth+1&&icon.left>=rect.left&&icon.right<=rect.right+1;
      });
    });
    expect(contained,`Generi contenuti nella ricerca dell'EXE a ${width}px`).toBe(true);
    if(width===1440||width===390){
      console.log(JSON.stringify(await page.evaluate(()=>({viewportWidth:innerWidth,pixelRatio:devicePixelRatio}))));
      await capture(`portable-search-${width}.png`);
    }
  }
  await suggestions.getByRole('button',{name:'Elettronica',exact:true}).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox',{name:'Cerca musica'})).toHaveValue('electronic music');
  console.log(JSON.stringify({portableExe:exe,cleanPath:env.PATH,embeddedResolvers:true,legacyUpgrade:true,searchLayoutWidths:widths,genreKeyboardActivation:true,profile,screenshots:['portable-search-1440.png','portable-search-390.png']}));
}
try {
  page=await launch();console.log('EXE avviato con PATH pulito.');
  await expect(page.getByRole('heading',{name:'La tua musica'})).toBeVisible();
  await expect(page.locator('.player-track strong')).toHaveText(legacyTrack.title);
  const startupToVisibleMs=performance.now()-launchStarted;
  await expect(page.getByRole('button',{name:'Riproduci',exact:true})).toBeVisible();
  await expect.poll(async()=>Number(await page.getByRole('slider',{name:'Posizione del brano'}).inputValue())).toBeGreaterThanOrEqual(latencyOnly&&!process.argv.includes('--restore-eight')?0:8);
  console.log('Aggiornamento dal formato 0.2 senza perdere coda o posizione.');
  const runtime=await page.evaluate(async()=>{const config=await window.ritvio.configuration();return(await fetch(`${config.baseUrl}/v1/runtime`,{headers:{Authorization:`Bearer ${config.token}`}})).json();});
  expect(runtime.resolverInstalled).toBe(true);
  console.log('Resolver inclusi disponibili.');
  if(qualityOnly){await runNativeQuality({page,version,profile,mediaId:legacyTrack.id,capture});}
  else if(storyAudioOnly){await runNativeStoryAudio({page,version,profile,mediaId:legacyTrack.id,initialTitle:legacyTrack.title,nextTitle:latencyNext.title});if(storySharingOnly)await runNativeStorySharing({page,version,profile,capture,mediaId:latencyNext.id});if(homeOnly)await runNativeHome({page,version,profile,capture});}
  else if(homeOnly){await runNativeHome({page,version,profile,capture});}
  else if(storySharingOnly){await runNativeStorySharing({page,version,profile,capture,mediaId:legacyTrack.id});}
  else if(libraryRestyleOnly){await runNativeLibraryRestyle({page,version,profile,capture});}
  else if(autoplayOnly){await runNativeAutoplay({page,version,profile,capture});}
  else if(radioOnly){await runNativeRadio({page,version,profile,capture});}
  else if(requestStressOnly){await runNativeRequestStress({page,version,profile,mediaId:legacyTrack.id,expectLocalLimit:process.argv.includes('--expect-local-limit')});}
  else if(latencyOnly){await runNativeLatency({page,version,profile,nextTitle:latencyNext.title,initialPosition:process.argv.includes('--restore-eight')?8:0});}
  else if(performanceOnly){
    const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
    const samples=[];
    for(let pass=0;pass<3;pass++){
      let started=performance.now();await page.locator('#queue-panel-trigger').click();await expect(page.locator('.queue-body')).toHaveAttribute('data-total-count','500');await expect(page.locator('.queue-row')).toHaveCount(61);samples.push({page:'queue',ms:performance.now()-started});
      started=performance.now();await page.getByRole('button',{name:'Impostazioni',exact:true}).click();await expect(page.locator('.preferences-page')).toBeVisible();samples.push({page:'preferences',ms:performance.now()-started});
      await page.getByRole('button',{name:'Torna alla musica'}).click();await page.locator('#now-panel-trigger').click();
    }
    const metrics=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.filter(m=>['JSHeapUsedSize','JSHeapTotalSize','Nodes','TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration'].includes(m.name)).map(m=>[m.name,m.value]));
    let retainedMetrics;
    if(process.argv.includes('--retained-heap')){await cdp.send('HeapProfiler.collectGarbage');retainedMetrics=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.filter(m=>['JSHeapUsedSize','JSHeapTotalSize','Nodes'].includes(m.name)).map(m=>[m.name,m.value]));}
    const resources=await page.evaluate(()=>performance.getEntriesByType('resource').filter(entry=>entry.name.includes('/assets/')&&entry.name.endsWith('.js')).map(entry=>({url:entry.name,bytes:entry.decodedBodySize,duration:entry.duration})));
    const newResourceProbe=async()=>{
      const rendererCdp=await page.context().newCDPSession(page);await rendererCdp.send('Performance.enable');
      return createNativeResourceProbe({cdp:rendererCdp,browserCdp:await browser.newBrowserCDPSession(),rootPid:child.pid});
    };
    const resourceProbe=process.argv.includes('--resource-samples')?await newResourceProbe():undefined;
    const soak=process.argv.includes('--soak')?await runNativeSoak({page,close,launch:async()=>{page=await launch();return page;},profile,seconds:soakSeconds,resourceProbe,restartResourceProbe:resourceProbe?newResourceProbe:undefined,retainedHeap:process.argv.includes('--retained-heap')}):undefined;
    const frameTimes=await page.evaluate(()=>new Promise(resolve=>{const samples=[];let last;const fallback=setTimeout(()=>resolve({count:samples.length,unavailable:'Hidden window did not deliver 90 frames within 8 seconds; cannot infer visible FPS'}),8000);const tick=now=>{if(last!==undefined)samples.push(now-last);last=now;if(samples.length<90)requestAnimationFrame(tick);else{clearTimeout(fallback);samples.sort((a,b)=>a-b);resolve({count:samples.length,medianMs:samples[45],p95Ms:samples[85],maxMs:samples.at(-1),scope:'Hidden-window rAF intervals while idle; not motion FPS or an interactive animation benchmark'});}};requestAnimationFrame(tick);}));
    const record={version,frameTimes,scope:'packaged-performance',conditions:'One isolated hidden Windows portable launch, clean PATH; startup includes launcher extraction, no startup-speed or FPS guarantee; 3 warm UI transitions per page, 500 stored queue items, 61 initially rendered with load-more; CDP renderer metrics before soak, not whole-process RAM; retainedMetrics only when explicit GC requested',startupToVisibleMs,samples,metrics,retainedMetrics,resources,profile,soak};
    await mkdir(path.join(root,'test-results/native'),{recursive:true});await writeFile(path.join(root,`test-results/native/NATIVE-${version}${retainedMetrics?'-retained':''}.json`),JSON.stringify(record,null,2));console.log(JSON.stringify(record));
  }else if(searchLayoutOnly){
    await verifySearchLayout();
  }else if(motionOnly){
    const cache={hit:true,degraded:false,fetchedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString()};
    const album={...legacyTrack.album,kind:'album',artists:legacyTrack.artists,artwork:null,year:'2026',releaseType:'Album',description:'Dati originali sintetici per verifica del runtime, non catalogo reale.'};
    await page.route('**/v1/catalog/album/MPREb_native_motion',route=>route.fulfill({json:{data:{...album,entries:[{number:1,title:legacyTrack.title,duration:19,track:legacyTrack}],reportedCount:1,incomplete:false},cache}}));
    await page.route('**/v1/catalog/artist/UC_native_motion',route=>route.fulfill({json:{data:{id:'UC_native_motion',name:legacyTrack.artist,kind:'artist',artwork:null,artists:[],year:null,releaseType:null,description:'Dati originali sintetici.',tracks:[legacyTrack],albums:[album],singles:[],moreAlbums:false,moreSingles:false},cache}}));
    await page.setViewportSize({width:1280,height:940});await expect(page.locator('.player-title-line')).toHaveAttribute('data-scroll','true');await expect(page.locator('.player-artist-line')).toHaveAttribute('data-scroll','true');
    await page.locator('.player-title-line').hover();await expect.poll(()=>page.locator('.player-title-line .marquee-run').evaluate(el=>el.getAnimations()[0]?.playState)).toBe('paused');await capture('portable-motion-footer.png');
    await page.locator('.player-title-link').press('Enter');await expect(page.locator('.catalog-album')).toBeVisible();await expect(page.locator('[data-jump-target=true] .catalog-track-play')).toBeFocused();await page.locator('.player-artist-link').press('Enter');await expect(page.locator('.catalog-artist h1')).toHaveText(legacyTrack.artist);
    if(accessibilityOnly){
      await page.route('**/v1/search?*',route=>route.fulfill({json:{items:[legacyTrack],nextCursor:null,cache}}));
      await page.locator('.player-album-link').press('Enter');await expect(page.locator('.catalog-album h1')).toHaveText(legacyTrack.album.name);
      await page.keyboard.press('Control+k');await expect(page.getByRole('textbox',{name:'Cerca musica'})).toBeFocused();await page.getByRole('textbox',{name:'Cerca musica'}).fill('Catalogo dimostrativo');await page.locator('.catalog-search-tabs').getByRole('button',{name:'Brani',exact:true}).click();await expect(page.locator('.track-row')).toBeVisible();await page.locator('.track-row').getByRole('button',{name:'Apri album: '+legacyTrack.album.name,exact:true}).filter({visible:true}).press('Enter');await expect(page.locator('.catalog-album')).toBeVisible();
      await page.getByRole('button',{name:'Impostazioni',exact:true}).press('Enter');await expect(page.locator('#main-content')).toBeFocused();await page.keyboard.press('Escape');await expect(page.locator('#preferences-trigger')).toBeFocused();
    }
    await page.getByRole('button',{name:'Impostazioni',exact:true}).click();await page.getByRole('combobox',{name:'Animazioni',exact:true}).selectOption('essential');await expect(page.locator('.player-title-line')).toHaveAttribute('data-scroll','false');await page.getByRole('button',{name:'Torna alla musica'}).click();await page.locator('#queue-panel-trigger').click();await page.locator('#now-panel-trigger').click();
    const menu=page.locator('.panel-body').getByRole('button',{name:'Opzioni di ascolto: '+legacyTrack.title,exact:true});await menu.press('Enter');await expect(page.locator('.listening-options:popover-open')).toBeVisible();await page.keyboard.press('Escape');await expect(menu).toBeFocused();await expect(page.locator('#listening-panel')).toHaveAttribute('aria-hidden','false');
    await close();page=await launch();await expect(page.locator('.player-title-line')).toHaveAttribute('data-scroll','false');await expect(page.locator('.transport').getByRole('button',{name:'Riproduci',exact:true})).toBeVisible();await expect(page.getByRole('slider',{name:'Posizione del brano'})).toHaveValue('8');
    console.log(JSON.stringify({portableExe:exe,scope:accessibilityOnly?'accessibility':'motion-controls',albumLinks:accessibilityOnly,searchShortcut:accessibilityOnly,preferencesFocus:accessibilityOnly,syntheticCatalogRoutes:true,marqueeOverflowAndHoverPause:true,titleAlbumTarget:true,artistNavigation:true,essentialPersists:true,menuEscapeFocus:true,panelPreserved:true,legacySeekPersisted:true,noAutoplay:true,cleanPath:env.PATH,profile}));
  }else if(readabilityOnly){
    const created=await page.evaluate(async({id})=>{
      const config=await window.ritvio.configuration(),headers={Authorization:'Bearer '+config.token,'Content-Type':'application/json'};
      const made=await fetch(config.baseUrl+'/v1/me/playlists',{method:'POST',headers,body:JSON.stringify({name:'Raccolta personale di prova — registrazioni da ascoltare insieme durante le notti in città'})});if(!made.ok)throw Error(await made.text());let playlist=await made.json();
      for(let i=0;i<2;i++){const added=await fetch(config.baseUrl+'/v1/me/playlists/'+playlist.id+'/items',{method:'POST',headers:{...headers,'If-Match':'"'+playlist.revision+'"'},body:JSON.stringify({mediaId:id})});if(!added.ok)throw Error(await added.text());playlist=await added.json();}return playlist.id;
    },{id:legacyTrack.id});expect(created).toBeTruthy();await page.reload();
    for(const width of [1280,640]){
      await page.setViewportSize({width,height:940});await page.reload();await page.getByRole('button',{name:'La tua libreria',exact:true}).click();await expect(page.locator('.playlist-card')).toHaveCount(1);
      const contained=await page.locator('.library-browser-controls').evaluate(el=>{const box=el.getBoundingClientRect();return Array.from(el.querySelectorAll('input,select')).every(control=>{const b=control.getBoundingClientRect();return b.left>=box.left-1&&b.right<=box.right+1;});});expect(contained).toBe(true);
      const footer=await page.locator('.playerbar').evaluate(el=>{const boxes=Array.from(el.querySelectorAll('.icon-button')).map(e=>e.getBoundingClientRect()).filter(b=>b.width>0);return {titleWidth:el.querySelector('.player-track>div:not(.cover)').clientWidth,overlap:boxes.some((a,i)=>boxes.slice(i+1).some(b=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1))};});expect(footer.overlap).toBe(false);if(width===1280)expect(footer.titleWidth).toBeGreaterThanOrEqual(119);
      await capture(`portable-readability-${width}.png`);await page.locator('.playlist-card').click();await expect(page.locator('.playlist-item')).toHaveCount(2);expect(await page.locator('.library-track-title>button').evaluateAll(nodes=>nodes.every(el=>el.getBoundingClientRect().right<=el.parentElement.getBoundingClientRect().right+1))).toBe(true);
    }
    await expect(page.locator('.player-track strong')).toHaveAttribute('title',legacyTrack.title);await expect(page.locator('.transport').getByRole('button',{name:'Riproduci',exact:true})).toBeVisible();
    await close();page=await launch();await expect(page.locator('.player-track strong')).toHaveText(legacyTrack.title);await expect(page.getByRole('slider',{name:'Posizione del brano'})).toHaveValue('8');
    console.log(JSON.stringify({portableExe:exe,scope:'readability',syntheticLongMetadata:true,widths:[1280,640],toolbarContained:true,rowTitleContained:true,footerNoOverlap:true,legacySeekPersisted:true,noAutoplay:true,cleanPath:env.PATH,profile}));
  }else if(lyricsControlsOnly){
    const text=Array.from({length:40},(_,i)=>`[${String(Math.floor(i*10/60)).padStart(2,'0')}:${String(i*10%60).padStart(2,'0')}]Riga personale originale ${i+1}`).join('\n');
    const imported=await page.evaluate(async({id,text})=>{const config=await window.ritvio.configuration();const response=await fetch(config.baseUrl+'/v1/me/lyrics/'+id,{method:'PUT',headers:{Authorization:'Bearer '+config.token,'Content-Type':'application/json'},body:JSON.stringify({format:'lrc',fileName:'prova-scroll.lrc',text})});return response.ok;},{id:legacyTrack.id,text});expect(imported).toBe(true);
    const trigger=page.locator('#lyrics-reader-trigger');await expect(trigger).toHaveAccessibleName('Mostra testi');await trigger.click();await expect(trigger).toHaveAccessibleName('Nascondi testi');await expect(trigger).toHaveAttribute('aria-expanded','true');
    const reader=page.locator('main .lyrics-reader'),area=reader.locator('.lyrics-scroll');await expect(area.locator('.lyric-line')).toHaveCount(40);
    const metrics=await area.evaluate(el=>({client:el.clientHeight,scroll:el.scrollHeight}));expect(metrics.scroll).toBeGreaterThan(metrics.client+200);
    await area.evaluate(el=>el.scrollTo({top:0,behavior:'instant'}));const box=await area.boundingBox();const viewportHeight=await page.evaluate(()=>innerHeight);await page.mouse.move(box.x+box.width-24,Math.min(box.y+150,viewportHeight-170));
    await page.mouse.wheel(0,350);await expect.poll(()=>area.evaluate(el=>el.scrollTop)).toBeGreaterThan(100);await expect(reader.getByRole('button',{name:'Riprendi scorrimento',exact:true})).toBeVisible();
    const after=await area.evaluate(el=>el.scrollTop);await page.mouse.wheel(0,-250);await expect.poll(()=>area.evaluate(el=>el.scrollTop)).toBeLessThan(after-50);
    await capture('portable-lyrics-controls.png');await trigger.click();await expect(reader).toHaveCount(0);await expect(page.getByRole('heading',{name:'La tua musica'})).toBeVisible();await expect(trigger).toBeFocused();
    await close();page=await launch();await page.locator('#lyrics-reader-trigger').click();await expect(page.locator('.lyrics-source')).toContainText('prova-scroll.lrc');await expect(page.locator('.lyric-line')).toHaveCount(40);await expect(page.locator('.transport').getByRole('button',{name:'Riproduci',exact:true})).toBeVisible();
    await expect(page.getByRole('slider',{name:'Posizione del brano'})).toHaveValue('8');
    console.log(JSON.stringify({portableExe:exe,scope:'lyrics-controls',footerToggle:true,rightSideWheelDownAndUp:true,returnToHome:true,focusRestored:true,personalLyricsPersisted:true,noAutoplay:true,legacySeekPreserved:true,cleanPath:env.PATH,profile}));
  }else if(listeningPreferencesOnly){
    const imported=await page.evaluate(async({id})=>{const config=await window.ritvio.configuration();const response=await fetch(config.baseUrl+'/v1/me/lyrics/'+id,{method:'PUT',headers:{Authorization:'Bearer '+config.token,'Content-Type':'application/json'},body:JSON.stringify({format:'lrc',fileName:'prova-originale.lrc',text:'[00:00]Una riga originale di prova\n[00:05]Seconda riga originale\n[00:10]Ultima riga personale'})});return {ok:response.ok,data:await response.json()};},{id:legacyTrack.id});expect(imported.ok).toBe(true);
    await page.locator('#lyrics-reader-trigger').click();await expect(page.locator('main .lyrics-reader')).toBeVisible();await expect(page.locator('.lyric-line')).toHaveCount(3);
    await page.locator('.lyric-line').last().click();await expect.poll(async()=>JSON.parse(await page.evaluate(()=>window.ritvio.readPlayer())).state.position).toBe(10);await expect(page.locator('.transport').getByRole('button',{name:'Riproduci',exact:true})).toBeVisible();await capture('portable-lyrics.png');
    await page.getByRole('button',{name:'Impostazioni',exact:true}).click();await page.getByRole('tab',{name:'Audio',exact:true}).click();const controls=page.locator('.audio-workspace');await expect(controls.locator('.audio-band')).toHaveCount(5);
    await controls.getByRole('combobox',{name:'Preset',exact:true}).selectOption('warm');await controls.getByRole('slider',{name:'Preamplificazione',exact:true}).fill('-3');await controls.getByRole('slider',{name:'Bilanciamento',exact:true}).fill('0.25');await controls.getByRole('switch').click();await expect(controls.getByRole('switch')).toHaveAttribute('aria-checked','true');await capture('portable-audio.png');
    await expect.poll(async()=>JSON.parse(await page.evaluate(()=>window.ritvio.readPlayer())).state.audioPreferences.preamp).toBe(-3);
    await close();page=await launch();await page.getByRole('button',{name:'Impostazioni',exact:true}).click();await page.getByRole('tab',{name:'Audio',exact:true}).click();await expect(page.locator('.audio-workspace').getByRole('switch')).toHaveAttribute('aria-checked','true');await expect(page.locator('.audio-workspace').getByRole('slider',{name:'Bassi, 80 Hz',exact:true})).toHaveValue('4');await expect(page.locator('.audio-workspace').getByRole('slider',{name:'Preamplificazione',exact:true})).toHaveValue('-3');await expect(page.locator('.audio-workspace').getByRole('slider',{name:'Bilanciamento',exact:true})).toHaveValue('0.25');
    await page.getByRole('button',{name:'Torna alla musica',exact:true}).click();await page.locator('#lyrics-reader-trigger').click();await expect(page.locator('.lyrics-source')).toContainText('prova-originale.lrc');await expect(page.locator('.lyric-line')).toHaveCount(3);await expect(page.getByRole('slider',{name:'Posizione del brano',exact:true})).toHaveValue('10');await expect(page.locator('.transport').getByRole('button',{name:'Riproduci',exact:true})).toBeVisible();
    console.log(JSON.stringify({portableExe:exe,scope:'listening-preferences',cleanPath:env.PATH,centralLyrics:true,personalImportPersisted:true,fiveBands:true,audioPreferencesPersisted:true,seekPersisted:true,noAutoplay:true,profile}));
  }else if(playerControlsOnly){
    const slider=page.getByRole('slider',{name:'Posizione del brano'}),rail=page.locator('.wave-timeline'),volume=page.locator('.player-extras .wave-volume');
    const box=await slider.boundingBox();await page.mouse.move(box.x+box.width*.4,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width*.8,box.y+box.height/2);
    await expect(rail).toHaveAttribute('data-dragging','true');
    const inside=await page.locator('.wave-time-preview').evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);const text=range.getBoundingClientRect(),tip=el.getBoundingClientRect();return text.left>=tip.left+2&&text.right<=tip.right-2;});expect(inside).toBe(true);
    let persisted=JSON.parse(await page.evaluate(()=>window.ritvio.readPlayer())).state;expect(persisted.position).toBe(8);
    await page.mouse.up();await expect(rail).toHaveAttribute('data-dragging','false');
    await expect.poll(async()=>JSON.parse(await page.evaluate(()=>window.ritvio.readPlayer())).state.position).toBeGreaterThan(8);
    await slider.press('Home');await slider.press('ArrowRight');await expect.poll(async()=>Number(await slider.inputValue())).toBe(5);
    const control=volume.getByRole('slider',{name:'Volume',exact:true});await control.fill('0.4');await expect(volume.locator('svg')).toHaveCount(0);
    const fill=await volume.locator('.volume-fill').evaluate(el=>el.getBoundingClientRect().width/el.parentElement.getBoundingClientRect().width);expect(fill).toBeCloseTo(.4,2);await expect(volume).toHaveAttribute('data-animated','false');
    const save=page.locator('.panel-body .like-with-label');await expect(save).toHaveText('Salva');const gap=await save.evaluate(el=>el.querySelector('span').getBoundingClientRect().left-el.querySelector('svg').getBoundingClientRect().right);expect(gap).toBeGreaterThanOrEqual(latencyOnly&&!process.argv.includes('--restore-eight')?0:8);
    await save.click();await expect(save).toHaveText('Salvato');await capture('portable-controls.png');
    await close();page=await launch();await expect(page.locator('.panel-body .like-with-label')).toHaveText('Salvato');await expect.poll(async()=>Number(await page.getByRole('slider',{name:'Posizione del brano'}).inputValue())).toBe(5);await expect(page.locator('.player-extras').getByRole('slider',{name:'Volume',exact:true})).toHaveValue('0.4');
    console.log(JSON.stringify({portableExe:exe,scope:'player-controls',cleanPath:env.PATH,previewContained:true,seekDeferredUntilRelease:true,classicVolume:true,saveGap:gap,likePersisted:true,volumePersisted:true,seekPersisted:true,profile}));
  }else if(catalogOnly){
    let playbackCalls=0;page.on('request',request=>{if(/\/playback(?:\?|$)/.test(request.url()))playbackCalls++;});
    await page.getByRole('button',{name:'Cerca',exact:true}).click();
    await page.locator('.catalog-search-tabs').getByRole('button',{name:'Artisti',exact:true}).click();
    await page.getByRole('textbox',{name:'Cerca musica'}).fill('Daft Punk');
    await page.getByRole('button',{name:'Apri artista: Daft Punk',exact:true}).first().click({timeout:45000});
    const artist=page.locator('.catalog-artist');await expect(artist.locator('h1')).toHaveText('Daft Punk',{timeout:45000});
    await expect(artist.getByRole('tab',{name:'Album',exact:true})).toHaveAttribute('aria-selected','true');
    await expect(artist.locator('.catalog-discography .catalog-resource').first()).toBeVisible();
    expect(await artist.locator('.catalog-discography .catalog-resource').count()).toBeLessThanOrEqual(3);
    const release=artist.locator('.catalog-discography .catalog-resource').first(),albumName=await release.locator('strong').innerText();
    await release.click();const album=page.locator('.catalog-album');await expect(album.locator('h1')).toHaveText(albumName,{timeout:45000});
    const slots=await album.locator('.catalog-album-entry').count();expect(slots).toBeGreaterThan(1);
    await expect.poll(()=>album.locator('.catalog-hero img').evaluate(image=>image.complete&&image.naturalWidth>0),{timeout:20000}).toBe(true);
    await album.locator('.catalog-actions').getByRole('button',{name:'Segui',exact:true}).click();await expect(album.getByRole('button',{name:'Seguito',exact:true})).toHaveAttribute('aria-pressed','true');
    await album.getByRole('button',{name:`Opzioni di ${albumName}`,exact:true}).click();
    await page.locator('.catalog-options:popover-open').getByRole('button',{name:'Crea playlist dall’album',exact:true}).click();
    await expect(album.locator('.playlist-plan')).toBeVisible();await album.getByRole('textbox',{name:'Nome della playlist dall’album'}).fill('Album UI-4 reale');
    await album.getByRole('button',{name:'Crea playlist',exact:true}).click();await expect(album.locator('.playlist-tools-feedback')).toContainText('Album UI-4 reale');
    await album.locator('.metadata-panel summary').click();await expect(album.getByRole('button',{name:'Cerca metadati',exact:true})).toBeVisible();
    await capture('portable-ui4-album-details.png');await page.getByRole('button',{name:'Indietro',exact:true}).click();await expect(artist).toBeVisible();
    await artist.getByRole('tab',{name:'Singoli ed EP',exact:true}).click();await expect(artist.getByRole('tab',{name:'Singoli ed EP',exact:true})).toHaveAttribute('aria-selected','true');
    await artist.getByRole('button',{name:'Opzioni di Daft Punk',exact:true}).click();await page.locator('.catalog-options:popover-open').getByRole('button',{name:'Cerca brani e album',exact:true}).click();
    await expect(page.getByRole('region',{name:'Filtro artista attivo'})).toContainText('Solo Daft Punk');await expect(page.locator('.tracks .track-row').first()).toBeVisible({timeout:45000});
    expect(playbackCalls).toBe(0);await expect(page.locator('.player-track strong')).toHaveText('Me at the zoo');
    await page.getByRole('button',{name:'La tua libreria',exact:true}).click();await page.getByRole('button',{name:'Album UI-4 reale',exact:true}).first().click();
    await expect(page.locator('.playlist-item').first()).toBeVisible();
    const count=await page.locator('.playlist-item').count();expect(count).toBeGreaterThan(1);
    await close();page=await launch();await expect(page.locator('.player-track strong')).toHaveText('Me at the zoo');
    await expect.poll(async()=>Number(await page.getByRole('slider',{name:'Posizione del brano'}).inputValue())).toBeGreaterThanOrEqual(latencyOnly&&!process.argv.includes('--restore-eight')?0:8);
    const saved=await page.evaluate(async()=>{const config=await window.ritvio.configuration();return(await fetch(`${config.baseUrl}/v1/me/library`,{headers:{Authorization:`Bearer ${config.token}`}})).json();});
    expect(saved.playlists.find(p=>p.name==='Album UI-4 reale').count).toBe(count);expect(saved.follows.some(resource=>resource.kind==='album'&&resource.name===albumName)).toBe(true);
    console.log(JSON.stringify({portableExe:exe,scope:'catalog',realProvider:true,artist:'Daft Punk',albumName,slots,playlistTracks:count,followPersisted:true,playlistPersisted:true,noAutoplay:playbackCalls===0,legacySeekPersisted:true,cleanPath:env.PATH,profile}));
  }else if(librarySharingOnly){
    await page.locator('.playerbar').getByRole('button',{name:'Aggiungi ai brani piaciuti: Me at the zoo',exact:true}).click();
    await page.locator('.panel-body').getByRole('button',{name:'Opzioni di ascolto: Me at the zoo',exact:true}).click();
    await page.locator('.listening-options:popover-open').getByRole('button',{name:'Salva in playlist: Me at the zoo',exact:true}).click();
    await page.getByRole('dialog').getByRole('textbox',{name:'Nome nuova playlist'}).fill('Verifica UI-3');
    await page.getByRole('dialog').getByRole('button',{name:'Crea e aggiungi',exact:true}).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await page.getByRole('button',{name:'Verifica UI-3',exact:true}).click();
    await page.getByRole('button',{name:'Gestisci playlist',exact:true}).click();
    await page.getByRole('button',{name:'Esporta playlist',exact:true}).click();
    const file=path.join(profile,'exports/Verifica UI-3.ritvio.json');
    await expect.poll(async()=>{try{return JSON.parse(await readFile(file,'utf8')).format;}catch{return null;}}).toBe('ritvio-playlist');
    await page.getByLabel('File playlist RITVIO',{exact:true}).setInputFiles(file);
    await page.getByRole('dialog').getByRole('textbox',{name:'Nome playlist importata'}).fill('Ricevuta UI-3');
    await page.getByRole('dialog').getByRole('button',{name:'Importa come nuova playlist',exact:true}).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();await expect(page.locator('.playlist-item')).toHaveCount(1);
    await page.locator('.playlist-item').getByRole('button',{name:'Opzioni di ascolto: Me at the zoo',exact:true}).click();
    const menu=page.locator('.listening-options:popover-open');await menu.getByRole('button',{name:'Copia link YouTube: Me at the zoo',exact:true}).click();
    await expect(menu.getByRole('status')).toHaveText('Link copiato');await expect(menu).toBeVisible();
    console.log('Export/import e copia link nativi: conferma visibile nel menu.');
    await page.keyboard.press('Escape');await page.getByRole('button',{name:'Impostazioni',exact:true}).click();
    const privacy=page.getByRole('region',{name:'Privacy dell’ascolto',exact:true});await privacy.getByRole('switch',{name:'Ascolto privato',exact:true}).click();await privacy.getByRole('combobox').selectOption('90');await page.keyboard.press('Escape');
    await close();page=await launch();await page.getByRole('button',{name:'Impostazioni',exact:true}).click();
    await expect(page.getByRole('region',{name:'Privacy dell’ascolto',exact:true}).getByRole('combobox')).toHaveValue('90');await page.keyboard.press('Escape');
    const saved=await page.evaluate(async()=>{const config=await window.ritvio.configuration();return(await fetch(`${config.baseUrl}/v1/me/library`,{headers:{Authorization:`Bearer ${config.token}`}})).json();});
    expect(saved.likes).toHaveLength(1);expect(saved.playlists).toHaveLength(2);expect(saved.playlists.every(p=>p.count===1)).toBe(true);
    await expect(page.getByRole('slider',{name:'Posizione del brano'})).toHaveValue('8');
    await capture('portable-ui3-sharing.png');console.log(JSON.stringify({portableExe:exe,scope:'UI3-library-sharing',exportImport:true,copyFeedback:true,libraryPersists:true,privacyPersists:true,pausedSeekPreserved:true,profile}));
  }else{
  const secondary=spawn(exe,[],{cwd:working,env,windowsHide:true,stdio:'ignore'});
  try{await expect.poll(()=>secondary.exitCode,{timeout:90000,intervals:[500,1000,2000]}).toBe(0);await expect(page.locator('.brand')).toContainText('RITVIO');}
  finally{if(secondary.exitCode===null)secondary.kill();}
  const stillInstalled=await page.evaluate(async()=>{const config=await window.ritvio.configuration();return(await fetch(`${config.baseUrl}/v1/runtime`,{headers:{Authorization:`Bearer ${config.token}`}})).json();});
  expect(stillInstalled.resolverInstalled).toBe(true);
  console.log('Seconda apertura chiusa; l’istanza originale rimane attiva.');
  let playbacks=0;const playbackRequests=[];page.on('request',request=>{if(request.url().includes('/playback')){playbacks++;const url=new URL(request.url());playbackRequests.push({path:url.pathname,fresh:url.searchParams.get('fresh')==='true'});}});
  // Observe the real packaged decoder/graph without exposing production debug APIs.
  // Silence only the terminal gain, so analysers can measure a live, unmuted signal.
  await page.evaluate(()=>{
    const probe=window.__audioProbe={gains:[],filters:[],pan:null,context:null,raw:null,processed:null};
    const gain=AudioContext.prototype.createGain,filter=AudioContext.prototype.createBiquadFilter,pan=AudioContext.prototype.createStereoPanner,source=AudioContext.prototype.createMediaElementSource;
    AudioContext.prototype.createGain=function(){const node=gain.call(this);probe.gains.push(node);return node;};
    AudioContext.prototype.createBiquadFilter=function(){const node=filter.call(this);probe.filters.push(node);return node;};
    AudioContext.prototype.createStereoPanner=function(){const node=pan.call(this);probe.pan=node;return node;};
    AudioContext.prototype.createMediaElementSource=function(element){
      const node=source.call(this,element);probe.context=this;probe.gains.at(-1).gain.value=0;element.muted=false;
      probe.raw=this.createAnalyser();probe.processed=this.createAnalyser();node.connect(probe.raw);probe.pan.connect(probe.processed);return node;
    };
  });
  await page.getByRole('button',{name:'Disattiva audio',exact:true}).click();
  await page.getByRole('textbox',{name:'Cerca musica'}).fill('Daft Punk Get Lucky');
  await expect(page.locator('.tracks .track-row').first()).toContainText('Daft Punk',{timeout:45000});
  console.log('Ricerca reale riuscita.');
  const first=page.locator('.tracks .track-row').first();
  const musicTitle=await first.locator('.track-name strong').innerText();
  await first.locator('.row-number').click();
  await expect(page.locator('.player-track strong')).toHaveText(musicTitle,{timeout:45000});
  await expect.poll(async()=>Number(await page.getByRole('slider',{name:'Posizione del brano'}).inputValue()),{timeout:45000}).toBeGreaterThan(0);
  console.log('Riproduzione musicale reale riuscita.');
  await page.getByRole('button',{name:'Impostazioni',exact:true}).click();
  const audioControls=page.getByRole('region',{name:'Il tuo suono',exact:true});
  await audioControls.getByRole('switch',{name:'Attiva i controlli audio'}).click();
  await audioControls.getByLabel('Preset',{exact:true}).selectOption('warm');
  await audioControls.getByRole('slider',{name:'Medi, 1 kHz'}).fill('-4');
  await audioControls.getByRole('slider',{name:'Preamplificazione'}).fill('-6');
  await audioControls.getByRole('slider',{name:'Bilanciamento'}).fill('0.4');
  const measured=await page.evaluate(async()=>{
    const probe=window.__audioProbe;await new Promise(resolve=>setTimeout(resolve,200));
    const rms=analyser=>{const values=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(values);return Math.sqrt(values.reduce((sum,value)=>sum+value*value,0)/values.length);};
    return {raw:rms(probe.raw),processed:rms(probe.processed),context:probe.context.state,mid:probe.filters[2].gain.value,pan:probe.pan.pan.value};
  });
  expect(measured.context).toBe('running');expect(measured.raw).toBeGreaterThan(.00001);expect(measured.processed).toBeGreaterThan(.00001);
  expect(measured.mid).toBeCloseTo(-4,2);expect(measured.pan).toBeCloseTo(.4,2);
  // Live sources may need the player's single bounded recovery attempt.
  // No settings action may create a second ordinary playback request.
  expect(playbacks).toBeGreaterThanOrEqual(1);expect(playbacks).toBeLessThanOrEqual(2);
  expect(playbackRequests[0].fresh).toBe(false);
  if(playbacks===2){expect(playbackRequests[1]).toEqual({path:playbackRequests[0].path,fresh:true});console.log('Un solo rinnovo dello stream iniziale, senza nuova richiesta ordinaria.');}
  console.log('Equalizzatore sullo stream reale: '+JSON.stringify(measured));
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Pausa',exact:true}).click();
  const resolved=playbacks;const pausedPosition=Number(await page.getByRole('slider',{name:'Posizione del brano'}).inputValue());
  await page.getByRole('button',{name:'Riproduci',exact:true}).click();
  await expect.poll(async()=>Number(await page.getByRole('slider',{name:'Posizione del brano'}).inputValue()),{timeout:15000}).toBeGreaterThan(pausedPosition);
  expect(playbacks).toBe(resolved);await page.getByRole('button',{name:'Pausa',exact:true}).click();
  console.log('Pausa/ripresa senza una seconda risoluzione audio.');
  await page.getByRole('button',{name:'Mostra in riproduzione',exact:true}).click();
  await page.locator('#lyrics-reader-trigger').click();
  const liveLyrics=page.getByRole('region',{name:'Testi',exact:true});
  await expect(liveLyrics.locator('.lyrics-loading')).toHaveCount(0,{timeout:35000});
  await liveLyrics.getByRole('button',{name:'Cerca versione',exact:true}).click();
  await liveLyrics.getByRole('textbox',{name:'Titolo del brano',exact:true}).fill('Get Lucky');
  await liveLyrics.getByRole('textbox',{name:'Artista del brano',exact:true}).fill('Daft Punk');
  await liveLyrics.getByRole('button',{name:'Cerca testi',exact:true}).click();
  await expect(liveLyrics.locator('.lyrics-candidates button').first()).toBeVisible({timeout:20000});
  await liveLyrics.locator('.lyrics-candidates button').filter({hasNotText:'Brano strumentale'}).first().click();
  await expect(liveLyrics.getByText('Fonte: LRCLIB',{exact:true})).toBeVisible({timeout:20000});
  await expect(liveLyrics.locator('.lyrics-search')).toHaveCount(0,{timeout:20000});
  const liveLyricsInfo=await page.evaluate(async()=>{
    const config=await window.ritvio.configuration(),state=JSON.parse(await window.ritvio.readPlayer()).state;
    const response=await fetch(`${config.baseUrl}/v1/me/lyrics/${state.queue[state.index].id}`,{headers:{Authorization:`Bearer ${config.token}`}});
    const value=await response.json();return{status:value.status,provider:value.document?.provider,id:value.document?.providerId,lineCount:value.document?.lines.length,plainLength:value.document?.plainText.length};
  });
  expect(liveLyricsInfo.provider).toBe('lrclib');expect(liveLyricsInfo.status).toBe('ready');expect(liveLyricsInfo.plainLength).toBeGreaterThan(0);expect(playbacks).toBe(resolved);
  console.log('Testi dal servizio LRCLIB reale: '+JSON.stringify(liveLyricsInfo));
  await page.locator('.panel-tabs').getByRole('button',{name:'In ascolto',exact:true}).click();
  // Explore real catalog pages while the current decoded audio stays untouched.
  const catalogLive=await page.evaluate(async()=>{
    const config=await window.ritvio.configuration(),headers={Authorization:`Bearer ${config.token}`};
    const get=async path=>{const response=await fetch(`${config.baseUrl}/v1${path}`,{headers});const value=await response.json();if(!response.ok)throw Error(value.error?.message);return value;};
    const found=await get('/catalog/search?kind=album&q=Daft%20Punk%20Random%20Access%20Memories');
    const album=found.data.items.find(item=>item.name==='Random Access Memories')??found.data.items[0];if(!album)throw Error('No album');
    const full=await get(`/catalog/album/${encodeURIComponent(album.id)}`),again=await get(`/catalog/album/${encodeURIComponent(album.id)}`);
    const artistId=full.data.artists[0]?.id;if(!artistId)throw Error('No artist');const artist=await get(`/catalog/artist/${encodeURIComponent(artistId)}`);
    return {id:album.id,name:full.data.name,artistId,artistName:artist.data.name,entries:full.data.entries.length,available:full.data.entries.filter(entry=>entry.track).length,first:full.data.entries[0]?.title,cacheHit:again.cache.hit,albumCount:artist.data.albums.length,artwork:full.data.artwork};
  });
  expect(catalogLive.entries).toBeGreaterThan(1);expect(catalogLive.available).toBeGreaterThan(1);expect(catalogLive.cacheHit).toBe(true);expect(catalogLive.artistName).toContain('Daft Punk');
  const beforeCatalog=playbacks;
  await page.locator('.panel-body').getByRole('button',{name:`Apri artista: ${catalogLive.artistName}`,exact:true}).first().click();
  await expect(page.locator('.catalog-artist h1')).toContainText(catalogLive.artistName,{timeout:45000});await page.locator('.catalog-artist').getByRole('button',{name:`Apri album: ${catalogLive.name}`,exact:true}).first().click();
  await expect(page.locator('.catalog-album h1')).toHaveText(catalogLive.name,{timeout:45000});await expect(page.locator('.catalog-album-entry')).toHaveCount(catalogLive.entries);
  await expect.poll(()=>page.locator('.catalog-hero img').evaluate(image=>image.complete&&image.naturalWidth>0),{timeout:20000}).toBe(true);
  await page.locator('.catalog-actions').getByRole('button',{name:'Segui',exact:true}).click();await expect(page.locator('.catalog-actions').getByRole('button',{name:'Seguito',exact:true})).toHaveAttribute('aria-pressed','true');
  expect(playbacks).toBe(beforeCatalog);await expect(page.locator('.player-track strong')).toHaveText(musicTitle);
  await page.getByRole('button',{name:'Indietro',exact:true}).click();await expect(page.locator('.catalog-artist')).toBeVisible();await page.getByRole('button',{name:'Indietro',exact:true}).click();await expect(page.locator('.tracks .track-row').first()).toBeVisible();
  console.log('Catalogo reale dell’EXE, immagine e seguito verificati: '+JSON.stringify(catalogLive));
  await page.locator('.panel-body').getByRole('button',{name:`Apri artista: ${catalogLive.artistName}`,exact:true}).first().click();
  await page.locator('.catalog-artist .catalog-details>summary').click();
  const metadataPanel=page.locator('.catalog-artist .metadata-panel');await metadataPanel.locator('summary').click();await expect(metadataPanel.getByText('Non classificato',{exact:true})).toBeVisible();
  await metadataPanel.getByRole('button',{name:'Cerca metadati',exact:true}).click();await expect(metadataPanel.locator('.metadata-candidates li').first()).toBeVisible({timeout:25000});
  await metadataPanel.getByRole('button',{name:'Conferma metadati: Daft Punk · Daft Punk',exact:true}).first().click();await expect(metadataPanel.getByText('Associazione confermata da te',{exact:true})).toBeVisible();await expect(metadataPanel.locator('.metadata-current p')).not.toHaveText('Nessun genere assegnato');
  await metadataPanel.getByRole('button',{name:'Modifica generi',exact:true}).click();await metadataPanel.getByRole('textbox',{name:'Generi personali, separati da virgole',exact:true}).fill('Ambient, Dream Pop');await metadataPanel.getByRole('button',{name:'Salva generi',exact:true}).click();await expect(metadataPanel.locator('.metadata-current p')).toHaveText('ambient · dream pop');
  expect(await page.evaluate(async()=>{try{await window.ritvio.openMetadataSource('file',1);return false;}catch{return true;}})).toBe(true);
  console.log('iTunes reale senza account/chiavi: omonimi proposti, associazione confermata, generi personali salvati, IPC fonte limita i parametri.');
  await page.locator('.catalog-artist').getByRole('button',{name:`Opzioni di ${catalogLive.artistName}`,exact:true}).click();
  await page.locator('.catalog-options:popover-open').getByRole('button',{name:'Cerca brani e album',exact:true}).click();
  await expect(page.getByRole('region',{name:'Filtro artista attivo'})).toContainText('Solo Daft Punk');
  await expect(page.locator('.tracks .track-row').first()).toBeVisible({timeout:45000});
  await page.locator('.catalog-search-tabs').getByRole('button',{name:'Album',exact:true}).click();
  await expect(page.locator('.catalog-grid .catalog-resource').first()).toBeVisible({timeout:45000});
  expect(playbacks).toBe(beforeCatalog);
  await page.getByRole('button',{name:'Rimuovi filtro artista',exact:true}).click();
  await expect(page.getByRole('region',{name:'Filtro artista attivo'})).toHaveCount(0);
  await page.locator('.catalog-search-tabs').getByRole('button',{name:'Brani',exact:true}).click();
  const artistScopeLive=await page.evaluate(async()=>{
    const config=await window.ritvio.configuration(),headers={Authorization:`Bearer ${config.token}`};
    const get=async path=>{const response=await fetch(`${config.baseUrl}/v1${path}`,{headers});const value=await response.json();if(!response.ok)throw Error(value.error?.message);return value.data;};
    const found=await get('/catalog/search?kind=artist&q=Marracash'),artist=found.items.find(item=>item.name.toLowerCase()==='marracash');if(!artist)throw Error('No exact artist');
    const tracks=await get(`/catalog/artist/${encodeURIComponent(artist.id)}/search?kind=track&q=Marracash`),albums=await get(`/catalog/artist/${encodeURIComponent(artist.id)}/search?kind=album&q=Marracash`);
    const belongs=item=>item.artists.some(person=>person.id===artist.id);
    return {id:artist.id,name:artist.name,tracks:tracks.items.length,albums:albums.items.length,verified:tracks.items.every(belongs)&&albums.items.every(belongs)};
  });
  expect(artistScopeLive.tracks).toBeGreaterThan(0);expect(artistScopeLive.albums).toBeGreaterThan(0);expect(artistScopeLive.verified).toBe(true);
  console.log('Filtro artista reale, UI brani/album e rimozione senza interrompere playback: '+JSON.stringify(artistScopeLive));
  await page.getByRole('textbox',{name:'Cerca musica'}).fill('Marracash');
  await expect(page.locator('.artist-search-match')).toContainText('Marracash',{timeout:45000});
  await expect(page.getByRole('button',{name:'Solo Marracash',exact:true})).toHaveCount(0);
  await expect(page.locator('.tracks .track-row').first().getByRole('button',{name:'Apri artista: Marracash',exact:true})).toBeVisible();
  await page.locator('.catalog-search-tabs').getByRole('button',{name:'Album',exact:true}).click();
  await expect(page.locator('.artist-search-match')).toContainText('Marracash',{timeout:45000});
  const automaticPriorityLive=await page.evaluate(async()=>{
    const config=await window.ritvio.configuration(),headers={Authorization:`Bearer ${config.token}`};
    const get=async path=>{const response=await fetch(`${config.baseUrl}/v1${path}`,{headers});const value=await response.json();if(!response.ok)throw Error(value.error?.message);return value;};
    const tracks=await get('/search?q=Marracash&type=track'),albumResult=await get('/catalog/search?kind=album&q=Marracash');
    const albums=albumResult.data,id=tracks.priorityArtist?.id;
    const ordered=items=>{let other=false;return items.every(item=>{const belongs=item.artists?.some(person=>person.id===id);if(!belongs)other=true;return !belongs||!other;});};
    const next=tracks.nextCursor?await get('/search?q=Marracash&type=track&cursor='+encodeURIComponent(tracks.nextCursor)):null;
    return {id,name:tracks.priorityArtist?.name,tracks:tracks.items.length,albums:albums.items.length,
      attributedFirst:ordered(tracks.items)&&ordered(albums.items),albumIdentity:albums.priorityArtist?.id===id,
      stableNext:!next||(next.cache.hit&&next.cache.fetchedAt===tracks.cache.fetchedAt&&next.items.every(item=>!tracks.items.some(first=>first.id===item.id)))};
  });
  expect(automaticPriorityLive.id).toBe(artistScopeLive.id);expect(automaticPriorityLive.attributedFirst).toBe(true);expect(automaticPriorityLive.albumIdentity).toBe(true);expect(automaticPriorityLive.stableNext).toBe(true);expect(playbacks).toBe(beforeCatalog);
  console.log('Priorità automatica reale senza pulsante, brani/album e snapshot paginato stabile: '+JSON.stringify(automaticPriorityLive));
  await page.locator('.catalog-search-tabs').getByRole('button',{name:'Brani',exact:true}).click();


  await page.locator('.playerbar').getByRole('button',{name:`Aggiungi ai brani piaciuti: ${musicTitle}`,exact:true}).click();
  await expect(page.locator('.playerbar').getByRole('button',{name:`Rimuovi dai brani piaciuti: ${musicTitle}`,exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Mostra in riproduzione',exact:true}).click();
  await page.locator('.panel-body').getByRole('button',{name:`Opzioni di ascolto: ${musicTitle}`,exact:true}).click();
  await page.locator('.panel-body').getByRole('button',{name:`Salva in playlist: ${musicTitle}`,exact:true}).click();
  await page.getByRole('dialog').getByRole('textbox',{name:'Nome nuova playlist'}).fill('Verifica portatile');
  await page.getByRole('dialog').getByRole('button',{name:'Crea e aggiungi'}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button',{name:'Il tuo profilo',exact:true}).click();
  await page.getByRole('dialog').getByRole('textbox',{name:'Nome visualizzato'}).fill('Profilo di prova');
  await page.getByRole('dialog').getByRole('button',{name:'Salva profilo'}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  console.log('Profilo, preferiti e playlist salvati dall’EXE.');
  await page.getByRole('button',{name:'Home',exact:true}).click();await page.locator('.home-mixes').getByRole('button',{name:'Vedi tutto',exact:true}).click();const tasteView=page.locator('.taste-page');
  const allowRecent=tasteView.getByRole('checkbox',{name:'Includi anche le ultime 24 ore',exact:true});
  await allowRecent.click();await expect(allowRecent).toBeChecked();await expect(tasteView).toHaveAttribute('aria-busy','false');
  await expect(tasteView.getByRole('button',{name:'Riproduci mix in ordine',exact:true})).toBeVisible();await tasteView.getByRole('combobox',{name:'Periodo di ascolto',exact:true}).selectOption('90');await expect(tasteView.getByRole('combobox',{name:'Periodo di ascolto',exact:true})).toHaveValue('90');await expect(tasteView).toHaveAttribute('aria-busy','false');
  await tasteView.getByRole('button',{name:`Più simili a ${musicTitle}`,exact:true}).click();await expect(tasteView.getByRole('button',{name:`Più simili a ${musicTitle}`,exact:true})).toHaveAttribute('aria-pressed','true');
  await tasteView.getByRole('button',{name:'Cerca nuovi candidati',exact:true}).click();await expect(tasteView.locator('.taste-notice')).toContainText('Ricerca completata',{timeout:110000});await expect(tasteView.locator('.taste-notice')).toContainText(/Ricerca completata: [1-9]\d* candidati aggiunti/);
  await tasteView.getByRole('button',{name:'Scoperta',exact:true}).click();await expect(tasteView.locator('.taste-tracks li').first()).toBeVisible();await capture('portable-taste.png');
  const realTaste=await page.evaluate(async()=>{const config=await window.ritvio.configuration();return(await fetch(`${config.baseUrl}/v1/me/taste`,{headers:{Authorization:`Bearer ${config.token}`}})).json();});expect(realTaste.candidateCount).toBeGreaterThan(1);expect(realTaste.feedback).toHaveLength(1);
  console.log('Gusti e mix nel portatile: candidati reali, feedback e controlli locali senza interrompere il player. '+JSON.stringify({sessions:realTaste.profile.sessions,candidates:realTaste.candidateCount,genreLevel:realTaste.settings.genreLevel}));
  await page.getByRole('button',{name:'Home',exact:true}).click();
  await expect(page.locator('.home-playlist')).toContainText('Verifica portatile');
  await expect(page.locator('.favourites-card')).toContainText('1 brano');
  await expect(page.getByRole('heading',{name:'La tua musica, adesso',exact:true})).toBeVisible();
  await capture('portable-home.png');
  await page.getByRole('textbox',{name:'Link YouTube'}).fill('https://www.youtube.com/watch?v=jNQXAC9IVRw');
  await page.getByRole('button',{name:'Apri e riproduci link'}).click();
  await expect(page.getByRole('textbox',{name:'Link YouTube'})).toHaveValue('',{timeout:45000});
  await expect(page.locator('.player-track strong')).toHaveText('Me at the zoo',{timeout:45000});
  const slider=page.getByRole('slider',{name:'Posizione del brano'});
  await expect.poll(async()=>Number(await slider.inputValue()),{timeout:45000}).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Pausa',exact:true}).click();await slider.fill('8');
  await page.getByRole('button',{name:'Mostra in riproduzione',exact:true}).click();await page.locator('#lyrics-reader-trigger').click();
  const localLyrics=page.getByRole('region',{name:'Testi',exact:true});
  await localLyrics.locator('input[type=file]').setInputFiles({name:'verifica-originale.lrc',mimeType:'text/plain',buffer:Buffer.from('[00:00]Riga originale di verifica\n[00:05]Seconda riga personale')});
  await expect(localLyrics.getByText('File locale: verifica-originale.lrc',{exact:true})).toBeVisible({timeout:35000});
  await expect(localLyrics.locator('[aria-current=true]')).toHaveText('Seconda riga personale');
  await page.locator('.panel-tabs').getByRole('button',{name:'In ascolto',exact:true}).click();
  await capture('portable-player.png');
  // Exclude a different song while the single queued video remains paused.
  // This exercises real Electron persistence without starting another live stream.
  await page.getByRole('textbox',{name:'Cerca musica'}).fill('Daft Punk Get Lucky');
  await expect(page.locator('.tracks .track-row').first().locator('.track-name strong')).toHaveText(musicTitle,{timeout:45000});
  await page.locator('.tracks .track-row').first().getByRole('button',{name:`Opzioni di ascolto: ${musicTitle}`,exact:true}).click();
  await page.locator('.listening-options:popover-open').getByRole('button',{name:'Non riprodurre questo brano',exact:true}).click();
  await page.getByRole('button',{name:'Riproduzione casuale',exact:true}).click();
  const listeningPreferences=JSON.parse(await page.evaluate(()=>window.ritvio.readPlayer())).state;
  expect(listeningPreferences.exclusions.tracks).toHaveLength(1);
  expect(listeningPreferences.shufflePlan.ids[listeningPreferences.shufflePlan.cursor]).toBe(listeningPreferences.queue[0].queueId);
  await close();page=await launch();
  await expect(page.locator('.player-track strong')).toHaveText('Me at the zoo');
  await expect(page.getByRole('button',{name:'Riproduci',exact:true})).toBeVisible();
  await expect.poll(async()=>Number(await page.getByRole('slider',{name:'Posizione del brano'}).inputValue())).toBeGreaterThanOrEqual(latencyOnly&&!process.argv.includes('--restore-eight')?0:8);
  await expect(page.getByRole('button',{name:'Riproduzione casuale',exact:true})).toHaveAttribute('aria-pressed','true');
  const restoredPreferences=JSON.parse(await page.evaluate(()=>window.ritvio.readPlayer())).state;
  expect(restoredPreferences.shufflePlan).toEqual(listeningPreferences.shufflePlan);
  expect(restoredPreferences.audioPreferences).toEqual(listeningPreferences.audioPreferences);
  await page.getByRole('button',{name:'Impostazioni',exact:true}).click();
  const restoredAudioControls=page.getByRole('region',{name:'Il tuo suono',exact:true});
  await expect(restoredAudioControls.getByRole('switch')).toHaveAttribute('aria-checked','true');
  await expect(restoredAudioControls.getByRole('slider',{name:'Medi, 1 kHz'})).toHaveValue('-4');
  await expect(restoredAudioControls.getByRole('slider',{name:'Preamplificazione'})).toHaveValue('-6');
  await expect(restoredAudioControls.getByRole('slider',{name:'Bilanciamento'})).toHaveValue('0.4');
  console.log('Preset, bande, preamplificazione e bilanciamento persistono al riavvio dell’EXE.');
  const exclusions=page.getByRole('region',{name:'Brani e artisti esclusi',exact:true});
  await expect(exclusions.getByText(musicTitle,{exact:true})).toBeVisible();
  await exclusions.getByRole('button',{name:`Riattiva ${musicTitle}`,exact:true}).click();
  await expect(exclusions.getByText(/Nessuna esclusione/)).toBeVisible();await page.keyboard.press('Escape');
  await expect.poll(async()=>JSON.parse(await readFile(path.join(profile,'player-state.json'),'utf8')).state.exclusions.tracks.length).toBe(0);
  console.log('Shuffle ed esclusioni persistono nel portatile; riattivazione salvata senza alterare libreria e posizione.');
  await page.getByRole('button',{name:'Mostra in riproduzione',exact:true}).click();await page.locator('#lyrics-reader-trigger').click();
  const restoredLyrics=page.getByRole('region',{name:'Testi',exact:true});await expect(restoredLyrics.getByText('File locale: verifica-originale.lrc',{exact:true})).toBeVisible();await expect(restoredLyrics.locator('[aria-current=true]')).toHaveText('Seconda riga personale');
  console.log('Testi LRC personali persistono al riavvio e seguono la posizione salvata.');
  await page.locator('.panel-tabs').getByRole('button',{name:'In ascolto',exact:true}).click();
  expect(await page.evaluate(()=>typeof window.require)).toBe('undefined');
  const saved=await page.evaluate(async()=>{const config=await window.ritvio.configuration();return(await fetch(`${config.baseUrl}/v1/me/library`,{headers:{Authorization:`Bearer ${config.token}`}})).json();});
  expect(saved.profile.displayName).toBe('Profilo di prova');expect(saved.likes).toHaveLength(1);
  expect(saved.follows.some(resource=>resource.kind==='album'&&resource.id===catalogLive.id)).toBe(true);
  console.log('Album seguito persistente dopo il riavvio dell’EXE.');
  const persistedTaste=await page.evaluate(async()=>{const config=await window.ritvio.configuration();return(await fetch(`${config.baseUrl}/v1/me/taste`,{headers:{Authorization:`Bearer ${config.token}`}})).json();});expect(persistedTaste.settings.days).toBe(90);expect(persistedTaste.settings.allowRecent).toBe(true);expect(persistedTaste.feedback).toHaveLength(1);expect(persistedTaste.feedback[0].track.title).toBe(musicTitle);expect(persistedTaste.candidateCount).toBeGreaterThan(1);console.log('Gusti, feedback e candidati persistono al riavvio dell’EXE.');
  const persistedMetadata=await page.evaluate(async({artistId})=>{const config=await window.ritvio.configuration();return(await fetch(`${config.baseUrl}/v1/me/metadata/artist/${artistId}`,{headers:{Authorization:`Bearer ${config.token}`}})).json();},{artistId:catalogLive.artistId});
  expect(persistedMetadata.status).toBe('local');expect(persistedMetadata.genres.map(genre=>genre.name)).toEqual(['ambient','dream pop']);expect(persistedMetadata.selected.name).toBe('Daft Punk');expect(persistedMetadata.candidates.length).toBeGreaterThan(0);
  console.log('Associazione iTunes, risultati e generi locali persistono dopo il riavvio dell’EXE.');

  expect(saved.playlists).toHaveLength(1);expect(saved.playlists[0].count).toBe(1);expect(saved.history.length).toBeGreaterThanOrEqual(2);
  await page.getByRole('button',{name:'Cerca',exact:true}).click();
  await expect(page.locator('.search-history-items').getByRole('button',{name:'Daft Punk Get Lucky',exact:true})).toBeVisible();
  await expect(page.locator('.genre-card')).toHaveCount(4);
  await page.getByRole('button',{name:'Impostazioni',exact:true}).click();
  await page.getByRole('button',{name:'Scuro',exact:true}).click();await page.keyboard.press('Escape');
  await expect(page.locator('.brand-mark')).toHaveCSS('color','rgb(114, 87, 184)');
  await page.getByRole('button',{name:'Impostazioni',exact:true}).click();
  await page.getByRole('button',{name:'Chiaro',exact:true}).click();await page.keyboard.press('Escape');
  console.log('Ricerche recenti persistenti nell’EXE dopo il riavvio.');
  await page.getByRole('button',{name:'Verifica portatile',exact:true}).click();
  await expect(page.locator('.playlist-item')).toHaveCount(1);
  await page.getByRole('button',{name:'Gestisci playlist',exact:true}).click();
  await page.getByRole('button',{name:'Esporta playlist',exact:true}).click();
  await expect.poll(async()=>{try{return JSON.parse(await readFile(path.join(profile,'exports/Verifica portatile.ritvio.json'),'utf8')).format;}catch{return null;}}).toBe('ritvio-playlist');
  const exported=JSON.parse(await readFile(path.join(profile,'exports/Verifica portatile.ritvio.json'),'utf8'));
  expect(exported.playlist.tracks).toHaveLength(1);expect(JSON.stringify(exported)).not.toContain('googlevideo.com');
  await page.getByLabel('File playlist RITVIO',{exact:true}).setInputFiles(path.join(profile,'exports/Verifica portatile.ritvio.json'));
  await page.getByRole('dialog').getByRole('textbox',{name:'Nome playlist importata'}).fill('Ricevuta da file');
  await page.getByRole('dialog').getByRole('button',{name:'Importa come nuova playlist'}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();await expect(page.locator('.playlist-hero')).toContainText('Ricevuta da file');
  await expect(page.locator('.playlist-item')).toHaveCount(1);
  await page.locator('.playlist-item').getByRole('button',{name:`Opzioni di ascolto: ${musicTitle}`,exact:true}).click();
  await page.locator('.listening-options:popover-open').getByRole('button',{name:`Copia link YouTube: ${musicTitle}`,exact:true}).click();
  await expect(page.locator('.playlist-item').getByRole('status')).toContainText('Link copiato');
  const preview=await page.evaluate(async()=>{const config=await window.ritvio.configuration();return(await fetch(`${config.baseUrl}/v1/me/library`,{headers:{Authorization:`Bearer ${config.token}`}})).json();});
  expect(preview.playlists).toHaveLength(2);
  await capture('portable-library.png');
  const realListening=await page.evaluate(async()=>{const config=await window.ritvio.configuration();return(await fetch(`${config.baseUrl}/v1/me/listening`,{headers:{Authorization:`Bearer ${config.token}`}})).json();});
  expect(realListening.summary.listenedMs).toBeGreaterThan(0);expect(realListening.items.length).toBeGreaterThanOrEqual(2);expect(realListening.items.some(item=>item.reason==='interrupted')).toBe(true);
  console.log('Ascolti reali e recupero dopo riavvio: '+JSON.stringify({sessions:realListening.summary.sessions,listenedMs:realListening.summary.listenedMs,interrupted:realListening.summary.interrupted,legacyStarts:realListening.legacyStarts}));
  await page.getByRole('button',{name:'Impostazioni',exact:true}).click();const privacy=page.getByRole('region',{name:'Privacy dell’ascolto',exact:true});await privacy.getByRole('switch',{name:'Ascolto privato',exact:true}).click();await expect(privacy.getByRole('switch')).toHaveAttribute('aria-checked','true');await privacy.getByRole('combobox').selectOption('90');await expect(privacy.getByRole('combobox')).toBeEnabled();await page.keyboard.press('Escape');
  await close();page=await launch();await expect(page.locator('.activity-private-indicator')).toBeVisible();await page.getByRole('button',{name:'Impostazioni',exact:true}).click();await expect(page.getByRole('region',{name:'Privacy dell’ascolto',exact:true}).getByRole('combobox')).toHaveValue('90');await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'La tua libreria',exact:true}).click();await page.getByRole('tab',{name:'Ascolti',exact:true}).click();const activityView=page.locator('.listening-activity');await expect(activityView.locator('.activity-event').first()).toBeVisible();
  await activityView.getByRole('button',{name:'Cancella gli ascolti',exact:true}).click();await activityView.getByRole('button',{name:'Cancella definitivamente gli ascolti',exact:true}).click();await expect(activityView.locator('.activity-event')).toHaveCount(0);
  const afterClear=await page.evaluate(async()=>{const config=await window.ritvio.configuration();return(await fetch(`${config.baseUrl}/v1/me/library`,{headers:{Authorization:`Bearer ${config.token}`}})).json();});expect(afterClear.likes).toHaveLength(1);expect(afterClear.playlists).toHaveLength(2);expect(afterClear.history).toHaveLength(0);expect(afterClear.follows.some(resource=>resource.kind==='album'&&resource.id===catalogLive.id)).toBe(true);
  console.log('Privacy e conservazione persistenti; cancellazione ascolti conserva preferiti, playlist e album seguiti.');
  await readFile(path.join(profile,'cache/mvp.sqlite'));
  console.log(JSON.stringify({portableExe:exe,cleanPath:env.PATH,embeddedResolvers:true,legacyUpgrade:true,singleInstance:true,streamReuseOnResume:true,liveSearch:true,liveAudio:true,musicTitle,seek:true,restartRestoresPausedPosition:true,persistentCache:true,localLibraryPersists:true,profilePersists:true,listeningHistory:true,playlistExportToDisk:true,playlistImport:true,copyTrackLink:true,rendererIsolated:true,screenshot:path.join(profile,'portable-library.png')}));
  }
}catch(error){
  console.error('Original packaged-probe failure:',error);
  if(page&&!page.isClosed()){await page.screenshot({path:path.join(profile,'failure.png'),timeout:3000}).catch(()=>{});const body=await page.locator('body').innerText({timeout:1500}).catch(()=>null);if(body)console.error(body.slice(-1500));}
  throw error;
}finally {
  try{await close();}catch{if(child?.pid)spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}
}

