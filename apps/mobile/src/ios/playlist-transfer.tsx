import {useEffect,useRef,useState} from 'react';
import {Capacitor} from '@capacitor/core';
import {Download,FileJson,LoaderCircle,Share2} from 'lucide-react';
import type {MobilePlaylist} from '../../../../packages/domain/mobile';
import {Artwork,ScrollText,Sheet} from './components';
import {foundationBridge as bridge} from './native';
import {documentSelection,type DocumentPreview} from './document-model';
import {documentError,type DocumentCopy} from './document-copy';
import type {LibraryController} from './use-library';
export function ImportDocument({preview,library,t,onClose,onOpen,onPick}:{preview:DocumentPreview;library:LibraryController;t:DocumentCopy;onClose:()=>void;onOpen:(id:string)=>void;onPick:()=>void}){
 const [name,setName]=useState(preview.name),[skip,setSkip]=useState(true),[selected,setSelected]=useState(()=>new Set(preview.entries.map(entry=>entry.number))),[shown,setShown]=useState(50),[busy,setBusy]=useState(false),[error,setError]=useState(''),[outcome,setOutcome]=useState<{id:string;added:number;skipped:number}|null>(null);
 const alive=useRef(true),locked=useRef(false),summary=documentSelection(preview,selected,skip),full=(library.value?.playlists.length??0)>=100;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;queueMicrotask(()=>{if(!alive.current)void bridge.cancelPlaylistImport({token:preview.token}).catch(()=>{});});};},[preview.token]);
 async function commit(){if(locked.current||!summary.tracks.length||summary.overLimit||!name.trim()||full)return;locked.current=true;setBusy(true);setError('');try{const value=await bridge.commitPlaylistImport({token:preview.token,name:name.trim(),numbers:[...selected],skipDuplicates:skip});library.receive(value.library);if(alive.current)setOutcome({id:value.playlistId,added:value.added,skipped:value.skipped});}catch(failure){if(alive.current)setError(documentError(failure,t));}finally{locked.current=false;if(alive.current)setBusy(false);}}
 return <Sheet title={outcome?t.complete:t.importTitle} closeLabel={outcome?t.done:t.cancel} closeText onClose={()=>{if(!locked.current)onClose();}} className="ios-document">
  <div className="ios-document-scroll">
   <div className="ios-document-identity"><Artwork src={preview.cover??preview.entries[0]?.track.thumbnail}/><div className="ios-identity"><strong><ScrollText>{preview.name}</ScrollText></strong><span>{t.file}</span></div></div>
   {outcome?<><h3>{t.added(outcome.added)}</h3>{outcome.skipped>0&&<p>{t.skipped(outcome.skipped)}</p>}<button className="ios-primary" onClick={()=>onOpen(outcome.id)}>{t.open}</button></>:<>
    <label className="ios-document-field">{t.newName}<input aria-label={t.newName} value={name} onChange={event=>setName(event.target.value)} maxLength={100} disabled={busy} autoComplete="off"/></label><p className="ios-document-hint">{t.newOnly}</p>
    <label className="ios-document-toggle"><span>{t.skip}</span><input type="checkbox" role="switch" className="ios-switch" aria-label={t.skip} checked={skip} disabled={busy} onChange={event=>setSkip(event.target.checked)}/></label>
    <div className="ios-document-selection"><span>{t.selected(selected.size)}</span><button className="ios-text" disabled={busy} onClick={()=>setSelected(new Set(preview.entries.map(entry=>entry.number)))}>{t.all}</button><button className="ios-text" disabled={busy||!selected.size} onClick={()=>setSelected(new Set())}>{t.none}</button></div>
    {summary.overLimit&&<div className="ios-document-warning" role="alert"><p>{t.limit}</p><button className="ios-text" onClick={()=>setSelected(new Set(preview.entries.slice(0,500).map(entry=>entry.number)))}>{t.first}</button></div>}
    {full&&<p className="ios-document-warning" role="alert">{t.libraryFull}</p>}{preview.adjusted>0&&<p className="ios-document-hint">{t.adjusted}</p>}
    <div className="ios-document-entries">{preview.entries.slice(0,shown).map(entry=><label key={entry.number} className="ios-document-entry"><input type="checkbox" aria-label={entry.track.title} checked={selected.has(entry.number)} disabled={busy} onChange={()=>setSelected(previous=>{const next=new Set(previous);if(next.has(entry.number))next.delete(entry.number);else next.add(entry.number);return next;})}/><Artwork src={entry.track.thumbnail}/><span className="ios-identity"><strong><ScrollText>{entry.track.title}</ScrollText></strong><small><ScrollText>{entry.track.artist}</ScrollText></small></span></label>)}</div>
    {shown<preview.entries.length&&<button className="ios-text" disabled={busy} onClick={()=>setShown(value=>value+50)}>{t.more} · {shown}/{preview.entries.length}</button>}
    {!preview.entries.length&&<p>{t.empty}</p>}{summary.skipped>0&&<p className="ios-document-hint">{t.duplicates(summary.skipped)}</p>}

   </>}
   <p className="ios-document-hint">{t.disclaimer}</p>{!outcome&&<button className="ios-text" disabled={busy} onClick={onPick}>{t.pick}</button>}
  </div>
  {!outcome&&<footer className="ios-document-footer">{error&&<p className="ios-document-warning" role="alert">{error}</p>}<button className="ios-primary" disabled={busy||full||!name.trim()||summary.overLimit||!summary.tracks.length} onClick={()=>void commit()}>{busy?<><LoaderCircle className="ios-spinner"/>{t.saving}</>:<><Download/>{t.importSongs(summary.tracks.length)}</>}</button></footer>}
 </Sheet>;
}
export function ExportDocument({playlist,t,onClose}:{playlist:MobilePlaylist;t:DocumentCopy;onClose:()=>void}){
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState(''),locked=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 async function send(save:boolean){if(locked.current)return;locked.current=true;setBusy(true);setNotice('');setError('');try{const result=await bridge.exportPlaylistDocument({id:playlist.id,revision:playlist.revision!,save});if(alive.current)setNotice((result.status==='saved'?t.saved:result.status==='shared'?t.shared:t.cancelled)+(result.adjusted?` ${t.adjusted}`:''));}catch(failure){if(alive.current)setError(documentError(failure,t));}finally{locked.current=false;if(alive.current)setBusy(false);}}
 const cover=playlist.cover?.startsWith('file://')?Capacitor.convertFileSrc(playlist.cover):playlist.cover??playlist.items[0]?.thumbnail;
 return <Sheet title={t.exportTitle} closeLabel={t.done} closeText onClose={()=>{if(!locked.current)onClose();}} className="ios-document ios-document-export"><div className="ios-document-scroll">
  <div className="ios-document-export-identity"><Artwork src={cover} large eager/><h2>{playlist.name}</h2><p>{t.songs(playlist.items.length)}</p></div><h3>{t.exportIntro}</h3><p>{t.exportBody}</p><p className="ios-document-format"><FileJson aria-hidden="true"/>{t.format}</p>
  <p className="ios-document-hint">{t.compatible}</p>
 </div><footer className="ios-document-footer"><button className="ios-primary" disabled={busy} onClick={()=>void send(true)}>{busy?<LoaderCircle className="ios-spinner"/>:<Download/>}{t.saveFile}</button><button className="ios-document-secondary" disabled={busy} onClick={()=>void send(false)}><Share2/>{t.shareFile}</button>{busy&&<p role="status">{t.exporting}</p>}{notice&&<p role="status">{notice}</p>}{error&&<p className="ios-document-warning" role="alert">{error}</p>}</footer></Sheet>;
}
