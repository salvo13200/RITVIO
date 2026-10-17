const { app, BrowserWindow, ipcMain, globalShortcut, shell, session, dialog, clipboard } = require('electron');
const {randomUUID}=require('node:crypto');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs/promises');
const {validateStoryPng,storyFilename}=require('./story-export.cjs');
const {migrateLegacyProfile}=require('./legacy-profile.cjs');
const {cleanSnapshot,cleanCommand}=require('./mini-player.cjs');
const {createLanguagePreferences}=require('./language.cjs');
const {nativeText:translateNative}=require('./native-text.cjs');
let nativeLanguageState;
const nativeText=source=>translateNative(source,nativeLanguageState??{preference:'system',systemLanguages:app.getPreferredSystemLanguages()});
app.setName('RITVIO');
app.setAppUserModelId('it.ritvio.desktop');
if(process.env.RITVIO_TEST_USER_DATA && process.env.RITVIO_TEST_HIDDEN==='true')app.setPath('userData',path.resolve(process.env.RITVIO_TEST_USER_DATA));
if(process.env.RITVIO_TEST_HIDDEN==='true' && /^\d{4,5}$/.test(process.env.RITVIO_TEST_CDP_PORT??'')) {
  app.commandLine.appendSwitch('remote-debugging-port',process.env.RITVIO_TEST_CDP_PORT);
  app.commandLine.appendSwitch('remote-debugging-address','127.0.0.1');
}
const root = app.isPackaged ? app.getAppPath() : path.resolve(__dirname, '../..');
let api; let window; let runtime; let quitting = false;let mini;let miniState=null;let miniPinned=false;
const primaryInstance=!app.isPackaged||app.requestSingleInstanceLock();
if(!primaryInstance)app.quit();
app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();if(process.env.RITVIO_TEST_HIDDEN!=='true'){window.show();window.focus();}}});
let playerData=null; let saveTimer; let saving=Promise.resolve(); let playerFile;
function flushPlayer() {
  clearTimeout(saveTimer);
  saveTimer=undefined;
  const data=playerData;
  saving=saving.catch(()=>{}).then(async()=>{
    if(!playerFile)return;
    await fs.mkdir(path.dirname(playerFile),{recursive:true});
    if(data===null) {await fs.rm(playerFile,{force:true});return;}
    await fs.writeFile(`${playerFile}.tmp`,data,'utf8');
    await fs.rename(`${playerFile}.tmp`,playerFile);
  });
  return saving;
}
async function start() {
  if(process.env.RITVIO_TEST_HIDDEN!=='true')await migrateLegacyProfile(app.getPath('appData'),app.getPath('userData'));
  playerFile=path.join(app.getPath('userData'),'player-state.json');
  try {const value=await fs.readFile(playerFile,'utf8');if(value.length<=2000000){JSON.parse(value);playerData=value;}}catch{}
  const hasExistingLanguageProfile=playerData!==null||await fs.access(path.join(app.getPath('userData'),'cache/mvp.sqlite')).then(()=>true,()=>false);
  const backend=await import(pathToFileURL(path.join(root,'dist/api.mjs')).href);
  const createApi=backend.createApi || backend.default.createApi;
  const devOrigin=app.isPackaged?undefined:process.env.RITVIO_DEV_URL;
  runtime = await createApi({root,devOrigin,serveClient:!devOrigin,...(app.isPackaged?{packagedRuntime:{
    dataDirectory:path.join(app.getPath('userData'),'cache'),python:path.join(process.resourcesPath,'runtime/python/python.exe'),
    node:process.execPath,catalogScript:path.join(process.resourcesPath,'scripts/music-catalog.py'),electronNode:true,
  }}:{})});
  api = runtime.app;
  await api.listen({host:'127.0.0.1',port:0});
  const address=api.server.address();
  const baseUrl=`http://127.0.0.1:${address.port}`;
  const frontend=devOrigin || baseUrl;
  const trusted = event => event.sender === window?.webContents && new URL(event.senderFrame.url).origin === frontend;
  const trustedMini=event=>event.sender===mini?.webContents&&new URL(event.senderFrame.url).origin===frontend;
  const language=createLanguagePreferences(app.getPath('userData'),{systemLanguages:()=>app.getPreferredSystemLanguages(),hasExistingProfile:hasExistingLanguageProfile,onChange:value=>{nativeLanguageState=value;for(const target of [window,mini])if(target&&!target.isDestroyed())target.webContents.send('ritvio:language-state',value);}});
  nativeLanguageState=await language.read().catch(()=>undefined);
  ipcMain.handle('ritvio:language-read',event=>{if(!trusted(event)&&!trustedMini(event))throw Error('Untrusted renderer');return language.read();});
  ipcMain.handle('ritvio:language-write',(event,value)=>{if(!trusted(event)&&!trustedMini(event))throw Error('Untrusted renderer');return language.write(value);});
  const restore=()=>{if(!window||window.isDestroyed())return;if(window.isMinimized())window.restore();if(process.env.RITVIO_TEST_HIDDEN!=='true'){window.show();window.focus();}};
  ipcMain.handle('ritvio:mini-state',(event,value)=>{if(!trusted(event))throw Error('Untrusted renderer');miniState=cleanSnapshot(value);if(mini&&!mini.isDestroyed())mini.webContents.send('ritvio:mini-snapshot',{...miniState,pinned:miniPinned});});
  ipcMain.handle('ritvio:mini-current',event=>{if(!trustedMini(event))throw Error('Untrusted renderer');return miniState?{...miniState,pinned:miniPinned}:null;});
  ipcMain.handle('ritvio:mini-open',async event=>{
    if(!trusted(event))throw Error('Untrusted renderer');
    if(mini&&!mini.isDestroyed()){if(process.env.RITVIO_TEST_HIDDEN!=='true'){mini.show();mini.focus();}return;}
    mini=new BrowserWindow({width:460,height:260,minWidth:360,maxWidth:680,minHeight:245,maxHeight:350,title:'RITVIO — Mini-player',backgroundColor:'#13151a',alwaysOnTop:miniPinned,show:false,autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
    mini.webContents.setWindowOpenHandler(()=>({action:'deny'}));mini.webContents.on('will-navigate',(e,url)=>{if(new URL(url).origin!==frontend)e.preventDefault();});
    mini.on('closed',()=>{mini=null;if(!quitting)restore();});
    const openedMini=mini;await openedMini.loadURL(`${frontend}/?mini=1`);if(!openedMini.isDestroyed()&&mini===openedMini&&process.env.RITVIO_TEST_HIDDEN!=='true'){openedMini.show();window.hide();}
  });
  ipcMain.handle('ritvio:mini-command',(event,value)=>{
    if(!trustedMini(event))throw Error('Untrusted renderer');const command=cleanCommand(value);
    if(command.type==='restore'||command.type==='close'){mini.close();return;}
    if(command.type==='pin'){miniPinned=!miniPinned;mini.setAlwaysOnTop(miniPinned);mini.webContents.send('ritvio:mini-snapshot',{...miniState,pinned:miniPinned});return;}
    window?.webContents.send('ritvio:mini-action',command);
  });
  ipcMain.handle('ritvio:configuration', event => {
    if(!trusted(event)) throw new Error('Untrusted renderer');
    return {baseUrl,token:runtime.config.token};
  });
  ipcMain.handle('ritvio:open-youtube', (event,videoId) => {
    if(!trusted(event)||typeof videoId!=='string'||!/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new Error('Invalid video');
    return shell.openExternal(`https://www.youtube.com/watch?v=${videoId}`);
  });
  ipcMain.handle('ritvio:open-metadata-source',(event,kind,id)=>{
    if(!trusted(event)||!['artist','album','track'].includes(kind)||!Number.isSafeInteger(id)||id<1)throw Error('Invalid metadata source');
    return shell.openExternal(`https://music.apple.com/us/${kind==='track'?'song':kind}/${id}`);
  });
  ipcMain.handle('ritvio:open-lyrics-source',(event,id)=>{
    if(!trusted(event)||!Number.isSafeInteger(id)||id<1)throw Error('Invalid lyrics source');
    return shell.openExternal(`https://lrclib.net/api/get/${id}`);
  });
  ipcMain.handle('ritvio:copy-track-link',(event,videoId)=>{
    if(!trusted(event)||typeof videoId!=='string'||!/^[A-Za-z0-9_-]{11}$/.test(videoId))throw Error('Invalid video');
    clipboard.writeText(`https://www.youtube.com/watch?v=${videoId}`);
  });
  ipcMain.handle('ritvio:export-playlist',async(event,id)=>{
    if(!trusted(event)||typeof id!=='string'||!/^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/.test(id))throw Error('Invalid playlist');
    const response=await api.inject({url:`/v1/me/playlists/${id}/export`,headers:{authorization:`Bearer ${runtime.config.token}`}});
    if(response.statusCode!==200)throw Error(nativeText('Impossibile esportare la playlist. Ricarica la libreria e riprova.'));
    const file=response.json();
    const suggested=backend.playlistFilename(file.playlist.name);
    let destination;
    if(process.env.RITVIO_TEST_HIDDEN==='true'&&process.env.RITVIO_TEST_FILE_DIR&&path.isAbsolute(process.env.RITVIO_TEST_FILE_DIR)){
      await fs.mkdir(process.env.RITVIO_TEST_FILE_DIR,{recursive:true});destination=path.join(process.env.RITVIO_TEST_FILE_DIR,suggested);
    }else{
      const selection=await dialog.showSaveDialog(window,{title:nativeText('Esporta playlist RITVIO'),defaultPath:path.join(app.getPath('documents'),suggested),filters:[{name:nativeText('Playlist RITVIO'),extensions:['json']}],properties:['showOverwriteConfirmation']});
      if(selection.canceled||!selection.filePath)return {saved:false};destination=selection.filePath;
    }
    const temporary=path.join(path.dirname(destination),`.ritvio-${randomUUID()}.tmp`);
    try{await fs.writeFile(temporary,JSON.stringify(file,null,2)+'\n',{encoding:'utf8',flag:'wx'});await fs.rename(temporary,destination);return {saved:true};}
    catch{throw Error(nativeText('Impossibile salvare il file. Scegli una cartella scrivibile.'));}
    finally{await fs.rm(temporary,{force:true}).catch(()=>{});}
  });
  ipcMain.handle('ritvio:read-player',event=>{if(!trusted(event))throw new Error('Untrusted renderer');return playerData;});
  let savingStory=false;
  ipcMain.handle('ritvio:export-story',async(event,value,title)=>{
    if(!trusted(event))throw Error('Untrusted renderer');
    if(savingStory)throw Error(nativeText('Un salvataggio è già in corso.'));
    savingStory=true;
    try{
      const bytes=validateStoryPng(value),suggested=storyFilename(title);let destination;
      if(process.env.RITVIO_TEST_HIDDEN==='true'&&process.env.RITVIO_TEST_FILE_DIR&&path.isAbsolute(process.env.RITVIO_TEST_FILE_DIR)){
        await fs.mkdir(process.env.RITVIO_TEST_FILE_DIR,{recursive:true});destination=path.join(process.env.RITVIO_TEST_FILE_DIR,suggested);
      }else{
        const selection=await dialog.showSaveDialog(window,{title:nativeText('Salva immagine'),defaultPath:path.join(app.getPath('pictures'),suggested),filters:[{name:nativeText('Immagine PNG'),extensions:['png']}],properties:['showOverwriteConfirmation']});
        if(selection.canceled||!selection.filePath)return {saved:false};destination=selection.filePath;
      }
      const temporary=path.join(path.dirname(destination),`.ritvio-${randomUUID()}.tmp`);
      try{await fs.writeFile(temporary,bytes,{flag:'wx'});await fs.rename(temporary,destination);return {saved:true};}
      catch{throw Error(nativeText('Impossibile salvare il PNG. Scegli una cartella scrivibile.'));}
      finally{await fs.rm(temporary,{force:true}).catch(()=>{});}
    }finally{savingStory=false;}
  });
  ipcMain.handle('ritvio:write-player',(event,value)=>{
    if(!trusted(event)||typeof value!=='string'||value.length>2000000)throw new Error('Invalid state');
    JSON.parse(value);playerData=value;
    if(!saveTimer)saveTimer=setTimeout(()=>{void flushPlayer().catch(()=>window?.webContents.send('ritvio:storage-error'));},750);
  });
  ipcMain.handle('ritvio:remove-player',event=>{if(!trusted(event))throw new Error('Untrusted renderer');playerData=null;return flushPlayer();});
  session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  session.defaultSession.setPermissionCheckHandler(()=>false);
  session.defaultSession.on('will-download',event=>event.preventDefault());
  window=new BrowserWindow({width:1440,height:940,minWidth:640,minHeight:600,backgroundColor:'#101512',title:'RITVIO',icon:path.join(root,'dist/client/app-icon.png'),show:process.env.RITVIO_SMOKE!=='true'&&process.env.RITVIO_TEST_HIDDEN!=='true',
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  window.setMenuBarVisibility(false);
  window.on('closed',()=>{if(mini&&!mini.isDestroyed())mini.destroy();});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',(event,url)=>{try {if(new URL(url).origin!==frontend)event.preventDefault();}catch{event.preventDefault();}});
  await window.loadURL(frontend);
  for(const [accelerator,action] of [['MediaPlayPause','toggle'],['MediaNextTrack','next'],['MediaPreviousTrack','previous']]) {
    globalShortcut.register(accelerator,()=>window?.webContents.send('ritvio:media-key',action));
  }
  if(process.env.RITVIO_SMOKE==='true') {
    const result=await window.webContents.executeJavaScript("({title:document.title,brand:document.body.innerText.includes('RITVIO'),nodeExposed:typeof require!=='undefined'})");
    console.log('DESKTOP_SMOKE',JSON.stringify(result));
    app.quit();
  }
}
if(primaryInstance)app.whenReady().then(start).catch(error=>{console.error(nativeText('Avvio RITVIO non riuscito:'),error.message);if(app.isPackaged&&process.env.RITVIO_TEST_HIDDEN!=='true')dialog.showErrorBox(nativeText('RITVIO: avvio non riuscito'),nativeText('Impossibile avviare il servizio locale. Controlla che il file sia stato estratto correttamente e che la cartella dati utente sia scrivibile.'));app.quit();process.exitCode=1;});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',event=>{
  if(quitting||!api)return;
  event.preventDefault();quitting=true;globalShortcut.unregisterAll();
  void Promise.allSettled([api.close(),flushPlayer()]).then(()=>app.quit());
});
