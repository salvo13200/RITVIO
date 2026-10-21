const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('ritvio',{
  updatesRead:()=>ipcRenderer.invoke('ritvio:updates-read'),
  updatesWrite:value=>ipcRenderer.invoke('ritvio:updates-write',value),
  updatesFetch:etag=>ipcRenderer.invoke('ritvio:updates-fetch',etag),
  updatesOpen:url=>ipcRenderer.invoke('ritvio:updates-open',url),
  readLanguage:()=>ipcRenderer.invoke('ritvio:language-read'),
  writeLanguage:preference=>ipcRenderer.invoke('ritvio:language-write',preference),
  onLanguage:callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('ritvio:language-state',listener);return()=>ipcRenderer.removeListener('ritvio:language-state',listener);},
  openMini:()=>ipcRenderer.invoke('ritvio:mini-open'),
  publishMini:value=>ipcRenderer.invoke('ritvio:mini-state',value),
  readMini:()=>ipcRenderer.invoke('ritvio:mini-current'),
  miniCommand:value=>ipcRenderer.invoke('ritvio:mini-command',value),
  onMiniState:callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('ritvio:mini-snapshot',listener);return()=>ipcRenderer.removeListener('ritvio:mini-snapshot',listener);},
  onMiniCommand:callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('ritvio:mini-action',listener);return()=>ipcRenderer.removeListener('ritvio:mini-action',listener);},
  configuration:()=>ipcRenderer.invoke('ritvio:configuration'),
  openYouTube:videoId=>ipcRenderer.invoke('ritvio:open-youtube',videoId),
  openMetadataSource:(kind,id)=>ipcRenderer.invoke('ritvio:open-metadata-source',kind,id),
  openLyricsSource:id=>ipcRenderer.invoke('ritvio:open-lyrics-source',id),
  copyTrackLink:(track,withText=false)=>ipcRenderer.invoke('ritvio:copy-track-link',track,withText),
  supportOpen:url=>ipcRenderer.invoke('ritvio:support-open',url),
  supportCopy:text=>ipcRenderer.invoke('ritvio:support-copy',text),
  exportPlaylist:id=>ipcRenderer.invoke('ritvio:export-playlist',id),
  exportStory:(bytes,title)=>ipcRenderer.invoke('ritvio:export-story',bytes,title),
  readPlayer:()=>ipcRenderer.invoke('ritvio:read-player'),
  writePlayer:value=>ipcRenderer.invoke('ritvio:write-player',value),
  removePlayer:()=>ipcRenderer.invoke('ritvio:remove-player'),
  onMediaKey:callback=>{
    const handler=(_event,key)=>{if(['toggle','next','previous'].includes(key))callback(key);};
    ipcRenderer.on('ritvio:media-key',handler);
    return()=>ipcRenderer.removeListener('ritvio:media-key',handler);
  },
});
