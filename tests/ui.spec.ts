test('catalog album preserves order, skips missing tracks and adds an atomic batch without restarting audio',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Cerca',exact:true}).click();await page.locator('.catalog-search-tabs').getByRole('button',{name:'Album',exact:true}).click();await page.getByRole('textbox',{name:'Cerca musica'}).fill('Album test');
  await page.getByRole('button',{name:'Apri album: Album test 1',exact:true}).click();const album=page.locator('.catalog-page');await expect(album.getByRole('heading',{name:'Album test 1',exact:true})).toBeVisible();await expect(album.locator('.catalog-album-entry')).toHaveCount(3);await expect(album.getByText('Traccia non disponibile nel catalogo')).toBeVisible();await expect(album.getByText(/Il catalogo indica 4 tracce/)).toBeVisible();
  await page.getByRole('button',{name:'Riproduzione casuale',exact:true}).click();await album.getByRole('button',{name:'Riproduci in ordine'}).click();await expect(page.locator('.player-track strong')).toHaveText('Primo & brano');await expect(page.getByRole('button',{name:'Riproduzione casuale',exact:true})).toHaveAttribute('aria-pressed','false');
  await page.getByRole('button',{name:'Pausa',exact:true}).click();let playback=0;page.on('request',r=>{if(r.url().includes('/v1/media/')&&r.url().includes('/playback')&&!r.url().includes('prepare=true'))playback++;});await album.getByRole('button',{name:'Opzioni di Album test 1',exact:true}).click();await page.locator('.catalog-options:popover-open').getByRole('button',{name:'Aggiungi alla coda',exact:true}).click();await expect(album.locator('.catalog-feedback')).toContainText('2 brani aggiunti');expect(playback).toBe(0);
  await page.getByRole('button',{name:'Mostra coda di riproduzione',exact:true}).click();await expect(page.locator('.queue-row')).toHaveCount(4);await expect(page.locator('.queue-title strong')).toHaveText(['Primo & brano','Secondo brano','Primo & brano','Secondo brano']);
  await album.getByRole('button',{name:'Riproduci Secondo brano',exact:true}).click();await expect(page.locator('.player-track strong')).toHaveText('Secondo brano');expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('ritvio-player-v1')!).state.queue.length)).toBe(2);
});
test('catalog artist navigation, publications, follows and browser history keep playback alive',async({page})=>{
  await page.goto('/');await page.getByRole('textbox',{name:'Cerca musica'}).fill('Musica test');await page.locator('.track-row').first().getByRole('button',{name:'Riproduci Secondo brano',exact:true}).click();await expect(page.getByRole('button',{name:'Pausa',exact:true})).toBeVisible();await page.getByRole('button',{name:'Pausa',exact:true}).click();
  let playbacks=0;page.on('request',r=>{if(r.url().includes('/v1/media/')&&r.url().includes('/playback')&&!r.url().includes('prepare=true'))playbacks++;});await page.locator('.track-row').first().getByRole('button',{name:'Apri artista: Artista test'}).click();const artist=page.locator('.catalog-page');await expect(artist.getByRole('heading',{name:'Artista test',exact:true})).toBeVisible();await artist.getByRole('button',{name:'Segui',exact:true}).click();await expect(artist.getByRole('button',{name:'Seguito',exact:true})).toHaveAttribute('aria-pressed','true');
  await artist.getByRole('button',{name:'Vedi tutti',exact:true}).click();await expect(artist.getByRole('button',{name:'Apri album: Altra pubblicazione'})).toBeVisible();await artist.getByRole('button',{name:'Apri album: Altra pubblicazione'}).click();await expect(page.locator('.catalog-album')).toBeVisible();await page.getByRole('button',{name:'Indietro',exact:true}).click();await expect(page.locator('.catalog-artist')).toBeVisible();
  await page.getByRole('button',{name:'La tua libreria',exact:true}).click();await page.getByRole('tab',{name:'Artisti',exact:true}).click();await page.locator('.follow-grid').getByRole('button',{name:'Apri artista: Artista test'}).click();await expect(page.locator('.catalog-artist')).toBeVisible();expect(playbacks).toBe(0);await expect(page.locator('.player-track strong')).toHaveText('Secondo brano');
});
test('catalog discards late responses, reports error and empty states with retry',async({page})=>{
  let state='fail';await page.route('**/v1/catalog/search?*',async route=>{if(state==='fail')return route.fulfill({status:503,json:{error:{code:'RESOLVER_FAILED',message:'Catalogo temporaneamente assente'}}});return route.fulfill({json:{data:{items:[],truncated:false},cache:{hit:false,degraded:false,fetchedAt:new Date().toISOString(),expiresAt:new Date().toISOString()}}});});
  await page.goto('/');await page.getByRole('button',{name:'Cerca',exact:true}).click();await page.locator('.catalog-search-tabs').getByRole('button',{name:'Artisti',exact:true}).click();await page.getByRole('textbox',{name:'Cerca musica'}).fill('Artista test');await expect(page.locator('.catalog-error')).toContainText('Catalogo temporaneamente assente');state='empty';await page.locator('.catalog-error').getByRole('button',{name:'Riprova',exact:true}).click();await expect(page.getByRole('heading',{name:'Nessun risultato trovato'})).toBeVisible();
  let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);await page.unroute('**/v1/catalog/search?*');await page.route('**/v1/catalog/search?*',async route=>{const old=route.request().url().includes('q=Prima');if(old)await gate;await route.fulfill({json:{data:{items:[{id:'UCtestArtist01',name:old?'Risposta vecchia':'Risposta attuale',kind:'artist',artwork:null,artists:[],year:null,releaseType:null}],truncated:false},cache:{hit:false,degraded:false,fetchedAt:new Date().toISOString(),expiresAt:new Date().toISOString()}}}).catch(()=>{});});
  try{await page.getByRole('textbox',{name:'Cerca musica'}).fill('Prima');await expect.poll(()=>page.locator('.catalog-loading').count()).toBe(1);await page.waitForTimeout(750);await page.getByRole('textbox',{name:'Cerca musica'}).fill('Seconda');await expect(page.getByRole('button',{name:'Apri artista: Risposta attuale'})).toBeVisible();release();await expect(page.getByRole('button',{name:'Apri artista: Risposta vecchia'})).toHaveCount(0);}finally{release();}
});
test('catalog layouts fit dark, light and compact screens with keyboard and reduced motion',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Cerca',exact:true}).click();await page.locator('.catalog-search-tabs').getByRole('button',{name:'Album',exact:true}).click();await page.getByRole('textbox',{name:'Cerca musica'}).fill('Album test');await page.getByRole('button',{name:'Apri album: Album test 1'}).click();await expect(page.locator('.catalog-album')).toBeVisible();
  const capture=async(path:string)=>{await page.evaluate(()=>document.fonts.ready);await expect.poll(()=>page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running'&&a.effect?.getComputedTiming().iterations!==Infinity).length)).toBe(0);await page.screenshot({path});};
  await capture('test-results/visual/catalog-album-desktop.png');await page.locator('.catalog-byline').getByRole('button',{name:'Apri artista: Artista test'}).click();await expect(page.locator('.catalog-artist')).toBeVisible();await capture('test-results/visual/catalog-artist-desktop.png');
  await page.getByRole('button',{name:'Impostazioni',exact:true}).click();await page.getByRole('button',{name:'Scuro',exact:true}).click();await page.keyboard.press('Escape');await capture('test-results/visual/catalog-artist-light.png');
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});const panel=page.locator('#listening-panel');if(await panel.getAttribute('aria-hidden')==='false')await panel.getByRole('button',{name:'Nascondi pannello',exact:true}).click();await capture('test-results/visual/catalog-artist-compact.png');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await page.locator('.catalog-page').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.locator('.catalog-actions').getByRole('button',{name:'Segui',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.locator('.catalog-actions').getByRole('button',{name:'Seguito',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Indietro',exact:true}).click();await expect(page.locator('.catalog-album')).toBeVisible();await capture('test-results/visual/catalog-album-compact.png');const bounds=await page.locator('.catalog-page').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,overflow:Array.from(el.querySelectorAll('*')).filter(child=>child.getBoundingClientRect().right>el.getBoundingClientRect().right+1).map(child=>({tag:child.tagName,cls:child.className,right:child.getBoundingClientRect().right,width:child.getBoundingClientRect().width}))}));expect(bounds.scroll,JSON.stringify(bounds)).toBeLessThanOrEqual(bounds.width);
});

import {test,expect} from '@playwright/test';
const remoteFixtureLink='https://music.youtube.com/playlist?list=PLremote_import_ui01';
async function openRemoteImport(page:import('@playwright/test').Page,link=remoteFixtureLink){
  await page.getByRole('button',{name:'La tua libreria',exact:true}).click();await page.getByRole('button',{name:'Importa da link',exact:true}).click();const panel=page.locator('#remote-import');
  await expect(panel.getByRole('heading',{name:'Importa una playlist da YouTube',exact:true})).toBeFocused();await panel.getByRole('textbox',{name:'Link della playlist',exact:true}).fill(link);await panel.getByRole('button',{name:'Leggi playlist',exact:true}).click();return panel;
}
test('remote import preview preserves duplicate entries and playback, selected save reports partial source',async({page,request})=>{
  await page.goto('/');await page.getByRole('textbox',{name:'Cerca musica',exact:true}).fill('Musica test');await page.locator('.tracks .track-row').first().locator('.row-number').click();await expect(page.getByRole('button',{name:'Pausa',exact:true})).toBeVisible();
  const current=await page.locator('.player-track strong').innerText();let playbacks=0;page.on('request',r=>{if(r.url().includes('/v1/media/')&&r.url().includes('/playback')&&!r.url().includes('prepare=true'))playbacks++;});const panel=await openRemoteImport(page);
  await expect(panel.locator('.remote-entry')).toHaveCount(4);await expect(panel.getByRole('checkbox',{name:'Seleziona elemento 2: Contenuto non disponibile',exact:true})).toBeDisabled();await expect(panel.locator('.remote-warning')).toContainText('meno elementi');await expect(panel.locator('.remote-count')).toContainText('3 selezionati · 3 da aggiungere');
  expect((await(await request.get('http://127.0.0.1:5199/v1/me/library',{headers:{authorization:'Bearer test-token-only'}})).json()).playlists).toHaveLength(0);
  await panel.getByRole('checkbox',{name:'Seleziona elemento 3: Secondo brano',exact:true}).uncheck();await panel.getByRole('textbox',{name:'Nome della nuova playlist',exact:true}).fill('Duplicati da link');await panel.getByRole('button',{name:'Crea playlist importata',exact:true}).click();await expect(panel.locator('.remote-result')).toContainText('Aggiunti: 2 · duplicati saltati: 0 · indisponibili: 1 · esclusi dalla selezione: 1');await expect(page.locator('.player-track strong')).toHaveText(current);expect(playbacks).toBe(0);
  await panel.getByRole('button',{name:'Apri playlist importata',exact:true}).click();await expect(page.locator('.playlist-item .library-track-title>button strong')).toHaveText(['Primo & brano','Primo & brano']);
});
test('remote import appends with duplicate choice and explicit revision refresh while preserving old entries',async({page,request})=>{
  const base='http://127.0.0.1:5199/v1',headers={authorization:'Bearer test-token-only'};await request.get(base+'/search?q=Musica',{headers});const created=await request.post(base+'/me/playlists/from-queue',{headers,data:{name:'Destinazione importazione',mediaIds:[libraryFixtureTracks[0].id]}});const target=await created.json();
  await page.goto('/');const panel=await openRemoteImport(page);await expect(panel.locator('.remote-entry')).toHaveCount(4);await panel.getByRole('combobox',{name:'Destinazione',exact:true}).selectOption(target.id);await expect(panel.locator('.remote-count')).toContainText('da 1 a 4');await panel.getByRole('checkbox',{name:'Salta i riferimenti già presenti e le copie ripetute nella selezione',exact:true}).check();await expect(panel.locator('.remote-count')).toContainText('1 da aggiungere · 2 duplicati saltati');
  await request.patch(base+'/me/playlists/'+target.id,{headers:{...headers,'if-match':'"1"'},data:{name:'Destinazione aggiornata',description:'',cover:null,visibility:'private'}});await panel.getByRole('button',{name:'Aggiungi alla playlist',exact:true}).click();await expect(panel.getByRole('alert').first()).toContainText('playlist è cambiata');
  await panel.getByRole('button',{name:'Ricarica destinazione',exact:true}).click();await panel.getByRole('button',{name:'Aggiungi alla playlist',exact:true}).click();await expect(panel.locator('.remote-result')).toContainText('Aggiunti: 1 · duplicati saltati: 2');const saved=await(await request.get(base+'/me/playlists/'+target.id,{headers})).json();expect(saved.items[0].id).toBe(target.items[0].id);expect(saved.items.map((i:any)=>i.track.id)).toEqual(libraryFixtureTracks.map(t=>t.id));
});
test('remote import cancels active reading and closes with trigger focus without saving',async({page})=>{
  let cancelled=0;const job={id:'00000000-0000-4000-8000-000000000087',state:'loading',phase:'youtube',preview:null,error:null,result:null};
  await page.route('**/v1/me/playlist-imports',r=>r.fulfill({status:202,json:job}));await page.route('**/v1/me/playlist-imports/'+job.id,r=>{if(r.request().method()==='DELETE')cancelled++;return r.fulfill({json:r.request().method()==='DELETE'?{...job,state:'cancelled'}:job});});
  await page.goto('/');const panel=await openRemoteImport(page);await expect(panel.getByRole('status')).toContainText('metadati su YouTube');await panel.getByRole('button',{name:'Interrompi lettura',exact:true}).click();await expect(panel).toHaveCount(0);await expect(page.getByRole('button',{name:'Importa da link',exact:true})).toBeFocused();await expect.poll(()=>cancelled).toBe(1);
});
test('remote import stale unknown-total preview exposes capacity and retains choices in a scrolling list',async({page,request})=>{
  const base='http://127.0.0.1:5199/v1',headers={authorization:'Bearer test-token-only'};await request.get(base+'/search?q=Musica',{headers});const target=await(await request.post(base+'/me/playlists/from-queue',{headers,data:{name:'Quasi piena',mediaIds:Array.from({length:950},()=>libraryFixtureTracks[0].id)}})).json();
  const job={id:'00000000-0000-4000-8000-000000000089',state:'ready',phase:'ready',error:null,result:null,preview:{id:'PLremote_import_ui01',url:remoteFixtureLink,title:'Lista di prova',description:'',author:'',artwork:null,entries:Array.from({length:150},(_,i)=>({number:i+1,title:`Elemento ${i+1}`,track:libraryFixtureTracks[i%2]})),reportedCount:null,partial:true,truncated:false,provider:'youtube',fetchedAt:'2026-10-10T12:00:00Z',cache:'stale'}};
  await page.route('**/v1/me/playlist-imports',r=>r.fulfill({status:202,json:job}));await page.goto('/');const panel=await openRemoteImport(page);await expect(panel.locator('.remote-entry')).toHaveCount(150);await expect(panel).toContainText('copia precedente');await expect(panel.locator('.remote-warning')).toContainText('non comunica il totale');await panel.getByRole('combobox',{name:'Destinazione',exact:true}).selectOption(target.id);await expect(panel).toContainText('supererebbe 1.000 elementi');await expect(panel.getByRole('button',{name:'Aggiungi alla playlist',exact:true})).toBeDisabled();
  expect(await panel.locator('.remote-entries').evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);await panel.getByRole('button',{name:'Deseleziona tutti',exact:true}).click();await panel.getByRole('checkbox',{name:'Seleziona elemento 150: Elemento 150',exact:true}).check();await expect(panel.locator('.remote-count')).toContainText('1 selezionati · 1 da aggiungere');await expect(panel.getByRole('button',{name:'Aggiungi alla playlist',exact:true})).toBeEnabled();await panel.getByRole('button',{name:'Annulla importazione',exact:true}).click();
});
test('remote import handles invalid links, failures, empty previews and keyboard input',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'La tua libreria',exact:true}).click();await page.getByRole('button',{name:'Importa da link',exact:true}).click();const panel=page.locator('#remote-import');await panel.getByRole('textbox',{name:'Link della playlist',exact:true}).fill('https://youtube.com.evil.test/playlist?list=PLremote_import_ui01');await panel.getByRole('button',{name:'Leggi playlist',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('link HTTPS');
  await page.route('**/v1/me/playlist-imports',r=>r.fulfill({status:202,json:{id:'00000000-0000-4000-8000-000000000088',state:'failed',phase:'youtube-music',error:'Playlist privata o non disponibile. Controlla il link.',preview:null,result:null}}));await panel.getByRole('textbox',{name:'Link della playlist',exact:true}).fill(remoteFixtureLink);await panel.getByRole('textbox',{name:'Link della playlist',exact:true}).press('Enter');await expect(panel.getByRole('button',{name:'Riprova lettura',exact:true})).toBeVisible();await expect(panel).toContainText('Playlist privata');
  await page.unroute('**/v1/me/playlist-imports');await panel.getByRole('textbox',{name:'Link della playlist',exact:true}).fill('https://youtube.com/playlist?list=PLremote_empty_ui01');await panel.getByRole('button',{name:'Leggi playlist',exact:true}).click();await expect(panel).toContainText('Nessun elemento restituito');await expect(panel.getByRole('button',{name:'Crea playlist importata',exact:true})).toBeDisabled();
});
test('remote import layouts expose source, selection and result in desktop light compact and empty states',async({page})=>{
  await page.goto('/');const panel=await openRemoteImport(page);await expect(panel.locator('.remote-entry')).toHaveCount(4);
  const capture=async(name:string)=>{await page.evaluate(()=>document.fonts.ready);await expect.poll(()=>page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running'&&a.effect?.getComputedTiming().iterations!==Infinity).length)).toBe(0);await page.screenshot({path:`test-results/visual/playlist-import-${name}.png`});};
  await capture('desktop');await panel.locator('.remote-entries').scrollIntoViewIfNeeded();await capture('selection');await page.locator('main').evaluate(el=>el.scrollTo({top:0,behavior:'instant'}));await page.getByRole('button',{name:'Impostazioni',exact:true}).click();await page.getByRole('button',{name:'Scuro',exact:true}).click();await page.keyboard.press('Escape');await capture('light');
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});const listening=page.locator('#listening-panel');if(await listening.getAttribute('aria-hidden')==='false')await listening.getByRole('button',{name:'Nascondi pannello',exact:true}).click();await panel.getByRole('heading',{name:'Importa una playlist da YouTube',exact:true}).evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));await capture('compact');expect(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await panel.getByRole('button',{name:'Crea playlist importata',exact:true}).click();await expect(panel.locator('.remote-result')).toBeVisible();await panel.locator('.remote-result').scrollIntoViewIfNeeded();await capture('result');await panel.getByRole('button',{name:'Fine',exact:true}).click();
  await page.setViewportSize({width:1440,height:940});const empty=await openRemoteImport(page,'https://youtube.com/playlist?list=PLremote_empty_layout01');await expect(empty).toContainText('Nessun elemento restituito');await capture('empty');
});
import {tracks as libraryFixtureTracks} from './fixtures';

async function mockBrowserLibrary(page:import('@playwright/test').Page,amount=125){
  const likes=Array.from({length:amount},(_,i)=>({...libraryFixtureTracks[0],id:`local:${i}`,title:`Città ${String(i).padStart(4,'0')}`,artist:i%2?'Artista Beta':'Artista Alfa',duration:[120,240,480,0][i%4],artists:[{id:'UCtestArtist01',name:'Ospite test'}],album:{id:'MPREb_test1',name:'Notte blu'}}));
  const playlists=[{id:'00000000-0000-4000-8000-000000000001',name:'Viaggio',description:'Musica per la strada',visibility:'private',cover:null,artwork:[libraryFixtureTracks[0].thumbnail],count:3,revision:1,updatedAt:'2026-10-10T12:00:00Z',durationSeconds:36},{id:'00000000-0000-4000-8000-000000000002',name:'Alba',description:'Mattine lente',visibility:'private',cover:null,artwork:[],count:0,revision:1,updatedAt:'2026-10-09T12:00:00Z',durationSeconds:0},{id:'00000000-0000-4000-8000-000000000003',name:'Senza durata',description:'',visibility:'private',cover:null,artwork:[],count:1,revision:1,updatedAt:'2026-10-08T12:00:00Z',durationSeconds:null}];
  const follows=[{id:'UCtestArtist01',name:'Artista test',kind:'artist',artwork:null,url:'https://music.youtube.com/channel/UCtestArtist01'},{id:'UCtestArtist02',name:'Altro artista',kind:'artist',artwork:null,url:'https://music.youtube.com/channel/UCtestArtist02'},{id:'MPREb_test1',name:'Notte blu',kind:'album',artwork:null,url:'https://music.youtube.com/browse/MPREb_test1'}];
  const data={profile:{id:'00000000-0000-4000-8000-000000000099',mode:'local',displayName:'Profilo di prova',avatar:null},likes,playlists,follows,history:likes.slice(0,10).map((track,index)=>({id:`history:${index}`,track,playedAt:new Date(Date.UTC(2026,9,10,12,index)).toISOString()}))};
  await page.route('**/v1/me/library',route=>route.fulfill({json:data}));
  const detail={...playlists[0],items:[{id:'item-one',track:libraryFixtureTracks[1]},{id:'item-two',track:libraryFixtureTracks[0]},{id:'item-three',track:libraryFixtureTracks[0]}]};
  await page.route('**/v1/me/playlists/'+detail.id,route=>route.fulfill({json:detail}));
  return data;
}
test('library browsing finds metadata locally in 5000 favourites and appends bounded batches',async({page})=>{
  await mockBrowserLibrary(page,5000);await page.goto('/');await page.getByRole('button',{name:'La tua libreria',exact:true}).click();await page.getByRole('tab',{name:'Preferiti',exact:true}).click();
  const library=page.locator('.library-page'),search=library.getByRole('searchbox',{name:'Cerca nei brani piaciuti'});
  await expect(library.locator('.library-track')).toHaveCount(60);await expect(library.locator('.library-browser-status')).toContainText('5000 elementi su 5000');
  let online=0;page.on('request',request=>{if(/\/v1\/(search|catalog\/search)/.test(request.url()))online++;});
  await search.fill('citta 4200 ospite blu');await expect(library.locator('.library-track')).toHaveCount(1);await expect(library.locator('.library-track')).toContainText('Città 4200');
  await search.fill('');await library.locator('.duration-filter-control summary').click();await library.getByRole('combobox',{name:'Durata del brano'}).selectOption('medium');await expect(library.locator('.library-browser-status')).toContainText('1250 elementi su 5000');
  await library.getByRole('button',{name:'Reimposta filtri'}).click();await library.getByRole('button',{name:'Mostra altri 60',exact:true}).click();await expect(library.locator('.library-track')).toHaveCount(120);expect(online).toBe(0);
  await search.fill('non esiste');await expect(library.getByRole('heading',{name:'Nessuna corrispondenza'})).toBeVisible();await expect(library.locator('.library-browser-status')).toContainText('0 elementi su 5000');await library.locator('.library-no-results').getByRole('button',{name:'Reimposta filtri'}).click();await expect(library.locator('.library-track')).toHaveCount(60);
});
test('library browsing retains filters, loaded rows, section and scroll through artist navigation',async({page})=>{
  await mockBrowserLibrary(page);await page.goto('/');await page.getByRole('button',{name:'La tua libreria',exact:true}).click();await page.getByRole('tab',{name:'Preferiti',exact:true}).click();const library=page.locator('.library-page');
  await library.getByRole('combobox',{name:'Ordina per'}).selectOption('name');await library.getByRole('button',{name:'Mostra altri 60',exact:true}).click();const row=library.locator('.library-track').nth(70);await row.scrollIntoViewIfNeeded();
  const scroll=await page.locator('main').evaluate(el=>el.scrollTop);expect(scroll).toBeGreaterThan(1000);await row.getByRole('button',{name:'Apri artista: Ospite test'}).click();await expect(page.locator('.catalog-artist')).toBeVisible();await page.getByRole('button',{name:'Indietro',exact:true}).click();
  await expect(library.getByRole('combobox',{name:'Ordina per'})).toHaveValue('name');await expect(library.locator('.library-track')).toHaveCount(120);await expect(page.getByRole('tab',{name:'Preferiti',exact:true})).toHaveAttribute('aria-selected','true');await expect.poll(()=>page.locator('main').evaluate(el=>el.scrollTop)).toBeCloseTo(scroll,0);
  await page.getByRole('button',{name:'Home',exact:true}).click();await page.getByRole('button',{name:'La tua libreria',exact:true}).click();await expect(library.locator('.library-track')).toHaveCount(120);await expect.poll(()=>page.locator('main').evaluate(el=>el.scrollTop)).toBeCloseTo(scroll,0);
});
test('library browsing playlist views preserve duplicates and saved order while changing playback context',async({page})=>{
  const data=await mockBrowserLibrary(page);await page.goto('/');await page.getByRole('button',{name:'La tua libreria',exact:true}).click();const library=page.locator('.library-page');
  await library.getByRole('combobox',{name:'Ordina per'}).selectOption('name');await expect(library.locator('.playlist-card strong')).toHaveText(['Alba','Senza durata','Viaggio']);await library.getByRole('searchbox',{name:'Cerca nelle tue playlist'}).fill('strada');await expect(library.locator('.playlist-card')).toHaveCount(1);await library.locator('.playlist-card .library-collection-open').click();
  const search=library.getByRole('searchbox',{name:'Cerca in questa playlist'});await library.getByRole('combobox',{name:'Ordina per'}).selectOption('name');await expect(library.locator('.playlist-item .library-track-title>button strong')).toHaveText(['Primo & brano','Primo & brano','Secondo brano']);await library.locator('.playlist-item').last().locator('button[popovertarget]').click();await expect(library.getByRole('button',{name:'Sposta su Secondo brano'})).toBeDisabled();await page.keyboard.press('Escape');await expect(library.locator('.playlist-item').first()).toHaveAttribute('draggable','false');
  await search.fill('secondo');await expect(library.locator('.playlist-item')).toHaveCount(1);await library.locator('.library-track-play[aria-label="Riproduci Secondo brano"]').click();await expect(page.locator('.player-track strong')).toHaveText('Secondo brano');await expect(page.getByRole('button',{name:'Pausa',exact:true})).toBeVisible();await page.getByRole('button',{name:'Pausa',exact:true}).click();
  const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('ritvio-player-v1')??'{}'));expect(state.state.queue).toHaveLength(1);
  await library.getByRole('button',{name:'Reimposta filtri',exact:true}).click();await expect(library.locator('.playlist-item .library-track-title>button strong')).toHaveText(['Secondo brano','Primo & brano','Primo & brano']);await expect(library.locator('.playlist-item').first()).toHaveAttribute('draggable','true');
  await library.getByRole('button',{name:'Torna alla libreria',exact:true}).click();await expect(library.getByRole('searchbox',{name:'Cerca nelle tue playlist'})).toHaveValue('strada');await expect(library.getByRole('combobox',{name:'Ordina per'})).toHaveValue('name');expect(data.playlists[0].count).toBe(3);
});
test('library browsing keeps independent artist, album and history views with keyboard controls',async({page})=>{
  await mockBrowserLibrary(page);await page.goto('/');await page.getByRole('button',{name:'La tua libreria',exact:true}).click();const library=page.locator('.library-page');
  await page.getByRole('tab',{name:'Artisti',exact:true}).click();await library.getByRole('searchbox',{name:'Cerca negli artisti seguiti'}).fill('altro');await expect(library.locator('.follow-card')).toHaveCount(1);await library.getByRole('combobox',{name:'Ordina per'}).selectOption('name');
  await page.getByRole('tab',{name:'Artisti',exact:true}).focus();await page.keyboard.press('ArrowLeft');await expect(page.getByRole('tab',{name:'Album',exact:true})).toHaveAttribute('aria-selected','true');await expect(library.getByRole('searchbox',{name:'Cerca negli album seguiti'})).toHaveValue('');await expect(library.locator('.follow-card')).toHaveCount(1);
  await page.keyboard.press('ArrowRight');await expect(library.getByRole('searchbox',{name:'Cerca negli artisti seguiti'})).toHaveValue('altro');await expect(library.getByRole('combobox',{name:'Ordina per'})).toHaveValue('name');
  await page.getByRole('tab',{name:'Cronologia',exact:true}).click();await library.locator('.duration-filter-control summary').click();await library.getByRole('combobox',{name:'Durata del brano'}).selectOption('unknown');await expect(library.locator('.history-entry')).toHaveCount(2);await expect(library.locator('.library-browser-status')).toContainText('2 elementi su 10');
});
test('library browsing layouts show clear tools in desktop, light, compact and empty states',async({page})=>{
  await mockBrowserLibrary(page);await page.goto('/');await page.getByRole('button',{name:'La tua libreria',exact:true}).click();await page.getByRole('tab',{name:'Preferiti',exact:true}).click();const library=page.locator('.library-page');
  const capture=async(name:string)=>{await page.evaluate(()=>document.fonts.ready);await expect.poll(()=>page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running'&&a.effect?.getComputedTiming().iterations!==Infinity).length)).toBe(0);await page.locator('main').evaluate(el=>el.scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:`test-results/visual/library-restyle-regression-${name}.png`});};
  await capture('desktop');await page.getByRole('tab',{name:'Playlist',exact:true}).click();await library.getByRole('button',{name:'Apri playlist: Viaggio',exact:true}).click();await expect(library.locator('.playlist-hero')).toBeVisible();await capture('playlist');await library.getByRole('button',{name:'Torna alla libreria',exact:true}).click();await page.getByRole('tab',{name:'Preferiti',exact:true}).click();
  await page.getByRole('button',{name:'Impostazioni',exact:true}).click();await page.getByRole('button',{name:'Scuro',exact:true}).click();await page.keyboard.press('Escape');await capture('light');
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});const panel=page.locator('#listening-panel');if(await panel.getAttribute('aria-hidden')==='false')await panel.getByRole('button',{name:'Nascondi pannello',exact:true}).click();await capture('compact');
  expect(await library.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  for(const control of await library.locator('.library-browser-controls input:visible,.library-browser-controls select:visible').all()){const rect=await control.boundingBox();expect(rect!.width).toBeGreaterThan(100);expect(rect!.x+rect!.width).toBeLessThanOrEqual(390);expect(rect!.height).toBeGreaterThanOrEqual(44);}
  await library.getByRole('searchbox',{name:'Cerca nei brani piaciuti'}).fill('assente');await expect(library.getByRole('heading',{name:'Nessuna corrispondenza'})).toBeVisible();await capture('empty');
});

async function openQueueTools(page:import('@playwright/test').Page){
  await page.goto('/');await page.getByRole('textbox',{name:'Cerca musica'}).fill('Musica test');await page.locator('.tracks .track-row').first().locator('.row-number').click();await expect(page.getByRole('button',{name:'Pausa',exact:true})).toBeVisible();await page.getByRole('button',{name:'Pausa',exact:true}).click();await page.getByRole('button',{name:'Mostra coda di riproduzione',exact:true}).click();return page.locator('.queue-tools');
}
test('timer queue duration expires by wall time after reload and can be cancelled without playback',async({page})=>{
  const queue=await openQueueTools(page);await page.clock.install();await queue.locator('.sleep-control summary').focus();await page.keyboard.press('Space');await expect(queue.locator('.sleep-control details')).toHaveAttribute('open','');await expect(page.getByRole('button',{name:'Riproduci',exact:true})).toBeVisible();await queue.getByRole('button',{name:'15 min',exact:true}).click();await expect(queue.locator('.sleep-active')).toBeVisible();await queue.getByRole('button',{name:'Annulla timer',exact:true}).click();await expect(queue.locator('.sleep-active')).toHaveCount(0);
  await queue.getByRole('spinbutton',{name:'Minuti personalizzati',exact:true}).fill('1');await queue.getByRole('button',{name:'Avvia timer',exact:true}).click();await page.reload();await page.getByRole('button',{name:'Mostra coda di riproduzione',exact:true}).click();await expect(queue.locator('.sleep-active')).toBeVisible();await page.clock.fastForward(61000);await expect(queue.locator('.sleep-control')).toContainText('Timer terminato. La musica è in pausa.');await expect(page.getByRole('button',{name:'Riproduci',exact:true})).toBeVisible();await expect(queue.locator('.sleep-active')).toHaveCount(0);
});
test('timer queue natural track end overrides repeat and never starts the following song',async({page})=>{
  const queue=await openQueueTools(page),title=await page.locator('.player-track strong').innerText();await page.locator('.transport button').last().click();await page.locator('.transport button').last().click();await queue.locator('.sleep-control summary').click();await queue.getByRole('button',{name:'A fine brano',exact:true}).click();await page.getByRole('slider',{name:'Posizione del brano'}).fill('11');await page.getByRole('button',{name:'Riproduci',exact:true}).click();await expect(queue.locator('.sleep-control')).toContainText('Timer terminato. La musica è in pausa.',{timeout:10000});await expect(page.locator('.player-track strong')).toHaveText(title);await expect(page.getByRole('button',{name:'Riproduci',exact:true})).toBeVisible();
});
test('timer queue priority batch removal and atomic playlist snapshot preserve playback and duplicates',async({page,request})=>{
  const queue=await openQueueTools(page),title=await page.locator('.player-track strong').innerText();let playback=0;page.on('request',r=>{if(r.url().includes('/v1/media/')&&r.url().includes('/playback')&&!r.url().includes('prepare=true'))playback++;});await page.getByRole('button',{name:'Riproduzione casuale',exact:true}).click();const last=queue.locator('.queue-row').last(),nextTitle=await last.locator('.queue-title strong').innerText();await last.getByRole('button',{name:`Riproduci dopo: ${nextTitle}`,exact:true}).click();await expect(queue.getByText('Riproduci dopo',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Brano successivo',exact:true}).click();await expect(page.locator('.player-track strong')).toHaveText(nextTitle);await page.getByRole('button',{name:'Pausa',exact:true}).click();playback=0;
  await page.locator('.tracks .track-row').first().getByRole('button',{name:`Aggiungi alla coda: ${title}`,exact:true}).click();await queue.getByRole('button',{name:'Salva coda come playlist',exact:true}).click();const count=await queue.locator('.queue-row').count();await queue.getByRole('textbox',{name:'Nome della playlist dalla coda',exact:true}).fill('Coda duplicati');await queue.getByRole('button',{name:'Crea playlist dalla coda',exact:true}).click();await expect(queue.locator('.queue-feedback')).toContainText('Coda duplicati');const library=(await request.get('http://127.0.0.1:5199/v1/me/library',{headers:{authorization:'Bearer test-token-only'}})).json();const saved=(await library).playlists.find((p:any)=>p.name==='Coda duplicati');expect(saved.count).toBe(count);expect(saved.visibility).toBe('private');
  await queue.getByRole('button',{name:'Seleziona gli altri',exact:true}).click();await queue.getByRole('button',{name:/Rimuovi selezionati/}).click();await expect(queue.locator('.queue-row')).toHaveCount(1);await expect(page.locator('.player-track strong')).toHaveText(nextTitle);expect(playback).toBe(0);
});
test('timer queue layouts fit desktop light compact and keyboard with reduced motion',async({page})=>{
  const queue=await openQueueTools(page);const capture=async(name:string)=>{await page.evaluate(()=>document.fonts.ready);await expect.poll(()=>page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running'&&a.effect?.getComputedTiming().iterations!==Infinity).length)).toBe(0);await page.screenshot({path:`test-results/visual/timer-queue-${name}.png`});};
  await capture('desktop');await queue.getByRole('button',{name:'Salva coda come playlist',exact:true}).click();await queue.locator('.queue-save').evaluate(el=>el.scrollIntoView({block:'start'}));await capture('save');await queue.getByRole('button',{name:'Annulla',exact:true}).click();await queue.locator('.sleep-control summary').click();await queue.getByRole('button',{name:'30 min',exact:true}).click();await queue.evaluate(el=>{const panel=el.closest('.now-panel');if(panel)panel.scrollTop=0;});await capture('timer');await page.getByRole('button',{name:'Impostazioni',exact:true}).click();await page.getByRole('button',{name:'Scuro',exact:true}).click();await page.keyboard.press('Escape');await capture('light');
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await queue.getByRole('button',{name:'Annulla timer',exact:true}).focus();await page.keyboard.press('Enter');await expect(queue.locator('.sleep-active')).toHaveCount(0);await queue.locator('details').evaluate(el=>el.removeAttribute('open'));await queue.evaluate(el=>{const panel=el.closest('.now-panel');if(panel)panel.scrollTop=0;});await capture('compact');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await queue.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);for(const element of await queue.locator('button,input,select').all()){if(await element.isVisible()){const rect=await element.boundingBox();expect(rect!.x).toBeGreaterThanOrEqual(0);expect(rect!.x+rect!.width).toBeLessThanOrEqual(391);}}
});

test('automatic artist priority ranks tracks and albums without a filter click and preserves other matches',async({page})=>{
  await page.goto('/');await page.getByRole('textbox',{name:'Cerca musica'}).fill('Artista test');
  await expect(page.locator('.tracks .track-row')).toHaveCount(3);
  await expect(page.locator('.tracks .track-row').first()).toContainText('Secondo brano');
  await expect(page.locator('.tracks .track-row').last()).toContainText('Altro interprete');
  await expect(page.getByRole('button',{name:'Solo Artista test',exact:true})).toHaveCount(0);
  await expect(page.getByRole('region',{name:'Filtro artista attivo'})).toHaveCount(0);
  let playbacks=0;page.on('request',request=>{if(request.url().includes('/v1/media/')&&request.url().includes('/playback')&&!request.url().includes('prepare=true'))playbacks++;});
  await expect(page.locator('.artist-search-match')).toContainText('Prima i risultati con questo artista nei crediti');
  await page.locator('.catalog-search-tabs').getByRole('button',{name:'Album',exact:true}).click();
  await expect(page.locator('.catalog-grid>.catalog-resource')).toHaveCount(2);
  await expect(page.locator('.catalog-grid>.catalog-resource').first()).toHaveAttribute('aria-label','Apri album: Album test 1');
  await expect(page.getByRole('button',{name:'Apri album: Artista test',exact:true})).toBeVisible();
  await page.locator('.artist-search-match').getByRole('button',{name:'Apri artista: Artista test',exact:true}).click();
  await expect(page.locator('.catalog-artist')).toBeVisible();
  await page.locator('.catalog-artist').getByRole('button',{name:'Opzioni di Artista test',exact:true}).click();await page.locator('.catalog-options:popover-open').getByRole('button',{name:'Cerca brani e album',exact:true}).click();
  await expect(page.getByRole('region',{name:'Filtro artista attivo'})).toBeVisible();await expect(page.locator('.tracks .track-row')).toHaveCount(2);
  await page.getByRole('button',{name:'Rimuovi filtro artista',exact:true}).click();await expect(page.locator('.tracks .track-row')).toHaveCount(3);
  await page.getByRole('textbox',{name:'Cerca musica'}).fill('Secondo brano');await expect(page.locator('.tracks .track-row').first()).toContainText('Secondo brano');await expect(page.locator('.artist-search-match')).toHaveCount(0);
  expect(playbacks).toBe(0);
});

test('automatic priority fits dark light compact and empty states with keyboard and reduced motion',async({page})=>{
  await page.goto('/');await page.getByRole('textbox',{name:'Cerca musica'}).fill('Artista test');await expect(page.locator('.tracks .track-row')).toHaveCount(3);
  const capture=async(name:string)=>{await page.evaluate(()=>document.fonts.ready);await expect.poll(()=>page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running'&&a.effect?.getComputedTiming().iterations!==Infinity).length)).toBe(0);await page.screenshot({path:`test-results/visual/search-priority-${name}.png`});};
  await capture('desktop');await page.locator('.catalog-search-tabs').getByRole('button',{name:'Album',exact:true}).click();await expect(page.locator('.catalog-grid>.catalog-resource')).toHaveCount(2);await capture('albums');
  await page.getByRole('button',{name:'Impostazioni',exact:true}).click();await page.getByRole('button',{name:'Scuro',exact:true}).click();await page.keyboard.press('Escape');await capture('light');
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});const panel=page.locator('#listening-panel');if(await panel.getAttribute('aria-hidden')==='false')await panel.getByRole('button',{name:'Nascondi pannello',exact:true}).click();await capture('compact');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const artist=page.locator('.artist-search-match button');expect(await artist.evaluate(element=>element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);await artist.focus();await expect(artist).toBeFocused();
  await page.keyboard.press('Enter');await expect(page.locator('.catalog-artist')).toBeVisible();await page.getByRole('button',{name:'Indietro',exact:true}).click();await expect(page.locator('.artist-search-match')).toBeVisible();
  await page.getByRole('textbox',{name:'Cerca musica'}).fill('Assente');await expect(page.getByRole('heading',{name:'Nessun risultato trovato',exact:true})).toBeVisible();await expect(page.locator('.artist-search-match')).toHaveCount(0);await capture('empty');
});

test('artist-scoped requests abort old refinements and show recoverable failures',async({page})=>{
  await page.goto('/');await page.getByRole('textbox',{name:'Cerca musica'}).fill('Artista test');await page.locator('.artist-search-match button').click();await page.locator('.catalog-artist').getByRole('button',{name:'Opzioni di Artista test',exact:true}).click();await page.locator('.catalog-options:popover-open').getByRole('button',{name:'Cerca brani e album',exact:true}).click();await expect(page.locator('.tracks .track-row')).toHaveCount(2);
  let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
  await page.route('**/v1/catalog/artist/*/search?*',async route=>{const query=new URL(route.request().url()).searchParams.get('q');if(query==='Prima')await gate;if(query==='Errore')return route.fulfill({status:503,json:{error:{code:'RESOLVER_FAILED',message:'Ricerca artista temporaneamente assente'}}});await route.fulfill({json:{data:{kind:'track',items:[],truncated:false},cache:{hit:false,degraded:false,fetchedAt:new Date().toISOString(),expiresAt:new Date().toISOString()}}}).catch(()=>{});});
  try{await page.getByRole('textbox',{name:'Cerca musica'}).fill('Prima');await page.waitForTimeout(750);await page.getByRole('textbox',{name:'Cerca musica'}).fill('Errore');await expect(page.getByRole('alert')).toContainText('Ricerca artista temporaneamente assente');release();await expect(page.getByRole('alert')).toContainText('Ricerca artista temporaneamente assente');await page.getByRole('textbox',{name:'Cerca musica'}).fill('Assente');await expect(page.getByRole('heading',{name:'Nessun brano trovato',exact:true})).toBeVisible();await expect(page.getByRole('region',{name:'Filtro artista attivo'})).toBeVisible();}finally{release();}
});

async function openLyrics(page:import('@playwright/test').Page){
  await page.goto('/');await page.getByRole('textbox',{name:'Cerca musica'}).fill('Musica test');
  await page.locator('.tracks .track-row').first().getByRole('button',{name:'Riproduci Secondo brano',exact:true}).click();
  await expect(page.getByRole('button',{name:'Pausa',exact:true})).toBeVisible();await page.getByRole('button',{name:'Pausa',exact:true}).click();
  await page.locator('#lyrics-reader-trigger').click();
  return page.getByRole('region',{name:'Testi',exact:true});
}
test('a late lyric response cannot overwrite the next selected track',async({page})=>{
  let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
  await page.route('**/v1/me/lyrics/*',async route=>{
    const old=route.request().url().endsWith((await import('./fixtures')).tracks[1].id);
    if(old)await gate;
    await route.fulfill({json:{status:'ready',cacheHit:false,savedChoice:false,document:{provider:'local',providerId:null,title:old?'Secondo brano':'Primo & brano',artist:'Artista test',fileName:'test.txt',instrumental:false,fetchedAt:new Date().toISOString(),licenseVerified:null,plainText:old?'Risposta vecchia da scartare':'Testo del nuovo brano',lines:[],offsetMs:0}}}).catch(()=>{});
  });
  try{const panel=await openLyrics(page);await page.getByRole('button',{name:'Brano successivo',exact:true}).click();await expect(panel.locator('.lyrics-plain')).toHaveText('Testo del nuovo brano');release();await expect(panel.locator('.lyrics-plain')).toHaveText('Testo del nuovo brano');}finally{release();}
});
test('lyrics synchronize with seek, switch modes and allow explicit version selection',async({page})=>{
  let playbacks=0;page.on('request',request=>{if(request.url().includes('/v1/media/')&&request.url().includes('/playback')&&!request.url().includes('prepare=true'))playbacks++;});
  const panel=await openLyrics(page);await expect(panel.getByText('Fonte: LRCLIB',{exact:true})).toBeVisible();
  await expect(panel.locator('[aria-current=true]')).toHaveText('Prima riga originale');
  const second=panel.getByRole('button',{name:'Vai a 0:04: Seconda riga di prova',exact:true});await second.focus();await page.keyboard.press('Enter');
  await expect(panel.locator('[aria-current=true]')).toHaveText('Seconda riga di prova');await expect(page.getByRole('slider',{name:'Posizione del brano'})).toHaveValue('4');
  expect(playbacks).toBe(1);await panel.getByRole('button',{name:'Testo completo',exact:true}).click();await expect(panel.locator('.lyrics-plain')).toContainText('Ultima riga originale');
  await panel.getByRole('button',{name:'Cerca versione',exact:true}).click();await panel.getByRole('button',{name:'Cerca testi',exact:true}).click();
  await panel.locator('.lyrics-candidates button').first().click();await expect(panel.locator('.lyrics-search')).toHaveCount(0);await expect(panel.locator('[aria-current=true]')).toHaveText('Seconda riga di prova');
  expect(playbacks).toBe(1);await page.getByRole('slider',{name:'Posizione del brano'}).fill('0');await expect(panel.locator('[aria-current=true]')).toHaveText('Prima riga originale');
});
test('local LRC imports remain literal, survive reload and revert to online lyrics',async({page})=>{
  const panel=await openLyrics(page);await expect(panel.getByText('Fonte: LRCLIB',{exact:true})).toBeVisible();
  await panel.locator('input[type=file]').setInputFiles({name:'originale.lrc',mimeType:'text/plain',buffer:Buffer.from('[00:00]<img src=x onerror=alert(1)>\n[00:05]Riga personale originale')});
  await expect(panel.getByText('File locale: originale.lrc',{exact:true})).toBeVisible();await expect(panel.locator('.lyric-line').first()).toHaveText('<img src=x onerror=alert(1)>');await expect(panel.locator('.lyrics-scroll img')).toHaveCount(0);
  await page.reload();await page.locator('#lyrics-reader-trigger').click();
  await expect(panel.getByText('File locale: originale.lrc',{exact:true})).toBeVisible();await panel.getByRole('button',{name:'Ripristina ricerca automatica'}).click();await expect(panel.getByText('Fonte: LRCLIB',{exact:true})).toBeVisible();
});
test('lyrics distinguish missing, throttled and instrumental states with recovery',async({page})=>{
  let state='missing';await page.route('**/v1/me/lyrics/*',async route=>{
    if(state==='limited')return route.fulfill({status:429,json:{error:{code:'LYRICS_RATE_LIMIT',message:'La fonte dei testi richiede una pausa. Riprova più tardi.'}}});
    return route.fulfill({json:state==='missing'?{status:'missing',document:null,cacheHit:false}:{status:'instrumental',cacheHit:false,document:{provider:'lrclib',providerId:71,title:'Secondo brano',artist:'Artista',fileName:null,instrumental:true,fetchedAt:new Date().toISOString(),licenseVerified:false,plainText:'',lines:[],offsetMs:0}}});
  });
  const panel=await openLyrics(page);await expect(panel.getByRole('heading',{name:'Testo non trovato',exact:true})).toBeVisible();
  state='limited';await panel.getByRole('button',{name:'Riprova a caricare il testo'}).click();await expect(panel.getByRole('alert')).toContainText('richiede una pausa');
  state='instrumental';await panel.getByRole('button',{name:'Riprova a caricare il testo'}).click();await expect(panel.getByRole('heading',{name:'Brano strumentale',exact:true})).toBeVisible();await expect(panel.getByRole('alert')).toHaveCount(0);
});
test('lyrics fit dark, light and compact layouts with keyboard and reduced motion',async({page})=>{
  await page.setViewportSize({width:1440,height:940});const panel=await openLyrics(page);await expect(panel.getByText('Fonte: LRCLIB',{exact:true})).toBeVisible();
  const capture=async(path:string)=>{await page.evaluate(()=>document.fonts.ready);await expect.poll(()=>page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running'&&a.effect?.getComputedTiming().iterations!==Infinity).length)).toBe(0);await page.screenshot({path});};
  await capture('data/analysis/lyrics-desktop.png');
  await page.getByRole('button',{name:'Impostazioni',exact:true}).click();await page.getByRole('button',{name:'Scuro',exact:true}).click();await page.keyboard.press('Escape');await capture('data/analysis/lyrics-light.png');
  await expect(panel.locator('.lyrics-plain')).toHaveCount(0);await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await capture('data/analysis/lyrics-compact.png');
  expect(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(panel.locator('.lyric-line').first()).toHaveCSS('transition-duration','0s');await panel.locator('.lyric-line').first().focus();await page.keyboard.press('Escape');await expect(page.locator('#listening-panel')).toHaveAttribute('aria-hidden','true');await expect(page.getByRole('button',{name:'Mostra in riproduzione',exact:true})).toBeFocused();
});

test('audio filters change the rendered signal, bypass is flat, pan works and headroom limits boosts',async({page})=>{
  await page.goto('/');
  const signals=await page.evaluate(async()=>{
    const modulePath='/src/audio-engine.ts';const {createAudioGraph}=await import(modulePath);
    const render=async(bands:number[],preamp=0,pan=0,enabled=true,frequency=1000,direct=false)=>{
      const context=new OfflineAudioContext(2,22050,44100),graph=createAudioGraph(context);
      const reduction=graph.configure({enabled,bands,preamp,pan},false);
      const oscillator=context.createOscillator();oscillator.frequency.value=frequency;
      const level=context.createGain();level.gain.value=.4;oscillator.connect(level);if(direct)level.connect(context.destination);else{level.connect(graph.input);graph.output.connect(context.destination);}oscillator.start();
      const buffer=await context.startRendering();
      const rms=(channel:number)=>{const values=buffer.getChannelData(channel).slice(4410);return Math.sqrt(values.reduce((sum,value)=>sum+value*value,0)/values.length);};
      return {left:rms(0),right:rms(1),peak:Math.max(...buffer.getChannelData(0).slice(4410).map(Math.abs)),reduction};
    };
    return {original:await render([0,0,0,0,0],0,0,false,1000,true),flat:await render([0,0,0,0,0]),cut:await render([0,0,-12,0,0]),bypass:await render([12,12,-12,12,-12],6,-1,false),preamp:await render([0,0,0,0,0],-6),preampBoost:await render([0,0,0,0,0],6),left:await render([0,0,0,0,0],0,-1),right:await render([0,0,0,0,0],0,1),boost:await render([12,12,12,12,12])};
  });
  expect(signals.flat.left).toBeGreaterThan(.15);
  expect(signals.flat.left).toBeCloseTo(signals.original.left,5);expect(signals.flat.right).toBeCloseTo(signals.original.right,5);
  expect(signals.cut.left/signals.flat.left).toBeCloseTo(Math.pow(10,-12/20),2);
  expect(signals.bypass.left).toBeCloseTo(signals.flat.left,5);expect(signals.bypass.right).toBeCloseTo(signals.flat.right,5);
  expect(signals.preamp.left/signals.flat.left).toBeCloseTo(Math.pow(10,-6/20),3);
  expect(signals.preampBoost.left/signals.flat.left).toBeCloseTo(Math.pow(10,6/20),3);
  expect(signals.left.left).toBeGreaterThan(.1);expect(signals.left.right).toBeLessThan(.00001);
  expect(signals.right.right).toBeGreaterThan(.1);expect(signals.right.left).toBeLessThan(.00001);
  expect(signals.boost.reduction).toBeGreaterThan(12);expect(signals.boost.peak).toBeLessThanOrEqual(signals.flat.peak*1.01);
});

test('equalizer processes a live decoded stream, changes without resolving again and survives reload',async({page})=>{
  let playbacks=0;page.on('request',request=>{if(request.url().includes('/v1/media/')&&request.url().includes('/playback')&&!request.url().includes('prepare=true'))playbacks++;});
  await page.goto('/');await page.getByRole('textbox',{name:'Cerca musica'}).fill('Musica test');
  await page.getByRole('button',{name:'Riproduci Secondo brano',exact:true}).click();
  await expect.poll(async()=>Number(await page.getByRole('slider',{name:'Posizione del brano'}).inputValue())).toBeGreaterThan(.2);
  const signal=await page.evaluate(async()=>{
    const modulePath='/src/audio-engine.ts';const {audioEngine}=await import(modulePath);const engine=audioEngine();
    const analyser=engine.context.createAnalyser();analyser.fftSize=2048;engine.graph.output.connect(analyser);
    const element=engine.source.mediaElement,originalVolume=element.volume,originalMute=element.muted;
    const measure=async()=>{await new Promise(resolve=>setTimeout(resolve,100));const values=new Float32Array(2048);analyser.getFloatTimeDomainData(values);return Math.sqrt(values.reduce((sum,value)=>sum+value*value,0)/values.length);};
    const rms=await measure();element.volume=originalVolume/2;const half=await measure();element.muted=true;const silence=await measure();
    element.volume=originalVolume;element.muted=originalMute;engine.graph.output.disconnect(analyser);
    return {rms,half,silence,state:engine.context.state};
  });
  expect(signal.state).toBe('running');expect(signal.rms).toBeGreaterThan(.001);
  expect(signal.half/signal.rms).toBeCloseTo(.5,2);expect(signal.silence).toBeLessThan(.00001);
  await page.getByRole('button',{name:'Impostazioni',exact:true}).click();
  const controls=page.getByRole('region',{name:'Il tuo suono',exact:true}),toggle=controls.getByRole('switch',{name:'Attiva i controlli audio'});
  await expect(controls.getByLabel('Preset',{exact:true})).toBeDisabled();await toggle.click();
  await controls.getByLabel('Preset',{exact:true}).selectOption('warm');await expect(controls.getByRole('slider',{name:'Bassi, 80 Hz'})).toHaveValue('4');
  const mids=controls.getByRole('slider',{name:'Medi, 1 kHz'});await mids.fill('-3');await expect(controls.getByLabel('Preset',{exact:true})).toHaveValue('custom');
  await mids.focus();await page.keyboard.press('ArrowRight');await expect(mids).toHaveValue('-2.5');
  await controls.getByRole('slider',{name:'Preamplificazione'}).fill('-6');await controls.getByRole('slider',{name:'Bilanciamento'}).fill('0.5');
  expect(playbacks).toBe(1);
  await toggle.click();await expect(mids).toBeDisabled();await toggle.click();await expect(mids).toHaveValue('-2.5');
  await page.keyboard.press('Escape');await page.getByRole('button',{name:'Pausa',exact:true}).click();await page.reload();
  await page.getByRole('button',{name:'Impostazioni',exact:true}).click();
  await expect(toggle).toHaveAttribute('aria-checked','true');await expect(mids).toHaveValue('-2.5');await expect(controls.getByRole('slider',{name:'Preamplificazione'})).toHaveValue('-6');await expect(controls.getByRole('slider',{name:'Bilanciamento'})).toHaveValue('0.5');
  await controls.getByRole('button',{name:'Azzera regolazioni'}).click();await expect(controls.getByLabel('Preset',{exact:true})).toHaveValue('flat');await expect(mids).toHaveValue('0');
  await page.keyboard.press('Escape');await page.getByRole('button',{name:'Riproduci',exact:true}).click();
  await expect(page.locator('.player-error')).not.toBeVisible();await expect.poll(async()=>Number(await page.getByRole('slider',{name:'Posizione del brano'}).inputValue())).toBeGreaterThan(.2);
});

test('audio settings fit desktop, compact, light and reduced-motion keyboard paths',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Impostazioni',exact:true}).click();
  const controls=page.getByRole('region',{name:'Il tuo suono',exact:true});await controls.getByRole('switch').click();await controls.getByLabel('Preset',{exact:true}).selectOption('detail');
  // Show both endpoints and intermediate positions in the same visual inspection.
  for(const [i,input] of (await controls.locator('.audio-bands input').all()).entries())await input.fill(String(-12+i*6));
  await controls.getByRole('slider',{name:'Preamplificazione'}).fill('3');await controls.getByRole('slider',{name:'Bilanciamento'}).fill('0.5');
  const capture=async(path:string)=>{await controls.scrollIntoViewIfNeeded();await page.evaluate(()=>document.fonts.ready);await expect.poll(()=>page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running'&&a.effect?.getComputedTiming().iterations!==Infinity).length)).toBe(0);await page.screenshot({path});};
  await capture('data/analysis/audio-bars-desktop.png');
  await page.setViewportSize({width:390,height:844});await capture('data/analysis/audio-bars-compact.png');
  for(const input of await controls.getByRole('slider').all()){const box=(await input.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(390);}
  expect(await controls.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.setViewportSize({width:1440,height:940});await page.getByRole('button',{name:'Scuro',exact:true}).click();await capture('data/analysis/audio-bars-light.png');
  await expect(controls.getByLabel('Preset',{exact:true})).toHaveCSS('color','rgb(37, 36, 43)');
  await page.emulateMedia({reducedMotion:'reduce'});const toggle=controls.getByRole('switch');await toggle.focus();await page.keyboard.press('Space');await expect(toggle).toHaveAttribute('aria-checked','false');
  await expect(toggle.locator('span')).toHaveCSS('transition-duration','0s');await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Impostazioni',exact:true})).toBeFocused();
});

test('listening exclusions skip the playing track, remain in the queue, and restore after restart',async({page})=>{
  await page.goto('/');await page.getByRole('textbox',{name:'Cerca musica'}).fill('Musica test');
  const first=page.locator('.tracks .track-row').first();
  await first.getByRole('button',{name:'Riproduci Secondo brano',exact:true}).click();
  await expect(page.getByRole('button',{name:'Pausa',exact:true})).toBeVisible();
  const options=first.getByRole('button',{name:'Opzioni di ascolto: Secondo brano',exact:true});
  await options.focus();await page.keyboard.press('Enter');
  const popover=page.locator('.listening-options:popover-open');
  await expect(popover.getByRole('button',{name:'Non riprodurre questo brano',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');await expect(popover).toHaveCount(0);await expect(options).toBeFocused();
  await options.click();await popover.getByRole('button',{name:'Non riprodurre questo brano',exact:true}).click();
  await expect(page.locator('.player-track strong')).toHaveText('Primo & brano');
  await expect(first.getByText('Escluso',{exact:true})).toBeVisible();
  const excludedQueue=page.locator('.queue-row').filter({hasText:'Secondo brano'});
  await expect(excludedQueue.locator('.queue-title')).toBeDisabled();
  await page.getByRole('button',{name:'Pausa',exact:true}).click();await page.reload();
  await page.getByRole('button',{name:'Impostazioni',exact:true}).click();
  const region=page.getByRole('region',{name:'Brani e artisti esclusi',exact:true});
  await expect(region.getByText('Secondo brano',{exact:true})).toBeVisible();
  await region.getByRole('button',{name:'Riattiva Secondo brano',exact:true}).click();
  await expect(region.getByText(/Nessuna esclusione/)).toBeVisible();await page.keyboard.press('Escape');
  await expect(excludedQueue.locator('.queue-title')).toBeEnabled();
});

test('artist exclusions stop all matching tracks, and options/settings fit desktop, compact and light themes',async({page})=>{
  await page.goto('/');await page.getByRole('textbox',{name:'Cerca musica'}).fill('Musica test');
  const rows=page.locator('.tracks .track-row');await expect(rows).toHaveCount(2);
  await rows.first().getByRole('button',{name:'Riproduci Secondo brano',exact:true}).click();
  await page.getByRole('button',{name:'Pausa',exact:true}).click();
  const options=rows.first().getByRole('button',{name:'Opzioni di ascolto: Secondo brano',exact:true});
  const menu=page.locator('.listening-options:popover-open');
  const capture=async(path:string)=>{await page.evaluate(()=>document.fonts.ready);await expect.poll(()=>page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running'&&a.effect?.getComputedTiming().iterations!==Infinity).length)).toBe(0);await page.screenshot({path});};
  await options.click();
  await capture('data/analysis/listening-options-desktop.png');
  await page.setViewportSize({width:390,height:844});
  await capture('data/analysis/listening-options-compact.png');
  const box=(await menu.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(390);
  await menu.getByRole('button',{name:'Non riprodurre: Artista test',exact:true}).click();
  await expect(page.locator('.player-track strong')).toHaveText('Scegli il tuo primo brano');
  await expect(page.getByRole('button',{name:'Riproduci',exact:true})).toBeDisabled();
  await expect(rows.locator('.excluded-badge')).toHaveCount(2);
  await page.getByRole('button',{name:'Impostazioni',exact:true}).click();
  const region=page.getByRole('region',{name:'Brani e artisti esclusi',exact:true});
  await region.scrollIntoViewIfNeeded();await capture('data/analysis/listening-settings-compact.png');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.setViewportSize({width:1440,height:940});await capture('data/analysis/listening-settings-desktop.png');
  await page.getByRole('button',{name:'Scuro',exact:true}).click();await capture('data/analysis/listening-settings-light.png');
  await expect(region.getByRole('button',{name:'Riattiva Artista test',exact:true})).toHaveCSS('color','rgb(37, 36, 43)');
  await region.getByRole('button',{name:'Riattiva Artista test',exact:true}).click();
  await page.keyboard.press('Escape');await options.click();await capture('data/analysis/listening-options-light.png');
  await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Riproduci',exact:true})).toBeEnabled();
});

test('shuffle controls persist and upcoming follows the actual path when Next and Previous are used',async({page})=>{
  await page.goto('/');await page.getByRole('textbox',{name:'Cerca musica'}).fill('Musica test');
  await page.getByRole('button',{name:'Riproduci Secondo brano',exact:true}).click();
  await page.getByRole('button',{name:'Riproduzione casuale',exact:true}).click();
  await page.getByRole('button',{name:'Mostra in riproduzione',exact:true}).click();
  await expect(page.locator('.up-next-track strong')).toHaveText('Primo & brano');
  await page.getByRole('button',{name:'Brano successivo',exact:true}).click();
  await expect(page.locator('.player-track strong')).toHaveText('Primo & brano');
  await page.getByRole('button',{name:'Brano precedente',exact:true}).click();
  await expect(page.locator('.player-track strong')).toHaveText('Secondo brano');
  await expect(page.locator('.up-next-track strong')).toHaveText('Primo & brano');
  await page.getByRole('button',{name:'Pausa',exact:true}).click();await page.reload();
  await expect(page.getByRole('button',{name:'Riproduzione casuale',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Brano successivo',exact:true}).click();await expect(page.locator('.player-track strong')).toHaveText('Primo & brano');
  await page.getByRole('button',{name:'Brano successivo',exact:true}).click();await expect(page.getByRole('button',{name:'Riproduci',exact:true})).toBeVisible();
});

test('long exclusion names, exact-name fallback and narrow result rows remain operable',async({page})=>{
  const title='🎵 夜の音楽 — '.repeat(30),artist='Artista con un nome molto lungo '.repeat(12);
  await page.addInitScript(({title,artist})=>{localStorage.setItem('ritvio-player-v1',JSON.stringify({version:1,state:{exclusions:{tracks:[{videoId:'testmusic01',title,artist}],artists:[{id:'nome esatto',name:artist,match:'name'}]}}}));},{title,artist});
  await page.goto('/');await page.setViewportSize({width:320,height:700});
  await page.getByRole('button',{name:'Impostazioni',exact:true}).click();
  const region=page.getByRole('region',{name:'Brani e artisti esclusi',exact:true});
  await expect(region.getByText('Corrispondenza per nome esatto')).toBeVisible();
  for(const button of await region.getByRole('button').all()){await button.scrollIntoViewIfNeeded();const box=(await button.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(320);}
  expect(await page.getByRole('dialog').evaluate(dialog=>dialog.scrollWidth<=dialog.clientWidth+1)).toBe(true);
  await page.keyboard.press('Escape');
  if(await page.locator('#listening-panel').getAttribute('aria-hidden')==='false')await page.getByRole('button',{name:'Nascondi pannello',exact:true}).click();
  await page.getByRole('textbox',{name:'Cerca musica'}).fill('Musica test');
  await expect(page.locator('.tracks .track-row')).toHaveCount(2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('.tracks .track-row').first().getByRole('button',{name:'Opzioni di ascolto: Secondo brano',exact:true}).click();
  const menu=page.locator('.listening-options:popover-open');await expect(menu).toBeVisible();await page.keyboard.press('Escape');await expect(menu).toHaveCount(0);
});
test.beforeEach(async({page,request})=>{
  await request.post('http://127.0.0.1:5199/test-reset-library');
  page.on('pageerror',error=>console.error('[desktop fixture runtime error]',error.stack??error.message));
  page.on('requestfailed',request=>{if(['document','script','stylesheet'].includes(request.resourceType()))console.error('[desktop fixture load failure]',request.resourceType(),new URL(request.url()).pathname,request.failure()?.errorText);});
  await page.addInitScript(()=>{localStorage.setItem('ritvio.language.v1',JSON.stringify({schema:1,preference:'it'}));window.__RITVIO_TEST_CONFIG__={baseUrl:'http://127.0.0.1:5199',token:'test-token-only'};});
  await page.route('https://*.ytimg.com/**',route=>route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#c4b5fd"/></svg>'}));
});
test('desktop home and responsive queue remain usable',async({page})=>{
  await page.goto('/');await expect(page.getByRole('heading',{name:'La tua musica'})).toBeVisible();
  await page.screenshot({path:'data/analysis/mvp-home.png'});
  await page.setViewportSize({width:640,height:700});
  await page.getByRole('button',{name:'Mostra coda di riproduzione'}).click();
  await expect(page.getByText('La tua prossima sequenza')).toBeVisible();
  await page.screenshot({path:'data/analysis/mvp-compact.png'});
});

test('search genre suggestions stay inside their group and open the selected search',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/');
  await page.getByRole('button',{name:'Cerca',exact:true}).click();
  const suggestions=page.locator('.search-starts');
  await expect(suggestions.getByRole('button')).toHaveCount(4);
  const panel=page.locator('#listening-panel');
  if(await panel.getAttribute('aria-hidden')==='false')await panel.getByRole('button',{name:'Nascondi pannello',exact:true}).click();
  await expect(panel).toHaveAttribute('aria-hidden','true');
  for(const width of [1440,1060,640,390,320]){
    await page.setViewportSize({width,height:940});
    await page.evaluate(()=>document.fonts.ready);
    await expect(suggestions.getByRole('button',{name:'Elettronica',exact:true})).toBeInViewport();
    const geometry=await suggestions.evaluate(group=>{
      const bounds=group.getBoundingClientRect();
      const children=Array.from(group.querySelectorAll('button')).map(button=>{
        const rect=button.getBoundingClientRect();
        const icon=button.querySelector('svg')!.getBoundingClientRect();
        return {insideGroup:rect.left>=bounds.left-1&&rect.right<=bounds.right+1&&rect.top>=bounds.top-1&&rect.bottom<=bounds.bottom+1,insideViewport:rect.left>=0&&rect.right<=innerWidth,iconInside:icon.left>=rect.left&&icon.right<=rect.right+1,overflow:button.scrollWidth>button.clientWidth+1};
      });
      return {children,pageOverflow:document.documentElement.scrollWidth>innerWidth};
    });
    expect(geometry.pageOverflow,`Pagina a ${width}px`).toBe(false);
    for(const item of geometry.children){
      expect(item.insideGroup,`Genere dentro il gruppo a ${width}px`).toBe(true);
      expect(item.insideViewport,`Genere dentro la finestra a ${width}px`).toBe(true);
      expect(item.iconInside,`Freccia dentro il pulsante a ${width}px`).toBe(true);
      expect(item.overflow,`Testo del genere a ${width}px`).toBe(false);
    }
    if(width===1440||width===390)await page.screenshot({path:`data/analysis/search-genres-${width}.png`});
  }
  await suggestions.getByRole('button',{name:'Elettronica',exact:true}).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox',{name:'Cerca musica'})).toHaveValue('electronic music');
  await expect(page.locator('.tracks .track-row')).toHaveCount(2);
});

test('page history preserves the active audio and compact panel restores keyboard focus',async({page})=>{
  await page.goto('/');
  await page.getByRole('textbox',{name:'Cerca musica'}).fill('Musica test');
  await page.getByRole('button',{name:'Riproduci Secondo brano',exact:true}).click();
  await expect.poll(async()=>Number(await page.getByRole('slider',{name:'Posizione del brano'}).inputValue())).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Home',exact:true}).click();
  await page.getByRole('button',{name:'Indietro',exact:true}).click();
  await expect(page.locator('.tracks .track-row')).toHaveCount(2);
  await expect(page.getByRole('button',{name:'Pausa',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Avanti',exact:true}).click();
  await expect(page.getByRole('heading',{name:'La tua musica'})).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Mostra coda di riproduzione'}).click();
  const panel=page.getByRole('complementary',{name:'Pannello di riproduzione'});
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('button',{name:'In ascolto',exact:true})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'Mostra coda di riproduzione'})).toBeFocused();
  await expect(page.locator('#listening-panel')).toHaveAttribute('aria-hidden','true');
  await expect(page.getByRole('button',{name:'Pausa',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('completed searches are deduplicated, persisted and cleared without losing listening history',async({page})=>{
  await page.goto('/');
  const field=page.getByRole('textbox',{name:'Cerca musica'});
  await field.fill('Musica test');await expect(page.locator('.tracks .track-row')).toHaveCount(2);
  await field.fill('MUSICA  test');await expect(page.locator('.tracks .track-row')).toHaveCount(2);
  await page.getByRole('button',{name:'Riproduci Secondo brano',exact:true}).click();
  await expect.poll(async()=>Number(await page.getByRole('slider',{name:'Posizione del brano'}).inputValue())).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Pausa',exact:true}).click();
  await page.reload();await page.getByRole('button',{name:'Cerca',exact:true}).click();
  const history=page.getByRole('region',{name:'Ricerche recenti'});
  await expect(history.locator('.search-history-items button')).toHaveCount(1);
  await history.getByRole('button',{name:'MUSICA test',exact:true}).focus();await page.keyboard.press('Enter');
  await expect(field).toHaveValue('MUSICA test');await expect(page.locator('.tracks .track-row')).toHaveCount(2);
  await field.fill('mu');await expect(history.locator('.search-history-items button')).toHaveCount(1);
  await history.getByRole('button',{name:'Cancella le ricerche recenti',exact:true}).click();
  await page.reload();await page.getByRole('button',{name:'Cerca',exact:true}).click();
  await expect(history.locator('.search-history-items button')).toHaveCount(0);
  await expect(page.locator('.search-discovery .recent-card')).toHaveCount(1);
  await expect(page.locator('.player-track strong')).toHaveText('Secondo brano');
});

test('cover atmosphere samples readable artwork and safely recovers after a failed image',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.route('https://*.ytimg.com/**',route=>route.request().url().includes('testmusic01')?route.abort():route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*'},contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="#b6652d"/></svg>'}));
  await page.goto('/');await page.getByRole('textbox',{name:'Cerca musica'}).fill('Musica test');
  await page.getByRole('button',{name:'Riproduci Secondo brano',exact:true}).click();
  await page.getByRole('button',{name:'Mostra in riproduzione',exact:true}).click();
  const art=page.locator('.now-artwork');
  await expect(art).toHaveAttribute('data-atmosphere','cover');
  expect(await art.evaluate(element=>(element as HTMLElement).style.getPropertyValue('--artwork-tone'))).toBe('rgb(182, 101, 45)');
  await page.getByRole('button',{name:'Riproduci Primo & brano',exact:true}).first().click();
  await expect(art).toHaveAttribute('data-atmosphere','fallback');
  await expect(page.locator('.panel-body h2')).toHaveText('Primo & brano');
  await page.getByRole('button',{name:'Riproduci Secondo brano',exact:true}).first().click();
  await expect(art).toHaveAttribute('data-atmosphere','cover');
  await expect(art.locator('img')).toHaveCSS('opacity','1');
  await expect(art.locator('img')).toHaveCSS('object-fit','contain');
  expect(await art.evaluate(element=>element.getAnimations({subtree:true}).filter(animation=>animation.playState==='running').length)).toBe(0);
});

test('approved discovery and listening composition holds at desktop, light and compact sizes',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.setViewportSize({width:1586,height:992});
  await page.goto('/design-review.html');
  await page.getByRole('button',{name:'Mostra in riproduzione',exact:true}).click();
  await expect(page.locator('.panel-body h2')).toHaveText('Night Drive');
  await expect(page.locator('.recent-card')).toHaveCount(4);
  expect(await page.locator('.quick-track').evaluateAll(cards=>cards.every(card=>{
    const bounds=card.getBoundingClientRect(),caption=card.querySelector('.quick-caption')!.getBoundingClientRect();
    return caption.top>=bounds.top&&caption.bottom<=bounds.bottom+1&&caption.right<=bounds.right+1;
  }))).toBe(true);
  await page.evaluate(()=>document.fonts.ready);
  await expect.poll(()=>page.locator('.recent-card img').evaluateAll(images=>images.every(img=>(img as HTMLImageElement).complete&&(img as HTMLImageElement).naturalWidth>0))).toBe(true);
  const size=await page.locator('.recent-artwork').first().boundingBox();expect(Math.abs(size!.width-size!.height)).toBeLessThan(1);
  await page.screenshot({path:'data/analysis/discovery-home-desktop.png'});
  await page.getByRole('button',{name:'Cerca',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Scopri nuova musica',exact:true})).toBeVisible();
  await expect(page.locator('.genre-card')).toHaveCount(4);
  await page.screenshot({path:'data/analysis/discovery-search-desktop.png'});
  await page.setViewportSize({width:640,height:780});
  await page.getByRole('button',{name:'Nascondi pannello',exact:true}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const playerTop=(await page.locator('.playerbar').boundingBox())!.y;
  expect(await page.locator('.genre-card').evaluateAll((cards,top)=>cards.every(card=>card.getBoundingClientRect().bottom<=top),playerTop)).toBe(true);
  await page.screenshot({path:'data/analysis/discovery-search-compact.png'});
  await page.getByRole('button',{name:'Mostra in riproduzione',exact:true}).click();
  await page.screenshot({path:'data/analysis/discovery-listening-compact.png'});
  await page.getByRole('button',{name:'Nascondi pannello',exact:true}).click();
  await page.setViewportSize({width:1586,height:992});
  await page.getByRole('button',{name:'Impostazioni',exact:true}).click();
  await page.getByRole('button',{name:'Scuro',exact:true}).click();await page.keyboard.press('Escape');
  await expect(page.locator('.brand-mark')).toHaveCSS('color','rgb(114, 87, 184)');
  await page.screenshot({path:'data/analysis/discovery-search-light.png'});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'data/analysis/discovery-search-small.png'});
});
test('debounced search plays real synthetic audio, seeks, pauses and preserves queue on reload',async({page})=>{
  let searches=0;page.on('request',request=>{if(request.url().includes('/v1/search?'))searches++;});
  await page.goto('/');
  const field=page.getByRole('textbox',{name:'Cerca musica'});
  await field.fill('Mus');await field.fill('Musica');await field.fill('Musica test');
  await expect(page.locator('.tracks .track-row')).toHaveCount(2);expect(searches).toBe(1);
  await page.getByRole('button',{name:'Riproduci Secondo brano',exact:true}).click();
  await expect(page.getByRole('button',{name:'Pausa',exact:true})).toBeVisible();
  await expect.poll(async()=>Number(await page.getByRole('slider',{name:'Posizione del brano'}).inputValue())).toBeGreaterThan(0);
  await page.getByRole('slider',{name:'Posizione del brano'}).fill('6');
  await page.getByRole('button',{name:'Pausa',exact:true}).click();
  await expect(page.getByRole('button',{name:'Riproduci',exact:true})).toBeVisible();
  await expect.poll(async()=>Number(await page.getByRole('slider',{name:'Posizione del brano'}).inputValue())).toBeGreaterThanOrEqual(6);
  await page.getByRole('button',{name:'Mostra coda di riproduzione'}).click();
  await expect(page.locator('.queue-row')).toHaveCount(2);
  await page.getByRole('button',{name:'Modifica coda',exact:true}).click();
  await page.getByRole('button',{name:'Sposta su Primo & brano',exact:true}).click();
  await expect.poll(()=>page.evaluate(async()=>{const path='/src/store.ts';return (await import(path)).usePlayer.getState().queue[0].title;})).toBe('Primo & brano');
  await page.reload();await expect(page.locator('.player-track strong')).toHaveText('Secondo brano');
  await expect(page.getByRole('button',{name:'Riproduci',exact:true})).toBeVisible();
  await expect.poll(async()=>Number(await page.getByRole('slider',{name:'Posizione del brano'}).inputValue())).toBeGreaterThanOrEqual(6);
});
test('invalid links and busy resolver present actionable Italian states',async({page})=>{
  await page.goto('/');await page.getByRole('textbox',{name:'Link YouTube'}).fill('https://example.test/song');
  await page.getByRole('button',{name:'Apri e riproduci link'}).click();
  await expect(page.getByRole('alert')).toContainText('Inserisci un link YouTube valido');
  await page.route('**/v1/search?**',route=>route.fulfill({status:429,contentType:'application/json',body:JSON.stringify({error:{code:'RESOLVER_BUSY',message:'Il servizio musicale è occupato. Riprova tra poco.'}})}));
  await page.getByRole('textbox',{name:'Cerca musica'}).fill('resolver test');
  await expect(page.getByRole('alert')).toContainText('Il servizio musicale è occupato. Riprova tra poco.');
  await page.getByRole('button',{name:'Impostazioni',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button',{name:'Scuro',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
});

test('library supports favourites, playlist edits, duplicates, reorder and persistent custom cover',async({page})=>{
  await page.goto('/');await page.getByRole('textbox',{name:'Cerca musica'}).fill('Musica test');
  const rows=page.locator('.tracks .track-row');await expect(rows).toHaveCount(2);
  await rows.first().getByRole('button',{name:'Aggiungi ai brani piaciuti: Secondo brano',exact:true}).click();
  await expect(rows.first().getByRole('button',{name:'Rimuovi dai brani piaciuti: Secondo brano',exact:true})).toBeVisible();
  await rows.first().getByRole('button',{name:'Salva in playlist: Secondo brano',exact:true}).click();
  let dialog=page.getByRole('dialog');await dialog.getByRole('textbox',{name:'Nome nuova playlist'}).fill('La mia playlist');
  await dialog.getByRole('button',{name:'Crea e aggiungi'}).click();await expect(dialog).not.toBeVisible();
  await rows.last().getByRole('button',{name:'Salva in playlist: Primo & brano',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:/La mia playlist/}).click();await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button',{name:'La tua libreria',exact:true}).click();
  await expect(page.locator('.playlist-item')).toHaveCount(2);
  await page.getByRole('button',{name:'Sposta su Primo & brano',exact:true}).click();
  await expect(page.locator('.playlist-item').first()).toContainText('Primo & brano');
  await page.getByRole('button',{name:'Modifica',exact:true}).click();dialog=page.getByRole('dialog');
  await dialog.getByRole('textbox',{name:'Nome playlist'}).fill('Viaggio');await dialog.getByRole('textbox',{name:'Descrizione playlist'}).fill('Musica per la strada.');
  const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=32;const context=canvas.getContext('2d')!;context.fillStyle='#c4b5fd';context.fillRect(0,0,32,32);return canvas.toDataURL('image/png').split(',')[1];});
  await dialog.getByLabel('Scegli copertina',{exact:true}).setInputFiles({name:'copertina.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await expect(dialog.getByRole('button',{name:'Rimuovi immagine'})).toBeVisible();
  await dialog.getByRole('button',{name:'Salva modifiche'}).click();await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('heading',{name:'Viaggio',exact:true}).first()).toBeVisible();
  await expect(page.locator('.playlist-hero .playlist-cover.custom img')).toBeVisible();
  await page.screenshot({path:'data/analysis/fase3-playlist.png'});
  await page.reload();await page.getByRole('button',{name:'Viaggio',exact:true}).click();
  await expect(page.locator('.playlist-item')).toHaveCount(2);await expect(page.getByText('Musica per la strada.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Rimuovi dalla playlist: Primo & brano',exact:true}).click();await expect(page.locator('.playlist-item')).toHaveCount(1);
  await page.getByRole('button',{name:'Elimina playlist',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Annulla',exact:true}).click();
  await expect(page.locator('.playlist-item')).toHaveCount(1);
  await page.getByRole('button',{name:'Elimina playlist',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Elimina definitivamente'}).click();
  await expect(page.getByText('Una playlist tutta tua.',{exact:true})).toBeVisible();
  await page.getByRole('tab',{name:'Preferiti',exact:true}).click();await expect(page.locator('.library-track')).toHaveCount(1);
  await page.locator('.library-track').getByRole('button',{name:'Rimuovi dai brani piaciuti: Secondo brano',exact:true}).click();await expect(page.getByText('Tieni vicino quello che ami.')).toBeVisible();
});

test('local profile, followed resources and real listen history can be edited and cleared',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Il tuo profilo',exact:true}).click();
  await page.getByRole('dialog').getByRole('textbox',{name:'Nome visualizzato'}).fill('Alex');
  await page.getByRole('dialog').getByRole('button',{name:'Salva profilo'}).click();await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('textbox',{name:'Cerca musica'}).fill('Musica test');
  await page.getByRole('button',{name:'Riproduci Secondo brano',exact:true}).click();
  await expect.poll(async()=>Number(await page.getByRole('slider',{name:'Posizione del brano'}).inputValue())).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Pausa',exact:true}).click();
  await page.getByRole('button',{name:'Mostra in riproduzione',exact:true}).click();
  await page.getByRole('button',{name:'Segui artista: Artista test',exact:true}).click();
  await expect(page.getByRole('button',{name:'Segui già artista: Artista test',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Segui album: Album test 1',exact:true}).click();
  await expect(page.getByRole('button',{name:'Segui già album: Album test 1',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'La tua libreria',exact:true}).click();
  await expect(page.getByText('Alex · SALVATO SU QUESTO PC',{exact:true})).toBeVisible();
  await page.getByRole('tab',{name:'Artisti seguiti'}).click();await expect(page.locator('.follow-card')).toContainText('Artista test');
  await page.getByRole('tab',{name:'Album seguiti'}).click();await expect(page.locator('.follow-card')).toContainText('Album test 1');
  await page.getByRole('tab',{name:'Cronologia',exact:true}).click();await expect(page.locator('.history-entry')).toHaveCount(1);
  await page.getByRole('button',{name:'Cancella cronologia',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Cancella cronologia',exact:true}).click();
  await expect(page.getByText('La tua storia comincia con Play.',{exact:true})).toBeVisible();
  await page.reload();await page.getByRole('button',{name:'Il tuo profilo',exact:true}).click();
  await expect(page.getByRole('dialog').getByRole('textbox',{name:'Nome visualizzato'})).toHaveValue('Alex');
});

test('playlist files can be exported, previewed, renamed and imported as distinct private copies',async({page})=>{
  await page.goto('/');await page.getByRole('textbox',{name:'Cerca musica'}).fill('Musica test');
  const rows=page.locator('.tracks .track-row');await expect(rows).toHaveCount(2);
  await rows.first().getByRole('button',{name:'Salva in playlist: Secondo brano',exact:true}).click();
  await page.getByRole('dialog').getByRole('textbox',{name:'Nome nuova playlist'}).fill('Scambio file');
  await page.getByRole('dialog').getByRole('button',{name:'Crea e aggiungi'}).click();await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button',{name:'La tua libreria',exact:true}).click();await expect(page.locator('.playlist-item')).toHaveCount(1);
  const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Esporta playlist',exact:true}).click();
  const download=await downloadEvent;expect(download.suggestedFilename()).toBe('Scambio file.ritvio.json');
  const filename=await download.path();expect(filename).toBeTruthy();
  await page.getByLabel('File playlist RITVIO',{exact:true}).setInputFiles(filename!);
  const dialog=page.getByRole('dialog');await expect(dialog.getByRole('heading',{name:'Importa playlist',exact:true})).toBeVisible();
  await expect(dialog.locator('.import-tracks')).toContainText('Secondo brano');
  await dialog.getByRole('textbox',{name:'Nome playlist importata'}).fill('Copia ricevuta');
  await dialog.getByRole('button',{name:'Importa come nuova playlist'}).click();await expect(dialog).not.toBeVisible();
  await expect(page.locator('.playlist-hero')).toContainText('Copia ricevuta');await expect(page.locator('.playlist-item')).toHaveCount(1);
  await page.getByRole('button',{name:'Torna alla libreria',exact:true}).click();await expect(page.locator('.playlist-card')).toHaveCount(2);
  await page.getByLabel('File playlist RITVIO',{exact:true}).setInputFiles({name:'nonvalido.json',mimeType:'application/json',buffer:Buffer.from('{"format":"fake"}')});
  await expect(page.getByRole('alert')).toContainText('Formato della playlist non supportato');
  await expect(page.locator('.playlist-card')).toHaveCount(2);
  await page.screenshot({path:'data/analysis/fase4-condivisione.png'});
});

test('track sharing copies a canonical RITVIO reference',async({page,context})=>{
  await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:'http://127.0.0.1:5173'});
  await page.goto('/');await page.getByRole('textbox',{name:'Cerca musica'}).fill('Musica test');
  const row=page.locator('.tracks .track-row').first();await expect(row).toContainText('Secondo brano');
  await row.getByRole('button',{name:'Opzioni di ascolto: Secondo brano',exact:true}).click();
  const menu=page.locator('.listening-options:popover-open');await menu.getByRole('button',{name:'Copia link RITVIO: Secondo brano',exact:true}).click();
  await expect.poll(()=>page.evaluate(async()=>new URL(await navigator.clipboard.readText()).origin+new URL(await navigator.clipboard.readText()).pathname)).toBe('https://salvo13200.github.io/RITVIO/');
  expect(new URLSearchParams(new URL(await page.evaluate(()=>navigator.clipboard.readText())).hash.slice(1)).get('track')).toBe('testmusic02');
  await expect(menu.getByRole('status')).toContainText('Link copiato');
});

test('pause and resume reuse the stream and do not count another listen',async({page})=>{
  let calls=0;page.on('request',request=>{if(request.url().includes('/v1/media/')&&request.url().includes('/playback')&&!request.url().includes('prepare=true'))calls++;});
  await page.goto('/');await page.getByRole('textbox',{name:'Cerca musica'}).fill('Musica test');
  await page.getByRole('button',{name:'Riproduci Secondo brano',exact:true}).click();
  const position=page.getByRole('slider',{name:'Posizione del brano'});
  await expect.poll(async()=>Number(await position.inputValue())).toBeGreaterThan(0);
  await position.fill('6');await page.getByRole('button',{name:'Pausa',exact:true}).click();
  expect(calls).toBe(1);await page.getByRole('button',{name:'Riproduci',exact:true}).click();
  await expect.poll(async()=>Number(await position.inputValue())).toBeGreaterThanOrEqual(6.5);
  expect(calls).toBe(1);await page.getByRole('button',{name:'Pausa',exact:true}).click();
  await page.getByRole('button',{name:'La tua libreria',exact:true}).click();await page.getByRole('tab',{name:'Cronologia',exact:true}).click();
  await expect(page.locator('.history-entry')).toHaveCount(1);
});

test('invalid audio refreshes once and playback starts without duplicate history',async({page})=>{
  const calls:string[]=[];
  await page.route('**/v1/media/*/playback**',async route=>{
    if(route.request().url().includes('prepare=true'))return route.continue();
    calls.push(route.request().url());const response=await route.fetch();const descriptor=await response.json();
    if(calls.length===1)descriptor.url='http://127.0.0.1:5199/missing-tone.wav';
    await route.fulfill({response,json:descriptor});
  });
  await page.goto('/');await page.getByRole('textbox',{name:'Cerca musica'}).fill('Musica test');
  await page.getByRole('button',{name:'Riproduci Secondo brano',exact:true}).click();
  await expect.poll(async()=>Number(await page.getByRole('slider',{name:'Posizione del brano'}).inputValue())).toBeGreaterThan(0);
  expect(calls).toHaveLength(2);expect(calls[1]).toContain('fresh=true');await expect(page.locator('.player-error')).not.toBeVisible();
  await page.getByRole('button',{name:'Pausa',exact:true}).click();await page.getByRole('button',{name:'La tua libreria',exact:true}).click();
  await page.getByRole('tab',{name:'Cronologia',exact:true}).click();await expect(page.locator('.history-entry')).toHaveCount(1);
});

test('keyboard navigation, dialogs and light theme remain usable in compact layout',async({page})=>{
  await page.goto('/');await page.keyboard.press('Tab');await expect(page.getByRole('link',{name:'Vai al contenuto'})).toBeFocused();
  await page.keyboard.press('Enter');await expect(page.locator('main')).toBeFocused();
  await page.getByRole('button',{name:'La tua libreria',exact:true}).click();const first=page.getByRole('tab',{name:'Playlist',exact:true});
  await first.focus();await page.keyboard.press('ArrowRight');const liked=page.getByRole('tab',{name:'Preferiti',exact:true});
  await expect(liked).toBeFocused();await expect(liked).toHaveAttribute('aria-selected','true');
  await page.keyboard.press('End');await expect(page.getByRole('tab',{name:'Cronologia',exact:true})).toBeFocused();
  await page.keyboard.press('Home');await expect(first).toBeFocused();
  await page.getByRole('button',{name:'Impostazioni',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Il tuo RITVIO',exact:true});
  await expect(dialog).toBeVisible();await page.keyboard.press('Control+k');await expect(dialog).toBeVisible();
  expect(await page.evaluate(()=>!!document.activeElement?.closest('dialog'))).toBe(true);
  await dialog.getByRole('button',{name:'Scuro',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(page.getByRole('button',{name:'Impostazioni',exact:true})).toBeFocused();
  await page.setViewportSize({width:640,height:700});if(await page.locator('.now-panel').isVisible())await page.getByRole('button',{name:'Nascondi pannello',exact:true}).click();await expect(page.getByRole('button',{name:'Il tuo profilo',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Mostra coda di riproduzione',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  const timeline=await page.locator('.timeline').boundingBox();expect(timeline!.width).toBeGreaterThan(400);await page.getByRole('button',{name:'Il tuo profilo',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await page.screenshot({path:'data/analysis/fase5-compatto-chiaro.png'});
});

test('rapid track changes discard an obsolete playback response',async({page})=>{
  let release!:()=>void;const delayed=new Promise<void>(resolve=>release=resolve);let calls=0;
  await page.route('**/v1/media/*/playback**',async route=>{
    if(route.request().url().includes('prepare=true'))return route.continue();
    const order=++calls;const response=await route.fetch();if(order===1)await delayed;
    await route.fulfill({response}).catch(()=>{});
  });
  await page.goto('/');await page.getByRole('textbox',{name:'Cerca musica'}).fill('Musica test');
  await page.getByRole('button',{name:'Riproduci Secondo brano',exact:true}).click();await expect.poll(()=>calls).toBe(1);
  await page.locator('main').getByRole('button',{name:'Riproduci Primo & brano',exact:true}).click();await expect.poll(()=>calls).toBe(2);
  release();await expect(page.locator('.player-track strong')).toHaveText('Primo & brano');
  await expect.poll(async()=>Number(await page.getByRole('slider',{name:'Posizione del brano'}).inputValue())).toBeGreaterThan(0);
  await expect(page.locator('.player-error')).not.toBeVisible();
});

test('expired stream is renewed at resume and a failed renewal stops retries',async({page})=>{
  let calls=0;let broken=false;const urls:string[]=[];
  const playingAt=(position:number)=>expect.poll(()=>page.evaluate(async minimum=>{
    const module='/src/player.tsx',audio=(await import(module)).audio;
    return !audio.paused&&!audio.seeking&&audio.readyState>=3&&audio.currentTime>=minimum;
  },position)).toBe(true);
  await page.route('**/v1/media/*/playback**',async route=>{
    if(route.request().url().includes('prepare=true'))return route.continue();
    const order=++calls;urls.push(route.request().url());const response=await route.fetch();const descriptor=await response.json();
    // Exercise an asynchronous renewal: observing a request or the stored seek
    // target alone must not let the test pause/cancel the pending resource.
    if(order===2)await new Promise(resolve=>setTimeout(resolve,150));
    descriptor.expiresAt=new Date(Date.now()-1000).toISOString();if(broken)descriptor.url='http://127.0.0.1:5199/missing-tone.wav';
    await route.fulfill({response,json:descriptor});
  });
  await page.goto('/');await page.getByRole('textbox',{name:'Cerca musica'}).fill('Musica test');
  await page.getByRole('button',{name:'Riproduci Secondo brano',exact:true}).click();
  const position=page.getByRole('slider',{name:'Posizione del brano'});await expect.poll(async()=>Number(await position.inputValue())).toBeGreaterThan(0);
  await position.fill('5');await playingAt(5);await page.getByRole('button',{name:'Pausa',exact:true}).click();await page.getByRole('button',{name:'Riproduci',exact:true}).click();
  await expect.poll(()=>calls).toBe(2);expect(urls[1]).toContain('fresh=true');await playingAt(5.1);
  await page.getByRole('button',{name:'Pausa',exact:true}).click();broken=true;
  await page.getByRole('button',{name:'Riproduci',exact:true}).click();await expect(page.locator('.player-error')).toContainText('Il flusso audio non è riproducibile');
  expect(calls).toBe(3);await expect(page.getByRole('button',{name:'Riproduci',exact:true})).toBeVisible();
});

test('ending the queue pauses and playing again restarts the final track',async({page})=>{
  await page.goto('/');await page.getByRole('textbox',{name:'Cerca musica'}).fill('Musica test');
  await page.getByRole('button',{name:'Riproduci Primo & brano',exact:true}).click();
  const position=page.getByRole('slider',{name:'Posizione del brano'});await expect.poll(async()=>Number(await position.inputValue())).toBeGreaterThan(0);
  await position.fill('11');await expect(page.getByRole('button',{name:'Riproduci',exact:true})).toBeVisible();
  await expect.poll(async()=>Number(await position.inputValue())).toBe(12);
  await page.getByRole('button',{name:'Riproduci',exact:true}).click();await expect(page.getByRole('button',{name:'Pausa',exact:true})).toBeVisible();
  await expect.poll(async()=>{const value=Number(await position.inputValue());return value>0&&value<5;}).toBe(true);
});

test('personal home shortcuts open favourites and playlists and resume without replacing the queue',async({page})=>{
  let playbacks=0;page.on('request',request=>{if(request.url().includes('/v1/media/')&&request.url().includes('/playback')&&!request.url().includes('prepare=true'))playbacks++;});
  await page.goto('/');await page.getByRole('textbox',{name:'Cerca musica'}).fill('Musica test');
  const row=page.locator('.tracks .track-row').first();await expect(row).toBeVisible();
  await row.getByRole('button',{name:'Aggiungi ai brani piaciuti: Secondo brano',exact:true}).click();
  await row.getByRole('button',{name:'Salva in playlist: Secondo brano',exact:true}).click();
  await page.getByRole('dialog').getByRole('textbox',{name:'Nome nuova playlist'}).fill('In cuffia');
  await page.getByRole('dialog').getByRole('button',{name:'Crea e aggiungi'}).click();await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button',{name:'Riproduci Secondo brano',exact:true}).click();
  const seek=page.getByRole('slider',{name:'Posizione del brano'});await expect.poll(async()=>Number(await seek.inputValue())).toBeGreaterThan(0);
  await seek.fill('6');await page.getByRole('button',{name:'Pausa',exact:true}).click();
  await page.getByRole('button',{name:'Home',exact:true}).click();
  await expect(page.locator('.home-playlist')).toContainText('In cuffia');await expect(page.locator('.favourites-card')).toContainText('1 brano');
  await page.getByRole('button',{name:'Continua ad ascoltare',exact:true}).click();
  await expect.poll(async()=>Number(await seek.inputValue())).toBeGreaterThan(6);expect(playbacks).toBe(1);
  await page.getByRole('button',{name:'Pausa',exact:true}).click();
  await page.locator('.home-playlist').click();await expect(page.locator('.playlist-hero')).toContainText('In cuffia');
  await page.getByRole('button',{name:'La tua libreria',exact:true}).click();await page.getByRole('tab',{name:'Preferiti',exact:true}).click();
  await expect(page.getByRole('tab',{name:'Preferiti',exact:true})).toHaveAttribute('aria-selected','true');await expect(page.locator('.playlist-hero')).not.toBeVisible();
  await page.getByRole('button',{name:'Home',exact:true}).click();await page.locator('.favourites-card').click();
  await expect(page.getByRole('tab',{name:'Preferiti',exact:true})).toHaveAttribute('aria-selected','true');
  await page.getByRole('button',{name:'Home',exact:true}).click();await page.getByRole('button',{name:'Mostra coda di riproduzione',exact:true}).click();
  await expect(page.locator('.queue-row')).toHaveCount(2);
  await page.screenshot({path:'data/analysis/fase5-1-home-personale.png'});
});

test('now panel can be reopened in compact windows and discovery starts a real search',async({page})=>{
  await page.setViewportSize({width:900,height:760});await page.goto('/');
  await expect(page.locator('.now-panel')).not.toBeVisible();
  await page.getByRole('button',{name:'Mostra in riproduzione',exact:true}).click();await expect(page.locator('.now-panel')).toBeVisible();
  await page.getByRole('button',{name:'Nascondi pannello',exact:true}).click();await expect(page.locator('.now-panel')).not.toBeVisible();
  await page.getByRole('button',{name:'Mostra in riproduzione',exact:true}).click();await expect(page.locator('.now-panel')).toBeVisible();
  await page.getByRole('button',{name:'Nascondi pannello',exact:true}).click();
  await page.locator('.category').filter({hasText:'Jazz'}).click();
  await expect(page.getByRole('textbox',{name:'Cerca musica'})).toHaveValue('jazz music');await expect(page.locator('.tracks .track-row')).toHaveCount(2);
  await page.getByRole('button',{name:'Riproduci Secondo brano',exact:true}).click();await page.getByRole('button',{name:'Mostra in riproduzione',exact:true}).click();
  await expect(page.locator('.panel-body h2')).toHaveText('Secondo brano');
  await page.getByRole('button',{name:'Nascondi pannello',exact:true}).click();
  await page.screenshot({path:'data/analysis/fase5-1-ricerca.png'});
  await page.setViewportSize({width:480,height:760});
  for(const name of ['Pausa','Mostra in riproduzione','Mostra coda di riproduzione','Disattiva audio']){
    const button=page.getByRole('button',{name,exact:true});await expect(button).toBeVisible();const box=await button.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(480);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Mostra in riproduzione',exact:true}).click();await expect(page.locator('.panel-body h2')).toHaveText('Secondo brano');
  await page.screenshot({path:'data/analysis/fase5-1-compatto.png'});
});

test('sidebar playlist remains clickable with recents in a short desktop window',async({page})=>{
  await page.setViewportSize({width:1440,height:600});await page.goto('/');
  await page.getByRole('textbox',{name:'Cerca musica'}).fill('Musica test');
  await expect(page.locator('.tracks .track-row')).toHaveCount(2);
  await page.getByRole('button',{name:'Riproduci Secondo brano',exact:true}).click();
  await expect.poll(async()=>Number(await page.getByRole('slider',{name:'Posizione del brano'}).inputValue())).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Riproduci Primo & brano',exact:true}).click();
  await expect.poll(async()=>Number(await page.getByRole('slider',{name:'Posizione del brano'}).inputValue())).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Pausa',exact:true}).click();
  await page.locator('.tracks .track-row').first().getByRole('button',{name:'Salva in playlist: Secondo brano',exact:true}).click();
  await page.getByRole('dialog').getByRole('textbox',{name:'Nome nuova playlist'}).fill('Scorrimento sidebar');
  await page.getByRole('dialog').getByRole('button',{name:'Crea e aggiungi'}).click();await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button',{name:'Home',exact:true}).click();
  await page.locator('.sidebar-playlists').getByRole('button',{name:'Scorrimento sidebar',exact:true}).click();
  await expect(page.locator('.playlist-hero')).toContainText('Scorrimento sidebar');
  expect(await page.locator('.sidebar-playlists').evaluate(element=>element.getBoundingClientRect().height)).toBeGreaterThan(30);
});

test('rapid navigation and panel toggles leave content and dialogs interactive',async({page})=>{
  await page.goto('/');await expect(page.getByRole('heading',{name:'La tua musica'})).toBeVisible();
  await page.screenshot({animations:'disabled',path:'data/analysis/minimal-home-scuro.png'});
  await page.locator('.home-discovery').scrollIntoViewIfNeeded();
  await page.screenshot({animations:'disabled',path:'data/analysis/studio-home-generi.png'});
  await page.getByRole('heading',{name:'La tua musica'}).scrollIntoViewIfNeeded();
  for(let i=0;i<3;i++){
    await page.getByRole('button',{name:'La tua libreria',exact:true}).click();
    await page.getByRole('button',{name:'Home',exact:true}).click();
    await page.getByRole('button',{name:'Mostra coda di riproduzione',exact:true}).click();
    await page.getByRole('button',{name:'Nascondi pannello',exact:true}).click();
    await expect(page.getByRole('button',{name:'Mostra coda di riproduzione',exact:true})).toBeFocused();
    await page.getByRole('button',{name:'Mostra in riproduzione',exact:true}).click();
  }
  await page.getByRole('button',{name:'Nascondi pannello',exact:true}).click();
  await page.getByRole('button',{name:'Impostazioni',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Il tuo RITVIO',exact:true});
  await expect(dialog).toBeVisible();await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();await expect(page.getByRole('button',{name:'Impostazioni',exact:true})).toBeFocused();
  await page.getByRole('textbox',{name:'Cerca musica'}).fill('Musica test');
  await expect(page.locator('.tracks .track-row')).toHaveCount(2);
  await page.getByRole('button',{name:'Riproduci Secondo brano',exact:true}).click();
  await expect.poll(async()=>Number(await page.getByRole('slider',{name:'Posizione del brano'}).inputValue())).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Pausa',exact:true}).click();
  await expect(page.getByRole('button',{name:'Riproduci',exact:true})).toBeVisible();
  expect(await page.locator('.panel-slot').evaluate(element=>element.hasAttribute('inert'))).toBe(true);
  await page.getByRole('button',{name:'Home',exact:true}).click();await page.getByRole('button',{name:'Mostra in riproduzione',exact:true}).click();
  await page.screenshot({animations:'disabled',path:'data/analysis/minimal-home-con-brano.png'});
});

test('reduced motion preserves keyboard dialogs, tabs, playback and compact controls',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
  await page.getByRole('button',{name:'Impostazioni',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Il tuo RITVIO',exact:true});
  await dialog.getByRole('button',{name:'Scuro',exact:true}).click();
  await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button',{name:'Impostazioni',exact:true})).toBeFocused();
  await page.screenshot({animations:'disabled',path:'data/analysis/minimal-home-chiaro.png'});
  await page.getByRole('button',{name:'La tua libreria',exact:true}).click();
  await page.getByRole('tab',{name:'Playlist',exact:true}).focus();await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab',{name:'Preferiti',exact:true})).toBeFocused();
  await page.getByRole('textbox',{name:'Cerca musica'}).fill('Musica test');
  await page.getByRole('button',{name:'Riproduci Secondo brano',exact:true}).click();
  await expect.poll(async()=>Number(await page.getByRole('slider',{name:'Posizione del brano'}).inputValue())).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Pausa',exact:true}).click();await page.setViewportSize({width:640,height:700});
  await page.getByRole('button',{name:'Mostra coda di riproduzione',exact:true}).click();
  await expect(page.locator('.queue-row')).toHaveCount(2);
  await page.getByRole('button',{name:'Sposta su Primo & brano',exact:true}).click();
  await expect(page.locator('.queue-row').first()).toContainText('Primo & brano');
  await page.getByRole('button',{name:'Nascondi pannello',exact:true}).click();
  await page.getByRole('button',{name:'Home',exact:true}).click();
  await expect(page.getByRole('heading',{name:'La tua musica'})).toBeVisible();
  expect(await page.evaluate(()=>document.getAnimations().some(animation=>animation.playState==='running'))).toBe(false);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({animations:'disabled',path:'data/analysis/minimal-compatto-chiaro.png'});
});

test('wave controls animate during playback and preserve native seek, drag, keyboard and mute',async({page})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});await page.goto('/');
  await page.getByRole('textbox',{name:'Cerca musica'}).fill('Musica test');
  await page.getByRole('button',{name:'Riproduci Secondo brano',exact:true}).click();
  const seek=page.getByRole('slider',{name:'Posizione del brano',exact:true});
  const volume=page.getByRole('slider',{name:'Volume',exact:true});
  const timeline=page.locator('.wave-timeline');const volumeWave=page.locator('.player-extras .wave-volume');
  await expect.poll(async()=>Number(await seek.inputValue())).toBeGreaterThan(0);
  await expect(timeline).toHaveAttribute('data-animated','true');await expect(volumeWave).toHaveAttribute('data-animated','false');
  const flow=timeline.locator('.wave-flow').first();const before=await flow.evaluate(element=>getComputedStyle(element).transform);
  await expect.poll(()=>flow.evaluate(element=>getComputedStyle(element).transform)).not.toBe(before);
  const seekBox=await seek.boundingBox();await seek.click({position:{x:seekBox!.width*.25,y:seekBox!.height/2}});
  await expect.poll(async()=>Number(await seek.inputValue())).toBeGreaterThanOrEqual(2);
  await expect.poll(async()=>Number(await seek.inputValue())).toBeLessThan(6);
  const volumeBox=await volume.boundingBox();await volume.click({position:{x:volumeBox!.width*.75,y:volumeBox!.height/2}});
  const clicked=Number(await volume.inputValue());expect(clicked).toBeGreaterThan(.6);expect(clicked).toBeLessThan(.9);
  await page.mouse.move(volumeBox!.x+6+(volumeBox!.width-12)*clicked,volumeBox!.y+volumeBox!.height/2);
  await page.mouse.down();await page.mouse.move(volumeBox!.x+6+(volumeBox!.width-12)*.4,volumeBox!.y+volumeBox!.height/2,{steps:5});await page.mouse.up();
  expect(Number(await volume.inputValue())).toBeCloseTo(.4,1);await expect(volumeWave).toHaveAttribute('data-dragging','false');
  await page.getByRole('button',{name:'Pausa',exact:true}).click();
  await expect(timeline).toHaveAttribute('data-animated','false');await expect(volumeWave).toHaveAttribute('data-animated','false');
  await seek.focus();const paused=Number(await seek.inputValue());await page.keyboard.press('ArrowRight');await expect(seek).toHaveValue(String(paused+1));
  await volume.focus();const previous=Number(await volume.inputValue());await page.keyboard.press('ArrowRight');
  expect(Number(await volume.inputValue())).toBeCloseTo(previous+.01,2);
  await expect(volume).toHaveAttribute('aria-valuetext',`${Math.round(Number(await volume.inputValue())*100)}%`);
  await page.getByRole('button',{name:'Riproduci',exact:true}).click();await expect(timeline).toHaveAttribute('data-animated','true');
  await page.getByRole('button',{name:'Disattiva audio',exact:true}).click();
  await expect(timeline).toHaveAttribute('data-animated','false');await expect(volumeWave).toHaveAttribute('data-animated','false');
  await expect(volume).toHaveAttribute('aria-valuetext',/audio disattivato/);
  await page.getByRole('button',{name:'Attiva audio',exact:true}).click();await expect(volumeWave).toHaveAttribute('data-animated','false');
  await page.screenshot({path:'data/analysis/wave-player-scuro.png'});
});

test('wave controls stay accessible without motion, in light theme and compact settings',async({page})=>{
  await page.setViewportSize({width:640,height:700});
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
  await page.getByRole('textbox',{name:'Cerca musica'}).fill('Musica test');
  await page.getByRole('button',{name:'Riproduci Secondo brano',exact:true}).click();
  const seek=page.getByRole('slider',{name:'Posizione del brano',exact:true});
  await expect.poll(async()=>Number(await seek.inputValue())).toBeGreaterThan(0);
  await expect(page.locator('.wave-timeline')).toHaveAttribute('data-animated','false');
  expect(await page.locator('.wave-slider').evaluateAll(elements=>elements.some(element=>element.getAnimations({subtree:true}).some(animation=>animation.playState==='running')))).toBe(false);
  await page.getByRole('button',{name:'Pausa',exact:true}).click();await seek.focus();const paused=Number(await seek.inputValue());
  await page.keyboard.press('ArrowRight');await expect(seek).toHaveValue(String(paused+1));
  await page.getByRole('button',{name:'Impostazioni',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Il tuo RITVIO',exact:true});
  await dialog.getByRole('button',{name:'Scuro',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  const volume=dialog.getByRole('slider',{name:'Volume nelle impostazioni',exact:true});await expect(volume).toBeVisible();
  const box=await volume.boundingBox();await volume.click({position:{x:box!.width*.4,y:box!.height/2}});
  const clicked=Number(await volume.inputValue());expect(clicked).toBeGreaterThan(.2);expect(clicked).toBeLessThan(.6);
  await page.keyboard.press('ArrowRight');expect(Number(await volume.inputValue())).toBeCloseTo(clicked+.01,2);
  expect(await dialog.locator('.wave-slider').evaluate(element=>element.getAnimations({subtree:true}).some(animation=>animation.playState==='running'))).toBe(false);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'data/analysis/wave-impostazioni-chiaro.png'});
  await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
});


async function activitySnapshot(page:import('@playwright/test').Page){return page.evaluate(async()=>{const apiPath='/src/api.ts',controllerPath='/src/activity-controller.ts';const {flushActivity}=await import(controllerPath);await flushActivity();const {api}=await import(apiPath);return api.activity.get();});}
async function startMeasuredTrack(page:import('@playwright/test').Page){await page.goto('/');await page.getByRole('textbox',{name:'Cerca musica'}).fill('Musica test');await page.getByRole('button',{name:'Riproduci Secondo brano',exact:true}).click();await expect.poll(async()=>Number(await page.getByRole('slider',{name:'Posizione del brano'}).inputValue())).toBeGreaterThan(1.5);}
async function openActivity(page:import('@playwright/test').Page){await page.getByRole('button',{name:'La tua libreria',exact:true}).click();await page.getByRole('tab',{name:'Ascolti',exact:true}).click();return page.locator('.listening-activity');}
test('activity measures actual audio, preserves pause and ignores seek distance; replay and skip close distinct sessions',async({page})=>{
  await startMeasuredTrack(page);await page.getByRole('button',{name:'Pausa',exact:true}).click();const before=await activitySnapshot(page);expect(before.items).toHaveLength(1);expect(before.summary.listenedMs).toBeGreaterThan(500);expect(before.summary.listenedMs).toBeLessThan(4000);
  await page.waitForTimeout(1100);await page.getByRole('slider',{name:'Posizione del brano'}).fill('9');await page.waitForTimeout(250);const paused=await activitySnapshot(page);expect(paused.summary.listenedMs).toBe(before.summary.listenedMs);
  await page.getByRole('button',{name:'Brano precedente',exact:true}).click();await page.getByRole('button',{name:'Riproduci',exact:true}).click();await expect.poll(async()=>Number(await page.getByRole('slider',{name:'Posizione del brano'}).inputValue())).toBeGreaterThan(.6);await page.getByRole('button',{name:'Brano successivo',exact:true}).click();await expect.poll(async()=>Number(await page.getByRole('slider',{name:'Posizione del brano'}).inputValue())).toBeGreaterThan(.6);await page.getByRole('button',{name:'Pausa',exact:true}).click();
  const result=await activitySnapshot(page);expect(result.items.some((item:any)=>item.reason==='replay')).toBe(true);expect(result.items.some((item:any)=>item.reason==='skip')).toBe(true);expect(result.summary.listenedMs).toBeLessThan(6500);expect(result.summary.completed).toBe(0);
  const panel=await openActivity(page);await panel.getByRole('button',{name:'Aggiorna',exact:true}).click();await expect(panel.locator('.activity-event')).toHaveCount(3);
});
test('activity privacy removes the current public session, survives reload and clear cannot resurrect old checkpoints',async({page})=>{
  await startMeasuredTrack(page);await activitySnapshot(page);await page.getByRole('button',{name:'Impostazioni',exact:true}).click();const settings=page.getByRole('dialog');const toggle=settings.getByRole('switch',{name:'Ascolto privato',exact:true});await toggle.click();await expect(toggle).toHaveAttribute('aria-checked','true');await page.keyboard.press('Escape');await expect(page.locator('.activity-private-indicator')).toBeVisible();
  await page.waitForTimeout(1300);await page.getByRole('button',{name:'Pausa',exact:true}).click();let result=await activitySnapshot(page);expect(result.items).toHaveLength(0);expect(result.summary.listenedMs).toBe(0);
  await page.reload();await expect(page.locator('.activity-private-indicator')).toBeVisible();const panel=await openActivity(page);await expect(panel.getByRole('heading',{name:'Stai ascoltando in privato',exact:true})).toBeVisible();await panel.getByRole('switch',{name:'Ascolto privato',exact:true}).click();await expect(page.locator('.activity-private-indicator')).toHaveCount(0);
  await page.getByRole('button',{name:'Riproduci',exact:true}).click();await page.waitForTimeout(1500);await page.getByRole('button',{name:'Pausa',exact:true}).click();await panel.getByRole('button',{name:'Aggiorna',exact:true}).click();await expect(panel.locator('.activity-event')).toHaveCount(1);
  const exclude=panel.getByRole('button',{name:'Escludi dai gusti: Secondo brano',exact:true});await exclude.focus();await page.keyboard.press('Enter');await expect(panel.getByText('Escluso dai futuri consigli',{exact:true})).toBeVisible();result=await activitySnapshot(page);expect(result.items[0].tasteWeight).toBe(0);
  await panel.getByRole('button',{name:'Cancella gli ascolti',exact:true}).click();await panel.getByRole('button',{name:'Cancella definitivamente gli ascolti',exact:true}).click();await expect(panel.locator('.activity-event')).toHaveCount(0);await page.reload();result=await activitySnapshot(page);expect(result.items).toHaveLength(0);expect(result.legacyStarts).toBe(0);
});
test('activity persists interrupted sessions after reload, reports seek-to-end honestly and recovers errors',async({page})=>{
  await startMeasuredTrack(page);await activitySnapshot(page);await page.reload();let result=await activitySnapshot(page);expect(result.items[0].reason).toBe('interrupted');expect(result.summary.completed).toBe(0);
  await page.getByRole('button',{name:'Riproduci',exact:true}).click();await page.waitForTimeout(700);await page.getByRole('slider',{name:'Posizione del brano'}).fill('11');await expect.poll(async()=>(await activitySnapshot(page)).summary.completed).toBe(1);await page.getByRole('button',{name:'Pausa',exact:true}).click();result=await activitySnapshot(page);expect(result.summary.listenedMs).toBeLessThan(6000);
  const panel=await openActivity(page);await page.route('**/v1/me/listening',route=>route.fulfill({status:503,json:{error:{code:'UNAVAILABLE',message:'Errore di prova. Riprova.'}}}));await panel.getByRole('button',{name:'Aggiorna',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('Errore di prova');await page.unroute('**/v1/me/listening');await panel.getByRole('button',{name:'Aggiorna',exact:true}).click();await expect(panel.getByRole('alert')).toHaveCount(0);
});
test('activity fits dark light compact screens and keyboard with reduced motion',async({page,request})=>{
  await page.goto('/');await page.getByRole('textbox',{name:'Cerca musica'}).fill('Musica test');await expect(page.locator('.track-row')).toHaveCount(2);
  const tracks=(await import('./fixtures')).tracks,now=Date.now();for(let index=0;index<3;index++){await request.post('http://127.0.0.1:5199/v1/me/listening/checkpoints',{headers:{authorization:'Bearer test-token-only'},data:{id:crypto.randomUUID(),mediaId:tracks[index%2].id,epoch:1,sequence:1,startedAt:now-20000-index*10000,updatedAt:now-10000-index*10000,listenedMs:6500,durationMs:12000,seeks:index,closed:true,reason:['completed','skip','error'][index]}});}
  const panel=await openActivity(page);await expect(panel.locator('.activity-event')).toHaveCount(3);
  const capture=async(path:string)=>{await page.evaluate(()=>document.fonts.ready);await expect.poll(()=>page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running'&&a.effect?.getComputedTiming().iterations!==Infinity).length)).toBe(0);await page.locator('main').evaluate(el=>el.scrollTo({top:0,behavior:'instant'}));await expect.poll(()=>page.locator('main').evaluate(el=>el.scrollTop)).toBe(0);await page.screenshot({path});};
  await capture('test-results/visual/activity-desktop.png');await panel.locator('.activity-event-action button').first().scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/visual/activity-events-desktop.png'});await page.getByRole('button',{name:'Impostazioni',exact:true}).click();await page.getByRole('button',{name:'Scuro',exact:true}).click();await page.keyboard.press('Escape');await capture('test-results/visual/activity-light.png');
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});const listening=page.locator('#listening-panel');if(await listening.getAttribute('aria-hidden')==='false')await listening.getByRole('button',{name:'Nascondi pannello',exact:true}).click();await capture('test-results/visual/activity-compact.png');expect(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await panel.locator('.activity-event-action button').first().scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/visual/activity-events-compact.png'});
  const control=panel.getByRole('switch',{name:'Ascolto privato',exact:true});await control.focus();await page.keyboard.press('Space');await expect(control).toHaveAttribute('aria-checked','true');await expect(page.locator('.activity-private-indicator')).toBeVisible();
});

test('activity keeps acknowledged privacy and clear when refreshing the summary fails',async({page})=>{
  await startMeasuredTrack(page);await page.getByRole('button',{name:'Pausa',exact:true}).click();const panel=await openActivity(page);await panel.getByRole('button',{name:'Aggiorna',exact:true}).click();await expect(panel.locator('.activity-event')).toHaveCount(1);
  await page.route('**/v1/me/listening',async route=>{if(route.request().method()==='GET')await route.fulfill({status:503,json:{error:{code:'UNAVAILABLE',message:'Riepilogo non disponibile. Riprova.'}}});else await route.continue();});
  const toggle=panel.getByRole('switch',{name:'Ascolto privato',exact:true});await toggle.click();await expect(toggle).toHaveAttribute('aria-checked','true');await expect(page.locator('.activity-private-indicator')).toBeVisible();await expect(toggle).toBeEnabled();
  await page.getByRole('button',{name:'Riproduci',exact:true}).click();await page.waitForTimeout(1000);await page.getByRole('button',{name:'Pausa',exact:true}).click();
  const state=await page.evaluate(async()=>{const path='/src/store.ts';const {usePlayer}=await import(path);return usePlayer.getState().activityJournal;});expect(state).toHaveLength(0);
  await page.unroute('**/v1/me/listening');await panel.getByRole('button',{name:'Aggiorna',exact:true}).click();await expect(panel.locator('.activity-event')).toHaveCount(0);await toggle.click();await expect(toggle).toHaveAttribute('aria-checked','false');await expect(toggle).toBeEnabled();
  await page.getByRole('button',{name:'Riproduci',exact:true}).click();await page.waitForTimeout(1000);await page.getByRole('button',{name:'Pausa',exact:true}).click();await panel.getByRole('button',{name:'Aggiorna',exact:true}).click();await expect(panel.locator('.activity-event')).toHaveCount(1);
  await page.route('**/v1/me/listening',async route=>{if(route.request().method()==='GET')await route.fulfill({status:503,json:{error:{code:'UNAVAILABLE',message:'Riepilogo non disponibile. Riprova.'}}});else await route.continue();});
  await panel.getByRole('button',{name:'Cancella gli ascolti',exact:true}).click();await panel.getByRole('button',{name:'Cancella definitivamente gli ascolti',exact:true}).click();await expect(panel.locator('.activity-event')).toHaveCount(0);await page.unroute('**/v1/me/listening');const after=await activitySnapshot(page);expect(after.items).toHaveLength(0);expect(after.legacyStarts).toBe(0);
});

async function openMetadataArtist(page:import('@playwright/test').Page,empty=true){
  await page.goto('/');await page.getByRole('button',{name:'Cerca',exact:true}).click();await page.locator('.catalog-search-tabs').getByRole('button',{name:'Artisti',exact:true}).click();await page.getByRole('textbox',{name:'Cerca musica'}).fill('Artista test');await page.getByRole('button',{name:'Apri artista: Artista test',exact:true}).click();
  await page.locator('.catalog-artist .catalog-details>summary').click();const panel=page.locator('.catalog-artist .metadata-panel');await panel.locator('summary').click();if(empty)await expect(panel.getByText('Non classificato',{exact:true})).toBeVisible();return panel;
}
test('metadata ambiguous artists require confirmation; local genres persist, reset and never request playback',async({page})=>{
  let playback=0;page.on('request',request=>{if(request.url().includes('/v1/media/')&&request.url().includes('/playback')&&!request.url().includes('prepare=true'))playback++;});const panel=await openMetadataArtist(page);await panel.getByRole('button',{name:'Cerca metadati',exact:true}).click();await expect(panel.locator('.metadata-candidates li')).toHaveCount(2);await expect(panel.getByText('Proposte da confermare',{exact:true})).toBeVisible();await expect(panel.locator('.metadata-current p')).toHaveText('Nessun genere assegnato');
  await panel.locator('.metadata-candidates button').first().click();await expect(panel.getByText('Associazione confermata da te',{exact:true})).toBeVisible();await expect(panel.locator('.metadata-current p')).toHaveText('elettronica');
  await panel.getByRole('button',{name:'Modifica generi',exact:true}).click();await panel.getByRole('textbox',{name:'Generi personali, separati da virgole',exact:true}).fill('Dream Pop, dream pop, 日本の音楽');await panel.getByRole('button',{name:'Salva generi',exact:true}).click();await expect(panel.locator('.metadata-current p')).toHaveText('dream pop · 日本の音楽');
  await openMetadataArtist(page,false);await expect(panel.locator('.metadata-current p')).toHaveText('dream pop · 日本の音楽');await panel.getByRole('button',{name:'Ripristina generi della fonte',exact:true}).click();await expect(panel.locator('.metadata-current p')).toHaveText('elettronica');await panel.getByRole('button',{name:'Rimuovi associazione',exact:true}).click();await expect(panel.locator('.metadata-current p')).toHaveText('Nessun genere assegnato');expect(playback).toBe(0);
});
test('metadata edition evidence preserves live differences and album genres never inherit to tracks',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Cerca',exact:true}).click();await page.locator('.catalog-search-tabs').getByRole('button',{name:'Album',exact:true}).click();await page.getByRole('textbox',{name:'Cerca musica'}).fill('Album test');await page.getByRole('button',{name:'Apri album: Album test 1',exact:true}).click();await page.locator('.catalog-album .catalog-details>summary').click();const panel=page.locator('.catalog-album .metadata-panel');await panel.locator('summary').click();await panel.getByRole('button',{name:'Cerca metadati',exact:true}).click();await expect(panel.locator('.metadata-candidates li')).toHaveCount(2);await expect(panel.locator('.metadata-candidates li').first()).toContainText('Più indizi concordano');await expect(panel.locator('.metadata-candidates li').last()).toContainText('Titolo: differisce · Artista: differisce');await panel.locator('.metadata-candidates button').first().click();
  await page.locator('.catalog-actions').getByRole('button',{name:'Riproduci in ordine',exact:true}).click();await expect(page.getByRole('button',{name:'Pausa',exact:true})).toBeVisible();await page.getByRole('button',{name:'Pausa',exact:true}).click();await page.getByRole('button',{name:'Mostra in riproduzione',exact:true}).click();await page.locator('.panel-body .listening-details>summary').click();const track=page.locator('.panel-body .metadata-panel');await track.locator('summary').click();await expect(track.locator('.metadata-current p')).toHaveText('Nessun genere assegnato');await expect(panel.locator('.metadata-current p')).toHaveText('elettronica');
});
test('metadata empty/error states preserve edits and late provider responses cannot populate a different page',async({page})=>{
  const panel=await openMetadataArtist(page);await panel.getByRole('textbox',{name:'Cerca metadati iTunes',exact:true}).fill('Assente');await panel.getByRole('button',{name:'Cerca metadati',exact:true}).click();await expect(panel.locator('.metadata-empty')).toContainText('Nessun risultato');
  await page.route('**/v1/me/metadata/*/*/search',route=>route.fulfill({status:503,json:{error:{code:'UNAVAILABLE',message:'Metadati non disponibili. Riprova.'}}}));await panel.getByRole('button',{name:'Cerca metadati',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('Metadati non disponibili');await panel.getByRole('button',{name:'Modifica generi',exact:true}).click();await panel.getByRole('textbox',{name:'Generi personali, separati da virgole',exact:true}).fill('<script>alert(1)</script>, ambient');await panel.getByRole('button',{name:'Salva generi',exact:true}).click();await expect(panel.locator('.metadata-current p')).toHaveText('<script>alert(1)</script> · ambient');await expect(panel.locator('script')).toHaveCount(0);
  await page.unroute('**/v1/me/metadata/*/*/search');let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);await page.route('**/v1/me/metadata/*/*/search',async route=>{await gate;await route.fulfill({json:{target:{kind:'artist',id:'old',name:'old'},status:'suggested',genres:[],selected:null,localGenres:null,candidates:[],cache:null,updatedAt:null}}).catch(()=>{});});
  try{await panel.getByRole('button',{name:'Cerca metadati',exact:true}).click();await page.locator('.catalog-artist .catalog-discography').getByRole('button',{name:'Apri album: Album test 1',exact:true}).click();await page.locator('.catalog-album .catalog-details>summary').click();const album=page.locator('.catalog-album .metadata-panel');await album.locator('summary').click();release();await expect(album.getByText('Non classificato',{exact:true})).toBeVisible();await expect(album.locator('.metadata-current p')).toHaveText('Nessun genere assegnato');}finally{release();}
});
test('metadata details and candidates fit desktop light compact and keyboard with reduced motion',async({page})=>{
  const panel=await openMetadataArtist(page);await panel.getByRole('button',{name:'Cerca metadati',exact:true}).click();await expect(panel.locator('.metadata-candidates li')).toHaveCount(2);await panel.locator('.metadata-candidates button').first().click();await panel.getByRole('button',{name:'Modifica generi',exact:true}).click();
  const capture=async(path:string)=>{await panel.locator('summary').scrollIntoViewIfNeeded();await page.evaluate(()=>document.fonts.ready);await expect.poll(()=>page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running'&&a.effect?.getComputedTiming().iterations!==Infinity).length)).toBe(0);await page.screenshot({path});};
  await capture('test-results/visual/metadata-desktop.png');await panel.locator('.metadata-candidates button').last().scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/visual/metadata-candidates-desktop.png'});
  await page.getByRole('button',{name:'Impostazioni',exact:true}).click();await page.getByRole('button',{name:'Scuro',exact:true}).click();await page.keyboard.press('Escape');await capture('test-results/visual/metadata-light.png');await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});const listening=page.locator('#listening-panel');if(await listening.getAttribute('aria-hidden')==='false')await listening.getByRole('button',{name:'Nascondi pannello',exact:true}).click();await capture('test-results/visual/metadata-compact.png');
  expect(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await panel.locator('.metadata-candidates button').last().scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/visual/metadata-candidates-compact.png'});
  const reset=panel.getByRole('button',{name:'Rimuovi associazione',exact:true});await reset.focus();await page.keyboard.press('Enter');await expect(panel.getByText('Proposte da confermare',{exact:true})).toBeVisible();await expect(reset).toHaveCount(0);await panel.locator('summary').focus();await page.keyboard.press('Enter');await expect(panel).not.toHaveAttribute('open','');
});


test('taste cold start does not search online, supports recovery and keeps playback separate',async({page})=>{
  let searches=0,playbacks=0;page.on('request',r=>{if(r.url().includes('/v1/search?')||r.url().includes('/taste/discover'))searches++;if(r.url().includes('/v1/media/')&&r.url().includes('/playback')&&!r.url().includes('prepare=true'))playbacks++;});
  await page.goto('/');await page.getByRole('button',{name:'Apri gusti e mix',exact:true}).click();const taste=page.locator('.taste-page');await expect(taste.getByRole('heading',{name:'I tuoi gusti',exact:true})).toBeVisible();await expect(taste.getByText(/Il profilo sta prendendo forma/)).toBeVisible();await expect(taste.getByRole('heading',{name:'Ancora pochi candidati per questo mix'})).toBeVisible();expect(searches).toBe(0);expect(playbacks).toBe(0);
  await taste.getByRole('button',{name:'Cerca nuovi candidati',exact:true}).click();await expect(taste.getByRole('alert')).toContainText('Ascolta o salva');
  await page.route('**/v1/me/taste',route=>route.fulfill({status:503,json:{error:{code:'TEST',message:'Profilo temporaneamente assente'}}}));await taste.getByRole('button',{name:'Aggiorna profilo',exact:true}).click();await expect(taste.getByRole('alert')).toContainText('Profilo temporaneamente assente');await page.unroute('**/v1/me/taste');await taste.getByRole('button',{name:'Riprova',exact:true}).click();await expect(taste.getByRole('alert')).toHaveCount(0);
});
async function prepareTaste(page:any){
  await page.goto('/');await page.getByRole('textbox',{name:'Cerca musica'}).fill('Musica test');await page.locator('.track-row').first().getByRole('button',{name:'Aggiungi ai brani piaciuti: Secondo brano',exact:true}).click();
  await page.getByRole('button',{name:'La tua libreria',exact:true}).click();await page.getByRole('tab',{name:'I tuoi gusti',exact:true}).click();const taste=page.locator('.taste-page');await expect(taste.getByRole('button',{name:'Riproduci mix in ordine',exact:true})).toBeVisible();return taste;
}
test('taste feedback is reversible, candidate search is explicit, genre mixes preserve attribution and reset preserves favourites',async({page})=>{
  const taste=await prepareTaste(page);await taste.getByRole('button',{name:'Riproduci mix in ordine',exact:true}).click();await expect(page.getByRole('button',{name:'Pausa',exact:true})).toBeVisible();await page.getByRole('button',{name:'Pausa',exact:true}).click();let playbacks=0;page.on('request',r=>{if(r.url().includes('/v1/media/')&&r.url().includes('/playback')&&!r.url().includes('prepare=true'))playbacks++;});
  await taste.getByRole('button',{name:'Meno simili a Secondo brano',exact:true}).click();await expect(taste.locator('.taste-tracks li')).toHaveCount(0);await taste.getByText('Gestisci preferenze e brani evitati',{exact:true}).click();await expect(taste.locator('.taste-feedback-items')).toContainText('Evitato nei mix');await taste.getByRole('button',{name:'Annulla feedback',exact:true}).click();await expect(taste.locator('.taste-tracks li')).toHaveCount(1);
  await taste.getByRole('button',{name:'Più simili a Secondo brano',exact:true}).click();await expect(taste.getByRole('button',{name:'Più simili a Secondo brano',exact:true})).toHaveAttribute('aria-pressed','true');await taste.getByRole('button',{name:'Cerca nuovi candidati',exact:true}).click();await expect(taste.locator('.taste-notice')).toContainText('Ricerca completata');
  await taste.getByRole('button',{name:'Scoperta',exact:true}).click();await expect(taste.locator('.taste-tracks li')).toHaveCount(3);await taste.getByRole('button',{name:'Per genere',exact:true}).click();await expect(taste.getByRole('heading',{name:'Ancora pochi candidati per questo mix'})).toBeVisible();expect(playbacks).toBe(0);
  await taste.getByRole('button',{name:'Ricomincia il profilo',exact:true}).click();await taste.getByRole('button',{name:'Ricomincia da ora',exact:true}).click();await expect(taste.locator('.taste-notice')).toContainText('Profilo riavviato');await expect(taste.locator('.taste-tracks li')).toHaveCount(1);await expect(taste.locator('.taste-feedback-items')).toHaveCount(0);
  await page.getByRole('tab',{name:/Brani piaciuti/}).click();await expect(page.locator('.library-track')).toHaveCount(1);
});
test('taste layouts fit desktop light compact and keyboard with reduced motion',async({page})=>{
  const taste=await prepareTaste(page);
  const headers={Authorization:'Bearer test-token-only'};const library=await (await page.request.get('http://127.0.0.1:5199/v1/me/library',{headers})).json();const track=library.likes[0];
  for(let i=0;i<20;i++){const start=Date.now()-2*86400000-i*3600000;await page.request.post('http://127.0.0.1:5199/v1/me/listening/checkpoints',{headers,data:{id:crypto.randomUUID(),mediaId:track.id,epoch:1,sequence:1,startedAt:start,updatedAt:start+12000,listenedMs:12000,durationMs:12000,seeks:0,closed:true,reason:'completed'}});}
  await page.request.put('http://127.0.0.1:5199/v1/me/metadata/artist/UCtestArtist01/genres',{headers,data:{genres:['ambient','dream pop']}});
  await taste.getByRole('button',{name:'Aggiorna profilo',exact:true}).click();await expect(taste.locator('.taste-summary')).toContainText('20 sessioni utili');await taste.getByText('Come vengono scelti i brani?',{exact:true}).click();
  const capture=async(path:string)=>{await page.evaluate(()=>document.fonts.ready);await expect.poll(()=>page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running'&&a.effect?.getComputedTiming().iterations!==Infinity).length)).toBe(0);await page.screenshot({path});};
  await capture('test-results/visual/taste-desktop.png');await taste.locator('.taste-mixes').scrollIntoViewIfNeeded();await capture('test-results/visual/taste-mixes-desktop.png');
  await page.getByRole('button',{name:'Impostazioni',exact:true}).click();await page.getByRole('button',{name:'Scuro',exact:true}).click();await page.keyboard.press('Escape');await taste.getByRole('heading',{name:'I tuoi gusti',exact:true}).scrollIntoViewIfNeeded();await capture('test-results/visual/taste-light.png');
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});const listening=page.locator('#listening-panel');if(await listening.getAttribute('aria-hidden')==='false')await listening.getByRole('button',{name:'Nascondi pannello',exact:true}).click();await taste.getByRole('heading',{name:'I tuoi gusti',exact:true}).scrollIntoViewIfNeeded();await capture('test-results/visual/taste-compact.png');
  expect(await taste.evaluate((el:HTMLElement)=>el.scrollWidth<=el.clientWidth)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await taste.getByRole('button',{name:'Riproduci mix in ordine',exact:true}).scrollIntoViewIfNeeded();await capture('test-results/visual/taste-mixes-compact.png');
  await taste.getByRole('combobox',{name:'Origine dei generi',exact:true}).selectOption('track');await expect(taste.getByRole('button',{name:'Per genere',exact:true})).toBeEnabled();const genre=taste.getByRole('button',{name:'Per genere',exact:true});await genre.focus();await page.keyboard.press('Enter');await expect(genre).toHaveAttribute('aria-pressed','true');await taste.getByRole('heading',{name:'Ancora pochi candidati per questo mix'}).scrollIntoViewIfNeeded();await capture('test-results/visual/taste-empty-compact.png');
});


async function preparePlaylistTools(page:import('@playwright/test').Page){
  const headers={Authorization:'Bearer test-token-only'},base='http://127.0.0.1:5199/v1';
  for(const track of libraryFixtureTracks)expect((await page.request.post(base+'/links/resolve',{headers,data:{videoId:track.videoId}})).ok()).toBe(true);
  const source=await (await page.request.post(base+'/me/playlists/from-queue',{headers,data:{name:'Viaggio notturno',mediaIds:[libraryFixtureTracks[0].id,libraryFixtureTracks[1].id,libraryFixtureTracks[0].id]}})).json();
  const target=await (await page.request.post(base+'/me/playlists/from-queue',{headers,data:{name:'Destinazione',mediaIds:[libraryFixtureTracks[1].id]}})).json();
  await page.goto('/');await page.getByRole('button',{name:'La tua libreria',exact:true}).click();await page.locator('.playlist-card').filter({has:page.getByText('Viaggio notturno',{exact:true})}).click();
  const library=page.locator('.library-page');await expect(library.locator('.playlist-item')).toHaveCount(3);
  return {source,target,library,headers,base};
}
test('playlist tools selection keeps hidden entries and atomic move/undo preserve playback and exact copies after restart',async({page})=>{
  const {source,target,library,headers,base}=await preparePlaylistTools(page);
  await library.getByRole('button',{name:'Riproduci playlist',exact:true}).click();await expect(page.getByRole('button',{name:'Pausa',exact:true})).toBeVisible();await page.getByRole('button',{name:'Pausa',exact:true}).click();
  const position=await page.getByRole('slider',{name:'Posizione del brano'}).inputValue();let playbacks=0;page.on('request',r=>{if(r.url().includes('/v1/media/')&&r.url().includes('/playback')&&!r.url().includes('prepare=true'))playbacks++;});
  await library.getByRole('button',{name:'Seleziona brani',exact:true}).click();await library.getByRole('checkbox',{name:'Seleziona elemento: Primo & brano',exact:true}).first().check();
  await library.getByRole('searchbox',{name:'Cerca in questa playlist'}).fill('Secondo');await library.getByRole('button',{name:'Seleziona risultati (1)',exact:true}).click();await expect(library.locator('.playlist-selection-toolbar')).toContainText('2 selezionati');await expect(library.locator('.playlist-selection-toolbar')).toContainText('1 selezionati fuori dal filtro');
  await expect(library.getByRole('button',{name:'Porta all’inizio',exact:true})).toBeDisabled();await library.getByRole('button',{name:'Sposta in playlist',exact:true}).click();
  const plan=library.locator('.playlist-plan');await plan.getByRole('combobox',{name:'Playlist di destinazione'}).selectOption(target.id);await expect(plan).toContainText('da 1 a 3 elementi');await expect(plan).toContainText('1 elementi selezionati sono già presenti');await plan.getByRole('button',{name:'Conferma spostamento',exact:true}).click();
  let saved=await (await page.request.get(base+'/me/playlists/'+source.id,{headers})).json();expect(saved.items.map((i:any)=>i.id)).toEqual([source.items[2].id]);await expect(library.getByRole('button',{name:'Annulla ultima rimozione (2)',exact:true})).toBeVisible();expect(playbacks).toBe(0);expect(await page.getByRole('slider',{name:'Posizione del brano'}).inputValue()).toBe(position);
  await page.reload();await page.getByRole('button',{name:'La tua libreria',exact:true}).click();await page.locator('.playlist-card').filter({has:page.getByText('Viaggio notturno',{exact:true})}).click();await library.getByRole('button',{name:'Annulla ultima rimozione (2)',exact:true}).click();await expect(library.locator('.playlist-item')).toHaveCount(3);
  saved=await (await page.request.get(base+'/me/playlists/'+source.id,{headers})).json();expect(saved.items).toEqual(source.items);const destination=await (await page.request.get(base+'/me/playlists/'+target.id,{headers})).json();expect(destination.items).toEqual(target.items);await expect(library.getByRole('button',{name:/Annulla ultima rimozione/})).toHaveCount(0);
});
test('playlist tools copy skipping retains skipped source entries and duplicate cleanup is explicit and reversible',async({page})=>{
  const {source,target,library,headers,base}=await preparePlaylistTools(page);await library.getByRole('button',{name:'Seleziona brani',exact:true}).click();await library.getByRole('button',{name:'Seleziona risultati (3)',exact:true}).click();
  await library.getByRole('button',{name:'Sposta in playlist',exact:true}).click();let plan=library.locator('.playlist-plan');await plan.getByRole('combobox',{name:'Playlist di destinazione'}).selectOption(target.id);await plan.getByRole('checkbox',{name:'Salta i brani già presenti e le ripetizioni nella selezione'}).check();await expect(plan).toContainText('da 1 a 2 elementi');await plan.getByRole('button',{name:'Conferma spostamento',exact:true}).click();await expect(library.locator('.playlist-item')).toHaveCount(2);
  let saved=await (await page.request.get(base+'/me/playlists/'+source.id,{headers})).json();expect(saved.items.map((i:any)=>i.id)).toEqual([source.items[1].id,source.items[2].id]);await library.getByRole('button',{name:'Annulla ultima rimozione (1)',exact:true}).click();await expect(library.locator('.playlist-item')).toHaveCount(3);
  await library.getByRole('button',{name:'Copie ripetute (1)',exact:true}).click();plan=library.locator('.playlist-plan');await expect(plan.locator('li')).toHaveCount(1);await plan.getByRole('checkbox',{name:'Rimuovi copia: Primo & brano'}).uncheck();await expect(plan.getByRole('button',{name:'Rimuovi copie spuntate'})).toBeDisabled();await plan.getByRole('checkbox',{name:'Rimuovi copia: Primo & brano'}).check();await plan.getByRole('button',{name:'Rimuovi copie spuntate'}).click();await expect(library.locator('.playlist-item')).toHaveCount(2);
  saved=await (await page.request.get(base+'/me/playlists/'+source.id,{headers})).json();expect(saved.items.map((i:any)=>i.id)).toEqual(source.items.slice(0,2).map((i:any)=>i.id));await library.getByRole('button',{name:'Annulla ultima rimozione (1)',exact:true}).click();await expect(library.locator('.playlist-item')).toHaveCount(3);
  await library.getByRole('button',{name:'Seleziona risultati (3)',exact:true}).click();await library.getByRole('button',{name:'Copia in playlist',exact:true}).click();plan=library.locator('.playlist-plan');await plan.getByRole('combobox',{name:'Playlist di destinazione'}).selectOption(source.id);await plan.getByRole('button',{name:'Conferma copia',exact:true}).click();await expect(library.locator('.playlist-item')).toHaveCount(6);
});
test('playlist tools keyboard bulk reorder and private duplication preserve original metadata',async({page})=>{
  const {source,library,headers,base}=await preparePlaylistTools(page);await library.getByRole('button',{name:'Modifica',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('textbox',{name:'Descrizione playlist'}).fill('Una selezione personale');await dialog.getByRole('button',{name:'Salva modifiche',exact:true}).click();await expect(dialog).not.toBeVisible();
  await library.getByRole('button',{name:'Seleziona brani',exact:true}).click();const check=library.getByRole('checkbox',{name:'Seleziona elemento: Secondo brano'});await check.focus();await page.keyboard.press('Space');await expect(check).toBeChecked();await library.getByRole('button',{name:'Porta all’inizio',exact:true}).click();await expect(library.locator('.playlist-item .library-track-title>button strong')).toHaveText(['Secondo brano','Primo & brano','Primo & brano']);
  await library.getByRole('button',{name:'Duplica playlist',exact:true}).click();const plan=library.locator('.playlist-plan');await plan.getByRole('textbox',{name:'Nome della copia'}).fill('Copia indipendente');await plan.getByRole('button',{name:'Crea copia privata'}).click();await expect(library.locator('.playlist-hero')).toContainText('Copia indipendente');await expect(library.locator('.playlist-item')).toHaveCount(3);await expect(library.locator('.playlist-hero')).toContainText('Una selezione personale');
  const original=await (await page.request.get(base+'/me/playlists/'+source.id,{headers})).json();expect(original.items.map((i:any)=>i.id)).toEqual([source.items[1].id,source.items[0].id,source.items[2].id]);const snapshot=await (await page.request.get(base+'/me/library',{headers})).json();const copy=snapshot.playlists.find((p:any)=>p.name==='Copia indipendente');expect(copy.visibility).toBe('private');expect(copy.id).not.toBe(source.id);
});
test('playlist tools reject changed destinations without partial removal',async({page})=>{
  const {source,target,library,headers,base}=await preparePlaylistTools(page);await library.getByRole('button',{name:'Seleziona brani',exact:true}).click();await library.getByRole('checkbox',{name:'Seleziona elemento: Secondo brano'}).check();await library.getByRole('button',{name:'Sposta in playlist',exact:true}).click();const plan=library.locator('.playlist-plan');await plan.getByRole('combobox',{name:'Playlist di destinazione'}).selectOption(target.id);await expect(plan).toContainText('da 1 a 2 elementi');
  expect((await page.request.post(base+'/me/playlists/'+target.id+'/items',{headers:{...headers,'If-Match':'"1"'},data:{mediaId:libraryFixtureTracks[0].id}})).ok()).toBe(true);await plan.getByRole('button',{name:'Conferma spostamento'}).click();await expect(library.getByRole('alert')).toContainText('La playlist è cambiata');const saved=await (await page.request.get(base+'/me/playlists/'+source.id,{headers})).json();expect(saved.items).toEqual(source.items);await expect(library.locator('.playlist-item')).toHaveCount(3);
});
test('playlist tools album creation skips unavailable entries and file import offers duplicate control',async({page})=>{
  await preparePlaylistTools(page);await page.getByRole('button',{name:'Cerca',exact:true}).click();await page.locator('.catalog-search-tabs').getByRole('button',{name:'Album',exact:true}).click();await page.getByRole('textbox',{name:'Cerca musica'}).fill('Album test');await page.getByRole('button',{name:'Apri album: Album test 1',exact:true}).click();const album=page.locator('.catalog-album');await album.getByRole('button',{name:'Opzioni di Album test 1',exact:true}).click();await page.locator('.catalog-options:popover-open').getByRole('button',{name:'Crea playlist dall’album'}).click();await expect(album.locator('.playlist-plan')).toContainText('2 brani disponibili su 3 voci');await album.getByRole('textbox',{name:'Nome della playlist dall’album'}).fill('Album salvato');await album.getByRole('button',{name:'Crea playlist',exact:true}).click();await expect(album.locator('.playlist-tools-feedback')).toContainText('Album salvato');
  await page.getByRole('button',{name:'La tua libreria',exact:true}).click();await page.getByLabel('File playlist RITVIO',{exact:true}).setInputFiles({name:'copie.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'ritvio-playlist',version:1,exportedAt:new Date().toISOString(),playlist:{name:'File copie',description:'',cover:null,tracks:[libraryFixtureTracks[0],libraryFixtureTracks[0],libraryFixtureTracks[1]].map(t=>({videoId:t.videoId,title:t.title,artist:t.artist,duration:t.duration}))}}))});
  const dialog=page.getByRole('dialog');await expect(dialog).toContainText('1 copie ripetute');await dialog.getByRole('checkbox',{name:'Escludi le copie ripetute nel file'}).check();await expect(dialog.getByRole('status')).toContainText('2 elementi');await dialog.getByRole('button',{name:'Importa come nuova playlist'}).click();await expect(page.locator('.playlist-item')).toHaveCount(2);
});
test('playlist tools layouts expose previews and undo in desktop light compact and empty states',async({page})=>{
  const {library}=await preparePlaylistTools(page);await library.getByRole('button',{name:'Seleziona brani',exact:true}).click();await library.getByRole('checkbox',{name:'Seleziona elemento: Secondo brano'}).check();
  const capture=async(name:string)=>{await page.evaluate(()=>document.fonts.ready);await expect.poll(()=>page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running'&&a.effect?.getComputedTiming().iterations!==Infinity).length)).toBe(0);await page.locator('main').evaluate(el=>el.scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:'test-results/visual/playlist-tools-'+name+'.png'});};
  await capture('desktop');await library.getByRole('button',{name:'Copie ripetute (1)',exact:true}).click();await library.locator('.playlist-plan').evaluate(el=>el.scrollIntoView({block:'start'}));await page.screenshot({path:'test-results/visual/playlist-tools-preview.png'});await library.getByRole('button',{name:'Chiudi anteprima'}).click();await page.getByRole('button',{name:'Impostazioni',exact:true}).click();await page.getByRole('button',{name:'Scuro',exact:true}).click();await page.keyboard.press('Escape');await capture('light');
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});const panel=page.locator('#listening-panel');if(await panel.getAttribute('aria-hidden')==='false')await panel.getByRole('button',{name:'Nascondi pannello',exact:true}).click();await capture('compact');expect(await library.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await library.locator('.playlist-bulk-actions summary').click();await library.getByRole('button',{name:'Seleziona risultati (3)',exact:true}).click();await library.getByRole('button',{name:'Rimuovi selezionati',exact:true}).click();await library.getByRole('button',{name:'Conferma rimozione',exact:true}).click();await expect(library.locator('.playlist-item')).toHaveCount(0);await capture('empty');await expect(library.getByRole('button',{name:'Annulla ultima rimozione (3)',exact:true})).toBeVisible();await library.getByRole('button',{name:'Annulla ultima rimozione (3)',exact:true}).click();await expect(library.locator('.playlist-item')).toHaveCount(3);
});

test('playlist tools previews reveal their heading, respect reduced motion and return keyboard focus to the trigger',async({page})=>{
  const {library}=await preparePlaylistTools(page);await library.getByRole('button',{name:'Seleziona brani',exact:true}).click();await library.getByRole('checkbox',{name:'Seleziona elemento: Secondo brano'}).check();
  const pairs=[['Copia in playlist','Copia gli elementi selezionati'],['Sposta in playlist','Sposta gli elementi selezionati'],['Rimuovi selezionati','Rimuovi questi elementi'],['Duplica playlist','Crea una copia della playlist'],['Copie ripetute (1)','Controlla le copie ripetute']];
  const inspect=async(triggerName:string,headingName:string)=>{
    const trigger=library.getByRole('button',{name:triggerName,exact:true});await trigger.click();const heading=library.locator('.playlist-plan').getByRole('heading',{name:headingName,exact:true});await expect(heading).toBeFocused();await expect.poll(async()=>{const rect=await heading.boundingBox(),player=await page.locator('.playerbar').boundingBox();return !!rect&&!!player&&rect.y>=60&&rect.y+rect.height<player.y;}).toBe(true);
    await library.getByRole('button',{name:'Chiudi anteprima',exact:true}).click();await expect(trigger).toBeFocused();await expect(library.locator('.playlist-plan')).toHaveCount(0);
  };
  for(const [trigger,heading] of pairs)await inspect(trigger,heading);
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});const panel=page.locator('#listening-panel');if(await panel.getAttribute('aria-hidden')==='false')await panel.getByRole('button',{name:'Nascondi pannello',exact:true}).click();await library.locator('.playlist-bulk-actions summary').click();await inspect('Copia in playlist','Copia gli elementi selezionati');
});
